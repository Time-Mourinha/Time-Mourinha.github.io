// Manda aviso (web push) para a administração quando chega um pedido de acesso.
// Chamado pelo próprio banco (gatilho em profiles) com a chave guardada em private_config.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('use POST', { status: 405 })
  const { data: cfg } = await sb.from('private_config').select('key,value').in('key', ['aviso_chave', 'vapid_public', 'vapid_private', 'site_url'])
  const c = Object.fromEntries((cfg ?? []).map((x: { key: string; value: string }) => [x.key, x.value]))
  if (!c.aviso_chave || req.headers.get('x-chave') !== c.aviso_chave) return new Response('proibido', { status: 403 })

  const corpo = await req.json().catch(() => ({}))
  webpush.setVapidDetails(c.site_url || 'https://vistoria-saude.github.io', c.vapid_public, c.vapid_private)

  const { data: admins } = await sb.from('profiles').select('id').eq('role', 'admin').eq('approved', true)
  const ids = (admins ?? []).map((a: { id: string }) => a.id)
  if (!ids.length) return Response.json({ enviados: 0 })
  const { data: subs } = await sb.from('push_subscriptions').select('*').in('user_id', ids)

  // o banco já manda título, texto e destino; sem eles, cai no aviso de pedido de acesso
  const aviso = JSON.stringify({
    title: corpo.title ?? 'Novo pedido de acesso',
    body: corpo.body ?? `${corpo.email ?? 'Alguém'} pediu acesso ao Formulário de Vistoria Saúde. Toque para aprovar.`,
    url: corpo.url ?? './#acessos',
    tag: String(Date.now()),
  })
  let enviados = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, aviso, { TTL: 86400 })
      enviados++
    } catch (e) {
      const st = (e as { statusCode?: number }).statusCode
      if (st === 404 || st === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
    }
  }
  return Response.json({ enviados })
})
