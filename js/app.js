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
    stats: document.getElementById('view-stats'),
  };
  let current = 'today';
  let installPrompt = null;

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
          onclick: () => openDayEditor(dkey) }, [svg(ICON.calendar, { width: 1.9 }), 'Edit today']),
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
    const todayKey = Store.dayKey(new Date());

    root.append(el('div', { class: 'sechead', style: 'margin-top:2px' }, [
      el('h2', { text: 'Your week' }),
      el('span', { class: 'sechead__hint', text: 'Monday – Friday' })
    ]));

    const list = el('div', { class: 'daylist' });

    for (const key of Store.DAYS) {
      const day = Store.getDay(key);
      const n = day.exercises.length;
      const totalSets = day.exercises.reduce((s, x) => s + Math.max(1, x.sets || 1), 0);

      const sub = day.rest
        ? 'Rest day'
        : n
          ? `${n} exercise${n === 1 ? '' : 's'} · ${totalSets} sets`
          : 'Nothing planned';

      const card = el('button', {
        class: 'daycard' + (day.rest ? ' is-rest' : '') + (key === todayKey ? ' is-today' : ''),
        type: 'button',
        onclick: () => openDayEditor(key)
      }, [
        el('div', { class: 'daycard__dow', text: key },),
        el('div', { class: 'daycard__main' }, [
          el('div', { class: 'daycard__title', text: day.title || Store.DAY_NAMES[key] }),
          el('div', { class: 'daycard__sub', text: sub + (key === todayKey ? ' · today' : '') }),
          (() => {
            if (day.rest || !n) return null;
            const thumbs = el('div', { class: 'daycard__thumbs' });
            day.exercises.slice(0, 6).forEach(x => thumbs.append(figure(x.slug)));
            if (n > 6) thumbs.append(el('div', { class: 'daycard__more', text: `+${n - 6}` }));
            return thumbs;
          })()
        ]),
        (() => { const c = svg(ICON.chevron, { width: 2.1 }); c.classList.add('daycard__chev'); return c; })()
      ]);

      list.append(card);
    }

    root.append(list, creditNote());
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
        onclick: () => {
          if (!confirm(`Remove every exercise from ${Store.DAY_NAMES[dkey]}?`)) return;
          Store.clearDay(dkey);
          UI.toast('Day cleared');
          rebuild && UI.rerenderSheet(rebuild);
        }
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
  const RENDER = { today: renderToday, week: renderWeek, stats: renderStats };

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
    RENDER[name]();
    for (const tab of document.querySelectorAll('.tab')) {
      const on = tab.dataset.nav === name;
      if (on) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
    movePill();
    if (push && location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
    views[name].scrollIntoView?.({ block: 'start' });
  }

  const renderAll = () => RENDER[current]?.();

  /* ══════════════════════════════════════════════════════════
     Theme
     ══════════════════════════════════════════════════════════ */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.content = theme === 'light' ? '#F3F5F8' : '#0B0D10';
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

    go(location.hash.slice(1) || 'today', { push: false });

    /* PWA */
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      installPrompt = e;
      renderAll();
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
