// Time Mourinha — envia cobranças e lembretes pelo WhatsApp (API oficial da Meta).
// Chamado pelo site (cobrar agora) e pelo relógio do banco a cada 5 minutos (lembretes programados).
// Se o WhatsApp automático ainda não estiver ligado, responde {configurado:false} e o site abre
// o WhatsApp do próprio celular com a mensagem pronta.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "";
const MODELO = Deno.env.get("WHATSAPP_TEMPLATE") || "lembrete_time_mourinha";
const CHAVE = Deno.env.get("ENVIAR_CHAVE") ?? "";
const SITE = Deno.env.get("SITE_URL") || "https://time-mourinha.github.io";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-chave",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const digitos = (t: string) => (t || "").replace(/\D/g, "");
const numeroBR = (t: string) => { const d = digitos(t); return d.length <= 11 ? `55${d}` : d; };
const limpa = (t: string) => (t || "").replace(/\s*\n+\s*/g, " · ").replace(/\s{2,}/g, " ").trim().slice(0, 900);
const dataBR = (iso: string) => iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";

/* Mensagem fora da janela de 24h só sai por modelo aprovado: "Olá, {{1}}! {{2}} Responda por aqui ou abra: {{3}}" */
async function whatsapp(para: string, nome: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
  if (!TOKEN || !PHONE_ID) return { ok: false, erro: "nao_configurado" };
  const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: numeroBR(para), type: "template",
      template: { name: MODELO, language: { code: "pt_BR" }, components: [{ type: "body", parameters: [
        { type: "text", text: limpa(nome || "tudo bem") }, { type: "text", text: limpa(texto) }, { type: "text", text: SITE },
      ] }] },
    }),
  });
  if (r.ok) return { ok: true };
  return { ok: false, erro: (await r.text()).slice(0, 300) };
}

export function textoCobranca(t: any, quem: string) {
  const prazo = t.prazo ? ` Prazo: ${dataBR(t.prazo)}.` : "";
  return `O Time Mourinha pede retorno sobre a tarefa T${t.numero}: ${t.titulo}.${t.detalhes ? " " + t.detalhes + "." : ""}${prazo}` +
    ` Responda com RESOLVIDO, PARCIAL ou NÃO RESOLVIDO e conte o que foi feito.${quem ? ` (Cobrança enviada por ${quem}.)` : ""}`;
}

async function agendaDoDia(dia: string) {
  const { data } = await sb.from("agenda_chefe").select("hora,titulo,local").eq("data", dia).neq("situacao", "cancelado").order("hora");
  if (!data?.length) return "";
  return " Agenda do Mourinha em " + dataBR(dia) + ": " + data.map((a: any) => `${a.hora ? a.hora.slice(0, 5) + " " : ""}${a.titulo}${a.local ? " (" + a.local + ")" : ""}`).join("; ") + ".";
}

async function usuario(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await sb.auth.getUser(jwt);
  if (!data.user) return null;

  const { data: p } = await sb.from("perfis").select("id,nome,papel,poderes").eq("id", data.user.id).maybeSingle();
  if (!p || !(p.papel === "dono" || (p.papel === "admin" && (p.poderes ?? []).includes("cobrancas")))) return null;
  if (p.papel === "dono") {
    // o dono só manda depois do código de segurança do e-mail (mesma regra do banco)
    const comoEle = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: forte } = await comoEle.rpc("sessao_forte");
    if (!forte) return null;
  }
  return p;
}

async function processarFila() {
  const { data: fila } = await sb.from("lembretes").select("*").eq("situacao", "agendado").lte("enviar_em", new Date().toISOString()).limit(50);
  let enviados = 0, pendentes = 0;
  for (const l of fila ?? []) {
    const dia = new Date(new Date(l.enviar_em).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
    const texto = l.mensagem + (l.incluir_agenda ? await agendaDoDia(dia) : "");
    const r = await whatsapp(l.telefone, l.nome, texto);
    if (r.ok) {
      enviados++;
      await sb.from("lembretes").update({ situacao: "enviado", enviado_em: new Date().toISOString(), erro: null }).eq("id", l.id);
      if (l.tarefa_id) await sb.from("tarefa_eventos").insert({ tarefa_id: l.tarefa_id, tipo: "lembrete", texto, canal: "whatsapp", autor: null });
    } else if (r.erro === "nao_configurado") {
      pendentes++; // fica na fila; o site mostra "enviar pelo meu WhatsApp"
      await sb.from("lembretes").update({ erro: "WhatsApp automático ainda não ligado" }).eq("id", l.id);
    } else {
      await sb.from("lembretes").update({ situacao: "erro", erro: r.erro }).eq("id", l.id);
    }
  }
  return { enviados, pendentes, configurado: Boolean(TOKEN && PHONE_ID) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  const corpo = await req.json().catch(() => ({}));

  if (corpo.acao === "processar") {
    if (!CHAVE || req.headers.get("x-chave") !== CHAVE) return json({ erro: "proibido" }, 403);
    return json(await processarFila());
  }

  const eu = await usuario(req);
  if (!eu) return json({ erro: "Só o dono e quem tem o poder de cobranças pode enviar (entre com o código de segurança do e-mail)." }, 403);

  if (corpo.acao === "cobrar") {
    const { data: t } = await sb.from("tarefas").select("*").eq("id", corpo.tarefa_id).maybeSingle();
    if (!t) return json({ erro: "Tarefa não encontrada." }, 404);
    if (!t.telefone) return json({ erro: "Essa tarefa não tem WhatsApp do responsável." }, 400);
    const texto = textoCobranca(t, (eu.nome || "").split(" ")[0]);
    const r = await whatsapp(t.telefone, t.responsavel_nome, texto);
    if (!r.ok) return json({ ok: false, configurado: r.erro !== "nao_configurado", erro: r.erro, texto });
    const agora = new Date().toISOString();
    await sb.from("tarefas").update({ cobrancas: (t.cobrancas ?? 0) + 1, ultima_cobranca: agora, atualizado_em: agora }).eq("id", t.id);
    await sb.from("tarefa_eventos").insert({ tarefa_id: t.id, tipo: "cobranca", texto, canal: "whatsapp", autor: eu.id });
    return json({ ok: true, configurado: true });
  }

  if (corpo.acao === "lembrete") {
    const { data: l } = await sb.from("lembretes").select("*").eq("id", corpo.lembrete_id).maybeSingle();
    if (!l) return json({ erro: "Lembrete não encontrado." }, 404);
    const dia = new Date(new Date(l.enviar_em).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
    const texto = l.mensagem + (l.incluir_agenda ? await agendaDoDia(dia) : "");
    const r = await whatsapp(l.telefone, l.nome, texto);
    if (!r.ok) return json({ ok: false, configurado: r.erro !== "nao_configurado", erro: r.erro, texto });
    await sb.from("lembretes").update({ situacao: "enviado", enviado_em: new Date().toISOString(), erro: null }).eq("id", l.id);
    return json({ ok: true, configurado: true });
  }

  if (corpo.acao === "status") return json({ configurado: Boolean(TOKEN && PHONE_ID) });
  return json({ erro: "ação desconhecida" }, 400);
});
