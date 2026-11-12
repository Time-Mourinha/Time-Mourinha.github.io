"""Portais da Transparência (Governo de Alagoas e Prefeitura de Maceió).

Como o portal muda de layout com o tempo, a coleta é feita em duas partes:

1. **Descoberta** (Playwright): navega a partir das páginas-semente, segue links úteis,
   grava TODAS as respostas JSON que as páginas carregam (as "APIs internas" do portal)
   e todos os links de arquivos para download (CSV, TXT, XLSX, ZIP, JSON).
   O resultado vai para `docs/mapa-portal.json` — é o mapa do portal.
2. **Extração**: lê os arquivos baixados e os JSONs capturados e classifica cada tabela
   (despesa, receita, contrato, diária, convênio, folha) pelos nomes das colunas.

Nada é descartado: tabelas que não forem reconhecidas ficam registradas no mapa
como "não classificadas" para o time revisar.
"""
from __future__ import annotations

import io
import json
import re
import zipfile
from pathlib import Path
from urllib.parse import urljoin, urlparse

from ..util import (BRUTOS, DOCS, AMOSTRAS, Http, StatusFonte, achar_lista_registros,
                    hash_curto, ler_tabela_bytes, log, norm, salvar_json)

EXT_DOWNLOAD = (".csv", ".txt", ".xlsx", ".xls", ".zip", ".json")


def descobrir_pela_ponte(cfg: dict, ano: int, PASTA: Path, esfera_id: str, http: Http) -> dict:
    """Para portais que bloqueiam acessos de fora do Brasil: navega pelo HTML usando a ponte em São Paulo."""
    import html as H
    pcfg = cfg["portal"]
    dominio = urlparse(pcfg["base"]).netloc.removeprefix("www.")
    palavras = [norm(p) for p in pcfg["palavras_links"]]
    fila, visitadas, paginas, downloads, apis = list(pcfg["sementes"]), set(), [], {}, {}
    (DOCS / "paginas" / esfera_id).mkdir(parents=True, exist_ok=True)
    (PASTA / "xhr").mkdir(parents=True, exist_ok=True)
    while fila and len(visitadas) < pcfg["max_paginas"]:
        url = fila.pop(0)
        if url in visitadas:
            continue
        visitadas.add(url)
        try:
            r = http.get(url)
        except Exception as e:  # noqa: BLE001
            paginas.append({"url": url, "erro": str(e)[:200]})
            continue
        ct = r.headers.get("content-type", "")
        if "json" in ct:
            chave = hash_curto(url)
            (PASTA / "xhr" / f"{chave}.json").write_bytes(r.content)
            lista = achar_lista_registros(r.json())
            apis[url] = {"arquivo": f"xhr/{chave}.json", "registros": len(lista), "campos": sorted(lista[0].keys())[:60] if lista else []}
            continue
        texto = r.text
        (DOCS / "paginas" / esfera_id / f"{len(paginas) + 1:02d}-{hash_curto(url)}.html").write_text(texto[:400_000], encoding="utf-8")
        links = [(urljoin(url, H.unescape(h)), re.sub(r"<[^>]+>", " ", t).strip()[:120])
                 for h, t in re.findall(r'<a[^>]+href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', texto, flags=re.S | re.I)]
        # endereços de API escritos no próprio JavaScript da página
        for api in set(re.findall(r'["\'](/[\w/.-]*(?:api|json|rest|servico|dados)[\w/.-]*)["\']', texto, flags=re.I)):
            fila.append(urljoin(url, api))
        titulo = (re.search(r"<title>(.*?)</title>", texto, flags=re.S | re.I) or [None, ""])[1].strip()
        paginas.append({"url": url, "titulo": titulo, "links": len(links), "lista_links": [list(x) for x in links][:250], "via": "ponte"})
        for href, t in links:
            h = urlparse(href)
            if h.path.lower().endswith(EXT_DOWNLOAD) or "download" in h.path.lower() or "exportar" in h.path.lower():
                downloads[href] = {"texto": t, "pagina": url}
            elif h.netloc.removeprefix("www.").endswith(dominio) and any(p in norm(href + " " + t) for p in palavras) and href not in visitadas:
                fila.append(href)
    mapa = {"ano": ano, "via": "ponte", "paginas": paginas, "downloads": downloads, "apis": apis}
    salvar_json(DOCS / f"mapa-portal-{esfera_id}.json", mapa, compacto=False)
    log.info("Portal (ponte): %d páginas, %d downloads, %d APIs JSON", len(paginas), len(downloads), len(apis))
    return mapa


def descobrir(cfg: dict, ano: int, PASTA: Path, esfera_id: str) -> dict:
    """Navega o portal e grava o mapa. Retorna o mapa."""
    from playwright.sync_api import sync_playwright

    pcfg = cfg["portal"]
    dominio = urlparse(pcfg["base"]).netloc.removeprefix("www.")
    palavras = [norm(p) for p in pcfg["palavras_links"]]
    fila = list(pcfg["sementes"])
    visitadas: set[str] = set()
    paginas, downloads, apis = [], {}, {}
    (PASTA / "xhr").mkdir(parents=True, exist_ok=True)

    def ao_responder(resp):
        try:
            ct = resp.headers.get("content-type", "")
            if "json" not in ct or resp.status != 200:
                return
            corpo = resp.body()
            if len(corpo) < 50 or len(corpo) > 80_000_000:
                return
            url = resp.url
            chave = hash_curto(url)
            (PASTA / "xhr" / f"{chave}.json").write_bytes(corpo)
            dados = json.loads(corpo)
            lista = achar_lista_registros(dados)
            apis[url] = {
                "arquivo": f"xhr/{chave}.json",
                "registros": len(lista),
                "campos": sorted(lista[0].keys())[:60] if lista else [],
            }
        except Exception as e:  # noqa: BLE001
            log.debug("resposta ignorada: %s", e)

    with sync_playwright() as pw:
        nav = pw.chromium.launch()
        ctx = nav.new_context(locale="pt-BR", user_agent="Mozilla/5.0 TimeMourinha/1.0")
        pag = ctx.new_page()
        pag.on("response", ao_responder)
        while fila and len(visitadas) < pcfg["max_paginas"]:
            url = fila.pop(0)
            if url in visitadas:
                continue
            visitadas.add(url)
            try:
                # "networkidle" nunca chega em portais com conexões abertas; espera o HTML e dá um tempo
                pag.goto(url, wait_until="domcontentloaded", timeout=120_000)
                pag.wait_for_timeout(5000)
            except Exception as e:  # noqa: BLE001
                paginas.append({"url": url, "erro": str(e)[:200]})
                continue
            titulo = pag.title()
            links = pag.eval_on_selector_all(
                "a[href]", "els => els.map(e => [e.href, (e.innerText||'').trim().slice(0,120)])")
            paginas.append({"url": url, "titulo": titulo, "links": len(links),
                            "lista_links": [[h, t] for h, t in links if h.startswith("http")][:250],
                            "formularios": pag.eval_on_selector_all("form", "fs => fs.map(f => [f.action, f.id, f.querySelectorAll('input,select').length])")[:20]})
            try:  # guarda o HTML para o time ajustar o coletor depois
                (DOCS / "paginas" / esfera_id).mkdir(parents=True, exist_ok=True)
                (DOCS / "paginas" / esfera_id / f"{len(paginas):02d}-{hash_curto(url)}.html").write_text(pag.content()[:400_000], encoding="utf-8")
            except Exception:  # noqa: BLE001
                pass
            for href, texto in links:
                if not href.startswith("http"):
                    continue
                h = urlparse(href)
                caminho = h.path.lower()
                if caminho.endswith(EXT_DOWNLOAD) or "download" in caminho or "exportar" in caminho:
                    downloads[href] = {"texto": texto, "pagina": url}
                    continue
                if not h.netloc.removeprefix("www.").endswith(dominio):
                    continue
                alvo = norm(href + " " + texto)
                if any(p in alvo for p in palavras) and href not in visitadas:
                    fila.append(href.split("#")[0])
        nav.close()

    mapa = {"ano": ano, "paginas": paginas, "downloads": downloads, "apis": apis}
    salvar_json(DOCS / f"mapa-portal-{esfera_id}.json", mapa, compacto=False)
    log.info("Portal: %d páginas, %d downloads, %d APIs JSON", len(paginas), len(downloads), len(apis))
    return mapa


def baixar(mapa: dict, ano: int, http: Http, PASTA: Path) -> list[Path]:
    """Baixa os arquivos do ano corrente (ou sem ano no nome)."""
    destino = PASTA / "arquivos"
    destino.mkdir(parents=True, exist_ok=True)
    arquivos = []
    for url, info in mapa.get("downloads", {}).items():
        alvo = norm(url + " " + info.get("texto", ""))
        anos = re.findall(r"20\d\d", alvo)
        if anos and str(ano) not in anos:
            continue  # arquivo de outro ano
        try:
            r = http.get(url)
            if r.status_code != 200 or len(r.content) < 20:
                continue
            nome = Path(urlparse(url).path).name or "arquivo"
            cd = r.headers.get("content-disposition", "")
            m = re.search(r'filename="?([^";]+)', cd)
            if m:
                nome = m.group(1)
            caminho = destino / f"{hash_curto(url)}_{nome}"
            caminho.write_bytes(r.content)
            arquivos.append(caminho)
        except Exception as e:  # noqa: BLE001
            log.warning("download falhou %s: %s", url, e)
    return arquivos


def _tabelas_de_arquivo(caminho: Path):
    dados = caminho.read_bytes()
    if caminho.suffix.lower() == ".zip" or dados[:2] == b"PK" and not caminho.suffix.lower().startswith(".xls"):
        with zipfile.ZipFile(io.BytesIO(dados)) as z:
            for n in z.namelist():
                if n.lower().endswith(EXT_DOWNLOAD) and not n.lower().endswith(".zip"):
                    yield f"{caminho.name}/{n}", ler_tabela_bytes(z.read(n), n)
        return
    yield caminho.name, ler_tabela_bytes(dados, caminho.name)


def extrair(mapa: dict, arquivos: list[Path], PASTA: Path):
    """Gera (origem, url_fonte, DataFrame) para cada tabela encontrada."""
    import pandas as pd

    for caminho in arquivos:
        try:
            for nome, df in _tabelas_de_arquivo(caminho):
                if len(df):
                    yield nome, str(caminho), df
        except Exception as e:  # noqa: BLE001
            log.warning("não consegui ler %s: %s", caminho, e)
    for url, info in mapa.get("apis", {}).items():
        if not info.get("registros"):
            continue
        try:
            dados = json.loads((PASTA / info["arquivo"]).read_text(encoding="utf-8"))
            lista = achar_lista_registros(dados)
            df = pd.json_normalize(lista)
            df.columns = [str(c) for c in df.columns]
            yield url, url, df.astype(str)
        except Exception as e:  # noqa: BLE001
            log.warning("JSON ilegível %s: %s", url, e)


def salvar_amostra(nome: str, df) -> None:
    AMOSTRAS.mkdir(parents=True, exist_ok=True)
    df.head(30).to_csv(AMOSTRAS / f"{hash_curto(nome)}.csv", index=False)


def coletar(cfg: dict, ano: int, http: Http, esfera_id: str = "governo-al", nome_fonte: str = "Portal da Transparência"):
    status = StatusFonte(nome_fonte, cfg["portal"]["base"])
    PASTA = BRUTOS / esfera_id / "portal"
    tabelas = []
    try:
        from ..util import precisa_ponte
        mapa = (descobrir_pela_ponte(cfg, ano, PASTA, esfera_id, http) if precisa_ponte(cfg["portal"]["base"])
                else descobrir(cfg, ano, PASTA, esfera_id))
        arquivos = baixar(mapa, ano, http, PASTA)
        for nome, url, df in extrair(mapa, arquivos, PASTA):
            tabelas.append((nome, url, df))
            salvar_amostra(f"{esfera_id}/{nome}", df)
        status.registros = sum(len(t[2]) for t in tabelas)
        status.status = "ok" if tabelas else "parcial"
        status.observacao = (f"{len(mapa['paginas'])} páginas visitadas, {len(mapa['downloads'])} links de download, "
                             f"{len(mapa['apis'])} respostas JSON, {len(tabelas)} tabelas lidas")
    except Exception as e:  # noqa: BLE001
        status.status = "erro"
        status.observacao = f"{type(e).__name__}: {e}"[:400]
        log.exception("portal falhou")
    return status, tabelas
