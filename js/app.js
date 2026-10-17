/* ═══════════════════════════════════════════════════════════
   App — views, routing, wiring.
   ═══════════════════════════════════════════════════════════ */

(() => {
  const { el, svg, ICON, clear, add, figure, ring, stepper } = UI;

  /** Single source for the product name — used in file names and copy. */
  const APP = { name: 'BAW', version: '1.0', slug: 'baw-fitness-tracker' };

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
        }, [svg(ICON.calendar, { width: 1.9 }), 'Edit this day'])
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

    // the moving figure leads the card, big enough to read mid-workout
    card.append(
      el('div', { class: 'excard__media' }, [
        figure(item.slug),
        el('span', { class: 'excard__count num', text: `${done}/${sets}` }),
        el('span', { class: 'excard__progress', 'aria-hidden': 'true' }, el('span', { style: `width:${(done / sets) * 100}%` }))
      ]),
      el('div', { class: 'excard__body' }, [
        el('div', { class: 'excard__name', text: ex?.n || item.slug }),
        el('div', { class: 'excard__tags' }, [
          ex?.p ? el('span', { class: 'tag', text: ex.p }) : null,
          ex?.q ? el('span', { class: 'tag', text: ex.q }) : null
        ]),
        el('div', { class: 'excard__target', html: `Target &nbsp;<b>${Catalog.summarise(item)}</b>` })
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

  /* ══════════════════════════════════════════════════════════
     WEEK / PLAN
     ══════════════════════════════════════════════════════════ */
  function renderWeek() {
    const root = clear(views.week);
    renderTrainingSummary();
    const keys = Store.DAYS;
    const names = Store.DAY_NAMES;
    const tabs = el('div', { class: 'plan-tabs', role: 'tablist', 'aria-label': 'Training days' });
    for (const key of keys) {
      const day = Store.getDay(key);
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
    const day = Store.getDay(dkey);
    const board = el('section', { class: 'day-board', id: 'day-board', role: 'tabpanel', 'aria-labelledby': `day-tab-${dkey}` });
    board.append(el('div', { class: 'day-board__head' }, [
      el('div', {}, [el('span', { class: 'day-label', text: dkey }), el('h2', { text: names[dkey] }),
        el('p', { text: day.rest ? 'Rest and recovery' : `${day.exercises.length} exercises${day.title && day.title !== names[dkey] ? ` · ${day.title}` : ''}` }),
        el('button', { class: 'session-edit', type: 'button', onclick: () => openDayEditor(dkey) }, 'Edit session')]),
      el('div', { class: 'volume-badge', title: 'Planned sets × reps × weight (kg)' }, [
        el('strong', { text: Math.round(plannedVolume(day)).toLocaleString() }), el('span', { text: 'Volume' })])
    ]));
    if (day.rest) {
      board.append(restCard('Make room for recovery', 'Take a breather. Tap "Make training day" whenever you want to train on this day instead.'));
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
    board.append(el('div', { class: 'day-board__actions' }, [
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
          el('p', { text: `Pick from ${Catalog.all.length} exercises, then set your own sets, reps and weight.` })
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
          placeholder: `Search ${Catalog.all.length} exercises…`, 'aria-label': 'Search exercises',
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

      // Repaint synchronously. Filtering ~300 items costs well under a
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
    Store.upgradeMealPlan(Nutrition.parseLine);
    if (Store.needsDefaultMealPlan()) await loadDefaultMealPlan();
    const saved = await fetchDefaultPlan();
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

    const plan = Store.getMealPlan();
    const offer = saved && plan.length && planKey(saved) !== planKey(plan) && Store.settings.dismissedPlan !== planKey(saved);
    root.append(mealPlanCard(today, offer ? planOffer(saved) : null));

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
        grid.append(el('button', { class: 'mealcard', type: 'button', 'aria-label': `${m.plan?.title || 'Meal'} at ${time}`,
          onclick: () => openMeal(m) }, [
          el('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' }),
          el('span', { class: 'mealcard__meta' }, [
            el('strong', { text: m.plan?.title || 'Meal' }),
            el('span', { class: 'num', text: time })
          ])
        ]));
      }
      root.append(grid);
    }

    root.append(el('p', { class: 'credit', text: 'Photos come from the live camera only — not your gallery — and stay on this device until you send them.' }));
  }

  /** 1 → "1st", 2 → "2nd", 11 → "11th" … */
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const r0 = n => Math.round(n);
  const r1 = n => Math.round(n * 10) / 10;

  /** Today's pick for an either/or item (index into its options). */
  const pickOf = (day, item) => Math.min(day.pick[item.id] ?? 0, item.options.length - 1);
  const mealMacros = (meal, day) => Nutrition.sum(meal.items.map(item => Nutrition.macros(item.options[pickOf(day, item)])));

  /* Protein, carbs and fat each keep one colour everywhere (css --macro-*).
     The ring splits eaten calories between them: 4 / 4 / 9 kcal per gram. */
  const MACROS = [{ key: 'p', label: 'Protein', kcal: 4 }, { key: 'c', label: 'Carbs', kcal: 4 }, { key: 'f', label: 'Fat', kcal: 9 }];
  const mdot = key => el('span', { class: `mdot mdot--${key}`, 'aria-hidden': 'true' });

  /** Each macro's share of calories, or nulls when nothing is eaten yet. */
  function kcalShare(m) {
    const total = MACROS.reduce((s, x) => s + m[x.key] * x.kcal, 0);
    return Object.fromEntries(MACROS.map(x => [x.key, total ? (m[x.key] * x.kcal) / total : null]));
  }

  function macroDonut(eaten, planned) {
    const R = 46, W = 13, C = 2 * Math.PI * R, GAP = 2.5;
    const share = kcalShare(eaten);
    const parts = MACROS.filter(x => share[x.key] > 0);
    let offset = 0;
    const arcs = parts.map(x => {
      const len = share[x.key] * C;
      const draw = Math.max(0, len - (parts.length > 1 ? GAP : 0));
      const arc = `<circle class="donut__arc donut__arc--${x.key}" cx="60" cy="60" r="${R}" stroke-width="${W}"
        stroke-dasharray="${draw.toFixed(2)} ${(C - draw).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}">
        <title>${x.label}: ${r0(eaten[x.key])} g · ${r0(share[x.key] * 100)}% of calories</title></circle>`;
      offset += len;
      return arc;
    }).join('');
    const wrap = el('figure', { class: 'donut', 'aria-label': parts.length
      ? `Calories eaten today: ${r0(eaten.kcal)} of ${r0(planned.kcal)}. ` + MACROS.map(x => `${x.label} ${r0((share[x.key] || 0) * 100)}%`).join(', ')
      : 'Nothing eaten yet today' });
    wrap.innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="donut__track" cx="60" cy="60" r="${R}" stroke-width="${W}"></circle>${arcs}</svg>`;
    wrap.append(el('figcaption', { class: 'donut__center' }, [
      el('strong', { class: 'num', text: r0(eaten.kcal).toLocaleString() }),
      el('span', { class: 'num', text: `of ${r0(planned.kcal).toLocaleString()} kcal` })
    ]));
    return wrap;
  }

  /** Today's meals: totals, a done-check per meal, and the either/or picks. */
  function mealPlanCard(date, offer = null) {
    const plan = Store.getMealPlan();
    const day = Store.mealDay(date);
    const wrap = el('section', { 'aria-labelledby': 'mealplan-title' }, [
      el('div', { class: 'sechead' }, [
        el('h2', { id: 'mealplan-title', text: "Today's meals" }),
        plan.length ? el('button', { class: 'chip chip--sm', type: 'button', onclick: openMealPlanEditor }, 'Edit plan') : null
      ]),
      offer
    ]);
    if (!plan.length) {
      wrap.append(el('div', { class: 'empty' }, [
        el('h3', { text: 'No meal plan yet' }),
        el('p', { text: 'Add your meals and the foods in each. You will see protein, carbs, fat and calories, and tick meals off as you eat them.' }),
        el('div', { class: 'row', style: 'justify-content:center;gap:8px;flex-wrap:wrap' }, [
          el('button', { class: 'btn btn--primary', type: 'button', onclick: openMealPlanEditor },
            [svg(ICON.plus, { width: 2.2 }), 'Build your meal plan']),
          el('button', { class: 'btn', type: 'button', onclick: () => useDefaultMealPlan(renderAll) }, 'Use my default plan')
        ])
      ]));
      return wrap;
    }

    const doneMeals = plan.filter(m => day.done[m.id]);
    const planned = Nutrition.sum(plan.map(m => mealMacros(m, day)));
    const eaten = Nutrition.sum(doneMeals.map(m => mealMacros(m, day)));
    const allDone = doneMeals.length === plan.length;
    wrap.append(el('div', { class: 'card macros' + (allDone ? ' is-done' : '') }, [
      el('div', { class: 'macros__head' }, [
        el('strong', { text: `${doneMeals.length} of ${plan.length} meals done` }),
        el('span', { text: allDone ? 'Plan followed today' : 'Tick each meal when you finish it' })
      ]),
      el('div', { class: 'macros__bar', role: 'progressbar', 'aria-label': 'Meals done today',
        'aria-valuemin': 0, 'aria-valuemax': plan.length, 'aria-valuenow': doneMeals.length },
        el('span', { style: `width:${(doneMeals.length / plan.length) * 100}%` })),
      el('div', { class: 'macros__body' }, [
        macroDonut(eaten, planned),
        el('ul', { class: 'macros__legend', 'aria-label': 'Eaten today' }, MACROS.map(({ key, label }) => {
          const share = kcalShare(eaten)[key];
          return el('li', { class: 'macro' }, [
            mdot(key),
            el('span', { class: 'macro__label', text: label }),
            el('strong', { class: 'num', text: `${r0(eaten[key])}` }),
            el('span', { class: 'macro__of num', text: `of ${r0(planned[key]).toLocaleString()}g` }),
            el('span', { class: 'macro__pct num', text: share == null ? '' : `${r0(share * 100)}%`,
              title: 'Share of calories eaten' })
          ]);
        }))
      ])
    ]));

    plan.forEach((meal, i) => {
      const done = !!day.done[meal.id];
      const m = mealMacros(meal, day);
      const title = `${ordinal(i + 1)} meal`;
      wrap.append(el('article', { class: 'planmeal' + (done ? ' is-done' : ''), 'aria-label': title }, [
        el('div', { class: 'planmeal__head' }, [
          el('button', { class: 'planmeal__check', type: 'button', 'aria-pressed': String(done), 'aria-label': `${title} done`,
            onclick: () => {
              const now = Store.toggleMealDone(date, meal.id);
              if (now && navigator.vibrate) navigator.vibrate(18);
              renderAll();
            } }, svg(ICON.check, { width: 2.8 })),
          el('h3', { text: title }),
          el('span', { class: 'planmeal__sum num', text: `${r0(m.p)}g protein · ${r0(m.kcal)} kcal` })
        ]),
        meal.items.length
          ? el('ul', { class: 'planmeal__foods' }, meal.items.map(item => foodRow(item, day, date)))
          : el('p', { class: 'planmeal__empty', text: 'No foods yet — tap Edit plan.' })
      ]));
    });
    return wrap;
  }

  function foodRow(item, day, date) {
    const pick = pickOf(day, item);
    const opt = item.options[pick];
    const mac = Nutrition.macros(opt);
    const row = el('li', { class: 'food' }, [
      el('span', { class: 'food__name' }, [
        opt.name,
        mac
          ? el('small', { class: 'food__macros num' }, [
              `${r0(mac.kcal)} kcal`,
              el('span', {}, [mdot('c'), `${r1(mac.c)}g carbs`]),
              el('span', {}, [mdot('f'), `${r1(mac.f)}g fat`])
            ])
          : el('small', { text: 'No nutrition data — find it in Edit plan' })
      ]),
      el('span', { class: 'food__amt num', text: Nutrition.amountLabel(opt) }),
      el('span', { class: 'food__p num', 'aria-label': mac ? `${r1(mac.p)} grams protein` : 'Protein unknown' },
        mac ? [mdot('p'), `${r1(mac.p)}g`] : '—')
    ]);
    if (item.options.length > 1) {
      row.append(el('div', { class: 'food__pick', role: 'group', 'aria-label': 'Which one today?' },
        item.options.map((o, j) => el('button', { class: 'chip chip--sm', type: 'button', 'aria-pressed': String(j === pick),
          onclick: () => { Store.pickOption(date, item.id, j); renderAll(); } }, `${Nutrition.amountLabel(o)} ${o.name}`))));
    }
    return row;
  }

  /** A sensible first amount: what this food already uses in the plan, else 1 piece or 100 g. */
  function portion(food) {
    for (const meal of [...Store.getMealPlan()].reverse()) {
      for (const item of meal.items) {
        const used = item.options.find(o => o.food === food.id);
        if (used) return { food: food.id, name: food.name, amount: used.amount, unit: used.unit };
      }
    }
    return { food: food.id, name: food.name, amount: food.piece ? 1 : 100, unit: food.piece ? 'pcs' : 'g' };
  }

  const PRESETS = { g: [50, 100, 150, 160, 200, 250], pcs: [1, 2, 3, 4, 5, 6] };
  const macroLine = m => `${r1(m.p)}g protein · ${r1(m.c)}g carbs · ${r1(m.f)}g fat · ${r0(m.kcal)} kcal`;
  /** "160g chicken breast" → "chicken breast", for searching by name. */
  const stripAmount = q => q.replace(/^\s*\d+(?:[.,]\d+)?\s*(kg|g|grams?|gr|pcs?|pieces?|x)?\.?\s*(of\s+)?/i, '');

  function openMealPlanEditor() {
    const today = Store.iso();
    let focus = null;     // { mealId, itemId? } — where to land when the editor comes back

    const cleanup = () => {
      // drop meals left without food, so the plan never shows empty cards
      for (const meal of [...Store.getMealPlan()]) if (!meal.items.length) Store.removeMeal(meal.id);
      renderAll();
    };

    const reopen = () => {
      UI.openSheet('Meal plan', build, { onClose: cleanup });
      if (!focus) return;
      const { mealId, itemId } = focus;
      focus = null;
      requestAnimationFrame(() => {
        const body = document.getElementById('sheet-body');
        const item = itemId && body.querySelector(`[data-item="${itemId}"]`);
        const target = item || body.querySelector(`[data-meal="${mealId}"] .mealedit__add`);
        target?.scrollIntoView({ block: 'center' });
        item?.classList.add('is-new');
      });
    };

    const addTo = (mealId, title) => {
      focus = { mealId };
      openFoodPicker({
        title: `Add to ${title}`, action: `Add to ${title}`, back: reopen,
        onPick: options => { focus = { mealId, itemId: Store.addFood(mealId, options) }; }
      });
    };

    const alternativeTo = (meal, item) => {
      focus = { mealId: meal.id, itemId: item.id };
      openFoodPicker({
        title: `Or instead of ${item.options[0].name}`, action: 'Add as the other choice', single: true, back: reopen,
        onPick: ([option]) => Store.addAlternative(meal.id, item.id, option)
      });
    };

    const build = body => {
      const plan = Store.getMealPlan();
      const day = Store.mealDay(today);
      body.append(el('p', { class: 'sheet__lede', text: 'Add each food with its amount. Swap foods day to day? Give a food an "or" — you pick one each day.' }));
      plan.forEach((meal, i) => {
        const title = `${ordinal(i + 1)} meal`;
        const m = mealMacros(meal, day);
        const sec = el('section', { class: 'mealedit', 'aria-label': title, dataset: { meal: meal.id } }, [
          el('div', { class: 'mealedit__head' }, [
            el('div', { class: 'mealedit__title' }, [
              el('h3', { text: title }),
              meal.items.length ? el('span', { class: 'mealedit__sum num', text: `${r0(m.p)}g protein · ${r0(m.kcal)} kcal` }) : null
            ]),
            el('button', { class: 'iconbtn iconbtn--danger', type: 'button', 'aria-label': `Remove ${title}`,
              onclick: () => {
                const drop = () => { Store.removeMeal(meal.id); UI.rerenderSheet(build); };
                if (!meal.items.length) return drop();
                confirmAction(`Remove ${title}?`, `Its ${meal.items.length} food${meal.items.length === 1 ? '' : 's'} will be taken out of your plan.`, 'Remove', drop);
              } }, svg(ICON.trash, { width: 1.9 }))
          ])
        ]);
        meal.items.forEach(item => {
          const group = el('div', { class: 'mealedit__item', dataset: { item: item.id } });
          item.options.forEach((opt, j) => {
            if (j) group.append(el('div', { class: 'mealedit__or', text: 'or' }));
            group.append(optionEditor(meal, item, opt, j, build, reopen));
          });
          group.append(el('button', { class: 'linkbtn', type: 'button', onclick: () => alternativeTo(meal, item) },
            item.options.length > 1 ? '+ another choice' : '+ or another food'));
          sec.append(group);
        });
        sec.append(el('button', { class: 'btn btn--block mealedit__add', type: 'button', onclick: () => addTo(meal.id, title) },
          [svg(ICON.plus, { width: 2.2 }), `Add food to ${title}`]));
        body.append(sec);
      });
      body.append(el('button', { class: 'btn btn--block', type: 'button', style: 'margin-top:16px',
        onclick: () => {
          // an empty meal is no use — go straight to picking its first food
          const meal = Store.addMeal();
          addTo(meal.id, `${ordinal(plan.length + 1)} meal`);
        } }, [svg(ICON.plus, { width: 2.2 }), `Add ${ordinal(plan.length + 1)} meal`]));
      body.append(el('button', { class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:8px',
        onclick: UI.closeSheet }, 'Done'));
      body.append(el('button', { class: 'linkbtn', type: 'button', style: 'display:block;margin:14px auto 0',
        onclick: () => confirmAction('Replace your meal plan?', 'Your meals here will be replaced by the default plan (data/meal-plan.json).', 'Replace',
          () => useDefaultMealPlan(() => UI.rerenderSheet(build))) }, 'Replace with my default plan'));
    };

    // a fresh plan starts by picking the first food of the first meal
    if (!Store.getMealPlan().length) {
      addTo(Store.addMeal().id, '1st meal');
      return;
    }
    reopen();
  }

  function optionEditor(meal, item, opt, index, build, reopen) {
    const food = opt.food && Nutrition.get(opt.food);
    const set = patch => Store.updateOption(meal.id, item.id, index, patch);
    const amount = el('input', { class: 'input optedit__amt num', type: 'number', inputmode: 'decimal', min: '0', step: 'any',
      value: String(opt.amount), 'aria-label': `Amount of ${opt.name}` });
    amount.addEventListener('change', () => {
      const v = Number(amount.value);
      if (v > 0) { set({ amount: v }); UI.rerenderSheet(build); } else amount.value = String(opt.amount);
    });
    const unit = food?.piece
      ? el('select', { class: 'select optedit__unit', 'aria-label': `Unit for ${opt.name}`,
          onchange: e => { set({ unit: e.target.value }); UI.rerenderSheet(build); } },
          [['g', 'g'], ['pcs', 'pcs']].map(([v, label]) => el('option', { value: v, selected: v === opt.unit }, label)))
      : el('span', { class: 'optedit__unit', text: 'g' });
    const mac = Nutrition.macros(opt);

    return el('div', { class: 'optedit' }, [
      el('div', { class: 'optedit__name' }, [
        el('strong', { text: opt.name }),
        mac
          ? el('small', { class: 'num', text: `${r1(mac.p)}g protein · ${r0(mac.kcal)} kcal` })
          : el('button', { class: 'linkbtn', type: 'button',
              onclick: () => openFoodPicker({
                title: `Nutrition for ${opt.name}`, initial: opt.name, single: true, skipAmount: true, back: reopen,
                onPick: ([o]) => set({ food: o.food, name: o.name,
                  ...(Nutrition.get(o.food).piece ? {} : { unit: 'g', amount: opt.unit === 'pcs' ? 100 : opt.amount }) })
              }) }, 'Find nutrition')
      ]),
      el('div', { class: 'optedit__qty' }, [amount, unit]),
      el('button', { class: 'iconbtn iconbtn--danger', type: 'button', 'aria-label': `Remove ${opt.name}`,
        onclick: () => { Store.removeOption(meal.id, item.id, index); UI.rerenderSheet(build); } }, svg(ICON.trash, { width: 1.9 }))
    ]);
  }

  /**
   * Pick a food, then its amount. Your foods come first (instant,
   * offline), then the USDA database, or typed-in values. Typing
   * "160g chicken breast" offers a one-tap add. Closing returns to `back`.
   * onPick gets an array of options — several for "2 okra/banana".
   */
  function openFoodPicker({ title, action = 'Add', onPick, back, initial = '', single = false, skipAmount = false }) {
    let query = initial;
    let remote = null;            // null | 'loading' | Error | [results]
    let source = 'mine';          // where foods come from: 'mine' | 'usda' | 'manual'
    let chosen = null;            // the portion being sized, once a food is picked
    let paintRemote = () => {};

    const finish = (options, again = false) => {
      onPick(options);
      if (!again) { UI.closeSheet(); return; }
      UI.toast(`Added ${options.map(o => o.name).join(' or ')}`);
      chosen = null; query = ''; remote = null;
      UI.rerenderSheet(build);
      document.querySelector('#sheet-body input[type="search"]')?.focus();
    };

    const choose = food => {
      if (skipAmount) { finish([portion(food)]); return; }
      chosen = portion(food);
      UI.rerenderSheet(build);
    };

    let searchedFor = '';          // what was actually sent, after spelling correction
    let lookUpRun = 0;
    /** `exact` skips the spelling correction — for when it guessed wrong. */
    async function lookUp(exact = false) {
      const typed = stripAmount(query).trim();
      if (!typed) return;
      const run = ++lookUpRun;
      searchedFor = (exact !== true && Nutrition.correct(typed)) || typed;
      remote = 'loading';
      paintRemote();
      let result;
      try {
        result = await Nutrition.usdaSearch(searchedFor, Store.settings.usdaKey);
      } catch (err) {
        result = err;
      }
      if (run !== lookUpRun) return;     // a newer search has started
      remote = result;
      paintRemote();
    }

    /* Step 2: how much */
    const buildAmount = body => {
      const food = Nutrition.get(chosen.food);
      const preview = el('p', { class: 'portion__preview num', 'aria-live': 'polite' });
      const presets = el('div', { class: 'portion__presets', role: 'group', 'aria-label': 'Quick amounts' });
      const input = el('input', { class: 'input portion__amt num', type: 'number', inputmode: 'decimal', min: '0', step: 'any',
        value: String(chosen.amount), 'aria-label': `Amount of ${food.name}` });

      const paint = () => {
        const m = Nutrition.macros(chosen);
        preview.textContent = m ? macroLine(m) : '';
        presets.replaceChildren(...PRESETS[chosen.unit].map(n => el('button', {
          class: 'chip', type: 'button', 'aria-pressed': String(n === chosen.amount),
          onclick: () => { chosen.amount = n; input.value = String(n); paint(); }
        }, chosen.unit === 'g' ? `${n} g` : `${n}`)));
      };
      input.addEventListener('input', () => { const v = Number(input.value); if (v > 0) { chosen.amount = v; paint(); } });
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && chosen.amount > 0) { e.preventDefault(); finish([{ ...chosen }]); } });

      // switching unit keeps the same portion: 1 egg ⇄ 50 g
      const units = food.piece ? el('div', { class: 'portion__units', role: 'group', 'aria-label': 'Unit' },
        [['g', 'grams'], ['pcs', 'pieces']].map(([u, label]) => el('button', {
          class: 'chip', type: 'button', 'aria-pressed': String(chosen.unit === u),
          onclick: () => {
            if (chosen.unit === u) return;
            chosen.amount = u === 'g' ? r0(chosen.amount * food.piece) : Math.max(0.5, Math.round(chosen.amount / food.piece * 2) / 2);
            chosen.unit = u;
            UI.rerenderSheet(build);
          }
        }, label)))
        : el('span', { class: 'portion__unit', text: 'grams' });

      body.append(
        el('button', { class: 'linkbtn portion__back', type: 'button',
          onclick: () => { chosen = null; UI.rerenderSheet(build); } }, '← Choose a different food'),
        el('div', { class: 'portion' }, [
          el('strong', { class: 'portion__name', text: food.name }),
          el('small', { class: 'num', text: `per 100 g: ${macroLine(food.per100)}${food.piece ? ` · 1 pc ≈ ${food.piece} g` : ''}` }),
          el('div', { class: 'portion__qty' }, [input, units]),
          presets,
          preview
        ]),
        el('button', { class: 'btn btn--primary btn--block btn--lg', type: 'button', onclick: () => finish([{ ...chosen }]) }, action),
        single ? null : el('button', { class: 'btn btn--block', type: 'button', style: 'margin-top:8px',
          onclick: () => finish([{ ...chosen }], true) }, 'Add and pick another')
      );
      paint();
    };

    /* Step 1: which food — from one source at a time */
    const SOURCES = [['mine', 'Your foods'], ['usda', 'USDA database'], ['manual', 'Enter manually']];
    const useSource = key => {
      source = key;
      UI.rerenderSheet(build);
      document.querySelector('#sheet-body input[type="search"]')?.focus();
    };

    const buildSearch = body => {
      body.append(el('div', { class: 'sourcetabs', role: 'tablist', 'aria-label': 'Where to find the food' },
        SOURCES.map(([key, label]) => el('button', {
          class: 'sourcetab', type: 'button', role: 'tab', 'aria-selected': String(source === key),
          onclick: () => { if (source !== key) useSource(key); }
        }, label))));

      if (source === 'manual') {
        body.append(el('p', { class: 'foodlist__note', style: 'margin:14px 0 12px',
          text: 'Copy the values from the package label, per 100 g.' }), manualFoodForm(choose, stripAmount(query)));
        return;
      }

      const input = el('input', { class: 'input', type: 'search', value: query, autocomplete: 'off', enterkeyhint: 'search',
        placeholder: source === 'mine' ? 'Search, or type "160g chicken breast"' : 'Search USDA, e.g. salmon fillet',
        'aria-label': 'Search foods' });
      body.append(el('div', { class: 'searchwrap sourcetabs__search' }, [svg(ICON.search, { width: 2 }), input]));

      if (source === 'mine') {
        const quick = el('div');
        const local = el('div', { class: 'foodlist', style: 'margin-top:12px' });
        let quickPick = null;

        /* "160g chicken breast" / "2 okra/banana" → a ready-made portion */
        const paintQuick = () => {
          clear(quick);
          quickPick = null;
          if (!/^\s*\d/.test(query)) return;
          const opts = Nutrition.parseLine(query).filter(o => o.food);
          const use = single ? opts.slice(0, 1) : opts;
          if (!use.length) return;
          quickPick = use;
          const m = Nutrition.macros(use[0]);
          quick.append(el('button', { class: 'foodpick foodpick--quick', type: 'button', onclick: () => finish(use) }, [
            el('span', { class: 'foodpick__name', text: `Add ${use.map(o => `${Nutrition.amountLabel(o)} ${o.name}`).join(' or ')}` }),
            el('span', { class: 'foodpick__meta num', text: m ? macroLine(m) : '' })
          ]));
        };

        const paintLocal = () => {
          clear(local);
          const q = stripAmount(query).trim();
          const found = Nutrition.search(q).slice(0, 40);
          for (const f of found) {
            local.append(el('button', { class: 'foodpick', type: 'button', onclick: () => choose(f) }, [
              el('span', { class: 'foodpick__name', text: f.name }),
              el('span', { class: 'foodpick__meta num', text: `${r1(f.per100.p)}g protein · ${r0(f.per100.kcal)} kcal / 100 g` })
            ]));
          }
          if (!found.length) {
            local.append(el('p', { class: 'foodlist__note', text: 'Not in your foods yet.' }),
              el('button', { class: 'btn btn--block', type: 'button', onclick: () => { useSource('usda'); lookUp(); } },
                [svg(ICON.search, { width: 2 }), `Search USDA for "${q}"`]));
          }
        };

        input.addEventListener('input', () => { query = input.value; paintQuick(); paintLocal(); });
        input.addEventListener('keydown', e => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (quickPick) finish(quickPick);
          else if (!Nutrition.search(stripAmount(query).trim()).length && stripAmount(query).trim()) { useSource('usda'); lookUp(); }
        });
        body.append(quick, local);
        paintQuick();
        paintLocal();
        return;
      }

      /* USDA */
      const online = el('div', { class: 'foodlist', style: 'margin-top:12px', 'aria-live': 'polite' });
      paintRemote = () => {
        clear(online);
        const q = stripAmount(query).trim();
        if (remote === null) {
          online.append(el('button', { class: 'btn btn--block', type: 'button', disabled: !q, onclick: lookUp },
            [svg(ICON.search, { width: 2 }), q ? `Search USDA for "${q}"` : 'Type a food to search']));
        } else if (remote === 'loading') {
          online.append(el('p', { class: 'foodlist__note', text: 'Searching the USDA food database…' }));
        } else if (remote instanceof Error) {
          online.append(el('p', { class: 'foodlist__note foodlist__note--error', text: remote.kind === 'limit' || remote.kind === 'key'
            ? `${remote.message} Add your free food database key in Settings to search more.`
            : remote.message }));
          online.append(el('button', { class: 'btn btn--block', type: 'button', onclick: lookUp }, 'Try again'));
        } else if (!remote.length) {
          online.append(el('p', { class: 'foodlist__note', text: 'No matches. Try a simpler word, or enter the values manually.' }));
        } else {
          if (searchedFor.toLowerCase() !== q.toLowerCase()) {
            online.append(el('p', { class: 'foodlist__note' }, [
              `Showing results for "${searchedFor}". `,
              el('button', { class: 'linkbtn', type: 'button', style: 'padding:0', onclick: () => lookUp(true) }, `Search for "${q}" instead`)
            ]));
          }
          for (const r of remote) {
            online.append(el('button', { class: 'foodpick', type: 'button', onclick: () => {
              const id = Store.saveFood({ id: `usda-${r.fdcId}`, name: r.name, per100: r.per100, source: 'usda', fdcId: r.fdcId });
              choose(Nutrition.get(id));
            } }, [
              el('span', { class: 'foodpick__name', text: r.name }),
              el('span', { class: 'foodpick__meta num', text: `${r1(r.per100.p)}g protein · ${r0(r.per100.kcal)} kcal / 100 g · ${r.kind}` })
            ]));
          }
        }
      };
      // with your own key, results follow your typing; the shared demo key
      // allows only a few searches an hour, so it waits for a tap
      let typingTimer = null;
      input.addEventListener('input', () => {
        query = input.value;
        remote = null;
        lookUpRun++;
        paintRemote();
        clearTimeout(typingTimer);
        if (Store.settings.usdaKey && stripAmount(query).trim().length >= 3) typingTimer = setTimeout(lookUp, 600);
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(typingTimer); lookUp(); } });
      body.append(online);
      if (!Store.settings.usdaKey) {
        body.append(el('p', { class: 'foodlist__hint', text: 'Using the shared demo key, which allows only a few searches an hour. Add your own free key in Settings.' }));
      }
      paintRemote();
    };

    const build = body => (chosen ? buildAmount : buildSearch)(body);
    UI.openSheet(title, build, { onClose: back });
  }

  /** Values from a package label, per 100 g. */
  function manualFoodForm(choose, name) {
    const field = (id, label, attrs = {}) => el('div', { class: 'field' }, [
      el('label', { for: id, text: label }),
      el('input', { class: 'input', id, ...attrs })
    ]);
    const num = { type: 'number', inputmode: 'decimal', min: '0', step: 'any' };
    const form = el('form', { class: 'stack manualfood' }, [
      field('mf-name', 'Food name', { type: 'text', value: name, required: true, maxlength: '60' }),
      el('div', { class: 'manualfood__grid' }, [
        field('mf-p', 'Protein (g / 100 g)', { ...num, required: true }),
        field('mf-c', 'Carbs (g / 100 g)', { ...num, required: true }),
        field('mf-f', 'Fat (g / 100 g)', { ...num, required: true }),
        field('mf-kcal', 'Calories (/ 100 g)', { ...num, placeholder: 'worked out if empty' })
      ]),
      field('mf-piece', 'Weight of one piece in g (optional)', { ...num, placeholder: 'e.g. 50 for an egg' }),
      el('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Save food')
    ]);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = id => Number(form.querySelector(`#${id}`).value) || 0;
      const p = v('mf-p'), c = v('mf-c'), f = v('mf-f');
      const id = Store.saveFood({
        name: form.querySelector('#mf-name').value.trim(),
        per100: { p, c, f, kcal: v('mf-kcal') || r0(p * 4 + c * 4 + f * 9) },
        ...(v('mf-piece') ? { piece: v('mf-piece') } : {}),
        source: 'custom'
      });
      choose(Nutrition.get(id));
    });
    return form;
  }

  /* The default plan (data/meal-plan.json), read once per session.
     Names come from the food table, so the file only needs food ids. */
  let defaultPlan;
  async function fetchDefaultPlan() {
    if (defaultPlan !== undefined) return defaultPlan;
    try {
      const res = await fetch('data/meal-plan.json');
      const { meals } = res.ok ? await res.json() : {};
      const named = o => ({ food: o.food, amount: o.amount, unit: o.unit, name: Nutrition.get(o.food)?.name || o.name || o.food });
      defaultPlan = Array.isArray(meals) && meals.length
        ? meals.map(m => ({ foods: (m.foods || []).map(f => f.choice ? { choice: f.choice.map(named) } : named(f)) }))
        : null;
    } catch (err) {
      console.warn('Could not load the default meal plan', err);
      return null;     // not cached: try again next time, e.g. once back online
    }
    return defaultPlan;
  }

  /** A comparable fingerprint of a plan, from either shape (file or store). */
  const planKey = meals => meals.map(m => (m.items || m.foods).map(i => (i.options || i.choice || [i])
    .map(o => `${o.food}:${o.amount}${o.unit}`).join('|')).join(',')).join(';');

  /** Load the default plan — on first run, or on request (force). Resolves true when loaded. */
  async function loadDefaultMealPlan(force = false) {
    const meals = await fetchDefaultPlan();
    if (!meals || (!force && !Store.needsDefaultMealPlan())) return false;
    Store.seedMealPlan(meals);
    return true;
  }

  /** Offer the default plan when it differs from the meals on screen and was not turned down. */
  function planOffer(meals) {
    const key = planKey(meals);
    const totals = Nutrition.sum(meals.flatMap(m => m.foods.map(f => Nutrition.macros(f.choice ? f.choice[0] : f))));
    return el('div', { class: 'planoffer', role: 'region', 'aria-label': 'Your saved meal plan' }, [
      el('img', { src: 'mascot/meal-plan.png', alt: '', width: 335, height: 300, decoding: 'async' }),
      el('div', { class: 'planoffer__text' }, [
        el('strong', { text: 'Your saved meal plan is ready' }),
        el('span', { class: 'num', text: `${meals.length} meals · ${r0(totals.p)}g protein · ${r0(totals.kcal).toLocaleString()} kcal a day. Loading it replaces the meals below.` })
      ]),
      el('div', { class: 'planoffer__actions' }, [
        el('button', { class: 'btn btn--primary', type: 'button', onclick: () => useDefaultMealPlan(renderAll) }, 'Load it'),
        el('button', { class: 'btn btn--ghost', type: 'button',
          onclick: () => { Store.setSetting('dismissedPlan', key); renderAll(); } }, 'Not now')
      ])
    ]);
  }

  async function useDefaultMealPlan(then) {
    if (await loadDefaultMealPlan(true)) { UI.toast('Default meal plan loaded'); then(); }
    else UI.toast('Could not load the default plan — check your connection');
  }

  async function snapMeal() {
    // offer today's planned meals, suggesting the first one not yet eaten
    const today = Store.iso();
    const day = Store.mealDay(today);
    const plan = Store.getMealPlan();
    const choices = plan.map((meal, i) => ({
      id: meal.id,
      title: `${ordinal(i + 1)} meal`,
      macros: mealMacros(meal, day),
      foods: meal.items.map(item => { const o = item.options[pickOf(day, item)]; return `${Nutrition.amountLabel(o)} ${o.name}`; })
    }));
    const meal = await Meals.capture({ choices, preselect: plan.find(m => !day.done[m.id])?.id });
    // a photo of planned meals ticks them off
    for (const id of meal?.plan?.mealIds || []) if (!Store.mealDay(today).done[id]) Store.toggleMealDone(today, id);
    renderAll();
    if (meal) openMeal(meal, { fresh: true });
  }

  function openMeal(meal, { fresh = false } = {}) {
    const url = URL.createObjectURL(meal.blob);
    const title = meal.plan?.title || 'Meal';
    UI.openSheet(fresh ? `${title} saved` : title, body => {
      body.append(
        el('img', { class: 'mealview', src: url, alt: `${title} photo, stamped ${Meals.stampText(meal.ts)}` }),
        el('p', { class: 'mealview__stamp num', text: Meals.stampText(meal.ts) }),
        meal.plan ? el('p', { class: 'mealview__macros num' }, [
          ...MACROS.map(({ key, label }) => el('span', {}, [mdot(key), `${r0(meal.plan.macros[key])}g ${label.toLowerCase()}`])),
          el('span', { text: `${r0(meal.plan.macros.kcal)} kcal` })
        ]) : null,
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
        text: `${fmtDate(Store.mondayOf(), { day: 'numeric', month: 'short' })} – ${fmtDate(week[week.length - 1].dateObj, { day: 'numeric', month: 'short' })}` })
    ]));

    /* Mon–Sun strip */
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

      body.append(el('div', { class: 'sechead' }, [el('h2', { text: 'Food database' })]));
      body.append(el('div', { class: 'field' }, [
        el('label', { for: 'usda-key', text: 'USDA food database key' }),
        el('input', { class: 'input', id: 'usda-key', type: 'text', autocomplete: 'off', spellcheck: 'false',
          value: Store.settings.usdaKey || '', placeholder: 'Paste your free key',
          onchange: e => { Store.setSetting('usdaKey', e.target.value.trim()); UI.toast(e.target.value.trim() ? 'Key saved' : 'Key removed'); } }),
        el('p', { class: 'field__hint', html: 'Free, takes a minute: sign up at '
          + '<a href="https://api.data.gov/signup/" target="_blank" rel="noopener">api.data.gov/signup</a> and paste the key here. '
          + 'Without one, food search is limited to a few searches an hour.' })
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
      html: `${Catalog.all.length} exercises · artwork from `
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
