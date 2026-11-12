"""Coleta diária do Time Mourinha.

Uso:  python -m coletor.main            (coleta tudo)
      python -m coletor.main --so-portal (só descobre/baixa o portal, útil para depurar)
"""
from __future__ import annotations

import argparse
import logging
import re
import sys
from pathlib import Path

import pandas as pd
import yaml

from .fontes import ckan_al, externas, portal_al, unidades as fonte_unid
from .processa import analise
from .processa.normaliza import classificar, juntar_despesas, limpar_orgao, mapear_colunas, padronizar_despesa
from .publicar import montar_orgaos, publicar
from .util import Http, StatusFonte, agora, agora_iso, ler_json, log, mascarar_doc, norm, salvar_json, valor_br, DOCS, SAIDA

CFG_DIR = Path(__file__).parent / "config"


def carregar_cfg():
    cfg = yaml.safe_load((CFG_DIR / "geral.yaml").read_text(encoding="utf-8"))
    cfg.update(yaml.safe_load((CFG_DIR / "regras.yaml").read_text(encoding="utf-8")))
    return cfg


def achar_orgao(txt: str, orgaos: dict):
    n = norm(limpar_orgao(txt))
    if not n:
        return None
    for nome, o in orgaos.items():
        if norm(nome) == n:
            return o
    for nome, o in orgaos.items():
        if o["nucleo"] and len(o["nucleo"]) >= 5 and o["nucleo"] in n:
            return o
    return None


def ligar_unidades(det, orgaos, unidades):
    """Soma, para cada unidade, os gastos cujo histórico cita a unidade sem ambiguidade."""
    gastos = {}
    idx = analise.indice_unidades(unidades)
    if det.empty or not idx:
        return gastos
    padrao = re.compile(r"\b(" + "|".join(re.escape(k) for k in sorted(idx, key=len, reverse=True)) + r")\b")
    for nome, o in orgaos.items():
        if not o["area"]:
            continue
        g = det[det["orgao"] == nome]
        for txt, valor in zip(g["historico"], g["empenhado"]):
            t = norm(txt)
            ks = set(padrao.findall(t))
            cands = [u for k in ks for u in idx[k] if u["tipo"] == o["area"]]
            if len(cands) > 1:
                cands = [u for u in cands if norm(u["municipio"]) and norm(u["municipio"]) in t]
            if len(cands) == 1:
                gastos[cands[0]["id"]] = gastos.get(cands[0]["id"], 0) + valor
    return gastos


def rodar(so_portal: bool = False, so_esfera: str | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = carregar_cfg()
    ano = agora().year if cfg.get("ano") in (None, "auto") else int(cfg["ano"])
    http = Http(intervalo=cfg["portal_comum"]["intervalo_segundos"])
    mun = fonte_unid.municipios(cfg, http)
    anteriores = {e["id"]: e for e in (ler_json(SAIDA / "esferas.json", []) or [])}
    resumos, falhas = [], 0
    for esf in cfg["esferas"]:
        if so_esfera and esf["id"] != so_esfera:
            continue
        log.info("===== %s =====", esf["nome"])
        try:
            r = rodar_esfera(cfg, esf, ano, http, mun, so_portal)
        except Exception as e:  # noqa: BLE001  (uma esfera com problema não derruba a outra)
            log.exception("esfera %s falhou", esf["id"])
            r = {"tem_dados": False, "erro": f"{type(e).__name__}: {e}"[:300]}
        falhas += 0 if r.get("tem_dados") else 1
        if not r.get("tem_dados") and anteriores.get(esf["id"], {}).get("tem_dados"):
            # mantém no ar os dados da última coleta boa e registra a falha
            r = {**anteriores[esf["id"]], "ultima_coleta_falhou": agora_iso(), "erro": r.get("erro", "sem despesas nesta coleta")}
        resumos.append({"id": esf["id"], "nome": esf["nome"], "curto": esf.get("curto", esf["nome"]),
                        "tipo": esf["tipo"], "portal": esf["portal"]["base"], **{k: v for k, v in r.items() if k not in ("id", "nome", "curto", "tipo", "portal")}})
    if not so_portal:
        salvar_json(SAIDA / "esferas.json", resumos, compacto=False)
    # Código 2 = alguma esfera ficou sem despesas: o workflow abre uma issue avisando.
    return 2 if falhas else 0


def rodar_esfera(cfg, esf, ano, http, mun, so_portal=False) -> dict:
    status: list[StatusFonte] = []
    cfg_portal = {**cfg, "portal": {**cfg["portal_comum"], **esf["portal"]}}
    st, tabelas = portal_al.coletar(cfg_portal, ano, http, esf["id"], f"Portal da Transparência — {esf['nome']}")
    status.append(st)
    if so_portal:
        print(st.como_dict())
        return {"tem_dados": bool(tabelas)}
    if esf.get("ckan"):
        st, tab_ckan = ckan_al.coletar({"ckan": esf["ckan"]}, ano, http)
        status.append(st)
        tabelas += tab_ckan

    # ---- classificar tabelas
    despesas, outros, inventario = [], [], []
    for nome, url, df in tabelas:
        tipo = classificar(nome, df.columns)
        inventario.append({"origem": nome, "url": url, "tipo": tipo, "linhas": len(df), "colunas": list(map(str, df.columns))[:40]})
        if tipo == "despesa":
            despesas.append(padronizar_despesa(df, nome, url))
        else:
            outros.append((tipo, nome, url, df))
    salvar_json(DOCS / f"inventario-tabelas-{esf['id']}.json", inventario, compacto=False)
    det, tot = juntar_despesas(despesas)
    orgaos = montar_orgaos(det, tot)
    log.info("Despesas: %d linhas detalhadas, %d órgãos", len(det), len(orgaos))

    # ---- unidades
    st_s, saude = fonte_unid.saude(cfg, http, mun, esf)
    st_e, escolas = fonte_unid.escolas(cfg, http, ano, esf)
    status += [st_s, st_e]
    unidades = saude + escolas
    org_area = {}
    for nome, o in orgaos.items():
        if o["area"]:
            emp = det.loc[det["orgao"] == nome, "empenhado"].sum() if not det.empty else 0
            if o["area"] not in org_area or emp > org_area[o["area"]][1]:
                org_area[o["area"]] = (o["id"], emp)
    for u in unidades:
        u["orgao_id"] = org_area.get(u["tipo"], (None,))[0]
    gastos_unid = ligar_unidades(det, orgaos, unidades)
    for u in unidades:
        u["gasto_ligado"] = round(gastos_unid.get(u["id"], 0), 2)

    # ---- notícias
    st_n, noticias = externas.noticias(esf["noticias"], cfg["noticias_dias"], http, cfg["entregas"]["palavras"])
    status.append(st_n)
    noticias_por_org = {}
    for n in noticias:
        n["orgaos"] = []
        for o in orgaos.values():
            if (len(o["nucleo"]) >= 5 and o["nucleo"] in n["texto_busca"]) or \
               (len(o["sigla"]) >= 3 and re.search(rf"\b{re.escape(norm(o['sigla']))}\b", n["texto_busca"])):
                n["orgaos"].append(o["id"])
                noticias_por_org.setdefault(o["id"], []).append({k: v for k, v in n.items() if k != "texto_busca"})
        n.pop("texto_busca", None)

    # ---- fornecedores: CNPJ e sanções
    cnpjs = []
    if not det.empty:
        cnpjs = (det[det["documento"].str.len() == 14].groupby("documento")["empenhado"].sum()
                 .sort_values(ascending=False).index.tolist())
    st_c, info_cnpj = externas.dados_cnpj(cfg, http, cnpjs)
    st_g, sanc = externas.sancoes(cfg, http, cnpjs)
    status += [st_c, st_g]

    # ---- obras, alertas
    hoje = agora()
    idx_unid = analise.indice_unidades(unidades)
    obras = analise.montar_obras(det, orgaos, idx_unid, cfg, hoje)
    alertas = analise.gerar_alertas(det, orgaos, obras, info_cnpj, sanc, cfg)

    # ---- totais por órgão
    lista = []
    for nome, o in orgaos.items():
        g = det[det["orgao"] == nome] if not det.empty else det
        t = tot[tot["orgao"] == nome]
        soma = {c: float(g[c].sum()) if len(g) else 0.0 for c in ("empenhado", "liquidado", "pago")}
        oficial = {c: float(t[c].max()) if len(t) else 0.0 for c in ("orcado", "atualizado", "empenhado", "liquidado", "pago")}
        reg = {**o,
               "orcado": oficial["orcado"], "atualizado": oficial["atualizado"],
               "empenhado": soma["empenhado"] or oficial["empenhado"],
               "liquidado": soma["liquidado"] or oficial["liquidado"],
               "pago": soma["pago"] or oficial["pago"],
               "registros": len(g),
               "conferencia": {c: {"portal": oficial[c], "coletado": soma[c], "diferenca": round(soma[c] - oficial[c], 2)}
                               for c in ("empenhado", "liquidado", "pago") if oficial[c] and soma[c]},
               "n_alertas": len([a for a in alertas if a["orgao_id"] == o["id"]]),
               "n_alertas_alta": len([a for a in alertas if a["orgao_id"] == o["id"] and a["severidade"] == "alta"]),
               "n_obras": len([x for x in obras if x["orgao_id"] == o["id"]]),
               "n_obras_paradas": len([x for x in obras if x["orgao_id"] == o["id"] and x["status"] == "Parada"]),
               "n_unidades": len([u for u in unidades if u.get("orgao_id") == o["id"]]),
               "n_entregas": len([n for n in noticias_por_org.get(o["id"], []) if n["tipo"] == "entrega"])}
        lista.append(reg)
    if not lista:
        log.warning("%s: nenhuma despesa coletada; os dados anteriores continuam no ar", esf["id"])
        salvar_json(DOCS / f"status-{esf['id']}.json", [s.como_dict() for s in status], compacto=False)
        return {"tem_dados": False, "erro": "; ".join(f"{s.nome}: {s.status} {s.observacao}" for s in status)[:600]}
    analise.calcular_indice(lista, det, alertas, noticias_por_org, cfg, hoje.month)
    missoes, melhorar = analise.missoes_e_melhorias(lista, obras, alertas, unidades, gastos_unid, hoje.month)
    for o in lista:
        o["n_missoes"] = len([m for m in missoes if m["orgao_id"] == o["id"]])
    lista.sort(key=lambda o: -(o["empenhado"] or 0))

    # ---- outras tabelas (contratos, diárias, convênios, receitas, folha)
    outros_por_org, folha_por_org, receitas_por_org, nao_class = {}, {}, {}, []
    for tipo, nome, url, df in outros:
        m = mapear_colunas(df.columns)
        col_org = m.get("orgao") or m.get("ug")
        if tipo == "nao_classificada" or not col_org:
            nao_class.append({"origem": nome, "url": url, "tipo": tipo, "linhas": len(df)})
            continue
        for org_txt, g in df.groupby(col_org):
            o = achar_orgao(org_txt, orgaos)
            if not o:
                continue
            if tipo == "folha":
                col_v = next((c for c in df.columns if any(k in norm(c) for k in ("REMUNERACAO", "BRUTO", "VENCIMENTO"))), None)
                f = folha_por_org.setdefault(o["id"], {"servidores": 0, "total": 0.0, "fonte_url": url})
                f["servidores"] += len(g)
                if col_v:
                    f["total"] += float(g[col_v].map(valor_br).fillna(0).sum())
            elif tipo == "receita":
                receitas_por_org.setdefault(o["id"], []).append({"origem": nome, "url": url, "linhas": len(g),
                                                                   "amostra": g.head(50).fillna("").to_dict(orient="records")})
            else:
                linhas = g.head(500).fillna("").astype(str)
                for c in linhas.columns:  # nunca publicar CPF inteiro
                    if "CPF" in norm(c):
                        linhas[c] = linhas[c].map(mascarar_doc)
                outros_por_org.setdefault((tipo, o["id"]), []).extend(
                    [{"_origem": nome, "_url": url, **r} for r in linhas.to_dict(orient="records")])
    for f in folha_por_org.values():
        f["media"] = round(f["total"] / f["servidores"], 2) if f["servidores"] else None
        f["total"] = round(f["total"], 2)

    # ---- fornecedores
    fornecedores = []
    if not det.empty:
        d2 = det.copy()
        d2["chave"] = d2["documento"].where(d2["documento"].str.len() > 0, d2["favorecido"].map(norm))
        oid = {n: o["id"] for n, o in orgaos.items()}
        for k, g in d2.groupby("chave"):
            if not k:
                continue
            doc = g["documento"].iloc[0]
            fornecedores.append({"id": doc if len(doc) == 14 else analise.slug(k)[:40], "nome": g["favorecido"].iloc[0],
                                 "documento": mascarar_doc(doc), "empenhado": round(g["empenhado"].sum(), 2),
                                 "pago": round(g["pago"].sum(), 2), "registros": len(g),
                                 "orgaos": sorted({oid[x] for x in g["orgao"] if x in oid}),
                                 "cnpj": info_cnpj.get(doc) if len(doc) == 14 else None,
                                 "sancoes": sanc.get(doc) or [] if len(doc) == 14 else []})
        fornecedores.sort(key=lambda x: -x["empenhado"])
        fornecedores = fornecedores[:3000]

    totais = {c: round(sum(o[c] or 0 for o in lista), 2) for c in ("orcado", "atualizado", "empenhado", "liquidado", "pago")}
    meta = {"esfera": esf["id"], "esfera_nome": esf["nome"], "portal": esf["portal"]["base"],
            "atualizado_em": agora_iso(), "ano": ano, "totais": totais, "n_orgaos": len(lista),
            "n_registros_despesa": int(len(det)), "fontes": [s.como_dict() for s in status],
            "tabelas_nao_classificadas": nao_class[:200],
            "conferencia": [{"orgao": o["nome"], "id": o["id"], **o["conferencia"]} for o in lista if o["conferencia"]],
            "aviso_indice": "Indicador criado pelo Time Mourinha a partir de dados públicos; não é avaliação oficial."}

    publicar({"det": det, "tot": tot, "orgaos": orgaos, "lista_orgaos": lista, "unidades": unidades, "obras": obras,
              "alertas": alertas, "missoes": missoes, "melhorar": melhorar, "noticias": noticias,
              "noticias_por_org": noticias_por_org, "fornecedores": fornecedores, "outros_por_org": outros_por_org,
              "folha_por_org": folha_por_org, "receitas_por_org": receitas_por_org, "meta": meta}, esf["id"])
    log.info("Publicado %s: %d órgãos, %d alertas, %d obras, %d missões, %d unidades",
             esf["id"], len(lista), len(alertas), len(obras), len(missoes), len(unidades))
    return {"tem_dados": bool(len(lista)), "atualizado_em": meta["atualizado_em"], "totais": totais,
            "n_orgaos": len(lista), "n_alertas": len(alertas),
            "n_alertas_alta": len([a for a in alertas if a["severidade"] == "alta"]), "n_obras": len(obras),
            "n_obras_paradas": len([o for o in obras if o["status"] == "Parada"]), "n_missoes": len(missoes),
            "n_unidades": len(unidades), "n_entregas": len([n for n in noticias if n["tipo"] == "entrega"]),
            "fontes_ok": len([s for s in status if s.status == "ok"]), "fontes_total": len(status)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--so-portal", action="store_true", help="só descobre/baixa os portais")
    ap.add_argument("--esfera", help="governo-al ou prefeitura-maceio (padrão: todas)")
    a = ap.parse_args()
    sys.exit(rodar(a.so_portal, a.esfera))
