/* Minimal static server for local development / testing.
   Service workers need a real origin, so file:// will not do.
   Run:  node tools/serve.js [port]                           */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = Number(process.argv[2]) || 5173;
/* Optional second argument picks the directory to serve, so the
   built output can be checked the same way: serve.js 5174 dist */
const ROOT = path.resolve(__dirname, '..', process.argv[3] || '.');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

/* Load .env (KEY=value lines) so the meal AI works locally, the
   way Vercel's environment variables do in production. */
try {
  for (const line of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* no .env: the meal AI answers "not set up", the rest works */ }

/* Same routes as Vercel's /api functions. */
const API = { '/api/meal-ai': () => require('../api/meal-ai.js') };

http.createServer((req, res) => {
  let pathname = decodeURIComponent(url.parse(req.url).pathname);
  if (API[pathname]) {
    Promise.resolve(API[pathname]()(req, res)).catch(err => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500).end('{"error":"Server error"}');
    });
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const file = path.join(ROOT, pathname);
  // never serve outside the project root
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // no caching in dev, so edits show up on reload
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    }).end(buf);
  });
}).listen(PORT, () => {
  console.log(`Bals workout planner running at  http://localhost:${PORT}`);
});
