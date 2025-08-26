const SW_VERSION = 'bn-v1.0.1'; // ↑ Version erhöhen, damit Cache erneuert wird
const CORE = [
  'index.html',
  'css/style.css',
  'js/bootstrap.js',
  'js/bus.js',
  'js/preflight.js',
  'js/data.js',
  'js/search.js',
  'js/cart.js',
  'js/ui.js',
  'js/map.js',
  'js/analytics.js',
  'js/routing/nearest.js',
  'js/routing/dijkstra.js',
  'js/capacity/none.js',
  'js/capacity/forklift_2p5t.js',
  'manifest.webmanifest',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/sample-plan.png',
  'data/containers.csv',
  'data/sites.csv',
  'data/settings.json'
];

self.addEventListener('install', (e)=>{
  e.waitUntil((async()=>{
    const cache = await caches.open(SW_VERSION);
    await cache.addAll(CORE);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==SW_VERSION).map(k=>caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async()=>{
    const cache = await caches.open(SW_VERSION);
    const cached = await cache.match(e.request);
    if (cached) return cached;
    try{
      const res = await fetch(e.request);
      if (e.request.method === 'GET' && res.status === 200){
        cache.put(e.request, res.clone());
      }
      return res;
    }catch(err){
      if (e.request.mode === 'navigate'){
        const idx = await cache.match('index.html');
        return idx || new Response('<h1>Offline</h1>', {headers:{'Content-Type':'text/html'}});
      }
      return new Response('Offline', {status: 503});
    }
  })());
});