import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Midia, Perfil, Unidade, Vistoria } from './modelo'

const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL as string | undefined
const CHAVE_PUBLICA = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Com as variáveis de ambiente, usa o Supabase; sem elas, abre o modo de demonstração. */
export const sb: SupabaseClient | null = URL_SUPABASE && CHAVE_PUBLICA ? createClient(URL_SUPABASE, CHAVE_PUBLICA) : null
export const DEMO = !sb

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

// Alguns celulares (iPhone em certos modos, navegação privada) não têm IndexedDB:
// aí as fotos ficam só na memória enquanto o app está aberto. Nunca pode travar o app.
const memoria = new Map<string, Blob>()
let idbFalhou = false
function abrirIdb(): Promise<IDBDatabase | null> {
  if (idbFalhou || typeof indexedDB === 'undefined' || !indexedDB) return Promise.resolve(null)
  return new Promise((ok) => {
    try {
      const r = indexedDB.open(CHAVE_DEMO, 1)
      r.onupgradeneeded = () => r.result.createObjectStore('media')
      r.onsuccess = () => ok(r.result)
      r.onerror = r.onblocked = () => { idbFalhou = true; ok(null) }
    } catch { idbFalhou = true; ok(null) }
  })
}
/** Fotos ficam só neste aparelho (IndexedDB ou memória), enquanto a vistoria não vira PDF. Nada vai para servidor. */
export async function midiaDemo(id: string, arquivo?: Blob): Promise<Blob | undefined> {
  if (arquivo) memoria.set(id, arquivo)
  const db = await abrirIdb()
  if (!db) return arquivo ? undefined : memoria.get(id)
  return new Promise((ok) => {
    try {
      const t = db.transaction('media', arquivo ? 'readwrite' : 'readonly')
      const req = arquivo ? t.objectStore('media').put(arquivo, id) : t.objectStore('media').get(id)
      t.oncomplete = () => { db.close(); ok(arquivo ? undefined : ((req.result as Blob | undefined) ?? memoria.get(id))) }
      t.onerror = t.onabort = () => { db.close(); ok(arquivo ? undefined : memoria.get(id)) }
    } catch { db.close(); ok(arquivo ? undefined : memoria.get(id)) }
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

/** Administração: remove a conta (os relatórios concluídos dela ficam). */
export async function removerUsuario(id: string) {
  const { error } = await sb!.rpc('remover_usuario', { alvo: id })
  falhou(error)
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

/** Exclui um rascunho (e tenta apagar as fotos dele). */
export async function excluirVistoria(v: Vistoria) {
  await apagarFotosLocais(v).catch(() => undefined)
  if (!sb) {
    localStorage.setItem(CHAVE_DEMO, JSON.stringify(lerDemo().filter((x) => x.id !== v.id)))
    return
  }
  const { error } = await sb.from('inspections').delete().eq('id', v.id)
  falhou(error)
}

/** Ids de todas as fotos de uma vistoria (galeria + problemas). */
export const fotosDa = (v: Vistoria) => [...(v.photos ?? []), ...v.rooms.flatMap((r) => r.findings.flatMap((f) => f.media))]

/** Apaga deste aparelho as fotos de uma vistoria. Nunca dá erro. */
export async function apagarFotosLocais(v: Vistoria) {
  const ids = fotosDa(v).map((m) => m.id)
  if (!ids.length) return
  ids.forEach((id) => memoria.delete(id))
  const db = await abrirIdb()
  if (!db) return
  await new Promise<void>((ok) => {
    try {
      const t = db.transaction('media', 'readwrite')
      ids.forEach((id) => t.objectStore('media').delete(id))
      t.oncomplete = t.onerror = t.onabort = () => { db.close(); ok() }
    } catch { db.close(); ok() }
  })
}

/** Há fotos desta vistoria ainda guardadas neste aparelho? */
export async function temFotosLocais(v: Vistoria): Promise<boolean> {
  for (const m of fotosDa(v)) if (await midiaDemo(m.id).catch(() => undefined)) return true
  return false
}

/** Limpeza: vistorias concluídas há mais de 24 h não deixam fotos no aparelho. */
export async function limparFotosAntigas(vistorias: Vistoria[]) {
  const limite = Date.now() - 24 * 3600e3
  try {
    for (const v of vistorias) if (v.status === 'completed' && v.updated_at && Date.parse(v.updated_at) < limite) await apagarFotosLocais(v)
  } catch { /* limpeza nunca atrapalha o uso */ }
}
