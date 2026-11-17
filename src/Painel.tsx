import { useState } from 'react'
import { problemasDaRede, ranking } from './lib/analise'
import { PRIORIDADES, dataBR, type Unidade, type Vistoria } from './lib/modelo'
import { Campo, Selo } from './ui'

export type SecaoPainel = 'visitadas' | 'ranking' | 'problemas' | 'imediatas' | 'distritos' | 'sem'

/** Painel da rede: piores unidades, problemas mais frequentes e situação por distrito. */
export function Painel({ unidades, vistorias, abrirRelatorio, secao, mudarSecao, iniciar }: {
  unidades: Unidade[]; vistorias: Vistoria[]; abrirRelatorio: (id: string) => void; secao: SecaoPainel; mudarSecao: (s: SecaoPainel) => void
  iniciar: (u: Unidade) => void
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
  // Uma unidade pode ser visitada quantas vezes for preciso: aqui entram todas as visitas concluídas.
  const visitadas = doDistrito.map((u) => ({
    u, visitas: recorte.filter((v) => v.status === 'completed' && v.unit_id === u.id)
      .sort((a, b) => (b.inspected_on + (b.updated_at ?? '')).localeCompare(a.inspected_on + (a.updated_at ?? ''))),
  })).filter((x) => x.visitas.length).sort((a, b) => b.visitas[0].inspected_on.localeCompare(a.visitas[0].inspected_on))
  const totalVisitas = visitadas.reduce((s, x) => s + x.visitas.length, 0)
  const SECOES: [SecaoPainel, string, string, number][] = [
    ['visitadas', '✅', 'Visitadas', visitadas.length], ['ranking', '🏆', 'Ranking', linhas.length], ['problemas', '⚠️', 'Problemas', problemas.length],
    ['imediatas', '🚨', 'Ações imediatas', listaImediatas.length], ['distritos', '🗺️', 'Por distrito', distritos.length],
    ['sem', '📭', 'Faltam', semVistoria.length],
  ]

  return (
    <>
      <div className="heading"><div>
        <p className="eyebrow">PAINEL DA REDE</p>
        <h1>Situação das unidades</h1>
        <p>Ranking e problemas com base na última vistoria concluída de cada unidade. Toque em qualquer número para ver a lista.</p>
      </div></div>

      <div className="panel filters no-print">
        <Campo label="Distrito"><select value={distrito} onChange={(e) => setDistrito(e.target.value)}><option value="">Todos</option>{distritos.map((d) => <option key={d}>{d}</option>)}</select></Campo>
        <Campo label="De"><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
        <Campo label="Até"><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
      </div>

      <div className="kpis-painel">
        <button onClick={() => mudarSecao('visitadas')}><strong>{linhas.length}<small>/{doDistrito.length}</small></strong><span>unidades vistoriadas · {totalVisitas} {totalVisitas === 1 ? 'visita' : 'visitas'}</span>
          <i className="barra"><b style={{ width: `${(linhas.length / Math.max(1, doDistrito.length)) * 100}%` }} /></i>
          <em>Ver as visitadas e as datas</em></button>
        <button className="k-falta" onClick={() => mudarSecao('sem')}><strong>{semVistoria.length}</strong><span>faltam vistoriar</span><em>Ver quais faltam</em></button>
        <button className="k-critica" onClick={() => mudarSecao('ranking')}><strong>{criticas}</strong><span>em situação crítica</span><em>Ver o ranking</em></button>
        <button className="k-imediata" onClick={() => mudarSecao('imediatas')}><strong>{imediatas}</strong><span>ações imediatas pedidas</span><em>Ver as ações</em></button>
        <button onClick={() => mudarSecao('problemas')}><strong>{verificados ? Math.round((comProblema / verificados) * 100) : 0}%</strong><span>dos itens verificados com problema</span><em>Ver os problemas</em></button>
      </div>

      <div className="secoes" role="tablist" aria-label="O que ver">
        {SECOES.map(([id, ic, t, n]) => (
          <button key={id} role="tab" aria-selected={secao === id} className={'secao-btn' + (secao === id ? ' ativo' : '')} onClick={() => mudarSecao(id)}>
            <span aria-hidden="true">{ic}</span>{t}<small>{n}</small>
          </button>
        ))}
      </div>

      {!linhas.length && secao !== 'sem' && secao !== 'distritos' && secao !== 'visitadas' ? <div className="panel"><p>Ainda não há vistorias concluídas neste recorte. O painel se monta sozinho conforme as vistorias forem concluídas.</p></div> : (
        <>
          {secao === 'visitadas' && (
          <section className="panel">
            <h2>Unidades visitadas <small>{visitadas.length} de {doDistrito.length} · {totalVisitas} {totalVisitas === 1 ? 'visita' : 'visitas'}</small></h2>
            <p className="dica">Cada unidade pode ser visitada quantas vezes for preciso. Toque numa data para abrir o relatório daquela visita.</p>
            {!visitadas.length ? <p>Nenhuma vistoria concluída neste recorte ainda.</p> : (
              <ul className="lista-visitadas">{visitadas.map(({ u, visitas }) => (
                <li key={u.id}>
                  <div><b>{u.name}</b><small>Distrito {u.district} · {u.kind} · {visitas.length} {visitas.length === 1 ? 'visita' : 'visitas'}</small></div>
                  <div className="datas">{visitas.map((v) => (
                    <button key={v.id} onClick={() => abrirRelatorio(v.id)} title={`Relatório de ${dataBR(v.inspected_on)}`}>📄 {dataBR(v.inspected_on)}{v.inspector ? <small>{v.inspector.split(' ')[0]}</small> : null}</button>
                  ))}<button className="nova" onClick={() => iniciar(u)}>＋ Nova visita</button></div>
                </li>
              ))}</ul>
            )}
            {semVistoria.length > 0 && <button className="ver-faltam" onClick={() => mudarSecao('sem')}>📭 Faltam {semVistoria.length} {semVistoria.length === 1 ? 'unidade' : 'unidades'}: ver quais</button>}
          </section>
          )}
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
            <h2>Faltam vistoriar <small>{semVistoria.length} de {doDistrito.length}</small></h2>
            {!semVistoria.length ? <p>Todas as unidades já foram vistoriadas.</p> : (<>
              <p className="dica">Toque na unidade para começar a vistoria.</p>
              <ul className="lista-sem">{semVistoria.map((u) => <li key={u.id}><button onClick={() => iniciar(u)}><b>{u.name}</b><small>Distrito {u.district} · {u.kind}</small><span>📝 Começar vistoria</span></button></li>)}</ul>
            </>
            )}
          </section>
          )}
        </>
      )}
    </>
  )
}
