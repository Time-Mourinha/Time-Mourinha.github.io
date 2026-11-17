import c from '../modelo.config.json'

/** Identidade do site (vem do modelo.config.json). Troque lá para criar outro site a partir deste modelo. */
export const CFG = c as {
  orgao: string; orgao_logo_alt: string; cidade: string; uf: string; secretaria: string; vinculo: string; area: string
  titulo: string; nome_curto: string; rede: string; unidade_tipo: string; cor: string; site_url: string; supabase_ref: string; chave_local: string
}
