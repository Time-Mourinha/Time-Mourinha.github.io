// Botão "Instalar app": no Android/Chrome usa o convite do navegador; no iPhone ensina o caminho.
(() => {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  const instalado = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (instalado) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let convite = null;

  const botao = document.createElement("button");
  botao.className = "instalar";
  botao.type = "button";
  botao.innerHTML = "📲 Instalar app";
  botao.hidden = true;
  document.querySelector(".topo-in")?.insertBefore(botao, document.getElementById("usuario"));

  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); convite = e; botao.hidden = false; });
  window.addEventListener("appinstalled", () => { botao.hidden = true; convite = null; });
  if (ios) botao.hidden = false;

  botao.addEventListener("click", async () => {
    if (convite) { convite.prompt(); await convite.userChoice; convite = null; botao.hidden = true; return; }
    const aviso = document.createElement("div");
    aviso.className = "instalar-aviso";
    aviso.innerHTML = `<div><b>Instalar o Time Mourinha</b>
      <p>No Safari, toque em <b>Compartilhar</b> (o quadrado com a seta para cima) e depois em
      <b>Adicionar à Tela de Início</b>. O escudo do time aparece junto com os seus aplicativos.</p>
      <button type="button">Entendi</button></div>`;
    aviso.addEventListener("click", (ev) => { if (ev.target === aviso || ev.target.tagName === "BUTTON") aviso.remove(); });
    document.body.appendChild(aviso);
  });
})();
