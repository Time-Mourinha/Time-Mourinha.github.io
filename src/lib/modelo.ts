import unidadesJson from '../data/unidades.json'

export type Unidade = { id: number; name: string; district: string; kind: string; address: string; cnes: string; status: string }
export type Midia = { id: string; type: string; name: string; caption: string; path?: string; ai?: string }
export type Ocorrencia = {
  id: string; check?: string; item: string; point: string; issue: string; action: string; priority: string
  reason: string; owner: string; due: string; media: Midia[]
}
export type Ambiente = { id: string; name: string; checks: Record<string, string>; findings: Ocorrencia[] }
export type Vistoria = {
  id: string; unit_id: number; owner?: string; inspected_on: string; inspector: string
  status: 'draft' | 'completed'; rooms: Ambiente[]; general_reason: string; general_by: string; updated_at?: string; created_at?: string
}
export type Perfil = { id: string; email: string; approved: boolean; role: 'inspector' | 'admin'; needs_code: boolean; created_at?: string }

/** Catálogo das 80 unidades dos oito distritos sanitários (lista da SMS de 13/11/2026). */
export const UNIDADES = unidadesJson as Unidade[]

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

export const AMBIENTES_SUGERIDOS = ['Área externa', 'Recepção', 'Consultório 01', 'Vacinação', 'Farmácia', 'Sanitário acessível', 'Odontologia', 'Esterilização', 'Abrigo de resíduos']

export const novoId = () => crypto.randomUUID()
export const hoje = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())
export const dataBR = (iso: string) => iso.split('-').reverse().join('/')

export function maiorPrioridade(ocorrencias: Ocorrencia[]): string {
  return PRIORIDADES.find((p) => ocorrencias.some((o) => o.priority === p)) ?? ''
}

export function resumoPrioridade(v: Vistoria): string {
  if (v.general_reason && v.general_by) return 'Intervenção imediata na unidade'
  const todas = v.rooms.flatMap((r) => r.findings)
  return maiorPrioridade(todas) === 'Imediata' ? 'Imediata localizada' : maiorPrioridade(todas)
}

export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
export const LIMITE_BYTES = 50 * 1024 * 1024
