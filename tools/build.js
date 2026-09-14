/* Builds `dist/` — exactly the files the app needs at runtime.

   On Vercel this runs automatically (see vercel.json) and dist/
   is published. Locally it produces a folder you can hand to any
   static host, or drag onto Netlify Drop.

   Run:  npm run build                                        */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

/* Everything here is required at runtime. node_modules, tools,
   tests and screenshots are deliberately absent. */
const FILES = ['index.html', 'app.webmanifest', 'sw.js'];
const DIRS  = ['css', 'js', 'data', 'icons', 'assets', 'mascot', 'fonts'];
const DOCS  = ['ATTRIBUTION.md', 'LICENSE-ASSETS'];   // CC BY-SA requires these travel with the art

/* Netlify reads this at deploy time; Vercel uses vercel.json
   instead and simply ignores it. Sensible caching either way:
   never stale the service worker, cache the artwork hard. */
const HEADERS = `/sw.js
  Cache-Control: public, max-age=0, must-revalidate

/index.html
  Cache-Control: public, max-age=0, must-revalidate

/app.webmanifest
  Cache-Control: public, max-age=0, must-revalidate

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/icons/*
  Cache-Control: public, max-age=604800
`;

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) n += copyDir(src, dst);
    else { fs.copyFileSync(src, dst); n++; }
  }
  return n;
}

function dirSize(dir) {
  let bytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    bytes += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return bytes;
}

function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  }
  return n;
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

for (const f of [...FILES, ...DOCS]) {
  if (!fs.existsSync(path.join(ROOT, f))) {
    console.warn(`  ! missing ${f}`);
    continue;
  }
  fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));
  console.log(`  ${f}`);
}

for (const d of DIRS) {
  const src = path.join(ROOT, d);
  if (!fs.existsSync(src)) { console.warn(`  ! missing ${d}/`); continue; }
  const n = copyDir(src, path.join(DIST, d));
  console.log(`  ${(d + '/').padEnd(10)} ${String(n).padStart(4)} files`);
}

fs.writeFileSync(path.join(DIST, '_headers'), HEADERS);
console.log('  _headers');

/* A missing icon or script would only show up in production, so
   check every local reference in index.html actually shipped. */
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map(m => m[1]);
const missing = refs.filter(r => !fs.existsSync(path.join(DIST, r)));

console.log('');
if (missing.length) {
  console.error('BUILD FAILED — index.html references files that are not in dist/:');
  for (const m of missing) console.error('  ' + m);
  process.exit(1);
}

console.log(`dist/  ${countFiles(DIST)} files, ${(dirSize(DIST) / 1024 / 1024).toFixed(1)} MB`);
console.log(`checked ${refs.length} references from index.html — all present`);
console.log('\nDeploy: drag the dist/ folder onto https://app.netlify.com/drop');
