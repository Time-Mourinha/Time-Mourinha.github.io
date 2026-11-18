import { CFG } from '../config'
import { URL_SUPABASE, midiaDemo, sb } from './armazenamento'
import type { Midia, Unidade, Vistoria } from './modelo'

/*
 * Relatórios e fotos vão para o Google Drive da Secretaria (por um Apps Script da própria conta do Drive).
 * No Supabase fica só o LINK (texto). O script só aceita quem está logado e aprovado neste app.
 */
export const DRIVE_LIGADO = Boolean(CFG.drive_url)
export type ArquivosRelatorio = { inspection_id: string; pasta_url: string; pdf_url: string; pdf_id: string; fotos: Record<string, string> }

function base64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function chamar(corpo: Record<string, unknown>) {
  const token = (await sb?.auth.getSession())?.data.session?.access_token
  if (!token) throw new Error('Entre de novo no app para enviar ao Drive.')
  // text/plain: o Apps Script aceita sem "preflight" de CORS
  const r = await fetch(CFG.drive_url, { method: 'POST', body: JSON.stringify({ ...corpo, token }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } })
  const d = await r.json().catch(() => ({ erro: 'O Drive não respondeu.' }))
  if (d.erro) throw new Error('Drive: ' + d.erro)
  return d as { id: string; url: string; pasta: string }
}

/** Marca que há envio em andamento (o app não se atualiza sozinho no meio de um envio). */
let enviando = 0
export const enviandoAgora = () => enviando > 0
async function comEnvio<T>(f: () => Promise<T>): Promise<T> {
  enviando++
  let trava: { release: () => Promise<void> } | null = null
  try { trava = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null } catch { /* sem trava de tela */ }
  try { return await f() } finally { enviando--; void trava?.release().catch(() => {}) }
}

/** Sobe UMA foto para o Drive assim que é anexada (assim ela nunca se perde no celular). Devolve o id no Drive. */
export async function enviarFoto(v: Vistoria, u: Unidade | undefined, m: Midia, blob: Blob): Promise<string> {
  return comEnvio(async () => {
    const ext = blob.type.includes('png') ? 'png' : 'jpg'
    const r = await chamar({ acao: 'enviar', vistoria: v.id, unidade: u?.name ?? `Unidade ${v.unit_id}`, data: v.inspected_on,
      nome: `Foto ${m.id.slice(0, 6)}.${ext}`, tipo: blob.type || 'image/jpeg', base64: base64(new Uint8Array(await blob.arrayBuffer())) })
    return r.id
  })
}

/** Busca no Drive uma foto que não está neste celular (para o PDF sair completo em qualquer aparelho).
 *  Passa pela função "foto" do servidor do app; se não der, tenta pelo Apps Script. */
export async function baixarFoto(id: string): Promise<Blob | null> {
  try {
    const sessao = (await sb?.auth.getSession())?.data.session
    if (URL_SUPABASE && sessao) {
      const r = await fetch(`${URL_SUPABASE}/functions/v1/foto?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${sessao.access_token}` } })
      if (r.ok && (r.headers.get('content-type') ?? '').startsWith('image/')) return await r.blob()
    }
  } catch { /* tenta o outro caminho */ }
  try {
    const r = (await chamar({ acao: 'baixar', id })) as unknown as { tipo: string; base64: string }
    if (!r.base64) return null
    const bin = atob(r.base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: r.tipo || 'image/jpeg' })
  } catch { return null }
}

/** Envia o que faltar (fotos ainda não enviadas) e o PDF; devolve os links para guardar. */
export async function enviarAoDrive(v: Vistoria, u: Unidade | undefined, pdf: { bytes: Uint8Array; nome: string }, progresso: (t: string) => void): Promise<ArquivosRelatorio> {
  return comEnvio(async () => {
    const base = { acao: 'enviar', vistoria: v.id, unidade: u?.name ?? `Unidade ${v.unit_id}`, data: v.inspected_on }
    const fotos: Record<string, string> = {}
    const lista = v.photos ?? []
    for (const [i, m] of lista.entries()) {
      if (m.drive) { fotos[m.id] = m.drive; continue }
      progresso(`Enviando ao Drive: foto ${i + 1} de ${lista.length}…`)
      const blob = await midiaDemo(m.id)
      if (!blob) continue
      const ext = blob.type.includes('png') ? 'png' : 'jpg'
      const r = await chamar({ ...base, nome: `Foto ${String(i + 1).padStart(2, '0')} - ${(m.caption || 'sem descrição').slice(0, 60)}.${ext}`, tipo: blob.type || 'image/jpeg',
        base64: base64(new Uint8Array(await blob.arrayBuffer())) })
      fotos[m.id] = r.id
    }
    progresso('Enviando o PDF ao Drive…')
    const r = await chamar({ ...base, nome: pdf.nome, tipo: 'application/pdf', base64: base64(pdf.bytes) })
    return { inspection_id: v.id, pasta_url: r.pasta, pdf_url: r.url, pdf_id: r.id, fotos }
  })
}

/** Manda a pasta da vistoria para a lixeira do Drive (recuperável por 30 dias). */
export async function apagarDoDrive(vistoriaId: string) {
  if (!DRIVE_LIGADO) return
  try { await chamar({ acao: 'apagar', vistoria: vistoriaId }) } catch { /* o relatório some do app mesmo assim */ }
}

/** Foto guardada no Drive, para mostrar no relatório do app. */
export const urlFotoDrive = (id: string) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`

export async function salvarArquivosRelatorio(a: ArquivosRelatorio) {
  if (!sb) return
  const { error } = await sb.from('report_files').upsert(a)
  if (error) throw new Error('Não deu para guardar os links do Drive: ' + error.message)
}
/** Relatórios que já estão no Drive, com as fotos que foram junto (id da foto → id no Drive). */
export async function arquivosNoDrive(ids: string[]): Promise<Map<string, Record<string, string>>> {
  const m = new Map<string, Record<string, string>>()
  if (!sb || !ids.length) return m
  const { data, error } = await sb.from('report_files').select('inspection_id,fotos').in('inspection_id', ids)
  if (error) throw error
  for (const r of (data ?? []) as { inspection_id: string; fotos: Record<string, string> }[]) m.set(r.inspection_id, r.fotos ?? {})
  return m
}
/** Quais destes relatórios já estão no Drive. */
export async function jaNoDrive(ids: string[]): Promise<Set<string>> {
  if (!sb || !ids.length) return new Set(ids)
  const { data, error } = await sb.from('report_files').select('inspection_id').in('inspection_id', ids)
  if (error) return new Set(ids) // na dúvida, não reenvia
  return new Set((data ?? []).map((x: { inspection_id: string }) => x.inspection_id))
}
export async function carregarArquivosRelatorio(id: string): Promise<ArquivosRelatorio | null> {
  if (!sb) return null
  const { data } = await sb.from('report_files').select('*').eq('inspection_id', id).maybeSingle()
  return (data as ArquivosRelatorio) ?? null
}
