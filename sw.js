/* MOMENTUM V5.0 APEX - service worker.
   Static shell: cache-first. DiceBear avatars: network-first with a 24h cache
   fallback so a returning visitor still sees their hunter offline. */
const CACHE = 'momentum-v5';
const AVATAR_CACHE = 'momentum-avatars-v5';
const OFFLINE_HTML = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Offline - MOMENTUM</title></head>' +
  '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
  'background:#050508;color:#E2E8F0;font-family:system-ui,sans-serif;text-align:center">' +
  '<main><h1 style="font-size:1.1rem;letter-spacing:.18em;color:#22D3EE">MOMENTUM</h1>' +
  '<p style="color:#64748B;font-size:.85rem;margin-top:.75rem">You\'re offline - reconnect to sync</p>' +
  '</main></body></html>';

const SHELL = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './privacy.html',
  './terms.html',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch((err) => {
        /* One missing shell entry must not abort the whole install. */
        console.warn('MOMENTUM SW: partial shell precache', err);
        return Promise.all(SHELL.map((url) => cache.add(url).catch(() => null)));
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = [CACHE, AVATAR_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => (keep.indexOf(key) === -1 ? caches.delete(key) : null))))
      .then(() => self.clients.claim())
  );
});

function isAvatar(url) {
  return url.hostname === 'api.dicebear.com';
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  let url;
  try { url = new URL(request.url); } catch (err) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (isAvatar(url)) {
    event.respondWith(networkFirstAvatar(request));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
  }
  /* Cross-origin CDN assets (Tailwind, fonts, confetti) fall through to the
     network and are cached opportunistically on first use. */
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: false });
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const fallback = await cache.match(request, { ignoreSearch: true });
    if (fallback) return fallback;
    if (request.mode === 'navigate') {
      return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

async function networkFirstAvatar(request) {
  const cache = await caches.open(AVATAR_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    return new Response('', { status: 504, statusText: 'avatar unavailable offline' });
  }
}
