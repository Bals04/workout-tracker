/* ═══════════════════════════════════════════════════════════
   Nutrition — food values, macro maths, USDA lookup.

   Every food is stored per 100 g (kcal, protein, carbs, fat),
   optionally with the weight of one piece, so "5 eggs" and
   "160 g chicken" go through the same sum.

   A small built-in table covers common foods offline. Anything
   else comes from USDA FoodData Central (free, CORS-enabled) and
   is saved on the device, so each food is looked up once.
   ═══════════════════════════════════════════════════════════ */

const Nutrition = (() => {
  /* Values per 100 g, from USDA FoodData Central (SR Legacy /
     Foundation). `piece` is grams per piece. Where raw and cooked
     differ a lot the name says which one it is. */
  const f = (id, name, kcal, p, c, fat, extra = {}) => ({ id, name, per100: { kcal, p, c, f: fat }, source: 'builtin', ...extra });
  const BUILTIN = [
    f('egg',            'Egg, boiled',                 155, 12.6, 1.1, 10.6, { piece: 50, aliases: ['boiled egg', 'egg'] }),
    f('egg-white',      'Egg white',                    52, 10.9, 0.7,  0.2, { piece: 33, aliases: ['egg white'] }),
    f('chicken-raw',    'Chicken breast (raw)',        120, 22.5, 0,    2.6, { aliases: ['chicken breast', 'chicken'] }),
    f('chicken-cooked', 'Chicken breast (cooked)',     165, 31,   0,    3.6, { aliases: ['cooked chicken', 'grilled chicken', 'roasted chicken'] }),
    f('rice-cooked',    'White rice (cooked)',         130, 2.7, 28.2,  0.3, { aliases: ['rice', 'white rice', 'cooked rice'] }),
    f('rice-raw',       'White rice (uncooked)',       365, 7.1, 80,    0.7, { aliases: ['uncooked rice', 'raw rice', 'dry rice'] }),
    f('brown-rice',     'Brown rice (cooked)',         123, 2.7, 25.6,  1.0, { aliases: ['brown rice'] }),
    f('okra',           'Okra',                         33, 1.9,  7.5,  0.2, { piece: 12, aliases: ['okra', 'oakra'] }),
    f('banana',         'Banana',                       89, 1.1, 22.8,  0.3, { piece: 118, aliases: ['banana', 'bananas'] }),
    f('apple',          'Apple',                        52, 0.3, 13.8,  0.2, { piece: 182, aliases: ['apple'] }),
    f('oats',           'Rolled oats (dry)',           379, 13.2, 67.7, 6.5, { aliases: ['oats', 'oatmeal'] }),
    f('sweet-potato',   'Sweet potato (baked)',         90, 2.0, 20.7,  0.2, { aliases: ['sweet potato'] }),
    f('potato',         'Potato (boiled)',              87, 1.9, 20.1,  0.1, { aliases: ['potato'] }),
    f('broccoli',       'Broccoli',                     34, 2.8,  6.6,  0.4, { aliases: ['broccoli'] }),
    f('salmon',         'Salmon (raw)',                208, 20.4, 0,   13.4, { aliases: ['salmon'] }),
    f('tuna',           'Tuna, canned in water',       116, 25.5, 0,    0.8, { aliases: ['tuna'] }),
    f('beef-lean',      'Lean ground beef 90% (raw)',  176, 20,   0,   10,   { aliases: ['ground beef', 'beef'] }),
    f('tofu',           'Tofu, firm',                  144, 17.3, 2.8,  8.7, { aliases: ['tofu'] }),
    f('greek-yogurt',   'Greek yogurt, plain nonfat',   59, 10.2, 3.6,  0.4, { aliases: ['greek yogurt', 'yogurt'] }),
    f('milk',           'Milk, whole',                  61, 3.2,  4.8,  3.3, { aliases: ['milk'] }),
    f('whey',           'Whey protein (scoop)',        400, 80,   8,    6,   { piece: 30, aliases: ['whey', 'protein powder', 'scoop'] }),
    f('bread',          'White bread (slice)',         266, 7.6, 50.6,  3.3, { piece: 28, aliases: ['bread', 'toast'] }),
    f('peanut-butter',  'Peanut butter',               588, 25,  20,   50,   { piece: 16, aliases: ['peanut butter'] }),
    f('avocado',        'Avocado',                     160, 2.0,  8.5, 14.7, { piece: 150, aliases: ['avocado'] }),
    f('olive-oil',      'Olive oil (tbsp)',            884, 0,    0,  100,   { piece: 13.5, aliases: ['olive oil', 'oil'] }),
  ];
  const byId = new Map(BUILTIN.map(x => [x.id, x]));

  /** A food by id: built-in, else one saved on this device. */
  const get = id => byId.get(id) || Store.state.foods?.[id] || null;
  const all = () => [...BUILTIN, ...Object.values(Store.state.foods || {})];

  /* ── matching typed text to a food ───────────────────────── */
  const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

  /** Best food for a free-text name ("boiled eggs" → egg), or null. */
  function match(name) {
    const n = ` ${norm(name)} `;
    let best = null, len = 0;
    for (const food of all()) {
      for (const alias of [food.name, ...(food.aliases || [])]) {
        const a = norm(alias);
        // plural-tolerant whole-word match; the longest alias wins
        if (a.length > len && (n.includes(` ${a} `) || n.includes(` ${a}s `))) { best = food; len = a.length; }
      }
    }
    return best;
  }

  /* ── typo-tolerant search ─────────────────────────────────
     "chike", "chiken" and "chikcen" all find chicken: each typed
     word may be a few edits away from the start of a food word. */

  /** Edit distance, counting a swap of two neighbours as one edit. */
  function distance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  /** Edits allowed for a typed word: none for short words, more for long ones. */
  const tolerance = w => w.length <= 3 ? 0 : w.length <= 5 ? 1 : 2;

  /** How well a typed word matches a food word: 0 = no match, higher is better. */
  function wordScore(w, t) {
    if (t === w) return 4;
    if (t.startsWith(w)) return 3;
    if (t.includes(w)) return 2;
    const tol = tolerance(w);
    if (!tol) return 0;
    // compare against the start of the food word, a little shorter or longer than what was typed
    for (let len = Math.max(1, w.length - 1); len <= Math.min(t.length, w.length + 1); len++) {
      if (distance(w, t.slice(0, len)) <= tol) return 1;
    }
    return distance(w, t) <= tol ? 1 : 0;
  }

  const wordsOf = food => norm([food.name, ...(food.aliases || [])].join(' ')).split(' ');

  /** Local search over built-in and saved foods, best matches first. */
  function search(q) {
    const words = norm(q).split(' ').filter(Boolean);
    if (!words.length) return all();
    return all()
      .map(food => {
        const hay = wordsOf(food);
        let score = 0;
        for (const w of words) {
          const best = Math.max(...hay.map(t => wordScore(w, t)));
          if (!best) return null;      // every typed word has to match something
          score += best;
        }
        return { food, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .map(r => r.food);
  }

  /* Words for spelling correction before an online search: the food
     table plus common food words that are not in it. */
  const COMMON = ('chicken beef pork turkey lamb salmon tuna shrimp cod tilapia sardines egg eggs rice oats oatmeal bread pasta '
    + 'noodles potato potatoes banana apple orange mango pineapple grapes strawberries blueberries watermelon papaya broccoli '
    + 'spinach carrot carrots tomato cucumber lettuce cabbage onion garlic okra eggplant avocado milk yogurt cheese butter '
    + 'peanut peanuts almonds cashews walnuts tofu beans lentils chickpeas quinoa corn sweet breast thigh drumstick wing fillet '
    + 'steak ground boiled fried grilled baked steamed roasted raw cooked white brown whole skinless boneless protein whey '
    + 'chop chops chocolate honey sugar oil olive coconut cereal granola tortilla bagel sausage bacon ham').split(' ');

  /** "chike breast" → "chicken breast"; null when nothing needed fixing. */
  function correct(q) {
    const vocab = new Set([...COMMON, ...all().flatMap(wordsOf)]);
    const words = norm(q).split(' ').filter(Boolean);
    let changed = false;
    const fixed = words.map(w => {
      if (vocab.has(w) || !tolerance(w)) return w;
      // a typed word may be a misspelt start of a longer word ("chike" → "chicken");
      // whole-word matches rank a little ahead of start-of-word ones
      let best = null, bestRank = Infinity;
      for (const v of vocab) {
        const whole = distance(w, v);
        let start = Infinity;
        // only for longer words: a short one like "chop" is too easily the start of something else
        if (w.length >= 5) for (const len of [w.length, w.length + 1]) if (v.length > len) start = Math.min(start, distance(w, v.slice(0, len)));
        const d = Math.min(whole, start);
        if (d > tolerance(w)) continue;
        const rank = d + (whole > d ? .25 : 0);
        if (rank < bestRank || (rank === bestRank && v.length < best.length)) { best = v; bestRank = rank; }
      }
      if (best) { changed = true; return best; }
      return w;
    });
    return changed ? fixed.join(' ') : null;
  }

  /**
   * Parse one typed line — "160g chicken breast", "5 boiled eggs",
   * "2 okra/banana" — into options [{ food, name, amount, unit }].
   * Slash-separated names become alternatives with the same amount.
   */
  function parseLine(line) {
    const m = line.trim().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|grams?|gr|pcs?|pieces?|x)?\.?\s+(?:of\s+)?(.+)$/i);
    const amount = m ? Number(m[1].replace(',', '.')) : 1;
    const unitWord = m?.[2]?.toLowerCase();
    const names = (m ? m[3] : line).split('/').map(s => s.trim()).filter(Boolean);
    return names.map(name => {
      const food = match(name);
      let unit = 'pcs', qty = amount;
      if (unitWord === 'kg') { unit = 'g'; qty = amount * 1000; }
      else if (unitWord && unitWord.startsWith('g')) unit = 'g';
      else if (!unitWord && !food?.piece) unit = 'g';        // "160 chicken breast" → grams
      return { food: food?.id || null, name: food ? food.name : name, amount: qty, unit };
    });
  }

  /* ── maths ───────────────────────────────────────────────── */
  const ZERO = { kcal: 0, p: 0, c: 0, f: 0 };

  /** Macros for one portion, or null when the food has no data. */
  function macros(opt) {
    const food = opt.food && get(opt.food);
    if (!food?.per100) return null;
    const grams = opt.unit === 'pcs' ? opt.amount * (food.piece || 100) : opt.amount;
    const k = grams / 100, v = food.per100;
    return { kcal: v.kcal * k, p: v.p * k, c: v.c * k, f: v.f * k };
  }

  const add = (a, b) => b ? { kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f } : a;
  const sum = list => list.reduce(add, { ...ZERO });

  /** "160 g" / "5 pcs" / "2 eggs"-style amount label. */
  function amountLabel(opt) {
    const n = Math.round(opt.amount * 10) / 10;
    return opt.unit === 'g' ? `${n} g` : `${n} ${n === 1 ? 'pc' : 'pcs'}`;
  }

  /* ── USDA FoodData Central ───────────────────────────────── */
  const FDC = 'https://api.nal.usda.gov/fdc/v1/foods/search';
  const DATA_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];
  const NUTRIENT = { p: 1003, f: 1004, c: 1005 };
  const ENERGY = [1008, 2048, 2047];     // kcal; Foundation foods only carry the Atwater ones

  class LookupError extends Error {
    constructor(message, kind) { super(message); this.kind = kind; }
  }

  /** Search USDA. Resolves to [{ fdcId, name, kind, per100 }]. */
  async function usdaSearch(query, key) {
    // Built by hand: the API answers 400 when the commas in dataType are
    // percent-encoded, which URLSearchParams always does.
    const enc = encodeURIComponent;
    const url = `${FDC}?api_key=${enc(key || 'DEMO_KEY')}&query=${enc(query)}&pageSize=25`
      + `&dataType=${DATA_TYPES.map(enc).join(',')}`;

    // one quiet retry: the service sometimes fails a first, cold request
    let res;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await fetch(url);
      } catch {
        if (attempt) throw new LookupError('You appear to be offline.', 'offline');
        res = null;
      }
      if (res && res.status < 500) break;
      if (!attempt) await new Promise(r => setTimeout(r, 700));
    }
    if (res.status === 429) throw new LookupError('Search limit reached for now.', 'limit');
    if (res.status === 401 || res.status === 403) throw new LookupError('The food database key was not accepted.', 'key');
    if (!res.ok) throw new LookupError('The food database did not answer. Try again.', 'server');
    const data = await res.json();
    return (data.foods || []).map(item => {
      const val = id => item.foodNutrients?.find(n => n.nutrientId === id)?.value;
      const num = id => Math.max(0, Number(val(id)) || 0);    // USDA reports some carbs as tiny negatives
      const p = num(NUTRIENT.p), c = num(NUTRIENT.c), fat = num(NUTRIENT.f);
      const kcalRaw = ENERGY.map(val).find(v => v != null);
      return {
        fdcId: item.fdcId,
        name: item.description,
        kind: item.dataType,
        per100: { kcal: kcalRaw != null ? Math.max(0, Number(kcalRaw)) : p * 4 + c * 4 + fat * 9, p, c, f: fat }
      };
    });
  }

  return { BUILTIN, get, all, match, search, correct, parseLine, macros, sum, amountLabel, usdaSearch, ZERO };
})();
