// Time Mourinha — funciona como aplicativo instalado.
// Sempre busca a versão nova na internet; o que ficou guardado só é usado sem conexão.
const CACHE = "tm-v2";
const BASICO = ["./", "index.html", "css/estilo.css", "js/config.js", "js/guias.js", "js/app.js", "js/time.js",
  "js/instalar.js", "img/marca.svg", "img/icone.svg", "img/app-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICO)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return; // login, fotos e mapas: direto
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return r;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
  );
});
