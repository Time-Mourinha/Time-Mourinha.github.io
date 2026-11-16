import { useEffect, useState } from 'react'

/** Três aparências do app; a escolha fica guardada neste aparelho. */
export const TEMAS = [
  { id: 'padrao', nome: 'Institucional', desc: 'Azul da Prefeitura, menu lateral escuro' },
  { id: 'moderno', nome: 'Moderno', desc: 'Claro e arejado, cartões com sombra suave' },
  { id: 'sol', nome: 'Sol forte', desc: 'Alto contraste e letras maiores, para usar na rua' },
] as const
type Tema = (typeof TEMAS)[number]['id']

function lerTema(): Tema {
  try { return (localStorage.getItem('tema') as Tema) || 'moderno' } catch { return 'moderno' }
}
export function aplicarTema(t: Tema = lerTema()) { document.documentElement.dataset.tema = t }

export function Aparencia() {
  const [aberto, setAberto] = useState(false)
  const [tema, setTema] = useState<Tema>(lerTema)
  useEffect(() => { aplicarTema(tema); try { localStorage.setItem('tema', tema) } catch { /* sem armazenamento */ } }, [tema])
  return (
    <div className="aparencia no-print">
      <button className="quiet" aria-expanded={aberto} aria-label="Aparência" title="Aparência" onClick={() => setAberto(!aberto)}>🎨</button>
      {aberto && (
        <div className="aparencia-menu" role="menu">
          <strong>Aparência</strong>
          {TEMAS.map((t) => (
            <button key={t.id} role="menuitemradio" aria-checked={tema === t.id} className={tema === t.id ? 'ativo' : ''} onClick={() => { setTema(t.id); setAberto(false) }}>
              <span className={'amostra amostra-' + t.id} aria-hidden="true" /> <span><b>{t.nome}</b><small>{t.desc}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
