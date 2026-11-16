import { useState } from 'react'
import { problemasDaRede, ranking } from './lib/analise'
import { dataBR, type Unidade, type Vistoria } from './lib/modelo'
import { Campo } from './ui'

/** Painel da rede: piores unidades, problemas mais frequentes e situação por distrito. */
export function Painel({ unidades, vistorias, abrirRelatorio }: { unidades: Unidade[]; vistorias: Vistoria[]; abrirRelatorio: (id: string) => void }) {
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

      {!linhas.length ? <div className="panel"><p>Ainda não há vistorias concluídas neste recorte. O painel se monta sozinho conforme as vistorias forem concluídas.</p></div> : (
        <>
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

          <section className="panel">
            <h2>Unidades ainda sem vistoria concluída <small>{doDistrito.length - linhas.length}</small></h2>
            <p className="legenda">{doDistrito.filter((u) => !linhas.some((l) => l.unidade.id === u.id)).map((u) => u.name).join(' · ') || 'Todas as unidades já foram vistoriadas.'}</p>
          </section>
        </>
      )}
    </>
  )
}
