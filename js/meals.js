/* ═══════════════════════════════════════════════════════════
   Meals — timestamped meal photos for a coach check-in.

   Photos are taken with the live camera, never picked from the
   gallery, and the capture time is burned into the pixels, so a
   shared photo carries its own proof of when it was taken.

   They live in IndexedDB rather than localStorage: a single
   photo is a few hundred kB, and localStorage tops out at ~5 MB.
   ═══════════════════════════════════════════════════════════ */

const Meals = (() => {
  const { el, svg } = UI;
  const DB = 'bals-meals', STORE = 'meals';
  const MAX_EDGE = 1600;              // long edge of the saved photo, px
  const FRESH_MS = 2 * 60 * 1000;     // fallback picker: reject older photos

  /* ── storage ─────────────────────────────────────────────── */
  let dbp = null;
  function db() {
    return dbp ||= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbp = null; reject(req.error); };
    });
  }

  /** Resolves when the transaction commits, not merely when the request lands. */
  async function run(mode, fn) {
    const t = (await db()).transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(req.result);
      t.onerror = t.onabort = () => reject(t.error);
    });
  }

  const all = async () => (await run('readonly', s => s.getAll())).sort((a, b) => b.ts - a.ts);
  const remove = id => run('readwrite', s => s.delete(id));
  const put = meal => run('readwrite', s => s.put(meal));

  /* ── formatting ──────────────────────────────────────────── */
  const timeOf = d => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const dateOf = d => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const stampText = ts => { const d = new Date(ts); return `${dateOf(d)}, ${timeOf(d)}`; };

  function fileName(meal) {
    const d = new Date(meal.ts), p = n => String(n).padStart(2, '0');
    return `meal-${Store.iso(d)}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
  }

  /* ── the stamp ───────────────────────────────────────────── */
  /* Chef Baw signs every photo. Loaded up front so the shutter never
     waits on it; if it fails the stamp simply goes without. */
  const badge = new Image();
  badge.src = 'mascot/meal-plan.png';
  const badgeReady = badge.decode().then(() => true, () => false);

  /* The macro colours from the app's dark theme — the band under them is always dark. */
  const MACRO_INK = { p: '#3987e5', c: '#d95926', f: '#199e70' };
  const r0 = n => Math.round(n);

  /** "39g protein · 30g carbs · 5g fat · 330 kcal" */
  const macroText = mac => `${r0(mac.p)}g protein · ${r0(mac.c)}g carbs · ${r0(mac.f)}g fat · ${r0(mac.kcal)} kcal`;

  /**
   * Draw `source` scaled down, burn the date and time in, return a JPEG.
   * With `tag` (a planned meal: title, macros, foods) the meal and its
   * macros are burned in too.
   */
  async function stamp(source, sw, sh, when, tag = null) {
    const k = Math.min(1, MAX_EDGE / Math.max(sw, sh));
    const w = Math.round(sw * k), h = Math.round(sh * k);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(source, 0, 0, w, h);

    const u = Math.min(w, h) / 100;
    const pad = 5 * u;
    const font = (weight, size) => `${weight} ${size}px Montserrat, system-ui, sans-serif`;

    // dark band so the text reads on any plate; taller when the macros go in
    const band = (tag ? 40 : 34) * u;
    const grad = g.createLinearGradient(0, h - band, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,.82)');
    g.fillStyle = grad;
    g.fillRect(0, h - band, w, band);

    g.textBaseline = 'alphabetic';
    g.shadowColor = 'rgba(0,0,0,.6)';
    g.shadowBlur = u;

    g.fillStyle = '#FFFFFF';
    g.font = font(800, 11 * u);
    g.textAlign = 'left';
    g.fillText(timeOf(when), pad, h - 11 * u);

    g.font = font(600, 4.2 * u);
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.fillText(dateOf(when), pad, h - 4.6 * u);

    if (tag) {
      // one small line of macros above the time, a coloured dot for each —
      // scaled down further if it would run past the edge
      const max = w - pad * 2;
      const parts = [['p', `${r0(tag.macros.p)}g protein`], ['c', `${r0(tag.macros.c)}g carbs`], ['f', `${r0(tag.macros.f)}g fat`], [null, `${r0(tag.macros.kcal)} kcal`]];
      const rowWidth = sz => { g.font = font(650, sz); return parts.reduce((t, [k, text]) => t + (k ? sz * .9 : 0) + g.measureText(text).width, 0) + sz * .9 * (parts.length - 1); };
      let size = 3.1 * u;
      if (rowWidth(size) > max) size *= max / rowWidth(size);
      g.font = font(650, size);
      const y = h - 22.5 * u;
      let x = pad;
      for (const [k, text] of parts) {
        if (k) {
          g.fillStyle = MACRO_INK[k];
          g.beginPath();
          g.arc(x + size * .28, y - size * .36, size * .28, 0, Math.PI * 2);
          g.fill();
          x += size * .9;
        }
        g.fillStyle = 'rgba(255,255,255,.88)';
        g.fillText(text, x, y);
        x += g.measureText(text).width + size * .9;
      }
    }

    // "Meal snapshot" as a green pill, so it reads on any background
    const label = tag ? `Meal snapshot · ${tag.title}` : 'Meal snapshot', size = 3.4 * u, px = 2.6 * u, py = 1.5 * u;
    g.font = font(750, size);
    g.textBaseline = 'middle';
    const tw = g.measureText(label).width, th = size + py * 2, tx = pad, ty = pad * .7;
    g.shadowColor = 'rgba(0,0,0,.35)';
    g.shadowBlur = 1.5 * u;
    g.fillStyle = '#408C74';   // the app's accent green
    g.beginPath();
    if (g.roundRect) g.roundRect(tx, ty, tw + px * 2, th, th / 2);
    else g.rect(tx, ty, tw + px * 2, th);   // Safari < 16
    g.fill();
    g.shadowColor = 'transparent';
    g.fillStyle = '#FFFFFF';
    g.fillText(label, tx + px, ty + th / 2);

    if (await badgeReady) {
      const bh = 22 * u, bw = bh * badge.naturalWidth / badge.naturalHeight;
      g.shadowColor = 'rgba(0,0,0,.45)';
      g.shadowBlur = 2 * u;
      g.drawImage(badge, w - pad * .7 - bw, pad * .5, bw, bh);
    }

    return new Promise((resolve, reject) =>
      c.toBlob(b => b ? resolve(b) : reject(new Error('Could not encode photo')), 'image/jpeg', .85));
  }

  async function save(blob, when, source, tag) {
    const meal = {
      id: `m${when.getTime()}${Math.random().toString(36).slice(2, 6)}`,
      ts: when.getTime(), date: Store.iso(when), source, blob,
      ...(tag ? { plan: { mealIds: tag.ids, title: tag.title, macros: tag.macros, foods: tag.foods } } : {})
    };
    await put(meal);
    // ask once that the browser not evict the photos under storage pressure
    navigator.storage?.persist?.().catch(() => {});
    return meal;
  }

  /* ── camera ──────────────────────────────────────────────── */
  const ICON_X = 'M6 6l12 12M18 6L6 18';
  const ICON_SHARE = 'M12 15V3.8M7.8 7.8 12 3.6l4.2 4.2M5.5 11.5v6.7a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-6.7';
  const ICON_CAMERA = [
    'M4.5 8.2A1.7 1.7 0 0 1 6.2 6.5h1.9l1.5-2h4.8l1.5 2h1.9a1.7 1.7 0 0 1 1.7 1.7v9.6a1.7 1.7 0 0 1-1.7 1.7H6.2a1.7 1.7 0 0 1-1.7-1.7Z',
    'M12 16.4a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z'
  ];

  /**
   * Full-screen viewfinder. Resolves with the saved meal, or null if
   * the user backs out. Falls back to the OS camera when the browser
   * cannot give us a live stream (no permission, no HTTPS, old iOS).
   */
  /**
   * `choices`: the day's planned meals [{ id, title, macros, foods }] to tag
   * the photo with; `preselect`: the id suggested (the next meal not eaten).
   */
  function capture({ choices = [], preselect = null } = {}) {
    return new Promise(resolve => {
      let stream = null, busy = false;
      // several meals can be picked, for when two are eaten as one
      const picked = new Set(choices.some(c => c.id === preselect) ? [preselect] : []);

      /** The picked meals as one tag: "2nd + 3rd meal", macros added up. */
      const currentTag = () => {
        const chosen = choices.filter(c => picked.has(c.id));
        if (!chosen.length) return null;
        const sum = k => chosen.reduce((t, c) => t + c.macros[k], 0);
        return {
          ids: chosen.map(c => c.id),
          title: chosen.length === 1 ? chosen[0].title : `${chosen.map(c => c.title.replace(/ meal$/, '')).join(' + ')} meal`,
          macros: { p: sum('p'), c: sum('c'), f: sum('f'), kcal: sum('kcal') },
          foods: chosen.flatMap(c => c.foods)
        };
      };
      const app = document.querySelector('.app');
      const previousFocus = document.activeElement;

      const video = el('video', { class: 'cam__video', playsinline: true, muted: true, autoplay: true });
      video.muted = true;   // the attribute alone is not enough for iOS autoplay
      const clock = el('div', { class: 'cam__clock num', 'aria-hidden': 'true' });
      const status = el('p', { class: 'cam__status', role: 'status', text: 'Starting camera…' });
      const shutter = el('button', { class: 'cam__shutter', type: 'button', 'aria-label': 'Take photo', disabled: true });
      const closeBtn = el('button', { class: 'cam__close', type: 'button', 'aria-label': 'Close camera' }, svg(ICON_X, { width: 2.4 }));

      /* "Which meal is this?" — optional; "No meal" keeps the plain stamp */
      const picker = el('div', { class: 'cam__meals', role: 'group', 'aria-label': 'Which meal is this?' });
      const pickInfo = el('p', { class: 'cam__mealinfo num', 'aria-live': 'polite' });
      const paintPicker = () => {
        picker.replaceChildren(
          el('span', { class: 'cam__ask', text: 'Which meal is this? Tap more than one if you ate them together.' }),
          ...choices.map(c => el('button', {
            class: 'chip chip--sm', type: 'button', 'aria-pressed': String(picked.has(c.id)),
            onclick: () => { if (picked.has(c.id)) picked.delete(c.id); else picked.add(c.id); paintPicker(); }
          }, c.title)),
          el('button', {
            class: 'chip chip--sm', type: 'button', 'aria-pressed': String(!picked.size),
            onclick: () => { picked.clear(); paintPicker(); }
          }, 'No meal'));
        const tag = currentTag();
        pickInfo.textContent = tag ? `${tag.title}: ${macroText(tag.macros)}` : 'Photo without meal details';
      };
      if (choices.length) paintPicker();

      const paintClock = () => { clock.textContent = timeOf(new Date()); };
      paintClock();
      const tick = setInterval(paintClock, 1000);

      const root = el('div', { class: 'cam', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Snap a meal' }, [
        el('div', { class: 'cam__stage' }, [video, clock, status]),
        el('div', { class: 'cam__bar' }, [
          choices.length ? el('div', { class: 'cam__mealpick' }, [picker, pickInfo]) : null,
          el('div', { class: 'cam__controls' }, [closeBtn, shutter, el('span')])
        ])
      ]);

      const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); finish(null); } };

      function finish(meal) {
        clearInterval(tick);
        stream?.getTracks().forEach(t => t.stop());
        document.removeEventListener('keydown', onKey);
        root.remove();
        app.inert = false;
        document.body.style.overflow = '';
        previousFocus?.focus?.();
        resolve(meal);
      }

      async function shoot(source, sw, sh, origin) {
        if (busy) return;
        busy = true;
        shutter.disabled = true;
        const when = new Date();
        try {
          root.classList.add('is-flash');
          const tag = currentTag();
          const blob = await stamp(source, sw, sh, when, tag);
          finish(await save(blob, when, origin, tag));
        } catch (err) {
          console.error(err);
          UI.toast('Could not save that photo — try again');
          busy = false;
          shutter.disabled = false;
          root.classList.remove('is-flash');
        }
      }

      /* No live stream: hand off to the OS camera via a file input.
         `capture` opens the camera directly on phones; if a browser
         offers the gallery anyway, anything not just taken is refused. */
      function fallback(reason) {
        video.hidden = true;
        clock.hidden = true;
        const input = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          input.value = '';
          if (!file) return;
          if (Math.abs(Date.now() - file.lastModified) > FRESH_MS) {
            UI.toast('Only a photo taken right now counts — take a new one');
            return;
          }
          const img = new Image();
          const url = URL.createObjectURL(file);
          img.onload = () => { URL.revokeObjectURL(url); shoot(img, img.naturalWidth, img.naturalHeight, 'os-camera'); };
          img.onerror = () => { URL.revokeObjectURL(url); UI.toast('That photo could not be read'); };
          img.src = url;
        });
        status.textContent = reason;
        shutter.disabled = false;
        shutter.setAttribute('aria-label', 'Open camera');
        shutter.onclick = () => input.click();
        root.append(input);
      }

      shutter.onclick = () => shoot(video, video.videoWidth, video.videoHeight, 'live-camera');
      closeBtn.onclick = () => finish(null);
      document.addEventListener('keydown', onKey);
      app.inert = true;
      document.body.style.overflow = 'hidden';
      document.body.append(root);
      shutter.focus();

      if (!navigator.mediaDevices?.getUserMedia) {
        fallback('Tap the shutter to open your camera.');
        return;
      }
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false
      }).then(s => {
        if (!root.isConnected) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        video.srcObject = s;
        video.addEventListener('loadedmetadata', () => {
          status.hidden = true;
          shutter.disabled = false;
          shutter.focus();
        }, { once: true });
      }).catch(() => {
        if (root.isConnected) fallback('Camera access is off for this app. Tap the shutter to use your phone camera instead.');
      });
    });
  }

  /* ── sharing & saving ────────────────────────────────────── */
  const toFiles = meals => meals.map(m => new File([m.blob], fileName(m), { type: 'image/jpeg', lastModified: m.ts }));

  /* iPadOS 13+ reports itself as a Mac, so test for touch as well. */
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function download(files) {
    for (const f of files) {
      const a = el('a', { href: URL.createObjectURL(f), download: f.name });
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
  }

  /** Open the OS share sheet. Resolves false when sharing files is unsupported. */
  async function shareSheet(files, text) {
    if (!navigator.canShare?.({ files })) return false;
    try {
      await navigator.share(text ? { files, text } : { files });
    } catch (err) {
      if (err.name !== 'AbortError') UI.toast('Could not share — try again');
    }
    return true;
  }

  /** Share via the OS sheet (WhatsApp, Messages, …), else download. */
  async function share(meals) {
    const files = toFiles(meals);
    const text = meals.slice().sort((a, b) => a.ts - b.ts)
      .map(m => m.plan
        ? `${m.plan.title} — ${stampText(m.ts)} — ${macroText(m.plan.macros)}`
        : `Meal — ${stampText(m.ts)}`).join('\n');
    if (await shareSheet(files, text)) return;
    download(files);
    UI.toast(files.length > 1 ? `${files.length} photos downloaded` : 'Photo downloaded');
  }

  /* Save to the phone's photos. A web app cannot write to the camera
     roll directly: on iOS the only route is the share sheet's "Save
     Image"; elsewhere a download lands in the gallery's Download album. */
  async function saveToGallery(meals) {
    const files = toFiles(meals);
    if (isIOS()) {
      UI.toast(files.length > 1 ? 'Tap "Save Images" to add them to Photos' : 'Tap "Save Image" to add it to Photos', 3500);
      if (await shareSheet(files)) return;
    }
    download(files);
    UI.toast(files.length > 1 ? `${files.length} photos saved to Downloads` : 'Saved to Downloads — find it in your gallery', 3000);
  }

  return { all, remove, capture, share, saveToGallery, stampText, timeOf, macroText, ICON_CAMERA, ICON_SHARE };
})();
