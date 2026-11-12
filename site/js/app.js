/* Time Mourinha — painel público (dados das duas esferas). */
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const ESFERAS = {
  "governo-al": { nome: "Governo de Alagoas", curto: "Governo AL", classe: "gov", escolas: "estaduais" },
  "prefeitura-maceio": { nome: "Prefeitura de Maceió", curto: "Prefeitura", classe: "pref", escolas: "municipais" },
};

/* ---------------------------------------------------------------- utilidades */
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtN = (n) => (n == null || isNaN(n) ? "—" : Number(n).toLocaleString("pt-BR"));
function fmtR(v, curto = true) {
  if (v == null || isNaN(v)) return "—";
  const a = Math.abs(v);
  if (curto && a >= 1e9) return "R$ " + (v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " bi";
  if (curto && a >= 1e6) return "R$ " + (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
  if (curto && a >= 1e4) return "R$ " + Math.round(v / 1e3).toLocaleString("pt-BR") + " mil";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
const fmtD = (d) => (d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("pt-BR") : "—");
const pl = (n, um, varios) => `${fmtN(n)} ${n === 1 ? um : varios}`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const MESES = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const cache = {};
async function dados(caminho) {
  if (caminho in cache) return cache[caminho];
  try {
    const r = await fetch("dados/" + caminho, { cache: "no-cache" });
    cache[caminho] = r.ok ? await r.json() : null;
  } catch { cache[caminho] = null; }
  return cache[caminho];
}
function trilha(itens) {
  return `<p class="trilha">${itens.map(([t, h]) => (h ? `<a href="${h}">${esc(t)}</a>` : esc(t))).join(" › ")}</p>`;
}
function cabeca(titulo, sub) { return `<div class="cabeca"><h1>${esc(titulo)}</h1>${sub ? `<p>${sub}</p>` : ""}</div>`; }
function botao({ href, ic, t, n, e, selo, destaque, onclick }) {
  const attr = href ? `href="${href}"` : `href="javascript:void 0" onclick="${onclick}"`;
  return `<a class="bt${destaque ? " destaque" : ""}" ${attr}>${selo ? `<span class="selo">${esc(selo)}</span>` : ""}
    <span class="ic" aria-hidden="true">${ic}</span><span class="t">${esc(t)}</span><span class="n">${n ?? ""}</span><span class="e">${esc(e)}</span></a>`;
}
function fonte(meta, url) {
  const quando = meta?.atualizado_em ? new Date(meta.atualizado_em).toLocaleString("pt-BR") : "—";
  return `<p class="fonte">Fonte: ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(meta?.portal || url)}</a>` : esc(meta?.portal || "portal oficial")} · coletado em ${quando}</p>`;
}
function semDados(esf) {
  return `<div class="aviso azul"><b>Aguardando a primeira coleta.</b> Os dados de ${esc(ESFERAS[esf]?.nome || "")} chegam automaticamente
  todo dia à meia-noite direto dos portais oficiais. Enquanto isso, veja <a href="#/como-funciona">como o Time Mourinha funciona</a>.</div>`;
}
function barra(p) { return `<div class="barra"><i style="width:${Math.max(0, Math.min(100, p || 0))}%"></i></div>`; }
function tag(txt, cls) { return `<span class="tag ${esc(cls || "")}">${esc(txt)}</span>`; }

/* Tabela com busca, paginação e download CSV */
function tabela(el, linhas, cols, { busca = true, porPagina = 25, nome = "dados" } = {}) {
  let filtro = "", pag = 0;
  const desenhar = () => {
    const f = filtro.toLowerCase();
    const vis = f ? linhas.filter((l) => cols.some((c) => String(l[c.k] ?? "").toLowerCase().includes(f))) : linhas;
    const total = Math.max(1, Math.ceil(vis.length / porPagina));
    pag = Math.min(pag, total - 1);
    const fat = vis.slice(pag * porPagina, (pag + 1) * porPagina);
    el.querySelector(".corpo").innerHTML = fat.length ? `<div class="tabela-wrap"><table><thead><tr>${cols.map((c) => `<th class="${c.num ? "num" : ""}">${esc(c.t)}</th>`).join("")}</tr></thead>
      <tbody>${fat.map((l) => `<tr>${cols.map((c) => `<td class="${c.num ? "num" : ""}">${c.f ? c.f(l[c.k], l) : esc(l[c.k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="paginacao"><button class="btn claro peq" data-p="-1" ${pag ? "" : "disabled"}>Anterior</button>
      <span>Página ${pag + 1} de ${total} · ${fmtN(vis.length)} linhas</span>
      <button class="btn claro peq" data-p="1" ${pag < total - 1 ? "" : "disabled"}>Próxima</button></div>` : `<p class="vazio">Nada encontrado.</p>`;
    el.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { pag += +b.dataset.p; desenhar(); }));
  };
  el.innerHTML = `<div class="ferramentas">${busca ? `<input type="search" placeholder="Buscar nesta tabela…" aria-label="Buscar">` : ""}
    <button class="btn claro peq csv">Baixar planilha (CSV)</button></div><div class="corpo"></div>`;
  const inp = el.querySelector("input");
  if (inp) inp.oninput = () => { filtro = inp.value; pag = 0; desenhar(); };
  el.querySelector(".csv").onclick = () => {
    const sep = ";";
    const txt = [cols.map((c) => c.t).join(sep), ...linhas.map((l) => cols.map((c) => `"${String(l[c.k] ?? "").replace(/"/g, '""')}"`).join(sep))].join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob(["﻿" + txt], { type: "text/csv" })), download: nome + ".csv" });
    a.click();
  };
  desenhar();
}
const graficos = [];
function grafico(el, cfg) { graficos.push(new Chart(el, cfg)); }
function limparGraficos() { while (graficos.length) graficos.pop().destroy(); }
const CORES = { anil: "#0A2F6B", anil2: "#143F8C", brasa: "#FF6A13", cinza: "#9AA6BC" };

function abrirMidia(src, tipo, legenda) {
  const d = document.createElement("div");
  d.className = "lightbox";
  d.innerHTML = `<div>${tipo === "video" ? `<video src="${src}" controls autoplay playsinline></video>` : `<img src="${src}" alt="">`}${legenda ? `<p>${esc(legenda)}</p>` : ""}</div>`;
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  document.addEventListener("keydown", function f(e) { if (e.key === "Escape") { d.remove(); document.removeEventListener("keydown", f); } });
  document.body.append(d);
}
window.abrirMidia = abrirMidia;

/* ---------------------------------------------------------------- páginas */
async function pgInicio() {
  const esferas = (await dados("esferas.json")) || [];
  const por = Object.fromEntries(esferas.map((e) => [e.id, e]));
  const clube = (id) => {
    const e = por[id] || {}, info = ESFERAS[id];
    const t = e.totais || {};
    return `<a class="clube ${info.classe}" href="#/e/${id}">
      <div class="cab"><h2>${info.nome}<small>${e.n_orgaos ? `${e.n_orgaos} secretarias e órgãos monitorados` : "Aguardando a primeira coleta"}</small></h2><span class="ir">Abrir</span></div>
      <div class="placar">
        <div><b>${fmtR(t.pago)}</b><span>pagos no ano</span></div>
        <div class="${e.n_alertas_alta ? "quente" : ""}"><b>${fmtN(e.n_alertas)}</b><span>alertas</span></div>
        <div class="${e.n_obras_paradas ? "quente" : ""}"><b>${fmtN(e.n_obras_paradas)}</b><span>obras paradas</span></div>
        <div><b>${fmtN(e.n_missoes)}</b><span>missões</span></div>
      </div>
      <div class="rod">${e.ultima_coleta_falhou ? `<b style="color:var(--vermelho)">A coleta de hoje falhou.</b> Mostrando os dados de ${new Date(e.atualizado_em).toLocaleString("pt-BR")}.` : e.atualizado_em ? `Atualizado em ${new Date(e.atualizado_em).toLocaleString("pt-BR")}` : "A coleta roda sozinha todo dia à meia-noite"}</div></a>`;
  };
  app.innerHTML = `<section class="heroi"><div class="heroi-in"><img src="img/marca.svg" alt="Escudo do Time Mourinha">
      <div><h1>Time<span>Mourinha</span></h1><p>Cada secretaria, cada escola, cada posto de saúde e cada real gasto, acompanhados de perto. Escolha onde jogar.</p></div></div></section>
    <div class="clubes">${clube("governo-al")}${clube("prefeitura-maceio")}</div>
    <div id="escalacao"></div>
    <div class="botoes">
      ${botao({ href: "#/hoje", ic: "📸", t: "Atividade do dia", n: "", e: "Registre a visita de hoje com fotos e vídeos.", destaque: true })}
      ${botao({ href: "#/time", ic: "👥", t: "Time Mourinha", n: "7 integrantes", e: "Quem é quem e o que cada um está fazendo." })}
      ${botao({ href: "#/manual", ic: "🧭", t: "Manual do fiscal", n: `${Object.keys(GUIAS).length} situações`, e: "O que cobrar e o que fazer em cada tipo de problema." })}
      ${botao({ href: "#/como-funciona", ic: "📘", t: "Como funciona", n: "", e: "De onde vêm os dados e como os alertas são calculados." })}
    </div>`;
  if (window.Time) Time.escalacao($("#escalacao"));
}

async function pgEsfera(esf) {
  const meta = await dados(`${esf}/meta.json`);
  const midia = await dados(`${esf}/midia.json`);
  const orgaos = (await dados(`${esf}/orgaos.json`)) || [];
  const info = ESFERAS[esf];
  const t = meta?.totais || {};
  const soma = (k) => orgaos.reduce((a, o) => a + (o[k] || 0), 0);
  app.innerHTML = `${trilha([["Início", "#/"], [info.nome]])}${cabeca(info.nome, meta ? `Exercício ${meta.ano}. Atualizado em ${new Date(meta.atualizado_em).toLocaleString("pt-BR")}.` : "")}
    ${meta ? "" : semDados(esf)}
    <div class="kpis">
      <div class="kpi"><b>${fmtR(t.atualizado || t.orcado)}</b><span>orçamento</span></div>
      <div class="kpi"><b>${fmtR(t.empenhado)}</b><span>empenhado</span><small>${pct(t.empenhado, t.atualizado || t.orcado) ?? "—"}% do orçamento</small></div>
      <div class="kpi"><b>${fmtR(t.liquidado)}</b><span>liquidado</span></div>
      <div class="kpi"><b>${fmtR(t.pago)}</b><span>pago</span></div>
    </div>
    <div class="botoes">
      ${botao({ href: `#/e/${esf}/secretarias`, ic: "🏛️", t: "Secretarias", n: `${fmtN(orgaos.length)} órgãos`, e: "Abra cada secretaria: despesas, receitas, obras, alertas e o que fazer.", destaque: true })}
      ${botao({ href: `#/e/${esf}/midia`, ic: "📰", t: "Na mídia (72h)", n: midia ? `${midia.itens.length} notícias` : "", e: "Notícias negativas sobre cada secretaria, com o que cobrar e o que fazer.", selo: midia?.itens.length ? `${midia.itens.length} novas` : "" })}
      ${botao({ href: `#/e/${esf}/missoes`, ic: "🎯", t: "Missões", n: `${fmtN(soma("n_missoes"))} missões`, e: "Onde o time precisa ir e o que verificar em cada lugar." })}
      ${botao({ href: `#/e/${esf}/obras`, ic: "🏗️", t: "Obras e reformas", n: `${fmtN(soma("n_obras"))} obras`, e: "Reformas de escolas e postos de saúde, com situação de cada uma.", selo: soma("n_obras_paradas") ? `${soma("n_obras_paradas")} paradas` : "" })}
      ${botao({ href: `#/e/${esf}/unidades`, ic: "🏫", t: "Escolas e saúde", n: `${fmtN(soma("n_unidades"))} unidades`, e: `Ficha de cada escola ${info.escolas} e unidade de saúde.` })}
      ${botao({ href: `#/e/${esf}/radar`, ic: "🚨", t: "Radar de alertas", n: `${fmtN(soma("n_alertas"))} alertas`, e: "Gastos fora do padrão, compras divididas, empresas novas ou punidas.", selo: soma("n_alertas_alta") ? `${soma("n_alertas_alta")} altos` : "" })}
      ${botao({ href: `#/e/${esf}/ranking`, ic: "🏆", t: "Ranking", n: "Índice Mourinha", e: "Quem está entregando mais e quem precisa engajar." })}
      ${botao({ href: `#/e/${esf}/fornecedores`, ic: "🏢", t: "Fornecedores", n: "", e: "Quem mais recebe dinheiro público e de quais secretarias." })}
      ${botao({ href: `#/e/${esf}/entregas`, ic: "📰", t: "Entregas", n: `${fmtN(soma("n_entregas"))} notícias`, e: "Inaugurações e entregas anunciadas oficialmente." })}
      ${botao({ href: `#/e/${esf}/dados`, ic: "🩺", t: "Saúde dos dados", n: meta ? `${meta.fontes.filter((f) => f.status === "ok").length}/${meta.fontes.length} fontes ok` : "", e: "Se o portal falhou, atrasou ou se algum total não confere." })}
    </div>
    ${orgaos.length ? `<div class="bloco"><h2>Quem precisa engajar mais</h2><p class="explica">As secretarias com nota mais baixa no Índice Mourinha agora.</p><div id="piores"></div></div>` : ""}`;
  if (orgaos.length) {
    const piores = orgaos.filter((o) => o.nota != null).sort((a, b) => a.nota - b.nota).slice(0, 5);
    $("#piores").innerHTML = piores.map((o) => `<a class="rank" href="#/e/${esf}/s/${o.id}"><span class="pos">${o.posicao}</span><span class="nome">${esc(o.nome)}</span><span class="nota">${o.nota}</span></a>`).join("") || `<p class="vazio">Sem notas ainda.</p>`;
  }
}

async function pgSecretarias(esf) {
  const orgaos = (await dados(`${esf}/orgaos.json`)) || [];
  app.innerHTML = `${trilha([["Início", "#/"], [ESFERAS[esf].nome, `#/e/${esf}`], ["Secretarias"]])}${cabeca("Secretarias e órgãos", "Toque numa secretaria para abrir os botões dela.")}
    ${orgaos.length ? "" : semDados(esf)}
    <div class="ferramentas"><input id="q" type="search" placeholder="Buscar secretaria…"><select id="ord"><option value="empenhado">Maior gasto</option><option value="nota">Melhor nota</option><option value="n_alertas">Mais alertas</option><option value="nome">Nome</option></select></div>
    <div class="botoes" id="lista"></div>`;
  const desenhar = () => {
    const q = $("#q").value.toLowerCase(), ord = $("#ord").value;
    const l = orgaos.filter((o) => (o.nome + o.sigla).toLowerCase().includes(q)).sort((a, b) => (ord === "nome" ? a.nome.localeCompare(b.nome) : (b[ord] ?? -1) - (a[ord] ?? -1)));
    $("#lista").innerHTML = l.map((o) => botao({ href: `#/e/${esf}/s/${o.id}`, ic: o.area === "saude" ? "🏥" : o.area === "escola" ? "🎓" : "🏛️",
      t: o.sigla, n: `${fmtR(o.pago)} pagos${o.nota != null ? ` · nota ${o.nota}` : ""}`, e: o.nome, selo: o.n_alertas_alta ? `${o.n_alertas_alta} alertas` : "" })).join("");
  };
  $("#q").oninput = $("#ord").onchange = desenhar;
  desenhar();
}

const ABAS = [
  ["painel", "📊", "Painel", "Orçamento, gasto mês a mês e nota da secretaria."],
  ["despesas", "💸", "Principais despesas", "Com o que gasta e para quem paga."],
  ["receitas", "💰", "Principais receitas", "De onde vem o dinheiro que financia a secretaria."],
  ["ranking", "🏆", "Ranking", "Posição no Índice Mourinha e maiores fornecedores."],
  ["unidades", "🏫", "Unidades", "Escolas, hospitais e postos ligados a esta secretaria."],
  ["obras", "🏗️", "Obras e reformas", "Cada obra com quanto foi pago e se está andando."],
  ["midia", "🗞️", "Na mídia (72h)", "Notícias negativas da imprensa: o que cobrar e o que fazer."],
  ["entregas", "📰", "Entregas", "O que a secretaria entregou segundo as notícias oficiais."],
  ["alertas", "🚨", "Alertas", "Pontos de atenção encontrados nos gastos."],
  ["contratos", "📑", "Contratos e diárias", "Contratos, convênios, diárias e folha."],
  ["melhorar", "📉", "Onde melhorar", "O que está abaixo do esperado."],
  ["fazer", "🎯", "O que fazer", "Missões de fiscalização para o time."],
  ["time", "👥", "Atividades do time", "O que o Time Mourinha já fez nesta secretaria."],
  ["todas", "📋", "Todas as despesas", "A lista completa, mês a mês, sem excluir nada."],
];

async function pgSecretaria(esf, id, aba) {
  const o = await dados(`${esf}/orgaos/${id}.json`);
  const meta = await dados(`${esf}/meta.json`);
  if (!o) { app.innerHTML = `${trilha([["Início", "#/"], [ESFERAS[esf].nome, `#/e/${esf}`]])}<p class="vazio">Secretaria não encontrada.</p>`; return; }
  const base = `#/e/${esf}/s/${id}`;
  const midiaOrg = ((await dados(`${esf}/midia.json`))?.itens || []).filter((n) => n.orgaos.includes(id));
  const tr = [["Início", "#/"], [ESFERAS[esf].nome, `#/e/${esf}`], ["Secretarias", `#/e/${esf}/secretarias`], [o.sigla, aba ? base : null]];
  if (!aba) {
    const num = {
      painel: o.nota != null ? `Nota ${o.nota}` : fmtR(o.pago) + " pagos", despesas: fmtR(o.empenhado) + " empenhados",
      receitas: pl(o.receitas.por_fonte.length, "fonte", "fontes"), ranking: o.posicao ? `${o.posicao}º lugar` : "—",
      unidades: pl(o.unidades.length, "unidade", "unidades"), obras: pl(o.obras.length, "obra", "obras"), entregas: pl(o.n_entregas, "entrega", "entregas"),
      alertas: pl(o.alertas.length, "alerta", "alertas"), contratos: pl(o.contratos.length, "contrato", "contratos"), melhorar: pl(o.onde_melhorar.length, "ponto", "pontos"),
      fazer: pl(o.missoes.length, "missão", "missões"), time: "Registros do time", midia: pl(midiaOrg.length, "notícia", "notícias"), todas: pl(o.registros, "registro", "registros"),
    };
    const selo = { alertas: o.n_alertas_alta ? `${o.n_alertas_alta} altos` : "", obras: o.n_obras_paradas ? `${o.n_obras_paradas} paradas` : "", midia: midiaOrg.length ? "72h" : "" };
    app.innerHTML = `${trilha(tr)}${cabeca(o.nome, `${o.sigla} · ${ESFERAS[esf].nome}`)}
      <div class="kpis"><div class="kpi"><b>${fmtR(o.atualizado || o.orcado)}</b><span>orçamento</span></div><div class="kpi"><b>${fmtR(o.empenhado)}</b><span>empenhado</span></div>
      <div class="kpi"><b>${fmtR(o.pago)}</b><span>pago</span></div><div class="kpi"><b>${o.nota ?? "—"}</b><span>Índice Mourinha</span>${o.posicao ? `<small>${o.posicao}º lugar</small>` : ""}</div></div>
      <div class="botoes">${ABAS.filter(([k]) => k !== "unidades" || o.unidades.length).map(([k, ic, t, e]) => botao({ href: `${base}/${k}`, ic, t, n: num[k], e, selo: selo[k], destaque: k === "fazer" })).join("")}</div>`;
    return;
  }
  const a = ABAS.find((x) => x[0] === aba);
  app.innerHTML = `${trilha([...tr, [a ? a[2] : aba]])}${cabeca(a ? a[2] : aba, `${o.nome}`)}<div id="aba"></div>
    <p><a class="btn claro" href="${base}">Voltar aos botões de ${esc(o.sigla)}</a></p>`;
  const el = $("#aba");
  const F = fonte(meta, o.fonte_url || meta?.portal);
  if (aba === "painel") {
    const c = o.indice_componentes || {};
    const nomes = { execucao: "Execução do orçamento", ritmo_pagamento: "Pagamento em dia", entregas: "Entregas noticiadas", transparencia: "Dados completos", atencao: "Poucos alertas" };
    el.innerHTML = `<div class="bloco"><h2>Gasto mês a mês</h2><p class="explica">Empenhado é o dinheiro reservado. Liquidado é o serviço entregue e conferido. Pago é o que saiu do caixa.</p><div class="grafico"><canvas id="g1"></canvas></div>${F}</div>
      <div class="bloco"><h2>Índice Mourinha: ${o.nota ?? "—"}</h2><p class="explica">${esc(meta?.aviso_indice || "")}</p>
      ${Object.entries(nomes).map(([k, n]) => `<div class="rank"><span class="nome">${n}</span><span style="flex:1">${barra(c[k])}</span><span class="nota">${c[k] ?? "—"}</span></div>`).join("")}</div>`;
    if (o.mensal.length) grafico($("#g1"), { type: "bar", data: { labels: o.mensal.map((m) => MESES[m.mes]), datasets: [
      { label: "Empenhado", data: o.mensal.map((m) => m.empenhado), backgroundColor: CORES.anil },
      { label: "Liquidado", data: o.mensal.map((m) => m.liquidado), backgroundColor: CORES.cinza },
      { label: "Pago", data: o.mensal.map((m) => m.pago), backgroundColor: CORES.brasa }] },
      options: { maintainAspectRatio: false, scales: { y: { ticks: { callback: (v) => fmtR(v) } } }, plugins: { tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${fmtR(x.raw, false)}` } } } } });
  }
  if (aba === "despesas") {
    const blocos = [["por_favorecido", "Para quem paga", "Os fornecedores e pessoas que mais receberam."], ["por_elemento", "Com o que gasta", "Tipo de despesa (material, serviços, obras…)."],
      ["por_acao", "Em quais ações", "Projetos e atividades do orçamento."], ["por_programa", "Em quais programas", ""]];
    el.innerHTML = blocos.map(([k, t, e]) => `<div class="bloco"><h2>${t}</h2><p class="explica">${e}</p><div id="d-${k}"></div></div>`).join("") + F;
    for (const [k] of blocos) {
      const l = o.despesas[k] || [];
      const d = $("#d-" + k);
      if (!l.length) { d.innerHTML = `<p class="vazio">Sem dados.</p>`; continue; }
      tabela(d, l, [{ k: "nome", t: "Nome", f: (v, r) => (r.fornecedor_id ? `<a href="#/e/${esf}/f/${r.fornecedor_id}">${esc(v)}</a>` : esc(v)) + (r.documento ? `<br><small>${esc(r.documento)}</small>` : "") },
        { k: "empenhado", t: "Empenhado", num: 1, f: (v) => fmtR(v, false) }, { k: "pago", t: "Pago", num: 1, f: (v) => fmtR(v, false) },
        { k: "percentual", t: "% do total", f: (v) => `${v}% ${barra(v)}` }], { porPagina: 10, nome: `${o.sigla}-${k}` });
    }
  }
  if (aba === "receitas") {
    el.innerHTML = `<div class="bloco"><h2>Fontes que pagam esta secretaria</h2><p class="explica">Quase todo o dinheiro é arrecadado pela Fazenda e repassado. Aqui aparece de qual fonte veio o dinheiro gasto: tesouro, SUS, Fundeb, convênios, empréstimos.</p><div id="r1"></div>${F}</div>
      ${o.receitas.tabelas_receita.map((t) => `<div class="bloco"><h3>${esc(t.origem)}</h3><p class="explica">${t.linhas} linhas. <a href="${esc(t.url)}" target="_blank" rel="noopener">Ver no portal</a></p></div>`).join("")}`;
    o.receitas.por_fonte.length ? tabela($("#r1"), o.receitas.por_fonte, [{ k: "nome", t: "Fonte de recurso" }, { k: "empenhado", t: "Valor", num: 1, f: (v) => fmtR(v, false) }, { k: "percentual", t: "%", f: (v) => `${v}% ${barra(v)}` }], { busca: false, nome: `${o.sigla}-receitas` })
      : ($("#r1").innerHTML = `<p class="vazio">O portal ainda não informou as fontes de recurso desta secretaria.</p>`);
  }
  if (aba === "ranking") {
    const todos = ((await dados(`${esf}/orgaos.json`)) || []).filter((x) => x.nota != null).sort((x, y) => y.nota - x.nota);
    el.innerHTML = `<div class="bloco"><h2>${o.posicao ? `${o.posicao}º de ${todos.length}` : "Sem posição ainda"}</h2><p class="explica">${esc(meta?.aviso_indice || "")}</p>
      ${todos.map((x) => `<a class="rank" href="#/e/${esf}/s/${x.id}" ${x.id === o.id ? 'style="background:var(--brasa-cl)"' : ""}><span class="pos">${x.posicao}</span><span class="nome">${esc(x.nome)}</span><span class="nota">${x.nota}</span></a>`).join("")}</div>`;
  }
  if (aba === "unidades") await listaUnidades(el, esf, (u) => o.unidades.includes(u.id));
  if (aba === "obras") listaObras(el, esf, o.obras);
  if (aba === "entregas") listaNoticias(el, o.noticias);
  if (aba === "midia") listaMidia(el, esf, midiaOrg, [o]);
  if (aba === "alertas") listaAlertas(el, esf, o.alertas);
  if (aba === "contratos") {
    const sec = [["contratos", "Contratos"], ["convenios", "Convênios"], ["diarias", "Diárias"]];
    el.innerHTML = (o.folha ? `<div class="bloco"><h2>Folha de pagamento</h2><div class="kpis"><div class="kpi"><b>${fmtN(o.folha.servidores)}</b><span>servidores</span></div><div class="kpi"><b>${fmtR(o.folha.total)}</b><span>total da folha</span></div><div class="kpi"><b>${fmtR(o.folha.media)}</b><span>média por servidor</span></div></div></div>` : "") +
      sec.map(([k, t]) => `<div class="bloco"><h2>${t}</h2><div id="c-${k}"></div></div>`).join("");
    for (const [k] of sec) {
      const l = o[k] || [];
      if (!l.length) { $("#c-" + k).innerHTML = `<p class="vazio">Nenhum registro encontrado no portal.</p>`; continue; }
      const cols = Object.keys(l[0]).filter((c) => !c.startsWith("_")).slice(0, 8).map((c) => ({ k: c, t: c }));
      tabela($("#c-" + k), l, cols, { nome: `${o.sigla}-${k}` });
    }
  }
  if (aba === "melhorar") el.innerHTML = o.onde_melhorar.length ? o.onde_melhorar.map((m) => `<div class="item media"><h3>${esc(m.titulo)}</h3><p>${esc(m.texto)}</p></div>`).join("") : `<p class="vazio">Nenhum ponto abaixo do esperado agora.</p>`;
  if (aba === "fazer") { const ms = ((await dados(`${esf}/missoes.json`)) || []).filter((m) => m.orgao_id === o.id); listaMissoes(el, esf, ms); }
  if (aba === "time") window.Time ? Time.atividadesDoOrgao(el, esf, o) : (el.innerHTML = "");
  if (aba === "todas") {
    const meses = o.meses_com_despesa;
    el.innerHTML = `<div class="bloco"><p class="explica">Todas as despesas coletadas, sem filtro de valor. Escolha o mês.</p>
      <div class="ferramentas"><select id="mes">${meses.map((m) => `<option value="${m}">${MESES[m] || "Sem data"}</option>`).join("")}</select></div><div id="lista"></div>${F}</div>`;
    const carregar = async () => {
      const m = $("#mes").value;
      const l = (await dados(`${esf}/orgaos/${o.id}/despesas-${String(m).padStart(2, "0")}.json`)) || [];
      tabela($("#lista"), l, [{ k: "data", t: "Data", f: fmtD }, { k: "numero", t: "Nº" }, { k: "favorecido", t: "Favorecido", f: (v, r) => `${esc(v)}<br><small>${esc(r.documento)}</small>` },
        { k: "historico", t: "Descrição", f: (v, r) => `${esc(v)}<br><small>${esc(r.elemento)}</small>` }, { k: "empenhado", t: "Empenhado", num: 1, f: (v) => (v ? fmtR(v, false) : "") },
        { k: "pago", t: "Pago", num: 1, f: (v) => (v ? fmtR(v, false) : "") }], { nome: `${o.sigla}-despesas-${m}` });
    };
    if (meses.length) { $("#mes").onchange = carregar; carregar(); } else $("#lista").innerHTML = `<p class="vazio">Sem despesas detalhadas ainda.</p>`;
  }
}

/* ---------------------------------------------------------------- listas reutilizáveis */
function listaAlertas(el, esf, alertas) {
  if (!alertas.length) { el.innerHTML = `<p class="vazio">Nenhum alerta.</p>`; return; }
  const sev = { alta: "Prioridade alta", media: "Prioridade média", baixa: "Prioridade baixa" };
  el.innerHTML = alertas.map((a) => `<div class="item ${a.severidade}"><div class="meta">${tag(sev[a.severidade], a.severidade)}${a.valor ? `<b>${fmtR(a.valor)}</b>` : ""}</div>
    <h3>${esc(a.titulo)}</h3><p>${esc(a.explicacao)}</p>
    <div class="meta">${a.favorecido ? `<span>${esc(a.favorecido)} ${esc(a.documento || "")}</span>` : ""}${a.fonte_url ? `<a href="${esc(a.fonte_url)}" target="_blank" rel="noopener">Ver na fonte</a>` : ""}
    ${a.unidade_id ? `<a href="#/e/${esf}/u/${a.unidade_id}">Ver unidade</a>` : ""}</div>${comoAgir(guiaPor.alerta(a.tipo), esc)}</div>`).join("");
}
function listaObras(el, esf, obras) {
  if (!obras.length) { el.innerHTML = `<p class="vazio">Nenhuma obra ou reforma encontrada nos gastos.</p>`; return; }
  el.innerHTML = `<div class="ferramentas"><select id="fst"><option value="">Todas as situações</option>${[...new Set(obras.map((o) => o.status))].map((s) => `<option>${esc(s)}</option>`).join("")}</select></div><div id="lo"></div>`;
  const d = () => {
    const f = $("#fst").value;
    $("#lo").innerHTML = obras.filter((o) => !f || o.status === f).map((o) => `<div class="item ${o.status === "Parada" ? "alta" : ""}">
      <div class="meta">${tag(o.status, o.status.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""))}${o.unidade_nome ? `<a href="#/e/${esf}/u/${o.unidade_id}">${esc(o.unidade_nome)}</a> · ${esc(o.municipio || "")}` : ""}</div>
      <h3>${esc(o.descricao)}</h3>
      <div class="meta"><span>Empresa: <b>${esc(o.favorecido)}</b></span><span>Empenhado ${fmtR(o.empenhado)}</span><span>Pago ${fmtR(o.pago)} (${o.percentual_pago ?? "—"}%)</span>
      ${o.ultimo_pagamento ? `<span>Último pagamento ${fmtD(o.ultimo_pagamento)}</span>` : ""}</div>
      <div style="margin-top:6px">${barra(o.percentual_pago)}</div>
      <div class="meta" style="margin-top:6px"><a href="${esc(o.fonte_url)}" target="_blank" rel="noopener">Ver na fonte</a>
      <a href="#/hoje?esfera=${esf}&orgao=${o.orgao_id || ""}&local=${encodeURIComponent(o.unidade_nome || o.descricao.slice(0, 60))}">Registrar visita</a></div>${comoAgir("obra", esc)}</div>`).join("");
  };
  $("#fst").onchange = d; d();
}
function listaNoticias(el, ns) {
  el.innerHTML = ns.length ? ns.map((n) => `<div class="item"><div class="meta">${tag(n.tipo === "entrega" ? "Entrega" : "Anúncio", n.tipo)}<span>${fmtD(n.data)}</span></div>
    <h3><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.titulo)}</a></h3>${n.resumo ? `<p>${esc(n.resumo)}</p>` : ""}</div>`).join("") : `<p class="vazio">Nenhuma notícia oficial recente.</p>`;
}
function listaMissoes(el, esf, ms) {
  if (!ms.length) { el.innerHTML = `<p class="vazio">Nenhuma missão no momento.</p>`; return; }
  el.innerHTML = ms.map((m) => `<div class="item ${m.prioridade}"><div class="meta">${tag(m.prioridade === "alta" ? "Prioridade alta" : "Prioridade média", m.prioridade)}${m.municipio ? `<span>${esc(m.municipio)}</span>` : ""}<span class="st" data-m="${esc(m.id)}"></span></div>
    <h3>${esc(m.titulo)}</h3><p>${esc(m.motivo)}</p>
    <details><summary>Checklist da visita</summary><ul class="checklist">${m.checklist.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></details>
    ${comoAgir(guiaPor.missao(m.tipo), esc)}
    <div class="meta" style="margin-top:8px">${m.fonte_url ? `<a href="${esc(m.fonte_url)}" target="_blank" rel="noopener">Ver na fonte</a>` : ""}${m.unidade_id ? `<a href="#/e/${esf}/u/${m.unidade_id}">Ficha da unidade</a>` : ""}
    <a class="btn peq" href="#/hoje?esfera=${esf}&orgao=${m.orgao_id || ""}&missao=${encodeURIComponent(m.id)}&local=${encodeURIComponent(m.titulo.replace(/^Visitar |^Verificar: /, "").split(":")[0])}">Assumir e registrar</a></div></div>`).join("");
}
function haHoras(d) { const h = Math.round((Date.now() - new Date(d)) / 3600e3); return h < 1 ? "agora há pouco" : h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)} dia${h >= 48 ? "s" : ""}`; }
function listaMidia(el, esf, itens, orgaos = []) {
  if (!itens.length) { el.innerHTML = `<p class="vazio">Nenhuma notícia negativa nas últimas 72 horas.</p>`; return; }
  const nomeOrg = Object.fromEntries(orgaos.map((o) => [o.id, o.sigla]));
  el.innerHTML = itens.map((n) => {
    const g = guiaPor.motivos(n.motivos);
    const local = n.titulo.slice(0, 90);
    return `<div class="item ${g === "vida" || g === "irregularidade" ? "alta" : "media"}">
      <div class="meta">${tag(GUIAS[g].titulo, g === "vida" || g === "irregularidade" ? "alta" : "media")}<span>${esc(n.fonte || "imprensa")}</span><span>${haHoras(n.data)}</span></div>
      <h3><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.titulo)}</a></h3>
      <div class="meta">${(n.orgaos.length ? n.orgaos.map((o) => `<a href="#/e/${esf}/s/${o}/midia">${esc(nomeOrg[o] || o)}</a>`) : n.temas.map(esc)).join(" · ")}
      <span>Motivo: ${n.motivos.map(esc).join(", ")}</span></div>
      ${comoAgir(g, esc)}
      <div class="cobranca" data-cobranca="midia-${esc(n.id)}" data-esfera="${esf}">
        <a class="btn peq" href="#/hoje?esfera=${esf}&orgao=${n.orgaos[0] || ""}&missao=midia-${esc(n.id)}&local=${encodeURIComponent(local)}">Cobrar e registrar</a></div></div>`;
  }).join("");
  if (window.Time) Time.statusCobranca(el);
}

async function listaUnidades(el, esf, filtro = () => true) {
  const us = ((await dados(`${esf}/unidades.json`)) || []).filter(filtro);
  if (!us.length) { el.innerHTML = `<p class="vazio">Nenhuma unidade carregada ainda.</p>`; return; }
  const muns = [...new Set(us.map((u) => u.municipio))].sort();
  el.innerHTML = `<div class="ferramentas"><input id="qu" type="search" placeholder="Buscar escola ou unidade…"><select id="tu"><option value="">Escolas e saúde</option><option value="escola">Só escolas</option><option value="saude">Só saúde</option></select>
    <select id="mu"><option value="">Todos os municípios</option>${muns.map((m) => `<option>${esc(m)}</option>`).join("")}</select><select id="pu"><option value="">Todas</option><option value="p">Com problema</option></select></div>
    <div id="mapa"></div><div class="botoes" id="lu" style="margin-top:12px"></div>`;
  let mapa = null, camada = null;
  if (window.L && us.some((u) => u.lat)) {
    mapa = L.map("mapa").setView([-9.6, -36.6], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(mapa);
  } else $("#mapa").remove();
  const d = () => {
    const q = $("#qu").value.toLowerCase(), t = $("#tu").value, m = $("#mu").value, p = $("#pu").value;
    const l = us.filter((u) => (!t || u.tipo === t) && (!m || u.municipio === m) && (!p || (u.faltando_essencial || []).length) && u.nome.toLowerCase().includes(q));
    $("#lu").innerHTML = l.slice(0, 300).map((u) => botao({ href: `#/e/${esf}/u/${u.id}`, ic: u.tipo === "escola" ? "🏫" : "🏥", t: u.nome, n: u.municipio,
      e: u.tipo === "escola" ? `${u.matriculas ? fmtN(u.matriculas) + " alunos · " : ""}${(u.faltando_essencial || []).length ? "Falta: " + u.faltando_essencial.join(", ") : u.situacao || ""}` : u.subtipo,
      selo: (u.faltando_essencial || []).length ? "atenção" : "" })).join("") + (l.length > 300 ? `<p class="vazio">Mostrando 300 de ${l.length}. Use a busca.</p>` : "");
    if (mapa) {
      camada && camada.remove();
      camada = L.layerGroup(l.filter((u) => u.lat).map((u) => L.circleMarker([u.lat, u.lon], { radius: 6, color: "#fff", weight: 1.5, fillColor: u.tipo === "escola" ? CORES.brasa : CORES.anil, fillOpacity: 1 })
        .bindPopup(`<b>${esc(u.nome)}</b><br>${esc(u.municipio)}<br><a href="#/e/${esf}/u/${u.id}">Abrir ficha</a>`))).addTo(mapa);
    }
  };
  ["qu", "tu", "mu", "pu"].forEach((i) => ($("#" + i)[i === "qu" ? "oninput" : "onchange"] = d));
  d();
}

/* ---------------------------------------------------------------- páginas por esfera */
async function pgLista(esf, tipo) {
  const info = ESFERAS[esf];
  const tit = { midia: "Na mídia (72 horas)", missoes: "Missões", obras: "Obras e reformas", unidades: "Escolas e saúde", radar: "Radar de alertas", entregas: "Entregas", ranking: "Ranking", fornecedores: "Fornecedores", dados: "Saúde dos dados" }[tipo];
  const sub = {
    missoes: "Onde o time precisa ir e o que verificar. Prioridade para escolas e unidades de saúde.",
    obras: "Reformas, construções e manutenções encontradas nos gastos. Parada = sem pagamento há mais de 90 dias.",
    radar: "Pontos de atenção. Não são acusações: cada um diz a regra que o gerou.",
    ranking: "Índice Mourinha de 0 a 100. Execução, pagamento em dia, entregas, dados completos e poucos alertas.",
    midia: "Notícias negativas da imprensa sobre cada secretaria nas últimas 72 horas. Cada uma traz o que cobrar e o que fazer. Atualiza todo dia à meia-noite.",
  }[tipo] || "";
  app.innerHTML = `${trilha([["Início", "#/"], [info.nome, `#/e/${esf}`], [tit]])}${cabeca(tit, sub)}<div id="l"></div>`;
  if (tipo === "midia") {
    const m = await dados(`${esf}/midia.json`);
    const orgaos = (await dados(`${esf}/orgaos.json`)) || [];
    const el = $("#l");
    if (!m) { el.innerHTML = `<div class="aviso azul">A primeira busca na imprensa ainda não rodou. Ela roda sozinha todo dia à meia-noite.</div>`; return; }
    const temas = [...new Set(m.itens.flatMap((n) => (n.orgaos.length ? n.orgaos : n.temas)))];
    el.innerHTML = `<p class="fonte">Atualizado em ${new Date(m.atualizado_em).toLocaleString("pt-BR")} · ${m.itens.length} notícias</p>
      <div class="ferramentas"><select id="ft"><option value="">Todas as secretarias</option>${temas.map((t) => `<option value="${esc(t)}">${esc(orgaos.find((o) => o.id === t)?.sigla || t)}</option>`).join("")}</select></div><div id="lm"></div>`;
    const d = () => listaMidia($("#lm"), esf, m.itens.filter((n) => !$("#ft").value || n.orgaos.includes($("#ft").value) || n.temas.includes($("#ft").value)), orgaos);
    $("#ft").onchange = d; d();
    return;
  }
  const el = $("#l");
  const meta = await dados(`${esf}/meta.json`);
  if (!meta) { el.innerHTML = semDados(esf); return; }
  if (tipo === "missoes") {
    const ms = (await dados(`${esf}/missoes.json`)) || [];
    const orgaos = (await dados(`${esf}/orgaos.json`)) || [];
    el.innerHTML = `<div class="ferramentas"><select id="fo"><option value="">Todas as secretarias</option>${orgaos.map((o) => `<option value="${o.id}">${esc(o.sigla)}</option>`).join("")}</select>
      <select id="fp"><option value="">Todas as prioridades</option><option value="alta">Alta</option><option value="media">Média</option></select></div><div id="lm"></div>`;
    const d = () => listaMissoes($("#lm"), esf, ms.filter((m) => (!$("#fo").value || m.orgao_id === $("#fo").value) && (!$("#fp").value || m.prioridade === $("#fp").value)));
    $("#fo").onchange = $("#fp").onchange = d; d();
  }
  if (tipo === "obras") listaObras(el, esf, (await dados(`${esf}/obras.json`)) || []);
  if (tipo === "unidades") await listaUnidades(el, esf);
  if (tipo === "radar") {
    const al = (await dados(`${esf}/alertas.json`)) || [];
    const tipos = [...new Set(al.map((a) => a.tipo))];
    el.innerHTML = `<div class="ferramentas"><select id="ft"><option value="">Todos os tipos</option>${tipos.map((t) => `<option>${esc(t)}</option>`).join("")}</select>
      <select id="fs"><option value="">Todas as prioridades</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></div><div id="la"></div>`;
    const d = () => listaAlertas($("#la"), esf, al.filter((a) => (!$("#ft").value || a.tipo === $("#ft").value) && (!$("#fs").value || a.severidade === $("#fs").value)));
    $("#ft").onchange = $("#fs").onchange = d; d();
  }
  if (tipo === "entregas") listaNoticias(el, (await dados(`${esf}/noticias.json`)) || []);
  if (tipo === "ranking") {
    const t = ((await dados(`${esf}/orgaos.json`)) || []).filter((x) => x.nota != null).sort((a, b) => b.nota - a.nota);
    el.innerHTML = `<div class="bloco"><p class="explica">${esc(meta.aviso_indice)}</p>${t.map((x) => `<a class="rank" href="#/e/${esf}/s/${x.id}"><span class="pos">${x.posicao}</span><span class="nome">${esc(x.nome)}<br><small style="color:var(--cinza);font-weight:400">${fmtR(x.pago)} pagos · ${x.n_entregas} entregas · ${x.n_alertas} alertas</small></span><span class="nota">${x.nota}</span></a>`).join("") || `<p class="vazio">Sem notas ainda.</p>`}</div>`;
  }
  if (tipo === "fornecedores") {
    const fs = (await dados(`${esf}/fornecedores.json`)) || [];
    el.innerHTML = `<div class="bloco" id="lf"></div>`;
    tabela($("#lf"), fs, [{ k: "nome", t: "Fornecedor", f: (v, r) => `<a href="#/e/${esf}/f/${r.id}">${esc(v)}</a><br><small>${esc(r.documento)}</small>` },
      { k: "empenhado", t: "Empenhado", num: 1, f: (v) => fmtR(v, false) }, { k: "pago", t: "Pago", num: 1, f: (v) => fmtR(v, false) },
      { k: "orgaos", t: "Secretarias", f: (v) => esc(v.length) }, { k: "sancoes", t: "Situação", f: (v, r) => (v.length ? tag("Sancionada", "alta") : "") + (r.cnpj?.abertura ? ` <small>aberta em ${fmtD(r.cnpj.abertura)}</small>` : "") }], { nome: "fornecedores" });
  }
  if (tipo === "dados") {
    el.innerHTML = `<div class="bloco"><h2>Fontes</h2>${meta.fontes.map((f) => `<div class="rank"><span class="nome">${esc(f.nome)}<br><small style="color:var(--cinza);font-weight:400">${esc(f.observacao)}</small></span>${tag({ ok: "Funcionando", parcial: "Parcial", erro: "Falhou", sem_chave: "Falta chave" }[f.status] || f.status, f.status)}</div>`).join("")}
      <p class="fonte">Última coleta: ${new Date(meta.atualizado_em).toLocaleString("pt-BR")} · ${fmtN(meta.n_registros_despesa)} registros de despesa</p></div>
      <div class="bloco"><h2>Conferência de totais</h2><p class="explica">Soma do que foi coletado comparada com o total que o portal mostra. Diferença diferente de zero precisa ser explicada.</p><div id="cf"></div></div>
      ${meta.tabelas_nao_classificadas.length ? `<div class="bloco"><h2>Tabelas ainda não reconhecidas</h2><p class="explica">Foram baixadas, mas o coletor ainda não sabe ler. Nada foi descartado.</p>${meta.tabelas_nao_classificadas.map((t) => `<div class="rank"><span class="nome">${esc(t.origem)}</span><span>${fmtN(t.linhas)} linhas</span></div>`).join("")}</div>` : ""}`;
    const linhas = meta.conferencia.flatMap((c) => ["empenhado", "liquidado", "pago"].filter((k) => c[k]).map((k) => ({ orgao: c.orgao, fase: k, ...c[k] })));
    linhas.length ? tabela($("#cf"), linhas, [{ k: "orgao", t: "Órgão" }, { k: "fase", t: "Fase" }, { k: "portal", t: "Portal", num: 1, f: (v) => fmtR(v, false) },
      { k: "coletado", t: "Coletado", num: 1, f: (v) => fmtR(v, false) }, { k: "diferenca", t: "Diferença", num: 1, f: (v) => (Math.abs(v) < 1 ? tag("Confere", "ok") : `<b style="color:var(--vermelho)">${fmtR(v, false)}</b>`) }], { nome: "conferencia" })
      : ($("#cf").innerHTML = `<p class="vazio">O portal não informou totais para comparar.</p>`);
  }
}

async function pgUnidade(esf, id, aba) {
  const us = (await dados(`${esf}/unidades.json`)) || [];
  const u = us.find((x) => x.id === id);
  if (!u) { app.innerHTML = `<p class="vazio">Unidade não encontrada.</p>`; return; }
  const obras = ((await dados(`${esf}/obras.json`)) || []).filter((o) => o.unidade_id === id);
  const alertas = ((await dados(`${esf}/alertas.json`)) || []).filter((a) => a.unidade_id === id);
  const missoes = ((await dados(`${esf}/missoes.json`)) || []).filter((m) => m.unidade_id === id);
  const base = `#/e/${esf}/u/${id}`;
  const tr = [["Início", "#/"], [ESFERAS[esf].nome, `#/e/${esf}`], ["Escolas e saúde", `#/e/${esf}/unidades`], [u.nome, aba ? base : null]];
  if (!aba) {
    app.innerHTML = `${trilha(tr)}${cabeca(u.nome, `${esc(u.subtipo)} · ${esc(u.municipio)}${u.codigo ? ` · código ${esc(u.codigo)}` : ""}`)}
      ${(u.faltando_essencial || []).length ? `<div class="aviso vermelho"><b>Falta o essencial:</b> ${esc(u.faltando_essencial.join(", "))} (Censo Escolar ${u.censo_ano}).</div>` : ""}
      <div class="botoes">
        ${botao({ href: `${base}/dados`, ic: "ℹ️", t: "Dados gerais", n: u.matriculas ? `${fmtN(u.matriculas)} alunos` : u.situacao || "", e: "Endereço, tipo e situação." })}
        ${botao({ href: `${base}/indicadores`, ic: "📋", t: "Indicadores", n: u.infraestrutura ? `${Object.values(u.infraestrutura).filter(Boolean).length}/${Object.keys(u.infraestrutura).length} itens` : "", e: "Infraestrutura e equipamentos." })}
        ${botao({ href: `${base}/gastos`, ic: "💸", t: "Gastos ligados", n: fmtR(u.gasto_ligado), e: "Despesas que citam esta unidade pelo nome." })}
        ${botao({ href: `${base}/obras`, ic: "🏗️", t: "Obras e reformas", n: `${obras.length} obras`, e: "Reformas e construções nesta unidade.", selo: obras.some((o) => o.status === "Parada") ? "parada" : "" })}
        ${botao({ href: `${base}/alertas`, ic: "🚨", t: "Alertas", n: `${alertas.length}`, e: "Pontos de atenção ligados a ela." })}
        ${botao({ href: `${base}/fazer`, ic: "🎯", t: "O que fazer", n: `${missoes.length} missões`, e: "Checklist para a visita.", destaque: true })}
        ${botao({ href: `#/hoje?esfera=${esf}&orgao=${u.orgao_id || ""}&unidade=${u.id}&local=${encodeURIComponent(u.nome)}`, ic: "📸", t: "Registrar visita", n: "", e: "Abrir a atividade do dia já com esta unidade." })}
      </div>`;
    return;
  }
  app.innerHTML = `${trilha([...tr, [aba]])}${cabeca(u.nome, esc(u.municipio))}<div id="aba"></div><p><a class="btn claro" href="${base}">Voltar</a></p>`;
  const el = $("#aba");
  if (aba === "dados") el.innerHTML = `<div class="bloco"><div class="kpis"><div class="kpi"><b>${esc(u.situacao || "—")}</b><span>situação</span></div><div class="kpi"><b>${fmtN(u.matriculas)}</b><span>matrículas</span></div><div class="kpi"><b>${esc(u.municipio)}</b><span>município</span></div></div>
    ${u.lat ? `<div id="mapa"></div>` : ""}<p class="fonte"><a href="${esc(u.fonte)}" target="_blank" rel="noopener">Fonte oficial</a></p></div>`;
  if (aba === "dados" && u.lat && window.L) { const m = L.map("mapa").setView([u.lat, u.lon], 15); L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(m); L.marker([u.lat, u.lon]).addTo(m); }
  if (aba === "indicadores") {
    const inf = u.infraestrutura || u.indicadores || {};
    el.innerHTML = `<div class="bloco">${Object.entries(inf).map(([k, v]) => `<div class="rank"><span class="nome">${esc(k.replace(/_/g, " "))}</span>${typeof v === "boolean" ? tag(v ? "Tem" : "Não tem", v ? "ok" : "alta") : esc(v)}</div>`).join("") || `<p class="vazio">Sem indicadores.</p>`}</div>`;
  }
  if (aba === "gastos") el.innerHTML = `<div class="aviso azul">Somamos só as despesas que citam esta unidade pelo nome sem dúvida. Gastos sem o nome da unidade ficam como "não identificados" na secretaria. Total ligado: <b>${fmtR(u.gasto_ligado, false)}</b>.</div>`;
  if (aba === "obras") listaObras(el, esf, obras);
  if (aba === "alertas") listaAlertas(el, esf, alertas);
  if (aba === "fazer") listaMissoes(el, esf, missoes);
}

async function pgFornecedor(esf, id) {
  const fs = (await dados(`${esf}/fornecedores.json`)) || [];
  const f = fs.find((x) => x.id === id);
  if (!f) { app.innerHTML = `<p class="vazio">Fornecedor não encontrado.</p>`; return; }
  const orgaos = (await dados(`${esf}/orgaos.json`)) || [];
  app.innerHTML = `${trilha([["Início", "#/"], [ESFERAS[esf].nome, `#/e/${esf}`], ["Fornecedores", `#/e/${esf}/fornecedores`], [f.nome]])}${cabeca(f.nome, esc(f.documento))}
    ${f.sancoes.length ? `<div class="aviso vermelho"><b>Empresa com sanção registrada:</b> ${f.sancoes.map((s) => `${esc(s.cadastro)} (${esc(s.tipo || "")}, ${esc(s.orgao || "")})`).join("; ")}</div>` : ""}
    <div class="kpis"><div class="kpi"><b>${fmtR(f.empenhado)}</b><span>empenhado</span></div><div class="kpi"><b>${fmtR(f.pago)}</b><span>pago</span></div><div class="kpi"><b>${fmtN(f.registros)}</b><span>registros</span></div>
    <div class="kpi"><b>${f.cnpj?.abertura ? fmtD(f.cnpj.abertura) : "—"}</b><span>abertura da empresa</span></div></div>
    ${f.cnpj ? `<div class="bloco"><p>${esc(f.cnpj.atividade || "")}<br>${esc(f.cnpj.municipio || "")} ${esc(f.cnpj.uf || "")} · situação: ${esc(f.cnpj.situacao || "—")}</p></div>` : ""}
    <h2 style="margin:0 0 10px;color:var(--anil)">Recebe de</h2><div class="botoes">${f.orgaos.map((oid) => { const o = orgaos.find((x) => x.id === oid); return o ? botao({ href: `#/e/${esf}/s/${oid}/despesas`, ic: "🏛️", t: o.sigla, n: "", e: o.nome }) : ""; }).join("")}</div>`;
}

function pgManual(chave) {
  if (chave && GUIAS[chave]) {
    const g = GUIAS[chave];
    app.innerHTML = `${trilha([["Início", "#/"], ["Manual do fiscal", "#/manual"], [g.titulo]])}${cabeca(`${g.ic} ${g.titulo}`, esc(g.quando))}
      <div class="bloco"><h2>O que cobrar</h2><ul class="checklist">${g.cobrar.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="bloco"><h2>O que fazer, passo a passo</h2><ol class="checklist">${g.fazer.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>
      <div class="bloco"><h2>A quem levar</h2><p>${esc(g.aquem)}</p></div>
      <div class="aviso azul">Regra do time: só fatos, fotos e documentos. Ponto de atenção não é acusação. Na dúvida, fale com um administrador.</div>
      <p><a class="btn claro" href="#/manual">Voltar ao manual</a></p>`;
    return;
  }
  app.innerHTML = `${trilha([["Início", "#/"], ["Manual do fiscal"]])}${cabeca("Manual do fiscal", "Para cada tipo de problema: o que cobrar, o que fazer e a quem levar.")}
    <div class="botoes">${Object.entries(GUIAS).map(([k, g]) => botao({ href: `#/manual/${k}`, ic: g.ic, t: g.titulo, n: "", e: g.quando })).join("")}</div>`;
}

function pgComoFunciona() {
  app.innerHTML = `${trilha([["Início", "#/"], ["Como funciona"]])}${cabeca("Como o Time Mourinha funciona")}
  <div class="bloco"><h2>De onde vêm os dados</h2><p class="explica">Todo dia à meia-noite um robô visita os portais oficiais e baixa tudo de novo: Portal da Transparência de Alagoas, Portal da Transparência de Maceió, Alagoas em Dados,
  Censo Escolar (INEP), CNES (unidades de saúde), notícias oficiais, dados de CNPJ e o cadastro federal de empresas punidas (CEIS/CNEP). Nenhum número é digitado à mão e nada é inventado.</p></div>
  <div class="bloco"><h2>Sem excluir nada</h2><p class="explica">Todas as despesas do ano entram, de qualquer valor. Itens repetidos no portal contam uma vez só. A soma é conferida com o total do portal e qualquer diferença aparece em "Saúde dos dados".</p></div>
  <div class="bloco"><h2>Alertas</h2><p class="explica">Compras divididas logo abaixo do limite de dispensa, um fornecedor concentrando o gasto, valores muito acima do normal, empresas com menos de um ano,
  empresas punidas, pagamento maior que o empenhado, pagamentos no fim de semana e obras sem pagamento há mais de 90 dias. Alerta é um ponto para conferir, não uma acusação.</p></div>
  <div class="bloco"><h2>Índice Mourinha</h2><p class="explica">Nota de 0 a 100 por secretaria: execução do orçamento (30%), pagamento em dia (15%), entregas noticiadas (25%), dados completos (15%) e poucos alertas (15%).
  É um indicador do time, não uma avaliação oficial.</p></div>
  <div class="bloco"><h2>Área do time</h2><p class="explica">Visitantes navegam por todos os dados públicos e veem quem faz parte do time. As atividades, fotos e vídeos de cada integrante só são vistos por ele mesmo e pelos administradores.</p></div>`;
}

/* ---------------------------------------------------------------- roteador */
async function rotear() {
  limparGraficos();
  const [caminho, qs] = location.hash.replace(/^#\/?/, "").split("?");
  const p = caminho.split("/").filter(Boolean);
  const params = new URLSearchParams(qs || "");
  document.querySelectorAll("#menu a").forEach((a) => a.classList.toggle("ativo", a.dataset.r === "" ? !p.length : caminho.startsWith(a.dataset.r)));
  app.innerHTML = `<div class="carregando">Carregando…</div>`;
  window.scrollTo(0, 0);
  try {
    if (!p.length) return await pgInicio();
    if (p[0] === "e" && ESFERAS[p[1]]) {
      const esf = p[1];
      if (!p[2]) return await pgEsfera(esf);
      if (p[2] === "secretarias") return await pgSecretarias(esf);
      if (p[2] === "s") return await pgSecretaria(esf, p[3], p[4]);
      if (p[2] === "u") return await pgUnidade(esf, p[3], p[4]);
      if (p[2] === "f") return await pgFornecedor(esf, p[3]);
      return await pgLista(esf, p[2]);
    }
    if (p[0] === "como-funciona") return pgComoFunciona();
    if (p[0] === "manual") return pgManual(p[1]);
    if (window.Time && (await Time.rota(p, params, app))) return;
    app.innerHTML = `<p class="vazio">Página não encontrada. <a href="#/">Voltar ao início</a></p>`;
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="aviso vermelho"><b>Algo deu errado ao abrir esta página.</b> ${esc(e.message)}</div>`;
  }
}
window.MOURINHA_APP = { dados, esc, fmtR, fmtN, fmtD, botao, trilha, cabeca, tag, ESFERAS, $, abrirMidia, barra };
window.addEventListener("hashchange", rotear);
window.addEventListener("DOMContentLoaded", rotear);
