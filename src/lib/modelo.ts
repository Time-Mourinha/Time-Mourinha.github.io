import unidadesJson from '../data/unidades.json'
import { CFG } from '../config'

export type Unidade = { id: number; name: string; district: string; kind: string; address: string; cnes: string; status: string }
export type Midia = { id: string; type: string; name: string; caption: string; path?: string; ai?: string; room?: string; item?: string; obs?: string }
export type Ocorrencia = {
  id: string; check?: string; item: string; point: string; issue: string; action: string; priority: string
  reason: string; owner: string; due: string; media: Midia[]
}
/** Como está o ambiente. Regular ou Péssimo exigem descrição e pelo menos uma foto. */
export type Situacao = 'Bom' | 'Regular' | 'Péssimo'
export const SITUACOES: { s: Situacao; t: string; c: string }[] = [
  { s: 'Bom', t: '🟢 Bom', c: 'bom' }, { s: 'Regular', t: '🟡 Regular', c: 'regular' }, { s: 'Péssimo', t: '🔴 Péssimo', c: 'pessimo' },
]
/** checks/findings: só em vistorias do modelo antigo (checklist item a item). */
export type Ambiente = { id: string; name: string; situacao?: Situacao; descricao?: string; checks?: Record<string, string>; findings?: Ocorrencia[] }
/** Observação (opcional): de um ambiente (room) ou geral da visita. Pode ter fotos; cada foto precisa de descrição. */
export type Observacao = { id: string; quem: string; texto: string; room?: string }
/** Observação com conteúdo (as vazias são ignoradas no relatório). */
export const obsComConteudo = (v: Vistoria, o: Observacao) => Boolean(o.texto.trim()) || (v.photos ?? []).some((m) => m.obs === o.id)
export type Vistoria = {
  id: string; unit_id: number; owner?: string; inspected_on: string; inspector: string
  status: 'draft' | 'completed'; rooms: Ambiente[]; photos?: Midia[]; observacoes?: Observacao[]; general_reason: string; general_by: string; updated_at?: string; created_at?: string
  summary?: ResumoCompacto
}
/** Resumo de poucos bytes que fica para sempre; o relatório completo antigo é apagado para o banco não encher. */
export type ResumoCompacto = { nivel: string; pontos: number; problemas: number; imediatas: number; principais: string[]; pdf?: string; pasta?: string }
/** Visita antiga já compactada: só data, quem fez e o resumo. */
export type VisitaAntiga = { id: string; unit_id: number; inspected_on: string; inspector: string; summary: Partial<ResumoCompacto> }
export type Perfil = { id: string; email: string; name?: string; approved: boolean; role: 'inspector' | 'admin'; needs_code: boolean; created_at?: string }

/** Catálogo das 80 unidades dos oito distritos sanitários (lista da SMS de 13/11/2026). */
export const UNIDADES = unidadesJson as Unidade[]

/** Link do Google Maps (abre o app no celular): nome da unidade + endereço, sem o CEP nem observações entre parênteses. */
export function linkMapa(u: Unidade) {
  const end = u.address.replace(/\([^)]*\)/g, '').replace(/,?\s*CEP:?\s*[\d.-]+/i, '').replace(/\s+/g, ' ').replace(/ ,/g, ',').trim()
  const q = end.toLowerCase().includes(CFG.cidade.toLowerCase()) ? end : `${end}, ${CFG.cidade} – ${CFG.uf}`
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(u.name + ', ' + q)
}

export const PRIORIDADES = ['Imediata', 'Prioritária', 'Programável']
export const RESPOSTAS = ['OK', 'Reparo', 'Substituição', 'Faltante', 'Não testado', 'Não se aplica']

export const CHECKLIST: Record<string, string[]> = {
  'Área externa': ['Calçada e rampa', 'Corrimãos', 'Fachada e cobertura', 'Estacionamento', 'Jardim e drenagem', 'Muro e grades', 'Portões'],
  'Conservação': ['Paredes e pintura', 'Umidade, mofo e trincas', 'Teto e forro', 'Piso, rodapés e soleiras', 'Revestimentos'],
  'Portas e janelas': ['Folhas e batentes', 'Vidros e esquadrias', 'Dobradiças', 'Maçanetas e trincos', 'Fechaduras e chaves', 'Vedação e grades'],
  'Elétrica e climatização': ['Lâmpadas e luminárias', 'Interruptores', 'Tomadas e espelhos', 'Fiação visível', 'Luz de emergência', 'Ar-condicionado', 'Ventiladores, filtros e drenos'],
  'Hidráulica e sanitários': ['Torneiras e pias', 'Vasos e assentos', 'Descargas', 'Ralos, vazamentos e escoamento', 'Barras e acessórios', 'Insumos de higiene'],
  'Mobília e equipamentos': ['Mesas e cadeiras', 'Armários e bancadas', 'Macas e equipamentos', 'Informática e rede'],
  'Uso e segurança': ['Passagem e acessibilidade', 'Sinalização e saída de emergência', 'Privacidade e limpeza'],
}

export const semAcento = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Itens extras conforme o nome do ambiente. */
export function itensDoAmbiente(nome: string): string[] {
  const n = semAcento(nome)
  if (n.includes('vacin')) return ['Rede de frio', 'Registro de temperatura', 'Energia e contingência', 'Coletor de perfurocortantes']
  if (n.includes('esteriliz')) return ['Autoclave', 'Registros da esterilização', 'Fluxo de materiais']
  if (n.includes('odont')) return ['Cadeira e equipo', 'Compressor e vácuo', 'Sucção e refletor']
  if (n.includes('residu')) return ['Identificação e separação', 'Fechamento', 'Rota de coleta']
  if (n.includes('farmac')) return ['Estoque e conservação', 'Guichê acessível', 'Guarda restrita']
  return []
}

/* Que grupos e itens cada tipo de ambiente mostra. Ambiente criado com outro nome mostra a lista completa. */
const SO = (grupo: string, itens?: string[]) => [grupo, itens ?? CHECKLIST[grupo]] as const
const INTERNO_BASICO = [SO('Conservação'), SO('Portas e janelas'), SO('Elétrica e climatização')]
const PERFIS: [RegExp, (readonly [string, string[]])[]][] = [
  [/^area externa|^fachada|^estacionamento|^patio|^jardim/, [SO('Área externa'), SO('Elétrica e climatização', ['Lâmpadas e luminárias', 'Fiação visível'])]],
  [/^recepcao|^espera|^triagem|^acolhimento/, [...INTERNO_BASICO, SO('Mobília e equipamentos', ['Mesas e cadeiras', 'Armários e bancadas', 'Informática e rede']), SO('Uso e segurança')]],
  [/^consultorio|^sala de curativo|^curativo|^procedimento/, [...INTERNO_BASICO, SO('Hidráulica e sanitários', ['Torneiras e pias', 'Insumos de higiene']), SO('Mobília e equipamentos'), SO('Uso e segurança', ['Privacidade e limpeza'])]],
  [/^vacina/, [...INTERNO_BASICO, SO('Hidráulica e sanitários', ['Torneiras e pias', 'Insumos de higiene']), SO('Mobília e equipamentos', ['Mesas e cadeiras', 'Armários e bancadas', 'Informática e rede'])]],
  [/^farmacia|^almoxarifado/, [...INTERNO_BASICO, SO('Mobília e equipamentos', ['Armários e bancadas', 'Informática e rede']), SO('Uso e segurança', ['Passagem e acessibilidade', 'Privacidade e limpeza'])]],
  [/^sanitario|^banheiro|^wc/, [SO('Conservação'), SO('Portas e janelas', ['Folhas e batentes', 'Maçanetas e trincos', 'Fechaduras e chaves']), SO('Elétrica e climatização', ['Lâmpadas e luminárias', 'Interruptores', 'Tomadas e espelhos']), SO('Hidráulica e sanitários'), SO('Uso e segurança', ['Passagem e acessibilidade', 'Privacidade e limpeza'])]],
  [/^odonto/, [...INTERNO_BASICO, SO('Hidráulica e sanitários', ['Torneiras e pias', 'Ralos, vazamentos e escoamento', 'Insumos de higiene']), SO('Mobília e equipamentos', ['Armários e bancadas', 'Macas e equipamentos'])]],
  [/^esteriliza|^expurgo/, [...INTERNO_BASICO, SO('Hidráulica e sanitários', ['Torneiras e pias', 'Ralos, vazamentos e escoamento', 'Insumos de higiene']), SO('Mobília e equipamentos', ['Armários e bancadas'])]],
  [/^abrigo de residuos|^residuos|^lixo/, [SO('Conservação', ['Paredes e pintura', 'Piso, rodapés e soleiras']), SO('Portas e janelas', ['Folhas e batentes', 'Fechaduras e chaves', 'Vedação e grades'])]],
  [/^sala de convivencia|^dormitorio|^copa|^cozinha|^administracao|^sala de reuniao/, [...INTERNO_BASICO, SO('Mobília e equipamentos', ['Mesas e cadeiras', 'Armários e bancadas']), SO('Uso e segurança')]],
]

/** Checklist do ambiente: só o que existe naquele lugar (+ itens específicos, como rede de frio na vacinação). */
export function checklistDoAmbiente(nome: string): Record<string, string[]> {
  const n = semAcento(nome).trim()
  const perfil = PERFIS.find(([re]) => re.test(n))
  const base: Record<string, string[]> = perfil ? Object.fromEntries(perfil[1].map(([g, i]) => [g, [...i]])) : { ...CHECKLIST }
  const extras = itensDoAmbiente(nome)
  return extras.length ? { ...base, 'Itens do ambiente': extras } : base
}

export const AMBIENTES_SUGERIDOS = ['Área externa', 'Recepção', 'Consultório 01', 'Vacinação', 'Farmácia', 'Sanitário acessível', 'Odontologia', 'Esterilização', 'Abrigo de resíduos']

export const novoId = () => crypto.randomUUID()
export const hoje = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())
export const dataBR = (iso: string) => iso.split('-').reverse().join('/')

export function maiorPrioridade(ocorrencias: Ocorrencia[]): string {
  return PRIORIDADES.find((p) => ocorrencias.some((o) => o.priority === p)) ?? ''
}

/** Fotos de um ambiente ou de uma observação. */
export const fotosDoAmbiente = (v: Vistoria, roomId: string) => (v.photos ?? []).filter((m) => m.room === roomId && !m.obs)
export const fotosDaObservacao = (v: Vistoria, obsId: string) => (v.photos ?? []).filter((m) => m.obs === obsId)
export const precisaFoto = (s?: string) => s === 'Regular' || s === 'Péssimo'

export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
export const LIMITE_BYTES = 50 * 1024 * 1024
