"""Portal Alagoas em Dados (CKAN) — dados.al.gov.br."""
from __future__ import annotations

import re
from pathlib import Path

from ..util import BRUTOS, Http, StatusFonte, hash_curto, ler_tabela_bytes, log, norm

FORMATOS = {"CSV", "XLSX", "XLS", "JSON", "TXT"}


def coletar(cfg: dict, ano: int, http: Http):
    base = cfg["ckan"]["base"].rstrip("/")
    status = StatusFonte("Alagoas em Dados (CKAN)", base)
    tabelas, vistos = [], set()
    pasta = BRUTOS / "ckan"
    pasta.mkdir(parents=True, exist_ok=True)
    try:
        for termo in cfg["ckan"]["buscas"]:
            r = http.get(f"{base}/api/3/action/package_search", params={"q": termo, "rows": 50})
            r.raise_for_status()
            for pacote in r.json()["result"]["results"]:
                for rec in pacote.get("resources", []):
                    url = rec.get("url") or ""
                    fmt = (rec.get("format") or "").upper()
                    if url in vistos or fmt not in FORMATOS:
                        continue
                    texto = norm(f"{pacote.get('title','')} {rec.get('name','')} {url}")
                    anos = re.findall(r"20\d\d", texto)
                    if not anos or str(ano) not in anos:
                        continue
                    vistos.add(url)
                    try:
                        arq = http.get(url)
                        if arq.status_code != 200:
                            continue
                        nome = f"{hash_curto(url)}_{Path(url).name or 'recurso'}"
                        (pasta / nome).write_bytes(arq.content)
                        df = ler_tabela_bytes(arq.content, url if "." in Path(url).name else f"x.{fmt.lower()}")
                        if len(df):
                            tabelas.append((f"CKAN: {pacote.get('title')} / {rec.get('name')}", url, df))
                    except Exception as e:  # noqa: BLE001
                        log.warning("CKAN recurso falhou %s: %s", url, e)
        status.status = "ok"
        status.registros = sum(len(t[2]) for t in tabelas)
        status.observacao = f"{len(tabelas)} tabelas de {ano}"
    except Exception as e:  # noqa: BLE001
        status.status = "erro"
        status.observacao = f"{type(e).__name__}: {e}"[:400]
    return status, tabelas
