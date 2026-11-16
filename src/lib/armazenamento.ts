import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Midia, Perfil, Unidade, Vistoria } from './modelo'

const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL as string | undefined
const CHAVE_PUBLICA = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Com as variáveis de ambiente, usa o Supabase; sem elas, abre o modo de demonstração. */
export const sb: SupabaseClient | null = URL_SUPABASE && CHAVE_PUBLICA ? createClient(URL_SUPABASE, CHAVE_PUBLICA) : null
export const DEMO = !sb
export const BUCKET = 'vistorias'

/* ------------------------------------------------------------------ demonstração (navegador) */
const CHAVE_DEMO = 'vistoria-maceio-demo'

export function lerDemo(): Vistoria[] {
  try { return JSON.parse(localStorage.getItem(CHAVE_DEMO) ?? '[]') as Vistoria[] } catch { return [] }
}
export function gravarDemo(v: Vistoria) {
  const agora = new Date().toISOString()
  v.updated_at = agora
  v.created_at ??= agora
  localStorage.setItem(CHAVE_DEMO, JSON.stringify([v, ...lerDemo().filter((x) => x.id !== v.id)]))
}

function abrirIdb(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const r = indexedDB.open(CHAVE_DEMO, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('media')
    r.onsuccess = () => ok(r.result)
    r.onerror = () => erro(r.error)
  })
}
export async function midiaDemo(id: string, arquivo?: Blob): Promise<Blob | undefined> {
  const db = await abrirIdb()
  return new Promise((ok, erro) => {
    const t = db.transaction('media', arquivo ? 'readwrite' : 'readonly')
    const req = arquivo ? t.objectStore('media').put(arquivo, id) : t.objectStore('media').get(id)
    t.oncomplete = () => { db.close(); ok(arquivo ? undefined : (req.result as Blob | undefined)) }
    t.onerror = t.onabort = () => { db.close(); erro(t.error) }
  })
}

/* ------------------------------------------------------------------ Supabase */
const falhou = (e: { message: string } | null) => { if (e) throw new Error(e.message) }

export async function carregarPerfil(): Promise<Perfil | null> {
  if (!sb) return null
  const { data: u } = await sb.auth.getUser()
  if (!u.user) return null
  const { data, error } = await sb.from('profiles').select('*').eq('id', u.user.id).maybeSingle()
  falhou(error)
  return data as Perfil | null
}

export async function carregarUnidades(): Promise<Unidade[]> {
  const { data, error } = await sb!.from('units').select('*').order('id')
  falhou(error)
  return (data ?? []) as Unidade[]
}

export async function carregarVistorias(): Promise<Vistoria[]> {
  const { data, error } = await sb!.from('inspections').select('*').order('inspected_on', { ascending: false })
  falhou(error)
  return (data ?? []) as Vistoria[]
}

export async function salvarVistoria(v: Vistoria) {
  const { owner: _dono, updated_at: _quando, created_at: _criada, ...resto } = v
  const { error } = await sb!.from('inspections').upsert(resto)
  falhou(error)
}

export function caminhoMidia(v: Vistoria, m: Midia, arquivo: File) {
  const ext = (arquivo.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${v.unit_id}/${v.id}/${m.id}.${ext}`
}

export async function enviarMidia(caminho: string, arquivo: File) {
  const { error } = await sb!.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
  falhou(error)
}

export async function urlMidia(caminho: string): Promise<string> {
  const { data, error } = await sb!.storage.from(BUCKET).createSignedUrl(caminho, 60 * 60)
  falhou(error)
  return data!.signedUrl
}

/* Acessos (administração) */
export type Atribuicao = { user_id: string; unit_id: number }
export async function carregarAcessos(): Promise<{ perfis: Perfil[]; atribuicoes: Atribuicao[] }> {
  const [p, a] = await Promise.all([
    sb!.from('profiles').select('*').order('created_at'),
    sb!.from('unit_assignments').select('user_id,unit_id'),
  ])
  falhou(p.error); falhou(a.error)
  return { perfis: (p.data ?? []) as Perfil[], atribuicoes: (a.data ?? []) as Atribuicao[] }
}
export async function salvarAcesso(perfil: Perfil, unidades: number[]) {
  const { error } = await sb!.from('profiles').update({ approved: perfil.approved, role: perfil.role }).eq('id', perfil.id)
  falhou(error)
  const { error: e2 } = await sb!.from('unit_assignments').delete().eq('user_id', perfil.id)
  falhou(e2)
  if (unidades.length) {
    const { error: e3 } = await sb!.from('unit_assignments').insert(unidades.map((u) => ({ user_id: perfil.id, unit_id: u })))
    falhou(e3)
  }
}

/** Primeira administradora: confirma o código de segurança enviado ao e-mail. */
export async function pedirCodigoAdmin() {
  const { error } = await sb!.auth.reauthenticate()
  falhou(error)
}
export async function confirmarCodigoAdmin(codigo: string): Promise<boolean> {
  const { data, error } = await sb!.rpc('confirm_admin_code', { code: codigo.replace(/\D/g, '') })
  falhou(error)
  return Boolean(data)
}

/** Pede à IA a descrição do problema visível na foto. Devolve null se a IA não estiver ligada ou falhar. */
export type DescricaoFoto = { descricao: string; item?: string; gravidade?: string }
export async function descreverFoto(caminho: string): Promise<DescricaoFoto | null> {
  try {
    const { data, error } = await sb!.functions.invoke('descrever', { body: { path: caminho } })
    if (error || !data?.ativo || !data.descricao) return null
    return data as DescricaoFoto
  } catch { return null }
}
