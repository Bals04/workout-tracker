/* ═══════════════════════════════════════════════════════════
   UI — DOM helpers, animated exercise figures, sheet, toast,
   rest timer.
   ═══════════════════════════════════════════════════════════ */

const UI = (() => {

  /* ── tiny DOM builder ────────────────────────────────────── */
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of [].concat(children)) {
      if (c == null || c === false) continue;
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  /** Inline SVG from a path string. */
  function svg(paths, { size = 24, fill = 'none', width = 2 } = {}) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', `0 0 ${size} ${size}`);
    s.setAttribute('aria-hidden', 'true');
    for (const d of [].concat(paths)) {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', fill);
      if (fill === 'none') {
        p.setAttribute('stroke', 'currentColor');
        p.setAttribute('stroke-width', String(width));
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('stroke-linejoin', 'round');
      }
      s.append(p);
    }
    return s;
  }

  const ICON = {
    plus:    'M12 5v14M5 12h14',
    minus:   'M5 12h14',
    check:   'M5 12.5 10 17.5 19.5 7',
    chevron: 'M9 5l7 7-7 7',
    trash:   'M4 7h16M9.5 7V4.6h5V7M6.5 7l.9 12.4A1.7 1.7 0 0 0 9.1 21h5.8a1.7 1.7 0 0 0 1.7-1.6L17.5 7',
    up:      'M12 19V5M6 11l6-6 6 6',
    down:    'M12 5v14M18 13l-6 6-6-6',
    search:  'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.4 15.4 20 20',
    moon:    'M20 14.6A8.5 8.5 0 1 1 9.4 4a7 7 0 0 0 10.6 10.6Z',
    install: 'M12 3.5v11M8 10.5l4 4 4-4M4.5 19.5h15',
    dumbbell:'M4 9v6M20 9v6M7 7v10M17 7v10M7 12h10',
    flame:   'M12 21c3.6 0 6-2.3 6-5.6 0-4.3-4.4-5.9-3.6-11.4-2.6 1-4 3.4-4 5.6 0 1.4-.7 2.2-1.6 2.2-.8 0-1.3-.6-1.5-1.6C6.5 11.6 6 13.4 6 15.4 6 18.7 8.4 21 12 21Z',
    // the body was missing — this drew a bare line with two ticks
    calendar: [
      'M3.4 7.6a2.2 2.2 0 0 1 2.2-2.2h12.8a2.2 2.2 0 0 1 2.2 2.2v11a2.2 2.2 0 0 1-2.2 2.2H5.6a2.2 2.2 0 0 1-2.2-2.2Z',
      'M3.4 10.4h17.2',
      'M8.2 3.1v4M15.8 3.1v4'
    ],
    /* a day with a pencil over it — "edit this one day", distinct from
       the plain calendar used for the whole plan */
    calendarEdit: [
      'M20.4 11.4V7.6a2.2 2.2 0 0 0-2.2-2.2H5.6a2.2 2.2 0 0 0-2.2 2.2v11a2.2 2.2 0 0 0 2.2 2.2h5.2',
      'M3.4 10.4h17',
      'M8.2 3.1v4M15.8 3.1v4',
      'M21 13.9a1.5 1.5 0 0 1 0 2.2l-4.7 4.7-3 .7.7-3 4.7-4.7a1.5 1.5 0 0 1 2.3 0Z'
    ],
    copy:    'M9 9h9.4A1.6 1.6 0 0 1 20 10.6V20a1.6 1.6 0 0 1-1.6 1.6H9A1.6 1.6 0 0 1 7.4 20v-9.4A1.6 1.6 0 0 1 9 9Z M16.6 6.4V4A1.6 1.6 0 0 0 15 2.4H5.6A1.6 1.6 0 0 0 4 4v9.4A1.6 1.6 0 0 0 5.6 15h1.8'
  };

  const clear = node => { while (node.firstChild) node.firstChild.remove(); return node; };

  /** append() stringifies null to "null" — always go through this. */
  const add = (parent, ...kids) => {
    const keep = kids.filter(k => k != null && k !== false);
    if (keep.length) parent.append(...keep);
    return parent;
  };

  /* ── Animated exercise figure ────────────────────────────────
     Each exercise ships 3 frames. We stack them and cross-fade
     to animate the movement. Frames load lazily; the loop only
     runs while the figure is on screen, and never under
     prefers-reduced-motion (there we show the mid frame, which
     is the working position).                                */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const figObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        for (const en of entries) {
          const fig = en.target;
          if (en.isIntersecting) startFig(fig); else stopFig(fig);
        }
      }, { rootMargin: '120px' })
    : null;

  function figure(slug) {
    const frames = Catalog.frameCount(slug);
    const fig = el('div', {
      class: 'exfig',
      dataset: { slug, frames: String(frames) }
    });

    // Reduced motion: single frame, the mid (working) position.
    const indices = reduceMotion ? [Math.min(2, frames)] : Array.from({ length: frames }, (_, i) => i + 1);

    indices.forEach((n, i) => {
      const img = el('img', {
        src: Catalog.frame(slug, n),
        alt: i === 0 ? `${Catalog.get(slug)?.n || slug} illustration` : '',
        loading: 'lazy',
        decoding: 'async',
        draggable: 'false'
      });
      if (i === 0) img.classList.add('is-shown');
      img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
      fig.append(img);
    });

    if (!reduceMotion && indices.length > 1 && figObserver) figObserver.observe(fig);
    return fig;
  }

  const figTimers = new WeakMap();

  function startFig(fig) {
    if (figTimers.has(fig)) return;
    const imgs = [...fig.querySelectorAll('img')];
    if (imgs.length < 2) return;
    let i = 0;
    // 3-frame cycle read as a rep: start → working → start
    const order = [0, 1, 2, 1].filter(n => n < imgs.length);
    const id = setInterval(() => {
      imgs.forEach(im => im.classList.remove('is-shown'));
      i = (i + 1) % order.length;
      imgs[order[i]].classList.add('is-shown');
    }, 620);
    figTimers.set(fig, id);
  }

  function stopFig(fig) {
    const id = figTimers.get(fig);
    if (id) { clearInterval(id); figTimers.delete(fig); }
  }

  /* ── Progress ring ───────────────────────────────────────── */
  function ring(pct, { rest = false, complete = false, label = '' } = {}) {
    const R = 38, C = 2 * Math.PI * R;
    const wrap = el('div', { class: 'ring' + (rest ? ' ring--rest' : '') });
    wrap.innerHTML = `
      <svg viewBox="0 0 86 86">
        <circle class="ring__track" cx="43" cy="43" r="${R}"></circle>
        <circle class="ring__prog" cx="43" cy="43" r="${R}"
                stroke-dasharray="${C.toFixed(1)}"
                stroke-dashoffset="${(C * (1 - Math.min(1, pct / 100))).toFixed(1)}"></circle>
      </svg>`;
    const lab = el('div', { class: 'ring__label' });
    if (complete) {
      const tick = svg(ICON.check, { width: 2.6 });
      tick.classList.add('ring__check');
      lab.append(tick);
    } else {
      lab.append(el('strong', { class: 'num', text: `${pct}%` }), el('span', { text: label || 'done' }));
    }
    wrap.append(lab);
    return wrap;
  }

  /* ── Number stepper ──────────────────────────────────────── */
  function stepper(metricKey, value, onChange) {
    const m = Catalog.METRICS[metricKey];
    const wrap = el('div', { class: 'metric' });
    wrap.append(el('span', { class: 'metric__label', text: m.label }));

    const box = el('div', { class: 'stepper' });
    const input = el('input', {
      type: 'number', value: String(value),
      min: String(m.min), max: String(m.max), step: String(m.step),
      inputmode: 'decimal',
      'aria-label': m.label
    });

    const clampSet = v => {
      const n = Math.min(m.max, Math.max(m.min, Number(v)));
      const safe = Number.isFinite(n) ? Math.round(n * 100) / 100 : m.min;
      input.value = String(safe);
      onChange(safe);
    };

    const dec = el('button', { type: 'button', 'aria-label': `Decrease ${m.label}`,
      onclick: () => clampSet(Number(input.value) - m.step) }, svg(ICON.minus, { width: 2.4 }));
    const inc = el('button', { type: 'button', 'aria-label': `Increase ${m.label}`,
      onclick: () => clampSet(Number(input.value) + m.step) }, svg(ICON.plus, { width: 2.4 }));

    input.addEventListener('change', () => clampSet(input.value));
    input.addEventListener('focus', () => input.select());

    box.append(dec, input, inc);
    wrap.append(box);
    return wrap;
  }

  /* ── Sheet ───────────────────────────────────────────────── */
  const host = document.getElementById('sheet-host');
  const sheetBody = document.getElementById('sheet-body');
  const sheetTitle = document.getElementById('sheet-title');
  let lastFocus = null;
  let onSheetClose = null;

  function openSheet(title, contentFn, { onClose = null } = {}) {
    lastFocus = document.activeElement;
    onSheetClose = onClose;
    sheetTitle.textContent = title;
    clear(sheetBody);
    contentFn(sheetBody);
    host.hidden = false;
    document.querySelector('.app').inert = true;
    document.body.style.overflow = 'hidden';
    // focus the first useful control
    requestAnimationFrame(() => {
      const target = sheetBody.querySelector('input, button, select, [tabindex]');
      (target || sheetTitle).focus?.();
    });
  }

  function closeSheet() {
    if (host.hidden) return;
    host.hidden = true;
    document.querySelector('.app').inert = false;
    document.body.style.overflow = '';
    clear(sheetBody);
    const cb = onSheetClose; onSheetClose = null;
    lastFocus?.focus?.();
    cb?.();
  }

  const sheetIsOpen = () => !host.hidden;
  const rerenderSheet = contentFn => { clear(sheetBody); contentFn(sheetBody); };

  host.addEventListener('click', e => {
    if (e.target.closest('[data-close-sheet]')) closeSheet();
  });
  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape' && sheetIsOpen()) { e.preventDefault(); closeSheet(); }
    // keep focus inside the sheet
    if (e.key === 'Tab' && sheetIsOpen()) {
      const f = [...host.querySelectorAll('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])')]
        .filter(n => !n.disabled && n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ── Toast ───────────────────────────────────────────────── */
  const toastNode = document.getElementById('toast');
  let toastTimer = null;
  function toast(msg, ms = 2000) {
    clearTimeout(toastTimer);
    toastNode.textContent = msg;
    toastNode.hidden = false;
    toastTimer = setTimeout(() => { toastNode.hidden = true; }, ms);
  }

  /* ── Rest timer ──────────────────────────────────────────── */
  const RestTimer = (() => {
    const dock = document.getElementById('resttimer');
    const out = document.getElementById('rest-remaining');
    const prog = document.getElementById('rest-prog');
    const C = 2 * Math.PI * 17;
    let total = 0, left = 0, id = null;

    function paint() {
      const m = Math.floor(left / 60), s = left % 60;
      out.textContent = m ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
      prog.style.strokeDashoffset = String((C * (1 - (total ? left / total : 0))).toFixed(1));
    }

    function start(seconds) {
      if (!seconds || seconds <= 0) return;
      stop();
      total = left = Math.round(seconds);
      dock.hidden = false;
      paint();
      id = setInterval(() => {
        left--;
        if (left <= 0) { ding(); stop(); return; }
        paint();
      }, 1000);
    }

    function stop() {
      if (id) clearInterval(id);
      id = null;
      dock.hidden = true;
    }

    function add(seconds) {
      if (!id) return;
      left += seconds; total += seconds;
      paint();
    }

    /* short two-note chime + a buzz, so you can look away */
    function ding() {
      try {
        if (navigator.vibrate) navigator.vibrate([90, 60, 90]);
        if (!Store.settings.sound) return;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        [0, 0.16].forEach((t, i) => {
          const osc = ctx.createOscillator(), gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = i ? 1046 : 784;
          gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
          gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
          osc.connect(gain).connect(ctx.destination);
          osc.start(ctx.currentTime + t);
          osc.stop(ctx.currentTime + t + 0.24);
        });
        setTimeout(() => ctx.close(), 800);
      } catch { /* audio is a nicety, never a failure */ }
    }

    document.getElementById('rest-add').addEventListener('click', () => add(15));
    document.getElementById('rest-skip').addEventListener('click', stop);

    return { start, stop, add, get running() { return !!id; } };
  })();

  return {
    el, svg, ICON, clear, add, figure, ring, stepper,
    openSheet, closeSheet, rerenderSheet, toast, RestTimer
  };
})();
