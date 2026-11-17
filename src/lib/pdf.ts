import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib'
import marcaUrl from '../assets/marca.png'
import { CFG } from '../config'
import { REGRA_CLASSIFICACAO, impactosDoTexto, resumir } from './analise'
import { midiaDemo } from './armazenamento'
import { dataBR, descricaoDoAmbiente, fotosDaObservacao, fotosDoAmbiente, obsComConteudo, precisaFoto, type Midia, type Unidade, type Vistoria } from './modelo'

/* Relatório em PDF de verdade (A4), montado no próprio celular: não depende da janela de impressão. */

const A4 = { w: 595.28, h: 841.89 }
const M = 40 // margem
const LARG = A4.w - 2 * M
const NAVY = rgb(0.063, 0.212, 0.337), LARANJA = rgb(0.929, 0.537, 0.051), CINZA = rgb(0.31, 0.39, 0.46), LINHA = rgb(0.85, 0.89, 0.92)
const COR_SIT: Record<string, { fundo: RGB; texto: RGB; ponto: RGB }> = {
  'Péssimo': { fundo: rgb(0.99, 0.89, 0.88), texto: rgb(0.49, 0.11, 0.07), ponto: rgb(0.75, 0.22, 0.17) },
  Regular: { fundo: rgb(1, 0.95, 0.81), texto: rgb(0.36, 0.26, 0), ponto: rgb(0.95, 0.72, 0.02) },
  Bom: { fundo: rgb(0.89, 0.96, 0.92), texto: rgb(0.07, 0.35, 0.23), ponto: rgb(0.12, 0.54, 0.33) },
}
const COR_NIVEL: Record<string, string> = { 'Péssima': 'Péssimo', Regular: 'Regular', Boa: 'Bom' }

/** A fonte padrão do PDF não tem emoji nem alguns símbolos: tira o que ela não sabe desenhar. */
function limpar(fonte: PDFFont, t: string): string {
  let s = ''
  for (const c of (t ?? '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}️]/gu, '')) {
    try { fonte.encodeText(c); s += c } catch { /* símbolo sem suporte */ }
  }
  return s.replace(/\s+/g, ' ').trim()
}

async function fotoParaJpeg(blob: Blob, max = 1400): Promise<Uint8Array | null> {
  try {
    const img = await createImageBitmap(blob)
    const esc = Math.min(1, max / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.72))
    return b ? new Uint8Array(await b.arrayBuffer()) : null
  } catch { return null }
}

export type ResultadoPdf = { bytes: Uint8Array; nome: string; fotosSemArquivo: number }

export async function gerarPdf(v: Vistoria, u: Unidade | undefined): Promise<ResultadoPdf> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Relatório de Visita Técnica · ${u?.name ?? ''} · ${dataBR(v.inspected_on)}`)
  doc.setAuthor(`${CFG.secretaria} · ${CFG.vinculo}`)
  const f = await doc.embedFont(StandardFonts.Helvetica)
  const fb = await doc.embedFont(StandardFonts.HelveticaBold)
  const r = resumir(v)
  const numero = v.id.slice(0, 8).toUpperCase()
  let logo: PDFImage | null = null
  try { logo = await doc.embedPng(await (await fetch(marcaUrl)).arrayBuffer()) } catch { /* sem logo */ }

  let pag: PDFPage = doc.addPage([A4.w, A4.h])
  let y = A4.h - M
  const paginas: PDFPage[] = [pag]
  const novaPagina = () => { pag = doc.addPage([A4.w, A4.h]); paginas.push(pag); y = A4.h - M }
  const espaco = (h: number) => { if (y - h < M + 24) novaPagina() }

  /** Quebra o texto em linhas que cabem na largura. */
  const quebrar = (t: string, fonte: PDFFont, tam: number, larg: number): string[] => {
    const linhas: string[] = []
    for (const par of limpar(fonte, t).split('\n')) {
      let atual = ''
      for (const p of par.split(' ')) {
        const tenta = atual ? atual + ' ' + p : p
        if (fonte.widthOfTextAtSize(tenta, tam) <= larg) atual = tenta
        else { if (atual) linhas.push(atual); atual = p }
      }
      linhas.push(atual)
    }
    return linhas
  }
  const texto = (t: string, o: { x?: number; tam?: number; fonte?: PDFFont; cor?: RGB; larg?: number; entre?: number } = {}) => {
    const tam = o.tam ?? 10, fonte = o.fonte ?? f, larg = o.larg ?? LARG, x = o.x ?? M, entre = o.entre ?? tam * 1.38
    for (const l of quebrar(t, fonte, tam, larg)) {
      espaco(entre)
      pag.drawText(l, { x, y: y - tam, size: tam, font: fonte, color: o.cor ?? NAVY })
      y -= entre
    }
  }
  const titulo = (t: string) => {
    espaco(40); y -= 10
    pag.drawText(limpar(fb, t), { x: M, y: y - 13, size: 13, font: fb, color: NAVY })
    y -= 19
    pag.drawRectangle({ x: M, y: y - 2, width: LARG, height: 1.6, color: LARANJA })
    y -= 10
  }

  /* ---- capa ---- */
  const capaH = 92
  pag.drawRectangle({ x: 0, y: A4.h - capaH, width: A4.w, height: capaH, color: NAVY })
  pag.drawRectangle({ x: 0, y: A4.h - capaH - 4, width: A4.w, height: 4, color: LARANJA })
  let xt = M
  if (logo) {
    const lh = 40, lw = (logo.width / logo.height) * lh
    pag.drawRectangle({ x: M - 6, y: A4.h - 22 - lh - 6, width: lw + 12, height: lh + 12, color: rgb(1, 1, 1) })
    pag.drawImage(logo, { x: M, y: A4.h - 22 - lh, width: lw, height: lh })
    xt = M + lw + 26
  }
  pag.drawText(limpar(fb, `${CFG.vinculo} · ${CFG.secretaria}`.toUpperCase()), { x: xt, y: A4.h - 30, size: 7.5, font: fb, color: LARANJA })
  pag.drawText('Relatório de Visita Técnica', { x: xt, y: A4.h - 52, size: 19, font: fb, color: rgb(1, 1, 1) })
  pag.drawText(limpar(f, `${CFG.titulo} · nº ${numero} · vistoria de ${dataBR(v.inspected_on)}`), { x: xt, y: A4.h - 70, size: 9, font: f, color: rgb(0.85, 0.9, 0.95) })
  y = A4.h - capaH - 22

  /* ---- 1. identificação ---- */
  titulo('1. Identificação')
  const ficha: [string, string][] = [
    ['Unidade', u?.name ?? ''], ['Tipo · Distrito', `${u?.kind ?? ''} · Distrito ${u?.district ?? ''}`], ['Endereço', u?.address ?? ''],
    ['CNES', u?.cnes || 'pendente'], ['Data da vistoria', dataBR(v.inspected_on)], ['Vistoriador(a)', `${v.inspector} · ${CFG.secretaria}`],
  ]
  for (const [k, val] of ficha) {
    const linhas = quebrar(val, k === 'Unidade' ? fb : f, 10, LARG - 120)
    const h = Math.max(1, linhas.length) * 13.5 + 7
    espaco(h)
    pag.drawRectangle({ x: M, y: y - h, width: 112, height: h, color: rgb(0.94, 0.96, 0.98) })
    pag.drawRectangle({ x: M, y: y - h, width: LARG, height: h, borderColor: LINHA, borderWidth: 0.6 })
    pag.drawText(k, { x: M + 6, y: y - 14, size: 9, font: fb, color: CINZA })
    linhas.forEach((l, i) => pag.drawText(l, { x: M + 120, y: y - 14 - i * 13.5, size: 10, font: k === 'Unidade' ? fb : f, color: NAVY }))
    y -= h
  }

  /* ---- 2. classificação ---- */
  titulo('2. Classificação da unidade')
  const cn = COR_SIT[COR_NIVEL[r.nivel.nome]]
  espaco(64)
  pag.drawRectangle({ x: M, y: y - 58, width: LARG, height: 58, color: cn.fundo })
  pag.drawCircle({ x: M + 30, y: y - 29, size: 15, color: cn.ponto })
  pag.drawText('CLASSIFICAÇÃO', { x: M + 56, y: y - 22, size: 7.5, font: fb, color: cn.texto })
  pag.drawText(`Unidade ${r.nivel.nome.toLowerCase()}`, { x: M + 56, y: y - 44, size: 20, font: fb, color: cn.texto })
  const ind = String(r.pontos)
  pag.drawText('ÍNDICE', { x: A4.w - M - 70, y: y - 18, size: 7.5, font: fb, color: cn.texto })
  pag.drawText(ind, { x: A4.w - M - 70, y: y - 42, size: 22, font: fb, color: cn.texto })
  pag.drawText('de 100', { x: A4.w - M - 70 + fb.widthOfTextAtSize(ind, 22) + 4, y: y - 42, size: 8, font: f, color: cn.texto })
  y -= 68
  const kpis: [string, string, RGB][] = [
    [String(r.avaliados), 'ambientes avaliados', NAVY], [String(r.pessimos), 'péssimos', COR_SIT['Péssimo'].ponto],
    [String(r.regulares), 'regulares', rgb(0.6, 0.42, 0)], [String(r.bons), 'bons', COR_SIT.Bom.ponto],
    [String(r.fotos), 'fotos', NAVY], [String(r.observacoes), 'observações', NAVY],
  ]
  const kw = (LARG - 5 * 6) / 6
  espaco(46)
  kpis.forEach(([n, t, cor], i) => {
    const x = M + i * (kw + 6)
    pag.drawRectangle({ x, y: y - 42, width: kw, height: 42, color: rgb(0.94, 0.96, 0.98) })
    pag.drawText(n, { x: x + kw / 2 - fb.widthOfTextAtSize(n, 16) / 2, y: y - 22, size: 16, font: fb, color: cor })
    pag.drawText(t, { x: x + kw / 2 - f.widthOfTextAtSize(t, 7.5) / 2, y: y - 35, size: 7.5, font: f, color: CINZA })
  })
  y -= 52
  texto(r.avaliados
    ? `Foram avaliados ${r.avaliados} ambiente(s): ${r.bons} bom(ns), ${r.regulares} regular(es) e ${r.pessimos} péssimo(s).`
    : 'Nenhum ambiente foi avaliado nesta vistoria.', { tam: 10 })
  texto(`Critério: ${REGRA_CLASSIFICACAO} Índice: 0 = todos os ambientes bons; 100 = todos péssimos.`, { tam: 7.5, cor: CINZA })

  /* ---- 3. situação de cada ambiente ---- */
  titulo('3. Situação de cada ambiente')
  const ordem: Record<string, number> = { 'Péssimo': 0, Regular: 1, Bom: 2 }
  const ambientes = [...v.rooms].sort((a, b) => (ordem[a.situacao ?? ''] ?? 3) - (ordem[b.situacao ?? ''] ?? 3))
  const c1 = 130, c2 = 78, c3 = LARG - c1 - c2
  espaco(22)
  pag.drawRectangle({ x: M, y: y - 18, width: LARG, height: 18, color: NAVY })
  ;[['Ambiente', 0], ['Situação', c1], ['O que foi observado', c1 + c2]].forEach(([t, dx]) =>
    pag.drawText(String(t), { x: M + 6 + Number(dx), y: y - 13, size: 8.5, font: fb, color: rgb(1, 1, 1) }))
  y -= 18
  for (const a of ambientes) {
    const imp = precisaFoto(a.situacao) ? impactosDoTexto([a.descricao, ...fotosDoAmbiente(v, a.id).map((m) => m.caption)].join(' '), 1)[0] : ''
    const desc = quebrar(descricaoDoAmbiente(v, a) || (a.situacao === 'Bom' ? 'Sem problemas.' : '-'), f, 9, c3 - 12)
    const impL = imp ? quebrar('O que causa: ' + imp, f, 7.5, c3 - 12) : []
    const nomeL = quebrar(a.name, fb, 9, c1 - 12)
    const h = Math.max(nomeL.length * 12, desc.length * 12 + impL.length * 10) + 10
    espaco(h)
    const cs = a.situacao ? COR_SIT[a.situacao] : null
    if (cs) pag.drawRectangle({ x: M + c1, y: y - h, width: c2, height: h, color: cs.fundo })
    pag.drawRectangle({ x: M, y: y - h, width: LARG, height: h, borderColor: LINHA, borderWidth: 0.6 })
    nomeL.forEach((l, i) => pag.drawText(l, { x: M + 6, y: y - 15 - i * 12, size: 9, font: fb, color: NAVY }))
    if (cs) {
      pag.drawCircle({ x: M + c1 + 11, y: y - 12, size: 4, color: cs.ponto })
      pag.drawText(a.situacao!, { x: M + c1 + 19, y: y - 15, size: 9, font: fb, color: cs.texto })
    } else pag.drawText('-', { x: M + c1 + 8, y: y - 15, size: 9, font: f, color: CINZA })
    desc.forEach((l, i) => pag.drawText(l, { x: M + c1 + c2 + 6, y: y - 15 - i * 12, size: 9, font: f, color: NAVY }))
    impL.forEach((l, i) => pag.drawText(l, { x: M + c1 + c2 + 6, y: y - 15 - desc.length * 12 - i * 10, size: 7.5, font: f, color: CINZA }))
    y -= h
  }

  /* ---- fotos: grandes, 2 por linha; foto sozinha ocupa a largura toda ---- */
  let numFoto = 0, semArquivo = 0
  const desenharFotos = async (lista: Midia[]) => {
    const imgs: { m: Midia; img: PDFImage | null }[] = []
    for (const m of lista) {
      const blob = await midiaDemo(m.id)
      const bytes = blob ? await fotoParaJpeg(blob) : null
      if (!bytes) semArquivo++
      imgs.push({ m, img: bytes ? await doc.embedJpg(bytes) : null })
    }
    for (let i = 0; i < imgs.length; i += 2) {
      const par = imgs.slice(i, i + 2)
      const sozinha = par.length === 1
      const w = sozinha ? LARG : (LARG - 12) / 2
      const alturas = par.map(({ img }) => (img ? Math.min(sozinha ? 330 : 210, (img.height / img.width) * w) : 60))
      const capL = par.map(({ m }) => quebrar(m.caption, f, 9, w - 4))
      const h = Math.max(...alturas) + Math.max(...capL.map((c) => c.length)) * 11.5 + 26
      espaco(h)
      par.forEach(({ img }, j) => {
        const x = M + j * (w + 12), ah = alturas[j]
        numFoto++
        if (img) {
          const iw = Math.min(w, (img.width / img.height) * ah)
          pag.drawImage(img, { x: x + (w - iw) / 2, y: y - ah, width: iw, height: ah })
        } else {
          pag.drawRectangle({ x, y: y - ah, width: w, height: ah, color: rgb(0.94, 0.96, 0.98) })
          pag.drawText('Foto não disponível neste aparelho', { x: x + 8, y: y - ah / 2, size: 8, font: f, color: CINZA })
        }
        pag.drawRectangle({ x, y: y - 14, width: 40, height: 14, color: NAVY })
        pag.drawText(`Foto ${numFoto}`, { x: x + 4, y: y - 10, size: 7.5, font: fb, color: rgb(1, 1, 1) })
        capL[j].forEach((l, k) => pag.drawText(l, { x: x + 2, y: y - ah - 13 - k * 11.5, size: 9, font: f, color: NAVY }))
      })
      y -= h
    }
  }
  const comFotos = ambientes.filter((a) => fotosDoAmbiente(v, a.id).length)
  let sec = 4
  if (comFotos.length) {
    titulo(`${sec++}. Registro fotográfico por ambiente`)
    for (const a of comFotos) {
      espaco(fotosDoAmbiente(v, a.id).length === 1 ? 300 : 230) // título nunca fica sozinho no fim da página
      texto(`${a.name}${a.situacao ? ' · ' + a.situacao : ''}`, { tam: 11, fonte: fb })
      y -= 2
      await desenharFotos(fotosDoAmbiente(v, a.id))
    }
  }

  /* ---- observações ---- */
  const pos = (room?: string) => (room ? ambientes.findIndex((a) => a.id === room) : 999)
  const obs = (v.observacoes ?? []).filter((o) => obsComConteudo(v, o)).sort((a, b) => pos(a.room) - pos(b.room))
  if (obs.length) {
    titulo(`${sec++}. Observações da visita`)
    for (const [i, o] of obs.entries()) {
      const onde = o.room ? (v.rooms.find((x) => x.id === o.room)?.name ?? 'Ambiente') : 'Geral'
      espaco(fotosDaObservacao(v, o.id).length ? 230 : 40)
      texto(`${i + 1}. ${onde}${o.quem ? ' · relatado por ' + o.quem : ''}`, { tam: 10, fonte: fb })
      if (o.texto.trim()) texto(o.texto, { tam: 10 })
      y -= 4
      await desenharFotos(fotosDaObservacao(v, o.id))
      y -= 6
    }
  }

  /* ---- assinaturas ---- */
  espaco(80); y -= 46
  const aw = (LARG - 40) / 2
  ;[[v.inspector || 'Vistoriador(a)', `Vistoriador(a) da ${CFG.secretaria}`], ['Responsável pela unidade', 'Nome e matrícula']].forEach(([nome, papel], i) => {
    const x = M + i * (aw + 40)
    pag.drawLine({ start: { x, y }, end: { x: x + aw, y }, thickness: 0.8, color: NAVY })
    const n = limpar(fb, nome), p = limpar(f, papel)
    pag.drawText(n, { x: x + aw / 2 - fb.widthOfTextAtSize(n, 9.5) / 2, y: y - 13, size: 9.5, font: fb, color: NAVY })
    pag.drawText(p, { x: x + aw / 2 - f.widthOfTextAtSize(p, 8) / 2, y: y - 25, size: 8, font: f, color: CINZA })
  })

  /* ---- rodapé com página ---- */
  const rod = limpar(f, `${CFG.orgao} · ${CFG.secretaria} · ${CFG.titulo} · Relatório nº ${numero} · ${u?.name ?? ''}`)
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 30 }, end: { x: A4.w - M, y: 30 }, thickness: 0.5, color: LINHA })
    p.drawText(rod.length > 120 ? rod.slice(0, 117) + '...' : rod, { x: M, y: 18, size: 6.8, font: f, color: CINZA })
    const pg = `${i + 1}/${paginas.length}`
    p.drawText(pg, { x: A4.w - M - f.widthOfTextAtSize(pg, 7.5), y: 18, size: 7.5, font: f, color: CINZA })
  })

  const nomeArq = `Relatorio ${(u?.name ?? 'unidade').replace(/[^\p{L}\p{N} ]/gu, '').slice(0, 60)} ${v.inspected_on}.pdf`
  return { bytes: await doc.save(), nome: nomeArq, fotosSemArquivo: semArquivo }
}
