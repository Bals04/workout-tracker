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

  /** Local search over built-in and saved foods. */
  function search(q) {
    const n = norm(q);
    if (!n) return all();
    const words = n.split(' ');
    return all().filter(food => {
      const hay = norm([food.name, ...(food.aliases || [])].join(' '));
      return words.every(w => hay.includes(w));
    });
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
  const NUTRIENT = { p: 1003, f: 1004, c: 1005 };
  const ENERGY = [1008, 2048, 2047];     // kcal; Foundation foods only carry the Atwater ones

  class LookupError extends Error {
    constructor(message, kind) { super(message); this.kind = kind; }
  }

  /** Search USDA. Resolves to [{ fdcId, name, kind, per100 }]. */
  async function usdaSearch(query, key) {
    const params = new URLSearchParams({
      api_key: key || 'DEMO_KEY', query, pageSize: '25',
      dataType: 'Foundation,SR Legacy,Survey (FNDDS)'
    });
    let res;
    try {
      res = await fetch(`${FDC}?${params}`);
    } catch {
      throw new LookupError('You appear to be offline.', 'offline');
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

  return { BUILTIN, get, all, match, search, parseLine, macros, sum, amountLabel, usdaSearch, ZERO };
})();
