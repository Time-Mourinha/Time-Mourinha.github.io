/** O app instalado no celular fica aberto por dias; aqui ele confere se saiu versão nova e se atualiza sozinho. */
function scriptAtual(): string {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src') ?? ''
}

async function versaoNoServidor(): Promise<string | null> {
  try {
    const r = await fetch(`./?versao=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const m = (await r.text()).match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)
    return m ? m[1] : null
  } catch { return null }
}

let aviso: HTMLElement | null = null
function mostrarAviso() {
  if (aviso) return
  aviso = document.createElement('button')
  aviso.className = 'nova-versao no-print'
  aviso.textContent = '🔄 Saiu uma versão nova do app. Toque para atualizar.'
  aviso.onclick = () => location.reload()
  document.body.appendChild(aviso)
}

/** Confere ao abrir, quando o app volta para a tela e a cada 10 minutos. Se não houver nada sendo editado, atualiza na hora. */
export function vigiarAtualizacoes(temAlteracaoPendente: () => boolean) {
  const atual = scriptAtual()
  if (!atual || import.meta.env.DEV) return
  const conferir = async () => {
    const nova = await versaoNoServidor()
    if (!nova || nova === atual) return
    navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {})
    if (temAlteracaoPendente()) mostrarAviso()
    else location.reload()
  }
  setTimeout(conferir, 3000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void conferir() })
  setInterval(conferir, 10 * 60 * 1000)
}
