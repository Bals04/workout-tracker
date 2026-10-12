# Bals workout planner v1.0

An installable, offline-capable PWA for planning a Mon–Fri training week and
ticking off sets as you do them. You set your own exercises, sets and reps, and
you can mark any day as a rest day.

Exercise data and artwork come from
[`@bryllim/workout-guide`](https://github.com/bryllim/workout-guide) — 302
exercises, each with three line-art frames that the app cycles to animate the
movement.

## Running it

```bash
npm install          # only needed for the exercise package and tests
npm start            # http://localhost:5173
```

A service worker is involved, so it needs a real origin — `file://` will not
work. Any static server will do; `npm start` runs the small one in
`tools/serve.js`.

## Deploying

```bash
npm run build        # writes dist/ — 925 files, ~30 MB
```

Then **drag the `dist` folder** onto <https://app.netlify.com/drop>. That is the
whole deploy: Netlify serves it over HTTPS, so the service worker registers and
the app is installable straight away.

Drop `dist/`, not the project folder — the project folder contains
`node_modules/` (large, and not needed at runtime). `dist/` holds only
`index.html`, `app.webmanifest`, `sw.js`, `css/`, `js/`, `data/`, `icons/`,
`assets/`, the two licence files, and a `_headers` file that tells Netlify to
cache the artwork hard and never stale the service worker.

The build fails loudly if `index.html` references a file that did not ship, so a
broken deploy gets caught locally rather than in production.

Everything is relative-path, so the same folder works on GitHub Pages,
Cloudflare Pages, S3, or a subdirectory of an existing site.

To check the build before deploying:

```bash
node tools/serve.js 5174 dist
BASE_URL=http://localhost:5174 npx playwright test
```

### Shipping an update

Bump `VERSION` in `sw.js` whenever you change `index.html`, the CSS, or the JS.
The shell is served cache-first, so without a version bump anyone who already
opened the app keeps the old copy.

## What it does

**Today** — the current weekday's session. Each set is a chip; tap it to log it.
The ring tracks progress, and a rest timer starts automatically between sets
(length is per-exercise). Rest days show a recovery card instead. Saturday and
Sunday show a preview of the next weekday.

**Plan** — the five weekdays. Tap one to edit it: rename the session, toggle
*rest day*, add exercises from the library, set sets/reps/weight, reorder or
remove them, or copy the whole day onto another weekday.

**Progress** — the week at a glance, sets logged, volume lifted, current streak,
and a list of recent sessions.

**Meals** — a meal check-in for your coach. *Snap a meal* opens the live camera
(not the gallery). The date and time are burned into the photo when it is
taken. *Send to coach* opens the phone's share sheet (WhatsApp,
Messages and so on), and *Send all* sends a whole day's meals at once. *Save to
gallery* uses the share sheet's "Save Image" on iPhone (the only way a web app can
reach Photos). On Android it downloads the photo, so it shows up in the gallery's
Download album. Photos are
kept in IndexedDB on the device. They are not part of the JSON backup. If the
browser blocks the live camera, the app falls back to the phone's own camera and
turns down any photo that wasn't taken in the last two minutes.

The **Meal plan** card on the same tab lists the meals of your day in order (1st meal, 2nd meal, …). Tap *Edit* to type each meal, add one or remove one. The plan repeats every day and is part of the JSON backup.

Settings holds the rest-timer and chime toggles, plus JSON export/import and a
full reset.

The top bar carries the brand lockup (name, version, and the Mon–Fri scope) with
the theme and settings buttons. The bottom bar's indicator is measured from the
live tab boxes in `app.js` and slides between them, so it stays aligned at any
width or font size.

### Targets adapt to the exercise

The library types every exercise, so the editor asks for the numbers that
actually apply:

| Exercise type | You set |
| --- | --- |
| `weight_reps` | sets, reps, kg |
| `bodyweight_reps` | sets, reps |
| `assisted_bodyweight` | sets, reps, assistance |
| `duration` | sets, seconds |
| `distance_duration` | distance, time |

A plank asks for seconds; a bench press asks for kilos.

## How it stores data

Everything lives in `localStorage` under `weekplan.v1` (the key predates the
rename and is kept so existing plans survive) — no account, no server, nothing
leaves the device. Two parts:

- **plan** — one entry per weekday: `{ rest, title, exercises[] }`. Each exercise
  carries a stable `uid`, its catalogue `slug`, and your targets.
- **logs** — keyed by local ISO date, recording which sets were ticked. Logs are
  keyed separately from the plan, so editing a day does not rewrite history.

Writes are synchronous, so nothing is lost if the tab closes right after a tap.
Use **Settings → Export** for a backup file.

## Offline behaviour

Two caches, because the artwork is ~32 MB — far too much to precache:

- `bals-planner-shell-v2` — HTML, CSS, JS, exercise metadata and icons, precached on
  install. The app always opens offline.
- `bals-planner-art-v2` — exercise frames, cached the first time you see them and
  capped at 700 entries (FIFO). Days you actually train stay available offline.

Bump `VERSION` in `sw.js` to force a cache refresh after changing shell files.

## Theming

The source artwork is **white** line-art on transparency, so dark is its native
surface and the default. The light theme sets `--art-filter: invert(1)` so the
figures stay legible. Both themes are defined as tokens at the top of
`css/app.css`.

## Tests

134 Playwright tests across desktop and mobile viewports:

```bash
npx playwright test                     # everything
npx playwright test --project=chromium  # desktop only
npx playwright test --ui                # interactive
```

They pin the clock (`page.clock.setFixedTime`) so weekday-dependent behaviour —
rest days, weekends, streaks — is deterministic. Coverage includes set logging
and persistence, the day editor and steppers, rest-day toggling, the exercise
picker, service-worker registration and offline reload, theming, keyboard and
ARIA behaviour, the top and bottom bars (indicator tracking, brand truncation,
tap-target size), and measured layout checks (no clipped numbers, no sideways
scroll).

`node tools/shots.js` writes screenshots to `test-results/shots/` for a quick
visual pass.

## Layout

```
index.html              app shell
app.webmanifest         PWA manifest
sw.js                   service worker
css/app.css             all styles, tokens at the top
js/catalog.js           exercise library: search, metric schemas, formatting
js/store.js             plan + logs + settings, localStorage persistence
js/ui.js                DOM helpers, animated figures, sheets, rest timer
js/app.js               the three views, day editor, picker, routing
data/exercises.json     slimmed 302-exercise manifest (~41 kB)
data/taxonomy.json      muscle and equipment filter lists
assets/<slug>/          three PNG frames per exercise
tools/build.js          writes the deployable dist/
tools/serve.js          dev server (`serve.js <port> [dir]`)
tools/make-icons.js     generates the PWA icons
tools/shots.js          screenshots for a visual pass
tests/e2e/              Playwright specs
```

Regenerate the icons after editing `tools/make-icons.js` with `npm run icons`.

## Licences

App code: MIT. Exercise artwork and metadata: **CC BY-SA 4.0**, by Bryl Lim,
derived from [Everkinetic](https://github.com/everkinetic/data). See
`ATTRIBUTION.md` and `LICENSE-ASSETS`. If you redistribute the artwork, CC BY-SA
requires you keep that attribution and share alike.
