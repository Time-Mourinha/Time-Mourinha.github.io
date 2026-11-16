import { useEffect, useState } from 'react'
import { carregarAcessos, salvarAcesso, sb, type Atribuicao } from './lib/armazenamento'
import { ativarAvisos, avisosAtivos, avisosSuportados, ehIos, instalado } from './lib/pwa'
import type { Perfil, Unidade } from './lib/modelo'

/** Administração: aprova pedidos de acesso (quem é aprovado vistoria qualquer unidade). */
export function Acessos({ unidades, euId, aoMudar }: { unidades: Unidade[]; euId: string; aoMudar: (pendentes: number) => void }) {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [atrib, setAtrib] = useState<Atribuicao[]>([])
  const [aberto, setAberto] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  async function carregar() {
    try {
      const r = await carregarAcessos(); setPerfis(r.perfis); setAtrib(r.atribuicoes)
      aoMudar(r.perfis.filter((p) => !p.approved && !p.needs_code).length)
    } catch (e) { setErro((e as Error).message) }
  }
  useEffect(() => {
    void carregar()
    // pedidos novos aparecem na hora, sem recarregar
    const canal = sb!.channel('pedidos').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => void carregar()).subscribe()
    return () => { void sb!.removeChannel(canal) }
  }, [])

  const pendentes = perfis.filter((p) => !p.approved && !p.needs_code)
  return (
    <>
      <div className="heading"><div><p className="eyebrow">ADMINISTRAÇÃO</p><h1>Acessos</h1>
        <p>Aprove quem pode usar o aplicativo. Quem for aprovado pode vistoriar qualquer unidade.</p></div></div>
      {erro && <div role="alert" className="error">{erro}</div>}
      {aviso && <div role="status" className="notice">{aviso}</div>}
      <Avisos />
      <div className="stats">
        <div><strong>{pendentes.length}</strong><span>Aguardando aprovação</span></div>
        <div><strong>{perfis.filter((p) => p.approved).length}</strong><span>Com acesso</span></div>
        <div><strong>{perfis.filter((p) => p.role === 'admin' && p.approved).length}</strong><span>Administração</span></div>
      </div>
      {perfis.map((p) => (
        <EditorAcesso key={p.id} perfil={p} eu={p.id === euId} unidades={unidades}
          marcadas={atrib.filter((a) => a.user_id === p.id).map((a) => a.unit_id)}
          aberto={aberto === p.id} abrir={() => setAberto(aberto === p.id ? '' : p.id)}
          salvo={(msg) => { setAviso(msg); setErro(''); void carregar() }} falhou={(m) => setErro(m)} />
      ))}
    </>
  )
}

function EditorAcesso(props: {
  perfil: Perfil; eu: boolean; unidades: Unidade[]; marcadas: number[]; aberto: boolean
  abrir: () => void; salvo: (m: string) => void; falhou: (m: string) => void
}) {
  const { perfil, eu } = props
  const [aprovado, setAprovado] = useState(perfil.approved)
  const [papel, setPapel] = useState(perfil.role)
  const [ocupado, setOcupado] = useState(false)

  async function salvar() {
    setOcupado(true)
    try {
      await salvarAcesso({ ...perfil, approved: aprovado, role: papel }, [])
      props.salvo(`Acesso de ${perfil.email} salvo.`)
    } catch (e) { props.falhou((e as Error).message) } finally { setOcupado(false) }
  }

  return (
    <article className="panel">
      <div className="heading">
        <div><h3>{perfil.name || perfil.email}</h3>{perfil.name && <small>{perfil.email} </small>}
          <span className={'badge ' + (perfil.approved ? '' : 'priority')}>{perfil.needs_code ? 'Aguardando código' : perfil.approved ? (perfil.role === 'admin' ? 'Administração' : 'Com acesso') : 'Aguardando aprovação'}</span>
</div>
        <button onClick={props.abrir}>{props.aberto ? 'Fechar' : 'Editar'}</button>
      </div>
      {props.aberto && (eu ? <p>Esta é a sua conta. Outra pessoa da administração pode alterá-la.</p> : (
        <fieldset className="plain" disabled={ocupado}>
          <div className="grid">
            <label className="field">Situação<select value={aprovado ? 'sim' : 'nao'} onChange={(e) => setAprovado(e.target.value === 'sim')}><option value="sim">Aprovado</option><option value="nao">Sem acesso</option></select></label>
            <label className="field">Papel<select value={papel} onChange={(e) => setPapel(e.target.value as Perfil['role'])}><option value="inspector">Vistoriador</option><option value="admin">Administração (aprova acessos)</option></select></label>
          </div>
          <div className="row"><button className="primary" onClick={() => void salvar()}>Salvar acesso</button></div>
        </fieldset>
      ))}
    </article>
  )
}

/** Avisos no celular quando chega um pedido de acesso. */
function Avisos() {
  const [ativos, setAtivos] = useState(false)
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { void avisosAtivos().then(setAtivos) }, [])
  const precisaInstalar = ehIos && !instalado()
  return (
    <div className="panel aviso-celular">
      <h3>🔔 Avisos de novos pedidos</h3>
      {ativos ? <p>Este aparelho recebe um aviso sempre que alguém pedir acesso.</p>
        : precisaInstalar ? <p>No iPhone, primeiro instale o app pelo botão <b>📲 Instalar app</b> no topo e abra pelo ícone. Depois volte aqui e ative os avisos.</p>
          : avisosSuportados() ? <p>Ative para receber um aviso no celular sempre que alguém pedir acesso.</p>
            : <p>Este navegador não recebe avisos. Use o Chrome no Android ou o app instalado no iPhone.</p>}
      {msg && <p className="error">{msg}</p>}
      {!ativos && !precisaInstalar && avisosSuportados() && (
        <button className="primary" disabled={ocupado} onClick={async () => {
          setOcupado(true); setMsg('')
          try { await ativarAvisos(); setAtivos(true) } catch (e) { setMsg((e as Error).message) } finally { setOcupado(false) }
        }}>Ativar avisos neste aparelho</button>
      )}
    </div>
  )
}
