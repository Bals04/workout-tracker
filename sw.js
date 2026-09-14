/* ═══════════════════════════════════════════════════════════
   Service worker.

   Two caches on purpose:
   • SHELL — precached on install. The app must open offline.
   • ART   — the 302×3 exercise frames (~32 MB in total), far
             too much to precache. Cached on first view and
             kept, so days you actually train work offline.
   ═══════════════════════════════════════════════════════════ */

const VERSION = 'v5';
const SHELL = `bals-planner-shell-${VERSION}`;
const ART   = `bals-planner-art-${VERSION}`;
const ART_LIMIT = 700;            // ≈230 exercises' worth of frames

const SHELL_ASSETS = [
  './',
  'index.html',
  'css/app.css',
  'css/training.css',
  'fonts/Montserrat.ttf',
  'mascot/coach-baw.png',
  'mascot/coach-thinking.png',
  'mascot/exercises.png',
  'mascot/active-days.png',
  'mascot/total-volume.png',
  'js/catalog.js',
  'js/store.js',
  'js/ui.js',
  'js/app.js',
  'data/exercises.json',
  'data/taxonomy.json',
  'app.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // addAll is all-or-nothing; add individually so one 404 can't
    // stop the whole install.
    await Promise.all(SHELL_ASSETS.map(async url => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (err) { console.warn('[sw] skipped', url, err); }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, ART]);
    for (const key of await caches.keys()) {
      if (!keep.has(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

/** Keep the art cache from growing without bound (FIFO). */
async function trimArt(cache) {
  const keys = await cache.keys();
  if (keys.length <= ART_LIMIT) return;
  for (const req of keys.slice(0, keys.length - ART_LIMIT)) await cache.delete(req);
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Navigations: network first, fall back to the cached shell. */
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(SHELL);
        return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  /* Exercise artwork: cache-first, populated on demand. */
  if (url.pathname.includes('/assets/') && url.pathname.endsWith('.png')) {
    event.respondWith((async () => {
      const cache = await caches.open(ART);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const res = await fetch(request);
        if (res.ok) { await cache.put(request, res.clone()); trimArt(cache); }
        return res;
      } catch {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })());
    return;
  }

  /* Shell: cache-first, refreshed in the background. */
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) {
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(request);
          if (fresh.ok) await cache.put(request, fresh);
        } catch { /* offline — the cached copy stands */ }
      })());
      return hit;
    }
    try {
      const res = await fetch(request);
      if (res.ok) await cache.put(request, res.clone());
      return res;
    } catch {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
