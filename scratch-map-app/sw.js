// Scratch Map service worker: lets the app open with no signal.
// Bump the number in CACHE whenever you change any app file, so phones pick up the new version.
var PREFIX = 'scratchmap2-';
var CACHE = PREFIX + 'v5';
var CORE = ['./', 'index.html', 'config.js', 'd3.min.js', 'topojson-client.min.js', 'supabase.min.js', 'privacy.html', 'manifest.webmanifest',
  'data/world.json', 'data/us.json', 'data/canada.json', 'data/countries.json', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

var REGION_FLAGS = ["ca-ab","ca-bc","ca-mb","ca-nb","ca-nl","ca-ns","ca-nt","ca-nu","ca-on","ca-pe","ca-qc","ca-sk","ca-yt","us-ak","us-al","us-ar","us-az","us-ca","us-co","us-ct","us-dc","us-de","us-fl","us-ga","us-hi","us-ia","us-id","us-il","us-in","us-ks","us-ky","us-la","us-ma","us-md","us-me","us-mi","us-mn","us-mo","us-ms","us-mt","us-nc","us-nd","us-ne","us-nh","us-nj","us-nm","us-nv","us-ny","us-oh","us-ok","us-or","us-pa","us-ri","us-sc","us-sd","us-tn","us-tx","us-ut","us-va","us-vt","us-wa","us-wi","us-wv","us-wy"]; // US states + DC and Canadian provinces

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(CORE).then(function () {
      return fetch('data/countries.json').then(function (r) { return r.json(); }).then(function (list) {
        return c.addAll(list.map(function (x) { return 'flags/' + x.a2.toLowerCase() + '.svg'; }));
      }).then(function () {
        return c.addAll(REGION_FLAGS.map(function (x) { return 'flags/states/' + x + '.webp'; }));
      });
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    // Remove old versions of this app's cache, including the earlier Google Sheet version ("scratchmap-v3" and older).
    return Promise.all(keys.filter(function (k) { return (k.indexOf(PREFIX) === 0 || k.indexOf('scratchmap-') === 0) && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // Supabase and fonts go straight to the network
  var cacheFirst = /\/(flags|data|icons)\//.test(url.pathname);
  if (cacheFirst) {
    e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
  } else {
    // App files: try the network so updates show up, fall back to the saved copy offline.
    // 'no-cache' makes the phone ask the server if the file changed, instead of trusting a copy GitHub said to keep for 10 minutes.
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(function (res) {
      var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); return res;
    }).catch(function () { return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('index.html'); }); }));
  }
});
