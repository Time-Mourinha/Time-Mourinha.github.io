// Descreve o problema visível numa foto da vistoria (Claude, da Anthropic).
// Só funciona com o segredo ANTHROPIC_API_KEY; sem ele, responde {ativo:false} e o app segue normal.
import { createClient } from 'npm:@supabase/supabase-js@2'

const URL_SB = Deno.env.get('SUPABASE_URL')!
const sb = createClient(URL_SB, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const CHAVE = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const MODELO = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-5-5'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const ITENS = ['Calçada e rampa', 'Corrimãos', 'Fachada e cobertura', 'Muro e grades', 'Portões', 'Paredes e pintura', 'Umidade, mofo e trincas',
  'Teto e forro', 'Piso, rodapés e soleiras', 'Revestimentos', 'Folhas e batentes', 'Vidros e esquadrias', 'Maçanetas e trincos', 'Fechaduras e chaves',
  'Lâmpadas e luminárias', 'Tomadas e espelhos', 'Fiação visível', 'Luz de emergência', 'Ar-condicionado', 'Ventiladores, filtros e drenos',
  'Torneiras e pias', 'Vasos e assentos', 'Descargas', 'Ralos, vazamentos e escoamento', 'Barras e acessórios', 'Insumos de higiene',
  'Mesas e cadeiras', 'Armários e bancadas', 'Macas e equipamentos', 'Informática e rede', 'Passagem e acessibilidade',
  'Sinalização e saída de emergência', 'Privacidade e limpeza', 'Rede de frio', 'Coletor de perfurocortantes', 'Identificação e separação']

const INSTRUCAO = `Você ajuda fiscais que vistoriam unidades de saúde da Prefeitura de Maceió.
Olhe a foto e descreva, em português simples, o problema de manutenção, conservação, limpeza ou segurança que aparece nela.
Responda só com JSON: {"descricao": "...", "item": "...", "gravidade": "Imediata|Prioritária|Programável"}.
- "descricao": uma frase objetiva de até 25 palavras, dizendo o que se vê (ex.: "Parede com mofo e manchas de umidade perto do teto, com pintura descascando.").
  Se não houver problema visível, escreva "Sem problema aparente na foto.".
- "item": o mais próximo desta lista: ${ITENS.join('; ')}; ou "Outro".
- "gravidade": Imediata se houver risco à segurança ou ao atendimento (fiação exposta, risco de queda, vacinas), Prioritária se compromete o uso, Programável se é desgaste.
Não identifique nem descreva pessoas, documentos ou telas; se aparecerem, ignore-os.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!CHAVE) return json({ ativo: false })
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { path } = await req.json().catch(() => ({}))
  if (!jwt || !path) return json({ erro: 'pedido incompleto' }, 400)

  // só quem pode ver a foto pode pedir a descrição (mesma regra do banco)
  const comoUsuario = createClient(URL_SB, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
  const { data: pode } = await comoUsuario.rpc('can_access_path', { path })
  if (!pode) return json({ erro: 'sem acesso a esta foto' }, 403)

  const { data: arquivo, error } = await sb.storage.from('vistorias').download(path)
  if (error || !arquivo) return json({ erro: 'foto não encontrada' }, 404)
  const tipo = arquivo.type || 'image/jpeg'
  if (!tipo.startsWith('image/')) return json({ ativo: true, descricao: '' })
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  if (bytes.length > 4_800_000) return json({ ativo: true, descricao: '' })
  let b64 = ''
  for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  b64 = btoa(b64)

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': CHAVE, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODELO, max_tokens: 300, system: INSTRUCAO,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: tipo, data: b64 } },
        { type: 'text', text: 'Descreva o problema desta foto.' },
      ] }],
    }),
  })
  if (!r.ok) return json({ ativo: true, erro: `IA indisponível (${r.status})` }, 502)
  const resposta = await r.json()
  const texto: string = (resposta.content ?? []).map((c: { text?: string }) => c.text ?? '').join('')
  try {
    const d = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1))
    return json({ ativo: true, descricao: String(d.descricao ?? '').slice(0, 300), item: ITENS.includes(d.item) ? d.item : '', gravidade: d.gravidade ?? '' })
  } catch {
    return json({ ativo: true, descricao: texto.slice(0, 300) })
  }
})
