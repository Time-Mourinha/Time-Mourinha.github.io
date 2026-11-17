import { useEffect, useState, type ReactNode } from 'react'
import { midiaDemo } from './lib/armazenamento'
import type { Midia } from './lib/modelo'

export function Campo({ label, children, falta }: { label: string; children: ReactNode; falta?: boolean }) {
  return <label className={'field' + (falta ? ' falta' : '')}>{label}{falta && <em className="falta-msg">Preencha aqui para concluir</em>}{children}</label>
}

export function Selo({ value }: { value: string }) {
  const classe = value.toLowerCase().includes('imediata') ? 'urgent' : value === 'Prioritária' ? 'priority' : ''
  return <span className={'badge ' + classe}>{value}</span>
}

/** Foto: primeiro deste aparelho; se não estiver aqui, do Google Drive (remoto). */
export function VerMidia({ media, remoto }: { media: Midia; remoto?: string }) {
  const [url, setUrl] = useState('')
  const [falha, setFalha] = useState(false)
  useEffect(() => {
    let vivo = true
    let objeto = ''
    ;(async () => {
      try {
        const blob = await midiaDemo(media.id)
        if (blob && vivo) { objeto = URL.createObjectURL(blob); setUrl(objeto) } else if (vivo) { if (remoto) setUrl(remoto); else setFalha(true) }
      } catch { if (vivo) { if (remoto) setUrl(remoto); else setFalha(true) } }
    })()
    return () => { vivo = false; if (objeto) URL.revokeObjectURL(objeto) }
  }, [media.id, remoto])
  return (
    <figure>
      {url ? <img src={url} alt={media.caption || media.name} />
        : <span className="sem-foto">{falha ? '📷 Foto não está neste aparelho (veja o PDF no Google Drive)' : 'Carregando foto…'}</span>}
      <figcaption>{media.caption || media.name}</figcaption>
    </figure>
  )
}
