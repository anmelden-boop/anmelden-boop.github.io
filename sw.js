/* Service Worker: lässt die App beim Kaltstart aus dem Speicher laden.
   - App-Dateien + MapLibre: sofort aus dem Cache, im Hintergrund aktualisiert (beim nächsten Start aktuell)
   - Kartenkacheln, Schriften, Relief: aus dem Cache, sonst Netz (max. ~3000 Kacheln)
   - Wetter, Lifte, Fahrtzeiten usw. werden NIE gecacht – die kommen immer frisch */
const SHELL = 'shell-v8', TILES = 'tiles-v1', MAX_TILES = 3000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll([
    './', 'index.html', 'style.css?v=8', 'data.js?v=8', 'quotes.js?v=8', 'app.js?v=8',
    'https://unpkg.com/maplibre-gl@5.24.1/dist/maplibre-gl.js',
    'https://unpkg.com/maplibre-gl@5.24.1/dist/maplibre-gl.css'
  ])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== TILES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isTile = u => (u.hostname === 'tiles.openfreemap.org' && u.pathname !== '/planet') ||
                    (u.hostname === 's3.amazonaws.com' && u.pathname.startsWith('/elevation-tiles-prod/'));
const isShell = u => (u.origin === self.location.origin && !u.pathname.endsWith('sw.js')) ||
                     u.hostname === 'unpkg.com' ||
                     (u.hostname === 'tiles.openfreemap.org' && u.pathname === '/planet');

let trimTimer = null;
function trimTiles() {
  clearTimeout(trimTimer);
  trimTimer = setTimeout(async () => {
    const c = await caches.open(TILES), ks = await c.keys();
    for (let i = 0; i < ks.length - MAX_TILES; i++) await c.delete(ks[i]);
  }, 5000);
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);

  if (isTile(u)) {                       // Kacheln ändern sich praktisch nie: Cache zuerst
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) { c.put(e.request, res.clone()); trimTiles(); }
      return res;
    }));
    return;
  }

  if (isShell(u)) {                      // App-Dateien: sofort aus dem Cache, dahinter Update holen
    const key = e.request.mode === 'navigate' ? 'index.html' : e.request;
    e.respondWith(caches.open(SHELL).then(async c => {
      const hit = await c.match(key, { ignoreSearch: e.request.mode === 'navigate' });
      const net = fetch(e.request).then(res => { if (res.ok) c.put(key, res.clone()); return res; });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    }));
  }
  // alles andere (Wetter-, Lift-, Routen-APIs) geht unverändert ins Netz
});
