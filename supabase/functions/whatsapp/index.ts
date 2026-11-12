// Time Mourinha — recebe as respostas do WhatsApp e coloca no painel Ao vivo.
// Publicar: supabase functions deploy whatsapp --no-verify-jwt
// Segredos: supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_ID=... WHATSAPP_VERIFY_TOKEN=... WHATSAPP_APP_SECRET=...
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "";
const VERIFY = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const digitos = (t: string) => (t || "").replace(/\D/g, "");
// compara pelos 8 últimos dígitos (resolve o 9º dígito e o +55)
const mesmoNumero = (a: string, b: string) => digitos(a).slice(-8) === digitos(b).slice(-8) && digitos(a).length >= 8;
const hojeMaceio = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

function tipoDoTexto(t: string): string {
  const s = semAcento(t);
  if (/home ?office|em casa|remoto/.test(s)) return "home_office";
  if (/encerr|finaliz|termin(ei|amos) o dia|fim do dia/.test(s)) return "encerrado";
  if (/reuniao|reunido/.test(s)) return "reuniao";
  if (/indo|a caminho|chegando|saindo|deslocamento/.test(s)) return "deslocamento";
  if (/escritorio|sede|gabinete/.test(s)) return "escritorio";
  if (/visit|fiscaliz|monitor|vistori|atividade/.test(s)) return "em_atividade";
  return "outro";
}

// "9h reunião no Sebrae", "às 14:30 visita ao posto", "15h - escola X"
function compromissos(texto: string): { hora: string; texto: string }[] {
  const itens: { hora: string; texto: string }[] = [];
  for (const linha of texto.split(/\n|;/)) {
    // exige "9h", "9h30", "14:30" ou "às 9" para não confundir com "visitei 3 escolas"
    const m = linha.match(/(?:^|\s)(?:[àa]s\s+)?(\d{1,2})(?:h(\d{2})?|:(\d{2}))(?:rs|oras)?(?![\w])\s*[-–:,]?\s*(.*)/i)
      ?? linha.match(/(?:^|\s)[àa]s\s+(\d{1,2})()()(?![\d:h])\s*[-–:,]?\s*(.*)/i);
    if (!m) continue;
    const h = Number(m[1]), min = Number(m[2] || m[3] || 0);
    if (h > 23 || min > 59) continue;
    const antes = linha.slice(0, m.index ?? 0).trim();
    const resto = [antes, (m[4] ?? "").trim()].filter(Boolean).join(" ").replace(/^(eu\s+)?(vou ter|vou fazer|vou)\s+/i, "").replace(/\s+[àa]s$/i, "");
    itens.push({ hora: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`, texto: resto || linha.trim() });
  }
  return itens;
}

// "Resolvido, trocamos os aparelhos" → resolvido; "parcial..." → parcial; "não resolvido..." → nao_resolvido
function situacaoDaResposta(t: string): string | null {
  const s = semAcento(t);
  if (/\b(nao|ainda nao|nada)\b.{0,20}(resolv|feito|conclu)|nao deu|sem solucao|nao foi/.test(s)) return "nao_resolvido";
  if (/parcial|em parte|metade|em andamento|andamento|falta(m)? /.test(s)) return "parcial";
  if (/resolvid|resolvemos|resolvi|conclu|feito|pronto|finalizad|ja foi|entregue|ok\b/.test(s)) return "resolvido";
  return null;
}
const ROTULO: Record<string, string> = { resolvido: "Resolvido", parcial: "Resolvido em parte", nao_resolvido: "Não resolvido" };

/* Resposta de quem foi cobrado (Sônia, Fernando...): vai para a linha do tempo da tarefa */
async function respostaDeTarefa(de: string, texto: string, ehMembro: boolean): Promise<boolean> {
  const { data: abertas } = await sb.from("tarefas").select("id,numero,titulo,telefone,responsavel_nome,situacao,ultima_cobranca")
    .not("telefone", "is", null).order("ultima_cobranca", { ascending: false, nullsFirst: false }).limit(500);
  const minhas = (abertas ?? []).filter((t: any) => mesmoNumero(t.telefone, de));
  if (!minhas.length) return false;
  const cod = texto.match(/\bT\s?(\d{1,6})\b/i);
  // cobradas nos últimos 10 dias e ainda não resolvidas; integrante do time só entra aqui se estiver sendo cobrado
  const ativas = minhas.filter((t: any) => t.situacao !== "resolvido" && t.ultima_cobranca && Date.now() - Date.parse(t.ultima_cobranca) < 10 * 864e5);
  const t: any = (cod && minhas.find((x: any) => String(x.numero) === cod[1])) || ativas[0] || (ehMembro ? null : minhas[0]);
  if (!t) return false;
  const nome = (t.responsavel_nome || "").split(" ")[0];
  if (!texto.trim()) { await responder(de, `${nome}, responda em texto, por favor: RESOLVIDO, PARCIAL ou NÃO RESOLVIDO e o que foi feito.`); return true; }
  const sit = situacaoDaResposta(texto);
  const agora = new Date().toISOString();
  await sb.from("tarefa_eventos").insert({ tarefa_id: t.id, tipo: "resposta", texto: texto.slice(0, 2000), situacao: sit, canal: "whatsapp", autor: null });
  await sb.from("tarefas").update({ ...(sit ? { situacao: sit } : {}), ultima_resposta: texto.slice(0, 500), ultima_resposta_em: agora, atualizado_em: agora }).eq("id", t.id);
  await responder(de, sit
    ? `✅ Obrigado, ${nome}! Registrado na tarefa T${t.numero} (${t.titulo}) como: ${ROTULO[sit]}.${sit !== "resolvido" ? " Quando avançar, mande outra mensagem contando." : ""}`
    : `✅ Recebido, ${nome}, e anotado na tarefa T${t.numero} (${t.titulo}). A situação está como? Responda RESOLVIDO, PARCIAL ou NÃO RESOLVIDO.`);
  return true;
}

async function responder(para: string, texto: string) {
  if (!TOKEN || !PHONE_ID) return;
  await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: texto } }),
  });
}

async function assinaturaValida(req: Request, corpo: string) {
  if (!APP_SECRET) return true;
  const assinatura = req.headers.get("x-hub-signature-256")?.replace("sha256=", "") ?? "";
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === assinatura;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    // verificação do webhook pela Meta
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === VERIFY)
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    return new Response("proibido", { status: 403 });
  }
  const corpo = await req.text();
  if (!(await assinaturaValida(req, corpo))) return new Response("assinatura inválida", { status: 401 });
  const dados = JSON.parse(corpo);
  const msgs = (dados.entry ?? []).flatMap((e: any) => (e.changes ?? []).flatMap((c: any) => c.value?.messages ?? []));
  if (!msgs.length) return new Response("ok");

  const { data: perfis } = await sb.from("perfis").select("id,nome,telefone,papel").in("papel", ["membro", "admin", "dono"]);
  for (const m of msgs) {
    const de = m.from as string;
    const texto: string = m.type === "text" ? m.text?.body ?? "" : m.type === "button" ? m.button?.text ?? "" : "";
    // 1º: é resposta a uma cobrança? (vale para quem é de fora do time e para integrantes cobrados)
    const p = (perfis ?? []).find((x: any) => x.telefone && mesmoNumero(x.telefone, de));
    if (await respostaDeTarefa(de, texto, Boolean(p))) continue;
    if (!p) { await responder(de, "Este número não está cadastrado no Time Mourinha. Coloque seu WhatsApp em Meu perfil, no site."); continue; }
    const nome = (p.nome || "").split(" ")[0];
    if (!texto.trim()) {
      await responder(de, `${nome}, por aqui eu registro só texto. Fotos e vídeos vão pelo clipe da atividade do dia no site.`);
      continue;
    }
    const comp = compromissos(texto);
    if (comp.length) {
      await sb.from("agenda").insert(comp.map((c) => ({ autor: p.id, data: hojeMaceio(), hora: c.hora, texto: c.texto, origem: "whatsapp" })));
      await sb.from("atualizacoes").insert({ autor: p.id, texto: `Programou: ${comp.map((c) => `${c.hora} ${c.texto}`).join("; ")}`, tipo: tipoDoTexto(texto), origem: "whatsapp" });
      await responder(de, `✅ Anotado na sua agenda de hoje:\n${comp.map((c) => `• ${c.hora} ${c.texto}`).join("\n")}\n\nJá aparece no painel Ao vivo. Tem mais alguma atividade hoje? Mande do mesmo jeito.`);
    } else {
      const tipo = tipoDoTexto(texto);
      await sb.from("atualizacoes").insert({ autor: p.id, texto: texto.slice(0, 500), tipo, origem: "whatsapp" });
      const { count } = await sb.from("agenda").select("id", { count: "exact", head: true }).eq("autor", p.id).eq("data", hojeMaceio());
      await responder(de, tipo === "encerrado"
        ? `✅ Dia encerrado, ${nome}. Obrigado! Se faltou alguma foto, envie pelo clipe da atividade no site.`
        : `✅ Anotado, ${nome}! Já está no painel Ao vivo.${count ? "" : "\n\nQual é sua programação de hoje? Mande um compromisso por linha, ex.:\n9h reunião no Sebrae\n14h visita ao posto de saúde"}`);
    }
  }
  return new Response("ok");
});
