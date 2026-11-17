/**
 * POST /api/meal-ai — turns "5 eggs, a cup of rice, some okra" into
 * foods from the app's own food list.
 *
 * Runs on Vercel as a serverless function, so the API key never
 * reaches the browser. Locally, tools/serve.js routes to it too.
 *
 * The model only PICKS foods and amounts. It never returns nutrition
 * values: the app works those out from its own USDA-based table, so
 * the numbers stamped on a photo can't be made up.
 *
 * The knowledge base is the food list the app sends with each request
 * (the built-in foods plus the ones this user saved from USDA), the
 * same idea as the portfolio chatbot's PORTFOLIO_CONTEXT.
 *
 * Speaks the OpenAI-compatible chat completions format, so switching
 * providers is three environment variables. See .env.example.
 */

const MAX_TEXT = 500;           // characters of meal description
const MAX_FOODS = 400;          // entries in the food list
const MAX_ITEMS = 25;           // foods in one meal
const MAX_GRAMS = 5000;         // sanity ceiling for one portion

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

const MESSAGES = {
  notConfigured: 'The meal AI is not set up yet (no AI_API_KEY).',
  tooMany: 'Too many requests. Wait a minute and try again.',
  busy: 'The meal AI is busy right now.',
  daily: 'The meal AI has used up its requests for today.',
  failed: 'The meal AI did not answer.',
  bad: 'Nothing to analyze.'
};

const INSTRUCTIONS = `
You read a short description of a meal someone just ate and list the foods in it,
using ONLY the person's own food list below. The app calculates calories and macros
itself from that list, so you never give nutrition numbers.

Rules:
- "food" must be an id from the FOOD LIST, copied exactly. Match by meaning, not just
  spelling: typos, plurals, and Filipino words count (itlog = egg, kanin = cooked rice,
  manok = chicken, saging = banana).
- If something is not in the list, still include it with "food": null and its name as
  the person wrote it. Never swap in a different food that merely looks similar.
- A dish (for example chicken adobo) is split into its parts: parts that are in the list
  get their id, parts that are not get null.
- If the text says raw or cooked, pick the matching entry. Otherwise pick the entry whose
  name or aliases match what was written.
- "unit" is "g" or "pcs". Use "pcs" only for foods that list a piece weight, and only when
  the person counted pieces. Convert cups, spoons, handfuls, bowls and servings to grams
  using typical weights.
- "guessed" is true whenever you had to estimate the amount (no number given, or a cup,
  spoon, bowl, "some", "a little"), false when the person gave grams or a count.
- If no amount is given, use one typical serving and set "guessed": true.
- If the text is not about food, return an empty list.

Reply with JSON only, no prose, in exactly this shape:
{"items":[{"food":"egg","name":"Egg, boiled","amount":5,"unit":"pcs","guessed":false}]}
`.trim();

/* In-memory rate limit: a speed bump, not a vault. Serverless
   instances each keep their own counter and reset on cold start. */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    if (hits.size > 500) for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

const clean = (s, max) => String(s ?? '').replace(/[\r\n|]+/g, ' ').trim().slice(0, max);

/** The request's food list, trimmed to what the model needs: id, name, aliases, piece weight. */
function readFoods(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const f of raw.slice(0, MAX_FOODS)) {
    const id = clean(f?.id, 80);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const piece = Number(f.piece);
    out.push({
      id,
      name: clean(f.name, 80) || id,
      aliases: Array.isArray(f.aliases) ? f.aliases.slice(0, 8).map(a => clean(a, 40)).filter(Boolean) : [],
      piece: piece > 0 && piece < 2000 ? piece : null
    });
  }
  return out;
}

const foodLine = f => `${f.id} | ${f.name} | ${f.aliases.join(', ') || '-'} | ${f.piece ? `${f.piece} g per piece` : 'grams only'}`;

/** Pull the JSON object out of a reply, tolerating ```json fences or stray prose. */
function parseReply(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

/** Keep only well-formed items, and only ids that are really in the list. */
function validate(items, foods) {
  const byId = new Map(foods.map(f => [f.id, f]));
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_ITEMS).flatMap(it => {
    const food = typeof it?.food === 'string' ? byId.get(it.food) : null;
    const name = clean(it?.name, 80) || food?.name;
    if (!name) return [];
    let amount = Number(it?.amount);
    let unit = it?.unit === 'pcs' ? 'pcs' : 'g';
    let guessed = it?.guessed === true;
    // pieces only make sense for foods with a piece weight
    if (unit === 'pcs' && food && !food.piece) { unit = 'g'; amount = 100; guessed = true; }
    if (!(amount > 0)) { amount = unit === 'pcs' ? 1 : 100; guessed = true; }
    amount = Math.min(amount, unit === 'pcs' ? 50 : MAX_GRAMS);
    amount = Math.round(amount * 10) / 10;
    return [{ food: food ? food.id : null, name: food ? food.name : name, amount, unit, guessed }];
  });
}

function providers() {
  const env = process.env;
  const list = [];
  if (env.AI_API_KEY) list.push({ label: 'main', key: env.AI_API_KEY, baseUrl: env.AI_BASE_URL, model: env.AI_MODEL });
  if (env.AI_FALLBACK_API_KEY) list.push({ label: 'fallback', key: env.AI_FALLBACK_API_KEY, baseUrl: env.AI_FALLBACK_BASE_URL, model: env.AI_FALLBACK_MODEL });
  return list.filter(p => p.baseUrl && p.model);
}

async function ask(provider, system, text, jsonMode) {
  const res = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: text }],
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      temperature: 0.1,
      // a ceiling, not a length: thinking models spend tokens before they answer
      max_tokens: 1500
    }),
    signal: AbortSignal.timeout(25_000)
  });
  const payload = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, payload };
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;         // Vercel parses JSON for us
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 200_000) return null;
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'Use POST.' }); }

  const list = providers();
  if (!list.length) return send(res, 503, { error: MESSAGES.notConfigured });

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) return send(res, 429, { error: MESSAGES.tooMany });

  const body = await readBody(req);
  const text = String(body?.text ?? '').trim().slice(0, MAX_TEXT);
  const foods = readFoods(body?.foods);
  if (!text || !foods.length) return send(res, 400, { error: MESSAGES.bad });

  const system = `${INSTRUCTIONS}\n\nFOOD LIST (id | name | aliases | piece weight):\n${foods.map(foodLine).join('\n')}`;

  let status = 0, payload = null;
  for (const provider of list) {
    // JSON mode first; some models reject it, so retry once without
    for (const jsonMode of [true, false]) {
      try {
        ({ status, payload } = await ask(provider, system, text, jsonMode));
      } catch (err) {
        console.error(`[api/meal-ai] ${provider.label} unreachable:`, err?.message || err);
        status = 0; payload = null;
        break;
      }
      if (status >= 200 && status < 300) {
        const parsed = parseReply(payload?.choices?.[0]?.message?.content);
        if (parsed) {
          const u = payload?.usage;
          if (u) console.log(`[api/meal-ai] ${provider.label}:${provider.model} · ${u.prompt_tokens} + ${u.completion_tokens} tokens`);
          return send(res, 200, { items: validate(parsed.items, foods), servedBy: `${provider.label}:${provider.model}` });
        }
        console.error(`[api/meal-ai] ${provider.label} gave no JSON:`, JSON.stringify(payload).slice(0, 500));
        status = 502;
        if (jsonMode) continue;      // try the plain reply once
        break;
      }
      console.error(`[api/meal-ai] ${provider.label} error ${status}:`, JSON.stringify(payload).slice(0, 800));
      if (status === 400 && jsonMode) continue;   // maybe it rejected response_format
      break;
    }
  }

  if (status === 429) {
    const daily = /per\s*-?\s*day|daily|requests_per_day/i.test(JSON.stringify(payload ?? ''));
    return send(res, 429, { error: daily ? MESSAGES.daily : MESSAGES.busy });
  }
  return send(res, 503, { error: MESSAGES.failed });
};

// exported for tests and the local dev server
module.exports.validate = validate;
module.exports.parseReply = parseReply;
