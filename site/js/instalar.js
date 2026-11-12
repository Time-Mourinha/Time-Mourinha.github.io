// Botão "Instalar app": no Android/Chrome usa o convite do navegador; no iPhone ensina o caminho.
(() => {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  const instalado = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (instalado) return;
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /android/i.test(ua);
  const passos = () => {
    if (ios && /CriOS/.test(ua)) return "No Chrome do iPhone, toque em <b>Compartilhar</b> (o quadrado com a seta, ao lado do endereço) e depois em <b>Adicionar à Tela de Início</b>.";
    if (ios && /FxiOS/.test(ua)) return "No Firefox do iPhone, toque no menu <b>☰</b>, depois em <b>Compartilhar</b> e em <b>Adicionar à Tela de Início</b>.";
    if (ios) return "No Safari, toque em <b>Compartilhar</b> (o quadrado com a seta para cima) e depois em <b>Adicionar à Tela de Início</b>.";
    if (android && /SamsungBrowser/.test(ua)) return "No navegador Samsung, toque no menu <b>☰</b> e depois em <b>Adicionar página a › Tela inicial</b>.";
    if (android && /Firefox/.test(ua)) return "No Firefox, toque nos <b>três pontinhos ⋮</b> e depois em <b>Instalar</b> (ou <b>Adicionar à tela inicial</b>).";
    if (android) return "Toque nos <b>três pontinhos ⋮</b> do navegador e depois em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).";
    if (/Edg\//.test(ua)) return "No Edge, clique nos <b>três pontinhos …</b>, depois em <b>Aplicativos › Instalar este site como aplicativo</b>.";
    if (/Chrome\//.test(ua)) return "No Chrome, clique no ícone de <b>instalar</b> na barra de endereço (um monitor com seta) ou nos <b>três pontinhos ⋮ › Transmitir, salvar e compartilhar › Instalar página como app</b>.";
    if (/Safari\//.test(ua)) return "No Safari do Mac, abra o menu <b>Arquivo › Adicionar ao Dock</b>.";
    if (/Firefox/.test(ua)) return "O Firefox do computador não instala sites. Abra o site no <b>Chrome</b> ou no <b>Edge</b> e clique em Instalar app — ou arraste o endereço para a área de trabalho como atalho.";
    return "Abra o site no <b>Chrome</b>, <b>Edge</b> ou <b>Safari</b> e use a opção <b>Instalar</b> / <b>Adicionar à tela inicial</b> do menu.";
  };
  let convite = null;

  const botao = document.createElement("button");
  botao.className = "instalar";
  botao.type = "button";
  botao.innerHTML = "📲 Instalar app";
  botao.hidden = true;
  document.querySelector(".topo-in")?.insertBefore(botao, document.getElementById("usuario"));

  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); convite = e; botao.hidden = false; });
  window.addEventListener("appinstalled", () => { botao.hidden = true; convite = null; });
  // Mostra o botão em qualquer navegador; se o navegador não abrir o convite sozinho, ensina o caminho.
  botao.hidden = false;

  botao.addEventListener("click", async () => {
    // Chrome/Edge com convite pronto: abre a janela de instalação do próprio navegador.
    if (convite) {
      try {
        const c = convite; convite = null;
        await c.prompt();
        const { outcome } = await c.userChoice;
        if (outcome === "accepted") { botao.hidden = true; return; }
      } catch (e) { /* se o navegador recusar, mostra o passo a passo abaixo */ }
    }
    const aviso = document.createElement("div");
    aviso.className = "instalar-aviso";
    aviso.innerHTML = `<div role="dialog" aria-label="Instalar o Time Mourinha"><b>Instalar o Time Mourinha</b>
      <p>${passos()} O escudo do time aparece junto com os seus aplicativos.</p>
      <button type="button">Entendi</button></div>`;
    aviso.addEventListener("click", (ev) => { if (ev.target === aviso || ev.target.tagName === "BUTTON") aviso.remove(); });
    document.body.appendChild(aviso);
  });
})();
