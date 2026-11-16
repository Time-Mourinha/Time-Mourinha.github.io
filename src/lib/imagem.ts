/** Diminui fotos grandes antes de enviar: sobe mais rápido no 4G e ocupa menos espaço (máx. 1600 px, JPEG). */
export async function reduzirImagem(arq: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(arq.type) || arq.size < 600_000) return arq
  try {
    const img = await createImageBitmap(arq)
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * escala)
    c.height = Math.round(img.height * escala)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.82))
    if (!blob || blob.size >= arq.size) return arq
    return new File([blob], arq.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch { return arq }
}
