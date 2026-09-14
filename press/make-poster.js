/* ═══════════════════════════════════════════════════════════
   press/make-poster.js — regenerates press/poster-desktop-mobile.png
   Shoots the live app (desktop + phone) and composes the promo image.

     node tools/serve.js 5173 &      # or let this script start it
     node press/make-poster.js
   ═══════════════════════════════════════════════════════════ */

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..') + '/';
const SP = path.join(__dirname, '.tmp');
fs.mkdirSync(SP, { recursive: true });
const PORT = 5173, URL = `http://localhost:${PORT}/index.html`;
const b64 = (p, m) => `data:${m};base64,` + fs.readFileSync(p).toString('base64');


/* ── 1. shoot the running app ─────────────────────────────── */
async function capture(browser) {
  const d = await browser.newPage({ viewport: { width: 1360, height: 880 }, deviceScaleFactor: 2 });
  await d.goto(URL);
  await d.waitForSelector('.training-stat__mascot');
  await d.evaluate(() => { const t = document.querySelector('.tabbar'); if (t) t.style.visibility = 'hidden'; });
  await d.waitForTimeout(600);
  await d.screenshot({ path: SP + '/cap-desktop.png' });
  await d.close();

  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  await m.goto(URL);
  await m.waitForSelector('.training-stat__mascot');
  await m.waitForTimeout(600);
  await m.evaluate(() => window.scrollTo(0, 396));
  await m.waitForTimeout(300);
  await m.screenshot({ path: SP + '/cap-mobile.png' });
  await m.close();
}

async function serveIfNeeded() {
  try { await fetch(URL); return null; } catch {}
  const proc = spawn(process.execPath, [ROOT + 'tools/serve.js', String(PORT)], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { await fetch(URL); return proc; } catch { await new Promise(r => setTimeout(r, 250)); }
  }
  throw new Error('could not reach ' + URL);
}

/* ── 2. compose ───────────────────────────────────────────── */
function build() {
const FONT    = b64(ROOT + 'fonts/Montserrat.ttf', 'font/ttf');
const DESKTOP = b64(SP + '/cap-desktop.png', 'image/png');
const MOBILE  = b64(SP + '/cap-mobile.png', 'image/png');
const MASCOT  = b64(ROOT + 'mascot/coach-baw.png', 'image/png');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Montserrat; src: url('${FONT}') format('truetype'); font-weight: 100 900; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0d0f0e; }
.poster {
  position: relative; width: 1600px; height: 900px; overflow: hidden;
  background: #141615; font-family: Montserrat, sans-serif; color: #f5f6f4;
}
/* ambient light */
.poster::before {
  content: ''; position: absolute; inset: -20%;
  background:
    radial-gradient(900px 620px at 76% 34%, #408c7440, transparent 68%),
    radial-gradient(700px 520px at 6% 86%, #72a6c522, transparent 70%);
}
.grid {
  position: absolute; inset: 0; opacity: .5;
  background-image: linear-gradient(#ffffff07 1px, transparent 1px), linear-gradient(90deg, #ffffff07 1px, transparent 1px);
  background-size: 56px 56px;
  -webkit-mask-image: radial-gradient(1100px 700px at 30% 40%, #000, transparent 75%);
}
.copy { position: absolute; left: 76px; top: 104px; width: 560px; z-index: 4; }
.brand { display: flex; align-items: center; gap: 12px; margin-bottom: 34px; }
.brand__tile {
  width: 42px; height: 42px; border-radius: 11px; display: grid; place-items: center;
  background: #408c7424; border: 1px solid #408c7447; color: #5fd3ad;
}
.brand__name { font-size: 17px; font-weight: 750; letter-spacing: -.02em; }
.kicker {
  display: inline-flex; align-items: center; gap: 10px; color: #4fbf9c;
  font-size: 13px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; margin-bottom: 20px;
}
.kicker::before { content: ''; width: 26px; height: 4px; border-radius: 2px; background: #408c74; }
h1 { font-size: 74px; line-height: 1.04; letter-spacing: -.035em; font-weight: 850; }
h1 em { font-style: normal; color: #5fd3ad; }
.sub { margin-top: 22px; font-size: 19px; line-height: 1.62; font-weight: 500; color: #b5b7bb; max-width: 500px; }
.chips { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 30px; max-width: 520px; }
.chip {
  font-size: 12.5px; font-weight: 750; letter-spacing: .04em; padding: 8px 14px; border-radius: 999px;
  background: #242524; border: 1px solid #393b39; color: #d7dad6;
}
.chip--on { background: #408c741f; border-color: #408c7466; color: #7fdcbb; }

/* devices */
.devices { position: absolute; left: 566px; top: 0; width: 1000px; height: 900px; z-index: 3;
  perspective: 2400px; }
.browser {
  position: absolute; left: 96px; top: 138px; width: 858px;
  border-radius: 16px; overflow: hidden; background: #1e201f;
  border: 1px solid #3d403e;
  box-shadow: 0 50px 90px -20px #000000b3, 0 0 0 1px #ffffff0a inset;
  transform: rotateY(-15deg) rotateX(3deg) rotate(-1deg);
  transform-origin: left center;
}
.browser__bar { height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 15px; background: #242524; border-bottom: 1px solid #343634; }
.dot { width: 11px; height: 11px; border-radius: 50%; }
.browser__url {
  margin-left: 14px; flex: 1; height: 22px; border-radius: 6px; background: #141615; border: 1px solid #343634;
  display: flex; align-items: center; padding: 0 10px; font-size: 10.5px; font-weight: 650; color: #8c918e; letter-spacing: .02em;
}
.browser img { display: block; width: 100%; }
.phone {
  position: absolute; left: 42px; top: 372px; width: 286px;
  border-radius: 38px; padding: 9px; background: #1b1d1c;
  border: 1px solid #4a4d4b;
  box-shadow: 0 44px 70px -14px #000000c4, 0 0 0 1px #ffffff10 inset;
  transform: rotateY(-15deg) rotateX(3deg) rotate(-1deg);
}
.phone__screen { position: relative; border-radius: 30px; overflow: hidden; background: #141615; }
.phone__screen img { display: block; width: 100%; }
.phone__notch {
  position: absolute; left: 50%; top: 9px; transform: translateX(-50%);
  width: 86px; height: 22px; border-radius: 999px; background: #0c0e0d;
}
.mascot {
  position: absolute; left: 46px; bottom: -18px; height: 336px; z-index: 5;
  filter: drop-shadow(0 26px 34px #000000a8);
}
.foot {
  position: absolute; right: 64px; bottom: 40px; z-index: 6; display: flex; align-items: center; gap: 14px;
  font-size: 13px; font-weight: 750; letter-spacing: .14em; text-transform: uppercase; color: #7e8582;
}
.foot span { width: 5px; height: 5px; border-radius: 50%; background: #408c74; }
</style></head><body>
<div class="poster">
  <div class="grid"></div>

  <div class="copy">
    <div class="brand">
      <span class="brand__tile">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11"/>
        </svg>
      </span>
      <span class="brand__name">Bals workout planner</span>
    </div>

    <span class="kicker">Weekly training log</span>
    <h1>Gym Progress<br><em>Tracker</em></h1>
    <p class="sub">Plan your whole week on a calendar-style board. Add, edit and delete exercises inside each day — and let Coach Baw keep score.</p>

    <div class="chips">
      <span class="chip chip--on">Installable PWA</span>
      <span class="chip">Works offline</span>
      <span class="chip">Local-first data</span>
      <span class="chip">Dark &amp; light</span>
      <span class="chip">No account</span>
    </div>
  </div>

  <div class="devices">
    <div class="browser">
      <div class="browser__bar">
        <span class="dot" style="background:#c76f73"></span>
        <span class="dot" style="background:#c99636"></span>
        <span class="dot" style="background:#408c74"></span>
        <span class="browser__url">bals-workout-planner.app</span>
      </div>
      <img src="${DESKTOP}" alt="">
    </div>
    <div class="phone">
      <div class="phone__screen">
        <img src="${MOBILE}" alt="">
        <span class="phone__notch"></span>
      </div>
    </div>
  </div>

  <img class="mascot" src="${MASCOT}" alt="">
  <div class="foot">Desktop<span></span>Mobile<span></span>Offline</div>
</div>
</body></html>`;

  fs.writeFileSync(SP + '/poster.html', html);
}

(async () => {
  const server = await serveIfNeeded();
  const br = await chromium.launch();
  await capture(br);
  build();
  const p = await br.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await p.goto('file:///' + SP + '/poster.html');
  await p.waitForTimeout(900);
  await p.locator('.poster').screenshot({ path: SP + '/poster.png' });
  fs.mkdirSync(ROOT + 'press', { recursive: true });
  fs.copyFileSync(SP + '/poster.png', ROOT + 'press/poster-desktop-mobile.png');
  await br.close();
  server?.kill();
  console.log('press/poster-desktop-mobile.png  —  3200x1800, ' + (fs.statSync(SP + '/poster.png').size / 1024 / 1024).toFixed(2) + ' MB');
})();
