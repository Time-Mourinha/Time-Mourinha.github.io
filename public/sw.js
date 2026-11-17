// Formulário de Vistoria Saúde — funciona como aplicativo instalado e recebe avisos.
// Sempre busca a versão nova; o que ficou guardado só é usado sem internet.
const CACHE = 'vistoria-v2'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return // banco, fotos e mapas: direto
  // página principal: sempre confere a versão nova no servidor (não usa a cópia guardada do navegador)
  const pedido = req.mode === 'navigate' ? new Request(req, { cache: 'no-cache' }) : req
  e.respondWith(
    fetch(pedido)
      .then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)) } return r })
      .catch(() => caches.match(req).then((r) => r || caches.match('./')))
  )
})

// Aviso de novo pedido de acesso (enviado pelo banco para a administração)
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'Secretaria Executiva · Fiscalização da Saúde', {
    body: d.body || 'Há um novo pedido de acesso para aprovar.',
    icon: 'icones/icone-192.png',
    badge: 'icones/icone-192.png',
    data: { url: d.url || './#acessos' },
    tag: d.tag || 'pedido-acesso',
    renotify: true,
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const alvo = new URL(e.notification.data?.url || './#acessos', self.registration.scope).href
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) { if ('focus' in w) { w.navigate(alvo); return w.focus() } }
    return self.clients.openWindow(alvo)
  }))
})
