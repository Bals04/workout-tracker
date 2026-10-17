/* Turns drawings into exercise frames that match the bundled art:
   white line-art on a transparent 512 × 512 canvas.

   Input: white lines on a dark background (e.g. made with Gemini,
   see art-reference/style-reference.png). Brightness becomes opacity,
   so the background drops out and anti-aliased edges stay smooth.
   All frames share one crop and scale, so an animation does not jump.

   Run:  node tools/exercise-art.js <slug> <frame-1> [frame-2] [frame-3]
   Writes assets/<slug>/frame-N.png

   Line weight can be tuned per drawing with env vars:
     ART_INK    brightness (0–255) at which a line is fully opaque — lower = bolder
     ART_STROKE extra thickness, 0–1 (0 = as drawn, 1 = one px bolder all round)
     ART_OUT    write somewhere other than assets/<slug> (for trying settings)  */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SIZE = 512;
const FILL = 460;          // longest side of the drawing, like the bundled frames
const INK = Number(process.env.ART_INK ?? 210);     // lum at which a line is solid
const STROKE = Number(process.env.ART_STROKE ?? 0); // soft thickening, 0–1 — off: drawn weight reads best

const [slug, ...inputs] = process.argv.slice(2);
if (!slug || !inputs.length) {
  console.error('usage: node tools/exercise-art.js <slug> <frame-1> [frame-2] [frame-3]');
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const sources = inputs.map(file => {
    const ext = path.extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg');
    return `data:image/${ext};base64,${fs.readFileSync(file).toString('base64')}`;
  });

  const frames = await page.evaluate(async ({ sources, SIZE, FILL, INK, STROKE }) => {
    const load = async src => { const img = new Image(); img.src = src; await img.decode(); return img; };
    const imgs = await Promise.all(sources.map(load));

    // brightness → alpha, white ink
    const masks = imgs.map(img => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      const p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        const lum = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
        p[i] = p[i + 1] = p[i + 2] = 255;
        p[i + 3] = Math.max(0, Math.min(255, (lum - 45) * 255 / (INK - 45)));    // below 45 is JPEG noise
      }
      g.putImageData(d, 0, 0);
      return { c, d };
    });

    // one crop box across all frames
    let x0 = Infinity, y0 = Infinity, x1 = 0, y1 = 0;
    for (const { c, d } of masks) {
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        if (d.data[(y * c.width + x) * 4 + 3] > 60) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, k = FILL / Math.max(w, h);
    const dw = Math.round(w * k), dh = Math.round(h * k);

    return masks.map(({ c }) => {
      const o = document.createElement('canvas');
      o.width = o.height = SIZE;
      const g = o.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(c, x0, y0, w, h, (SIZE - dw) / 2, (SIZE - dh) / 2, dw, dh);

      // thicken: each pixel takes the strongest alpha of itself and its 4 neighbours,
      // the neighbours counting STROKE as much — 0.5 widens lines by a soft half-pixel
      const src = g.getImageData(0, 0, SIZE, SIZE), out = g.createImageData(SIZE, SIZE);
      const a = src.data, b = out.data;
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        let m = 0;
        for (const [dx, dy, wgt] of [[0, 0, 1], [1, 0, STROKE], [-1, 0, STROKE], [0, 1, STROKE], [0, -1, STROKE]]) {
          const yy = y + dy, xx = x + dx;
          if (!wgt || yy < 0 || xx < 0 || yy >= SIZE || xx >= SIZE) continue;
          m = Math.max(m, a[(yy * SIZE + xx) * 4 + 3] * wgt);
        }
        const i = (y * SIZE + x) * 4;
        b[i] = b[i + 1] = b[i + 2] = 255;
        b[i + 3] = m;
      }
      g.putImageData(out, 0, 0);
      return o.toDataURL('image/png');
    });
  }, { sources, SIZE, FILL, INK, STROKE });

  const dir = process.env.ART_OUT || path.join(__dirname, '..', 'assets', slug);
  fs.mkdirSync(dir, { recursive: true });
  frames.forEach((url, i) => {
    const out = path.join(dir, `frame-${i + 1}.png`);
    fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(process.cwd(), out));
  });
  await browser.close();
})();
