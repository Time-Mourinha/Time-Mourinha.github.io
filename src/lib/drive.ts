import { CFG } from '../config'
import { midiaDemo, sb } from './armazenamento'
import type { Unidade, Vistoria } from './modelo'

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

/** Envia as fotos e o PDF; devolve os links para guardar. */
export async function enviarAoDrive(v: Vistoria, u: Unidade | undefined, pdf: { bytes: Uint8Array; nome: string }, progresso: (t: string) => void): Promise<ArquivosRelatorio> {
  const base = { acao: 'enviar', vistoria: v.id, unidade: u?.name ?? `Unidade ${v.unit_id}`, data: v.inspected_on }
  const fotos: Record<string, string> = {}
  const lista = v.photos ?? []
  for (const [i, m] of lista.entries()) {
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
