import marca from './assets/marca.png'
import { impactoDaOcorrencia, principaisProblemas, resumir } from './lib/analise'
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
  const principais = principaisProblemas(v)
  const acoes = v.rooms.flatMap((amb) => amb.findings.map((o) => ({ amb, o })))
    .sort((a, b) => PRIORIDADES.indexOf(a.o.priority) - PRIORIDADES.indexOf(b.o.priority))
  const numero = v.id.slice(0, 8).toUpperCase()
  const pct = r.respondidos ? Math.round((r.problemas / r.respondidos) * 100) : 0
  let foto = 0

  return (
    <article className={`relatorio estilo-${estilo}`}>
      <div className="rel-capa">
        <img src={marca} alt="Prefeitura de Maceió — Cidade de Todos Nós" />
        <div>
          <p className="rel-orgao">Secretaria Executiva · Saúde</p>
          <h1>Relatório de Visita Técnica</h1>
          <p className="rel-sub">Vistoria de unidade de saúde · nº {numero} · emitido em {hojeBR()}</p>
        </div>
      </div>

      <section className="rel-bloco">
        <h2>1. Identificação</h2>
        <table className="rel-ficha"><tbody>
          <tr><th>Unidade</th><td colSpan={3}><strong>{u?.name ?? 'Unidade não encontrada'}</strong></td></tr>
          <tr><th>Tipo</th><td>{u?.kind}</td><th>Distrito sanitário</th><td>{u?.district}</td></tr>
          <tr><th>Endereço</th><td colSpan={3}>{u?.address}</td></tr>
          <tr><th>CNES</th><td>{u?.cnes || 'pendente'}</td><th>Data da vistoria</th><td>{dataBR(v.inspected_on)}</td></tr>
          <tr><th>Vistoriador(a)</th><td colSpan={3}>{v.inspector}</td></tr>
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
                <p className="p-onde">Onde: {[...new Set(p.onde)].join('; ')}</p>
                {p.impacto && <p className="p-impacto"><span>O que causa:</span> {p.impacto}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {acoes.length > 0 && (
        <section className="rel-bloco">
          <h2>4. Ações recomendadas</h2>
          <table className="rel-tabela">
            <thead><tr><th>Prioridade</th><th>Local</th><th>Problema</th><th>Ação indicada</th><th>Responsável</th><th>Prazo</th></tr></thead>
            <tbody>
              {acoes.map(({ amb, o }) => (
                <tr key={o.id}>
                  <td><Selo value={o.priority} /></td>
                  <td>{amb.name}{o.point && <><br /><small>{o.point}</small></>}</td>
                  <td>{o.item && <strong>{o.item}: </strong>}{o.issue}</td>
                  <td>{o.action}</td>
                  <td>{o.owner || '—'}</td>
                  <td>{o.due ? dataBR(o.due) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="rel-bloco">
        <h2>{acoes.length ? 5 : 4}. Detalhe por ambiente</h2>
        {v.rooms.map((amb, i) => {
          const probs = r.listaChecklist.filter((p) => p.ambiente === amb.name)
          const respostas = Object.values(amb.checks).filter(Boolean)
          const oks = respostas.filter((x) => x === 'OK').length
          return (
            <div className="rel-ambiente" key={amb.id}>
              <h3>{i + 1}. {amb.name}</h3>
              <p className="rel-mini">{respostas.length} itens verificados · {oks} adequados · {probs.length} com problema</p>
              {probs.length > 0 && (
                <table className="rel-tabela compacta">
                  <thead><tr><th>Item</th><th>Situação</th><th>O que causa</th></tr></thead>
                  <tbody>{probs.map((p) => <tr key={p.grupo + p.item}><td>{p.item}<br /><small>{p.grupo}</small></td><td><Selo value={p.resposta} /></td><td>{p.impacto}</td></tr>)}</tbody>
                </table>
              )}
              {amb.findings.map((o, n) => (
                <div className="rel-ocorrencia" key={o.id}>
                  <div className="p-topo"><strong>Ocorrência {n + 1}{o.item ? ` · ${o.item}` : ''}</strong><Selo value={o.priority} /></div>
                  <dl>
                    {o.point && <><dt>Local exato</dt><dd>{o.point}</dd></>}
                    <dt>Problema observado</dt><dd>{o.issue}</dd>
                    <dt>Ação indicada</dt><dd>{o.action}</dd>
                    {o.reason && <><dt>Justificativa</dt><dd>{o.reason}</dd></>}
                    {(impactoDaOcorrencia(o)) && <><dt>O que causa</dt><dd>{impactoDaOcorrencia(o)}</dd></>}
                    {(o.owner || o.due) && <><dt>Responsável e prazo</dt><dd>{[o.owner, o.due && dataBR(o.due)].filter(Boolean).join(' · ')}</dd></>}
                  </dl>
                  {o.media.length > 0 && (
                    <div className="rel-fotos">
                      {o.media.map((m) => { foto++; return <div className="rel-foto" key={m.id}><span className="f-num">Foto {foto}</span><VerMidia media={m} /></div> })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </section>

      <section className="rel-bloco rel-assinaturas">
        <div><span />{v.inspector || 'Vistoriador(a)'}<small>Vistoriador(a)</small></div>
        <div><span />Responsável pela unidade<small>Nome e matrícula</small></div>
        {v.general_by && <div><span />{v.general_by}<small>Validação da intervenção</small></div>}
      </section>
      <footer className="rel-rodape">Secretaria Executiva · Formulário de Vistoria Saúde · Relatório nº {numero} · {u?.name}</footer>
    </article>
  )
}
