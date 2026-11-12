"""Monta os arquivos JSON lidos pelo site (pasta site/dados)."""
from __future__ import annotations

import shutil

import pandas as pd

from .processa.analise import area_orgao, fmt_reais, nucleo_orgao
from .processa.normaliza import sigla_de
from .util import SAIDA as BASE_SAIDA, mascarar_doc, nome_bonito, norm, salvar_json, slug


def _top(df, col_grupo, n=20, col_valor="empenhado"):
    if df.empty:
        return []
    g = df.groupby(col_grupo)[[c for c in ["empenhado", "liquidado", "pago"] if c in df]].sum()
    g = g.sort_values(col_valor, ascending=False)
    total = g[col_valor].sum() or 1
    out = []
    for k, r in g.head(n).iterrows():
        item = {"nome": k if isinstance(k, str) else " · ".join(map(str, k)), "empenhado": round(r["empenhado"], 2),
                "liquidado": round(r["liquidado"], 2), "pago": round(r["pago"], 2),
                "percentual": round(r[col_valor] / total * 100, 1)}
        out.append(item)
    return out


def montar_orgaos(det: pd.DataFrame, tot: pd.DataFrame) -> dict:
    nomes = set(det["orgao"]) | set(tot["orgao"])
    orgaos, usados = {}, set()
    for nome in sorted(nomes):
        sig = sigla_de(nome)
        oid = slug(sig)
        if oid in usados:
            oid = slug(nome)
        usados.add(oid)
        orgaos[nome] = {"id": oid, "sigla": sig, "nome": nome_bonito(nome) if nome.isupper() else nome,
                        "nome_portal": nome, "area": area_orgao(nome), "nucleo": nucleo_orgao(nome)}
    return orgaos


def publicar(ctx: dict, esfera_id: str) -> None:
    det, tot = ctx["det"], ctx["tot"]
    orgaos = ctx["orgaos"]
    SAIDA = BASE_SAIDA / esfera_id
    if SAIDA.exists():
        shutil.rmtree(SAIDA)
    (SAIDA / "orgaos").mkdir(parents=True, exist_ok=True)

    lista = ctx["lista_orgaos"]
    por_id = {o["id"]: o for o in lista}
    salvar_json(SAIDA / "orgaos.json", [{k: v for k, v in o.items() if k not in ("nome_portal",)} for o in lista])

    # ---- detalhe de cada secretaria
    for nome, info in orgaos.items():
        o = por_id[info["id"]]
        g = det[det["orgao"] == nome] if not det.empty else det
        mensal = []
        if len(g) and g["data"].notna().any():
            m = g.dropna(subset=["data"]).groupby(g["data"].dt.month)[["empenhado", "liquidado", "pago"]].sum()
            mensal = [{"mes": int(k), **{c: round(v, 2) for c, v in r.items()}} for k, r in m.iterrows()]
        fav = []
        if len(g):
            gf = g.groupby(["favorecido", "documento"])[["empenhado", "liquidado", "pago"]].sum().sort_values("empenhado", ascending=False)
            tot_e = gf["empenhado"].sum() or 1
            for (f, d), r in gf.head(30).iterrows():
                fav.append({"nome": f or "(não informado)", "documento": mascarar_doc(d), "empenhado": round(r["empenhado"], 2),
                            "pago": round(r["pago"], 2), "percentual": round(r["empenhado"] / tot_e * 100, 1),
                            "fornecedor_id": d if len(d) == 14 else None})
        receitas = ctx["receitas_por_org"].get(o["id"], [])
        detalhe = {
            **{k: v for k, v in o.items() if k != "nome_portal"},
            "mensal": mensal,
            "despesas": {"por_elemento": _top(g, "elemento"), "por_programa": _top(g, "programa"),
                         "por_acao": _top(g, "acao"), "por_favorecido": fav, "por_funcao": _top(g, "funcao")},
            "receitas": {"por_fonte": _top(g, "fonte_recurso") if len(g) else [], "tabelas_receita": receitas},
            "unidades": [u["id"] for u in ctx["unidades"] if u.get("orgao_id") == o["id"]],
            "obras": [x for x in ctx["obras"] if x["orgao_id"] == o["id"]],
            "alertas": [a for a in ctx["alertas"] if a["orgao_id"] == o["id"]],
            "noticias": ctx["noticias_por_org"].get(o["id"], [])[:60],
            "contratos": ctx["outros_por_org"].get(("contrato", o["id"]), [])[:500],
            "diarias": ctx["outros_por_org"].get(("diaria", o["id"]), [])[:500],
            "convenios": ctx["outros_por_org"].get(("convenio", o["id"]), [])[:500],
            "folha": ctx["folha_por_org"].get(o["id"]),
            "onde_melhorar": ctx["melhorar"].get(o["id"], []),
            "missoes": [m["id"] for m in ctx["missoes"] if m["orgao_id"] == o["id"]],
            "meses_com_despesa": sorted({int(x) for x in g["data"].dt.month.dropna()}) if len(g) else [],
        }
        salvar_json(SAIDA / "orgaos" / f"{o['id']}.json", detalhe)
        # despesas completas, um arquivo por mês (para não pesar no celular)
        if len(g):
            cols = ["data", "numero", "fase", "favorecido", "documento", "elemento", "programa", "acao", "fonte_recurso",
                    "historico", "empenhado", "liquidado", "pago", "fonte_url"]
            gg = g.copy()
            gg["documento"] = gg["documento"].map(mascarar_doc)
            gg["mes"] = gg["data"].dt.month.fillna(0).astype(int)
            for mes, gm in gg.groupby("mes"):
                linhas = gm[cols].copy()
                linhas["data"] = linhas["data"].dt.strftime("%Y-%m-%d")
                salvar_json(SAIDA / "orgaos" / o["id"] / f"despesas-{mes:02d}.json",
                            linhas.fillna("").to_dict(orient="records"))

    salvar_json(SAIDA / "unidades.json", ctx["unidades"])
    salvar_json(SAIDA / "obras.json", ctx["obras"])
    salvar_json(SAIDA / "alertas.json", ctx["alertas"])
    salvar_json(SAIDA / "missoes.json", ctx["missoes"])
    salvar_json(SAIDA / "noticias.json", ctx["noticias"])
    salvar_json(SAIDA / "fornecedores.json", ctx["fornecedores"])
    salvar_json(SAIDA / "meta.json", ctx["meta"], compacto=False)
