// Time Mourinha — "ponte" em São Paulo.
// Alguns sites do governo (transparencia.al.gov.br, IBGE...) não respondem para os servidores do GitHub, que ficam
// fora do Brasil. O coletor pede a página para esta função, que roda no Supabase na região de São Paulo, e ela
// devolve a resposta. Só aceita sites do governo (lista abaixo) e só com a chave secreta PONTE_CHAVE.
// Publicar: supabase functions deploy ponte --no-verify-jwt   ·   segredo: PONTE_CHAVE
const PERMITIDOS = ["al.gov.br", "ibge.gov.br", "inep.gov.br", "saude.gov.br", "maceio.al.gov.br"];
const CHAVE = Deno.env.get("PONTE_CHAVE") ?? "";

Deno.serve(async (req) => {
  if (!CHAVE || req.headers.get("x-chave") !== CHAVE) return new Response("proibido", { status: 403 });
  const alvo = new URL(req.url).searchParams.get("url") ?? "";
  let u: URL;
  try { u = new URL(alvo); } catch { return new Response("url inválida", { status: 400 }); }
  if (u.protocol !== "https:" && u.protocol !== "http:") return new Response("protocolo não permitido", { status: 400 });
  if (!PERMITIDOS.some((d) => u.hostname === d || u.hostname.endsWith("." + d))) return new Response("site não permitido", { status: 403 });
  try {
    const cab: Record<string, string> = { "User-Agent": "TimeMourinha/1.0 (monitor de gestao publica)", "Accept-Language": "pt-BR" };
    for (const k of ["x-requested-with", "accept"]) { const v = req.headers.get(k); if (v) cab[k] = v; }
    const r = await fetch(u, { headers: cab, redirect: "follow" });
    const h = new Headers();
    for (const k of ["content-type", "content-disposition"]) { const v = r.headers.get(k); if (v) h.set(k, v); }
    return new Response(r.body, { status: r.status, headers: h });
  } catch (e) {
    return new Response(`falha ao acessar: ${e}`, { status: 502 });
  }
});
