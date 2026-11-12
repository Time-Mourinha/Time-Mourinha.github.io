"""API oficial do Portal da Transparência de Alagoas (transparencia.al.gov.br/portal/api).

Documentada pelo próprio portal. Responde só a acessos do Brasil, por isso usa a ponte em São Paulo.
Todas as chamadas precisam do cabeçalho X-Requested-With: XMLHttpRequest.

O que vem daqui:
- despesas do ano por órgão × unidade gestora × mês × elemento × programa × ação × fonte × função
  (empenhado, liquidado e pago) — somam o total exato do Estado;
- dotação inicial e atualizada por unidade gestora;
- todos os favorecidos do ano e, para os maiores, quanto receberam de cada unidade gestora;
- obras públicas por unidade gestora.
"""
from __future__ import annotations

import pandas as pd

from ..util import Http, StatusFonte, log, norm, so_digitos, valor_br

BASE = "https://transparencia.al.gov.br"
CAB = {"X-Requested-With": "XMLHttpRequest", "Accept": "application/json"}
COLUNAS = {
    "orgao_descricao": "orgao", "descricao_ug": "ug_nome", "ug": "ug", "mes": "mes",
    "descricao_natureza6": "elemento", "programa_id__programa_descricao": "programa",
    "projeto_atividade_id__projeto_descricao": "acao", "fonte_mae_id__descricao_fonte_mae": "fonte_recurso",
    "pt_funcao_id__descricao_funcao": "funcao",
}


def _periodo(ano: int) -> dict:
    return {"data_registro_dti_": f"01/01/{ano}", "data_registro_dtf_": f"31/12/{ano}"}


def _paginas(http: Http, caminho: str, params: dict, limite: int = 1000, max_paginas: int = 600):
    """Percorre todas as páginas de um endpoint (limit/offset) e devolve as linhas."""
    linhas, offset = [], 0
    for _ in range(max_paginas):
        p = list(params.items()) if isinstance(params, dict) else list(params)
        p += [("limit", limite), ("offset", offset)]
        r = http.get(BASE + caminho, params=p, headers=CAB)
        r.raise_for_status()
        j = r.json()
        rows = j.get("rows", j if isinstance(j, list) else [])
        linhas += rows
        total = j.get("total", len(linhas)) if isinstance(j, dict) else len(linhas)
        offset += limite
        if not rows or offset >= total:
            break
    return linhas


def _valor(row: dict, fase: str) -> float:
    for k, v in row.items():
        if fase in k.lower():
            return valor_br(v) or 0.0
    return 0.0


def coletar(ano: int, http: Http, max_favorecidos: int = 400):
    st = StatusFonte("API do Portal da Transparência de Alagoas", BASE + "/portal/api")
    url_fonte = BASE + "/despesa/consulta-avancada"
    try:
        # 1) despesas detalhadas por classificação (somam o total do Estado)
        params = [*_periodo(ano).items()] + [("visualizar", c) for c in COLUNAS] + [("valor", v) for v in ("empenhado", "liquidado", "pago")]
        brutas = _paginas(http, "/despesa/json-despesa-avancada-filtro/", params)
        log.info("API AL: %d linhas de despesa", len(brutas))
        det = pd.DataFrame([{**{novo: str(r.get(orig, "") or "").strip() for orig, novo in COLUNAS.items()},
                             "empenhado": _valor(r, "empenhado"), "liquidado": _valor(r, "liquidado"), "pago": _valor(r, "pago")}
                            for r in brutas])
        if det.empty:
            raise RuntimeError("a consulta avançada não devolveu linhas")
        det["orgao"] = det["orgao"].where(det["orgao"].str.len() > 0, det["ug_nome"])
        det["data"] = pd.to_datetime(det["mes"].map(lambda m: f"{ano}-{int(m):02d}-01" if str(m).isdigit() else None), errors="coerce")
        for c in ("numero", "favorecido", "documento", "historico", "fase"):
            det[c] = ""
        det["valor"] = 0.0
        det["orcado"] = det["atualizado"] = 0.0
        det["origem"], det["fonte_url"], det["detalhado"], det["agregado"] = "API AL", url_fonte, True, True
        ug_orgao = dict(zip(det["ug"], det["orgao"]))

        # 2) dotação (orçamento) por unidade gestora, somada por órgão
        dots = _paginas(http, "/orcamento/json-dotacoes/", _periodo(ano))
        tot = pd.DataFrame([{"orgao": ug_orgao.get(str(d.get("ug")), str(d.get("descricao_ug", "")).strip()),
                             "orcado": valor_br(d.get("total_inicial")) or 0.0, "atualizado": valor_br(d.get("total_atualizado")) or 0.0}
                            for d in dots])
        if not tot.empty:
            tot = tot.groupby("orgao", as_index=False)[["orcado", "atualizado"]].sum()
            soma = det.groupby("orgao")[["empenhado", "liquidado", "pago"]].sum()
            for c in ("empenhado", "liquidado", "pago"):  # total oficial do portal por órgão, para conferência
                tot[c] = tot["orgao"].map(soma[c]).fillna(0.0)

        # 3) favorecidos: lista completa do ano e, para os maiores, o valor por unidade gestora
        favs = _paginas(http, "/despesa/json-despesa-favorecido/", _periodo(ano))
        favs = sorted(favs, key=lambda f: -(valor_br(f.get("total_empenhado")) or 0))
        por_org = []
        for f in favs[:max_favorecidos]:
            cod = str(f.get("codigo_favorecido", "")).strip()
            if not cod:
                continue
            try:
                for u in _paginas(http, f"/despesa/json-despesa-favorecido-ug/{cod}/", _periodo(ano), limite=200, max_paginas=5):
                    por_org.append({"orgao": ug_orgao.get(str(u.get("ug")), str(u.get("descricao_ug", "")).strip()),
                                    "favorecido": str(f.get("nome_favorecido", "")).strip(), "documento": so_digitos(cod),
                                    "empenhado": valor_br(u.get("total_empenhado")) or 0.0,
                                    "liquidado": valor_br(u.get("total_liquidado")) or 0.0,
                                    "pago": valor_br(u.get("total_pago")) or 0.0, "fonte_url": BASE + "/despesa/despesas-por-favorecido"})
            except Exception as e:  # noqa: BLE001
                log.warning("favorecido %s: %s", cod, e)
        forn = pd.DataFrame(por_org)
        forn_total = pd.DataFrame([{"favorecido": str(f.get("nome_favorecido", "")).strip(), "documento": so_digitos(f.get("codigo_favorecido")),
                                    "empenhado": valor_br(f.get("total_empenhado")) or 0.0, "pago": valor_br(f.get("total_pago")) or 0.0}
                                   for f in favs])

        st.status = "ok"
        st.registros = len(det)
        st.observacao = (f"{len(det)} linhas de despesa, {det['orgao'].nunique()} órgãos, {len(dots)} dotações, "
                         f"{len(favs)} favorecidos ({min(len(favs), max_favorecidos)} detalhados por unidade)")
        return st, det, tot, forn, forn_total
    except Exception as e:  # noqa: BLE001
        log.exception("API AL falhou")
        st.status = "erro"
        st.observacao = f"{type(e).__name__}: {e}"[:400]
        return st, pd.DataFrame(), pd.DataFrame(), pd.DataFrame(), pd.DataFrame()
