import { useEffect, useRef, useState, type ReactNode } from 'react'
import marca from './assets/marca.png'
import {
  AMBIENTES_SUGERIDOS, CHECKLIST, LIMITE_BYTES, PRIORIDADES, RESPOSTAS, TIPOS_ACEITOS, UNIDADES, dataBR, hoje,
  itensDoAmbiente, maiorPrioridade, novoId, resumoPrioridade, semAcento,
  type Ambiente, type Midia, type Ocorrencia, type Perfil, type Unidade, type Vistoria,
} from './lib/modelo'
import {
  DEMO, caminhoMidia, carregarPerfil, carregarUnidades, carregarVistorias, enviarMidia, gravarDemo, lerDemo,
  midiaDemo, salvarVistoria, sb, urlMidia,
} from './lib/armazenamento'
import { Acessos } from './Acessos'
import { Entrada } from './Entrada'
import { Instalar } from './Instalar'

type Tela = 'unidades' | 'vistoria' | 'relatorios' | 'acessos'

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field">{label}{children}</label>
}

function Selo({ value }: { value: string }) {
  const classe = value.toLowerCase().includes('imediata') ? 'urgent' : value === 'Prioritária' ? 'priority' : ''
  return <span className={'badge ' + classe}>{value}</span>
}

function VerMidia({ media }: { media: Midia }) {
  const [url, setUrl] = useState('')
  const [falha, setFalha] = useState(false)
  useEffect(() => {
    let vivo = true
    let objeto = ''
    ;(async () => {
      try {
        if (media.path && !DEMO) {
          const u = await urlMidia(media.path)
          if (vivo) setUrl(u)
        } else {
          const blob = await midiaDemo(media.id)
          if (blob && vivo) { objeto = URL.createObjectURL(blob); setUrl(objeto) } else if (vivo) setFalha(true)
        }
      } catch { if (vivo) setFalha(true) }
    })()
    return () => { vivo = false; if (objeto) URL.revokeObjectURL(objeto) }
  }, [media.id, media.path])
  return (
    <figure>
      {url ? (media.type.startsWith('image/')
        ? <img src={url} alt={media.caption || media.name} />
        : <video src={url} controls preload="metadata" />)
        : <span>{falha ? 'Anexo indisponível' : 'Carregando anexo…'}</span>}
      <figcaption>{media.caption || media.name}
        {media.type.startsWith('video/') && <span className="print-only"> · vídeo disponível no aplicativo</span>}
      </figcaption>
    </figure>
  )
}

export default function App() {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [sessao, setSessao] = useState<boolean>(DEMO)
  const [carregando, setCarregando] = useState(!DEMO)
  const [unidades, setUnidades] = useState<Unidade[]>(DEMO ? UNIDADES : [])
  const [vistorias, setVistorias] = useState<Vistoria[]>(DEMO ? lerDemo() : [])
  const [tela, setTela] = useState<Tela>((location.hash.slice(1) as Tela) || 'unidades')
  const [aberta, setAberta] = useState<Vistoria | null>(null)
  const [relatorioId, setRelatorioId] = useState('')
  const [busca, setBusca] = useState('')
  const [distrito, setDistrito] = useState('')
  const [tipo, setTipo] = useState('')
  const [novoAmbiente, setNovoAmbiente] = useState('')
  const [fPrioridade, setFPrioridade] = useState('')
  const [fUnidade, setFUnidade] = useState('')
  const [fAmbiente, setFAmbiente] = useState('')
  const [fDe, setFDe] = useState('')
  const [fAte, setFAte] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [pendente, setPendente] = useState(false)
  const [pedidos, setPedidos] = useState(0)
  const versao = useRef(0)
  const fila = useRef<Promise<void>>(Promise.resolve())

  const admin = !DEMO && perfil?.role === 'admin' && perfil.approved
  const unidadeAberta = unidades.find((u) => u.id === aberta?.unit_id)
  const bloqueada = aberta?.status === 'completed' && !DEMO && !admin

  function ir(t: Tela) { location.hash = t; setTela(t); setErro(''); setAviso('') }

  useEffect(() => {
    const f = () => setTela((location.hash.slice(1) as Tela) || 'unidades')
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  // sessão do Supabase
  useEffect(() => {
    if (!sb) return
    sb.auth.getSession().then(({ data }) => { setSessao(Boolean(data.session)); if (!data.session) setCarregando(false) })
    const { data } = sb.auth.onAuthStateChange((evento, s) => {
      setSessao(Boolean(s))
      if (evento === 'PASSWORD_RECOVERY') {
        // link de "esqueci a senha": pede a nova senha na hora
        setTimeout(async () => {
          const nova = window.prompt('Digite a nova senha (mínimo de 8 caracteres):') ?? ''
          if (nova.length < 8) { setErro('Senha não alterada: use pelo menos 8 caracteres.'); return }
          const { error } = await sb!.auth.updateUser({ password: nova })
          if (error) setErro(error.message); else setAviso('Senha alterada.')
        }, 0)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  async function recarregar() {
    if (DEMO) return
    setCarregando(true)
    try {
      const p = await carregarPerfil()
      setPerfil(p)
      if (p?.approved) {
        const [u, v] = await Promise.all([carregarUnidades(), carregarVistorias()])
        setUnidades(u); setVistorias(v)
        if (p.role === 'admin') {
          const { count } = await sb!.from('profiles').select('id', { count: 'exact', head: true }).eq('approved', false).eq('needs_code', false)
          setPedidos(count ?? 0)
        }
      }
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar.') } finally { setCarregando(false) }
  }
  useEffect(() => { if (sessao && !DEMO) void recarregar() }, [sessao])

  async function executar(acao: () => Promise<void>) {
    setOcupado(true); setErro(''); setAviso('')
    try { await acao() } catch (e) {
      setErro(e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Falha ao executar a operação.')
    } finally { setOcupado(false) }
  }

  function lembrar(v: Vistoria) { setVistorias((l) => [v, ...l.filter((x) => x.id !== v.id)]) }

  async function gravar(v: Vistoria) {
    const p = fila.current.catch(() => {}).then(async () => {
      if (DEMO) gravarDemo(v); else await salvarVistoria(v)
      lembrar(v)
    })
    fila.current = p
    await p
  }

  // salvamento automático do rascunho
  useEffect(() => {
    if (!aberta || !pendente || ocupado || bloqueada) return
    const minha = versao.current
    const t = window.setTimeout(() => {
      gravar(aberta).then(() => { if (minha === versao.current) setPendente(false) })
        .catch((e: Error) => setErro('Rascunho ainda não salvo. ' + e.message))
    }, 900)
    return () => clearTimeout(t)
  }, [aberta, pendente, ocupado])

  useEffect(() => {
    if (!pendente) return
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [pendente])

  function mudar(v: Vistoria) { versao.current++; setAberta(v); setPendente(true) }

  function abrir(u: Unidade, existente?: Vistoria) {
    void executar(async () => {
      if (pendente && aberta && !bloqueada) await gravar(aberta)
      const v: Vistoria = existente ?? {
        id: novoId(), unit_id: u.id, inspected_on: hoje(), inspector: perfil?.email ?? '',
        status: 'draft', rooms: [], general_reason: '', general_by: '',
      }
      if (!existente) await gravar(v)
      setAberta(v); setPendente(false); setNovoAmbiente(''); ir('vistoria')
    })
  }

  function mudarAmbiente(a: Ambiente) { if (aberta) mudar({ ...aberta, rooms: aberta.rooms.map((r) => (r.id === a.id ? a : r)) }) }
  function mudarOcorrencia(a: Ambiente, o: Ocorrencia) { mudarAmbiente({ ...a, findings: a.findings.map((f) => (f.id === o.id ? o : f)) }) }

  async function anexar(a: Ambiente, o: Ocorrencia, arquivos: File[]) {
    if (!aberta || !arquivos.length) return
    const base = aberta
    await executar(async () => {
      if (base.status === 'draft' && pendente) { await gravar(base); setPendente(false) }
      let atual = base
      for (const arq of arquivos) {
        if (!TIPOS_ACEITOS.includes(arq.type) || arq.size > LIMITE_BYTES) throw new Error('Use JPG, PNG, WebP, MP4, WebM ou MOV de até 50 MB.')
        const m: Midia = { id: novoId(), type: arq.type, name: arq.name, caption: '' }
        if (DEMO) await midiaDemo(m.id, arq)
        else { m.path = caminhoMidia(atual, m, arq); await enviarMidia(m.path, arq) }
        const amb = atual.rooms.find((r) => r.id === a.id)!
        atual = { ...atual, rooms: atual.rooms.map((r) => (r.id === a.id
          ? { ...amb, findings: amb.findings.map((f) => (f.id === o.id ? { ...f, media: [...f.media, m] } : f)) } : r)) }
        setAberta(atual); setPendente(true)
        await gravar(atual); setPendente(false)
      }
      setAviso('Anexos salvos.')
    })
  }

  async function concluir() {
    if (!aberta) return
    await executar(async () => {
      if (!aberta.inspected_on || !aberta.inspector.trim() || !aberta.rooms.length) throw new Error('Preencha data, vistoriador e pelo menos um ambiente.')
      if (aberta.rooms.some((r) => r.findings.some((f) => ![f.point, f.issue, f.action, f.reason].every((x) => x.trim()))))
        throw new Error('Preencha local, problema, ação e justificativa de todas as ocorrências.')
      if (aberta.general_reason && !aberta.general_by) throw new Error('Registre o responsável pela validação do alcance geral.')
      const v: Vistoria = { ...aberta, status: 'completed' }
      await gravar(v); setAberta(v); setPendente(false); setRelatorioId(v.id); ir('relatorios')
    })
  }

  async function sair() {
    await executar(async () => {
      if (pendente && aberta && !bloqueada) { await gravar(aberta); setPendente(false) }
      const { error } = await sb!.auth.signOut()
      if (error) throw error
      setAberta(null); setUnidades([]); setVistorias([]); setPerfil(null); setRelatorioId(''); ir('unidades')
    })
  }

  /* ---------------------------------------------------------------- entrada, cadastro e aprovação */
  const cabecalho = (
    <header>
      <img src={marca} alt="Prefeitura de Maceió — Cidade de Todos Nós" />
      <span>Secretaria Executiva</span>
      <Instalar />
      {!DEMO && sessao && <button className="quiet" disabled={ocupado} onClick={() => void sair()}>Sair</button>}
    </header>
  )
  if (!DEMO && (!sessao || carregando || !perfil?.approved)) {
    return (
      <div className="shell">{cabecalho}
        <div className="layout"><main>
          {erro && <div role="alert" className="error">{erro}</div>}
          {carregando ? <p>Carregando…</p> : <Entrada sessao={sessao} perfil={perfil} aoMudar={() => void recarregar()} />}
        </main></div>
      </div>
    )
  }

  /* ---------------------------------------------------------------- dados derivados */
  const concluidas = vistorias.filter((v) => v.status === 'completed')
  const filtradas = unidades.filter((u) => (!distrito || u.district === distrito) && (!tipo || u.kind === tipo)
    && semAcento(u.name + ' ' + u.cnes + ' ' + u.address).includes(semAcento(busca)))
  const relatorio = concluidas.find((v) => v.id === relatorioId)
  const recorte = concluidas.filter((v) => {
    const u = unidades.find((x) => x.id === v.unit_id)
    return u && (!distrito || u.district === distrito) && (!fUnidade || String(u.id) === fUnidade)
      && (!fDe || v.inspected_on >= fDe) && (!fAte || v.inspected_on <= fAte)
  })
  const acoes = recorte.flatMap((v) => v.rooms.flatMap((r) => r.findings.map((f) => ({ v, r, f, u: unidades.find((x) => x.id === v.unit_id)! }))))
    .filter((x) => (!fPrioridade || x.f.priority === fPrioridade) && (!fAmbiente || semAcento(x.r.name).includes(semAcento(fAmbiente))))
    .sort((a, b) => PRIORIDADES.indexOf(a.f.priority) - PRIORIDADES.indexOf(b.f.priority))
  const distritos = [...new Set(unidades.map((u) => u.district))]
  const totalItens = (nome: string) => [...Object.values(CHECKLIST).flat(), ...itensDoAmbiente(nome)].length

  function exportarCsv() {
    const cel = (t: string) => '"' + (/^[\s\u0000-\u001f]*[=+@-]/.test(t) ? "'" + t : t).replaceAll('"', '""') + '"'
    const linhas = [['Unidade', 'Distrito', 'Data', 'Ambiente', 'Local', 'Problema', 'Ação', 'Prioridade', 'Responsável', 'Prazo'],
      ...acoes.map(({ u, v, r, f }) => [u.name, u.district, v.inspected_on, r.name, f.point, f.issue, f.action, f.priority, f.owner, f.due])]
    const url = URL.createObjectURL(new Blob(['﻿', linhas.map((l) => l.map(cel).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'acoes-vistoria.csv'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  /* ---------------------------------------------------------------- telas */
  return (
    <div className="shell">
      {cabecalho}
      <div className="layout">
        <nav aria-label="Navegação principal">
          <button className={tela === 'unidades' ? 'active' : ''} onClick={() => ir('unidades')}>Unidades</button>
          {aberta && <button className={tela === 'vistoria' ? 'active' : ''} onClick={() => ir('vistoria')}>Vistoria aberta</button>}
          <button className={tela === 'relatorios' ? 'active' : ''} onClick={() => { setRelatorioId(''); ir('relatorios') }}>Relatórios</button>
          {admin && <button className={tela === 'acessos' ? 'active' : ''} onClick={() => ir('acessos')}>Acessos{pedidos > 0 && <span className="contador">{pedidos}</span>}</button>}
        </nav>
        <main>
          {DEMO && <div className="banner no-print">Modo de demonstração · Use dados fictícios. As vistorias e mídias ficam neste navegador.</div>}
          {erro && <div role="alert" className="error">{erro}</div>}
          {aviso && <div role="status" className="notice">{aviso}</div>}
          {admin && pedidos > 0 && tela !== 'acessos' && <div className="banner no-print">{pedidos === 1 ? 'Há 1 pedido de acesso' : `Há ${pedidos} pedidos de acesso`} esperando a sua aprovação. <a href="#acessos" onClick={() => ir('acessos')}>Ver pedidos</a></div>}

          {tela === 'acessos' && admin ? <Acessos unidades={unidades} euId={perfil!.id} aoMudar={(n) => setPedidos(n)} /> :

          tela === 'vistoria' && aberta && unidadeAberta ? (
            <>
              <div className="heading">
                <div>
                  <p className="eyebrow">VISTORIA · DISTRITO {unidadeAberta.district}</p>
                  <h1>{unidadeAberta.name}</h1>
                  <p>{unidadeAberta.address}</p>
                </div>
                <Selo value={aberta.status === 'completed' ? 'Concluída' : pendente ? 'Alterações pendentes' : 'Rascunho salvo'} />
              </div>
              {bloqueada && <div className="banner">Vistoria concluída: só a administração pode alterar.</div>}
              <fieldset disabled={ocupado || bloqueada} className="plain">
                <div className="panel grid">
                  <Campo label="Data"><input type="date" value={aberta.inspected_on} onChange={(e) => mudar({ ...aberta, inspected_on: e.target.value })} /></Campo>
                  <Campo label="Vistoriador"><input value={aberta.inspector} onChange={(e) => mudar({ ...aberta, inspector: e.target.value })} /></Campo>
                </div>
                <div className="panel row">
                  <Campo label="Ambiente"><input list="rooms" value={novoAmbiente} placeholder="Ex.: Consultório 02" onChange={(e) => setNovoAmbiente(e.target.value)} /></Campo>
                  <datalist id="rooms">{[...AMBIENTES_SUGERIDOS, ...(unidadeAberta.kind === 'CAPS' ? ['Sala de convivência', 'Dormitório'] : [])].map((a) => <option key={a}>{a}</option>)}</datalist>
                  <button className="primary" disabled={!novoAmbiente.trim()} onClick={() => {
                    mudar({ ...aberta, rooms: [...aberta.rooms, { id: novoId(), name: novoAmbiente.trim(), checks: {}, findings: [] }] }); setNovoAmbiente('')
                  }}>Adicionar ambiente</button>
                </div>

                {aberta.rooms.map((amb, i) => (
                  <section className="panel room" key={amb.id}>
                    <div className="heading"><h2>{i + 1}. {amb.name}</h2>{maiorPrioridade(amb.findings) && <Selo value={maiorPrioridade(amb.findings)} />}</div>
                    {Object.entries({ ...CHECKLIST, ...(itensDoAmbiente(amb.name).length ? { 'Itens do ambiente': itensDoAmbiente(amb.name) } : {}) }).map(([grupo, itens]) => (
                      <details className="checks" key={grupo}>
                        <summary>{grupo} <small>{itens.filter((it) => amb.checks[grupo + ' · ' + it]).length}/{itens.length}</small></summary>
                        <div className="grid">
                          {itens.map((it) => {
                            const chave = grupo + ' · ' + it
                            return (
                              <Campo label={it} key={chave}>
                                <select value={amb.checks[chave] ?? ''} onChange={(e) => mudarAmbiente({ ...amb, checks: { ...amb.checks, [chave]: e.target.value } })}>
                                  <option value="">Sem resposta</option>
                                  {RESPOSTAS.map((r) => <option key={r}>{r}</option>)}
                                </select>
                              </Campo>
                            )
                          })}
                        </div>
                      </details>
                    ))}
                    <div className="row">
                      <h3>Ocorrências</h3>
                      <button onClick={() => mudarAmbiente({ ...amb, findings: [...amb.findings, { id: novoId(), item: '', point: '', issue: '', action: '', priority: 'Prioritária', reason: '', owner: '', due: '', media: [] }] })}>Adicionar ocorrência</button>
                    </div>
                    {amb.findings.map((o, n) => (
                      <article className="finding" key={o.id}>
                        <div className="heading"><strong>Ocorrência {n + 1}</strong><Selo value={o.priority} /></div>
                        <div className="grid">
                          <Campo label="Item"><input value={o.item} placeholder="Ex.: fechadura" onChange={(e) => mudarOcorrencia(amb, { ...o, item: e.target.value })} /></Campo>
                          <Campo label="Local exato"><input value={o.point} onChange={(e) => mudarOcorrencia(amb, { ...o, point: e.target.value })} /></Campo>
                          <Campo label="Problema observado"><textarea value={o.issue} onChange={(e) => mudarOcorrencia(amb, { ...o, issue: e.target.value })} /></Campo>
                          <Campo label="Ação indicada"><textarea value={o.action} onChange={(e) => mudarOcorrencia(amb, { ...o, action: e.target.value })} /></Campo>
                          <Campo label="Prioridade">
                            <select value={o.priority} onChange={(e) => mudarOcorrencia(amb, { ...o, priority: e.target.value })}>{PRIORIDADES.map((p) => <option key={p}>{p}</option>)}</select>
                          </Campo>
                          <Campo label="Justificativa e observações"><textarea value={o.reason} onChange={(e) => mudarOcorrencia(amb, { ...o, reason: e.target.value })} /></Campo>
                          <Campo label="Setor responsável"><input value={o.owner} onChange={(e) => mudarOcorrencia(amb, { ...o, owner: e.target.value })} /></Campo>
                          <Campo label="Prazo"><input type="date" value={o.due} onChange={(e) => mudarOcorrencia(amb, { ...o, due: e.target.value })} /></Campo>
                        </div>
                        <Campo label="Anexar fotos ou vídeos · até 50 MB cada">
                          <input type="file" multiple accept={TIPOS_ACEITOS.join(',')} onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; void anexar(amb, o, l) }} />
                        </Campo>
                        <Campo label="Tirar foto com a câmera">
                          <input type="file" accept="image/*" capture="environment" onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; void anexar(amb, o, l) }} />
                        </Campo>
                        <small>Evite incluir pacientes, prontuários ou telas.</small>
                        <div className="media">
                          {o.media.map((m) => (
                            <div key={m.id}>
                              <VerMidia media={m} />
                              <Campo label="Legenda"><input value={m.caption} onChange={(e) => mudarOcorrencia(amb, { ...o, media: o.media.map((x) => (x.id === m.id ? { ...x, caption: e.target.value } : x)) })} /></Campo>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </section>
                ))}

                <details className="panel">
                  <summary>Validar intervenção imediata na unidade inteira</summary>
                  <div className="grid">
                    <Campo label="Justificativa do alcance geral"><textarea value={aberta.general_reason} onChange={(e) => mudar({ ...aberta, general_reason: e.target.value })} /></Campo>
                    <Campo label="Responsável pela validação"><input value={aberta.general_by} onChange={(e) => mudar({ ...aberta, general_by: e.target.value })} /></Campo>
                  </div>
                </details>
                <div className="row">
                  <button disabled={!pendente} onClick={() => void executar(async () => { await gravar(aberta); setPendente(false); setAviso('Vistoria salva.') })}>Salvar agora</button>
                  <button className="primary" onClick={() => void concluir()}>Concluir e abrir relatório</button>
                </div>
              </fieldset>
            </>
          ) :

          tela === 'relatorios' ? (
            <>
              <div className="heading no-print">
                <div><p className="eyebrow">ACOMPANHAMENTO</p><h1>Relatórios</h1></div>
                <div className="row">
                  {relatorio && <button onClick={() => setRelatorioId('')}>Voltar ao consolidado</button>}
                  {!relatorio && <button onClick={exportarCsv} disabled={!acoes.length}>Exportar CSV</button>}
                  <button className="primary" onClick={() => window.print()}>Imprimir / PDF</button>
                </div>
              </div>
              {relatorio ? (
                <article className="panel report">
                  <img className="report-logo" src={marca} alt="Prefeitura de Maceió" />
                  <h2>{unidades.find((u) => u.id === relatorio.unit_id)?.name}</h2>
                  <p>{unidades.find((u) => u.id === relatorio.unit_id)?.address}</p>
                  <p>{dataBR(relatorio.inspected_on)} · {relatorio.inspector}</p>
                  {resumoPrioridade(relatorio) && <Selo value={resumoPrioridade(relatorio)} />}
                  {relatorio.general_reason && <p>{relatorio.general_reason} · Validação: {relatorio.general_by}</p>}
                  {relatorio.rooms.map((amb) => {
                    const respondidos = Object.values(amb.checks).filter(Boolean).length
                    return (
                      <section key={amb.id}>
                        <h3>{amb.name}</h3>
                        <p>{respondidos} itens respondidos · {Object.values(amb.checks).filter((x) => x === 'Não testado').length} marcados como não testados · {totalItens(amb.name) - respondidos} sem resposta</p>
                        <ul>{Object.entries(amb.checks).filter(([, v]) => v).map(([k, v]) => <li key={k}>{k} — {v}</li>)}</ul>
                        {[...amb.findings].sort((a, b) => PRIORIDADES.indexOf(a.priority) - PRIORIDADES.indexOf(b.priority)).map((o) => (
                          <section className="finding" key={o.id}>
                            <Selo value={o.priority} />
                            <p><strong>{[o.item, o.point].filter(Boolean).join(' · ')}</strong></p>
                            <p>{o.issue}</p>
                            <p><strong>Ação:</strong> {o.action}</p>
                            <p>{o.reason}</p>
                            <p>{[o.owner, o.due && dataBR(o.due)].filter(Boolean).join(' · ')}</p>
                            <div className="media">{o.media.map((m) => <VerMidia media={m} key={m.id} />)}</div>
                          </section>
                        ))}
                      </section>
                    )
                  })}
                </article>
              ) : (
                <>
                  <div className="panel filters no-print">
                    <Campo label="Distrito"><select value={distrito} onChange={(e) => setDistrito(e.target.value)}><option value="">Todos</option>{distritos.map((d) => <option key={d}>{d}</option>)}</select></Campo>
                    <Campo label="Unidade"><select value={fUnidade} onChange={(e) => setFUnidade(e.target.value)}><option value="">Todas</option>{unidades.map((u) => <option value={u.id} key={u.id}>{u.name}</option>)}</select></Campo>
                    <Campo label="Ambiente"><input value={fAmbiente} onChange={(e) => setFAmbiente(e.target.value)} /></Campo>
                    <Campo label="Prioridade"><select value={fPrioridade} onChange={(e) => setFPrioridade(e.target.value)}><option value="">Todas</option>{PRIORIDADES.map((p) => <option key={p}>{p}</option>)}</select></Campo>
                    <Campo label="De"><input type="date" value={fDe} onChange={(e) => setFDe(e.target.value)} /></Campo>
                    <Campo label="Até"><input type="date" value={fAte} onChange={(e) => setFAte(e.target.value)} /></Campo>
                  </div>
                  <div className="panel">
                    <h2>Vistorias concluídas <small>{recorte.length}</small></h2>
                    {!recorte.length && <p>Nenhuma vistoria concluída neste recorte.</p>}
                    {recorte.map((v) => (
                      <div className="result row" key={v.id}>
                        <strong>{unidades.find((u) => u.id === v.unit_id)?.name}</strong>
                        <span>{dataBR(v.inspected_on)}</span>
                        {resumoPrioridade(v) && <Selo value={resumoPrioridade(v)} />}
                        <button className="no-print" onClick={() => setRelatorioId(v.id)}>Abrir relatório</button>
                        <button className="no-print" onClick={() => abrir(unidades.find((u) => u.id === v.unit_id)!, v)}>{DEMO || admin ? 'Revisar' : 'Ver vistoria'}</button>
                      </div>
                    ))}
                  </div>
                  <div className="panel">
                    <h2>Ações por prioridade <small>{acoes.length}</small></h2>
                    {!acoes.length && <p>Nenhuma ação neste recorte.</p>}
                    {acoes.map(({ u, r, f, v }) => (
                      <article className="result" key={v.id + f.id}>
                        <div className="row"><Selo value={f.priority} /><strong>{f.action}</strong></div>
                        <p>{u.name} · {r.name} · {f.point}</p>
                        <p>{f.issue}{f.owner && ' · ' + f.owner}{f.due && ' · ' + dataBR(f.due)}</p>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="heading"><div>
                <p className="eyebrow">REDE MUNICIPAL DE SAÚDE</p>
                <h1>Formulário de Vistoria Saúde</h1>
                <p>Selecione uma unidade para iniciar ou retomar uma vistoria.</p>
              </div></div>
              <div className="stats">
                <div><strong>{unidades.length}</strong><span>Unidades disponíveis</span></div>
                <div><strong>{vistorias.filter((v) => v.status === 'draft').length}</strong><span>Rascunhos</span></div>
                <div><strong>{concluidas.length}</strong><span>Vistorias concluídas</span></div>
              </div>
              <div className="panel filters">
                <Campo label="Buscar unidade"><input type="search" placeholder="Nome, CNES ou endereço" value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
                <Campo label="Distrito"><select value={distrito} onChange={(e) => setDistrito(e.target.value)}><option value="">Todos</option>{distritos.map((d) => <option key={d}>{d}</option>)}</select></Campo>
                <Campo label="Tipo"><select value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos</option>{[...new Set(unidades.map((u) => u.kind))].sort().map((k) => <option key={k}>{k}</option>)}</select></Campo>
              </div>
              <h2>Unidades <small>{filtradas.length}</small></h2>
              {!filtradas.length && <p>Nenhuma unidade disponível neste recorte.</p>}
              <div className="cards">
                {filtradas.map((u) => {
                  const dela = vistorias.filter((v) => v.unit_id === u.id).sort((a, b) => b.inspected_on.localeCompare(a.inspected_on))
                  const rascunho = dela.find((v) => v.status === 'draft' && (DEMO || admin || v.owner === perfil?.id))
                  const ultima = dela.find((v) => v.status === 'completed')
                  return (
                    <article className="panel unit" key={u.id}>
                      <div className="row"><Selo value={u.kind} /><span>Distrito {u.district}</span></div>
                      <h3>{u.name}</h3>
                      <p>{u.address}</p>
                      <p>CNES {u.cnes || 'pendente'}{u.status && ' · ' + u.status}</p>
                      {ultima && <p>Última vistoria: {dataBR(ultima.inspected_on)}{resumoPrioridade(ultima) && <> · <Selo value={resumoPrioridade(ultima)} /></>}</p>}
                      <div className="row">
                        <button className="primary" disabled={ocupado} onClick={() => abrir(u, rascunho)}>{rascunho ? 'Retomar rascunho' : 'Nova vistoria'}</button>
                        {ultima && <button onClick={() => { setRelatorioId(ultima.id); ir('relatorios') }}>Último relatório</button>}
                        <a href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(u.address + ' Maceió AL')} target="_blank" rel="noreferrer">Abrir mapa ↗</a>
                      </div>
                    </article>
                  )
                })}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
