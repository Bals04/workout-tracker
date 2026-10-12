/* ═══════════════════════════════════════════════════════════
   App — views, routing, wiring.
   ═══════════════════════════════════════════════════════════ */

(() => {
  const { el, svg, ICON, clear, add, figure, ring, stepper } = UI;

  /** Single source for the product name — used in file names and copy. */
  const APP = { name: 'Bals workout planner', version: '1.0', slug: 'bals-workout-planner' };

  const views = {
    today: document.getElementById('view-today'),
    week:  document.getElementById('view-week'),
    meals: document.getElementById('view-meals'),
    stats: document.getElementById('view-stats'),
  };
  let current = 'today';
  let installPrompt = null;
  let selectedDay = Store.dayKey(new Date()) || 'mon';

  const plannedVolume = day => day.rest ? 0 : day.exercises.reduce((sum, item) =>
    sum + (Catalog.typeOf(item.slug).metrics.includes('weight')
      ? (item.sets || 1) * (item.reps || 0) * (item.weight || 0) : 0), 0);

  function renderTrainingSummary() {
    const days = Store.DAYS.map(key => Store.getDay(key));
    const active = days.filter(day => !day.rest && day.exercises.length);
    const count = active.reduce((sum, day) => sum + day.exercises.length, 0);
    const volume = Math.round(active.reduce((sum, day) => sum + plannedVolume(day), 0));
    const root = clear(document.getElementById('training-summary'));
    [[count, 'Exercises', 'exercises'], [active.length, 'Active days', 'active-days'], [volume.toLocaleString(), 'Total volume', 'total-volume']]
      .forEach(([value, label, pose]) => {
        root.append(el('div', { class: 'training-stat' }, [
          el('img', { class: 'training-stat__mascot', src: `mascot/${pose}.png`, alt: '', loading: 'lazy', decoding: 'async' }),
          el('strong', { class: 'num', text: value }),
          el('span', { text: label })
        ]));
      });
    document.getElementById('coach-message').textContent = active.length
      ? `Strong week: ${active.length} active ${active.length === 1 ? 'day' : 'days'} and ${volume.toLocaleString()} kg total planned volume. Keep recovery on the board too.`
      : 'A fresh week, a fresh start. Add your first exercise and build a plan that works for you.';
  }

  function confirmAction(title, message, label, action) {
    const previousFocus = document.activeElement;
    const dialog = el('dialog', { class: 'confirm-dialog', 'aria-labelledby': 'confirm-title', 'aria-describedby': 'confirm-description' });
    const close = () => { dialog.close(); dialog.remove(); previousFocus?.focus?.(); };
    dialog.append(
      el('img', { class: 'confirm-dialog__mascot', src: 'mascot/coach-thinking.png', alt: '', width: 116, height: 116 }),
      el('h2', { id: 'confirm-title', text: title }),
      el('p', { id: 'confirm-description', text: message }),
      el('div', { class: 'confirm-dialog__actions' }, [
        el('button', { class: 'btn', type: 'button', autofocus: true, onclick: close }, 'Cancel'),
        el('button', { class: 'btn btn--danger', type: 'button', onclick: () => { close(); action(); } }, [svg(ICON.trash), label])
      ])
    );
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    const isBackdrop = event => {
      const rect = dialog.getBoundingClientRect();
      return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom);
    };
    let pressedBackdrop = false;
    dialog.addEventListener('pointerdown', event => { pressedBackdrop = isBackdrop(event); });
    dialog.addEventListener('click', event => {
      if (pressedBackdrop && isBackdrop(event)) close();
      pressedBackdrop = false;
    });
    document.body.append(dialog);
    dialog.showModal();
  }

  const fmtDate = (d, opts) => d.toLocaleDateString(undefined, opts);

  /* ══════════════════════════════════════════════════════════
     TODAY
     ══════════════════════════════════════════════════════════ */
  function renderToday() {
    const root = clear(views.today);
    const now = new Date();
    const dkey = Store.dayKey(now);
    const date = Store.iso(now);

    /* Weekend — nothing planned, so point at the next weekday */
    if (!dkey) {
      const next = Store.nextWeekday(now);
      const nextKey = Store.dayKey(next);
      const nextDay = Store.getDay(nextKey);

      root.append(
        el('div', { class: 'hero hero--rest' }, [
          el('div', { class: 'hero__meta' }, [
            el('div', { class: 'hero__date', text: fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long' }) }),
            el('h2', { class: 'hero__title', text: 'Weekend' }),
            el('p', { class: 'hero__sub', html: 'Your plan runs Monday to Friday. Enjoy the time off.' })
          ]),
          (() => {
            const w = el('div', { class: 'ring ring--rest' });
            w.innerHTML = `<svg viewBox="0 0 86 86"><circle class="ring__track" cx="43" cy="43" r="38"></circle></svg>`;
            const l = el('div', { class: 'ring__label' });
            const m = svg(ICON.moon, { fill: 'currentColor' });
            m.classList.add('ring__check');
            l.append(m);
            w.append(l);
            return w;
          })()
        ])
      );

      root.append(el('div', { class: 'sechead' }, [
        el('h2', { text: `Up next — ${Store.DAY_NAMES[nextKey]}` }),
        el('span', { class: 'sechead__hint', text: fmtDate(next, { day: 'numeric', month: 'short' }) })
      ]));

      if (nextDay.rest) {
        root.append(restCard(nextDay.title, 'This one is a rest day too.'));
      } else if (!nextDay.exercises.length) {
        root.append(emptyPlanCard(nextKey));
      } else {
        const list = el('div', { class: 'exlist' });
        nextDay.exercises.forEach(item => list.append(previewCard(item)));
        root.append(list);
      }
      add(root, installBar(), creditNote());
      return;
    }

    const day = Store.getDay(dkey);
    const prog = Store.progress(date, dkey);
    const complete = !day.rest && prog.total > 0 && prog.pct >= 100;

    /* Hero */
    const sub = day.rest
      ? 'Rest day — recovery is part of the plan.'
      : prog.total
        ? `<b>${prog.done}</b> of <b>${prog.total}</b> sets · ${day.exercises.length} exercise${day.exercises.length === 1 ? '' : 's'}`
        : 'Nothing planned yet for today.';

    root.append(
      el('div', { class: 'hero' + (day.rest ? ' hero--rest' : '') }, [
        el('div', { class: 'hero__meta' }, [
          el('div', { class: 'hero__date', text: fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long' }) }),
          el('h2', { class: 'hero__title', text: day.title || Store.DAY_NAMES[dkey] }),
          el('p', { class: 'hero__sub', html: sub })
        ]),
        day.rest
          ? (() => {
              const w = el('div', { class: 'ring ring--rest' });
              w.innerHTML = `<svg viewBox="0 0 86 86"><circle class="ring__track" cx="43" cy="43" r="38"></circle></svg>`;
              const l = el('div', { class: 'ring__label' });
              const m = svg(ICON.moon, { fill: 'currentColor' });
              m.classList.add('ring__check');
              l.append(m);
              w.append(l);
              return w;
            })()
          : ring(prog.pct, { complete })
      ])
    );

    /* Rest day */
    if (day.rest) {
      root.append(
        el('div', { style: 'margin-top:14px' }, [
          restCard(day.title || 'Rest day',
            'No session scheduled. Sleep, eat, walk — your next workout is built on today.')
        ]),
        el('div', { class: 'sechead' }, [el('h2', { text: 'Change of plan?' })]),
        el('button', {
          class: 'btn btn--block', type: 'button',
          onclick: () => openDayEditor(dkey)
        }, [svg(ICON.calendar, { width: 1.9 }), 'Edit Monday–Friday plan'])
      );
      add(root, installBar(), creditNote());
      return;
    }

    /* Nothing planned */
    if (!day.exercises.length) {
      add(root, el('div', { style: 'margin-top:14px' }, [emptyPlanCard(dkey)]), installBar(), creditNote());
      return;
    }

    /* Exercise list with tap-to-log sets */
    root.append(el('div', { class: 'sechead' }, [
      el('h2', { text: "Today's session" }),
      el('span', { class: 'sechead__hint', text: 'Tap a set to log it' })
    ]));

    const list = el('div', { class: 'exlist' });
    day.exercises.forEach(item => list.append(exerciseCard(item, dkey, date)));
    root.append(list);

    /* Footer actions */
    const actions = el('div', { class: 'stack', style: 'margin-top:18px' }, [
      complete
        ? el('div', { class: 'restcard' }, [
            svg(ICON.check, { width: 2.4 }),
            el('h3', { text: 'Session complete' }),
            el('p', { text: `Every set logged. ${Store.streak() > 1 ? `That is ${Store.streak()} days in a row.` : 'Same again next time.'}` })
          ])
        : null,
      el('div', { class: 'row', style: 'gap:8px' }, [
        el('button', { class: 'btn btn--ghost', type: 'button', style: 'flex:1',
          onclick: () => openDayEditor(dkey) }, [svg(ICON.calendarEdit, { width: 1.9 }), 'Edit today']),
        prog.done > 0
          ? el('button', { class: 'btn btn--ghost', type: 'button',
              onclick: () => {
                if (!confirm("Clear today's logged sets? Your plan stays as it is.")) return;
                Store.resetDayLog(date);
                UI.toast('Today reset');
              } }, 'Reset')
          : null
      ])
    ]);
    add(root, actions, installBar(), creditNote());
  }

  function restCard(title, body) {
    return el('div', { class: 'restcard' }, [
      svg(ICON.moon, { fill: 'currentColor' }),
      el('h3', { text: title }),
      el('p', { text: body })
    ]);
  }

  function emptyPlanCard(dkey) {
    return el('div', { class: 'empty' }, [
      svg(ICON.dumbbell, { width: 1.9 }),
      el('h3', { text: `${Store.DAY_NAMES[dkey]} is empty` }),
      el('p', { text: 'Add exercises with your own sets and reps — or mark the day as rest.' }),
      el('div', { class: 'row', style: 'justify-content:center;gap:8px;flex-wrap:wrap' }, [
        el('button', { class: 'btn btn--primary', type: 'button',
          onclick: () => openDayEditor(dkey) }, [svg(ICON.plus, { width: 2.2 }), 'Build this day']),
        el('button', { class: 'btn btn--ghost', type: 'button',
          onclick: () => { Store.setRest(dkey, true); UI.toast(`${Store.DAY_NAMES[dkey]} set to rest`); } },
          [svg(ICON.moon, { fill: 'currentColor' }), 'Make it a rest day'])
      ])
    ]);
  }

  /** Card with tappable set chips — the core logging interaction. */
  function exerciseCard(item, dkey, date) {
    const ex = Catalog.get(item.slug);
    const sets = Math.max(1, item.sets || 1);
    const done = Math.min(Store.doneCount(date, item.uid), sets);
    const card = el('div', { class: 'excard' + (done >= sets ? ' is-complete' : '') });

    card.append(
      el('div', { class: 'excard__top' }, [
        figure(item.slug),
        el('div', { class: 'excard__body' }, [
          el('div', { class: 'excard__name', text: ex?.n || item.slug }),
          el('div', { class: 'excard__tags' }, [
            ex?.p ? el('span', { class: 'tag', text: ex.p }) : null,
            ex?.q ? el('span', { class: 'tag', text: ex.q }) : null
          ]),
          el('div', { class: 'excard__target', html: `Target &nbsp;<b>${Catalog.summarise(item)}</b>` })
        ]),
        el('span', { class: 'excard__count num', text: `${done}/${sets}` })
      ])
    );

    const setsRow = el('div', { class: 'sets' });
    for (let i = 0; i < sets; i++) {
      const isDone = Store.isSetDone(date, item.uid, i);
      const btn = el('button', {
        class: 'setbtn', type: 'button',
        'aria-pressed': isDone ? 'true' : 'false',
        'aria-label': `Set ${i + 1} of ${sets}, ${Catalog.setLabel(item)}${isDone ? ', logged' : ''}`
      }, [
        el('strong', { text: Catalog.setLabel(item) }),
        el('span', { text: `Set ${i + 1}` })
      ]);

      btn.addEventListener('click', () => {
        const nowDone = Store.toggleSet(date, dkey, item.uid, i);
        if (nowDone && navigator.vibrate) navigator.vibrate(18);
        // Start the rest timer when a set lands and work remains.
        const total = Math.max(1, item.sets || 1);
        const after = Store.doneCount(date, item.uid);
        if (nowDone && Store.settings.restTimer && item.restSec > 0 && after < total) {
          UI.RestTimer.start(item.restSec);
        }
        renderToday();
      });
      setsRow.append(btn);
    }
    card.append(setsRow);
    return card;
  }

  /** Read-only card used for "up next" on weekends. */
  function previewCard(item) {
    const ex = Catalog.get(item.slug);
    return el('div', { class: 'excard' }, [
      el('div', { class: 'excard__top' }, [
        figure(item.slug),
        el('div', { class: 'excard__body' }, [
          el('div', { class: 'excard__name', text: ex?.n || item.slug }),
          el('div', { class: 'excard__target', html: `<b>${Catalog.summarise(item)}</b>` })
        ])
      ])
    ]);
  }

  /* ══════════════════════════════════════════════════════════
     WEEK / PLAN
     ══════════════════════════════════════════════════════════ */
  function renderWeek() {
    const root = clear(views.week);
    renderTrainingSummary();
    const keys = [...Store.DAYS, 'sat', 'sun'];
    const names = { ...Store.DAY_NAMES, sat: 'Saturday', sun: 'Sunday' };
    const tabs = el('div', { class: 'plan-tabs', role: 'tablist', 'aria-label': 'Training days' });
    for (const key of keys) {
      const day = Store.DAYS.includes(key) ? Store.getDay(key) : { rest: true, exercises: [] };
      tabs.append(el('button', {
        class: 'plan-tab' + (day.rest ? ' is-rest' : ''), type: 'button', role: 'tab',
        id: `day-tab-${key}`, 'aria-selected': String(selectedDay === key),
        'aria-controls': 'day-board', tabindex: selectedDay === key ? 0 : -1,
        'aria-label': names[key],
        onclick: () => { selectedDay = key; renderWeek(); document.getElementById(`day-tab-${key}`).focus(); },
        onkeydown: e => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          selectedDay = e.key === 'Home' ? keys[0] : e.key === 'End' ? keys[6]
            : keys[(keys.indexOf(key) + (e.key === 'ArrowRight' ? 1 : 6)) % 7];
          renderWeek(); document.getElementById(`day-tab-${selectedDay}`).focus();
        }
      }, [el('strong', { text: key }), el('span', { text: day.rest ? 'Rest' : day.exercises.length })]));
    }
    root.append(tabs);
    const dkey = selectedDay;
    const weekend = !Store.DAYS.includes(dkey);
    const day = weekend ? { rest: true, exercises: [] } : Store.getDay(dkey);
    const board = el('section', { class: 'day-board', id: 'day-board', role: 'tabpanel', 'aria-labelledby': `day-tab-${dkey}` });
    board.append(el('div', { class: 'day-board__head' }, [
      el('div', {}, [el('span', { class: 'day-label', text: dkey }), el('h2', { text: names[dkey] }),
        el('p', { text: day.rest ? 'Rest and recovery' : `${day.exercises.length} exercises${day.title && day.title !== names[dkey] ? ` · ${day.title}` : ''}` }),
        weekend ? null : el('button', { class: 'session-edit', type: 'button', onclick: () => openDayEditor(dkey) }, 'Edit session')]),
      el('div', { class: 'volume-badge', title: 'Planned sets × reps × weight (kg)' }, [
        el('strong', { text: Math.round(plannedVolume(day)).toLocaleString() }), el('span', { text: 'Volume' })])
    ]));
    if (day.rest) {
      board.append(restCard('Make room for recovery', weekend ? 'Your training plan runs Monday to Friday. Enjoy your weekend.' : 'Take a breather. Your exercises are saved for when you are ready to train.'));
    } else if (!day.exercises.length) {
      board.append(el('div', { class: 'empty' }, [el('h3', { text: 'Your next session starts here' }), el('p', { text: 'Add an exercise to start building this day.' })]));
    } else {
      const grid = el('div', { class: 'plan-grid' });
      day.exercises.forEach(item => {
        const ex = Catalog.get(item.slug);
        const edit = () => {
          // The full day editor preserves reordering and all metric controls.
          openDayEditor(dkey);
          requestAnimationFrame(() => [...document.querySelectorAll('.editrow')].find(row => row.querySelector('.editrow__name')?.textContent === (ex?.n || item.slug))?.scrollIntoView({ block: 'nearest' }));
        };
        grid.append(el('article', { class: 'plan-exercise' }, [
          figure(item.slug),
          el('span', { class: 'muscle-badge', text: ex?.p || 'Exercise' }),
          el('h3', { text: ex?.n || item.slug }),
          el('p', { class: 'plan-exercise__target', text: Catalog.summarise(item) }),
          el('div', { class: 'plan-exercise__actions' }, [
            el('button', { class: 'btn btn--primary', type: 'button', onclick: edit, 'aria-label': `Edit ${ex?.n || item.slug}` }, 'Edit'),
            el('button', { class: 'btn btn--danger', type: 'button', 'aria-label': `Delete ${ex?.n || item.slug}`,
              onclick: () => confirmAction('Delete exercise', `Remove ${ex?.n || item.slug} from ${names[dkey]}?`, 'Delete', () => {
                Store.removeExercise(dkey, item.uid); renderAll(); UI.toast('Exercise removed');
              }) }, [svg(ICON.trash), 'Delete'])
          ])
        ]));
      });
      board.append(grid);
    }
    if (!weekend) board.append(el('div', { class: 'day-board__actions' }, [
      el('button', { class: 'btn btn--rest', type: 'button', onclick: () => { Store.setRest(dkey, !day.rest); renderAll(); } }, [svg(ICON.moon), day.rest ? 'Make training day' : 'Mark rest']),
      el('button', { class: 'btn', type: 'button', onclick: () => UI.openSheet('Copy day', body => {
        body.append(el('p', { class: 'copy-description', text: `Copy ${names[dkey]} to another training day.` }));
        Store.DAYS.filter(key => key !== dkey).forEach(key => body.append(el('button', { class: 'btn btn--block', type: 'button', style: 'margin-top:8px',
          onclick: () => confirmAction(`Replace ${names[key]}?`, `Replace its exercises with a copy of ${names[dkey]}? This cannot be undone.`, 'Replace day', () => { Store.copyDay(dkey, key); UI.closeSheet(); renderAll(); UI.toast(`Copied to ${names[key]}`); }) }, names[key])));
      }) }, [svg(ICON.copy), 'Copy day']),
      el('button', { class: 'btn btn--danger', type: 'button', disabled: !day.exercises.length,
        onclick: () => confirmAction(`Clear ${names[dkey]}`, `Remove all ${day.exercises.length} exercises from ${names[dkey]}? This can't be undone.`, 'Clear day', () => { Store.clearDay(dkey); renderAll(); UI.toast('Day cleared'); }) }, [svg(ICON.trash), 'Clear day']),
      el('button', { class: 'btn btn--primary', type: 'button', onclick: () => openPicker(dkey) }, [svg(ICON.plus), 'Add exercise'])
    ]));
    root.append(board, el('section', { class: 'backup-panel' }, [
      el('div', {}, [el('h2', { text: 'Backup and restore' }), el('p', { text: 'Export or import your weekly gym data.' })]),
      el('div', { class: 'backup-panel__actions' }, [
        el('button', { class: 'btn', type: 'button', onclick: exportData }, [svg(ICON.install), 'Export backup']),
        el('button', { class: 'btn', type: 'button', onclick: importData }, [svg(ICON.copy), 'Import backup'])
      ])
    ]), creditNote());
  }

  /* ══════════════════════════════════════════════════════════
     DAY EDITOR (sheet)
     ══════════════════════════════════════════════════════════ */
  function openDayEditor(dkey) {
    const build = body => {
      const day = Store.getDay(dkey);

      /* Title */
      const titleField = el('div', { class: 'field' }, [
        el('label', { for: 'day-title', text: 'Session name' }),
        el('input', {
          class: 'input', id: 'day-title', type: 'text', value: day.title,
          placeholder: `e.g. Push, Legs, Full body`, maxlength: '48',
          onchange: e => Store.setDayTitle(dkey, e.target.value.trim() || Store.DAY_NAMES[dkey])
        })
      ]);

      /* Rest toggle */
      const restToggle = el('div', {
        class: 'card', style: 'display:flex;align-items:center;gap:13px;padding:14px'
      }, [
        svg(ICON.moon, { fill: 'currentColor' }),
        el('div', { style: 'flex:1' }, [
          el('div', { style: 'font-weight:650;font-size:.9rem', text: 'Rest day' }),
          el('div', { style: 'font-size:.76rem;color:var(--text-dim);margin-top:2px',
            text: 'No session — the day shows as recovery.' })
        ]),
        el('button', {
          class: 'switch', type: 'button', role: 'switch',
          'aria-checked': day.rest ? 'true' : 'false',
          'aria-label': 'Rest day',
          onclick: () => { Store.setRest(dkey, !Store.getDay(dkey).rest); UI.rerenderSheet(build); }
        })
      ]);
      restToggle.querySelector('svg').style.cssText = 'width:20px;height:20px;color:var(--rest);flex:none';

      body.append(el('div', { class: 'stack' }, [titleField, restToggle]));

      if (day.rest) {
        body.append(el('div', { class: 'empty', style: 'margin-top:16px' }, [
          svg(ICON.moon, { fill: 'currentColor' }),
          el('h3', { text: 'Marked as a rest day' }),
          el('p', { text: 'Turn the toggle off, or just add an exercise, to make it a training day again.' }),
          el('button', {
            class: 'btn btn--primary', type: 'button',
            onclick: () => openPicker(dkey, build)
          }, [svg(ICON.plus, { width: 2.2 }), 'Add an exercise'])
        ]));
        body.append(footerActions(dkey, build));
        return;
      }

      /* Exercises */
      body.append(el('div', { class: 'sechead' }, [
        el('h2', { text: 'Exercises' }),
        el('span', { class: 'sechead__hint', text: day.exercises.length ? `${day.exercises.length} added` : 'none yet' })
      ]));

      if (!day.exercises.length) {
        body.append(el('div', { class: 'empty' }, [
          svg(ICON.dumbbell, { width: 1.9 }),
          el('h3', { text: 'No exercises yet' }),
          el('p', { text: 'Pick from 302 exercises, then set your own sets, reps and weight.' })
        ]));
      } else {
        const list = el('div', { class: 'stack' });
        day.exercises.forEach((item, i) => list.append(editRow(dkey, item, i, day.exercises.length, build)));
        body.append(list);
      }

      body.append(el('button', {
        class: 'btn btn--primary btn--block btn--lg', type: 'button', style: 'margin-top:14px',
        onclick: () => openPicker(dkey, build)
      }, [svg(ICON.plus, { width: 2.2 }), 'Add exercise']));

      body.append(footerActions(dkey, build));
    };

    UI.openSheet(Store.DAY_NAMES[dkey], build, { onClose: renderAll });
  }

  function editRow(dkey, item, index, count, rebuild) {
    const ex = Catalog.get(item.slug);
    const type = Catalog.typeOf(item.slug);

    const row = el('div', { class: 'editrow' });
    const main = el('div', { class: 'editrow__main' }, [
      el('div', { class: 'editrow__name', text: ex?.n || item.slug }),
      el('div', { class: 'editrow__meta', text: [ex?.p, ex?.q, type.label].filter(Boolean).join(' · ') })
    ]);

    /* metric steppers, chosen by the exercise's own type */
    const metrics = el('div', { class: 'metrics' });
    for (const key of type.metrics) {
      metrics.append(stepper(key, item[key] ?? Catalog.METRICS[key].min, v => {
        Store.updateExercise(dkey, item.uid, { [key]: v });
      }));
    }
    metrics.append(stepper('restSec', item.restSec ?? 60, v => {
      Store.updateExercise(dkey, item.uid, { restSec: v });
    }));
    main.append(metrics);

    const ctl = el('div', { class: 'editrow__ctl' }, [
      el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'Move up', disabled: index === 0,
        onclick: () => { Store.moveExercise(dkey, item.uid, -1); rebuild && UI.rerenderSheet(rebuild); }
      }, svg(ICON.up, { width: 2.1 })),
      el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'Move down', disabled: index === count - 1,
        onclick: () => { Store.moveExercise(dkey, item.uid, 1); rebuild && UI.rerenderSheet(rebuild); }
      }, svg(ICON.down, { width: 2.1 })),
      el('button', {
        class: 'iconbtn iconbtn--danger', type: 'button', 'aria-label': `Remove ${ex?.n || 'exercise'}`,
        onclick: () => {
          Store.removeExercise(dkey, item.uid);
          UI.toast('Removed');
          rebuild && UI.rerenderSheet(rebuild);
        }
      }, svg(ICON.trash, { width: 1.9 }))
    ]);

    row.append(figure(item.slug), main, ctl);
    return row;
  }

  function footerActions(dkey, rebuild) {
    const others = Store.DAYS.filter(d => d !== dkey);
    const wrap = el('div', { style: 'margin-top:22px;padding-top:18px;border-top:1px solid var(--line-soft)' });

    wrap.append(el('div', { class: 'eyebrow', style: 'margin-bottom:10px', text: 'Copy this day to' }));
    const chips = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' });
    for (const d of others) {
      chips.append(el('button', {
        class: 'chip', type: 'button',
        onclick: () => {
          if (!confirm(`Replace ${Store.DAY_NAMES[d]} with a copy of ${Store.DAY_NAMES[dkey]}?`)) return;
          Store.copyDay(dkey, d);
          UI.toast(`Copied to ${Store.DAY_NAMES[d]}`);
        }
      }, Store.DAY_NAMES[d]));
    }
    wrap.append(chips);

    if (Store.getDay(dkey).exercises.length) {
      wrap.append(el('button', {
        class: 'btn btn--danger btn--block', type: 'button', style: 'margin-top:16px',
        onclick: () => confirmAction(`Clear ${Store.DAY_NAMES[dkey]}`, `Remove all ${Store.getDay(dkey).exercises.length} exercises from ${Store.DAY_NAMES[dkey]}? This can't be undone.`, 'Clear day', () => {
          Store.clearDay(dkey);
          UI.toast('Day cleared');
          rebuild && UI.rerenderSheet(rebuild);
        })
      }, [svg(ICON.trash, { width: 1.9 }), 'Clear this day']));
    }
    return wrap;
  }

  /* ══════════════════════════════════════════════════════════
     EXERCISE PICKER (sheet)
     ══════════════════════════════════════════════════════════ */
  function openPicker(dkey, backToEditor) {
    let query = '';
    let muscle = null;
    let equipment = null;

    const build = body => {
      const search = el('div', { class: 'searchwrap' }, [
        svg(ICON.search, { width: 2 }),
        el('input', {
          class: 'input', type: 'search', value: query,
          placeholder: 'Search 302 exercises…', 'aria-label': 'Search exercises',
          autocomplete: 'off'
        })
      ]);
      const input = search.querySelector('input');

      const muscleBar = el('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by muscle' });
      const equipBar  = el('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by equipment' });
      const results   = el('div', { class: 'pickgrid' });
      const count     = el('div', { class: 'pickcount', role: 'status' });

      const chipFor = (label, value, active, onPick) => el('button', {
        class: 'chip', type: 'button', 'aria-pressed': active ? 'true' : 'false',
        onclick: () => { onPick(active ? null : value); paint(); }
      }, label);

      function buildFilters() {
        clear(muscleBar); clear(equipBar);
        muscleBar.append(chipFor('All muscles', null, muscle === null, () => { muscle = null; }));
        for (const m of Catalog.taxonomy.muscles) {
          muscleBar.append(chipFor(m, m, muscle === m, v => { muscle = v; }));
        }
        equipBar.append(chipFor('Any kit', null, equipment === null, () => { equipment = null; }));
        for (const q of Catalog.taxonomy.equipment) {
          equipBar.append(chipFor(q, q, equipment === q, v => { equipment = v; }));
        }
      }

      function paint() {
        buildFilters();
        const found = Catalog.search(query, { muscle, equipment, limit: 80 });
        clear(results);
        count.textContent = found.length
          ? `${found.length}${found.length === 80 ? '+' : ''} exercise${found.length === 1 ? '' : 's'}`
          : 'No matches';

        if (!found.length) {
          results.append(el('div', { class: 'empty' }, [
            svg(ICON.search, { width: 2 }),
            el('h3', { text: 'Nothing found' }),
            el('p', { text: 'Try a different word, or clear the filters above.' })
          ]));
          return;
        }

        for (const ex of found) {
          results.append(el('button', {
            class: 'pickrow', type: 'button',
            onclick: () => {
              Store.addExercise(dkey, ex.s);
              UI.toast(`${ex.n} added to ${Store.DAY_NAMES[dkey]}`);
            }
          }, [
            figure(ex.s),
            el('div', { class: 'pickrow__main' }, [
              el('div', { class: 'pickrow__name', text: ex.n }),
              el('div', { class: 'pickrow__meta',
                text: [ex.p, ex.q, Catalog.TYPES[ex.t]?.label].filter(Boolean).join(' · ') })
            ]),
            el('span', { class: 'pickrow__add' }, svg(ICON.plus, { width: 2.6 }))
          ]));
        }
      }

      // Repaint synchronously. Filtering 302 items costs well under a
      // frame, and a debounce would let the list reshuffle under a
      // finger that is already coming down on a row.
      input.addEventListener('input', () => {
        query = input.value;
        paint();
      });

      body.append(search, muscleBar, equipBar, count, results);
      paint();
    };

    // Closing the picker returns you to the day editor, not the whole way out.
    UI.openSheet('Add exercise', build, {
      onClose: () => {
        if (backToEditor) UI.openSheet(Store.DAY_NAMES[dkey], backToEditor, { onClose: renderAll });
        else renderAll();
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     MEALS — timestamped photos for the coach
     ══════════════════════════════════════════════════════════ */
  let mealUrls = [];
  let mealsPass = 0;

  async function renderMeals() {
    const pass = ++mealsPass;
    let meals;
    try {
      meals = await Meals.all();
    } catch (err) {
      console.error(err);
      meals = null;
    }
    // a newer render started while this one was reading the database
    if (pass !== mealsPass || current !== 'meals') return;

    mealUrls.forEach(u => URL.revokeObjectURL(u));
    mealUrls = [];
    const root = clear(views.meals);
    const now = new Date();
    const today = Store.iso(now);

    if (!meals) {
      root.append(el('div', { class: 'empty' }, [
        el('h3', { text: 'Meal photos are unavailable' }),
        el('p', { text: 'This browser is blocking on-device storage, so photos cannot be kept. Try outside private browsing.' })
      ]));
      return;
    }

    const todays = meals.filter(m => m.date === today);
    root.append(el('div', { class: 'hero' }, [
      el('div', { class: 'hero__meta' }, [
        el('div', { class: 'hero__date', text: fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long' }) }),
        el('h2', { class: 'hero__title', text: 'Meal check-in' }),
        el('p', { class: 'hero__sub', html: todays.length
          ? `<b>${todays.length}</b> meal${todays.length === 1 ? '' : 's'} today · last at <b>${Meals.timeOf(new Date(todays[0].ts))}</b>`
          : 'Snap each meal as you eat it. The time is stamped onto the photo.' })
      ]),
      el('img', { class: 'hero__mascot', src: 'mascot/meal-plan.png', alt: '', width: 326, height: 300, decoding: 'async' })
    ]));

    root.append(el('button', { class: 'btn btn--primary btn--block btn--lg', type: 'button', style: 'margin-top:14px',
      onclick: snapMeal }, [svg(Meals.ICON_CAMERA, { width: 1.9 }), 'Snap a meal']));

    root.append(mealPlanCard());

    const byDate = new Map();
    for (const m of meals) {
      if (!byDate.has(m.date)) byDate.set(m.date, []);
      byDate.get(m.date).push(m);
    }
    if (!byDate.has(today)) byDate.set(today, []);
    const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a)).slice(0, 14);

    for (const date of dates) {
      const list = byDate.get(date);
      const d = new Date(date + 'T12:00:00');
      root.append(el('div', { class: 'sechead' }, [
        el('h2', { text: date === today ? 'Today' : fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' }) }),
        list.length ? el('button', { class: 'chip chip--sm', type: 'button',
          onclick: () => Meals.share(list) }, list.length > 1 ? `Send all ${list.length}` : 'Send') : null
      ]));
      if (!list.length) {
        root.append(el('div', { class: 'empty' }, [
          svg(Meals.ICON_CAMERA, { width: 1.7 }),
          el('h3', { text: 'No meals yet today' }),
          el('p', { text: 'Your coach sees the exact time each photo was taken.' })
        ]));
        continue;
      }
      const grid = el('div', { class: 'mealgrid' });
      for (const m of list) {
        const url = URL.createObjectURL(m.blob);
        mealUrls.push(url);
        const time = Meals.timeOf(new Date(m.ts));
        grid.append(el('button', { class: 'mealcard', type: 'button', 'aria-label': `Meal at ${time}`,
          onclick: () => openMeal(m) }, [
          el('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' }),
          el('span', { class: 'mealcard__meta' }, [el('strong', { class: 'num', text: time })])
        ]));
      }
      root.append(grid);
    }

    root.append(el('p', { class: 'credit', text: 'Photos come from the live camera only — not your gallery — and stay on this device until you send them.' }));
  }

  /** 1 → "1st", 2 → "2nd", 11 → "11th" … */
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

  /** The day's planned meals, read-only; editing happens in a sheet. */
  function mealPlanCard() {
    const plan = Store.getMealPlan().map(t => t.trim());
    const wrap = el('section', { 'aria-labelledby': 'mealplan-title' }, [
      el('div', { class: 'sechead' }, [
        el('h2', { id: 'mealplan-title', text: 'Meal plan' }),
        plan.length ? el('button', { class: 'chip chip--sm', type: 'button', onclick: openMealPlanEditor }, 'Edit') : null
      ])
    ]);
    if (!plan.length) {
      wrap.append(el('div', { class: 'empty' }, [
        el('h3', { text: 'No meal plan yet' }),
        el('p', { text: 'Write down what each meal of the day should be, so you can check it before you eat.' }),
        el('button', { class: 'btn btn--primary', type: 'button', onclick: openMealPlanEditor },
          [svg(ICON.plus, { width: 2.2 }), 'Add your meals'])
      ]));
      return wrap;
    }
    wrap.append(el('ol', { class: 'card mealplan' }, plan.map((text, i) => el('li', { class: 'mealplan__row' }, [
      el('span', { class: 'mealplan__n', text: `${ordinal(i + 1)} meal` }),
      el('span', { class: 'mealplan__food' + (text ? '' : ' is-empty'), text: text || 'Not filled in yet' })
    ]))));
    return wrap;
  }

  function openMealPlanEditor() {
    const build = body => {
      const plan = Store.getMealPlan();
      body.append(el('p', { class: 'sheet__lede', text: 'One line per meal, in the order you eat them. It repeats every day.' }));
      const list = el('div', { class: 'stack', style: 'margin-top:14px' });
      plan.forEach((text, i) => {
        const id = `meal-${i}`;
        list.append(el('div', { class: 'field mealplan__edit' }, [
          el('div', { class: 'row' }, [
            el('label', { for: id, style: 'flex:1', text: `${ordinal(i + 1)} meal` }),
            el('button', { class: 'iconbtn iconbtn--danger', type: 'button', 'aria-label': `Remove ${ordinal(i + 1)} meal`,
              onclick: () => { Store.removeMeal(i); UI.rerenderSheet(build); } }, svg(ICON.trash, { width: 1.9 }))
          ]),
          el('textarea', { class: 'input', id, rows: 2, placeholder: 'e.g. 160g chicken breast, 100g rice, 2 okra',
            oninput: e => Store.setMeal(i, e.target.value) }, text)
        ]));
      });
      body.append(list);
      body.append(el('button', { class: 'btn btn--block', type: 'button', style: 'margin-top:14px',
        onclick: () => {
          Store.addMeal();
          UI.rerenderSheet(build);
          const fields = document.querySelectorAll('#sheet-body textarea');
          fields[fields.length - 1]?.focus();
        } }, [svg(ICON.plus, { width: 2.2 }), `Add ${ordinal(plan.length + 1)} meal`]));
      body.append(el('button', { class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:8px',
        onclick: UI.closeSheet }, 'Done'));
    };
    // a fresh plan starts with one blank meal to type into
    if (!Store.getMealPlan().length) Store.addMeal();
    UI.openSheet('Meal plan', build, {
      onClose: () => {
        // drop meals left blank, so the plan never shows empty rows
        for (let i = Store.getMealPlan().length - 1; i >= 0; i--) {
          if (!Store.getMealPlan()[i].trim()) Store.removeMeal(i);
        }
        renderAll();
      }
    });
  }

  async function snapMeal() {
    const meal = await Meals.capture();
    renderAll();
    if (meal) openMeal(meal, { fresh: true });
  }

  function openMeal(meal, { fresh = false } = {}) {
    const url = URL.createObjectURL(meal.blob);
    UI.openSheet(fresh ? 'Meal saved' : 'Meal', body => {
      body.append(
        el('img', { class: 'mealview', src: url, alt: `Meal photo, stamped ${Meals.stampText(meal.ts)}` }),
        el('p', { class: 'mealview__stamp num', text: Meals.stampText(meal.ts) }),
        el('div', { class: 'stack', style: 'margin-top:14px' }, [
          el('button', { class: 'btn btn--primary btn--block btn--lg', type: 'button',
            onclick: () => Meals.share([meal]) }, [svg(Meals.ICON_SHARE, { width: 2 }), 'Send to coach']),
          el('button', { class: 'btn btn--block', type: 'button',
            onclick: () => Meals.saveToGallery([meal]) }, [svg(ICON.install, { width: 2 }), 'Save to gallery']),
          el('button', { class: 'btn btn--danger btn--block', type: 'button',
            onclick: () => confirmAction('Delete photo', `Delete the meal photo from ${Meals.stampText(meal.ts)}?`, 'Delete', async () => {
              await Meals.remove(meal.id);
              UI.closeSheet();
              UI.toast('Photo deleted');
            }) }, [svg(ICON.trash, { width: 1.9 }), 'Delete'])
        ])
      );
    }, { onClose: () => { URL.revokeObjectURL(url); renderAll(); } });
  }

  /* ══════════════════════════════════════════════════════════
     PROGRESS
     ══════════════════════════════════════════════════════════ */
  function renderStats() {
    const root = clear(views.stats);
    const week = Store.weekSummary();
    const doneDays = week.filter(c => c.status === 'done').length;
    const plannedDays = week.filter(c => c.status !== 'rest' && c.total > 0).length;
    const setsThisWeek = week.reduce((s, c) => s + c.done, 0);
    const volume = Store.weekVolume();

    root.append(el('div', { class: 'sechead', style: 'margin-top:2px' }, [
      el('h2', { text: 'This week' }),
      el('span', { class: 'sechead__hint',
        text: `${fmtDate(Store.mondayOf(), { day: 'numeric', month: 'short' })} – ${fmtDate(week[4].dateObj, { day: 'numeric', month: 'short' })}` })
    ]));

    /* Mon–Fri strip */
    const strip = el('div', { class: 'weekstrip' });
    for (const cell of week) {
      const label = cell.status === 'rest' ? 'Rest'
        : cell.status === 'done' ? '100%'
        : cell.status === 'part' ? `${cell.pct}%`
        : '—';
      strip.append(el('div', { class: 'weekstrip__cell' }, [
        el('div', { class: 'weekstrip__dow', text: cell.key }),
        el('div', {
          class: 'weekstrip__dot num', dataset: { s: cell.status },
          text: label,
          title: `${Store.DAY_NAMES[cell.key]} — ${cell.title}`
        })
      ]));
    }
    root.append(el('div', { class: 'card', style: 'padding:15px' }, [strip]));

    /* Stat tiles */
    root.append(el('div', { class: 'statgrid', style: 'margin-top:11px' }, [
      el('div', { class: 'stat' }, [
        el('div', { class: 'stat__val' }, [`${doneDays}`, el('small', { text: ` / ${plannedDays || 0}` })]),
        el('div', { class: 'stat__label', text: 'Days completed' })
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'stat__val', text: String(setsThisWeek) }),
        el('div', { class: 'stat__label', text: 'Sets logged' })
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'stat__val' }, [
          volume >= 1000 ? `${(volume / 1000).toFixed(1)}` : String(volume),
          el('small', { text: volume >= 1000 ? ' t' : ' kg' })
        ]),
        el('div', { class: 'stat__label', text: 'Volume lifted' })
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'stat__val', text: String(Store.streak()) }),
        el('div', { class: 'stat__label', text: 'Day streak' })
      ])
    ]));

    /* History */
    const hist = Store.history(30);
    root.append(el('div', { class: 'sechead' }, [
      el('h2', { text: 'Recent sessions' }),
      hist.length ? el('span', { class: 'sechead__hint', text: `${hist.length} logged` }) : null
    ]));

    if (!hist.length) {
      root.append(el('div', { class: 'empty' }, [
        svg(ICON.flame, { fill: 'currentColor' }),
        el('h3', { text: 'No sessions yet' }),
        el('p', { text: 'Log a set on the Today tab and it will show up here.' })
      ]));
    } else {
      const card = el('div', { class: 'card' });
      for (const r of hist) {
        const d = new Date(r.date + 'T12:00:00');
        card.append(el('div', { class: 'histrow' }, [
          el('div', { class: 'histrow__date', text: fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' }) }),
          el('div', { class: 'histrow__title', text: r.log.title || Store.DAY_NAMES[r.log.day] || '—' }),
          el('div', { class: 'histrow__pct num', text: `${r.pct}%` })
        ]));
      }
      root.append(card);
    }

    root.append(creditNote());
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS (sheet)
     ══════════════════════════════════════════════════════════ */
  function openSettings() {
    const build = body => {
      const toggleCard = (title, desc, key) => {
        const card = el('div', { class: 'card', style: 'display:flex;align-items:center;gap:13px;padding:14px' }, [
          el('div', { style: 'flex:1' }, [
            el('div', { style: 'font-weight:650;font-size:.9rem', text: title }),
            el('div', { style: 'font-size:.76rem;color:var(--text-dim);margin-top:2px', text: desc })
          ]),
          el('button', {
            class: 'switch', type: 'button', role: 'switch',
            'aria-checked': Store.settings[key] ? 'true' : 'false', 'aria-label': title,
            onclick: e => {
              const v = !Store.settings[key];
              Store.setSetting(key, v);
              e.currentTarget.setAttribute('aria-checked', v ? 'true' : 'false');
            }
          })
        ]);
        return card;
      };

      body.append(el('div', { class: 'stack' }, [
        toggleCard('Rest timer', 'Count down between sets automatically.', 'restTimer'),
        toggleCard('Chime', 'Play a sound when the rest timer ends.', 'sound')
      ]));

      body.append(el('div', { class: 'sechead' }, [el('h2', { text: 'Your data' })]));
      body.append(el('div', { class: 'stack' }, [
        el('button', { class: 'btn btn--block', type: 'button', onclick: exportData },
          [svg(ICON.install, { width: 2 }), 'Export plan & history (JSON)']),
        el('button', { class: 'btn btn--block', type: 'button', onclick: importData },
          [svg(ICON.copy, { width: 1.8 }), 'Import from a backup file']),
        el('button', { class: 'btn btn--danger btn--block', type: 'button',
          onclick: () => {
            if (!confirm('Reset the plan and delete all logged history? This cannot be undone.')) return;
            Store.resetAll();
            UI.closeSheet();
            UI.toast('Everything reset');
          } }, [svg(ICON.trash, { width: 1.9 }), 'Reset everything'])
      ]));

      body.append(el('p', {
        class: 'credit',
        html: 'Everything is stored on this device only — nothing is uploaded. Exercise artwork from '
            + '<a href="https://github.com/bryllim/workout-guide" target="_blank" rel="noopener">workout-guide</a> '
            + 'by Bryl Lim, CC BY-SA 4.0, derived from Everkinetic.'
      }));
    };
    UI.openSheet('Settings', build, { onClose: renderAll });
  }

  function exportData() {
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `${APP.slug}-${Store.iso()}.json` });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    UI.toast('Backup downloaded');
  }

  function importData() {
    const input = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        Store.importJSON(await file.text());
        UI.closeSheet();
        UI.toast('Backup restored');
      } catch {
        UI.toast('That file could not be read');
      }
      input.remove();
    });
    document.body.append(input);
    input.click();
  }

  /* ══════════════════════════════════════════════════════════
     Shared chrome
     ══════════════════════════════════════════════════════════ */
  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  /* iPadOS 13+ reports itself as a Mac, so test for touch as well. */
  const isIOS = () =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* Safari gives no install API — walk the user through Share ▸ Add to Home Screen. */
  function showIOSInstallHelp() {
    UI.openSheet('Add to Home Screen', body => {
      body.append(
        el('p', { class: 'sheet__lede', text: `iPhone and iPad install apps from the Share menu — ${APP.name} is added the same way.` }),
        el('ol', { class: 'howto' }, [
          el('li', {}, [el('strong', { text: 'Tap Share' }), ' in the Safari toolbar (the square with an arrow).']),
          el('li', {}, [el('strong', { text: 'Choose "Add to Home Screen"' }), ' — scroll down if you do not see it.']),
          el('li', {}, [el('strong', { text: 'Tap Add' }), '. It opens full screen and works offline.'])
        ]),
        el('p', { class: 'howto__note', text: 'Safari only — Chrome and Firefox on iOS cannot install web apps.' })
      );
    });
  }

  function installBar() {
    if (!installPrompt) return null;
    return el('div', { class: 'installbar' }, [
      svg(ICON.install, { width: 2 }),
      el('p', { text: `Install ${APP.name} for full-screen use and offline access.` }),
      el('button', {
        class: 'chip', type: 'button',
        onclick: async () => {
          const p = installPrompt;
          installPrompt = null;
          p.prompt();
          await p.userChoice;
          renderAll();
        }
      }, 'Install')
    ]);
  }

  function creditNote() {
    return el('p', {
      class: 'credit',
      html: '302 exercises · artwork from '
          + '<a href="https://github.com/bryllim/workout-guide" target="_blank" rel="noopener">workout-guide</a>'
          + ' (CC BY-SA 4.0)'
    });
  }

  /* ══════════════════════════════════════════════════════════
     Routing
     ══════════════════════════════════════════════════════════ */
  const RENDER = { today: renderToday, week: renderWeek, meals: renderMeals, stats: renderStats };

  /* Move the tab-bar indicator onto the active tab. Measured from
     the live boxes rather than assuming three equal thirds, so it
     stays correct if the labels or bar padding ever change. */
  const tabbar = document.querySelector('.tabbar');
  const pill = document.querySelector('.tabbar__pill');

  function movePill() {
    const active = tabbar.querySelector('.tab[aria-current="page"]');
    if (!active) return;
    pill.style.setProperty('--pill-x', `${active.offsetLeft}px`);
    pill.style.setProperty('--pill-y', `${active.offsetTop}px`);
    pill.style.setProperty('--pill-w', `${active.offsetWidth}px`);
    pill.style.setProperty('--pill-h', `${active.offsetHeight}px`);
    // reveal only after the first real measurement, so it does not
    // fly in from the corner on load
    tabbar.classList.add('is-ready');
  }

  function go(name, { push = true } = {}) {
    if (!RENDER[name]) name = 'today';
    current = name;
    for (const [key, node] of Object.entries(views)) node.hidden = key !== name;
    // lets CSS hide the plan-only header on phones, where it fills the screen
    document.getElementById('main').dataset.view = name;
    RENDER[name]();
    renderTrainingSummary();
    for (const tab of document.querySelectorAll('.tab')) {
      const on = tab.dataset.nav === name;
      if (on) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
    movePill();
    if (push && location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
    window.scrollTo({ top: 0 });
  }

  const renderAll = () => { RENDER[current]?.(); renderTrainingSummary(); };

  /* ══════════════════════════════════════════════════════════
     Theme
     ══════════════════════════════════════════════════════════ */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.content = theme === 'light' ? '#F1F4F1' : '#141615';
  }

  /* ══════════════════════════════════════════════════════════
     Boot
     ══════════════════════════════════════════════════════════ */
  async function boot() {
    Store.load();
    applyTheme(Store.settings.theme || 'dark');

    try {
      await Catalog.load();
    } catch (err) {
      console.error(err);
      views.today.hidden = false;
      views.today.append(el('div', { class: 'empty' }, [
        el('h3', { text: 'Could not load the exercise library' }),
        el('p', { text: 'Serve this folder over http (not file://) so data/exercises.json can be fetched, then reload.' })
      ]));
      return;
    }

    document.getElementById('btn-theme').addEventListener('click', () => {
      const next = (Store.settings.theme === 'light') ? 'dark' : 'light';
      Store.setSetting('theme', next);
      applyTheme(next);
    });
    document.getElementById('btn-settings').addEventListener('click', openSettings);

    for (const tab of document.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => go(tab.dataset.nav));
    }

    window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'today', { push: false }));

    // Re-render on wake, so a session left open overnight shows the right day.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });

    // the indicator is measured, so it has to follow the bar's geometry
    window.addEventListener('resize', movePill);
    window.addEventListener('orientationchange', movePill);
    if (document.fonts?.ready) document.fonts.ready.then(movePill);

    go(location.hash.slice(1) || 'week', { push: false });

    /* PWA — the install affordance lives in the app bar so it is
       reachable from every view, not just Today. */
    const installBtn = document.getElementById('btn-install');
    const showInstall = show => { if (installBtn) installBtn.hidden = !show; };

    if (!isStandalone()) {
      if (isIOS()) {
        // Safari has no beforeinstallprompt — the user has to do it by hand,
        // so the button explains how instead of prompting.
        showInstall(true);
        installBtn?.addEventListener('click', showIOSInstallHelp);
      } else {
        installBtn?.addEventListener('click', async () => {
          const p = installPrompt;
          if (!p) return;
          installPrompt = null;
          showInstall(false);
          p.prompt();
          await p.userChoice;
          renderAll();
        });
      }
    }

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      installPrompt = e;
      showInstall(true);
      renderAll();
    });

    window.addEventListener('appinstalled', () => {
      installPrompt = null;
      showInstall(false);
      renderAll();
      UI.toast('Installed — open it from your home screen');
    });

    // boot() awaits the catalog, so `load` has usually fired by now —
    // registering on that event alone would silently never happen.
    if ('serviceWorker' in navigator) {
      const register = () => navigator.serviceWorker
        .register('sw.js')
        .catch(err => console.warn('Service worker registration failed', err));
      if (document.readyState === 'complete') register();
      else window.addEventListener('load', register, { once: true });
    }
  }

  boot();
})();
