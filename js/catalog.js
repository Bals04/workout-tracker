/* ═══════════════════════════════════════════════════════════
   Catalog — the exercise library.

   Data comes from @bryllim/workout-guide (302 exercises,
   3 white line-art frames each). data/exercises.json is a
   slimmed manifest; the frames live in assets/<slug>/.
   ═══════════════════════════════════════════════════════════ */

const Catalog = (() => {
  /** @type {Array<{s:string,n:string,t:string,q:string,p:string,m:string[],st:boolean,f:number}>} */
  let all = [];
  let bySlug = new Map();
  let taxonomy = { muscles: [], equipment: [] };
  let ready = false;

  /* ── Metric schemas per exercise type ──────────────────────
     The library types each exercise, so the plan editor can
     ask for the numbers that actually apply: a plank wants
     seconds, a bench press wants reps and weight.           */
  const TYPES = {
    weight_reps: {
      label: 'Weight & reps',
      metrics: ['sets', 'reps', 'weight'],
      defaults: { sets: 3, reps: 10, weight: 20, restSec: 90 }
    },
    bodyweight_reps: {
      label: 'Bodyweight reps',
      metrics: ['sets', 'reps'],
      defaults: { sets: 3, reps: 12, restSec: 60 }
    },
    assisted_bodyweight: {
      label: 'Assisted reps',
      metrics: ['sets', 'reps', 'assist'],
      defaults: { sets: 3, reps: 8, assist: 10, restSec: 90 }
    },
    duration: {
      label: 'Timed hold',
      metrics: ['sets', 'seconds'],
      defaults: { sets: 3, seconds: 45, restSec: 45 }
    },
    distance_duration: {
      label: 'Distance & time',
      metrics: ['distance', 'seconds'],
      defaults: { sets: 1, distance: 2000, seconds: 600, restSec: 0 }
    }
  };

  const METRICS = {
    sets:     { label: 'Sets',  min: 1,  max: 20,   step: 1,  unit: '' },
    reps:     { label: 'Reps',  min: 1,  max: 100,  step: 1,  unit: '' },
    weight:   { label: 'Kg',    min: 0,  max: 500,  step: 2.5, unit: 'kg' },
    assist:   { label: 'Assist', min: 0, max: 200,  step: 2.5, unit: 'kg' },
    seconds:  { label: 'Secs',  min: 5,  max: 3600, step: 5,  unit: 's' },
    distance: { label: 'Metres', min: 50, max: 42200, step: 50, unit: 'm' },
    restSec:  { label: 'Rest',  min: 0,  max: 600,  step: 15, unit: 's' }
  };

  async function load() {
    if (ready) return;
    const [ex, tax] = await Promise.all([
      fetch('data/exercises.json').then(r => r.json()),
      fetch('data/taxonomy.json').then(r => r.json()).catch(() => null)
    ]);
    all = ex;
    bySlug = new Map(all.map(e => [e.s, e]));
    taxonomy = tax || {
      muscles: [...new Set(all.map(e => e.p))].sort(),
      equipment: [...new Set(all.map(e => e.q))].sort()
    };
    ready = true;
  }

  const get = slug => bySlug.get(slug) || null;

  /** Frame image path. index is 1-based (the library ships 3). */
  const frame = (slug, index = 1) => `assets/${slug}/frame-${index}.png`;

  const frameCount = slug => (get(slug)?.f ?? 3);

  function search(query, { muscle = null, equipment = null, limit = 60 } = {}) {
    const q = String(query || '').trim().toLowerCase();
    const words = q ? q.split(/\s+/) : [];
    const out = [];

    for (const e of all) {
      if (muscle && e.p !== muscle) continue;
      if (equipment && e.q !== equipment) continue;

      let score = 0;
      if (words.length) {
        const hay = `${e.n} ${e.p} ${e.q} ${e.m.join(' ')}`.toLowerCase();
        const name = e.n.toLowerCase();
        // every word must appear somewhere
        if (!words.every(w => hay.includes(w))) continue;
        if (name === q) score += 100;
        else if (name.startsWith(q)) score += 60;
        else if (name.includes(q)) score += 30;
        if (words.every(w => name.includes(w))) score += 12;
      }
      out.push({ e, score });
    }

    out.sort((a, b) => b.score - a.score || a.e.n.localeCompare(b.e.n));
    return out.slice(0, limit).map(r => r.e);
  }

  /** Human summary of a planned exercise, e.g. "3 × 10 · 40 kg". */
  function summarise(item) {
    const ex = get(item.slug);
    const type = TYPES[ex?.t] || TYPES.bodyweight_reps;
    const parts = [];

    if (type.metrics.includes('reps')) {
      parts.push(`${item.sets} × ${item.reps}`);
    } else if (type.metrics.includes('seconds') && type.metrics.includes('sets')) {
      parts.push(`${item.sets} × ${fmtDuration(item.seconds)}`);
    }
    if (type.metrics.includes('distance')) parts.push(fmtDistance(item.distance));
    if (type.metrics.includes('seconds') && !type.metrics.includes('sets')) {
      parts.push(fmtDuration(item.seconds));
    }
    if (type.metrics.includes('weight') && item.weight > 0) parts.push(`${trimNum(item.weight)} kg`);
    if (type.metrics.includes('assist') && item.assist > 0) parts.push(`−${trimNum(item.assist)} kg assist`);

    return parts.join(' · ') || '—';
  }

  /** Short label for one set chip, e.g. "10" or "45s". */
  function setLabel(item) {
    const ex = get(item.slug);
    const type = TYPES[ex?.t] || TYPES.bodyweight_reps;
    if (type.metrics.includes('reps')) return String(item.reps);
    if (type.metrics.includes('seconds')) return fmtDuration(item.seconds);
    if (type.metrics.includes('distance')) return fmtDistance(item.distance);
    return '1';
  }

  /* ── formatting helpers ──────────────────────────────────── */
  const trimNum = n => {
    const v = Number(n) || 0;
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
  };

  function fmtDuration(s) {
    const sec = Math.max(0, Math.round(Number(s) || 0));
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60), r = sec % 60;
    return r ? `${m}:${String(r).padStart(2, '0')}` : `${m}m`;
  }

  function fmtDistance(m) {
    const v = Math.max(0, Number(m) || 0);
    return v >= 1000 ? `${trimNum(v / 1000)} km` : `${trimNum(v)} m`;
  }

  /** Build a plan item from a slug, seeded with sane defaults. */
  function makeItem(slug) {
    const ex = get(slug);
    const type = TYPES[ex?.t] || TYPES.bodyweight_reps;
    return {
      uid: 'x' + Math.random().toString(36).slice(2, 10),
      slug,
      ...structuredClone(type.defaults)
    };
  }

  function typeOf(slug) {
    return TYPES[get(slug)?.t] || TYPES.bodyweight_reps;
  }

  return {
    load, get, frame, frameCount, search, summarise, setLabel, makeItem, typeOf,
    fmtDuration,
    get all() { return all; },
    get taxonomy() { return taxonomy; },
    METRICS, TYPES
  };
})();
