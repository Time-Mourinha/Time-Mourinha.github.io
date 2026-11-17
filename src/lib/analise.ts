import { fotosDoAmbiente, obsComConteudo, semAcento, type ResumoCompacto, type Situacao, type Unidade, type Vistoria } from './modelo'


/** O que cada problema causa no funcionamento da unidade (linguagem simples, para o relatório). */
export const IMPACTOS: Record<string, string> = {
  'Calçada e rampa': 'Dificulta ou impede a chegada de cadeirantes, idosos e gestantes e aumenta o risco de queda na entrada.',
  'Corrimãos': 'Pacientes com mobilidade reduzida ficam sem apoio e correm risco de queda; descumpre a norma de acessibilidade.',
  'Fachada e cobertura': 'Permite infiltração e queda de reboco; em dias de chuva, salas podem ficar fora de uso.',
  'Estacionamento': 'Atrapalha o embarque e desembarque de pacientes e a chegada de ambulâncias.',
  'Jardim e drenagem': 'Água parada favorece o mosquito da dengue e leva umidade para as paredes; pode alagar a entrada.',
  'Muro e grades': 'Expõe equipe, pacientes e patrimônio a furtos e invasões.',
  'Portões': 'Controle de acesso falho; a unidade fica vulnerável fora do horário.',
  'Paredes e pintura': 'Superfícies danificadas são difíceis de limpar e desinfetar e passam imagem de abandono.',
  'Umidade, mofo e trincas': 'O mofo agrava doenças respiratórias de pacientes e servidores; trincas podem indicar problema estrutural.',
  'Teto e forro': 'Risco de queda de placas e de goteiras sobre pessoas e equipamentos; salas podem ser interditadas.',
  'Piso, rodapés e soleiras': 'Causa quedas e tropeços e atrapalha a passagem de cadeiras de rodas e macas.',
  'Revestimentos': 'Peças soltas ou quebradas acumulam sujeira e podem ferir.',
  'Folhas e batentes': 'O ambiente não fecha direito: perde privacidade, segurança e climatização.',
  'Vidros e esquadrias': 'Risco de cortes e entrada de chuva; o ar-condicionado perde eficiência.',
  'Dobradiças': 'Portas emperram ou soltam, atrapalhando o fluxo de pacientes e a saída em emergência.',
  'Maçanetas e trincos': 'Salas não fecham por dentro: consultas e exames sem privacidade.',
  'Fechaduras e chaves': 'Medicamentos, insumos e documentos ficam sem guarda segura.',
  'Vedação e grades': 'Entrada de insetos, chuva e pessoas não autorizadas.',
  'Lâmpadas e luminárias': 'Iluminação ruim prejudica exames, curativos e a leitura de receitas.',
  'Interruptores': 'Risco de choque elétrico e salas sem luz.',
  'Tomadas e espelhos': 'Risco de choque e de curto-circuito; equipamentos ficam sem ligação segura.',
  'Fiação visível': 'Risco de choque elétrico e de incêndio. Exige correção imediata.',
  'Luz de emergência': 'Numa queda de energia, a unidade fica no escuro durante procedimentos e na saída das pessoas.',
  'Ar-condicionado': 'Calor excessivo em consultórios e salas; pode estragar vacinas e medicamentos sensíveis à temperatura.',
  'Ventiladores, filtros e drenos': 'Ar com poeira e gotejamento; favorece mofo e contaminação do ambiente.',
  'Torneiras e pias': 'Sem lavagem correta das mãos, aumenta o risco de infecção entre pacientes.',
  'Vasos e assentos': 'Sanitário interditado: pacientes e servidores ficam sem banheiro.',
  'Descargas': 'Mau cheiro e banheiro fora de uso.',
  'Ralos, vazamentos e escoamento': 'Piso molhado causa quedas; há desperdício de água e surgimento de mofo.',
  'Barras e acessórios': 'Idosos e pessoas com deficiência ficam sem apoio no banheiro; risco de queda.',
  'Insumos de higiene': 'Sem sabonete, papel ou álcool, falha o controle de infecção.',
  'Mesas e cadeiras': 'Atendimento desconfortável e pacientes esperando em pé.',
  'Armários e bancadas': 'Material guardado de forma inadequada; dificulta a limpeza e a organização.',
  'Macas e equipamentos': 'Exames e procedimentos ficam adiados ou inseguros.',
  'Informática e rede': 'Atrasa marcação, prontuário eletrônico e registros do e-SUS, gerando filas.',
  'Passagem e acessibilidade': 'Barreiras para cadeira de rodas e maca; atrasa a saída em emergência.',
  'Sinalização e saída de emergência': 'Em incêndio ou pânico, as pessoas não encontram a saída com segurança.',
  'Privacidade e limpeza': 'Expõe o paciente e aumenta o risco de infecção.',
  'Rede de frio': 'Risco de perder vacinas e de suspender a vacinação da área.',
  'Registro de temperatura': 'Sem prova de que as vacinas ficaram na temperatura certa; lotes podem ser descartados.',
  'Energia e contingência': 'Uma queda de energia pode estragar todo o estoque de vacinas.',
  'Coletor de perfurocortantes': 'Risco de acidente com agulhas para a equipe e para o pessoal da limpeza.',
  'Autoclave': 'Sem esterilização, procedimentos e atendimento odontológico são suspensos.',
  'Registros da esterilização': 'Não há como comprovar que o material foi esterilizado.',
  'Fluxo de materiais': 'Material sujo cruza com material limpo: risco de infecção.',
  'Cadeira e equipo': 'O atendimento odontológico fica suspenso.',
  'Compressor e vácuo': 'O consultório odontológico não funciona.',
  'Sucção e refletor': 'Procedimentos odontológicos ficam inseguros ou suspensos.',
  'Identificação e separação': 'Resíduo infectante misturado ao lixo comum: risco sanitário e de autuação.',
  'Fechamento': 'Pessoas e animais acessam resíduos infectantes.',
  'Rota de coleta': 'O lixo passa por áreas de atendimento.',
  'Estoque e conservação': 'Medicamentos podem estragar ou vencer, faltando na entrega aos pacientes.',
  'Guichê acessível': 'Pessoas em cadeira de rodas não conseguem ser atendidas na farmácia.',
  'Guarda restrita': 'Risco de desvio de medicamentos controlados.',
}

/** Palavras da descrição que levam ao impacto correspondente. */
const PALAVRAS: [RegExp, string][] = [
  [/geladeira|camara fria|vacina|termometro/, 'Rede de frio'],
  [/fechadur|chave|cadeado/, 'Fechaduras e chaves'], [/macaneta|trinco/, 'Maçanetas e trincos'], [/dobradic/, 'Dobradiças'],
  [/vidro|janela|esquadri/, 'Vidros e esquadrias'], [/porta|batente/, 'Folhas e batentes'], [/grade/, 'Vedação e grades'],
  [/fio|fiacao|cabo eletr/, 'Fiação visível'], [/tomada/, 'Tomadas e espelhos'], [/interruptor/, 'Interruptores'],
  [/lampada|luminaria|ilumina/, 'Lâmpadas e luminárias'], [/emergencia/, 'Luz de emergência'],
  [/ar.condicionado|split|climatiz/, 'Ar-condicionado'], [/ventilador|filtro|dreno/, 'Ventiladores, filtros e drenos'],
  [/torneira|pia|lavatorio/, 'Torneiras e pias'], [/vaso|assento/, 'Vasos e assentos'], [/descarga/, 'Descargas'],
  [/vazament|ralo|esgoto|infiltr/, 'Ralos, vazamentos e escoamento'], [/barra/, 'Barras e acessórios'],
  [/sabonete|papel|alcool|higien/, 'Insumos de higiene'], [/mofo|umidade|trinca|rachadur/, 'Umidade, mofo e trincas'],
  [/forro|teto|goteira|telhad/, 'Teto e forro'], [/piso|rodape|soleira|ceramic/, 'Piso, rodapés e soleiras'],
  [/parede|pintura/, 'Paredes e pintura'], [/rampa|calcada/, 'Calçada e rampa'], [/corrima/, 'Corrimãos'],
  [/maca|equipamento|balanca|autoclave/, 'Macas e equipamentos'], [/computador|internet|rede|impressora/, 'Informática e rede'],
  [/cadeira|mesa|longarina/, 'Mesas e cadeiras'], [/armario|bancada/, 'Armários e bancadas'],
  [/extintor|saida|sinaliza/, 'Sinalização e saída de emergência'], [/muro/, 'Muro e grades'], [/portao/, 'Portões'],
]

export function impactoDoItem(item: string): string {
  return IMPACTOS[item] ?? ''
}
/** O que o problema descrito causa: procura palavras da descrição (ex.: "mofo", "fiação") no catálogo de impactos. */
export function impactosDoTexto(texto: string, limite = 2): string[] {
  const t = semAcento(texto || '')
  const achados = t ? PALAVRAS.filter(([re]) => re.test(t)).map(([, item]) => IMPACTOS[item]).filter(Boolean) : []
  return [...new Set(achados)].slice(0, limite)
}

/* ---------------------------------------------------------------- números de uma vistoria */
export type AmbienteComProblema = { ambiente: string; situacao: Situacao; descricao: string; impacto: string[]; fotos: number; roomId: string }
export type Nivel = { nome: 'Boa' | 'Regular' | 'Péssima'; classe: 'baixa' | 'alta' | 'critica'; cor: 'verde' | 'amarelo' | 'vermelho' }
export type Resumo = {
  ambientes: number; avaliados: number; bons: number; regulares: number; pessimos: number; semAvaliacao: number
  fotos: number; observacoes: number; problemas: number; pontos: number; nivel: Nivel; comProblema: AmbienteComProblema[]
}
export const NIVEIS: Record<Nivel['nome'], Nivel> = {
  'Boa': { nome: 'Boa', classe: 'baixa', cor: 'verde' },
  'Regular': { nome: 'Regular', classe: 'alta', cor: 'amarelo' },
  'Péssima': { nome: 'Péssima', classe: 'critica', cor: 'vermelho' },
}
/**
 * Classificação da unidade pela situação dos ambientes:
 * 🔴 Péssima: 1/3 ou mais dos ambientes péssimos · 🟢 Boa: nenhum péssimo e no máximo 1/4 regular · 🟡 Regular: o resto.
 */
export function nivelDe(bons: number, regulares: number, pessimos: number): Nivel {
  const n = bons + regulares + pessimos
  if (!n) return NIVEIS['Regular']
  if (pessimos / n >= 1 / 3) return NIVEIS['Péssima']
  if (!pessimos && regulares / n <= 1 / 4) return NIVEIS['Boa']
  return NIVEIS['Regular']
}
export const REGRA_CLASSIFICACAO = '🔴 Péssima: um terço ou mais dos ambientes em situação péssima. 🟢 Boa: nenhum ambiente péssimo e no máximo um quarto regular. 🟡 Regular: os demais casos.'

export function resumir(v: Vistoria): Resumo {
  let bons = 0, regulares = 0, pessimos = 0, semAvaliacao = 0
  const comProblema: AmbienteComProblema[] = []
  for (const amb of v.rooms) {
    const s = amb.situacao
    if (s === 'Bom') bons++
    else if (s === 'Regular') regulares++
    else if (s === 'Péssimo') pessimos++
    else semAvaliacao++
    if (s === 'Regular' || s === 'Péssimo') {
      const fotos = fotosDoAmbiente(v, amb.id)
      comProblema.push({ ambiente: amb.name, situacao: s, descricao: amb.descricao?.trim() ?? '', roomId: amb.id, fotos: fotos.length,
        impacto: impactosDoTexto([amb.descricao, ...fotos.map((f) => f.caption)].join(' '), 2) })
    }
  }
  comProblema.sort((a, b) => (a.situacao === b.situacao ? 0 : a.situacao === 'Péssimo' ? -1 : 1))
  const avaliados = bons + regulares + pessimos
  // índice de 0 a 100: 0 = tudo bom; 100 = tudo péssimo
  const pontos = avaliados ? Math.round(((regulares + 2 * pessimos) / (2 * avaliados)) * 100) : 0
  return {
    ambientes: v.rooms.length, avaliados, bons, regulares, pessimos, semAvaliacao, fotos: (v.photos ?? []).length,
    observacoes: (v.observacoes ?? []).filter((o) => obsComConteudo(v, o)).length, problemas: regulares + pessimos, pontos, nivel: nivelDe(bons, regulares, pessimos), comProblema,
  }
}

/** Resumo pequeno guardado junto do relatório (e que fica quando o relatório antigo é apagado). */
export function compactar(v: Vistoria): ResumoCompacto {
  const r = resumir(v)
  return { nivel: r.nivel.nome, pontos: r.pontos, problemas: r.problemas, imediatas: r.pessimos,
    principais: r.comProblema.slice(0, 5).map((p) => `${p.ambiente} (${p.situacao.toLowerCase()})`) }
}

/* ---------------------------------------------------------------- rede inteira (painel) */
export type LinhaRanking = { unidade: Unidade; vistoria: Vistoria; resumo: Resumo }

/** Última vistoria concluída de cada unidade, da pior para a melhor. */
export function ranking(unidades: Unidade[], vistorias: Vistoria[]): LinhaRanking[] {
  const ultima = new Map<number, Vistoria>()
  for (const v of vistorias) {
    if (v.status !== 'completed') continue
    const a = ultima.get(v.unit_id)
    if (!a || v.inspected_on > a.inspected_on) ultima.set(v.unit_id, v)
  }
  const ordem = { critica: 0, alta: 1, baixa: 2 }
  return [...ultima.values()].map((v) => ({ unidade: unidades.find((u) => u.id === v.unit_id)!, vistoria: v, resumo: resumir(v) }))
    .filter((l) => l.unidade)
    .sort((a, b) => ordem[a.resumo.nivel.classe] - ordem[b.resumo.nivel.classe] || b.resumo.pontos - a.resumo.pontos || b.resumo.pessimos - a.resumo.pessimos)
}

/** Tipo do ambiente: "Consultório 03" e "Consultório 01" contam juntos. */
export const tipoDoAmbiente = (nome: string) => nome.replace(/\s*\d+$/, '').trim()

export type ProblemaRede = { item: string; unidades: Set<number>; respostas: Record<string, number>; impacto: string }
/** Tipos de ambiente com mais problemas na rede (cada unidade conta uma vez por tipo). */
export function problemasDaRede(linhas: LinhaRanking[], limite = 10): ProblemaRede[] {
  const mapa = new Map<string, ProblemaRede>()
  for (const l of linhas) {
    for (const p of l.resumo.comProblema) {
      const tipo = tipoDoAmbiente(p.ambiente)
      const r = mapa.get(semAcento(tipo)) ?? { item: tipo, unidades: new Set<number>(), respostas: {}, impacto: '' }
      if (!r.unidades.has(l.unidade.id)) { r.unidades.add(l.unidade.id); r.respostas[p.situacao] = (r.respostas[p.situacao] ?? 0) + 1 }
      if (!r.impacto && p.impacto[0]) r.impacto = p.impacto[0]
      mapa.set(semAcento(tipo), r)
    }
  }
  return [...mapa.values()].sort((a, b) => b.unidades.size - a.unidades.size || (b.respostas['Péssimo'] ?? 0) - (a.respostas['Péssimo'] ?? 0)).slice(0, limite)
}
