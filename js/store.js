/* ═══════════════════════════════════════════════════════════
   Store — plan + logs, persisted to localStorage.

   plan : one entry per weekday (mon…fri), each either a rest
          day or a list of exercises with your own targets.
   logs : keyed by ISO date, recording which sets you ticked
          off, so history survives plan edits.
   ═══════════════════════════════════════════════════════════ */

const Store = (() => {
  const KEY = 'weekplan.v1';
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday' };

  let state = null;

  /* ── shape ───────────────────────────────────────────────── */
  const uid = () => 'x' + Math.random().toString(36).slice(2, 10);

  function blankDay(title) {
    return { rest: false, title, exercises: [] };
  }

  /* A seeded item. Values are explicit rather than pulled from
     Catalog, because the store loads before the catalog does. */
  const seed = (slug, vals) => ({ uid: uid(), slug, restSec: 90, ...vals });

  /* First-run plan: a conventional push / pull / legs / full-body
     week. Every number here is meant to be changed. */
  function defaultState() {
    return {
      version: 1,
      plan: {
        mon: {
          rest: false, title: 'Push', exercises: [
            seed('bench-press',      { sets: 4, reps: 8,  weight: 40 }),
            seed('overhead-press',   { sets: 3, reps: 10, weight: 25 }),
            seed('lateral-raise',    { sets: 3, reps: 12, weight: 8, restSec: 60 }),
            seed('tricep-pushdown',  { sets: 3, reps: 12, weight: 20, restSec: 60 }),
          ]
        },
        tue: {
          rest: false, title: 'Pull', exercises: [
            seed('deadlift',              { sets: 3, reps: 5,  weight: 60, restSec: 150 }),
            seed('lat-pulldown',          { sets: 3, reps: 10, weight: 35 }),
            seed('one-arm-dumbbell-row',  { sets: 3, reps: 10, weight: 20 }),
            seed('bicep-curl',            { sets: 3, reps: 12, weight: 10, restSec: 60 }),
          ]
        },
        wed: { rest: true, title: 'Rest', exercises: [] },
        thu: {
          rest: false, title: 'Legs', exercises: [
            seed('squat',                { sets: 4, reps: 8,  weight: 50, restSec: 150 }),
            seed('romanian-deadlift',    { sets: 3, reps: 10, weight: 40 }),
            seed('leg-press',            { sets: 3, reps: 12, weight: 80 }),
            seed('standing-calf-raise',  { sets: 3, reps: 15, weight: 30, restSec: 45 }),
          ]
        },
        fri: {
          rest: false, title: 'Full body & core', exercises: [
            seed('pull-up',            { sets: 3, reps: 8,  restSec: 90 }),
            seed('push-up',            { sets: 3, reps: 15, restSec: 60 }),
            seed('plank',              { sets: 3, seconds: 45, restSec: 45 }),
            seed('hanging-leg-raise',  { sets: 3, reps: 12, restSec: 60 }),
          ]
        },
      },
      logs: {},
      mealPlan: [],
      mealLogs: {},
      foods: {},
      settings: { theme: 'dark', restTimer: true, sound: true, usdaKey: '' }
    };
  }

  /* ── persistence ─────────────────────────────────────────── */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? migrate(JSON.parse(raw)) : defaultState();
    } catch {
      state = defaultState();
    }
    return state;
  }

  function migrate(s) {
    const base = defaultState();
    if (!s || typeof s !== 'object') return base;
    const out = { ...base, ...s };
    out.plan = { ...base.plan, ...(s.plan || {}) };
    for (const d of DAYS) {
      const day = out.plan[d] || blankDay(DAY_NAMES[d]);
      out.plan[d] = {
        rest: !!day.rest,
        title: typeof day.title === 'string' ? day.title : DAY_NAMES[d],
        exercises: Array.isArray(day.exercises) ? day.exercises.filter(x => x && x.slug) : []
      };
    }
    out.logs = (s.logs && typeof s.logs === 'object') ? s.logs : {};
    // older saves hold one text line per meal; upgradeMealPlan() converts them once Nutrition is loaded
    out.mealPlan = Array.isArray(s.mealPlan) ? s.mealPlan.filter(m => typeof m === 'string' || (m && Array.isArray(m.items))) : [];
    out.mealLogs = (s.mealLogs && typeof s.mealLogs === 'object') ? s.mealLogs : {};
    out.foods = (s.foods && typeof s.foods === 'object') ? s.foods : {};
    out.mealPlanSeeded = !!s.mealPlanSeeded;
    out.settings = { ...base.settings, ...(s.settings || {}) };
    return out;
  }

  /* Written synchronously and deliberately: the payload is a few
     tens of kB, and a debounce would risk losing the last tick if
     the tab closes right after it. */
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Could not save — storage may be full or blocked.', err);
    }
  }

  function commit() {
    save();
  }

  /* ── dates ───────────────────────────────────────────────── */
  /** Local ISO date (yyyy-mm-dd) — never UTC, or "today" drifts. */
  function iso(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /** 'mon'…'fri', or null on Sat/Sun. */
  function dayKey(d = new Date()) {
    const i = d.getDay();          // 0 Sun … 6 Sat
    return i >= 1 && i <= 5 ? DAYS[i - 1] : null;
  }

  /** Monday of the week containing `ref`. */
  function mondayOf(ref = new Date()) {
    const d = new Date(ref);
    const shift = (d.getDay() + 6) % 7;   // Mon = 0
    d.setDate(d.getDate() - shift);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function nextWeekday(ref = new Date()) {
    const d = new Date(ref);
    do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    return d;
  }

  /* ── plan mutations ──────────────────────────────────────── */
  const getDay = key => state.plan[key];

  function setDayTitle(key, title) {
    state.plan[key].title = title;
    commit();
  }

  function setRest(key, rest) {
    state.plan[key].rest = !!rest;
    if (rest && !state.plan[key].title.trim()) state.plan[key].title = 'Rest';
    commit();
  }

  function addExercise(key, slug) {
    const item = Catalog.makeItem(slug);
    state.plan[key].exercises.push(item);
    if (state.plan[key].rest) state.plan[key].rest = false;
    commit();
    return item;
  }

  function removeExercise(key, uid) {
    const day = state.plan[key];
    day.exercises = day.exercises.filter(x => x.uid !== uid);
    commit();
  }

  function updateExercise(key, uid, patch) {
    const item = state.plan[key].exercises.find(x => x.uid === uid);
    if (!item) return;
    Object.assign(item, patch);
    commit();
  }

  function moveExercise(key, uid, delta) {
    const list = state.plan[key].exercises;
    const i = list.findIndex(x => x.uid === uid);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    commit();
  }

  function clearDay(key) {
    state.plan[key].exercises = [];
    commit();
  }

  function copyDay(from, to) {
    const src = state.plan[from];
    state.plan[to] = {
      rest: src.rest,
      title: src.title,
      exercises: src.exercises.map(x => ({ ...structuredClone(x), uid: uid() }))
    };
    commit();
  }

  /* ── logging ─────────────────────────────────────────────── */
  function ensureLog(date, dkey) {
    if (!state.logs[date]) {
      state.logs[date] = { day: dkey, sets: {}, title: state.plan[dkey]?.title || '', rest: !!state.plan[dkey]?.rest };
    }
    return state.logs[date];
  }

  /** Toggle set `idx` of exercise `uid` on `date`. Returns new value. */
  function toggleSet(date, dkey, uid, idx) {
    const log = ensureLog(date, dkey);
    const arr = log.sets[uid] || (log.sets[uid] = []);
    const next = !arr[idx];
    arr[idx] = next;
    log.title = state.plan[dkey]?.title || log.title;
    commit();
    return next;
  }

  function isSetDone(date, uid, idx) {
    return !!state.logs[date]?.sets?.[uid]?.[idx];
  }

  function doneCount(date, uid) {
    const arr = state.logs[date]?.sets?.[uid];
    return arr ? arr.filter(Boolean).length : 0;
  }

  /** Progress for a date against the current plan for that weekday. */
  function progress(date, dkey) {
    const day = state.plan[dkey];
    if (!day || day.rest) return { done: 0, total: 0, pct: 0, rest: true };
    let done = 0, total = 0;
    for (const item of day.exercises) {
      total += Math.max(1, item.sets || 1);
      done += Math.min(doneCount(date, item.uid), Math.max(1, item.sets || 1));
    }
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0, rest: false };
  }

  function resetDayLog(date) {
    delete state.logs[date];
    commit();
  }

  /* ── stats ───────────────────────────────────────────────── */
  /** Sessions where at least one set was ticked, newest first. */
  function history(limit = 30) {
    return Object.entries(state.logs)
      .map(([date, log]) => {
        const p = progress(date, log.day);
        const ticked = Object.values(log.sets || {}).reduce((n, a) => n + a.filter(Boolean).length, 0);
        return { date, log, ...p, ticked };
      })
      .filter(r => r.ticked > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  }

  /** Consecutive planned weekdays completed, counting back from today. */
  function streak() {
    let n = 0;
    const d = new Date();
    for (let guard = 0; guard < 400; guard++) {
      const key = dayKey(d);
      if (key) {
        const day = state.plan[key];
        if (!day.rest && day.exercises.length) {
          const p = progress(iso(d), key);
          if (p.pct >= 100) n++;
          else if (iso(d) !== iso()) break;   // today still in progress is fine
        }
      }
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  function weekSummary(ref = new Date()) {
    const mon = mondayOf(ref);
    return DAYS.map((key, i) => {
      const d = new Date(mon);
      d.setDate(d.getDate() + i);
      const day = state.plan[key];
      const p = progress(iso(d), key);
      let status = 'none';
      if (day.rest) status = 'rest';
      else if (!day.exercises.length) status = 'none';
      else if (p.pct >= 100) status = 'done';
      else if (p.done > 0) status = 'part';
      return { key, date: iso(d), dateObj: d, status, ...p, title: day.title };
    });
  }

  /** Total volume (kg) lifted this week — weight-based sets only. */
  function weekVolume(ref = new Date()) {
    let kg = 0;
    for (const cell of weekSummary(ref)) {
      const day = state.plan[cell.key];
      if (day.rest) continue;
      for (const item of day.exercises) {
        const type = Catalog.typeOf(item.slug);
        if (!type.metrics.includes('weight')) continue;
        kg += doneCount(cell.date, item.uid) * (item.reps || 0) * (item.weight || 0);
      }
    }
    return Math.round(kg);
  }

  /* ── meal plan ───────────────────────────────────────────── */
  /* mealPlan: [{ id, items: [{ id, options: [{ food, name, amount, unit }] }] }]
     An item with several options is an either/or ("okra / banana"),
     picked per day. The plan repeats daily; mealLogs[date] records
     which meals were eaten and which options were picked. */
  const getMealPlan = () => state.mealPlan;
  const findMeal = id => state.mealPlan.find(m => m.id === id);
  const findItem = (mealId, itemId) => findMeal(mealId)?.items.find(i => i.id === itemId);

  /** Convert text-line meals ("160g chicken breast, 100g rice") to items. */
  function upgradeMealPlan(parseLine) {
    if (!state.mealPlan.some(m => typeof m === 'string')) return;
    state.mealPlan = state.mealPlan.map(m => typeof m !== 'string' ? m : {
      id: uid(),
      items: m.split(',').map(t => t.trim()).filter(Boolean).map(t => ({ id: uid(), options: parseLine(t) }))
    });
    commit();
  }

  /** True once a plan has existed, so clearing it later never brings the default back. */
  function needsDefaultMealPlan() {
    if (state.mealPlanSeeded) return false;
    if (state.mealPlan.length) { state.mealPlanSeeded = true; commit(); return false; }
    return true;
  }

  /** Load the default plan (data/meal-plan.json): meals → foods, a "choice" is an either/or. */
  function seedMealPlan(meals) {
    state.mealPlan = meals.map(m => ({
      id: uid(),
      items: (m.foods || []).map(f => ({ id: uid(), options: (f.choice || [f]).map(o => ({ ...o })) }))
    }));
    state.mealPlanSeeded = true;
    commit();
  }

  function addMeal() {
    const meal = { id: uid(), items: [] };
    state.mealPlan.push(meal);
    commit();
    return meal;
  }

  function removeMeal(mealId) {
    state.mealPlan = state.mealPlan.filter(m => m.id !== mealId);
    commit();
  }

  /** Add a food (or an either/or, when given several options). Returns the item id. */
  function addFood(mealId, options) {
    const item = { id: uid(), options: [].concat(options) };
    findMeal(mealId)?.items.push(item);
    commit();
    return item.id;
  }

  /** Add an alternative to an item, making it an either/or. */
  function addAlternative(mealId, itemId, option) {
    findItem(mealId, itemId)?.options.push(option);
    commit();
  }

  function updateOption(mealId, itemId, index, patch) {
    const opt = findItem(mealId, itemId)?.options[index];
    if (!opt) return;
    Object.assign(opt, patch);
    commit();
  }

  /** Remove one option; the item goes with its last option. */
  function removeOption(mealId, itemId, index) {
    const meal = findMeal(mealId), item = findItem(mealId, itemId);
    if (!item) return;
    item.options.splice(index, 1);
    if (!item.options.length) meal.items = meal.items.filter(i => i !== item);
    commit();
  }

  /** Save a food (from USDA or typed in) to this device. Returns its id. */
  function saveFood(food) {
    const id = food.id || uid();
    state.foods[id] = { ...food, id };
    commit();
    return id;
  }

  const mealDay = date => state.mealLogs[date] || { done: {}, pick: {} };

  function ensureMealDay(date) {
    return state.mealLogs[date] || (state.mealLogs[date] = { done: {}, pick: {} });
  }

  function toggleMealDone(date, mealId) {
    const day = ensureMealDay(date);
    day.done[mealId] = !day.done[mealId];
    commit();
    return day.done[mealId];
  }

  function pickOption(date, itemId, index) {
    ensureMealDay(date).pick[itemId] = index;
    commit();
  }

  /* ── settings ────────────────────────────────────────────── */
  function setSetting(k, v) {
    state.settings[k] = v;
    commit();
  }

  /* ── import / export ─────────────────────────────────────── */
  const exportJSON = () => JSON.stringify(state, null, 2);

  function importJSON(text) {
    const parsed = JSON.parse(text);
    state = migrate(parsed);
    commit();
  }

  function resetAll() {
    state = defaultState();
    commit();
  }

  return {
    DAYS, DAY_NAMES,
    load,
    iso, dayKey, mondayOf, nextWeekday,
    getDay, setDayTitle, setRest,
    addExercise, removeExercise, updateExercise, moveExercise, clearDay, copyDay,
    toggleSet, isSetDone, doneCount, progress, resetDayLog,
    history, streak, weekSummary, weekVolume,
    getMealPlan, upgradeMealPlan, needsDefaultMealPlan, seedMealPlan, addMeal, removeMeal, addFood, addAlternative, updateOption, removeOption,
    saveFood, mealDay, toggleMealDone, pickOption,
    setSetting, exportJSON, importJSON, resetAll,
    get state() { return state; },
    get settings() { return state.settings; }
  };
})();
