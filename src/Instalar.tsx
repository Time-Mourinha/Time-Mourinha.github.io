import { useEffect, useState } from 'react'
import { aoMudarInstalacao, instalado, instalarAgora, passosInstalacao } from './lib/pwa'

/** Botão "Instalar app" do topo: convite do navegador ou passo a passo (iPhone e outros). */
export function Instalar() {
  const [, atualizar] = useState(0)
  const [ajuda, setAjuda] = useState(false)
  useEffect(() => aoMudarInstalacao(() => atualizar((n) => n + 1)), [])
  if (instalado()) return null
  return (
    <>
      <button className="instalar no-print" onClick={async () => { if (!(await instalarAgora())) setAjuda(true) }}>📲 Instalar app</button>
      {ajuda && (
        <div className="instalar-aviso" role="dialog" aria-label="Instalar o aplicativo" onClick={(e) => { if (e.target === e.currentTarget) setAjuda(false) }}>
          <div>
            <h3>Instalar o Formulário de Vistoria Saúde</h3>
            <p>{passosInstalacao()} O ícone da Prefeitura aparece junto com os seus aplicativos.</p>
            <button className="primary" onClick={() => setAjuda(false)}>Entendi</button>
          </div>
        </div>
      )}
    </>
  )
}
