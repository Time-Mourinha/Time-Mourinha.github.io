/* Time Mourinha — área do time: cadastro, login, visitante, membros, atividades do dia com fotos e vídeos. */
"use strict";
(() => {
  const C = window.MOURINHA;
  const { dados, esc, fmtD, fmtN, botao, trilha, cabeca, tag, ESFERAS, $, abrirMidia } = window.MOURINHA_APP;
  const sb = C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;
  const NUM = { mourinha: "T", orlandinho: 10, bene: 7, diogo: 9, fabio: 8, hamona: 11, ricardo: 5 };
  const SIT = { em_andamento: "Em andamento", resolvido: "Resolvido", nao_resolvido: "Não resolvido" };
  const LIMITE_VIDEO = 50 * 1024 * 1024;
  let eu = null; // { user, perfil }

  const fotoPublica = (p) => (p && sb ? `${C.SUPABASE_URL}/storage/v1/object/public/perfis/${p}?v=${(p.match(/\d+/) || [""])[0]}` : null);
  const iniciais = (n) => (n || "?").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const rosto = (foto, nome) => (foto ? `<img src="${esc(foto)}" alt="Foto de ${esc(nome)}" loading="lazy">` : esc(iniciais(nome)));
  const visitante = () => localStorage.getItem("mourinha_visitante") === "1";
  const souMembro = () => eu?.perfil && ["membro", "admin"].includes(eu.perfil.papel);
  const souAdmin = () => eu?.perfil?.papel === "admin";
  const hojeISO = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const semSupabase = `<div class="aviso azul"><b>A área do time ainda não está ligada.</b> Falta colar o endereço e a chave do Supabase no arquivo site/js/config.js. O passo a passo está no README.</div>`;

  async function carregarEu() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) { eu = null; return null; }
    const { data: perfil } = await sb.from("perfis").select("*").eq("id", user.id).maybeSingle();
    eu = { user, perfil };
    const pend = localStorage.getItem("mourinha_foto_pendente");
    if (pend && perfil && !perfil.foto_path) { await salvarFotoPerfil(await (await fetch(pend)).blob()); localStorage.removeItem("mourinha_foto_pendente"); }
    return eu;
  }
  function chip() {
    const a = $("#usuario");
    if (eu?.perfil) {
      a.className = "usuario";
      a.href = `#/time/${eu.perfil.membro_id || eu.perfil.id}`;
      a.innerHTML = `${eu.perfil.foto_path ? `<img src="${esc(fotoPublica(eu.perfil.foto_path))}" alt="">` : `<span class="ini">${esc(iniciais(eu.perfil.nome))}</span>`}${esc((eu.perfil.nome || "").split(" ")[0])}`;
    } else {
      a.className = "usuario sem";
      a.href = "#/entrar";
      a.textContent = visitante() ? "Visitante" : "Entrar";
    }
  }

  async function vitrine() {
    if (!sb) return [];
    const { data } = await sb.from("vitrine").select("*");
    return data || [];
  }
  /* junta os 7 integrantes da configuração com quem já se cadastrou e foi aprovado */
  async function elenco() {
    const v = await vitrine();
    const lista = C.MEMBROS.map((m) => {
      const p = v.find((x) => x.membro_id === m.id);
      return { ...m, perfil: p, foto: fotoPublica(p?.foto_path), chave: m.id, esferas: p?.esferas || ["governo-al", "prefeitura-maceio"] };
    });
    v.filter((p) => !C.MEMBROS.some((m) => m.id === p.membro_id)).forEach((p) =>
      lista.push({ id: p.id, nome: p.nome, funcao: p.papel === "admin" ? "Administrador" : "Fiscal", perfil: p, foto: fotoPublica(p.foto_path), chave: p.id, esferas: p.esferas }));
    return lista;
  }

  /* ---------- escalação no campo (página inicial e página do time) */
  async function escalacao(el, esfera) {
    let l = await elenco();
    if (esfera) l = l.filter((m) => m.esferas.includes(esfera));
    const jog = (m) => `<a class="jogador ${m.id === "mourinha" ? "tecnico" : ""}" href="#/time/${esc(m.chave)}"><span class="rosto">${rosto(m.foto, m.nome)}</span>
      <span class="num">${NUM[m.id] ?? "·"}</span><span class="nm">${esc(m.nome)}</span><span class="fn">${esc(m.funcao)}</span></a>`;
    const tec = l.filter((m) => m.id === "mourinha"), resto = l.filter((m) => m.id !== "mourinha");
    const linhas = [tec, resto.slice(0, 3), resto.slice(3, 6), resto.slice(6)].filter((x) => x.length);
    el.innerHTML = `<section class="campo"><span class="circ"></span><h2>Escalação do Time Mourinha</h2>
      <p class="sub">${esfera ? ESFERAS[esfera].nome : "Governo de Alagoas e Prefeitura de Maceió"}. Toque num integrante para abrir o painel dele.</p>
      <div class="escalacao">${linhas.map((ln) => `<div class="linha-time">${ln.map(jog).join("")}</div>`).join("")}</div></section>`;
  }

  /* ---------- página do time */
  async function pgTime(params) {
    const esf = params.get("esfera") || "";
    app.innerHTML = `${trilha([["Início", "#/"], ["Time Mourinha"]])}${cabeca("Time Mourinha", "Quem está em campo em cada time.")}
      <div class="ferramentas"><select id="fe"><option value="">Os dois times</option><option value="governo-al">Time Governo de Alagoas</option><option value="prefeitura-maceio">Time Prefeitura de Maceió</option></select></div>
      <div id="esc"></div>
      ${!sb ? semSupabase : !eu ? `<div class="aviso">Você está como <b>visitante</b>: vê o time, mas não as atividades. <a href="#/entrar">Entrar</a> ou <a href="#/cadastro">fazer cadastro</a>.</div>` : ""}
      <div class="botoes">${souMembro() ? botao({ href: "#/hoje", ic: "📸", t: "Minha atividade do dia", n: "", e: "Registrar o que estou fazendo hoje.", destaque: true }) : ""}
      ${souAdmin() ? botao({ href: "#/admin", ic: "🛡️", t: "Administração", n: "", e: "Aprovar cadastros e definir quem joga em cada time." }) : ""}
      ${!eu ? botao({ href: "#/cadastro", ic: "✍️", t: "Fazer cadastro", n: "", e: "Foto, e-mail e senha. Um administrador aprova." }) : ""}</div>`;
    $("#fe").value = esf;
    $("#fe").onchange = () => (location.hash = `#/time${$("#fe").value ? "?esfera=" + $("#fe").value : ""}`);
    await escalacao($("#esc"), esf || null);
  }

  /* ---------- painel do integrante */
  async function pgMembro(chave, esfFiltro, orgaoFiltro) {
    const l = await elenco();
    const m = l.find((x) => x.chave === chave || x.perfil?.id === chave);
    if (!m) { app.innerHTML = `<p class="vazio">Integrante não encontrado.</p>`; return; }
    const pode = m.perfil && eu?.perfil && (eu.perfil.id === m.perfil.id || souAdmin());
    const tr = [["Início", "#/"], ["Time Mourinha", "#/time"], [m.nome, orgaoFiltro ? `#/time/${chave}` : null]];
    if (orgaoFiltro) tr.push([orgaoFiltro]);
    app.innerHTML = `${trilha(tr)}<div class="perfil"><span class="rosto">${rosto(m.foto, m.nome)}</span><div><h1>${esc(m.nome)}</h1>
      <p>${esc(m.funcao)} · ${m.esferas.map((e) => ESFERAS[e]?.curto).join(" e ")}</p></div></div><div id="painel"></div>`;
    const el = $("#painel");
    if (!sb) { el.innerHTML = semSupabase; return; }
    if (!m.perfil) { el.innerHTML = `<div class="aviso azul">${esc(m.nome)} ainda não fez o cadastro no site.</div>`; return; }
    if (!pode) { el.innerHTML = `<div class="aviso">As atividades, fotos e vídeos de ${esc(m.nome)} só aparecem para ele e para os administradores.</div>`; return; }
    let q = sb.from("atividades").select("*").eq("autor", m.perfil.id).order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(1000);
    if (esfFiltro) q = q.eq("esfera", esfFiltro);
    if (orgaoFiltro) q = q.eq("orgao_id", orgaoFiltro);
    const [{ data: atv, error }, { data: mid }] = await Promise.all([q, sb.from("midias").select("atividade_id,tipo").eq("autor", m.perfil.id)]);
    if (error) { el.innerHTML = `<div class="aviso vermelho">${esc(error.message)}</div>`; return; }
    const cont = {};
    (mid || []).forEach((x) => { cont[x.atividade_id] = cont[x.atividade_id] || { foto: 0, video: 0 }; cont[x.atividade_id][x.tipo]++; });
    const ids = new Set(atv.map((a) => a.id));
    const fotos = (mid || []).filter((x) => x.tipo === "foto" && ids.has(x.atividade_id)).length, videos = (mid || []).filter((x) => x.tipo === "video" && ids.has(x.atividade_id)).length;
    const n = (s) => atv.filter((a) => a.situacao === s).length;
    const hoje = atv.filter((a) => a.data === hojeISO());
    const porOrgao = {};
    atv.forEach((a) => { const k = `${a.esfera}|${a.orgao_id || ""}`; porOrgao[k] = porOrgao[k] || { esfera: a.esfera, id: a.orgao_id, nome: a.orgao_nome || "Sem secretaria", n: 0, res: 0, nres: 0 }; porOrgao[k].n++; if (a.situacao === "resolvido") porOrgao[k].res++; if (a.situacao === "nao_resolvido") porOrgao[k].nres++; });
    el.innerHTML = `<div class="kpis"><div class="kpi"><b>${atv.length}</b><span>atividades</span></div><div class="kpi"><b>${atv.filter((a) => a.tipo === "Visita").length}</b><span>visitas</span></div>
      <div class="kpi"><b>${fotos}</b><span>fotos</span></div><div class="kpi"><b>${videos}</b><span>vídeos</span></div><div class="kpi"><b>${n("resolvido")}</b><span>resolvidas</span></div>
      <div class="kpi"><b>${n("nao_resolvido")}</b><span>não resolvidas</span></div><div class="kpi"><b>${n("em_andamento")}</b><span>em andamento</span></div></div>
      ${eu.perfil.id === m.perfil.id && !orgaoFiltro ? `<p><a class="btn" href="#/hoje">＋ Atividade do dia</a></p>` : ""}
      ${!orgaoFiltro ? `<div class="bloco"><h2>Hoje, ${new Date().toLocaleDateString("pt-BR")}</h2>${hoje.length ? hoje.map((a) => cartao(a, m, cont)).join("") : `<p class="vazio">Nada registrado hoje.</p>`}</div>
      <div class="bloco"><h2>Atividade nos últimos 30 dias</h2><div class="grafico" style="height:180px"><canvas id="g30"></canvas></div></div>
      ${Object.keys(ESFERAS).map((e) => { const os = Object.values(porOrgao).filter((o) => o.esfera === e); return os.length ? `<h2 style="color:var(--anil);margin:6px 0 10px">${ESFERAS[e].nome}</h2><div class="botoes">${os.map((o) => botao({ href: `#/time/${chave}/${e}/${o.id || "-"}`, ic: "🏛️", t: o.nome, n: `${o.n} ${o.n === 1 ? "atividade" : "atividades"}`, e: `${o.res} ${o.res === 1 ? "resolvida" : "resolvidas"} · ${o.nres} não ${o.nres === 1 ? "resolvida" : "resolvidas"}`, selo: o.nres ? `${o.nres} pendentes` : "" })).join("")}</div>` : ""; }).join("")}` : ""}
      <div class="bloco"><h2>${orgaoFiltro ? "O que foi feito aqui" : "Linha do tempo"}</h2>${atv.length ? atv.map((a) => cartao(a, m, cont)).join("") : `<p class="vazio">Nenhuma atividade ainda.</p>`}</div>`;
    if (!orgaoFiltro && window.Chart) {
      const dias = [...Array(30)].map((_, i) => new Date(Date.now() - 3 * 3600e3 - (29 - i) * 864e5).toISOString().slice(0, 10));
      new Chart($("#g30"), { type: "bar", data: { labels: dias.map((d) => d.slice(8, 10) + "/" + d.slice(5, 7)), datasets: [{ label: "Atividades", data: dias.map((d) => atv.filter((a) => a.data === d).length), backgroundColor: "#FF6A13" }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { precision: 0 } } } } });
    }
  }
  function cartao(a, m, cont) {
    const c = cont?.[a.id] || { foto: 0, video: 0 };
    const verbo = { Visita: "visitou", Reunião: "fez reunião em", "Acompanhamento de obra": "acompanhou a obra em" }[a.tipo] || "registrou";
    return `<a class="item ${a.situacao === "nao_resolvido" ? "alta" : a.situacao === "em_andamento" ? "media" : ""}" href="#/atividade/${a.id}" style="display:block;text-decoration:none;color:inherit">
      <div class="meta"><b>${fmtD(a.data)}</b>${tag(SIT[a.situacao], a.situacao)}<span>${esc(ESFERAS[a.esfera]?.curto || "")}${a.orgao_nome ? " · " + esc(a.orgao_nome) : ""}</span></div>
      <h3>${esc(m?.nome || "")} ${verbo} ${esc(a.local || a.titulo)}</h3>
      <div class="meta"><span>📷 ${c.foto} ${c.foto === 1 ? "foto" : "fotos"}</span><span>🎥 ${c.video} ${c.video === 1 ? "vídeo" : "vídeos"}</span>${a.pendente ? `<span>Pendente: ${esc(a.pendente.slice(0, 80))}</span>` : ""}</div></a>`;
  }

  /* ---------- atividade do dia: criar */
  async function pgHoje(params) {
    app.innerHTML = `${trilha([["Início", "#/"], ["Atividade do dia"]])}`;
    if (!sb) { app.innerHTML += semSupabase; return; }
    if (!eu) { app.innerHTML += `<div class="aviso">Entre com seu e-mail e senha para registrar atividades. <a href="#/entrar">Entrar</a></div>`; return; }
    if (!souMembro()) { app.innerHTML += `<div class="aviso">Seu cadastro está aguardando a aprovação de um administrador.</div>`; return; }
    const meusTimes = eu.perfil.esferas || Object.keys(ESFERAS);
    const esf0 = params.get("esfera") && meusTimes.includes(params.get("esfera")) ? params.get("esfera") : meusTimes[0];
    const { data: deHoje } = await sb.from("atividades").select("*").eq("autor", eu.perfil.id).eq("data", hojeISO()).order("criado_em", { ascending: false });
    app.innerHTML += `<div class="perfil"><span class="rosto">${rosto(fotoPublica(eu.perfil.foto_path), eu.perfil.nome)}</span><div><h1>Atividade do dia</h1><p>${esc(eu.perfil.nome)}, ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p></div></div>
      ${(deHoje || []).length ? `<div class="bloco"><h2>Já registrado hoje</h2>${deHoje.map((a) => cartao(a, { nome: eu.perfil.nome }, {})).join("")}</div>` : ""}
      <div class="bloco"><h2>Nova atividade</h2><p class="explica">Diga onde vai e o que vai observar. Depois é só ir enchendo o clipe com fotos e vídeos.</p>
      <form class="form" id="f">
        <div class="opcoes" role="radiogroup" aria-label="Time">${meusTimes.map((e) => `<label><input type="radio" name="esfera" value="${e}" ${e === esf0 ? "checked" : ""}> ${ESFERAS[e].nome}</label>`).join("")}</div>
        <label>Secretaria<select name="orgao" id="org"></select></label>
        <label>Onde (local)<input name="local" list="locais" required placeholder="Ex.: Posto de Saúde do bairro…" value="${esc(params.get("local") || "")}"><datalist id="locais"></datalist></label>
        <label>Tipo<select name="tipo">${C.TIPOS_ATIVIDADE.map((t) => `<option>${t}</option>`).join("")}</select></label>
        <label>O que vou fazer ou observar<textarea name="descricao" placeholder="Ex.: ver a reforma, conferir equipamentos, conversar com a direção"></textarea></label>
        <button class="btn" type="submit">Começar atividade</button>
      </form></div>`;
    const f = $("#f");
    const carregarOrgaos = async () => {
      const e = f.esfera.value;
      const os = (await dados(`${e}/orgaos.json`)) || [];
      f.orgao.innerHTML = `<option value="">Sem secretaria definida</option>` + os.map((o) => `<option value="${o.id}" data-nome="${esc(o.sigla)}">${esc(o.sigla)} — ${esc(o.nome)}</option>`).join("");
      if (params.get("orgao")) f.orgao.value = params.get("orgao");
      const us = (await dados(`${e}/unidades.json`)) || [];
      $("#locais").innerHTML = us.slice(0, 2000).map((u) => `<option value="${esc(u.nome)}">${esc(u.municipio)}</option>`).join("");
    };
    f.querySelectorAll("[name=esfera]").forEach((r) => (r.onchange = carregarOrgaos));
    await carregarOrgaos();
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const b = f.querySelector("button"); b.disabled = true; b.textContent = "Salvando…";
      const opt = f.orgao.selectedOptions[0];
      const us = (await dados(`${f.esfera.value}/unidades.json`)) || [];
      const u = us.find((x) => x.id === params.get("unidade")) || us.find((x) => x.nome === f.local.value);
      const reg = { esfera: f.esfera.value, orgao_id: f.orgao.value || null, orgao_nome: f.orgao.value ? opt.dataset.nome : null, unidade_id: u?.id || null,
        local: f.local.value.trim(), tipo: f.tipo.value, titulo: `${f.tipo.value}: ${f.local.value.trim()}`, descricao: f.descricao.value.trim(), missao_id: params.get("missao") || null };
      const { data, error } = await sb.from("atividades").insert(reg).select().single();
      if (error) { alertaErro(error); b.disabled = false; b.textContent = "Começar atividade"; return; }
      if (reg.missao_id) await sb.from("missoes_status").upsert({ esfera: reg.esfera, missao_id: reg.missao_id, situacao: "em_andamento", responsavel: eu.perfil.id });
      location.hash = `#/atividade/${data.id}`;
    };
  }
  function alertaErro(e) { const d = document.createElement("div"); d.className = "aviso vermelho"; d.innerHTML = `<b>Não foi possível salvar.</b> ${esc(e.message || e)}`; app.prepend(d); window.scrollTo(0, 0); }

  /* ---------- atividade: clipe de fotos e vídeos + fechamento */
  async function pgAtividade(id) {
    if (!sb) { app.innerHTML = semSupabase; return; }
    if (!eu) { app.innerHTML = `<div class="aviso">Entre para ver esta atividade. <a href="#/entrar">Entrar</a></div>`; return; }
    const { data: a } = await sb.from("atividades").select("*").eq("id", id).maybeSingle();
    if (!a) { app.innerHTML = `<div class="aviso">Atividade não encontrada ou sem permissão para ver.</div>`; return; }
    const { data: autor } = await sb.from("perfis").select("nome,membro_id,id").eq("id", a.autor).maybeSingle();
    const meu = a.autor === eu.perfil.id;
    app.innerHTML = `${trilha([["Início", "#/"], ["Time Mourinha", "#/time"], [autor?.nome || "Integrante", `#/time/${autor?.membro_id || a.autor}`], [fmtD(a.data)]])}
      ${cabeca(a.local || a.titulo, `${esc(a.tipo)} · ${fmtD(a.data)} · ${esc(ESFERAS[a.esfera]?.nome || "")}${a.orgao_nome ? " · " + esc(a.orgao_nome) : ""}`)}
      <div class="meta" style="margin:-8px 0 14px">${tag(SIT[a.situacao], a.situacao)}</div>
      ${a.descricao ? `<div class="bloco"><h3 style="margin-top:0">O que ia observar</h3><p>${esc(a.descricao)}</p></div>` : ""}
      <div class="bloco"><h2>Clipe da visita</h2><p class="explica">Fotos e vídeos do que você está vendo. Escreva uma legenda curta antes de enviar, se quiser.</p>
        ${meu ? `<div class="clipe"><input id="leg" placeholder="Legenda (opcional): ex. infiltração na sala 3" style="flex:1;min-width:200px;border:1.5px solid var(--linha);border-radius:10px;padding:10px">
          <label class="btn">📷 Foto<input type="file" accept="image/*" capture="environment" hidden data-up></label>
          <label class="btn azul">🎥 Vídeo<input type="file" accept="video/*" capture="environment" hidden data-up></label>
          <label class="btn claro">📎 Clipe (galeria)<input type="file" accept="image/*,video/*" multiple hidden data-up></label></div>
          <div id="envio" style="margin-top:8px"></div>` : ""}
        <div class="midias" id="mids"></div></div>
      <div class="bloco"><h2>Resultado</h2>
        <form class="form" id="fech">
          <div class="opcoes">${Object.entries(SIT).map(([k, v]) => `<label><input type="radio" name="situacao" value="${k}" ${a.situacao === k ? "checked" : ""} ${meu || souAdmin() ? "" : "disabled"}> ${v}</label>`).join("")}</div>
          <label>O que foi resolvido<textarea name="resolvido" ${meu || souAdmin() ? "" : "readonly"}>${esc(a.resolvido || "")}</textarea></label>
          <label>O que não foi resolvido / falta fazer<textarea name="pendente" ${meu || souAdmin() ? "" : "readonly"}>${esc(a.pendente || "")}</textarea></label>
          ${meu || souAdmin() ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="submit">Salvar resultado</button><button class="btn claro" type="button" id="apagar">Apagar atividade</button></div>` : ""}
        </form></div>`;
    const desenharMidias = async () => {
      const { data: ms } = await sb.from("midias").select("*").eq("atividade_id", id).order("criado_em");
      if (!ms?.length) { $("#mids").innerHTML = `<p class="vazio" style="grid-column:1/-1">O clipe está vazio. Comece pela primeira foto.</p>`; return; }
      const { data: urls } = await sb.storage.from("midias").createSignedUrls(ms.map((x) => x.path), 3600);
      $("#mids").innerHTML = ms.map((x, i) => { const u = urls?.[i]?.signedUrl || ""; return `<figure><a href="javascript:void 0" onclick='abrirMidia(${JSON.stringify(u)}, "${x.tipo}", ${JSON.stringify(x.legenda || "")})'>
        ${x.tipo === "video" ? `<video src="${esc(u)}#t=0.5" preload="metadata" muted playsinline></video><span class="play">▶</span>` : `<img src="${esc(u)}" alt="${esc(x.legenda || "foto")}" loading="lazy">`}</a>
        <figcaption>${esc(x.legenda || "")} <small>${new Date(x.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small></figcaption></figure>`; }).join("");
    };
    await desenharMidias();
    document.querySelectorAll("[data-up]").forEach((inp) => (inp.onchange = async () => {
      const arqs = [...inp.files]; inp.value = "";
      const leg = $("#leg").value.trim();
      for (const arq of arqs) {
        const linha = document.createElement("div");
        linha.innerHTML = `<small>${esc(arq.name)}</small><div class="progresso"><i style="width:15%"></i></div>`;
        $("#envio").append(linha);
        try {
          const ehVideo = arq.type.startsWith("video");
          let corpo = arq, ext = (arq.name.split(".").pop() || (ehVideo ? "mp4" : "jpg")).toLowerCase();
          if (!ehVideo) { corpo = await comprimir(arq, 1600, 0.8); ext = "jpg"; }
          if (ehVideo && arq.size > LIMITE_VIDEO) throw new Error(`vídeo com ${(arq.size / 1048576).toFixed(0)} MB. O limite é 50 MB: grave mais curto (cerca de 1 minuto) ou em 720p.`);
          linha.querySelector("i").style.width = "45%";
          const path = `${eu.user.id}/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
          const up = await sb.storage.from("midias").upload(path, corpo, { contentType: ehVideo ? arq.type : "image/jpeg" });
          if (up.error) throw up.error;
          linha.querySelector("i").style.width = "85%";
          const ins = await sb.from("midias").insert({ atividade_id: id, path, tipo: ehVideo ? "video" : "foto", legenda: leg || null, tamanho_bytes: corpo.size });
          if (ins.error) throw ins.error;
          linha.remove();
        } catch (e) { linha.innerHTML = `<span class="tag alta">Falhou</span> ${esc(arq.name)}: ${esc(e.message || e)}`; }
      }
      $("#leg").value = "";
      await desenharMidias();
    }));
    const fe = $("#fech");
    fe.onsubmit = async (ev) => {
      ev.preventDefault();
      const b = fe.querySelector("button[type=submit]"); b.disabled = true;
      const { error } = await sb.from("atividades").update({ situacao: fe.situacao.value, resolvido: fe.resolvido.value, pendente: fe.pendente.value, atualizado_em: new Date().toISOString() }).eq("id", id);
      if (error) alertaErro(error);
      else {
        if (a.missao_id) await sb.from("missoes_status").upsert({ esfera: a.esfera, missao_id: a.missao_id, situacao: fe.situacao.value === "resolvido" ? "feita" : "em_andamento", responsavel: a.autor });
        b.textContent = "Salvo"; setTimeout(() => { b.textContent = "Salvar resultado"; b.disabled = false; }, 1500);
      }
    };
    const ap = $("#apagar");
    if (ap) ap.onclick = async () => {
      if (!confirm("Apagar esta atividade com todas as fotos e vídeos?")) return;
      const { data: ms } = await sb.from("midias").select("path").eq("atividade_id", id);
      if (ms?.length) await sb.storage.from("midias").remove(ms.map((x) => x.path));
      await sb.from("atividades").delete().eq("id", id);
      location.hash = `#/time/${autor?.membro_id || a.autor}`;
    };
  }
  function comprimir(arq, max, q) {
    return new Promise((ok, erro) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob((b) => (b ? ok(b) : erro(new Error("não consegui ler a imagem"))), "image/jpeg", q);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => erro(new Error("formato de imagem não suportado"));
      img.src = URL.createObjectURL(arq);
    });
  }

  /* ---------- atividades do time numa secretaria (botão dentro da secretaria) */
  async function atividadesDoOrgao(el, esf, o) {
    if (!sb) { el.innerHTML = semSupabase; return; }
    if (!eu) { el.innerHTML = `<div class="aviso">Você está como visitante. As atividades do time aparecem só para os integrantes (as próprias) e para os administradores.</div>`; return; }
    const { data } = await sb.from("atividades").select("*").eq("esfera", esf).eq("orgao_id", o.id).order("data", { ascending: false }).limit(300);
    const autores = {};
    (await elenco()).forEach((m) => m.perfil && (autores[m.perfil.id] = m));
    el.innerHTML = `<p><a class="btn" href="#/hoje?esfera=${esf}&orgao=${o.id}">＋ Registrar atividade aqui</a></p>` +
      ((data || []).length ? data.map((a) => cartao(a, autores[a.autor], {})).join("") : `<p class="vazio">Nenhuma atividade ${souAdmin() ? "do time" : "sua"} nesta secretaria ainda.</p>`);
  }

  /* ---------- entrar / cadastro / admin */
  function pgEntrar() {
    app.innerHTML = `${trilha([["Início", "#/"], ["Entrar"]])}${cabeca("Entrar no Time Mourinha")}
      ${!sb ? semSupabase : eu ? `<div class="aviso azul">Você já entrou como <b>${esc(eu.perfil?.nome || eu.user.email)}</b>. <a href="#/sair">Sair</a></div>` : `
      <div class="bloco"><form class="form" id="f"><label>E-mail<input type="email" name="email" required autocomplete="email"></label>
      <label>Senha<input type="password" name="senha" required autocomplete="current-password"></label>
      <button class="btn" type="submit">Entrar</button></form>
      <p><a href="#/cadastro">Ainda não tenho cadastro</a> · <a href="javascript:void 0" id="esqueci">Esqueci a senha</a></p></div>`}
      <div class="bloco"><h2>Só quero conhecer</h2><p class="explica">Como visitante você navega por todos os dados e vê o time, mas não as atividades.</p>
      <a class="btn azul" href="#/" id="vis">Entrar como visitante</a></div>`;
    $("#vis").onclick = () => { localStorage.setItem("mourinha_visitante", "1"); chip(); };
    const f = $("#f");
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault();
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.senha.value });
      if (error) return alertaErro({ message: error.message === "Invalid login credentials" ? "E-mail ou senha errados." : error.message });
      localStorage.removeItem("mourinha_visitante");
      await carregarEu(); chip();
      location.hash = souMembro() ? "#/hoje" : "#/time";
    };
    const es = $("#esqueci");
    if (es) es.onclick = async () => {
      const email = f.email.value.trim() || prompt("Seu e-mail:");
      if (!email) return;
      await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      alert("Se o e-mail estiver cadastrado, chega um link para criar nova senha.");
    };
  }
  async function salvarFotoPerfil(blob) {
    const path = `${eu.user.id}/rosto-${Date.now()}.jpg`;
    const up = await sb.storage.from("perfis").upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (up.error) throw up.error;
    await sb.from("perfis").update({ foto_path: path }).eq("id", eu.user.id);
    if (eu.perfil) eu.perfil.foto_path = path;
  }
  function pgCadastro() {
    app.innerHTML = `${trilha([["Início", "#/"], ["Cadastro"]])}${cabeca("Cadastro no Time Mourinha", "Tire uma foto do rosto, escolha seu nome e crie e-mail e senha. Um administrador aprova o acesso.")}
      ${!sb ? semSupabase : `<div class="bloco"><form class="form" id="f">
        <label class="foto-cadastro" id="fc">Toque para tirar sua foto<input type="file" accept="image/*" capture="user" hidden name="foto"></label>
        <label>Quem é você<select name="membro" required><option value="">Escolha…</option>${C.MEMBROS.map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join("")}<option value="outro">Outro integrante</option></select></label>
        <label id="ln" hidden>Seu nome<input name="nome"></label>
        <label>E-mail<input type="email" name="email" required autocomplete="email"></label>
        <label>Senha (mínimo 6 caracteres)<input type="password" name="senha" minlength="6" required autocomplete="new-password"></label>
        <button class="btn" type="submit">Criar cadastro</button></form></div>`}`;
    const f = $("#f");
    if (!f) return;
    let foto = null;
    f.foto.onchange = async () => {
      if (!f.foto.files[0]) return;
      foto = await comprimir(f.foto.files[0], 600, 0.85);
      $("#fc").innerHTML = `<img src="${URL.createObjectURL(foto)}" alt="Sua foto">`;
      $("#fc").append(f.foto);
    };
    f.membro.onchange = () => ($("#ln").hidden = f.membro.value !== "outro");
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      if (!foto) return alertaErro({ message: "Tire a foto do rosto antes de criar o cadastro." });
      const b = f.querySelector("button"); b.disabled = true; b.textContent = "Criando…";
      const membro = C.MEMBROS.find((m) => m.id === f.membro.value);
      const nome = membro ? membro.nome : f.nome.value.trim();
      const { data, error } = await sb.auth.signUp({ email: f.email.value.trim(), password: f.senha.value,
        options: { data: { nome, membro_id: membro ? membro.id : null }, emailRedirectTo: location.origin + location.pathname } });
      if (error) { alertaErro(error); b.disabled = false; b.textContent = "Criar cadastro"; return; }
      if (data.session) { await carregarEu(); await salvarFotoPerfil(foto); chip(); }
      else { const rd = new FileReader(); rd.onload = () => localStorage.setItem("mourinha_foto_pendente", rd.result); rd.readAsDataURL(foto); }
      app.innerHTML = `${cabeca("Cadastro enviado")}<div class="aviso azul">${data.session ? "Pronto!" : "Confirme o e-mail que acabou de chegar e depois entre."} Agora um administrador (Bené, Mourinha ou Orlandinho) precisa aprovar seu acesso. Enquanto isso você navega como visitante.</div><a class="btn" href="#/">Ir para o início</a>`;
    };
  }
  async function pgAdmin() {
    app.innerHTML = `${trilha([["Início", "#/"], ["Time Mourinha", "#/time"], ["Administração"]])}${cabeca("Administração", "Aprove cadastros, defina administradores e em quais times cada um joga.")}<div id="adm"></div>`;
    if (!souAdmin()) { $("#adm").innerHTML = `<div class="aviso">Só administradores abrem esta página.</div>`; return; }
    const { data: ps } = await sb.from("perfis").select("*").order("papel").order("criado_em");
    const ordem = { pendente: 0, admin: 1, membro: 2, bloqueado: 3 };
    ps.sort((a, b) => ordem[a.papel] - ordem[b.papel]);
    $("#adm").innerHTML = ps.map((p) => `<div class="item ${p.papel === "pendente" ? "media" : ""}" data-id="${p.id}">
      <div style="display:flex;gap:12px;align-items:center"><span class="jogador" style="width:auto"><span class="rosto" style="width:56px;height:56px;font-size:20px;border-color:var(--linha);color:#fff">${rosto(fotoPublica(p.foto_path), p.nome)}</span></span>
      <div style="flex:1"><h3 style="margin:0">${esc(p.nome || "(sem nome)")}</h3><div class="meta">${esc(p.email || "")} · cadastrado em ${fmtD(p.criado_em)}</div></div></div>
      <div class="ferramentas" style="margin-top:10px"><select data-k="papel">${["pendente", "membro", "admin", "bloqueado"].map((x) => `<option value="${x}" ${p.papel === x ? "selected" : ""}>${{ pendente: "Aguardando aprovação", membro: "Integrante", admin: "Administrador", bloqueado: "Bloqueado" }[x]}</option>`).join("")}</select>
      ${Object.entries(ESFERAS).map(([k, v]) => `<label class="opcoes" style="flex:none"><label><input type="checkbox" data-esf="${k}" ${p.esferas.includes(k) ? "checked" : ""}> Time ${v.curto}</label></label>`).join("")}
      <button class="btn peq" data-salvar>${p.papel === "pendente" ? "Aprovar e salvar" : "Salvar"}</button></div></div>`).join("") || `<p class="vazio">Nenhum cadastro.</p>`;
    document.querySelectorAll("[data-salvar]").forEach((b) => (b.onclick = async () => {
      const box = b.closest("[data-id]");
      let papel = box.querySelector("[data-k=papel]").value;
      if (papel === "pendente" && b.textContent.startsWith("Aprovar")) papel = "membro";
      const esferas = [...box.querySelectorAll("[data-esf]:checked")].map((x) => x.dataset.esf);
      const { error } = await sb.from("perfis").update({ papel, esferas }).eq("id", box.dataset.id);
      if (error) return alertaErro(error);
      pgAdmin();
    }));
  }

  /* ---------- rotas desta área */
  async function rota(p, params) {
    if (p[0] === "time") { if (!p[1]) await pgTime(params); else await pgMembro(p[1], p[2], p[3] && p[3] !== "-" ? p[3] : null); return true; }
    if (p[0] === "hoje") { await pgHoje(params); return true; }
    if (p[0] === "atividade") { await pgAtividade(p[1]); return true; }
    if (p[0] === "entrar") { pgEntrar(); return true; }
    if (p[0] === "cadastro") { pgCadastro(); return true; }
    if (p[0] === "admin") { await pgAdmin(); return true; }
    if (p[0] === "sair") { if (sb) await sb.auth.signOut(); eu = null; chip(); location.hash = "#/"; return true; }
    return false;
  }

  window.Time = { rota, escalacao, atividadesDoOrgao };
  const app = document.getElementById("app");
  const pronto = carregarEu().then(chip).catch(chip);
  // garante que o usuário já foi carregado antes da primeira página da área do time
  const rotaOriginal = rota;
  window.Time.rota = async (...a) => { await pronto; return rotaOriginal(...a); };
  if (sb) sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") { eu = null; chip(); } });
})();
