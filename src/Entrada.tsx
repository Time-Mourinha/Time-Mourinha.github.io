import { useState, type FormEvent } from 'react'
import { confirmarCodigoAdmin, pedirCodigoAdmin, sb } from './lib/armazenamento'
import type { Perfil } from './lib/modelo'

type Props = { sessao: boolean; perfil: Perfil | null; aoMudar: () => void }

/** Entrada, pedido de acesso, espera da aprovação e código da primeira administradora. */
export function Entrada({ sessao, perfil, aoMudar }: Props) {
  const [modo, setModo] = useState<'login' | 'cadastro' | 'senha'>('login')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function executar(acao: () => Promise<void>) {
    setOcupado(true); setErro(''); setAviso('')
    try { await acao() } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao executar a operação.') } finally { setOcupado(false) }
  }
  const traduzir = (m: string) =>
    /invalid login/i.test(m) ? 'E-mail ou senha incorretos.'
      : /not confirmed/i.test(m) ? 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
        : /already registered/i.test(m) ? 'Este e-mail já tem cadastro. Use “Entrar”.'
          : /password/i.test(m) ? 'A senha precisa ter pelo menos 8 caracteres.' : m

  function enviar(e: FormEvent) {
    e.preventDefault()
    void executar(async () => {
      if (modo === 'login') {
        const { error } = await sb!.auth.signInWithPassword({ email: email.trim(), password: senha })
        if (error) throw new Error(traduzir(error.message))
        aoMudar()
      } else if (modo === 'cadastro') {
        if (senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.')
        const { data, error } = await sb!.auth.signUp({ email: email.trim(), password: senha, options: { emailRedirectTo: location.origin + location.pathname } })
        if (error) throw new Error(traduzir(error.message))
        if (data.session) aoMudar()
        else setAviso('Pedido enviado. Confirme o e-mail pelo link que chegou na sua caixa de entrada e depois entre.')
      } else {
        const { error } = await sb!.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname })
        if (error) throw new Error(traduzir(error.message))
        setAviso('Se o e-mail tiver cadastro, chega um link para criar uma nova senha.')
      }
    })
  }

  if (sessao && perfil?.needs_code) {
    return (
      <section className="panel auth">
        <p className="eyebrow">ADMINISTRAÇÃO</p>
        <h1>Código de segurança</h1>
        <p>Esta conta é a da administração. Para liberar, confirme o código enviado ao seu e-mail.</p>
        {erro && <div role="alert" className="error">{erro}</div>}
        {aviso && <div role="status" className="notice">{aviso}</div>}
        <div className="row"><button disabled={ocupado} onClick={() => void executar(async () => { await pedirCodigoAdmin(); setAviso('Código enviado. Confira a caixa de entrada e o spam.') })}>Enviar código</button></div>
        <form onSubmit={(e) => { e.preventDefault(); void executar(async () => { if (!(await confirmarCodigoAdmin(codigo))) throw new Error('Código incorreto ou vencido. Peça outro.'); aoMudar() }) }}>
          <label className="field">Código<input inputMode="numeric" autoComplete="one-time-code" value={codigo} onChange={(e) => setCodigo(e.target.value)} required /></label>
          <button className="primary" disabled={ocupado}>Confirmar</button>
        </form>
      </section>
    )
  }

  if (sessao && perfil && !perfil.approved) {
    return (
      <section className="panel auth">
        <p className="eyebrow">ACESSO</p>
        <h1>Aguardando aprovação</h1>
        <p>Seu pedido de acesso ({perfil.email}) foi registrado. A administração precisa aprovar e indicar as unidades que você pode vistoriar.</p>
        <div className="row"><button onClick={aoMudar}>Verificar de novo</button></div>
      </section>
    )
  }

  return (
    <section className="panel auth">
      <p className="eyebrow">SECRETARIA EXECUTIVA</p>
      <h1>{modo === 'login' ? 'Entrar' : modo === 'cadastro' ? 'Solicitar acesso' : 'Recuperar senha'}</h1>
      <p>Formulário de Vistoria Saúde · unidades da rede municipal de Maceió.</p>
      {erro && <div role="alert" className="error">{erro}</div>}
      {aviso && <div role="status" className="notice">{aviso}</div>}
      <form onSubmit={enviar}>
        <label className="field">E-mail<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        {modo !== 'senha' && <label className="field">Senha<input type="password" autoComplete={modo === 'login' ? 'current-password' : 'new-password'} minLength={modo === 'cadastro' ? 8 : undefined} value={senha} onChange={(e) => setSenha(e.target.value)} required /></label>}
        <button className="primary" disabled={ocupado}>{modo === 'login' ? 'Entrar' : modo === 'cadastro' ? 'Solicitar acesso' : 'Enviar link'}</button>
      </form>
      <div className="row">
        {modo !== 'login' && <button onClick={() => setModo('login')}>Já tenho acesso</button>}
        {modo !== 'cadastro' && <button onClick={() => setModo('cadastro')}>Solicitar acesso</button>}
        {modo === 'login' && <button onClick={() => setModo('senha')}>Esqueci a senha</button>}
      </div>
    </section>
  )
}
