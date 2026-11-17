import { useEffect, useState } from 'react'
import { IMPACTOS } from './lib/analise'
import {
  AMBIENTES_SUGERIDOS, PRIORIDADES, TIPOS_ACEITOS, checklistDoAmbiente, maiorPrioridade, novoId,
  type Ambiente, type Midia, type Ocorrencia, type Unidade, type Vistoria,
} from './lib/modelo'
import { Campo, Selo, VerMidia } from './ui'

type Props = {
  v: Vistoria; u: Unidade; ocupado: boolean; bloqueada: boolean; pendente: boolean
  mudar: (v: Vistoria) => void
  anexar: (destino: { roomId?: string; ocorrencia?: Ocorrencia }, arquivos: File[]) => void
  salvar: () => void; concluir: () => void; excluir?: () => void; faltas?: string[]
}

/* Botões de resposta: rótulo curto no botão, resposta gravada igual ao relatório */
const BOTOES = [
  { r: 'OK', t: '✓ OK', c: 'ok' }, { r: 'Reparo', t: 'Reparo', c: 'reparo' }, { r: 'Substituição', t: 'Trocar', c: 'troca' },
  { r: 'Faltante', t: 'Falta', c: 'falta' }, { r: 'Não testado', t: 'N/T', c: 'neutro' }, { r: 'Não se aplica', t: 'N/A', c: 'neutro' },
]
const PROBLEMA = new Set(['Reparo', 'Substituição', 'Faltante'])
/* Itens que, com problema, já entram como ação imediata */
const IMEDIATOS = new Set(['Fiação visível', 'Tomadas e espelhos', 'Rede de frio', 'Energia e contingência', 'Registro de temperatura',
  'Coletor de perfurocortantes', 'Autoclave', 'Guarda restrita', 'Sinalização e saída de emergência', 'Teto e forro', 'Luz de emergência'])
const ACAO: Record<string, string> = { Reparo: 'Reparar', 'Substituição': 'Substituir', Faltante: 'Instalar ou repor' }
const PRECISA: Record<string, string> = { Reparo: 'precisa de reparo', 'Substituição': 'precisa ser substituído', Faltante: 'está faltando' }

function ocorrenciaAutomatica(amb: Ambiente, chave: string, item: string, resposta: string): Ocorrencia {
  return {
    id: novoId(), check: chave, item, point: amb.name, issue: `${item} ${PRECISA[resposta]}.`,
    action: `${ACAO[resposta]}: ${item.toLowerCase()}.`, reason: IMPACTOS[item] || 'Compromete o funcionamento do ambiente.',
    priority: IMEDIATOS.has(item) ? 'Imediata' : resposta === 'Faltante' ? 'Prioritária' : 'Programável',
    owner: '', due: '', media: [],
  }
}

/** Formulário de vistoria feito para o celular: quase tudo em botões. */
export function Formulario({ v, u, ocupado, bloqueada, pendente, mudar, anexar, salvar, concluir, excluir, faltas = [] }: Props) {
  const [outro, setOutro] = useState('')
  const [abertoAmb, setAbertoAmb] = useState<string>(v.rooms.at(-1)?.id ?? '')
  const [detalhe, setDetalhe] = useState<string>('')
  // campos que faltam (só enquanto continuarem vazios)
  const falta = (k: string) => faltas.includes(k) && (
    k === 'data' ? !v.inspected_on : k === 'vistoriador' ? !v.inspector.trim() : k === 'conteudo' ? !v.rooms.length && !(v.photos ?? []).length
      : k === 'validacao' ? !v.general_by.trim() : !v.rooms.some((r) => r.findings.some((f) => 'o:' + f.id === k && f.issue.trim())))
  // ao tentar concluir com falta: abre o ambiente e o problema em vermelho e rola até ele
  useEffect(() => {
    if (!faltas.length) return
    const prob = faltas.find((k) => k.startsWith('o:'))
    if (prob) {
      const amb = v.rooms.find((r) => r.findings.some((f) => 'o:' + f.id === prob))
      if (amb) { setAbertoAmb(amb.id); setDetalhe(prob.slice(2)) }
    }
    setTimeout(() => document.querySelector('.form-vistoria .falta')?.scrollIntoView({ block: 'center' }), 350)
  }, [faltas])
  const atual = v.rooms.find((r) => r.id === abertoAmb)
  const sugeridos = [...AMBIENTES_SUGERIDOS, ...(u.kind === 'CAPS' ? ['Sala de convivência', 'Dormitório'] : [])]

  function trocarAmbiente(a: Ambiente) { mudar({ ...v, rooms: v.rooms.map((r) => (r.id === a.id ? a : r)) }) }

  function adicionarAmbiente(nome: string) {
    let final = nome.trim()
    if (!final) return
    // "Consultório 01" repetido vira "Consultório 02", "03"...
    const base = final.replace(/\s*\d+$/, '')
    if (v.rooms.some((r) => r.name === final)) {
      const n = v.rooms.filter((r) => r.name.replace(/\s*\d+$/, '') === base).length + 1
      final = `${base} ${String(n).padStart(2, '0')}`
    }
    const novo: Ambiente = { id: novoId(), name: final, checks: {}, findings: [] }
    mudar({ ...v, rooms: [...v.rooms, novo] })
    setAbertoAmb(novo.id)
    setOutro('')
  }

  function responder(amb: Ambiente, grupo: string, item: string, resposta: string) {
    const chave = grupo + ' · ' + item
    const atual = amb.checks[chave]
    const nova = atual === resposta ? '' : resposta // tocar de novo desmarca
    let findings = amb.findings.filter((f) => !(f.check === chave && !f.media.length && !PROBLEMA.has(nova)))
    if (PROBLEMA.has(nova)) {
      const existente = findings.find((f) => f.check === chave)
      const auto = ocorrenciaAutomatica(amb, chave, item, nova)
      findings = existente
        ? findings.map((f) => (f.id === existente.id ? { ...f, issue: auto.issue, action: auto.action } : f))
        : [...findings, auto]
    }
    trocarAmbiente({ ...amb, checks: { ...amb.checks, [chave]: nova }, findings })
  }

  function tudoOk(amb: Ambiente, grupo: string, itens: string[]) {
    const checks = { ...amb.checks }
    for (const it of itens) if (!checks[grupo + ' · ' + it]) checks[grupo + ' · ' + it] = 'OK'
    trocarAmbiente({ ...amb, checks })
  }

  const fotos = v.photos ?? []
  function trocarFoto(m: Midia) { mudar({ ...v, photos: fotos.map((x) => (x.id === m.id ? m : x)) }) }

  /** Foto da galeria que mostra um problema: vira um problema do ambiente (a foto vai junto, sem duplicar). */
  function virarProblema(m: Midia) {
    let rooms = v.rooms
    let amb = rooms.find((r) => r.id === m.room)
    if (!amb) {
      amb = rooms.find((r) => r.name === 'Visão geral') ?? { id: novoId(), name: 'Visão geral', checks: {}, findings: [] }
      if (!rooms.includes(amb)) rooms = [...rooms, amb]
    }
    const item = m.item || ''
    const o: Ocorrencia = {
      id: novoId(), item, point: amb.name, issue: m.caption || m.ai || 'Problema registrado na foto.',
      action: item ? `Corrigir: ${item.toLowerCase()}.` : 'Verificar e corrigir o problema da foto.',
      priority: 'Prioritária', reason: (item && IMPACTOS[item]) || '', owner: '', due: '', media: [m],
    }
    const alvo = amb.id
    mudar({ ...v, photos: fotos.filter((x) => x.id !== m.id), rooms: rooms.map((r) => (r.id === alvo ? { ...r, findings: [...r.findings, o] } : r)) })
    setAbertoAmb(alvo)
    if (!m.caption && !m.ai) setDetalhe(o.id) // sem legenda: abre os detalhes para descrever, se quiser
  }

  function mudarOcorrencia(amb: Ambiente, o: Ocorrencia) { trocarAmbiente({ ...amb, findings: amb.findings.map((f) => (f.id === o.id ? o : f)) }) }

  return (
    <div className="form-vistoria" data-pendente={pendente ? 'sim' : 'nao'}>
      <div className="heading">
        <div>
          <p className="eyebrow">VISTORIA · DISTRITO {u.district}</p>
          <h1>{u.name}</h1>
          <p>{u.address}</p>
        </div>
        <div className="topo-acoes">
          <Selo value={v.status === 'completed' ? 'Concluída' : pendente ? 'Salvando…' : 'Rascunho salvo'} />
          {excluir && <button className="excluir" disabled={ocupado} onClick={excluir}>🗑️ Excluir rascunho</button>}
        </div>
      </div>
      {bloqueada && <div className="banner">Vistoria concluída: só a administração pode alterar.</div>}

      <fieldset disabled={ocupado || bloqueada} className="plain">
        <div className="panel grid dados-visita">
          <Campo label="Data" falta={falta('data')}><input type="date" value={v.inspected_on} onChange={(e) => mudar({ ...v, inspected_on: e.target.value })} /></Campo>
          <Campo label="Vistoriador(a)" falta={falta('vistoriador')}><input value={v.inspector} onChange={(e) => mudar({ ...v, inspector: e.target.value })} /></Campo>
        </div>

        {/* Ambientes: um por vez. Os botões de cima trocam de ambiente; "+ Ambiente" cria outro. */}
        <div className={'panel ambientes-bar' + (falta('conteudo') ? ' falta' : '')}>
          <h2 className="passo">Ambientes desta vistoria</h2>
          {falta('conteudo') && <p className="falta-msg">Adicione pelo menos um ambiente ou uma foto da visita para concluir.</p>}
          <div className="chips amb-chips">
            {v.rooms.map((r) => {
              const tot = Object.values(checklistDoAmbiente(r.name)).flat().length
              const fe = Object.values(r.checks).filter(Boolean).length
              return (
                <button key={r.id} className={'chip amb-chip' + (abertoAmb === r.id ? ' ativo' : '') + (fe >= tot ? ' completo' : '')} onClick={() => setAbertoAmb(r.id)}>
                  {r.name}<small>{fe}/{tot}{r.findings.length ? ` · ${r.findings.length}⚠️` : ''}</small>
                </button>
              )
            })}
            <button className={'chip amb-novo' + (!atual ? ' ativo' : '')} onClick={() => setAbertoAmb('')}>＋ Ambiente</button>
          </div>
        </div>

        {!atual ? (
          <div className="panel">
            <h2 className="passo">Em que ambiente você está?</h2>
            <p className="dica">Toque no ambiente. Se ele não estiver na lista, crie com o nome que é usado na unidade.</p>
            <div className="chips quebra">
              {sugeridos.filter((a) => !v.rooms.some((r) => r.name === a)).map((a) => <button key={a} className="chip" onClick={() => adicionarAmbiente(a)}>{a}</button>)}
            </div>
            <div className="criar-amb">
              <label htmlFor="novo-amb"><b>➕ Criar ambiente</b> <small>(vem com todas as opções)</small></label>
              <div className="row outro">
                <input id="novo-amb" value={outro} placeholder="Ex.: Sala de curativo, Triagem, Almoxarifado" onChange={(e) => setOutro(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') adicionarAmbiente(outro) }} />
                <button className="primary" disabled={!outro.trim()} onClick={() => adicionarAmbiente(outro)}>Criar</button>
              </div>
            </div>
          </div>
        ) : (() => {
          const amb = atual
          const grupos = checklistDoAmbiente(amb.name)
          const total = Object.values(grupos).flat().length
          const feitos = Object.values(amb.checks).filter(Boolean).length
          const i = v.rooms.findIndex((r) => r.id === amb.id)
          const proximo = v.rooms[i + 1]
          return (
            <section className="panel ambiente aberto" key={amb.id}>
              <div className="amb-cabeca">
                <span><strong>{amb.name}</strong><small>{feitos}/{total} itens · {amb.findings.length} problema(s)</small></span>
                <span className="amb-dir">{maiorPrioridade(amb.findings) && <Selo value={maiorPrioridade(amb.findings)} />}</span>
              </div>
              <i className="barra"><b style={{ width: `${(feitos / Math.max(1, total)) * 100}%` }} /></i>
              <details className="amb-opcoes">
                <summary>Renomear ou remover este ambiente</summary>
                <div className="row renomear">
                  <Campo label="Nome do ambiente"><input value={amb.name} onChange={(e) => trocarAmbiente({ ...amb, name: e.target.value })} /></Campo>
                  <button className="quiet" onClick={() => { if (confirm(`Tirar "${amb.name}" desta vistoria?`)) { mudar({ ...v, rooms: v.rooms.filter((r) => r.id !== amb.id) }); setAbertoAmb('') } }}>Remover ambiente</button>
                </div>
              </details>
                  {Object.entries(grupos).map(([grupo, itens]) => {
                    const resp = itens.filter((it) => amb.checks[grupo + ' · ' + it]).length
                    return (
                      <div className="grupo" key={grupo}>
                        <div className="grupo-topo">
                          <h3>{grupo} <small>{resp}/{itens.length}</small></h3>
                          {resp < itens.length && <button className="tudo-ok" onClick={() => tudoOk(amb, grupo, itens)}>✓ Restante OK</button>}
                        </div>
                        {itens.map((it) => {
                          const atual = amb.checks[grupo + ' · ' + it] ?? ''
                          return (
                            <div className="item-linha" key={it}>
                              <span className="item-nome">{it}</span>
                              <div className="botoes-resp" role="group" aria-label={it}>
                                {BOTOES.map((b) => (
                                  <button key={b.r} className={`resp ${b.c}${atual === b.r ? ' marcado' : ''}`} aria-pressed={atual === b.r}
                                    onClick={() => responder(amb, grupo, it, b.r)}>{b.t}</button>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}

                  <div className="grupo">
                    <div className="grupo-topo">
                      <h3>Problemas deste ambiente <small>{amb.findings.length}</small></h3>
                      <button className="tudo-ok" onClick={() => {
                        const o: Ocorrencia = { id: novoId(), item: '', point: amb.name, issue: '', action: '', priority: 'Prioritária', reason: '', owner: '', due: '', media: [] }
                        trocarAmbiente({ ...amb, findings: [...amb.findings, o] }); setDetalhe(o.id)
                      }}>+ Outro problema</button>
                    </div>
                    {!amb.findings.length && <p className="dica">Ao marcar Reparo, Trocar ou Falta, o problema entra aqui sozinho, já com a ação e o motivo.</p>}
                    {amb.findings.map((o) => (
                      <article className={'finding' + (falta('o:' + o.id) ? ' falta' : '')} key={o.id}>
                        {falta('o:' + o.id) && <p className="falta-msg">Descreva este problema em “Problema observado” para concluir.</p>}
                        <div className="heading"><strong>{o.item || 'Problema sem nome'}</strong><Selo value={o.priority} /></div>
                        <p className="f-resumo">{o.issue || 'Descreva o problema em Detalhes.'}</p>
                        <div className="botoes-resp" role="group" aria-label="Prioridade">
                          {PRIORIDADES.map((p) => <button key={p} className={`resp prio-${p === 'Imediata' ? 'i' : p === 'Prioritária' ? 'p' : 'g'}${o.priority === p ? ' marcado' : ''}`}
                            aria-pressed={o.priority === p} onClick={() => mudarOcorrencia(amb, { ...o, priority: p })}>{p}</button>)}
                        </div>
                        <div className="row acoes-f">
                          <label className="btn-arquivo">📷 Foto deste problema<input type="file" multiple accept={TIPOS_ACEITOS.join(',')} onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; anexar({ roomId: amb.id, ocorrencia: o }, l) }} /></label>
                          <button onClick={() => setDetalhe(detalhe === o.id ? '' : o.id)}>✏️ Detalhes</button>
                          <button className="quiet" onClick={() => trocarAmbiente({ ...amb, findings: amb.findings.filter((f) => f.id !== o.id) })}>Remover</button>
                        </div>
                        {detalhe === o.id && (
                          <div className="grid">
                            <Campo label="Item"><input value={o.item} placeholder="Ex.: fechadura" onChange={(e) => mudarOcorrencia(amb, { ...o, item: e.target.value })} /></Campo>
                            <Campo label="Local exato"><input value={o.point} onChange={(e) => mudarOcorrencia(amb, { ...o, point: e.target.value })} /></Campo>
                            <Campo label="Problema observado" falta={falta('o:' + o.id)}><textarea value={o.issue} onChange={(e) => mudarOcorrencia(amb, { ...o, issue: e.target.value })} /></Campo>
                            <Campo label="Ação indicada"><textarea value={o.action} onChange={(e) => mudarOcorrencia(amb, { ...o, action: e.target.value })} /></Campo>
                            <Campo label="Justificativa e observações"><textarea value={o.reason} onChange={(e) => mudarOcorrencia(amb, { ...o, reason: e.target.value })} /></Campo>
                            <Campo label="Setor responsável"><input value={o.owner} onChange={(e) => mudarOcorrencia(amb, { ...o, owner: e.target.value })} /></Campo>
                            <Campo label="Prazo"><input type="date" value={o.due} onChange={(e) => mudarOcorrencia(amb, { ...o, due: e.target.value })} /></Campo>
                          </div>
                        )}
                        {o.media.length > 0 && (
                          <div className="media">
                            {o.media.map((m) => (
                              <div key={m.id}>
                                <VerMidia media={m} />
                                <input className="legenda-foto" value={m.caption} placeholder="Legenda (opcional)" onChange={(e) => mudarOcorrencia(amb, { ...o, media: o.media.map((x) => (x.id === m.id ? { ...x, caption: e.target.value } : x)) })} />
                              </div>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
              <small className="dica">Evite fotografar pacientes, prontuários ou telas.</small>
              <div className="amb-fim">
                {proximo
                  ? <button className="primary" onClick={() => { setAbertoAmb(proximo.id); window.scrollTo(0, 0) }}>Próximo: {proximo.name} →</button>
                  : <button className="primary" onClick={() => { setAbertoAmb(''); window.scrollTo(0, 0) }}>✓ Terminei · ir para outro ambiente</button>}
              </div>
            </section>
          )
        })()}

        <details className={'panel' + (falta('validacao') ? ' falta' : '')} open={falta('validacao') || undefined}>
          <summary>A unidade inteira precisa de intervenção imediata?</summary>
          <div className="grid">
            <Campo label="Por quê"><textarea value={v.general_reason} onChange={(e) => mudar({ ...v, general_reason: e.target.value })} /></Campo>
            <Campo label="Responsável pela validação" falta={falta('validacao')}><input value={v.general_by} onChange={(e) => mudar({ ...v, general_by: e.target.value })} /></Campo>
          </div>
        </details>

        <section className="panel galeria">
          <div className="grupo-topo">
            <h2 className="passo">3. Fotos da visita <small>{fotos.length}</small></h2>
            <label className="btn-arquivo primary">📷 Adicionar fotos<input type="file" multiple accept={TIPOS_ACEITOS.join(',')} onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; anexar({ roomId: abertoAmb || undefined }, l) }} /></label>
          </div>
          <p className="dica">Tire quantas fotos quiser durante a visita: elas entram no relatório. Se a foto mostrar um problema, toque em <b>⚠️ É um problema</b>.</p>
          {fotos.length > 0 && (
            <div className="galeria-grade">
              {fotos.map((m) => (
                <div className="galeria-item" key={m.id}>
                  <VerMidia media={m} />
                  <input className="legenda-foto" value={m.caption} placeholder="O que mostra a foto (opcional)" onChange={(e) => trocarFoto({ ...m, caption: e.target.value })} />
                  <select className="legenda-foto" value={m.room ?? ''} onChange={(e) => trocarFoto({ ...m, room: e.target.value || undefined })} aria-label="Ambiente da foto">
                    <option value="">Visão geral da unidade</option>
                    {v.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <div className="row">
                    <button className="virar" onClick={() => virarProblema(m)}>⚠️ É um problema</button>
                    <button className="quiet" onClick={() => mudar({ ...v, photos: fotos.filter((x) => x.id !== m.id) })} aria-label="Tirar foto">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="barra-final no-print">
          <label className="btn-arquivo">📷 Foto<input type="file" multiple accept={TIPOS_ACEITOS.join(',')} onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; anexar({ roomId: abertoAmb || undefined }, l) }} /></label>
          <button disabled={!pendente} onClick={salvar}>Salvar</button>
          <button className="primary" onClick={concluir}>✓ Concluir<span className="so-pc"> e gerar relatório</span></button>
        </div>
      </fieldset>
    </div>
  )
}
