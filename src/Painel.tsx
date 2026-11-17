import { useEffect, useState } from 'react'
import { REGRA_CLASSIFICACAO, problemasDaRede, ranking } from './lib/analise'
import { dataBR, type Unidade, type VisitaAntiga, type Vistoria } from './lib/modelo'
import { Campo } from './ui'

export type SecaoPainel = 'visitadas' | 'ranking' | 'problemas' | 'imediatas' | 'distritos' | 'sem'

/** Painel da rede: piores unidades, problemas mais frequentes e situação por distrito. */
export function Painel({ unidades, vistorias, historico = [], historicoDesde = '', pedirHistorico, abrirRelatorio, secao, mudarSecao, iniciar }: {
  unidades: Unidade[]; vistorias: Vistoria[]; historico?: VisitaAntiga[]; historicoDesde?: string; pedirHistorico?: (tudo: boolean) => void; abrirRelatorio: (id: string) => void; secao: SecaoPainel; mudarSecao: (s: SecaoPainel) => void
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
  const conta = (n: string) => linhas.filter((l) => l.resumo.nivel.nome === n).length
  const pessimas = conta('Péssima'), regulares = conta('Regular'), boas = conta('Boa')
  const avaliados = linhas.reduce((s, l) => s + l.resumo.avaliados, 0)
  const comProblema = linhas.reduce((s, l) => s + l.resumo.problemas, 0)
  // ambientes péssimos da última vistoria de cada unidade: o que resolver primeiro
  const listaImediatas = linhas.flatMap((l) => l.resumo.comProblema.filter((p) => p.situacao === 'Péssimo').map((p) => ({ l, p })))
  const semVistoria = doDistrito.filter((u) => !linhas.some((l) => l.unidade.id === u.id))
  // Uma unidade pode ser visitada quantas vezes for preciso: aqui entram todas as visitas concluídas.
  // relatórios completos + visitas antigas compactadas (só o resumo)
  type Visita = { id: string; inspected_on: string; inspector: string; antiga?: VisitaAntiga }
  const antigas = historico.filter((h) => (!de || h.inspected_on >= de) && (!ate || h.inspected_on <= ate))
  const visitadas = doDistrito.map((u) => ({
    u, visitas: [
      ...recorte.filter((v) => v.status === 'completed' && v.unit_id === u.id).map((v): Visita => ({ id: v.id, inspected_on: v.inspected_on, inspector: v.inspector })),
      ...antigas.filter((h) => h.unit_id === u.id).map((h): Visita => ({ id: h.id, inspected_on: h.inspected_on, inspector: h.inspector, antiga: h })),
    ].sort((a, b) => b.inspected_on.localeCompare(a.inspected_on)),
  })).filter((x) => x.visitas.length).sort((a, b) => b.visitas[0].inspected_on.localeCompare(a.visitas[0].inspected_on))
  const totalVisitas = visitadas.reduce((s, x) => s + x.visitas.length, 0)
  // visitas antigas (resumos) só são baixadas ao abrir "Visitadas"
  useEffect(() => { if (secao === 'visitadas' && !historicoDesde && pedirHistorico) pedirHistorico(false) }, [secao, historicoDesde])
  const SECOES: [SecaoPainel, string, string, number][] = [
    ['visitadas', '✅', 'Visitadas', visitadas.length], ['ranking', '🏆', 'Ranking', linhas.length], ['problemas', '⚠️', 'Problemas', problemas.length],
    ['imediatas', '🔴', 'Ambientes péssimos', listaImediatas.length], ['distritos', '🗺️', 'Por distrito', distritos.length],
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
        <button className="k-critica" onClick={() => mudarSecao('ranking')}><strong>{pessimas}</strong><span>🔴 unidades péssimas</span><em>Ver o ranking</em></button>
        <button className="k-imediata" onClick={() => mudarSecao('ranking')}><strong>{regulares}</strong><span>🟡 unidades regulares</span><em>Ver o ranking</em></button>
        <button className="k-boa" onClick={() => mudarSecao('ranking')}><strong>{boas}</strong><span>🟢 unidades boas</span><em>Ver o ranking</em></button>
        <button onClick={() => mudarSecao('problemas')}><strong>{avaliados ? Math.round((comProblema / avaliados) * 100) : 0}%</strong><span>dos ambientes avaliados estão regulares ou péssimos</span><em>Ver os problemas</em></button>
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
            <p className="dica">Cada unidade pode ser visitada quantas vezes for preciso. 📄 abre o relatório completo. 🗂️ é uma visita antiga: o relatório completo já foi para o PDF e aqui fica só o resumo (situação e principais problemas).</p>
            {!visitadas.length ? <p>Nenhuma vistoria concluída neste recorte ainda.</p> : (
              <ul className="lista-visitadas">{visitadas.map(({ u, visitas }) => (
                <li key={u.id}>
                  <div><b>{u.name}</b><small>Distrito {u.district} · {u.kind} · {visitas.length} {visitas.length === 1 ? 'visita' : 'visitas'}</small></div>
                  <div className="datas">{visitas.map((v) => v.antiga ? (
                    <span key={v.id} className="data-antiga" title={`Resumo guardado: ${v.antiga.summary.problemas ?? 0} problema(s)${v.antiga.summary.principais?.length ? ' · ' + v.antiga.summary.principais.join(', ') : ''}`}>
                      🗂️ {dataBR(v.inspected_on)}{v.antiga.summary.nivel ? <small>{v.antiga.summary.nivel}</small> : null}{v.inspector ? <small>{v.inspector.split(' ')[0]}</small> : null}</span>
                  ) : (
                    <button key={v.id} onClick={() => abrirRelatorio(v.id)} title={`Relatório de ${dataBR(v.inspected_on)}`}>📄 {dataBR(v.inspected_on)}{v.inspector ? <small>{v.inspector.split(' ')[0]}</small> : null}</button>
                  ))}<button className="nova" onClick={() => iniciar(u)}>＋ Nova visita</button></div>
                </li>
              ))}</ul>
            )}
            {pedirHistorico && historicoDesde && historicoDesde !== 'tudo' && (
              <button className="ver-faltam" onClick={() => pedirHistorico(true)}>🗂️ Mostrando visitas antigas desde {dataBR(historicoDesde)} · ver também as mais antigas</button>
            )}
            {semVistoria.length > 0 && <button className="ver-faltam" onClick={() => mudarSecao('sem')}>📭 Faltam {semVistoria.length} {semVistoria.length === 1 ? 'unidade' : 'unidades'}: ver quais</button>}
          </section>
          )}
          {secao === 'ranking' && (
            <section className="panel">
            <h2>Ranking: da pior para a melhor</h2>
            <p className="legenda">{REGRA_CLASSIFICACAO} Dentro de cada cor, vem primeiro quem tem o maior índice (0 = todos os ambientes bons; 100 = todos péssimos).</p>
            <ol className="ranking">
              {linhas.map((l, i) => (
                <li key={l.unidade.id}>
                  <span className="pos">{i + 1}º</span>
                  <div className="r-corpo">
                    <div className="r-topo"><strong>{l.unidade.name}</strong><span className={'nivel ' + l.resumo.nivel.classe}>{l.resumo.nivel.nome}</span></div>
                    <i className="barra"><b className={l.resumo.nivel.classe} style={{ width: `${Math.max(3, l.resumo.pontos)}%` }} /></i>
                    <p>Distrito {l.unidade.district} · {l.unidade.kind} · vistoria de {dataBR(l.vistoria.inspected_on)} · índice <strong>{l.resumo.pontos}</strong> ·
                      {' '}🔴 {l.resumo.pessimos} · 🟡 {l.resumo.regulares} · 🟢 {l.resumo.bons} ambiente(s)</p>
                  </div>
                  <button className="no-print" onClick={() => abrirRelatorio(l.vistoria.id)}>Relatório</button>
                </li>
              ))}
            </ol>
            </section>
          )}
          {secao === 'problemas' && (
          <section className="panel">
            <h2>Ambientes com mais problemas na rede</h2>
            <p className="legenda">Tipos de ambiente que aparecem como regular ou péssimo em mais unidades (cada unidade conta uma vez), e o que costuma causar no atendimento.</p>
            {!problemas.length && <p>Nenhum ambiente regular ou péssimo neste recorte.</p>}
            <div className="problemas-rede">
              {problemas.map((p) => (
                <article key={p.item}>
                  <div className="r-topo"><strong>{p.item}</strong><span className="badge">{p.unidades.size} unidade(s)</span></div>
                  <i className="barra"><b style={{ width: `${(p.unidades.size / Math.max(1, linhas.length)) * 100}%` }} /></i>
                  {p.impacto && <p className="p-impacto"><span>O que causa:</span> {p.impacto}</p>}
                  <small>🔴 péssimo em {p.respostas['Péssimo'] ?? 0} · 🟡 regular em {p.respostas['Regular'] ?? 0}</small>
                </article>
              ))}
            </div>
          </section>
          )}
          {secao === 'imediatas' && (
          <section className="panel">
            <h2>Ambientes péssimos: resolver primeiro</h2>
            <p className="legenda">Ambientes marcados como péssimos na última vistoria de cada unidade.</p>
            {!listaImediatas.length && <p>Nenhum ambiente péssimo neste recorte.</p>}
            {listaImediatas.map(({ l, p }) => (
              <article className="result" key={l.vistoria.id + p.roomId}>
                <div className="r-topo"><strong>{l.unidade.name}</strong><span className="nivel critica">🔴 {p.ambiente}</span></div>
                <p>{p.descricao}</p>
                {p.impacto[0] && <p className="p-impacto"><span>O que causa:</span> {p.impacto[0]}</p>}
                <button className="no-print" onClick={() => abrirRelatorio(l.vistoria.id)}>Relatório</button>
              </article>
            ))}
          </section>
          )}
          {secao === 'distritos' && (
          <section className="panel">
            <h2>Por distrito sanitário</h2>
            <table className="rel-tabela">
              <thead><tr><th>Distrito</th><th>Vistoriadas</th><th>🔴 Péssimas</th><th>🟡 Regulares</th><th>🟢 Boas</th><th>Índice médio</th></tr></thead>
              <tbody>
                {distritos.filter((d) => !distrito || d === distrito).map((d) => {
                  const ls = todas.filter((l) => l.unidade.district === d)
                  const total = unidades.filter((u) => u.district === d).length
                  const media = ls.length ? Math.round(ls.reduce((s, l) => s + l.resumo.pontos, 0) / ls.length) : 0
                  return (
                    <tr key={d}>
                      <td><strong>{d}</strong></td><td>{ls.length}/{total}</td>
                      <td>{ls.filter((l) => l.resumo.nivel.nome === 'Péssima').length}</td>
                      <td>{ls.filter((l) => l.resumo.nivel.nome === 'Regular').length}</td>
                      <td>{ls.filter((l) => l.resumo.nivel.nome === 'Boa').length}</td>
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
