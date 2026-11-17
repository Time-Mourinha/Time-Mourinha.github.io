import { useEffect, useState } from 'react'
import {
  AMBIENTES_SUGERIDOS, SITUACOES, TIPOS_ACEITOS, fotosDaObservacao, fotosDoAmbiente, linkMapa, novoId, precisaFoto,
  type Ambiente, type Midia, type Observacao, type Unidade, type Vistoria,
} from './lib/modelo'
import { Campo, Selo, VerMidia } from './ui'

export type Destino = { roomId?: string; obsId?: string }
type Props = {
  v: Vistoria; u: Unidade; ocupado: boolean; bloqueada: boolean; pendente: boolean
  mudar: (v: Vistoria) => void
  anexar: (destino: Destino, arquivos: File[]) => void
  salvar: () => void; concluir: () => void; excluir?: () => void; faltas?: string[]
}

const QUEM = ['Funcionário(a)', 'Agente de saúde', 'Gestor(a) da unidade', 'Paciente', 'Vistoriador(a)']
const COR: Record<string, string> = { Bom: '🟢', Regular: '🟡', 'Péssimo': '🔴' }

/** O que ainda falta num ambiente para poder concluir (vazio = pronto). */
export function faltasDoAmbiente(v: Vistoria, amb: Ambiente): string[] {
  const f: string[] = []
  if (!amb.situacao) f.push('s:' + amb.id)
  // Regular ou Péssimo: pelo menos uma foto (a descrição vai em cada foto; o texto do ambiente é opcional)
  if (precisaFoto(amb.situacao) && !fotosDoAmbiente(v, amb.id).length) f.push('f:' + amb.id)
  for (const m of fotosDoAmbiente(v, amb.id)) if (!m.caption.trim()) f.push('l:' + m.id)
  return f
}
/** Observação é opcional: só a descrição de cada foto anexada a ela é obrigatória. */
export function faltasDaObservacao(v: Vistoria, o: Observacao): string[] {
  return fotosDaObservacao(v, o.id).filter((m) => !m.caption.trim()).map((m) => 'l:' + m.id)
}

/** Formulário de vistoria feito para o celular: cada ambiente é Bom, Regular ou Péssimo, com fotos descritas. */
export function Formulario({ v, u, ocupado, bloqueada, pendente, mudar, anexar, salvar, concluir, excluir, faltas = [] }: Props) {
  const [outro, setOutro] = useState('')
  const [abertoAmb, setAbertoAmb] = useState<string>(v.rooms.at(-1)?.id ?? '')
  // só fica vermelho o que continua faltando
  const pendentes = new Set([...v.rooms.flatMap((r) => faltasDoAmbiente(v, r)), ...(v.observacoes ?? []).flatMap((o) => faltasDaObservacao(v, o))])
  const falta = (k: string) => faltas.includes(k) && (
    k === 'data' ? !v.inspected_on : k === 'vistoriador' ? !v.inspector.trim() : k === 'conteudo' ? !v.rooms.length : pendentes.has(k))
  const faltasComObs = (amb: Ambiente) => [...faltasDoAmbiente(v, amb), ...(v.observacoes ?? []).filter((o) => o.room === amb.id).flatMap((o) => faltasDaObservacao(v, o))]
  const ambFalta = (amb: Ambiente) => faltas.length > 0 && faltasComObs(amb).some((k) => faltas.includes(k))

  // ao tentar concluir com falta: abre o primeiro ambiente com pendência e rola até o campo em vermelho
  useEffect(() => {
    if (!faltas.length) return
    const amb = v.rooms.find((r) => faltasComObs(r).some((k) => faltas.includes(k)))
    if (amb) setAbertoAmb(amb.id)
    setTimeout(() => document.querySelector('.form-vistoria .falta')?.scrollIntoView({ block: 'center' }), 350)
  }, [faltas])

  const atual = v.rooms.find((r) => r.id === abertoAmb)
  const sugeridos = [...AMBIENTES_SUGERIDOS, ...(u.kind === 'CAPS' ? ['Sala de convivência', 'Dormitório'] : [])]
  const fotos = v.photos ?? []
  const observacoes = v.observacoes ?? []

  // trocar de ambiente sempre leva ao topo do ambiente, para o vistoriador ver onde está
  function irPara(id: string) {
    setAbertoAmb(id)
    setTimeout(() => document.querySelector(id ? '.ambiente.aberto' : '.ambientes-bar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }
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
    const novo: Ambiente = { id: novoId(), name: final }
    mudar({ ...v, rooms: [...v.rooms, novo] })
    irPara(novo.id)
    setOutro('')
  }
  function trocarFoto(m: Midia) { mudar({ ...v, photos: fotos.map((x) => (x.id === m.id ? m : x)) }) }
  function tirarFoto(m: Midia) { if (confirm('Tirar esta foto?')) mudar({ ...v, photos: fotos.filter((x) => x.id !== m.id) }) }
  function trocarObs(o: Observacao) { mudar({ ...v, observacoes: observacoes.map((x) => (x.id === o.id ? o : x)) }) }
  function novaObs(room?: string) {
    const o: Observacao = { id: novoId(), quem: '', texto: '', room }
    mudar({ ...v, observacoes: [...observacoes, o] })
    setTimeout(() => document.getElementById('obs-' + o.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  }

  const botaoFoto = (destino: Destino, texto: string, classe = '') => (
    <label className={'btn-arquivo ' + classe}>{texto}<input type="file" multiple accept={TIPOS_ACEITOS.join(',')}
      onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; anexar(destino, l) }} /></label>
  )
  const listaFotos = (lista: Midia[], dica: string) => lista.length > 0 && (
    <div className="fotos-desc">
      {lista.map((m, n) => (
        <div className={'foto-desc' + (falta('l:' + m.id) ? ' falta' : '')} key={m.id}>
          <VerMidia media={m} />
          <div className="foto-desc-campos">
            <label>Foto {n + 1}: o que ela mostra? <b className="obrig">obrigatório</b>
              <textarea value={m.caption} placeholder={dica} onChange={(e) => trocarFoto({ ...m, caption: e.target.value })} />
            </label>
            {falta('l:' + m.id) && <em className="falta-msg">Descreva esta foto para concluir</em>}
            <button className="quiet" onClick={() => tirarFoto(m)}>🗑️ Tirar foto</button>
          </div>
        </div>
      ))}
    </div>
  )

  /** Lista de observações (de um ambiente ou gerais): opcionais, quantas quiser, cada uma removível. */
  const listaObs = (lista: Observacao[], titulo: string) => lista.map((o, n) => {
    const fotosObs = fotosDaObservacao(v, o.id)
    return (
      <article className="obs" key={o.id} id={'obs-' + o.id}>
        <div className="grupo-topo">
          <h3>{titulo} {n + 1}</h3>
          <button className="quiet" onClick={() => {
            if ((o.texto.trim() || fotosObs.length) && !confirm('Remover esta observação e as fotos dela?')) return
            mudar({ ...v, observacoes: observacoes.filter((x) => x.id !== o.id), photos: fotos.filter((m) => m.obs !== o.id) })
          }}>🗑️ Remover</button>
        </div>
        <p className="rotulo">Quem relatou <small>(opcional)</small></p>
        <div className="chips quebra">
          {QUEM.map((q) => <button key={q} className={'chip' + (o.quem === q ? ' ativo' : '')} onClick={() => trocarObs({ ...o, quem: o.quem === q ? '' : q })}>{q}</button>)}
        </div>
        <Campo label="Nome ou função (opcional)"><input value={QUEM.includes(o.quem) ? '' : o.quem} placeholder="Ex.: Maria, enfermeira" onChange={(e) => trocarObs({ ...o, quem: e.target.value })} /></Campo>
        <Campo label="Observação">
          <textarea value={o.texto} placeholder="Ex.: falta de insumos há duas semanas; a geladeira de vacinas desliga à noite" onChange={(e) => trocarObs({ ...o, texto: e.target.value })} />
        </Campo>
        <div className="row">{botaoFoto({ obsId: o.id, roomId: o.room }, '📎 Anexar foto')}</div>
        {listaFotos(fotosObs, 'Ex.: caixa de insumos vazia')}
      </article>
    )
  })

  return (
    <div className="form-vistoria" data-pendente={pendente ? 'sim' : 'nao'}>
      <div className="heading">
        <div>
          <p className="eyebrow">VISTORIA · DISTRITO {u.district}</p>
          <h1>{u.name}</h1>
          <p>{u.address} <a className="btn-mapa" href={linkMapa(u)} target="_blank" rel="noopener noreferrer">📍 Ver no mapa</a></p>
        </div>
        <div className="topo-acoes">
          <Selo value={v.status === 'completed' ? 'Concluída' : pendente ? 'Salvando…' : 'Rascunho salvo'} />
          {excluir && <button className="excluir" disabled={ocupado} onClick={excluir}>🗑️ {v.status === 'completed' ? 'Excluir relatório' : 'Excluir rascunho'}</button>}
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
          {falta('conteudo') && <p className="falta-msg">Adicione pelo menos um ambiente para concluir.</p>}
          <p className="dica">Toque em cada ambiente e diga como ele está. Todos precisam ter situação para concluir.</p>
          <div className="chips amb-chips">
            {v.rooms.map((r) => {
              const pronto = !faltasDoAmbiente(v, r).length
              return (
                <button key={r.id} className={'chip amb-chip' + (abertoAmb === r.id ? ' ativo' : '') + (pronto ? ' completo' : '') + (ambFalta(r) ? ' chip-falta' : '')}
                  onClick={() => irPara(r.id)} aria-current={abertoAmb === r.id || undefined}>
                  <span>{abertoAmb === r.id ? '📍 ' : ''}{r.name}</span>
                  <small>{abertoAmb === r.id ? 'você está aqui' : r.situacao ? `${COR[r.situacao]} ${r.situacao}${pronto ? '' : ' · falta'}` : '⚪ sem situação'}</small>
                </button>
              )
            })}
            <button className={'chip amb-novo' + (!atual ? ' ativo' : '')} onClick={() => irPara('')}>＋ Ambiente</button>
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
              <label htmlFor="novo-amb"><b>➕ Criar ambiente</b></label>
              <div className="row outro">
                <input id="novo-amb" value={outro} placeholder="Ex.: Sala de curativo, Triagem, Almoxarifado" onChange={(e) => setOutro(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') adicionarAmbiente(outro) }} />
                <button className="primary" disabled={!outro.trim()} onClick={() => adicionarAmbiente(outro)}>Criar</button>
              </div>
            </div>
          </div>
        ) : (() => {
          const amb = atual
          const i = v.rooms.findIndex((r) => r.id === amb.id)
          const proximo = v.rooms[i + 1]
          const anterior = v.rooms[i - 1]
          const fotosAmb = fotosDoAmbiente(v, amb.id)
          const ruim = precisaFoto(amb.situacao)
          const pronto = !faltasDoAmbiente(v, amb).length
          return (
            <section className="panel ambiente aberto" key={amb.id}>
              {/* Fica preso no topo enquanto rola: o vistoriador sempre vê em que ambiente está */}
              <div className="onde-estou" role="status" aria-live="polite">
                <button className="seta" disabled={!anterior} onClick={() => anterior && irPara(anterior.id)} aria-label={anterior ? `Voltar para ${anterior.name}` : 'Primeiro ambiente'}>◀</button>
                <div className="onde-texto">
                  <small>📍 Você está em · ambiente {i + 1} de {v.rooms.length}</small>
                  <strong>{amb.name}</strong>
                  <small>{amb.situacao ? `${COR[amb.situacao]} ${amb.situacao}` : '⚪ Diga como está'} · {fotosAmb.length} {fotosAmb.length === 1 ? 'foto' : 'fotos'}{pronto ? ' · ✅ pronto' : ''}</small>
                </div>
                <button className="seta" onClick={() => irPara(proximo ? proximo.id : '')} aria-label={proximo ? `Ir para ${proximo.name}` : 'Outro ambiente'}>{proximo ? '▶' : '＋'}</button>
              </div>
              <details className="amb-opcoes">
                <summary>Renomear ou remover este ambiente</summary>
                <div className="row renomear">
                  <Campo label="Nome do ambiente"><input value={amb.name} onChange={(e) => trocarAmbiente({ ...amb, name: e.target.value })} /></Campo>
                  <button className="quiet" onClick={() => {
                    if (!confirm(`Tirar "${amb.name}" desta vistoria? As fotos dele também saem.`)) return
                    const obsDele = new Set(observacoes.filter((o) => o.room === amb.id).map((o) => o.id))
                    mudar({ ...v, rooms: v.rooms.filter((r) => r.id !== amb.id), observacoes: observacoes.filter((o) => !obsDele.has(o.id)),
                      photos: fotos.filter((m) => (m.obs ? !obsDele.has(m.obs) : m.room !== amb.id)) }); setAbertoAmb('')
                  }}>Remover ambiente</button>
                </div>
              </details>

              <div className={'situacao-bloco' + (falta('s:' + amb.id) ? ' falta' : '')}>
                <h3>Como está {amb.name.toLowerCase().startsWith('área') ? 'a' : 'o ambiente'} {amb.name}?</h3>
                {falta('s:' + amb.id) && <em className="falta-msg">Escolha a situação para concluir</em>}
                <div className="botoes-situacao" role="group" aria-label="Situação do ambiente">
                  {SITUACOES.map((b) => (
                    <button key={b.s} className={`sit ${b.c}${amb.situacao === b.s ? ' marcado' : ''}`} aria-pressed={amb.situacao === b.s}
                      onClick={() => trocarAmbiente({ ...amb, situacao: amb.situacao === b.s ? undefined : b.s })}>{b.t}</button>
                  ))}
                </div>
                {ruim && <p className="aviso-obrig">Situação {amb.situacao?.toLowerCase()}: <b>anexe pelo menos uma foto</b> e <b>escreva em cada foto o que ela mostra</b>.</p>}
              </div>

              {amb.situacao && (
                <Campo label="Comentário sobre o ambiente (opcional)">
                  <textarea value={amb.descricao ?? ''} placeholder={ruim ? 'Ex.: infiltração no teto, mofo na parede, ar-condicionado sem funcionar' : 'Ex.: ambiente limpo e organizado'}
                    onChange={(e) => trocarAmbiente({ ...amb, descricao: e.target.value })} />
                </Campo>
              )}

              <div className={'fotos-amb' + (falta('f:' + amb.id) ? ' falta' : '')}>
                <div className="grupo-topo">
                  <h3>Fotos de {amb.name} <small>{fotosAmb.length}</small></h3>
                  {botaoFoto({ roomId: amb.id }, '📷 Adicionar foto', ruim && !fotosAmb.length ? 'primary' : '')}
                </div>
                {falta('f:' + amb.id) && <em className="falta-msg">Anexe pelo menos uma foto para concluir</em>}
                <p className="dica">Pode anexar quantas fotos quiser. Cada foto precisa de uma descrição. Evite fotografar pacientes, prontuários ou telas.</p>
                {listaFotos(fotosAmb, 'Ex.: mofo no canto do teto, perto da janela')}
              </div>

              <div className="obs-amb observacoes">
                <div className="grupo-topo">
                  <h3>💬 Observações de {amb.name} <small>{observacoes.filter((o) => o.room === amb.id).length}</small></h3>
                  <button onClick={() => novaObs(amb.id)}>＋ Observação</button>
                </div>
                <p className="dica">Opcional. Ex.: o que um funcionário relatou sobre este ambiente.</p>
                {listaObs(observacoes.filter((o) => o.room === amb.id), 'Observação')}
              </div>

              <div className="amb-fim">
                {proximo
                  ? <button className="primary" onClick={() => irPara(proximo.id)}>✓ Terminei {amb.name} · ir para {proximo.name}</button>
                  : <button className="primary" onClick={() => irPara('')}>✓ Terminei {amb.name} · ir para outro ambiente</button>}
              </div>
            </section>
          )
        })()}

        {/* Observações: o que funcionários, agentes ou gestores relataram na visita */}
        <section className="panel observacoes">
          <div className="grupo-topo">
            <h2 className="passo">💬 Observações gerais da visita <small>{observacoes.filter((o) => !o.room).length}</small></h2>
            <button className="primary" onClick={() => novaObs()}>＋ Observação geral</button>
          </div>
          <p className="dica">Opcional. Registre outras demandas e situações da unidade, relatadas por funcionários, agentes ou gestores. Crie quantas quiser e remova quando não precisar mais. Cada foto anexada precisa de descrição.</p>
          {listaObs(observacoes.filter((o) => !o.room), 'Observação geral')}
        </section>

        <div className="barra-final no-print">
          <button className="barra-onde" onClick={() => irPara(abertoAmb)}>{atual ? <>📍 Você está em <b>{atual.name}</b></> : <>📍 Escolha o ambiente acima</>}</button>
          {atual ? botaoFoto({ roomId: atual.id }, '📷 Foto') : <button disabled>📷 Foto</button>}
          <button disabled={!pendente} onClick={salvar}>Salvar</button>
          <button className="primary" onClick={concluir}>✓ Terminar<span className="so-pc"> vistoria</span></button>
        </div>
      </fieldset>
    </div>
  )
}
