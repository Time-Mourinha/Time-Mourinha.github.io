"""Notícias oficiais, dados de CNPJ (BrasilAPI) e sanções (CGU)."""
from __future__ import annotations

import os
import re
import xml.etree.ElementTree as ET
from datetime import timedelta
from email.utils import parsedate_to_datetime

from ..util import BRUTOS, Http, StatusFonte, agora, ler_json, log, norm, salvar_json, so_digitos


def noticias(feeds: list[str], dias: int, http: Http, palavras_entrega: list[str]):
    st = StatusFonte("Notícias oficiais", feeds[0])
    limite = agora() - timedelta(days=dias)
    itens, vistos = [], set()
    erros = []
    for url in feeds:
        try:
            r = http.get(url)
            if r.status_code != 200 or b"<rss" not in r.content[:2000] and b"<feed" not in r.content[:2000]:
                continue
            raiz = ET.fromstring(r.content)
            for it in raiz.iter("item"):
                titulo = (it.findtext("title") or "").strip()
                link = (it.findtext("link") or "").strip()
                data_txt = it.findtext("pubDate") or ""
                try:
                    data = parsedate_to_datetime(data_txt)
                except (TypeError, ValueError):
                    data = None
                if data and data < limite:
                    continue
                chave = norm(titulo)[:120]
                if not titulo or chave in vistos:
                    continue
                vistos.add(chave)
                desc = re.sub(r"<[^>]+>", " ", it.findtext("description") or "")
                desc = re.sub(r"\s+", " ", desc).strip()[:240]
                texto = norm(titulo + " " + desc)
                itens.append({
                    "titulo": titulo,
                    "link": link,
                    "data": data.isoformat() if data else None,
                    "resumo": desc,
                    "tipo": "entrega" if any(p in texto for p in palavras_entrega) else "anuncio",
                    "texto_busca": texto,
                })
        except Exception as e:  # noqa: BLE001
            erros.append(f"{url}: {e}")
    st.registros = len(itens)
    st.status = "ok" if itens else "erro"
    st.observacao = f"{len(itens)} notícias" + (f"; falhas: {'; '.join(erros)[:300]}" if erros else "")
    return st, itens


def dados_cnpj(cfg, http: Http, cnpjs: list[str]):
    """Consulta abertura/situação dos CNPJs (com cache para não repetir)."""
    cache_p = BRUTOS / "cnpj_cache.json"
    cache = ler_json(cache_p, {})
    st = StatusFonte("BrasilAPI — dados de CNPJ", "https://brasilapi.com.br")
    feitas = 0
    for c in cnpjs:
        c = so_digitos(c)
        if len(c) != 14 or c in cache:
            continue
        if feitas >= cfg["cnpj"]["max_consultas_por_dia"]:
            break
        try:
            r = http.get(cfg["cnpj"]["url"].format(cnpj=c))
            feitas += 1
            if r.status_code == 200:
                j = r.json()
                cache[c] = {"abertura": j.get("data_inicio_atividade"), "situacao": j.get("descricao_situacao_cadastral"),
                            "atividade": j.get("cnae_fiscal_descricao"), "municipio": j.get("municipio"),
                            "uf": j.get("uf"), "capital_social": j.get("capital_social")}
            elif r.status_code == 404:
                cache[c] = {"erro": "não encontrado"}
        except Exception as e:  # noqa: BLE001
            log.warning("cnpj %s: %s", c, e)
    salvar_json(cache_p, cache)
    st.status = "ok"
    st.registros = len(cache)
    st.observacao = f"{feitas} consultas novas hoje; {len(cache)} CNPJs em cache"
    return st, cache


def sancoes(cfg, http: Http, cnpjs: list[str]):
    chave = os.environ.get("CGU_API_KEY")
    st = StatusFonte("CGU — empresas sancionadas (CEIS/CNEP)", cfg["cgu"]["base"])
    if not chave:
        st.status = "sem_chave"
        st.observacao = "Cadastre o segredo CGU_API_KEY no GitHub para ativar."
        return st, {}
    cache_p = BRUTOS / "sancoes_cache.json"
    cache = ler_json(cache_p, {})
    for c in cnpjs[:400]:
        c = so_digitos(c)
        if len(c) != 14 or c in cache:
            continue
        achados = []
        for cadastro in ("ceis", "cnep"):
            try:
                r = http.get(f"{cfg['cgu']['base']}/{cadastro}", params={"codigoSancionado": c, "pagina": 1},
                             headers={"chave-api-dados": chave, "Accept": "application/json"})
                if r.status_code == 200:
                    for s in r.json():
                        achados.append({"cadastro": cadastro.upper(),
                                        "tipo": (s.get("tipoSancao") or {}).get("descricaoResumida"),
                                        "orgao": (s.get("orgaoSancionador") or {}).get("nome"),
                                        "inicio": s.get("dataInicioSancao"), "fim": s.get("dataFimSancao")})
            except Exception as e:  # noqa: BLE001
                log.warning("CGU %s: %s", c, e)
        cache[c] = achados
    salvar_json(cache_p, cache)
    st.status = "ok"
    st.registros = sum(1 for v in cache.values() if v)
    st.observacao = f"{len(cache)} CNPJs checados; {st.registros} com sanção"
    return st, cache
