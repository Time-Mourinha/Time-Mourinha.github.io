import { useEffect, useRef, useState } from 'react'
import { Campo, Selo, VerMidia } from './ui'
import marca from './assets/marca.png'
import {
  LIMITE_BYTES, PRIORIDADES, TIPOS_ACEITOS, UNIDADES, dataBR, hoje, novoId, resumoPrioridade, semAcento,
  type Ambiente, type Midia, type Ocorrencia, type Perfil, type Unidade, type Vistoria,
} from './lib/modelo'
import {
  DEMO, caminhoMidia, descreverFoto, type DescricaoFoto, carregarPerfil, carregarUnidades, carregarVistorias, enviarMidia, gravarDemo, lerDemo,
  midiaDemo, salvarVistoria, sb, urlMidia,
} from './lib/armazenamento'
import { Acessos } from './Acessos'
import { Entrada } from './Entrada'
import { Formulario } from './Formulario'
import { Aparencia } from './Aparencia'
import { Instalar } from './Instalar'
import { Painel } from './Painel'
import { ESTILOS_RELATORIO, Relatorio, type EstiloRelatorio } from './Relatorio'
import { IMPACTOS, resumir } from './lib/analise'
import { reduzirImagem } from './lib/imagem'

type Tela = 'unidades' | 'painel' | 'vistoria' | 'relatorios' | 'acessos'

function PedirNome({ aoSalvar }: { aoSalvar: (nome: string) => void }) {
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')
  return (
    <form className="panel continuar" onSubmit={async (e) => {
      e.preventDefault()
      if (nome.trim().split(/\s+/).length < 2) { setErro('Escreva nome e sobrenome.'); return }
      const { data } = await sb!.auth.getUser()
      const { error } = await sb!.from('profiles').update({ name: nome.trim() }).eq('id', data.user!.id)
      if (error) setErro(error.message); else aoSalvar(nome.trim())
    }}>
      <h2>Como você quer aparecer nos relatórios?</h2>
      <div className="row"><input className="busca-campo" style={{ flex: 1 }} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome e sobrenome" autoComplete="name" />
        <button className="primary">Salvar</button></div>
      {erro && <p className="error">{erro}</p>}
    </form>
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
  const [situacao, setSituacao] = useState('')
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
  const [estilo, setEstilo] = useState<EstiloRelatorio>(() => {
    try { return (localStorage.getItem('estilo-relatorio') as EstiloRelatorio) || 'institucional' } catch { return 'institucional' }
  })
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
      const agora = new Date().toISOString()
      lembrar({ ...v, updated_at: agora, created_at: v.created_at ?? agora })
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
        id: novoId(), unit_id: u.id, inspected_on: hoje(), inspector: perfil?.name || perfil?.email || '',
        status: 'draft', rooms: [], general_reason: '', general_by: '',
      }
      if (!existente) await gravar(v)
      setAberta(v); setPendente(false); ir('vistoria')
    })
  }


  /** Envia fotos/vídeos: para a galeria da visita (com o ambiente) ou para um problema. A IA descreve cada foto. */
  async function anexar(destino: { roomId?: string; ocorrencia?: Ocorrencia }, arquivos: File[]) {
    if (!aberta || !arquivos.length) return
    const base = aberta
    await executar(async () => {
      if (base.status === 'draft' && pendente) { await gravar(base); setPendente(false) }
      let atual = base
      let descritas = 0
      for (const [n, original] of arquivos.entries()) {
        if (!TIPOS_ACEITOS.includes(original.type) || original.size > LIMITE_BYTES) throw new Error('Use JPG, PNG, WebP, MP4, WebM ou MOV de até 50 MB.')
        setAviso(arquivos.length > 1 ? `Enviando ${n + 1} de ${arquivos.length}…` : 'Enviando…')
        const arq = await reduzirImagem(original)
        const m: Midia = { id: novoId(), type: arq.type, name: arq.name, caption: '', room: destino.roomId }
        let ia: DescricaoFoto | null = null
        if (DEMO) await midiaDemo(m.id, arq)
        else {
          m.path = caminhoMidia(atual, m, arq); await enviarMidia(m.path, arq)
          if (arq.type.startsWith('image/')) { setAviso('Foto enviada. Descrevendo o que aparece nela…'); ia = await descreverFoto(m.path) }
        }
        if (ia && !/^sem problema/i.test(ia.descricao)) { m.ai = ia.descricao; m.caption = ia.descricao; m.item = ia.item; descritas++ }
        const o = destino.ocorrencia
        if (!o) atual = { ...atual, photos: [...(atual.photos ?? []), m] }
        else atual = { ...atual, rooms: atual.rooms.map((r) => ({ ...r, findings: r.findings.map((f) => {
          if (f.id !== o.id) return f
          const g = { ...f, media: [...f.media, m] }
          if (m.ai) {
            // a descrição da foto completa o problema, sem repetir
            if (!g.issue.includes(m.ai)) g.issue = g.issue ? `${g.issue} Na foto: ${m.ai}` : m.ai
            if (!g.item && ia?.item) g.item = ia.item
            if (!g.reason && ia?.item && IMPACTOS[ia.item]) g.reason = IMPACTOS[ia.item]
            if (!g.action && ia?.item) g.action = `Corrigir: ${ia.item.toLowerCase()}.`
          }
          return g
        }) })) }
        setAberta(atual); setPendente(true)
        await gravar(atual); setPendente(false)
      }
      setAviso(arquivos.length === 1 ? (descritas ? 'Foto salva e descrita. Confira o texto.' : 'Foto salva.') : `${arquivos.length} arquivos salvos${descritas ? `, ${descritas} descritos automaticamente` : ''}.`)
    })
  }

  async function concluir() {
    if (!aberta) return
    await executar(async () => {
      if (!aberta.inspected_on || !aberta.inspector.trim() || !aberta.rooms.length) throw new Error('Preencha data, vistoriador e pelo menos um ambiente.')
      const incompleto = aberta.rooms.find((r) => r.findings.some((f) => !f.issue.trim() || !f.action.trim()))
      if (incompleto) throw new Error(`Em "${incompleto.name}", há problema sem descrição ou sem ação. Toque em ✏️ Detalhes para completar.`)
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
      <span className="titulo-app"><b>Formulário de Vistoria Saúde</b><small>Secretaria Executiva</small></span>
      <Instalar />
      <Aparencia />
      {!DEMO && sessao && perfil && <span className="quem" title={perfil.email}>{(perfil.name || perfil.email).split(/[ @]/)[0]}</span>}
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
  const ultimaDe = (id: number) => concluidas.filter((v) => v.unit_id === id).sort((a, b) => b.inspected_on.localeCompare(a.inspected_on))[0]
  const filtradas = unidades.filter((u) => (!distrito || u.district === distrito) && (!tipo || u.kind === tipo)
    && semAcento(u.name + ' ' + u.cnes + ' ' + u.address).includes(semAcento(busca))
    && (!situacao
      || (situacao === 'nunca' && !vistorias.some((v) => v.unit_id === u.id))
      || (situacao === 'rascunho' && vistorias.some((v) => v.unit_id === u.id && v.status === 'draft'))
      || (situacao === 'critica' && ultimaDe(u.id) && ['Crítica', 'Alta'].includes(resumir(ultimaDe(u.id)).nivel.nome))))
  const meusRascunhos = vistorias.filter((v) => v.status === 'draft' && (DEMO || v.owner === perfil?.id))
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
  // rascunhos mexidos nas últimas 6 horas = gente em visita agora
  const emVisita = vistorias.filter((v) => v.status === 'draft' && v.updated_at && Date.now() - Date.parse(v.updated_at) < 6 * 3600e3)

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
          <button className={tela === 'unidades' ? 'active' : ''} onClick={() => ir('unidades')}><i aria-hidden="true">🏥</i>Unidades</button>
          {aberta && <button className={'aberta ' + (tela === 'vistoria' ? 'active' : '')} onClick={() => ir('vistoria')}><i aria-hidden="true">📝</i>Vistoria</button>}
          <button className={tela === 'painel' ? 'active' : ''} onClick={() => ir('painel')}><i aria-hidden="true">📊</i>Painel</button>
          <button className={tela === 'relatorios' ? 'active' : ''} onClick={() => { setRelatorioId(''); ir('relatorios') }}><i aria-hidden="true">📄</i>Relatórios</button>
          {admin && <button className={tela === 'acessos' ? 'active' : ''} onClick={() => ir('acessos')}><i aria-hidden="true">👥</i>Acessos{pedidos > 0 && <span className="contador">{pedidos}</span>}</button>}
        </nav>
        <main>
          {DEMO && <div className="banner no-print">Modo de demonstração · Use dados fictícios. As vistorias e mídias ficam neste navegador.</div>}
          {erro && <div role="alert" className="error">{erro}</div>}
          {aviso && <div role="status" className="notice">{aviso}</div>}
          {admin && pedidos > 0 && tela !== 'acessos' && <div className="banner no-print">{pedidos === 1 ? 'Há 1 pedido de acesso' : `Há ${pedidos} pedidos de acesso`} esperando a sua aprovação. <a href="#acessos" onClick={() => ir('acessos')}>Ver pedidos</a></div>}

          {tela === 'acessos' && admin ? <Acessos unidades={unidades} euId={perfil!.id} aoMudar={(n) => setPedidos(n)} /> :

          tela === 'vistoria' && aberta && unidadeAberta ? (
            <Formulario v={aberta} u={unidadeAberta} ocupado={ocupado} bloqueada={bloqueada} pendente={pendente} mudar={mudar}
              anexar={(destino, l) => void anexar(destino, l)} concluir={() => void concluir()}
              salvar={() => void executar(async () => { await gravar(aberta); setPendente(false); setAviso('Vistoria salva.') })} />
          ) :

          tela === 'painel' ? <Painel unidades={unidades} vistorias={vistorias} abrirRelatorio={(id) => { setRelatorioId(id); ir('relatorios') }} /> :

          tela === 'relatorios' ? (
            <>
              <div className="heading no-print">
                <div><p className="eyebrow">ACOMPANHAMENTO</p><h1>Relatórios</h1></div>
                <div className="row">
                  {relatorio && <button onClick={() => setRelatorioId('')}>Voltar ao consolidado</button>}
                  {relatorio && (
                    <select aria-label="Estilo do relatório" value={estilo} onChange={(e) => { setEstilo(e.target.value as EstiloRelatorio); try { localStorage.setItem('estilo-relatorio', e.target.value) } catch { /* sem armazenamento */ } }}>
                      {ESTILOS_RELATORIO.map((x) => <option key={x.id} value={x.id}>Estilo: {x.nome}</option>)}
                    </select>
                  )}
                  {!relatorio && <button onClick={exportarCsv} disabled={!acoes.length}>Exportar CSV</button>}
                  <button className="primary" onClick={() => window.print()}>Imprimir / PDF</button>
                </div>
              </div>
              {relatorio ? (
                <Relatorio vistoria={relatorio} unidade={unidades.find((u) => u.id === relatorio.unit_id)} estilo={estilo} />
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
              <div className="hero">
                <p className="eyebrow">REDE MUNICIPAL DE SAÚDE · MACEIÓ</p>
                <h1>{perfil?.name ? `Olá, ${perfil.name.split(' ')[0]}!` : 'Vistorias das unidades'}</h1>
                <p>Escolha a unidade e toque em <b>Nova vistoria</b>. Tudo é salvo sozinho enquanto você preenche.</p>
              </div>
              {!DEMO && perfil && !perfil.name && <PedirNome aoSalvar={(n) => setPerfil({ ...perfil, name: n })} />}
              {meusRascunhos.length > 0 && (
                <div className="panel continuar">
                  <h2>Continue de onde parou</h2>
                  {meusRascunhos.map((v) => {
                    const u = unidades.find((x) => x.id === v.unit_id)
                    return u && (
                      <button key={v.id} className="continuar-item" onClick={() => abrir(u, v)}>
                        <span><strong>{u.name}</strong><small>{v.rooms.length} ambiente(s) · {v.rooms.reduce((s, r) => s + r.findings.length, 0)} problema(s) · iniciada em {dataBR(v.inspected_on)}</small></span>
                        <b>Retomar →</b>
                      </button>
                    )
                  })}
                </div>
              )}
              {emVisita.length > 0 && (
                <div className="panel em-visita-lista">
                  <h2>🟢 Em visita agora <small>{emVisita.length}</small></h2>
                  {emVisita.map((x) => <p key={x.id}><strong>{x.inspector || 'Vistoriador'}</strong> · {unidades.find((u) => u.id === x.unit_id)?.name} · desde {new Date(x.created_at ?? x.updated_at ?? '').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Maceio' })}</p>)}
                </div>
              )}
              <div className="stats">
                <div><strong>{unidades.length}</strong><span>Unidades disponíveis</span></div>
                <div><strong>{vistorias.filter((v) => v.status === 'draft').length}</strong><span>Rascunhos</span></div>
                <div><strong>{concluidas.length}</strong><span>Vistorias concluídas</span></div>
              </div>
              <div className="panel busca">
                <input type="search" className="busca-campo" placeholder="🔎 Buscar por nome, bairro, CNES ou endereço" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar unidade" />
                <div className="chips" role="group" aria-label="Distrito">
                  <button className={'chip' + (!distrito ? ' ativo' : '')} onClick={() => setDistrito('')}>Todos os distritos</button>
                  {distritos.map((d) => <button key={d} className={'chip' + (distrito === d ? ' ativo' : '')} onClick={() => setDistrito(distrito === d ? '' : d)}>Distrito {d}</button>)}
                </div>
                <div className="chips" role="group" aria-label="Situação">
                  {[['', 'Todas'], ['nunca', 'Nunca vistoriadas'], ['rascunho', 'Com rascunho'], ['critica', 'Situação crítica ou alta']].map(([k, t]) => (
                    <button key={k} className={'chip' + (situacao === k ? ' ativo' : '')} onClick={() => setSituacao(k)}>{t}</button>
                  ))}
                  <select className="chip-select" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de unidade"><option value="">Todos os tipos</option>{[...new Set(unidades.map((u) => u.kind))].sort().map((k) => <option key={k}>{k}</option>)}</select>
                </div>
              </div>
              <h2>Unidades <small>{filtradas.length}</small></h2>
              {!filtradas.length && <p>Nenhuma unidade disponível neste recorte.</p>}
              <div className="cards">
                {filtradas.map((u) => {
                  const dela = vistorias.filter((v) => v.unit_id === u.id).sort((a, b) => b.inspected_on.localeCompare(a.inspected_on))
                  const rascunho = dela.find((v) => v.status === 'draft' && (DEMO || admin || v.owner === perfil?.id))
                  const ultima = dela.find((v) => v.status === 'completed')
                  return (
                    <article className={'panel unit' + (ultima ? ' nivel-' + resumir(ultima).nivel.classe : '')} key={u.id}>
                      <div className="row"><Selo value={u.kind} /><span>Distrito {u.district}</span></div>
                      <h3>{u.name}</h3>
                      <p>{u.address}</p>
                      <p>CNES {u.cnes || 'pendente'}{u.status && ' · ' + u.status}</p>
                      {ultima && <p>Última vistoria: {dataBR(ultima.inspected_on)} · <span className={'nivel ' + resumir(ultima).nivel.classe}>Situação {resumir(ultima).nivel.nome.toLowerCase()}</span></p>}
                      {emVisita.find((x) => x.unit_id === u.id) && <p className="em-visita">🟢 Em visita agora: {emVisita.find((x) => x.unit_id === u.id)!.inspector}</p>}
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
