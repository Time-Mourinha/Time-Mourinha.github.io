import { useState } from 'react'
import { problemasDaRede, ranking } from './lib/analise'
import { PRIORIDADES, dataBR, type Unidade, type Vistoria } from './lib/modelo'
import { Campo, Selo } from './ui'

export type SecaoPainel = 'ranking' | 'problemas' | 'imediatas' | 'distritos' | 'sem'

/** Painel da rede: piores unidades, problemas mais frequentes e situação por distrito. */
export function Painel({ unidades, vistorias, abrirRelatorio, secao, mudarSecao }: {
  unidades: Unidade[]; vistorias: Vistoria[]; abrirRelatorio: (id: string) => void; secao: SecaoPainel; mudarSecao: (s: SecaoPainel) => void
}) {
  const [distrito, setDistrito] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const distritos = [...new Set(unidades.map((u) => u.district))]
  const recorte = vistorias.filter((v) => (!de || v.inspected_on >= de) && (!ate || v.inspected_on <= ate))
  const todas = ranking(unidades, recorte)
  const linhas = todas.filter((l) => !distrito || l.unidade.district === distrito)
  const doDistrito = unidades.filter((u) => !distrito || u.district === distrito)
  const problemas = problemasDaRede(linhas, 10)
  const maxPontos = Math.max(1, ...linhas.map((l) => l.resumo.pontos))
  const imediatas = linhas.reduce((s, l) => s + (l.resumo.porPrioridade['Imediata'] ?? 0), 0)
  const verificados = linhas.reduce((s, l) => s + l.resumo.respondidos, 0)
  const comProblema = linhas.reduce((s, l) => s + l.resumo.problemas, 0)
  const criticas = linhas.filter((l) => l.resumo.nivel.nome === 'Crítica').length
  const listaImediatas = linhas.flatMap((l) => l.vistoria.rooms.flatMap((amb) => amb.findings
    .filter((o) => o.priority === PRIORIDADES[0]).map((o) => ({ l, amb, o }))))
  const semVistoria = doDistrito.filter((u) => !linhas.some((l) => l.unidade.id === u.id))
  const SECOES: [SecaoPainel, string, string, number][] = [
    ['ranking', '🏆', 'Ranking', linhas.length], ['problemas', '⚠️', 'Problemas', problemas.length],
    ['imediatas', '🚨', 'Ações imediatas', listaImediatas.length], ['distritos', '🗺️', 'Por distrito', distritos.length],
    ['sem', '📭', 'Sem vistoria', semVistoria.length],
  ]

  return (
    <>
      <div className="heading"><div>
        <p className="eyebrow">PAINEL DA REDE</p>
        <h1>Situação das unidades</h1>
        <p>Com base na última vistoria concluída de cada unidade.</p>
      </div></div>

      <div className="panel filters no-print">
        <Campo label="Distrito"><select value={distrito} onChange={(e) => setDistrito(e.target.value)}><option value="">Todos</option>{distritos.map((d) => <option key={d}>{d}</option>)}</select></Campo>
        <Campo label="De"><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
        <Campo label="Até"><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
      </div>

      <div className="kpis-painel">
        <div><strong>{linhas.length}<small>/{doDistrito.length}</small></strong><span>unidades vistoriadas</span>
          <i className="barra"><b style={{ width: `${(linhas.length / Math.max(1, doDistrito.length)) * 100}%` }} /></i></div>
        <div className="k-critica"><strong>{criticas}</strong><span>em situação crítica</span></div>
        <div className="k-imediata"><strong>{imediatas}</strong><span>ações imediatas pedidas</span></div>
        <div><strong>{verificados ? Math.round((comProblema / verificados) * 100) : 0}%</strong><span>dos itens verificados com problema</span></div>
      </div>

      <div className="secoes" role="tablist" aria-label="O que ver">
        {SECOES.map(([id, ic, t, n]) => (
          <button key={id} role="tab" aria-selected={secao === id} className={'secao-btn' + (secao === id ? ' ativo' : '')} onClick={() => mudarSecao(id)}>
            <span aria-hidden="true">{ic}</span>{t}<small>{n}</small>
          </button>
        ))}
      </div>

      {!linhas.length && secao !== 'sem' && secao !== 'distritos' ? <div className="panel"><p>Ainda não há vistorias concluídas neste recorte. O painel se monta sozinho conforme as vistorias forem concluídas.</p></div> : (
        <>
          {secao === 'ranking' && (
            <section className="panel">
            <h2>Ranking: unidades em pior situação</h2>
            <p className="legenda">Índice de criticidade: ação imediata vale 10 pontos, prioritária 5, programável 2; item faltante 3, substituição 2, reparo 1; intervenção na unidade inteira, 20.</p>
            <ol className="ranking">
              {linhas.slice(0, 15).map((l, i) => (
                <li key={l.unidade.id}>
                  <span className="pos">{i + 1}º</span>
                  <div className="r-corpo">
                    <div className="r-topo"><strong>{l.unidade.name}</strong><span className={'nivel ' + l.resumo.nivel.classe}>{l.resumo.nivel.nome}</span></div>
                    <i className="barra"><b className={l.resumo.nivel.classe} style={{ width: `${(l.resumo.pontos / maxPontos) * 100}%` }} /></i>
                    <p>Distrito {l.unidade.district} · {l.unidade.kind} · vistoria de {dataBR(l.vistoria.inspected_on)} · <strong>{l.resumo.pontos} pontos</strong> ·
                      {' '}{l.resumo.porPrioridade['Imediata'] ?? 0} imediata(s), {l.resumo.problemas} item(ns) com problema</p>
                  </div>
                  <button className="no-print" onClick={() => abrirRelatorio(l.vistoria.id)}>Relatório</button>
                </li>
              ))}
            </ol>
            </section>
          )}
          {secao === 'problemas' && (
          <section className="panel">
            <h2>Principais problemas na rede</h2>
            <p className="legenda">Itens com problema mais frequentes, contando cada unidade uma vez, e o que eles causam no atendimento.</p>
            <div className="problemas-rede">
              {problemas.map((p) => (
                <article key={p.item}>
                  <div className="r-topo"><strong>{p.item}</strong><span className="badge">{p.unidades.size} unidade(s)</span></div>
                  <i className="barra"><b style={{ width: `${(p.unidades.size / Math.max(1, linhas.length)) * 100}%` }} /></i>
                  <p className="p-impacto"><span>O que causa:</span> {p.impacto || 'Ver detalhes nas vistorias.'}</p>
                  <small>{Object.entries(p.respostas).map(([k, n]) => `${k}: ${n}`).join(' · ')}</small>
                </article>
              ))}
            </div>
          </section>
          )}
          {secao === 'imediatas' && (
          <section className="panel">
            <h2>Ações imediatas pedidas</h2>
            <p className="legenda">Problemas marcados como Imediata na última vistoria de cada unidade.</p>
            {!listaImediatas.length && <p>Nenhuma ação imediata pendente neste recorte.</p>}
            {listaImediatas.map(({ l, amb, o }) => (
              <article className="result" key={o.id}>
                <div className="r-topo"><strong>{l.unidade.name}</strong><Selo value={o.priority} /></div>
                <p>{amb.name}{o.point && o.point !== amb.name ? ' · ' + o.point : ''} — {o.item && <b>{o.item}: </b>}{o.issue}</p>
                <p><b>Ação:</b> {o.action}{o.owner && ` · ${o.owner}`}{o.due && ` · prazo ${dataBR(o.due)}`}</p>
                <button className="no-print" onClick={() => abrirRelatorio(l.vistoria.id)}>Relatório</button>
              </article>
            ))}
          </section>
          )}
          {secao === 'distritos' && (
          <section className="panel">
            <h2>Por distrito sanitário</h2>
            <table className="rel-tabela">
              <thead><tr><th>Distrito</th><th>Vistoriadas</th><th>Críticas</th><th>Ações imediatas</th><th>Índice médio</th></tr></thead>
              <tbody>
                {distritos.filter((d) => !distrito || d === distrito).map((d) => {
                  const ls = todas.filter((l) => l.unidade.district === d)
                  const total = unidades.filter((u) => u.district === d).length
                  const media = ls.length ? Math.round(ls.reduce((s, l) => s + l.resumo.pontos, 0) / ls.length) : 0
                  return (
                    <tr key={d}>
                      <td><strong>{d}</strong></td><td>{ls.length}/{total}</td>
                      <td>{ls.filter((l) => l.resumo.nivel.nome === 'Crítica').length}</td>
                      <td>{ls.reduce((s, l) => s + (l.resumo.porPrioridade['Imediata'] ?? 0), 0)}</td>
                      <td>{ls.length ? media : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
          )}
          {secao === 'sem' && (
          <section className="panel">
            <h2>Unidades ainda sem vistoria concluída <small>{semVistoria.length}</small></h2>
            {!semVistoria.length ? <p>Todas as unidades já foram vistoriadas.</p> : (
              <ul className="lista-sem">{semVistoria.map((u) => <li key={u.id}><b>{u.name}</b><small>Distrito {u.district} · {u.kind}</small></li>)}</ul>
            )}
          </section>
          )}
        </>
      )}
    </>
  )
}
