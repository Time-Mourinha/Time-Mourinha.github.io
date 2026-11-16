import { useEffect, useState } from 'react'
import { carregarAcessos, salvarAcesso, type Atribuicao } from './lib/armazenamento'
import type { Perfil, Unidade } from './lib/modelo'

/** Administração: aprova pedidos de acesso (quem é aprovado vistoria qualquer unidade). */
export function Acessos({ unidades, euId }: { unidades: Unidade[]; euId: string }) {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [atrib, setAtrib] = useState<Atribuicao[]>([])
  const [aberto, setAberto] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  async function carregar() {
    try { const r = await carregarAcessos(); setPerfis(r.perfis); setAtrib(r.atribuicoes) } catch (e) { setErro((e as Error).message) }
  }
  useEffect(() => { void carregar() }, [])

  const pendentes = perfis.filter((p) => !p.approved && !p.needs_code)
  return (
    <>
      <div className="heading"><div><p className="eyebrow">ADMINISTRAÇÃO</p><h1>Acessos</h1>
        <p>Aprove quem pode usar o aplicativo. Quem for aprovado pode vistoriar qualquer unidade.</p></div></div>
      {erro && <div role="alert" className="error">{erro}</div>}
      {aviso && <div role="status" className="notice">{aviso}</div>}
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
        <div><h3>{perfil.email}</h3>
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
