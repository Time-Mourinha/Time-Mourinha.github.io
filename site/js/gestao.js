/* Time Mourinha — Agenda do Mourinha, tarefas e cobranças pelo WhatsApp, contatos e o Assistente. */
"use strict";
(() => {
  const C = window.MOURINHA;
  const { esc, botao, trilha, cabeca, tag, $ } = window.MOURINHA_APP;
  const X = () => window.Time.ctx;
  const app = document.getElementById("app");

  /* ---------------------------------------------------------- utilidades */
  const semAcento = (t) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const digitos = (t) => (t || "").replace(/\D/g, "");
  const telBR = (t) => { const d = digitos(t); return !d ? "" : d.length <= 11 ? `55${d}` : d; };
  const fmtTel = (t) => { const d = telBR(t).slice(2); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : t || ""; };
  const waLink = (tel, texto) => `https://wa.me/${telBR(tel)}?text=${encodeURIComponent(texto)}`;
  const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const difDias = (a, b) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 864e5);
  const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const fmtDia = (iso) => { if (!iso) return ""; const d = new Date(iso + "T12:00:00Z"); return `${SEMANA[d.getUTCDay()]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`; };
  const fmtHora = (h) => (h ? h.slice(0, 5).replace(":00", "h").replace(":", "h") : "");
  const fmtQuando = (ts) => new Date(ts).toLocaleString("pt-BR", { timeZone: "America/Maceio", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const desde = (ts) => {
    const m = Math.max(0, Math.round((Date.now() - Date.parse(ts)) / 6e4));
    if (m < 1) return "agora";
    if (m < 60) return `há ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `há ${h} h${m % 60 && h < 6 ? ` ${m % 60} min` : ""}`;
    const d = Math.floor(h / 24);
    return `há ${d} dia${d > 1 ? "s" : ""}${h % 24 && d < 3 ? ` e ${h % 24} h` : ""}`;
  };
  const SIT = { aberta: "Em aberto", parcial: "Resolvido em parte", resolvido: "Resolvido", nao_resolvido: "Não resolvido" };
  const SIT_TAG = { aberta: "media", parcial: "parcial", resolvido: "resolvido", nao_resolvido: "nao_resolvido" };
  const primeiro = (n) => (n || "").split(" ")[0];
  const aviso = (txt, cls = "azul") => { const d = document.createElement("div"); d.className = `aviso ${cls}`; d.innerHTML = txt; app.prepend(d); window.scrollTo(0, 0); setTimeout(() => d.remove(), 9000); };

  // relógios "sem resposta há…" e canais em tempo real: desligados ao trocar de página
  let relogio = null, canal = null;
  window.addEventListener("hashchange", () => {
    clearInterval(relogio); relogio = null;
    if (canal) { X().sb.removeChannel(canal); canal = null; }
  });
  function tic() {
    document.querySelectorAll("[data-desde]").forEach((el) => (el.textContent = desde(el.dataset.desde)));
    if (!relogio) relogio = setInterval(tic, 30000);
  }
  function aoMudar(tabelas, fn) {
    const { sb } = X();
    canal = sb.channel("gestao-" + Math.random().toString(36).slice(2));
    tabelas.forEach((t) => canal.on("postgres_changes", { event: "*", schema: "public", table: t }, () => fn()));
    canal.subscribe();
  }

  /* WhatsApp automático (API oficial) ligado? Se não, o botão abre o WhatsApp do próprio celular. */
  let whatsAuto = null;
  async function chamarEnviar(corpo) {
    const { sb } = X();
    const { data } = await sb.auth.getSession();
    const r = await fetch(`${C.SUPABASE_URL}/functions/v1/enviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: C.SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token || C.SUPABASE_ANON_KEY}` },
      body: JSON.stringify(corpo),
    });
    return r.json().catch(() => ({ erro: `HTTP ${r.status}` }));
  }
  async function statusWhats() {
    if (whatsAuto !== null) return whatsAuto;
    try { whatsAuto = Boolean((await chamarEnviar({ acao: "status" })).configurado); } catch { whatsAuto = false; }
    return whatsAuto;
  }

  const textoCobranca = (t) => {
    const quem = primeiro(X().eu()?.perfil?.nome);
    return `Olá, ${primeiro(t.responsavel_nome) || "tudo bem"}! O Time Mourinha pede retorno sobre a tarefa T${t.numero}: ${t.titulo}.` +
      `${t.detalhes ? " " + t.detalhes + "." : ""}${t.prazo ? ` Prazo: ${fmtDia(t.prazo)}.` : ""}` +
      ` Responda com RESOLVIDO, PARCIAL ou NÃO RESOLVIDO e conte o que foi feito.${quem ? ` (${quem}, Time Mourinha)` : ""}`;
  };

  /* Pessoas que podem ser responsáveis: contatos + integrantes com WhatsApp no perfil */
  async function pessoas() {
    const { sb } = X();
    const [{ data: ct }, { data: ps }] = await Promise.all([
      sb.from("contatos").select("*").order("nome"),
      sb.from("perfis").select("id,nome,telefone,papel").not("telefone", "is", null).neq("papel", "bloqueado"),
    ]);
    return [...(ct || []).map((c) => ({ ...c, origem: "contato" })),
      ...(ps || []).filter((p) => digitos(p.telefone).length >= 10).map((p) => ({ id: "p:" + p.id, nome: p.nome, telefone: p.telefone, cargo: "Time Mourinha", origem: "time" }))];
  }
  function seletorPessoa(lista, sel = "") {
    return `<label>Responsável (quem vai ser cobrado)<select name="pessoa" required>
      <option value="">Escolha…</option>${lista.map((p) => `<option value="${esc(p.id)}" ${p.id === sel ? "selected" : ""}>${esc(p.nome)}${p.cargo ? " — " + esc(p.cargo) : ""}</option>`).join("")}
      <option value="novo">＋ Pessoa nova…</option></select></label>
      <div class="grade2" data-novo hidden><label>Nome<input name="novo_nome" placeholder="Ex.: Sônia"></label>
      <label>WhatsApp com DDD<input name="novo_tel" inputmode="tel" placeholder="82 99999-9999"></label>
      <label>Cargo / onde trabalha<input name="novo_cargo" placeholder="Ex.: Diretora do Hospital do Coração"></label></div>`;
  }
  function ligarSeletor(f) {
    const s = f.pessoa, n = f.querySelector("[data-novo]");
    if (!s || !n) return;
    s.onchange = () => { n.hidden = s.value !== "novo"; f.novo_nome.required = f.novo_tel.required = s.value === "novo"; };
  }
  async function resolverPessoa(f, lista) {
    if (f.pessoa.value === "novo") {
      if (digitos(f.novo_tel.value).length < 10) throw new Error("Coloque o WhatsApp com DDD, ex.: 82 99999-9999.");
      const { data, error } = await X().sb.from("contatos").insert({ nome: f.novo_nome.value.trim(), telefone: telBR(f.novo_tel.value), cargo: f.novo_cargo.value.trim() || null }).select().single();
      if (error) throw error;
      return data;
    }
    return lista.find((p) => p.id === f.pessoa.value);
  }

  /* Prazo em número: 1, 2, 3, 5 dias… 1 mês, 2 meses. A data sai sozinha. */
  function campoPrazo(base = hoje()) {
    const atalhos = [[1, "1 dia"], [2, "2 dias"], [3, "3 dias"], [5, "5 dias"], [7, "7 dias"], [15, "15 dias"], [30, "1 mês"], [60, "2 meses"]];
    return `<fieldset class="prazo" data-base="${base}"><legend>Prazo para resolver</legend>
      <div class="opcoes">${atalhos.map(([n, t]) => `<label><input type="radio" name="prazo_rapido" value="${n}" ${n === 3 ? "checked" : ""}> ${t}</label>`).join("")}</div>
      <div class="prazo-livre"><span>ou</span><input name="prazo_n" type="number" min="1" max="999" inputmode="numeric" aria-label="Quantidade">
      <select name="prazo_u" aria-label="Unidade"><option value="1">dias</option><option value="30">meses</option></select></div>
      <p class="prazo-data">Resolver até <b data-prazo-data></b></p><input type="hidden" name="prazo"></fieldset>`;
  }
  function ligarPrazo(f) {
    const box = f.querySelector(".prazo");
    if (!box) return;
    const calc = () => {
      const livre = Number(f.prazo_n.value);
      const dias = livre > 0 ? livre * Number(f.prazo_u.value) : Number(f.querySelector("[name=prazo_rapido]:checked")?.value || 3);
      const data = somaDias(box.dataset.base, dias);
      f.prazo.value = data;
      box.querySelector("[data-prazo-data]").textContent = `${fmtDia(data)} (${dias} dia${dias > 1 ? "s" : ""})`;
    };
    f.prazo_n.oninput = () => { if (f.prazo_n.value) f.querySelectorAll("[name=prazo_rapido]").forEach((r) => (r.checked = false)); calc(); };
    f.prazo_u.onchange = calc;
    f.querySelectorAll("[name=prazo_rapido]").forEach((r) => (r.onchange = () => { f.prazo_n.value = ""; calc(); }));
    calc();
  }

  /* ---------------------------------------------------------- tarefas */
  function situacaoCobranca(t) {
    if (t.situacao === "resolvido") return `<span class="cob ok">✅ Resolvido${t.ultima_resposta_em ? ` <span data-desde="${t.ultima_resposta_em}">${desde(t.ultima_resposta_em)}</span>` : ""}</span>`;
    if (!t.ultima_cobranca) return `<span class="cob nada">Ainda não foi cobrada</span>`;
    const semResp = !t.ultima_resposta_em || Date.parse(t.ultima_resposta_em) < Date.parse(t.ultima_cobranca);
    return semResp
      ? `<span class="cob espera">⏳ Cobrada ${t.cobrancas}x · <b>sem resposta</b> <span data-desde="${t.ultima_cobranca}">${desde(t.ultima_cobranca)}</span></span>`
      : `<span class="cob resp">💬 Respondeu <span data-desde="${t.ultima_resposta_em}">${desde(t.ultima_resposta_em)}</span>: “${esc((t.ultima_resposta || "").slice(0, 120))}”</span>`;
  }
  function prazoTxt(t) {
    if (!t.prazo) return "";
    if (t.situacao === "resolvido") return `Prazo era ${fmtDia(t.prazo)}`;
    const d = difDias(t.prazo, hoje());
    if (d < 0) return `<b class="atrasada">Atrasada há ${-d} dia${d < -1 ? "s" : ""}</b> (prazo ${fmtDia(t.prazo)})`;
    if (d === 0) return `<b class="atrasada">Vence hoje</b>`;
    return `Vence em ${d} dia${d > 1 ? "s" : ""} (${fmtDia(t.prazo)})`;
  }
  function cartaoTarefa(t) {
    const pode = X().temPoder("cobrancas") && t.telefone && t.situacao !== "resolvido";
    return `<div class="item tarefa ${t.situacao}" data-tarefa="${t.id}">
      <div class="meta">${tag("T" + t.numero)} ${tag(SIT[t.situacao], SIT_TAG[t.situacao])} <span>${prazoTxt(t)}</span></div>
      <h3><a href="#/tarefa/${t.id}">${esc(t.titulo)}</a></h3>
      <div class="meta">👤 ${esc(t.responsavel_nome || "sem responsável")}${t.telefone ? " · " + esc(fmtTel(t.telefone)) : ""}</div>
      <p>${situacaoCobranca(t)}</p>
      <div class="acoes">${pode ? `<a class="btn peq" data-cobrar="${t.id}" href="#">📲 Cobrar ${esc(primeiro(t.responsavel_nome))}</a>` : ""}
      <a class="btn peq claro" href="#/tarefa/${t.id}">Abrir</a></div></div>`;
  }
  /* Botão "Cobrar": manda pela API do WhatsApp; se ela não estiver ligada, abre o WhatsApp do celular já com a mensagem */
  async function ligarCobrar(el, tarefas, depois) {
    const auto = await statusWhats();
    el.querySelectorAll("[data-cobrar]").forEach((a) => {
      const t = tarefas.find((x) => x.id === a.dataset.cobrar);
      if (!t) return;
      if (!auto) { a.href = waLink(t.telefone, textoCobranca(t)); a.target = "_blank"; a.rel = "noopener"; }
      a.onclick = async (ev) => {
        if (auto) {
          ev.preventDefault();
          a.setAttribute("aria-busy", "true"); a.textContent = "Enviando…";
          const r = await chamarEnviar({ acao: "cobrar", tarefa_id: t.id });
          if (r.ok) aviso(`<b>Cobrança enviada para ${esc(primeiro(t.responsavel_nome))} pelo WhatsApp.</b> Quando responder, a resposta aparece aqui na tarefa.`);
          else aviso(`<b>Não deu para enviar.</b> ${esc(r.erro || "")}`, "vermelho");
          return depois && depois();
        }
        // pelo WhatsApp do celular: registra a cobrança na linha do tempo
        const agora = new Date().toISOString();
        await X().sb.from("tarefas").update({ cobrancas: (t.cobrancas || 0) + 1, ultima_cobranca: agora, atualizado_em: agora }).eq("id", t.id);
        await X().sb.from("tarefa_eventos").insert({ tarefa_id: t.id, tipo: "cobranca", texto: textoCobranca(t), canal: "link" });
        setTimeout(() => depois && depois(), 800);
      };
    });
  }

  async function pgTarefas(params) {
    const { sb, souMembro, temPoder, semSupabase } = X();
    const f = params.get("f") || "abertas";
    app.innerHTML = `${trilha([["Início", "#/"], ["Time Mourinha", "#/time"], ["Tarefas e cobranças"]])}
      ${cabeca("Tarefas e cobranças", "Tudo o que foi combinado, com quem e até quando. Cobre até resolver.")}<div id="tf"></div>`;
    const el = $("#tf");
    if (!sb) { el.innerHTML = semSupabase; return; }
    if (!souMembro()) { el.innerHTML = `<div class="aviso">Entre com seu cadastro aprovado para ver as tarefas do time. <a href="#/entrar">Entrar</a></div>`; return; }
    const desenhar = async () => {
      const { data: ts } = await sb.from("tarefas").select("*").order("prazo", { ascending: true, nullsFirst: false }).order("numero", { ascending: false }).limit(1000);
      const todas = ts || [];
      const h = hoje();
      const aberta = (t) => t.situacao !== "resolvido";
      const semResp = (t) => aberta(t) && t.ultima_cobranca && (!t.ultima_resposta_em || t.ultima_resposta_em < t.ultima_cobranca);
      const grupos = {
        abertas: { t: "Não resolvidas", ic: "🔴", l: todas.filter(aberta), e: "Em aberto, em parte ou não resolvidas." },
        atrasadas: { t: "Atrasadas", ic: "⏰", l: todas.filter((t) => aberta(t) && t.prazo && t.prazo < h), e: "Prazo vencido e ainda sem solução." },
        sem_resposta: { t: "Sem resposta", ic: "⏳", l: todas.filter(semResp), e: "Já foram cobradas e a pessoa não respondeu." },
        nunca: { t: "Nunca cobradas", ic: "📭", l: todas.filter((t) => aberta(t) && !t.ultima_cobranca), e: "Ainda ninguém cobrou." },
        resolvidas: { t: "Resolvidas", ic: "✅", l: todas.filter((t) => t.situacao === "resolvido"), e: "Concluídas, com a explicação de quem resolveu." },
        todas: { t: "Todas", ic: "📋", l: todas, e: "Tudo, desde o começo." },
      };
      const g = grupos[f] || grupos.abertas;
      el.innerHTML = `<div class="botoes">${Object.entries(grupos).map(([k, v]) => botao({ href: `#/tarefas?f=${k}`, ic: v.ic, t: v.t, n: String(v.l.length), e: v.e, destaque: k === f })).join("")}</div>
        ${temPoder("cobrancas") ? `<details class="novo" ${todas.length ? "" : "open"}><summary class="btn">＋ Nova tarefa</summary><div id="nova"></div></details>` : ""}
        <h2 class="secao">${g.ic} ${esc(g.t)} <small>${g.l.length}</small></h2>
        <div id="lista">${g.l.map(cartaoTarefa).join("") || `<p class="vazio">Nada aqui. ${f === "abertas" ? "Tudo resolvido!" : ""}</p>`}</div>`;
      if (temPoder("cobrancas")) await formTarefa($("#nova"), {}, desenhar);
      await ligarCobrar(el, todas, desenhar);
      tic();
    };
    await desenhar();
    aoMudar(["tarefas", "tarefa_eventos"], desenhar);
  }

  async function formTarefa(box, { reuniao } = {}, depois) {
    const lista = await pessoas();
    box.innerHTML = `<form class="form" id="ftarefa">
      <label>O que precisa ser resolvido<input name="titulo" required placeholder="Ex.: Resolver os 3 eletrocardiogramas"></label>
      <label>Detalhes (vai na mensagem do WhatsApp)<textarea name="detalhes" placeholder="Ex.: combinado na reunião no Hospital do Coração; aparelhos parados desde outubro"></textarea></label>
      ${seletorPessoa(lista)}
      ${campoPrazo()}
      <label class="check"><input type="checkbox" name="cobrar_ja" checked> Já mandar a primeira mensagem para o responsável</label>
      <button class="btn">Criar tarefa</button></form>`;
    const f = box.querySelector("form");
    ligarSeletor(f); ligarPrazo(f);
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const b = f.querySelector("button"); b.disabled = true;
      try {
        const p = await resolverPessoa(f, lista);
        const { data: t, error } = await X().sb.from("tarefas").insert({
          titulo: f.titulo.value.trim(), detalhes: f.detalhes.value.trim() || null, prazo: f.prazo.value,
          reuniao_id: reuniao || null, contato_id: p?.origem === "contato" || !p?.origem ? p?.id : null,
          responsavel_nome: p?.nome || null, telefone: p?.telefone ? telBR(p.telefone) : null,
        }).select().single();
        if (error) throw error;
        await X().sb.from("tarefa_eventos").insert({ tarefa_id: t.id, tipo: "nota", texto: `Tarefa criada. Prazo: ${fmtDia(t.prazo)}.` });
        if (f.cobrar_ja.checked && t.telefone) {
          if (await statusWhats()) await chamarEnviar({ acao: "cobrar", tarefa_id: t.id });
          else {
            const agora = new Date().toISOString();
            await X().sb.from("tarefas").update({ cobrancas: 1, ultima_cobranca: agora }).eq("id", t.id);
            await X().sb.from("tarefa_eventos").insert({ tarefa_id: t.id, tipo: "cobranca", texto: textoCobranca(t), canal: "link" });
            location.href = waLink(t.telefone, textoCobranca(t));
          }
        }
        X().sinal(`Criou a tarefa T${t.numero}: ${t.titulo} (responsável: ${t.responsavel_nome || "—"})`, "outro");
        depois ? depois() : (location.hash = `#/tarefa/${t.id}`);
      } catch (e) { b.disabled = false; X().alertaErro(e); }
    };
  }

  async function pgTarefa(id) {
    const { sb, souMembro, temPoder } = X();
    if (!souMembro()) { app.innerHTML = `<div class="aviso">Entre com seu cadastro aprovado. <a href="#/entrar">Entrar</a></div>`; return; }
    const desenhar = async () => {
      const [{ data: t }, { data: ev }] = await Promise.all([
        sb.from("tarefas").select("*").eq("id", id).maybeSingle(),
        sb.from("tarefa_eventos").select("*").eq("tarefa_id", id).order("criado_em", { ascending: false }),
      ]);
      if (!t) { app.innerHTML = `<p class="vazio">Tarefa não encontrada.</p>`; return; }
      let reuniao = null;
      if (t.reuniao_id) reuniao = (await sb.from("agenda_chefe").select("id,titulo,data").eq("id", t.reuniao_id).maybeSingle()).data;
      const pode = temPoder("cobrancas");
      const ICONE = { cobranca: "📲", resposta: "💬", nota: "📝", situacao: "🔁", lembrete: "⏰" };
      const TITULO = { cobranca: "Cobrança enviada", resposta: `Resposta de ${primeiro(t.responsavel_nome) || "responsável"}`, nota: "Anotação", situacao: "Situação alterada", lembrete: "Lembrete enviado" };
      const CANAL = { whatsapp: "pelo WhatsApp automático", link: "pelo WhatsApp do celular", site: "no site" };
      app.innerHTML = `${trilha([["Início", "#/"], ["Tarefas e cobranças", "#/tarefas"], ["T" + t.numero]])}
        <div class="cabeca"><h1>T${t.numero} · ${esc(t.titulo)}</h1><p>${tag(SIT[t.situacao], SIT_TAG[t.situacao])} ${prazoTxt(t)}</p></div>
        <div class="item">
          <p>👤 <b>${esc(t.responsavel_nome || "Sem responsável")}</b>${t.telefone ? ` · ${esc(fmtTel(t.telefone))}` : ""}</p>
          ${t.detalhes ? `<p>${esc(t.detalhes)}</p>` : ""}
          ${reuniao ? `<p class="meta">Combinado em: <a href="#/agenda/${reuniao.id}">${esc(reuniao.titulo)} (${fmtDia(reuniao.data)})</a></p>` : ""}
          <p>${situacaoCobranca(t)}</p>
          <div class="acoes">${pode && t.telefone && t.situacao !== "resolvido" ? `<a class="btn" data-cobrar="${t.id}" href="#">📲 Cobrar ${esc(primeiro(t.responsavel_nome))}</a>` : ""}</div>
        </div>
        ${pode ? `<details class="novo"><summary class="btn claro">Registrar resposta ou mudar a situação</summary>
          <form class="form" id="fresp">
            <div class="opcoes" role="radiogroup" aria-label="Situação">${Object.entries(SIT).map(([k, v]) => `<label><input type="radio" name="sit" value="${k}" ${k === t.situacao ? "checked" : ""}> ${v}</label>`).join("")}</div>
            <label>O que foi feito / o que falta<textarea name="texto" placeholder="Ex.: dois aparelhos consertados, o terceiro aguarda peça"></textarea></label>
            <label class="check"><input type="checkbox" name="dela"> Foi ${esc(primeiro(t.responsavel_nome) || "o responsável")} quem respondeu (por telefone, pessoalmente…)</label>
            <button class="btn">Salvar</button></form></details>
          <details class="novo"><summary class="btn claro">Mudar o prazo</summary><form class="form" id="fprazo">${campoPrazo()}<button class="btn">Salvar novo prazo</button></form></details>` : ""}
        <h2 class="secao">Linha do tempo</h2>
        <ol class="tempo">${(ev || []).map((e) => `<li class="${e.tipo}"><span class="ic" aria-hidden="true">${ICONE[e.tipo] || "•"}</span><div>
          <b>${TITULO[e.tipo] || e.tipo}</b>${e.situacao ? " " + tag(SIT[e.situacao] || e.situacao, SIT_TAG[e.situacao]) : ""}
          <span class="meta">${fmtQuando(e.criado_em)}${e.canal && e.tipo !== "nota" ? " · " + CANAL[e.canal] : ""}</span>
          ${e.texto ? `<p>${esc(e.texto)}</p>` : ""}</div></li>`).join("") || `<li>Nada ainda.</li>`}</ol>`;
      await ligarCobrar(app, [t], desenhar);
      tic();
      const fr = $("#fresp");
      if (fr) fr.onsubmit = async (e) => {
        e.preventDefault();
        const sit = fr.sit.value, texto = fr.texto.value.trim(), agora = new Date().toISOString();
        const mud = { situacao: sit, atualizado_em: agora };
        if (fr.dela.checked) Object.assign(mud, { ultima_resposta: texto || SIT[sit], ultima_resposta_em: agora });
        const { error } = await sb.from("tarefas").update(mud).eq("id", t.id);
        if (error) return X().alertaErro(error);
        await sb.from("tarefa_eventos").insert({ tarefa_id: t.id, tipo: fr.dela.checked ? "resposta" : "situacao", texto: texto || null, situacao: sit });
        desenhar();
      };
      const fp = $("#fprazo");
      if (fp) {
        ligarPrazo(fp);
        fp.onsubmit = async (e) => {
          e.preventDefault();
          await sb.from("tarefas").update({ prazo: fp.prazo.value, atualizado_em: new Date().toISOString() }).eq("id", t.id);
          await sb.from("tarefa_eventos").insert({ tarefa_id: t.id, tipo: "nota", texto: `Prazo mudado para ${fmtDia(fp.prazo.value)}.` });
          desenhar();
        };
      }
    };
    await desenhar();
    aoMudar(["tarefas", "tarefa_eventos"], desenhar);
  }

  /* ---------------------------------------------------------- agenda do Mourinha */
  async function pgAgenda() {
    const { sb, souMembro, temPoder, semSupabase } = X();
    app.innerHTML = `${trilha([["Início", "#/"], ["Time Mourinha", "#/time"], ["Agenda do Mourinha"]])}
      ${cabeca("Agenda do Mourinha", "Reuniões e compromissos do chefe. Toque em um para ver a pauta e as tarefas combinadas.")}<div id="ag"></div>`;
    const el = $("#ag");
    if (!sb) { el.innerHTML = semSupabase; return; }
    if (!souMembro()) { el.innerHTML = `<div class="aviso">A agenda do Mourinha é só para o time. <a href="#/entrar">Entrar</a></div>`; return; }
    const desenhar = async () => {
      const { data } = await sb.from("agenda_chefe").select("*").gte("data", somaDias(hoje(), -60)).order("data").order("hora", { nullsFirst: true });
      const h = hoje();
      const futuros = (data || []).filter((a) => a.data >= h), passados = (data || []).filter((a) => a.data < h).reverse();
      const porDia = (lista) => {
        const dias = {};
        lista.forEach((a) => (dias[a.data] ||= []).push(a));
        return Object.entries(dias).map(([d, itens]) => `<h3 class="dia ${d === h ? "hoje" : ""}">${d === h ? "Hoje · " : d === somaDias(h, 1) ? "Amanhã · " : ""}${fmtDia(d)}</h3>
          ${itens.map((a) => `<a class="item compromisso ${a.situacao}" href="#/agenda/${a.id}"><span class="hora">${fmtHora(a.hora) || "—"}</span>
            <span><b>${esc(a.titulo)}</b>${a.local ? `<span class="meta">📍 ${esc(a.local)}</span>` : ""}${a.situacao !== "marcado" ? " " + tag(a.situacao === "realizado" ? "Realizado" : "Cancelado", a.situacao === "realizado" ? "ok" : "erro") : ""}</span></a>`).join("")}`).join("");
      };
      el.innerHTML = `${temPoder("agenda") ? `<details class="novo" ${futuros.length ? "" : "open"}><summary class="btn">＋ Novo compromisso</summary>
        <form class="form" id="fag">
          <div class="grade2"><label>Dia<input type="date" name="data" required value="${h}"></label><label>Hora<input type="time" name="hora"></label></div>
          <label>O quê<input name="titulo" required placeholder="Ex.: Reunião no Hospital do Coração"></label>
          <label>Onde<input name="local" placeholder="Ex.: Hospital do Coração, Farol"></label>
          <label>Quem vai participar<input name="participantes" placeholder="Ex.: Mourinha, Bené, Sônia (diretora)"></label>
          <label>Pauta<textarea name="pauta" placeholder="Um assunto por linha. Ex.: 3 eletrocardiogramas parados"></textarea></label>
          <button class="btn">Pôr na agenda</button></form></details>` : ""}
        ${porDia(futuros) || `<p class="vazio">Nenhum compromisso marcado daqui para frente.</p>`}
        ${passados.length ? `<details class="passados"><summary>Compromissos anteriores (${passados.length})</summary>${porDia(passados)}</details>` : ""}`;
      const f = $("#fag");
      if (f) f.onsubmit = async (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(f));
        const { data: novo, error } = await sb.from("agenda_chefe").insert({ ...d, hora: d.hora || null }).select().single();
        if (error) return X().alertaErro(error);
        X().sinal(`Pôs na agenda do Mourinha: ${fmtDia(novo.data)} ${fmtHora(novo.hora)} ${novo.titulo}`, "reuniao");
        location.hash = `#/agenda/${novo.id}`;
      };
    };
    await desenhar();
    aoMudar(["agenda_chefe"], desenhar);
  }

  async function pgCompromisso(id) {
    const { sb, souMembro, temPoder } = X();
    if (!souMembro()) { app.innerHTML = `<div class="aviso">A agenda do Mourinha é só para o time. <a href="#/entrar">Entrar</a></div>`; return; }
    const desenhar = async () => {
      const [{ data: a }, { data: ts }] = await Promise.all([
        sb.from("agenda_chefe").select("*").eq("id", id).maybeSingle(),
        sb.from("tarefas").select("*").eq("reuniao_id", id).order("numero"),
      ]);
      if (!a) { app.innerHTML = `<p class="vazio">Compromisso não encontrado.</p>`; return; }
      const ed = temPoder("agenda");
      const lembrar = `Lembrar: ${fmtDia(a.data).split(",")[0] === fmtDia(hoje()).split(",")[0] && a.data === hoje() ? "hoje" : "dia " + a.data.slice(8, 10) + "/" + a.data.slice(5, 7)}${a.hora ? " às " + fmtHora(a.hora) : ""} ${a.titulo}${a.local ? " (" + a.local + ")" : ""}`;
      app.innerHTML = `${trilha([["Início", "#/"], ["Agenda do Mourinha", "#/agenda"], [a.titulo]])}
        <div class="cabeca"><h1>${esc(a.titulo)}</h1><p>📅 ${fmtDia(a.data)}${a.hora ? " · " + fmtHora(a.hora) : ""}${a.local ? " · 📍 " + esc(a.local) : ""}</p></div>
        <div class="item">${a.participantes ? `<p>👥 ${esc(a.participantes)}</p>` : ""}
          ${a.pauta ? `<h3>Pauta</h3><ul class="pauta">${a.pauta.split("\n").filter((x) => x.trim()).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${a.decidido ? `<h3>O que ficou decidido</h3><p>${esc(a.decidido)}</p>` : ""}
          <div class="acoes">${temPoder("cobrancas") ? `<a class="btn peq claro" href="#/assistente?texto=${encodeURIComponent(lembrar)}">⏰ Lembrar alguém pelo WhatsApp</a>` : ""}</div></div>
        ${ed ? `<details class="novo"><summary class="btn claro">Editar / registrar o que foi decidido</summary><form class="form" id="fed">
          <div class="grade2"><label>Dia<input type="date" name="data" value="${a.data}"></label><label>Hora<input type="time" name="hora" value="${(a.hora || "").slice(0, 5)}"></label></div>
          <label>O quê<input name="titulo" value="${esc(a.titulo)}"></label><label>Onde<input name="local" value="${esc(a.local || "")}"></label>
          <label>Participantes<input name="participantes" value="${esc(a.participantes || "")}"></label>
          <label>Pauta<textarea name="pauta">${esc(a.pauta || "")}</textarea></label>
          <label>O que ficou decidido<textarea name="decidido">${esc(a.decidido || "")}</textarea></label>
          <div class="opcoes">${[["marcado", "Marcado"], ["realizado", "Realizado"], ["cancelado", "Cancelado"]].map(([k, v]) => `<label><input type="radio" name="situacao" value="${k}" ${a.situacao === k ? "checked" : ""}> ${v}</label>`).join("")}</div>
          <div class="acoes"><button class="btn">Salvar</button><button type="button" class="btn claro" id="apagar">Apagar compromisso</button></div></form></details>` : ""}
        <h2 class="secao">Tarefas combinadas nesta reunião <small>${(ts || []).length}</small></h2>
        <div id="lista">${(ts || []).map(cartaoTarefa).join("") || `<p class="vazio">Nenhuma tarefa ainda.</p>`}</div>
        ${temPoder("cobrancas") ? `<details class="novo"><summary class="btn">＋ Tarefa desta reunião (quem resolve e até quando)</summary><div id="nova"></div></details>` : ""}`;
      const f = $("#fed");
      if (f) {
        f.onsubmit = async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(f));
          const { error } = await sb.from("agenda_chefe").update({ ...d, hora: d.hora || null }).eq("id", id);
          if (error) return X().alertaErro(error);
          desenhar();
        };
        $("#apagar").onclick = async () => { if (confirm("Apagar este compromisso da agenda?")) { await sb.from("agenda_chefe").delete().eq("id", id); location.hash = "#/agenda"; } };
      }
      if ($("#nova")) await formTarefa($("#nova"), { reuniao: id }, desenhar);
      await ligarCobrar(app, ts || [], desenhar);
      tic();
    };
    await desenhar();
    aoMudar(["agenda_chefe", "tarefas"], desenhar);
  }

  /* ---------------------------------------------------------- contatos */
  async function pgContatos() {
    const { sb, temPoder } = X();
    app.innerHTML = `${trilha([["Início", "#/"], ["Time Mourinha", "#/time"], ["Contatos"]])}${cabeca("Contatos", "Quem recebe cobranças e lembretes pelo WhatsApp. Os números ficam guardados só para o dono e quem tem o poder de cobranças.")}<div id="ct"></div>`;
    if (!temPoder("cobrancas")) { $("#ct").innerHTML = `<div class="aviso">Só o dono e quem tem o poder de cobranças abrem os contatos.</div>`; return; }
    const desenhar = async () => {
      const { data } = await sb.from("contatos").select("*").order("nome");
      $("#ct").innerHTML = `<details class="novo" ${data?.length ? "" : "open"}><summary class="btn">＋ Novo contato</summary><form class="form" id="fct">
        <label>Nome<input name="nome" required placeholder="Ex.: Sônia Lima"></label>
        <label>WhatsApp com DDD<input name="telefone" required inputmode="tel" placeholder="82 99999-9999"></label>
        <label>Cargo<input name="cargo" placeholder="Ex.: Diretora"></label><label>Onde trabalha<input name="orgao" placeholder="Ex.: Hospital do Coração"></label>
        <button class="btn">Salvar contato</button></form></details>
        ${(data || []).map((c) => `<div class="item" data-id="${c.id}"><h3>${esc(c.nome)}</h3><div class="meta">${esc(fmtTel(c.telefone))}${c.cargo ? " · " + esc(c.cargo) : ""}${c.orgao ? " · " + esc(c.orgao) : ""}</div>
          <div class="acoes"><a class="btn peq claro" href="#/assistente?texto=${encodeURIComponent(c.nome.split(" ")[0] + ", ")}">⏰ Lembrete</a>
          <button class="btn peq claro" data-apagar>Apagar</button></div></div>`).join("") || `<p class="vazio">Nenhum contato ainda.</p>`}`;
      const f = $("#fct");
      f.onsubmit = async (e) => {
        e.preventDefault();
        if (digitos(f.telefone.value).length < 10) return X().alertaErro({ message: "Coloque o WhatsApp com DDD, ex.: 82 99999-9999." });
        const { error } = await sb.from("contatos").insert({ nome: f.nome.value.trim(), telefone: telBR(f.telefone.value), cargo: f.cargo.value.trim() || null, orgao: f.orgao.value.trim() || null });
        if (error) return X().alertaErro(error);
        desenhar();
      };
      document.querySelectorAll("[data-apagar]").forEach((b) => (b.onclick = async () => {
        if (!confirm("Apagar este contato? As tarefas dele continuam.")) return;
        await sb.from("contatos").delete().eq("id", b.closest("[data-id]").dataset.id);
        desenhar();
      }));
    };
    await desenhar();
  }

  /* ---------------------------------------------------------- assistente */
  const DIAS_SEMANA = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
  /* Entende frases como "Fernando, amanhã lembrar da agenda do Mourinha" ou "cobrar Sônia dos 3 eletrocardiogramas em 5 dias" */
  function entender(texto, lista) {
    let resto = ` ${texto.trim()} `;
    const n = () => semAcento(resto);
    const tira = (re) => { resto = resto.replace(re, " "); };
    const r = { tipo: null, pessoa: null, nome: "", telefone: "", data: null, hora: null, prazoDias: null, mensagem: "", incluirAgenda: false };
    // telefone
    const tel = resto.match(/(?:\+?55[\s-]*)?\(?\b(\d{2})\)?[\s-]*(9?\d{4})[\s.-]?(\d{4})\b/);
    if (tel) { r.telefone = telBR(tel[1] + tel[2] + tel[3]); tira(tel[0]); }
    // tipo
    const s0 = semAcento(texto);
    if (/\bcobr(ar|e|a|ança|anca)\b/.test(s0)) r.tipo = "tarefa";
    else if (/\b(lembr|avis|mand|envi|manda)/.test(s0)) r.tipo = "lembrete";
    else if (/^\s*(agend|marc|compromisso|reuniao|anota na agenda|por na agenda)/.test(s0)) r.tipo = "agenda";
    r.incluirAgenda = /agenda/.test(s0);
    // pessoa conhecida (contato ou integrante)
    const ordenada = [...lista].sort((a, b) => b.nome.length - a.nome.length);
    for (const p of ordenada) {
      const cheio = semAcento(p.nome), pri = semAcento(primeiro(p.nome));
      const re = (w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^a-z]|$)`);
      if (re(cheio).test(n()) || (pri.length >= 3 && re(pri).test(n()))) {
        if (pri === "mourinha" && /agenda do mourinha|reuniao com o mourinha|com o mourinha/.test(n()) && !r.tipo) continue;
        if (pri === "mourinha" && /(da|do) (agenda )?(do )?mourinha/.test(n())) continue;
        r.pessoa = p; r.nome = p.nome; r.telefone ||= telBR(p.telefone);
        const pos = n().search(re(cheio).test(n()) ? re(cheio) : re(pri));
        const tam = re(cheio).test(n()) ? cheio.length : pri.length;
        resto = resto.slice(0, pos + 1) + resto.slice(pos + 1 + tam);
        break;
      }
    }
    if (!r.pessoa) {
      const m = resto.trim().match(/^(?:para |pra |avisar (?:a |o )?|lembrar (?:a |o )?|cobrar (?:a |o )?)?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?: [A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+)?)\s*[,:]/);
      const m2 = resto.match(/\b(?:para|pra|cobrar|avisar)\s+(?:a |o )?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+)/);
      const nm = (m && m[1]) || (m2 && m2[1]);
      if (nm && !/^(Amanha|Amanhã|Hoje|Lembrar|Cobrar|Mourinha)$/.test(nm)) { r.nome = nm; tira(new RegExp(nm + "\\s*[,:]?")); }
    }
    // dia
    const h = hoje();
    const s = n();
    let m;
    if (/depois de amanha/.test(s)) { r.data = somaDias(h, 2); tira(/depois de amanh[ãa]/i); }
    else if (/\bamanha\b/.test(s)) { r.data = somaDias(h, 1); tira(/amanh[ãa]/i); }
    else if (/\bhoje\b/.test(s)) { r.data = h; tira(/hoje/i); }
    else if ((m = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
      const ano = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : h.slice(0, 4);
      r.data = `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      if (!m[3] && r.data < h) r.data = `${Number(ano) + 1}${r.data.slice(4)}`;
      tira(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/);
    } else if ((m = s.match(/\b(?:no |na |nesta |nessa |proxima |próxima )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\b/))) {
      const alvo = DIAS_SEMANA[m[1]], atual = new Date(h + "T12:00:00Z").getUTCDay();
      r.data = somaDias(h, ((alvo - atual + 7) % 7) || 7);
      tira(new RegExp(`(?:\\b(?:no|na|nesta|nessa|pr[óo]xima)\\s+)?${m[1].replace("terca", "ter[çc]a").replace("sabado", "s[áa]bado")}(?:-feira)?`, "i"));
    } else if ((m = s.match(/\bdia (\d{1,2})\b/))) {
      let d = `${h.slice(0, 8)}${m[1].padStart(2, "0")}`;
      if (d < h) { const x = new Date(h + "T12:00:00Z"); x.setUTCMonth(x.getUTCMonth() + 1); d = `${x.toISOString().slice(0, 8)}${m[1].padStart(2, "0")}`; }
      r.data = d; tira(/\bdia \d{1,2}\b/i);
    }
    // hora
    if ((m = n().match(/(?:\b[àa]s\s*)?\b(\d{1,2})\s*(?:h|:|horas?\b)\s*(\d{2})?(?:min)?/))) {
      const hh = Number(m[1]), mm = Number(m[2] || 0);
      if (hh < 24 && mm < 60) { r.hora = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; resto = resto.replace(new RegExp(`(?:(?:^|\\s)[àaÀA]s\\s*)?\\b${m[1]}\\s*(?:h|:|horas?)\\s*${m[2] || ""}(?:min)?`, "i"), " "); }
    } else if ((m = n().match(/\b[àa]s (\d{1,2})\b/))) { r.hora = `${m[1].padStart(2, "0")}:00`; tira(new RegExp(`(?:^|\\s)[àa]s ${m[1]}\\b`, "i")); }
    // prazo (para tarefas): "em 5 dias", "prazo de 1 mês", "até sexta"
    if ((m = n().match(/\b(?:em|prazo(?: de)?|daqui a|ate|até)?\s*(\d{1,3})\s*(dias?|semanas?|mes(?:es)?|meses)\b/))) {
      const q = Number(m[1]); r.prazoDias = /sem/.test(m[2]) ? q * 7 : /mes/.test(m[2]) ? q * 30 : q;
      resto = resto.replace(/\b(?:em|prazo(?: de)?|daqui a|at[ée])?\s*\d{1,3}\s*(?:dias?|semanas?|m[eê]s(?:es)?)\b/i, " ");
    } else if (r.tipo === "tarefa" && r.data) { r.prazoDias = Math.max(1, difDias(r.data, h)); }
    if (/\bum mes\b|\b1 mes\b/.test(n()) && !r.prazoDias) r.prazoDias = 30;
    // mensagem
    let msg = resto.replace(/\s+/g, " ").replace(/^[\s,:;.-]+|[\s,:;-]+$/g, "");
    msg = msg.replace(/^(?:por favor\s+)?(?:lembrar|lembre|lembra|avisar|avise|mandar mensagem|mandar|enviar|cobrar|cobre|cobra|agendar|marcar)\s+(?:(?:a|o|à|ao)\s+)?/i, "")
      .replace(/^(?:de|da|do|das|dos|sobre|que)\s+/i, "").replace(/^(?:para|pra)\s+/i, "").replace(/^[\s,:;.-]+/, "");
    msg = msg.replace(/\s+(?:no|na|em|às|as|até|ate|para|pra)\s*$/i, "").replace(/^(?:às|as)\s+/i, "");
    r.mensagem = msg ? msg[0].toUpperCase() + msg.slice(1) : "";
    if (!r.tipo) r.tipo = r.nome || r.telefone ? "lembrete" : "agenda";
    if (r.tipo === "lembrete") { r.data ||= h; r.hora ||= r.data === h ? null : "08:00"; }
    if (r.tipo === "tarefa") r.prazoDias ||= 3;
    return r;
  }

  async function pgAssistente(params) {
    const { sb, temPoder } = X();
    app.innerHTML = `${trilha([["Início", "#/"], ["Time Mourinha", "#/time"], ["Assistente"]])}
      ${cabeca("🤖 Assistente do time", "Escreva ou dite do seu jeito. Ele entende quem, quando e o quê, e você confere antes de enviar.")}<div id="as"></div>`;
    if (!temPoder("cobrancas")) { $("#as").innerHTML = `<div class="aviso">Só o dono e quem tem o poder de cobranças usam o assistente.</div>`; return; }
    const [lista, auto] = await Promise.all([pessoas(), statusWhats()]);
    const exemplos = ["Fernando, amanhã lembrar da agenda do Mourinha", "Cobrar Sônia dos 3 eletrocardiogramas do Hospital do Coração em 5 dias",
      "82 99999-9999 Carlos, sexta às 9h reunião no Sebrae", "Agendar quinta 14h reunião com a Secretaria de Saúde"];
    $("#as").innerHTML = `${auto ? "" : `<div class="aviso azul">O envio sai pelo <b>WhatsApp do seu celular</b>, já com a mensagem pronta: é só tocar em Enviar. As respostas chegam no seu WhatsApp e você registra na tarefa.</div>`}
      <form class="form" id="fas"><label>O que você quer?<textarea name="texto" rows="3" placeholder="Ex.: Fernando, amanhã lembrar da agenda do Mourinha">${esc(params.get("texto") || "")}</textarea></label>
      <div class="exemplos">${exemplos.map((e) => `<button type="button" class="chip">${esc(e)}</button>`).join("")}</div>
      <p class="meta">Dica: no iPhone, toque no microfone 🎤 do teclado e fale.</p>
      <button class="btn">Entender</button></form><div id="previa"></div>
      <h2 class="secao">Lembretes programados</h2><div id="lbs"></div>`;
    const f = $("#fas");
    document.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { f.texto.value = c.textContent; f.requestSubmit(); }));
    f.onsubmit = (e) => { e.preventDefault(); if (f.texto.value.trim()) previa(entender(f.texto.value, lista), lista, auto); };
    if (params.get("texto") && /\w{3}/.test(params.get("texto").replace(/^Lembrar:/, ""))) f.texto.focus();
    await listaLembretes(auto);
  }

  function previa(r, lista, auto) {
    const box = $("#previa");
    const optsPessoa = `<option value="">— escolha —</option>${lista.map((p) => `<option value="${esc(p.id)}" ${r.pessoa?.id === p.id ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}<option value="novo" ${!r.pessoa && (r.nome || r.telefone) ? "selected" : ""}>＋ Pessoa nova…</option>`;
    box.innerHTML = `<div class="item previa"><h3>Entendi assim — confira e ajuste:</h3><form class="form" id="fpv">
      <div class="opcoes" role="radiogroup" aria-label="O que fazer">${[["lembrete", "⏰ Mandar lembrete"], ["tarefa", "✅ Criar tarefa e cobrar"], ["agenda", "📅 Pôr na agenda do Mourinha"]].map(([k, v]) => `<label><input type="radio" name="tipo" value="${k}" ${r.tipo === k ? "checked" : ""}> ${v}</label>`).join("")}</div>
      <div data-para><label>Para quem<select name="pessoa">${optsPessoa}</select></label>
        <div class="grade2" data-novo ${!r.pessoa && (r.nome || r.telefone) ? "" : "hidden"}><label>Nome<input name="novo_nome" value="${esc(r.nome)}"></label>
        <label>WhatsApp com DDD<input name="novo_tel" inputmode="tel" value="${esc(r.telefone ? fmtTel(r.telefone) : "")}"></label></div></div>
      <div class="grade2" data-quando><label><span data-rot-dia>Quando enviar</span><input type="date" name="data" value="${r.data || hoje()}"></label>
        <label>Hora<input type="time" name="hora" value="${r.hora || ""}"></label></div>
      <div data-prazo>${campoPrazo()}</div>
      <label><span data-rot-msg>Mensagem</span><textarea name="mensagem" required>${esc(r.mensagem)}</textarea></label>
      <label class="check" data-ag><input type="checkbox" name="incluir" ${r.incluirAgenda ? "checked" : ""}> Juntar a agenda do Mourinha daquele dia na mensagem</label>
      <div class="acoes"><button class="btn" data-ok>Confirmar</button><button type="button" class="btn claro" data-cancela>Cancelar</button></div></form></div>`;
    const f = $("#fpv");
    const ajustar = () => {
      const t = f.tipo.value;
      f.querySelector("[data-para]").hidden = t === "agenda";
      f.querySelector("[data-prazo]").hidden = t !== "tarefa";
      f.querySelector("[data-quando]").hidden = t === "tarefa";
      f.querySelector("[data-ag]").hidden = t !== "lembrete";
      f.querySelector("[data-rot-dia]").textContent = t === "agenda" ? "Dia" : "Quando enviar";
      f.querySelector("[data-rot-msg]").textContent = t === "agenda" ? "Compromisso" : t === "tarefa" ? "O que precisa ser resolvido" : "Mensagem";
      f.querySelector("[data-ok]").textContent = t === "agenda" ? "Pôr na agenda" : t === "tarefa" ? "Criar tarefa e cobrar" : (f.data.value === hoje() && !f.hora.value) ? "Enviar agora" : "Programar lembrete";
    };
    f.querySelectorAll("[name=tipo]").forEach((x) => (x.onchange = ajustar));
    f.data.onchange = f.hora.onchange = ajustar;
    f.pessoa.onchange = () => (f.querySelector("[data-novo]").hidden = f.pessoa.value !== "novo");
    if (r.prazoDias) { const q = [1, 2, 3, 5, 7, 15, 30, 60].includes(r.prazoDias); f.querySelectorAll("[name=prazo_rapido]").forEach((x) => (x.checked = q && Number(x.value) === r.prazoDias)); if (!q) f.prazo_n.value = r.prazoDias; }
    ligarPrazo(f); ajustar();
    f.querySelector("[data-cancela]").onclick = () => (box.innerHTML = "");
    box.scrollIntoView({ behavior: "smooth", block: "start" });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const b = f.querySelector("[data-ok]"); b.disabled = true;
      try { await confirmar(f, lista, auto); }
      catch (err) { b.disabled = false; X().alertaErro(err); }
    };
  }

  async function confirmar(f, lista, auto) {
    const { sb } = X();
    const tipo = f.tipo.value, msg = f.mensagem.value.trim();
    if (tipo === "agenda") {
      const { data: a, error } = await sb.from("agenda_chefe").insert({ data: f.data.value, hora: f.hora.value || null, titulo: msg }).select().single();
      if (error) throw error;
      location.hash = `#/agenda/${a.id}`;
      return;
    }
    let p;
    if (f.pessoa.value === "novo" || !f.pessoa.value) {
      if (!f.novo_nome.value.trim() || digitos(f.novo_tel.value).length < 10) throw new Error("Diga para quem: nome e WhatsApp com DDD.");
      const { data, error } = await sb.from("contatos").insert({ nome: f.novo_nome.value.trim(), telefone: telBR(f.novo_tel.value) }).select().single();
      if (error) throw error;
      p = data;
    } else p = lista.find((x) => x.id === f.pessoa.value);
    if (tipo === "tarefa") {
      const { data: t, error } = await sb.from("tarefas").insert({ titulo: msg, prazo: f.prazo.value, contato_id: p.origem === "time" ? null : p.id, responsavel_nome: p.nome, telefone: telBR(p.telefone) }).select().single();
      if (error) throw error;
      await sb.from("tarefa_eventos").insert({ tarefa_id: t.id, tipo: "nota", texto: `Tarefa criada pelo assistente. Prazo: ${fmtDia(t.prazo)}.` });
      if (auto) { await chamarEnviar({ acao: "cobrar", tarefa_id: t.id }); location.hash = `#/tarefa/${t.id}`; }
      else {
        const agora = new Date().toISOString();
        await sb.from("tarefas").update({ cobrancas: 1, ultima_cobranca: agora }).eq("id", t.id);
        await sb.from("tarefa_eventos").insert({ tarefa_id: t.id, tipo: "cobranca", texto: textoCobranca(t), canal: "link" });
        location.hash = `#/tarefa/${t.id}`;
        location.href = waLink(t.telefone, textoCobranca(t));
      }
      return;
    }
    // lembrete
    const agoraJa = f.data.value === hoje() && !f.hora.value;
    const quando = agoraJa ? new Date() : new Date(`${f.data.value}T${f.hora.value || "08:00"}:00-03:00`);
    const texto = `Lembrete do Time Mourinha: ${msg.replace(/[.!]?$/, ".")}`;
    const { data: l, error } = await sb.from("lembretes").insert({ contato_id: p.origem === "time" ? null : p.id, nome: primeiro(p.nome), telefone: telBR(p.telefone),
      mensagem: texto, incluir_agenda: f.incluir.checked, enviar_em: quando.toISOString() }).select().single();
    if (error) throw error;
    $("#previa").innerHTML = "";
    if (quando.getTime() <= Date.now() + 120000) await enviarLembrete(l, auto);
    else aviso(`<b>Lembrete programado</b> para ${esc(primeiro(p.nome))}: ${fmtQuando(quando.toISOString())}. ${auto ? "Sai sozinho pelo WhatsApp." : "Na hora, ele aparece aqui com o botão para enviar pelo seu WhatsApp."}`);
    await listaLembretes(auto);
  }

  async function textoComAgenda(l) {
    if (!l.incluir_agenda) return l.mensagem;
    const dia = new Date(Date.parse(l.enviar_em) - 3 * 3600e3).toISOString().slice(0, 10);
    const { data } = await X().sb.from("agenda_chefe").select("hora,titulo,local").eq("data", dia).neq("situacao", "cancelado").order("hora");
    return data?.length ? `${l.mensagem} Agenda do Mourinha em ${fmtDia(dia)}: ${data.map((a) => `${fmtHora(a.hora)} ${a.titulo}${a.local ? " (" + a.local + ")" : ""}`.trim()).join("; ")}.` : l.mensagem;
  }
  async function enviarLembrete(l, auto) {
    if (auto) {
      const r = await chamarEnviar({ acao: "lembrete", lembrete_id: l.id });
      if (r.ok) aviso(`<b>Lembrete enviado para ${esc(l.nome)} pelo WhatsApp.</b>`);
      else aviso(`<b>Não deu para enviar.</b> ${esc(r.erro || "")}`, "vermelho");
      return;
    }
    const texto = `Olá, ${l.nome}! ${await textoComAgenda(l)}`;
    await X().sb.from("lembretes").update({ situacao: "enviado", enviado_em: new Date().toISOString(), erro: null }).eq("id", l.id);
    location.href = waLink(l.telefone, texto);
  }
  async function listaLembretes(auto) {
    const { sb } = X();
    const { data } = await sb.from("lembretes").select("*").or(`situacao.eq.agendado,enviado_em.gte.${new Date(Date.now() - 3 * 864e5).toISOString()}`).order("enviar_em").limit(100);
    const el = $("#lbs");
    if (!el) return;
    const agora = Date.now();
    el.innerHTML = (data || []).map((l) => {
      const vencido = l.situacao === "agendado" && Date.parse(l.enviar_em) <= agora;
      return `<div class="item ${vencido ? "media" : ""}" data-id="${l.id}"><div class="meta">${tag(l.situacao === "enviado" ? "Enviado" : l.situacao === "erro" ? "Erro" : l.situacao === "cancelado" ? "Cancelado" : vencido ? "Na hora de enviar" : "Programado", l.situacao === "enviado" ? "ok" : l.situacao === "erro" ? "erro" : "media")}
        <span>${l.situacao === "enviado" ? "enviado " + fmtQuando(l.enviado_em) : "para " + fmtQuando(l.enviar_em)}</span></div>
        <h3>Para ${esc(l.nome || "")} · ${esc(fmtTel(l.telefone))}</h3><p>${esc(l.mensagem)}${l.incluir_agenda ? " <i>(+ agenda do Mourinha do dia)</i>" : ""}</p>
        ${l.situacao === "agendado" ? `<div class="acoes"><button class="btn peq" data-enviar>📲 Enviar agora</button><button class="btn peq claro" data-cancelar>Cancelar</button></div>` : ""}</div>`;
    }).join("") || `<p class="vazio">Nenhum lembrete programado.</p>`;
    el.querySelectorAll("[data-enviar]").forEach((b) => (b.onclick = async () => enviarLembrete(data.find((x) => x.id === b.closest("[data-id]").dataset.id), auto)));
    el.querySelectorAll("[data-cancelar]").forEach((b) => (b.onclick = async () => { await sb.from("lembretes").update({ situacao: "cancelado" }).eq("id", b.closest("[data-id]").dataset.id); listaLembretes(auto); }));
  }

  /* ---------------------------------------------------------- rotas */
  async function rota(p, params) {
    if (p[0] === "agenda") { p[1] ? await pgCompromisso(p[1]) : await pgAgenda(); return true; }
    if (p[0] === "tarefas") { await pgTarefas(params); return true; }
    if (p[0] === "tarefa" && p[1]) { await pgTarefa(p[1]); return true; }
    if (p[0] === "contatos") { await pgContatos(); return true; }
    if (p[0] === "assistente") { await pgAssistente(params); return true; }
    return false;
  }
  window.Gestao = { rota, entender, _teste: { telBR, somaDias, difDias, hoje } };
})();
