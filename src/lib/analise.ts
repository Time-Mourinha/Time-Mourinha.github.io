import { PRIORIDADES, checklistDoAmbiente, semAcento, type Ocorrencia, type Unidade, type Vistoria } from './modelo'

/* Respostas do checklist que indicam problema, da mais grave para a mais leve */
export const RESPOSTAS_PROBLEMA = ['Faltante', 'Substituição', 'Reparo'] as const
const PESO_RESPOSTA: Record<string, number> = { Faltante: 3, 'Substituição': 2, Reparo: 1 }
const PESO_PRIORIDADE: Record<string, number> = { Imediata: 10, 'Prioritária': 5, 'Programável': 2 }

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

/** Palavras do campo "Item" de uma ocorrência que levam ao impacto correspondente. */
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
/** Acha o item do catálogo de impactos: primeiro pelo nome do item, depois pelo problema descrito e pelo local. */
function itemDaOcorrencia(o: Ocorrencia): string | undefined {
  if (o.check) return o.check.split(' · ').pop()
  for (const texto of [o.item, o.issue, o.point]) {
    const t = semAcento(texto || '')
    const achado = t && PALAVRAS.find(([re]) => re.test(t))
    if (achado) return achado[1]
  }
  return undefined
}
export function impactoDaOcorrencia(o: Ocorrencia): string {
  const item = itemDaOcorrencia(o)
  return item ? IMPACTOS[item] ?? '' : ''
}

/* ---------------------------------------------------------------- números de uma vistoria */
export type ProblemaChecklist = { ambiente: string; grupo: string; item: string; resposta: string; impacto: string; peso: number }
export type Resumo = {
  ambientes: number; respondidos: number; total: number; ok: number; problemas: number; naoTestados: number; naoSeAplica: number
  ocorrencias: number; porPrioridade: Record<string, number>; pontos: number; nivel: Nivel; listaChecklist: ProblemaChecklist[]
}
export type Nivel = { nome: 'Crítica' | 'Alta' | 'Moderada' | 'Baixa'; classe: string }

export function nivelDe(pontos: number, imediatas: number, geral: boolean): Nivel {
  if (geral || imediatas >= 2 || pontos >= 60) return { nome: 'Crítica', classe: 'critica' }
  if (imediatas >= 1 || pontos >= 30) return { nome: 'Alta', classe: 'alta' }
  if (pontos >= 10) return { nome: 'Moderada', classe: 'moderada' }
  return { nome: 'Baixa', classe: 'baixa' }
}

export function resumir(v: Vistoria): Resumo {
  const lista: ProblemaChecklist[] = []
  let respondidos = 0, total = 0, ok = 0, naoTestados = 0, naoSeAplica = 0
  for (const amb of v.rooms) {
    // itens do tipo de ambiente + qualquer outro item que tenha sido respondido
    const chaves = new Set(Object.entries(checklistDoAmbiente(amb.name)).flatMap(([g, its]) => its.map((it) => g + ' · ' + it)))
    for (const k of Object.keys(amb.checks)) if (amb.checks[k]) chaves.add(k)
    for (const chave of chaves) {
      {
        const [grupo, item] = chave.split(' · ')
        total++
        const r = amb.checks[chave]
        if (!r) continue
        respondidos++
        if (r === 'OK') ok++
        else if (r === 'Não testado') naoTestados++
        else if (r === 'Não se aplica') naoSeAplica++
        else if (PESO_RESPOSTA[r]) lista.push({ ambiente: amb.name, grupo, item, resposta: r, impacto: impactoDoItem(item), peso: PESO_RESPOSTA[r] })
      }
    }
  }
  const ocorr = v.rooms.flatMap((r) => r.findings)
  const porPrioridade = Object.fromEntries(PRIORIDADES.map((p) => [p, ocorr.filter((o) => o.priority === p).length]))
  const geral = Boolean(v.general_reason && v.general_by)
  const pontos = lista.reduce((s, p) => s + p.peso, 0) + ocorr.reduce((s, o) => s + (PESO_PRIORIDADE[o.priority] ?? 0), 0) + (geral ? 20 : 0)
  lista.sort((a, b) => b.peso - a.peso)
  return {
    ambientes: v.rooms.length, respondidos, total, ok, problemas: lista.length, naoTestados, naoSeAplica,
    ocorrencias: ocorr.length, porPrioridade, pontos, nivel: nivelDe(pontos, porPrioridade['Imediata'] ?? 0, geral), listaChecklist: lista,
  }
}

/** Principais problemas de uma vistoria: ocorrências (pela prioridade) e itens do checklist, agrupados com o impacto. */
export type Principal = { titulo: string; onde: string[]; gravidade: string; impacto: string; peso: number }
export function principaisProblemas(v: Vistoria, limite = 8): Principal[] {
  const mapa = new Map<string, Principal>()
  for (const amb of v.rooms) {
    for (const o of amb.findings) {
      const titulo = o.item.trim() || o.issue.trim().slice(0, 60) || 'Ocorrência'
      const chave = o.check ? 'c:' + o.check.split(' · ').pop() : 'o:' + semAcento(titulo)
      const atual = mapa.get(chave)
      const peso = PESO_PRIORIDADE[o.priority] ?? 1
      const onde = `${amb.name}${o.point ? ' · ' + o.point : ''}`
      if (atual) { atual.onde.push(onde); if (peso > atual.peso) { atual.peso = peso; atual.gravidade = o.priority } }
      else mapa.set(chave, { titulo, onde: [onde], gravidade: o.priority, impacto: impactoDaOcorrencia(o) || o.reason, peso: peso + 0.5 })
    }
  }
  for (const p of resumir(v).listaChecklist) {
    const chave = 'c:' + p.item
    const atual = mapa.get(chave)
    if (atual) { atual.onde.push(p.ambiente); atual.peso += p.peso / 2 }
    else mapa.set(chave, { titulo: p.item, onde: [p.ambiente], gravidade: p.resposta, impacto: p.impacto, peso: p.peso })
  }
  return [...mapa.values()].sort((a, b) => b.peso - a.peso || b.onde.length - a.onde.length).slice(0, limite)
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
  return [...ultima.values()].map((v) => ({ unidade: unidades.find((u) => u.id === v.unit_id)!, vistoria: v, resumo: resumir(v) }))
    .filter((l) => l.unidade)
    .sort((a, b) => b.resumo.pontos - a.resumo.pontos)
}

export type ProblemaRede = { item: string; unidades: Set<number>; respostas: Record<string, number>; impacto: string }
/** Itens com problema mais frequentes na rede (contando cada unidade uma vez). */
export function problemasDaRede(linhas: LinhaRanking[], limite = 10): ProblemaRede[] {
  const mapa = new Map<string, ProblemaRede>()
  for (const l of linhas) {
    for (const p of l.resumo.listaChecklist) {
      const r = mapa.get(p.item) ?? { item: p.item, unidades: new Set<number>(), respostas: {}, impacto: p.impacto }
      r.unidades.add(l.unidade.id)
      r.respostas[p.resposta] = (r.respostas[p.resposta] ?? 0) + 1
      mapa.set(p.item, r)
    }
    for (const amb of l.vistoria.rooms) {
      for (const o of amb.findings) {
        if (o.check) continue // já contado pelo checklist
        const item = itemDaOcorrencia(o)
        if (!item) continue
        const r = mapa.get(item) ?? { item, unidades: new Set<number>(), respostas: {}, impacto: IMPACTOS[item] ?? '' }
        r.unidades.add(l.unidade.id)
        r.respostas['Ocorrência'] = (r.respostas['Ocorrência'] ?? 0) + 1
        mapa.set(item, r)
      }
    }
  }
  return [...mapa.values()].sort((a, b) => b.unidades.size - a.unidades.size).slice(0, limite)
}
