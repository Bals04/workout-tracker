/* Generates the PWA icons: a lime tile with the dumbbell mark.
   Hand-rolled RGBA PNG writer — no image dependencies.
   Run:  node tools/make-icons.js                             */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LIME = [0xD4, 0xFF, 0x4F];
const INK  = [0x12, 0x19, 0x0A];
const OUT  = path.join(__dirname, '..', 'icons');

/* ── canvas ──────────────────────────────────────────────── */
function canvas(size) {
  const px = Buffer.alloc(size * size * 4);       // transparent
  const SS = 4;                                    // supersample factor

  /** Fill via a signed-distance test, antialiased by supersampling. */
  function fill(inside, color, alpha = 1) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let hits = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            if (inside(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hits++;
          }
        }
        if (!hits) continue;
        const a = (hits / (SS * SS)) * alpha;
        const o = (y * size + x) * 4;
        const da = px[o + 3] / 255;
        const na = a + da * (1 - a);
        for (let c = 0; c < 3; c++) {
          px[o + c] = Math.round(((color[c] / 255) * a + (px[o + c] / 255) * da * (1 - a)) / (na || 1) * 255);
        }
        px[o + 3] = Math.round(na * 255);
      }
    }
  }

  const roundRect = (x, y, w, h, r) => (px_, py) => {
    if (px_ < x || px_ > x + w || py < y || py > y + h) return false;
    const cx = Math.min(Math.max(px_, x + r), x + w - r);
    const cy = Math.min(Math.max(py, y + r), y + h - r);
    return (px_ - cx) ** 2 + (py - cy) ** 2 <= r * r ||
           (px_ >= x + r && px_ <= x + w - r) || (py >= y + r && py <= y + h - r);
  };

  return { px, size, fill, roundRect };
}

/* ── PNG encode ──────────────────────────────────────────── */
function png(px, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;                                  // filter: none
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/* ── the mark: a dumbbell, drawn at unit scale ───────────── */
function drawMark(c, cx, cy, scale) {
  const { fill, roundRect } = c;
  const u = scale;                       // 1u = mark half-width / 10
  const bar = (x, y, w, h, r) => fill(roundRect(cx + x * u, cy + y * u, w * u, h * u, r * u), INK);

  bar(-9.5, -2.0,  1.8,  4.0, 0.9);      // outer plate, left
  bar(-6.6, -4.6,  2.4,  9.2, 1.2);      // inner plate, left
  bar(-4.4, -1.25, 8.8,  2.5, 1.25);     // handle
  bar( 4.2, -4.6,  2.4,  9.2, 1.2);      // inner plate, right
  bar( 7.7, -2.0,  1.8,  4.0, 0.9);      // outer plate, right
}

function build(size, { maskable = false } = {}) {
  const c = canvas(size);
  const r = maskable ? 0 : size * 0.235;                 // maskable icons are full-bleed
  c.fill(c.roundRect(0, 0, size, size, r), LIME);
  // Maskable art must sit inside the 80 % safe zone.
  drawMark(c, size / 2, size / 2, (size * (maskable ? 0.030 : 0.038)));
  return png(c.px, size);
}

fs.mkdirSync(OUT, { recursive: true });
const files = [
  ['icon-192.png',     build(192)],
  ['icon-512.png',     build(512)],
  ['icon-180.png',     build(180)],
  ['maskable-192.png', build(192, { maskable: true })],
  ['maskable-512.png', build(512, { maskable: true })],
];
for (const [name, buf] of files) {
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`${name.padEnd(18)} ${(buf.length / 1024).toFixed(1)} kB`);
}

/* Crisp vector version for the browser tab. */
fs.writeFileSync(path.join(OUT, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="120" fill="#D4FF4F"/>
  <g fill="#12190A">
    <rect x="76"  y="217" width="35" height="78"  rx="17"/>
    <rect x="129" y="171" width="46" height="170" rx="23"/>
    <rect x="169" y="232" width="174" height="48" rx="24"/>
    <rect x="337" y="171" width="46" height="170" rx="23"/>
    <rect x="401" y="217" width="35" height="78"  rx="17"/>
  </g>
</svg>
`);
console.log('icon.svg           written');
