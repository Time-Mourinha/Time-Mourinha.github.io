import marca from './assets/marca.png'
import { principaisProblemas, resumir } from './lib/analise'
import { PRIORIDADES, dataBR, type Unidade, type Vistoria } from './lib/modelo'
import { Selo, VerMidia } from './ui'

export const ESTILOS_RELATORIO = [
  { id: 'institucional', nome: 'Institucional', desc: 'Faixa azul, formal, para ofício e apresentação' },
  { id: 'moderno', nome: 'Moderno', desc: 'Cartões claros com destaque laranja, para tela e reunião' },
  { id: 'compacto', nome: 'Compacto', desc: 'Preto e branco, denso, economiza papel e tinta' },
] as const
export type EstiloRelatorio = (typeof ESTILOS_RELATORIO)[number]['id']

const hojeBR = () => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio', dateStyle: 'long' }).format(new Date())

/** Relatório de visita técnica: pronto para imprimir em PDF ou apresentar. */
export function Relatorio({ vistoria: v, unidade: u, estilo }: { vistoria: Vistoria; unidade?: Unidade; estilo: EstiloRelatorio }) {
  const r = resumir(v)
  const principais = principaisProblemas(v, 6)
  const acoes = v.rooms.flatMap((amb) => amb.findings.map((o) => ({ amb, o })))
    .sort((a, b) => PRIORIDADES.indexOf(a.o.priority) - PRIORIDADES.indexOf(b.o.priority))
  const numero = v.id.slice(0, 8).toUpperCase()
  const pct = r.respondidos ? Math.round((r.problemas / r.respondidos) * 100) : 0
  // todas as fotos num só bloco, pequenas e numeradas (o relatório fica curto)
  // fotos da galeria da visita + fotos dos problemas, na ordem dos ambientes
  const ordem = (roomId?: string) => { const i = v.rooms.findIndex((r) => r.id === roomId); return i < 0 ? -1 : i }
  const fotos = [
    ...(v.photos ?? []).map((m) => ({ m, lugar: v.rooms.find((r) => r.id === m.room)?.name ?? 'Visão geral', titulo: '', pos: ordem(m.room) })),
    ...v.rooms.flatMap((amb, i) => amb.findings.flatMap((o) => o.media.map((m) => ({ m, lugar: amb.name, titulo: o.item || '', pos: i })))),
  ].sort((a, b) => a.pos - b.pos)

  return (
    <article className={`relatorio estilo-${estilo}`}>
      <div className="rel-capa">
        <img src={marca} alt="Prefeitura de Maceió — Cidade de Todos Nós" />
        <div>
          <p className="rel-orgao">Gabinete do Prefeito · Secretaria Executiva</p>
          <h1>Relatório de Visita Técnica</h1>
          <p className="rel-sub">Fiscalização da Saúde · vistoria de unidade de saúde · nº {numero} · emitido em {hojeBR()}</p>
        </div>
      </div>

      <section className="rel-bloco">
        <h2>1. Identificação</h2>
        <table className="rel-ficha"><tbody>
          <tr><th>Unidade</th><td colSpan={3}><strong>{u?.name ?? 'Unidade não encontrada'}</strong></td></tr>
          <tr><th>Tipo</th><td>{u?.kind}</td><th>Distrito sanitário</th><td>{u?.district}</td></tr>
          <tr><th>Endereço</th><td colSpan={3}>{u?.address}</td></tr>
          <tr><th>CNES</th><td>{u?.cnes || 'pendente'}</td><th>Data da vistoria</th><td>{dataBR(v.inspected_on)}</td></tr>
          <tr><th>Vistoriador(a)</th><td colSpan={3}>{v.inspector} · Secretaria Executiva</td></tr>
        </tbody></table>
      </section>

      <section className="rel-bloco">
        <h2>2. Resumo da situação</h2>
        <div className="rel-nivel">
          <span className={'nivel ' + r.nivel.classe}>Situação {r.nivel.nome.toLowerCase()}</span>
          <span>Índice de criticidade: <strong>{r.pontos}</strong> pontos</span>
          {v.general_reason && v.general_by && <Selo value="Intervenção imediata na unidade" />}
        </div>
        <div className="rel-kpis">
          <div><strong>{r.ambientes}</strong><span>ambientes vistoriados</span></div>
          <div><strong>{r.respondidos}</strong><span>itens verificados</span></div>
          <div><strong>{r.problemas}</strong><span>itens com problema ({pct}%)</span></div>
          <div className="k-imediata"><strong>{r.porPrioridade['Imediata'] ?? 0}</strong><span>ações imediatas</span></div>
          <div className="k-prioritaria"><strong>{r.porPrioridade['Prioritária'] ?? 0}</strong><span>ações prioritárias</span></div>
          <div><strong>{r.porPrioridade['Programável'] ?? 0}</strong><span>ações programáveis</span></div>
        </div>
        <p className="rel-texto">
          Foram vistoriados {r.ambientes} ambiente(s) e verificados {r.respondidos} itens: {r.ok} em condições adequadas, {r.problemas} com
          necessidade de reparo, substituição ou reposição{r.naoTestados ? `, e ${r.naoTestados} não testado(s)` : ''}. Foram registradas {r.ocorrencias} ocorrência(s)
          que pedem ação da gestão.
        </p>
        {v.general_reason && <p className="rel-alerta"><strong>Intervenção imediata na unidade inteira.</strong> {v.general_reason} — validação: {v.general_by}.</p>}
      </section>

      <section className="rel-bloco">
        <h2>3. Principais problemas e o que causam</h2>
        {!principais.length ? <p className="rel-texto">Nenhum problema registrado nesta vistoria.</p> : (
          <ol className="rel-principais">
            {principais.map((p) => (
              <li key={p.titulo}>
                <div className="p-topo"><strong>{p.titulo}</strong><Selo value={p.gravidade} /></div>
                <p className="p-onde">{[...new Set(p.onde)].join('; ')}{p.impacto && <> — <span className="p-causa">{p.impacto}</span></>}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {acoes.length > 0 && (
        <section className="rel-bloco">
          <h2>4. Ações recomendadas</h2>
          <table className="rel-tabela">
            <thead><tr><th>Prioridade</th><th>Local</th><th>Problema</th><th>Ação indicada</th><th>Responsável · prazo</th></tr></thead>
            <tbody>
              {acoes.map(({ amb, o }) => (
                <tr key={o.id}>
                  <td><Selo value={o.priority} /></td>
                  <td>{amb.name}{o.point && o.point !== amb.name && <><br /><small>{o.point}</small></>}</td>
                  <td>{o.item && <strong>{o.item}: </strong>}{o.issue}</td>
                  <td>{o.action}</td>
                  <td>{[o.owner, o.due && dataBR(o.due)].filter(Boolean).join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {fotos.length > 0 && (
        <section className="rel-bloco">
          <h2>{acoes.length ? 5 : 4}. Registro fotográfico</h2>
          <div className="rel-fotos">
            {fotos.map(({ m, lugar, titulo }, i) => (
              <div className="rel-foto" key={m.id}>
                <span className="f-num">Foto {i + 1}</span>
                <VerMidia media={{ ...m, caption: [lugar, titulo && !m.caption.includes(titulo) ? titulo : '', m.caption].filter(Boolean).join(' · ') }} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rel-bloco">
        <h2>{4 + (acoes.length ? 1 : 0) + (fotos.length ? 1 : 0)}. Itens verificados por ambiente</h2>
        <table className="rel-tabela compacta">
          <thead><tr><th>Ambiente</th><th>Verificados</th><th>Adequados</th><th>Com problema</th></tr></thead>
          <tbody>
            {v.rooms.map((amb) => {
              const respostas = Object.values(amb.checks).filter(Boolean)
              const probs = r.listaChecklist.filter((p) => p.ambiente === amb.name)
              return (
                <tr key={amb.id}>
                  <td><strong>{amb.name}</strong></td>
                  <td>{respostas.length}</td>
                  <td>{respostas.filter((x) => x === 'OK').length}</td>
                  <td>{probs.length ? probs.map((p) => `${p.item} (${p.resposta.toLowerCase()})`).join('; ') : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="rel-bloco rel-assinaturas">
        <div><span />{v.inspector || 'Vistoriador(a)'}<small>Vistoriador(a) da Secretaria Executiva</small></div>
        <div><span />Responsável pela unidade<small>Nome e matrícula</small></div>
        {v.general_by && <div><span />{v.general_by}<small>Validação da intervenção</small></div>}
      </section>
      <footer className="rel-rodape">Prefeitura de Maceió · Gabinete do Prefeito · Secretaria Executiva · Fiscalização da Saúde · Relatório nº {numero} · {u?.name}</footer>
    </article>
  )
}
