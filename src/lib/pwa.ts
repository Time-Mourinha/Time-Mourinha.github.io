import { sb } from './armazenamento'

/* ---------------------------------------------------------------- instalação como aplicativo */
type ConviteInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let convite: ConviteInstalacao | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

export function registrarAplicativo() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {})
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); convite = e as ConviteInstalacao; avisar() })
  window.addEventListener('appinstalled', () => { convite = null; avisar() })
}
export function aoMudarInstalacao(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f) } }

const ua = navigator.userAgent
export const ehIos = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
export const instalado = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
export const temConvite = () => Boolean(convite)

/** Abre o convite do navegador (Android, Chrome, Edge). Devolve false se o navegador não tiver convite. */
export async function instalarAgora(): Promise<boolean> {
  if (!convite) return false
  const c = convite
  convite = null
  await c.prompt()
  await c.userChoice.catch(() => null)
  avisar()
  return true
}

/** Passo a passo para quem o navegador não deixa instalar com um toque. */
export function passosInstalacao(): string {
  if (ehIos && /CriOS/.test(ua)) return 'No Chrome do iPhone, toque em Compartilhar (o quadrado com a seta, ao lado do endereço) e depois em “Adicionar à Tela de Início”.'
  if (ehIos && /FxiOS/.test(ua)) return 'No Firefox do iPhone, toque no menu ☰, depois em Compartilhar e em “Adicionar à Tela de Início”.'
  if (ehIos) return 'No Safari, toque em Compartilhar (o quadrado com a seta para cima) e depois em “Adicionar à Tela de Início”.'
  if (/android/i.test(ua) && /SamsungBrowser/.test(ua)) return 'No navegador Samsung, toque no menu ☰ e depois em “Adicionar página a” › “Tela inicial”.'
  if (/android/i.test(ua) && /Firefox/.test(ua)) return 'No Firefox, toque nos três pontinhos ⋮ e depois em “Instalar”.'
  if (/android/i.test(ua)) return 'Toque nos três pontinhos ⋮ do navegador e depois em “Instalar app” ou “Adicionar à tela inicial”.'
  if (/Edg\//.test(ua)) return 'No Edge, clique nos três pontinhos … › Aplicativos › “Instalar este site como aplicativo”.'
  if (/Chrome\//.test(ua)) return 'No Chrome, clique no ícone de instalar na barra de endereço ou em ⋮ › Transmitir, salvar e compartilhar › “Instalar página como app”.'
  if (/Safari\//.test(ua)) return 'No Safari do Mac, abra o menu Arquivo › “Adicionar ao Dock”.'
  return 'Abra o endereço no Chrome, no Edge ou no Safari e use a opção “Instalar” ou “Adicionar à tela inicial” do menu.'
}

/* ---------------------------------------------------------------- avisos de novos pedidos (administração) */
export const avisosSuportados = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function chaveBytes(base64url: string) {
  const b = atob(base64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64url.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}
const paraBase64url = (buf: ArrayBuffer | null) =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : ''

export async function avisosAtivos(): Promise<boolean> {
  if (!avisosSuportados() || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.getRegistration()
  return Boolean(await reg?.pushManager.getSubscription())
}

/** Pede permissão, assina os avisos deste aparelho e guarda a assinatura no banco. */
export async function ativarAvisos() {
  if (!avisosSuportados()) throw new Error(ehIos && !instalado()
    ? 'No iPhone, os avisos só funcionam com o app instalado na Tela de Início. Instale e abra pelo ícone.'
    : 'Este navegador não recebe avisos.')
  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') throw new Error('Os avisos foram bloqueados. Libere as notificações deste site nos ajustes do celular.')
  const { data: chave, error } = await sb!.rpc('vapid_public_key')
  if (error || !chave) throw new Error('Os avisos ainda não estão configurados no servidor. Tente de novo em alguns minutos.')
  const reg = await navigator.serviceWorker.ready
  const assinatura = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(chave as string).buffer as ArrayBuffer }))
  const { error: e2 } = await sb!.from('push_subscriptions').upsert({
    endpoint: assinatura.endpoint, p256dh: paraBase64url(assinatura.getKey('p256dh')), auth: paraBase64url(assinatura.getKey('auth')),
  })
  if (e2) throw new Error(e2.message)
}
