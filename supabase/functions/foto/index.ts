// Busca no Google Drive uma foto do relatório (arquivo "qualquer pessoa com o link") e devolve ao app,
// para o PDF sair completo em qualquer celular. Só responde a quem está logado (verify_jwt).
// Nada fica guardado no Supabase: a foto só passa por aqui.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!/^[\w-]{10,120}$/.test(id)) return new Response('id inválido', { status: 400, headers: CORS })
  for (const url of [
    `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${id}`,
    `https://drive.google.com/thumbnail?id=${id}&sz=w2000`,
  ]) {
    try {
      const r = await fetch(url, { redirect: 'follow' })
      const tipo = r.headers.get('content-type') ?? ''
      if (r.ok && tipo.startsWith('image/')) {
        return new Response(r.body, { headers: { ...CORS, 'Content-Type': tipo, 'Cache-Control': 'private, max-age=3600' } })
      }
    } catch { /* tenta o próximo endereço */ }
  }
  return new Response('foto não encontrada no Drive', { status: 404, headers: CORS })
})
