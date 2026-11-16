import { useEffect, useState, type ReactNode } from 'react'
import { midiaDemo, urlMidia, DEMO } from './lib/armazenamento'
import type { Midia } from './lib/modelo'

export function Campo({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field">{label}{children}</label>
}

export function Selo({ value }: { value: string }) {
  const classe = value.toLowerCase().includes('imediata') ? 'urgent' : value === 'Prioritária' ? 'priority' : ''
  return <span className={'badge ' + classe}>{value}</span>
}

export function VerMidia({ media }: { media: Midia }) {
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

