"""Análises: obras e reformas, vínculo gasto↔unidade, alertas, Índice Mourinha,
"onde melhorar" e missões de fiscalização."""
from __future__ import annotations

import math
import re
from datetime import datetime

import pandas as pd

from ..util import hash_curto, mascarar_doc, norm, slug

PREFIXOS_UNIDADE = r"^(ESCOLA ESTADUAL|ESC EST|EE|E E|COLEGIO ESTADUAL|COLEGIO|CENTRO EDUCACIONAL|ESCOLA|" \
                   r"HOSPITAL GERAL|HOSPITAL REGIONAL|HOSPITAL ESTADUAL|HOSPITAL|UNIDADE DE PRONTO ATENDIMENTO|UPA 24H|UPA|" \
                   r"UNIDADE DE EMERGENCIA|UNIDADE|CENTRO DE SAUDE|CENTRO)\s+"
NUCLEO_REMOVER = r"^(SECRETARIA (DE ESTADO )?(DA|DO|DE|DAS|DOS)?\s*|GABINETE (DO|DA)\s*)"


def fmt_reais(v: float) -> str:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return "—"
    a = abs(v)
    if a >= 1e9:
        return f"R$ {v/1e9:.2f} bi".replace(".", ",")
    if a >= 1e6:
        return f"R$ {v/1e6:.1f} mi".replace(".", ",")
    if a >= 1e3:
        return f"R$ {v/1e3:.0f} mil"
    return f"R$ {v:.2f}".replace(".", ",")


def nucleo_orgao(nome: str) -> str:
    n = re.sub(r"\s*[-–]\s*[A-Z/]{2,14}\s*$|\s*\([^)]*\)\s*$", "", norm(nome))
    return re.sub(NUCLEO_REMOVER, "", n).strip()


def area_orgao(nome: str) -> str | None:
    n = norm(nome)
    if "EDUCACAO" in n and "SUPERIOR" not in n:
        return "escola"
    if "SAUDE" in n:
        return "saude"
    return None


# ------------------------------------------------------------------ obras
def eh_obra(row, cfg) -> bool:
    el = norm(row.get("elemento", ""))
    hist = norm(row.get("historico", ""))
    if any(norm(e) in el for e in cfg["obras"]["elementos"]):
        return True
    return any(p in hist for p in cfg["obras"]["palavras"])


def chave_unidade(nome: str) -> str:
    n = norm(nome)
    for _ in range(2):
        n = re.sub(PREFIXOS_UNIDADE, "", n)
    return n.strip()


def indice_unidades(unidades: list[dict]):
    """Monta um índice nome-núcleo -> unidades (para achar a unidade citada no histórico)."""
    idx: dict[str, list[dict]] = {}
    for u in unidades:
        k = chave_unidade(u["nome"])
        if len(k) >= 8:
            idx.setdefault(k, []).append(u)
    return idx


def achar_unidade(texto: str, idx, tipo: str | None) -> dict | None:
    t = norm(texto)
    if len(t) < 8:
        return None
    candidatos = []
    for k, us in idx.items():
        if re.search(r"\b" + re.escape(k) + r"\b", t):
            for u in us:
                if tipo is None or u["tipo"] == tipo:
                    candidatos.append(u)
    if len(candidatos) == 1:
        return candidatos[0]
    if len(candidatos) > 1:  # mesmo nome em municípios diferentes: exige o município no texto
        com_mun = [u for u in candidatos if norm(u["municipio"]) and norm(u["municipio"]) in t]
        if len(com_mun) == 1:
            return com_mun[0]
    return None  # nunca adivinhar


def montar_obras(det: pd.DataFrame, orgaos: dict, idx_unid, cfg, hoje: datetime) -> list[dict]:
    if det.empty:
        return []
    mask = det.apply(lambda r: eh_obra(r, cfg), axis=1)
    o = det[mask].copy()
    if o.empty:
        return []
    o["chave"] = (o["orgao"] + "|" + o["documento"].where(o["documento"].str.len() > 0, o["favorecido"]) + "|"
                  + o["historico"].map(lambda h: norm(h)[:60]))
    obras = []
    for k, g in o.groupby("chave"):
        org = orgaos.get(g["orgao"].iloc[0])
        hist = max(g["historico"], key=len)
        area = area_orgao(g["orgao"].iloc[0])
        unid = achar_unidade(hist, idx_unid, area)
        emp, liq, pago = g["empenhado"].sum(), g["liquidado"].sum(), g["pago"].sum()
        pagos = g[g["pago"] > 0]["data"].dropna()
        ultimo_pag = pagos.max() if len(pagos) else None
        dias_sem = (hoje.replace(tzinfo=None) - ultimo_pag.to_pydatetime()).days if ultimo_pag is not None else None
        perc = (pago / emp) if emp else None
        if perc is not None and perc >= 0.98:
            st = "Concluída (100% pago)"
        elif dias_sem is not None and dias_sem > cfg["alertas"]["obra_parada_dias"] and (perc or 0) < 0.98:
            st = "Parada"
        elif emp and pago == 0 and dias_sem is None:
            st = "Sem pagamento ainda"
        elif emp:
            st = "Em andamento"
        else:
            st = "Sem informação"
        obras.append({
            "id": "obra-" + hash_curto(k),
            "orgao_id": org["id"] if org else None,
            "orgao": g["orgao"].iloc[0],
            "descricao": hist[:300] or "(sem descrição no portal)",
            "favorecido": g["favorecido"].iloc[0],
            "documento": mascarar_doc(g["documento"].iloc[0]),
            "empenhado": round(emp, 2), "liquidado": round(liq, 2), "pago": round(pago, 2),
            "percentual_pago": round(perc * 100, 1) if perc is not None else None,
            "primeira_data": _d(g["data"].min()), "ultimo_pagamento": _d(ultimo_pag),
            "dias_sem_pagamento": dias_sem,
            "status": st,
            "unidade_id": unid["id"] if unid else None,
            "unidade_nome": unid["nome"] if unid else None,
            "municipio": unid["municipio"] if unid else None,
            "registros": len(g),
            "fonte_url": g["fonte_url"].iloc[0],
        })
    return sorted(obras, key=lambda x: -x["empenhado"])


def _d(x):
    if x is None or (isinstance(x, float) and math.isnan(x)) or pd.isna(x):
        return None
    return pd.Timestamp(x).strftime("%Y-%m-%d")


# ------------------------------------------------------------------ alertas
def _alerta(tipo, sev, titulo, explicacao, orgao_id, valor=None, favorecido=None, documento=None,
            unidade_id=None, fonte_url=None, dados=None):
    return {"id": "al-" + hash_curto(f"{tipo}|{orgao_id}|{titulo}"), "tipo": tipo, "severidade": sev,
            "titulo": titulo, "explicacao": explicacao, "orgao_id": orgao_id, "valor": valor,
            "favorecido": favorecido, "documento": mascarar_doc(documento) if documento else None,
            "unidade_id": unidade_id, "fonte_url": fonte_url, "dados": dados or {}}


def gerar_alertas(det: pd.DataFrame, orgaos: dict, obras: list, cnpj: dict, sancoes: dict, cfg, forn=None) -> list[dict]:
    A = cfg["alertas"]
    al = []
    if forn is not None and not forn.empty:
        al += _alertas_fornecedores(forn, det, orgaos, cnpj, sancoes, A)
    agregado = "agregado" in det.columns and bool(det["agregado"].any()) if not det.empty else False
    if not det.empty and not agregado:
        d = det.copy()
        d["oid"] = d["orgao"].map(lambda o: orgaos[o]["id"] if o in orgaos else None)
        # 1. Possível fracionamento
        for limite, rotulo in ((A["limite_dispensa_compras"], "compras/serviços"), (A["limite_dispensa_obras"], "obras")):
            faixa = d[(d["empenhado"] >= limite * A["fracionamento_faixa_inferior"]) & (d["empenhado"] < limite)]
            for (oid, doc, fav), g in faixa.groupby(["oid", "documento", "favorecido"]):
                g = g.sort_values("data")
                if len(g) < 2:
                    continue
                datas = g["data"].dropna()
                janela = (datas.max() - datas.min()).days if len(datas) > 1 else 0
                if janela <= A["fracionamento_janela_dias"] and g["empenhado"].sum() > limite:
                    al.append(_alerta("fracionamento", "alta",
                                      f"{len(g)} empenhos logo abaixo do limite de dispensa para {fav}",
                                      f"Foram {len(g)} empenhos em {janela} dias, cada um entre "
                                      f"{int(A['fracionamento_faixa_inferior']*100)}% e 100% do limite de dispensa de {rotulo} "
                                      f"({fmt_reais(limite)}). Somados dão {fmt_reais(g['empenhado'].sum())}. Pode indicar divisão "
                                      f"de uma compra para evitar licitação — vale conferir os processos.",
                                      oid, round(g["empenhado"].sum(), 2), fav, doc, fonte_url=g["fonte_url"].iloc[0],
                                      dados={"empenhos": g["numero"].tolist()[:20], "datas": [_d(x) for x in g["data"]][:20]}))
        # 2. Concentração em um fornecedor dentro do mesmo elemento
        for (oid, el), g in d.groupby(["oid", "elemento"]):
            tot = g["empenhado"].sum()
            if tot < A["concentracao_minimo_reais"]:
                continue
            por = g.groupby(["documento", "favorecido"])["empenhado"].sum().sort_values(ascending=False)
            (doc, fav), v = por.index[0], por.iloc[0]
            if v / tot >= A["concentracao_percentual"] and len(por) > 1:
                al.append(_alerta("concentracao", "media", f"{fav} concentra {v/tot:.0%} de \"{el[:60]}\"",
                                  f"Um único fornecedor recebeu {fmt_reais(v)} de {fmt_reais(tot)} empenhados neste tipo de "
                                  f"despesa. Concentração alta merece checar se houve concorrência.",
                                  oid, round(v, 2), fav, doc, fonte_url=g["fonte_url"].iloc[0]))
        # 3. Valor fora da curva (IQR) por órgão+elemento
        for (oid, el), g in d[d["empenhado"] > 0].groupby(["oid", "elemento"]):
            if len(g) < 12:
                continue
            q1, q3 = g["empenhado"].quantile([0.25, 0.75])
            teto = q3 + A["fora_da_curva_fator_iqr"] * (q3 - q1)
            for _, r in g[(g["empenhado"] > teto) & (g["empenhado"] >= A["fora_da_curva_minimo_reais"])].nlargest(3, "empenhado").iterrows():
                al.append(_alerta("fora_da_curva", "media", f"Empenho de {fmt_reais(r['empenhado'])} muito acima do padrão",
                                  f"Em \"{el[:60]}\" o valor típico fica até {fmt_reais(q3)}. Este ficou em {fmt_reais(r['empenhado'])} "
                                  f"para {r['favorecido']}. Pode ser legítimo (compra grande), mas vale conferir o objeto.",
                                  oid, round(r["empenhado"], 2), r["favorecido"], r["documento"], fonte_url=r["fonte_url"],
                                  dados={"empenho": r["numero"], "historico": r["historico"][:200]}))
        # 4. Inconsistências
        incons = d[(d["pago"] > d["empenhado"] + 0.01) & (d["empenhado"] > 0)]
        for oid, g in incons.groupby("oid"):
            al.append(_alerta("inconsistencia", "media", f"{len(g)} registros com pago maior que empenhado",
                              "O valor pago não deveria passar do empenhado no mesmo registro. Pode ser erro do portal "
                              "ou do lançamento — pedir esclarecimento.", oid, round(g["pago"].sum(), 2),
                              fonte_url=g["fonte_url"].iloc[0]))
        sem_fav = d[(d["favorecido"].str.len() == 0) & (d["empenhado"] > 0)]
        for oid, g in sem_fav.groupby("oid"):
            al.append(_alerta("transparencia", "baixa", f"{len(g)} gastos sem favorecido informado",
                              f"Somam {fmt_reais(g['empenhado'].sum())} sem dizer quem recebeu.", oid,
                              round(g["empenhado"].sum(), 2), fonte_url=g["fonte_url"].iloc[0]))
        # 5. Pagamentos em fim de semana
        fds = d[(d["pago"] > 0) & d["data"].notna() & (d["data"].dt.dayofweek >= 5)]
        for oid, g in fds.groupby("oid"):
            if g["pago"].sum() >= 50_000:
                al.append(_alerta("data_incomum", "baixa", f"{len(g)} pagamentos registrados em sábado/domingo",
                                  f"Somam {fmt_reais(g['pago'].sum())}. Pode ser só a data de lançamento, mas é incomum.",
                                  oid, round(g["pago"].sum(), 2), fonte_url=g["fonte_url"].iloc[0]))
        # 6. Empresa nova e 7. Sancionada
        por_forn = d[d["documento"].str.len() == 14].groupby(["documento", "favorecido", "oid"])["empenhado"].sum().reset_index()
        hoje = pd.Timestamp.now()
        for _, r in por_forn.iterrows():
            info = cnpj.get(r["documento"]) or {}
            if info.get("abertura") and r["empenhado"] >= A["empresa_nova_minimo_reais"]:
                meses = (hoje - pd.Timestamp(info["abertura"])).days / 30.4
                if meses < A["empresa_nova_meses"]:
                    al.append(_alerta("empresa_nova", "media", f"{r['favorecido']} tem só {meses:.0f} meses de CNPJ",
                                      f"Aberta em {info['abertura']} e já recebeu {fmt_reais(r['empenhado'])} empenhados. "
                                      "Vale checar capacidade técnica e sede da empresa.", r["oid"], round(r["empenhado"], 2),
                                      r["favorecido"], r["documento"]))
            if sancoes.get(r["documento"]):
                s = sancoes[r["documento"]][0]
                al.append(_alerta("sancionada", "alta", f"{r['favorecido']} aparece no {s['cadastro']}",
                                  f"Empresa com registro de sanção ({s.get('tipo') or 'ver detalhes'}) aplicada por "
                                  f"{s.get('orgao') or 'órgão público'}. Recebeu {fmt_reais(r['empenhado'])} empenhados. "
                                  "Conferir se a sanção impedia contratar.", r["oid"], round(r["empenhado"], 2),
                                  r["favorecido"], r["documento"], dados={"sancoes": sancoes[r["documento"]]}))
    # 8. Obras paradas
    for o in obras:
        if o["status"] == "Parada":
            al.append(_alerta("obra_parada", "alta", f"Obra/reforma sem pagamento há {o['dias_sem_pagamento']} dias",
                              f"{o['descricao'][:160]} — {o['percentual_pago']}% pago. Verificar no local se a obra está andando.",
                              o["orgao_id"], o["empenhado"], o["favorecido"], None, o["unidade_id"], o["fonte_url"]))
    return al


def _alertas_fornecedores(forn, det, orgaos, cnpj, sancoes, A):
    """Alertas a partir de 'quanto cada fornecedor recebeu de cada órgão' (quando não há empenho a empenho)."""
    al = []
    f = forn.copy()
    f["oid"] = f["orgao"].map(lambda o: orgaos[o]["id"] if o in orgaos else None)
    tot_org = det.groupby("orgao")["empenhado"].sum() if not det.empty else f.groupby("orgao")["empenhado"].sum()
    for (orgao, oid), g in f.groupby(["orgao", "oid"]):
        total = float(tot_org.get(orgao, 0)) or float(g["empenhado"].sum())
        top = g.groupby(["documento", "favorecido"])["empenhado"].sum().sort_values(ascending=False)
        if len(top) and total >= A["concentracao_minimo_reais"]:
            (doc, fav), v = top.index[0], top.iloc[0]
            if v / total >= A["concentracao_percentual"]:
                al.append(_alerta("concentracao", "media", f"{fav} recebe {v/total:.0%} dos gastos do órgão",
                                  f"Um único favorecido tem {fmt_reais(v)} de {fmt_reais(total)} empenhados no órgão. "
                                  "Pode ser normal (ex.: repasse obrigatório), mas vale conferir o tipo de contrato.", oid, round(v, 2), fav, doc,
                                  fonte_url=g["fonte_url"].iloc[0]))
    hoje = pd.Timestamp.now()
    for (doc, fav, oid), g in f[f["documento"].str.len() == 14].groupby(["documento", "favorecido", "oid"]):
        emp = float(g["empenhado"].sum())
        info = cnpj.get(doc) or {}
        if info.get("abertura") and emp >= A["empresa_nova_minimo_reais"]:
            meses = (hoje - pd.Timestamp(info["abertura"])).days / 30.4
            if meses < A["empresa_nova_meses"]:
                al.append(_alerta("empresa_nova", "media", f"{fav} tem só {meses:.0f} meses de CNPJ",
                                  f"Aberta em {info['abertura']} e já tem {fmt_reais(emp)} empenhados neste órgão. Vale checar capacidade técnica e sede.",
                                  oid, round(emp, 2), fav, doc))
        if sancoes.get(doc):
            s0 = sancoes[doc][0]
            al.append(_alerta("sancionada", "alta", f"{fav} aparece no {s0['cadastro']}",
                              f"Empresa com sanção ({s0.get('tipo') or 'ver detalhes'}) aplicada por {s0.get('orgao') or 'órgão público'}. "
                              f"Tem {fmt_reais(emp)} empenhados neste órgão. Conferir se a sanção impedia contratar.", oid, round(emp, 2), fav, doc,
                              dados={"sancoes": sancoes[doc]}))
    return al


# ------------------------------------------------------------------ índice
def calcular_indice(orgaos: list[dict], det: pd.DataFrame, alertas: list, noticias_por_org: dict, cfg, mes: int):
    I = cfg["indice"]
    max_ent = max([len([n for n in noticias_por_org.get(o["id"], []) if n["tipo"] == "entrega"]) for o in orgaos] + [1])
    for o in orgaos:
        comp = {}
        base = o["atualizado"] or o["orcado"]
        if base:
            esperado = mes / 12
            comp["execucao"] = round(min(1.0, (o["liquidado"] / base) / esperado) * 100, 1)
        if o["liquidado"]:
            comp["ritmo_pagamento"] = round(min(1.0, o["pago"] / o["liquidado"]) * 100, 1)
        ent = len([n for n in noticias_por_org.get(o["id"], []) if n["tipo"] == "entrega"])
        comp["entregas"] = round(100 * math.log1p(ent) / math.log1p(max_ent), 1)
        if not det.empty and not ("agregado" in det.columns and det["agregado"].any()):
            g = det[det["orgao"] == o["nome_portal"]]
            if len(g):
                ok = ((g["favorecido"].str.len() > 0) & (g["historico"].str.len() > 0)).mean()
                comp["transparencia"] = round(ok * 100, 1)
        pen = sum(I["penalidade_alerta"].get(a["severidade"], 0) for a in alertas if a["orgao_id"] == o["id"])
        comp["atencao"] = max(0, 100 - pen)
        pesos = {k: v for k, v in I["pesos"].items() if k in comp}
        o["indice_componentes"] = comp
        o["nota"] = round(sum(comp[k] * p for k, p in pesos.items()) / sum(pesos.values()), 1) if pesos else None
        o["componentes_faltando"] = [k for k in I["pesos"] if k not in comp]
    com_nota = sorted([o for o in orgaos if o["nota"] is not None], key=lambda x: -x["nota"])
    for i, o in enumerate(com_nota, 1):
        o["posicao"] = i
    return orgaos


# ------------------------------------------------------------------ onde melhorar + missões
CHECKLISTS = {
    "obra": ["Fotografar a fachada e o andamento da obra (com data)", "Ver se há placa da obra com valor e prazo",
             "Perguntar à direção quando a obra começou e se parou", "Pedir cópia do contrato e da ordem de serviço",
             "Anotar quantos trabalhadores estão no local"],
    "escola": ["Fotografar banheiros, cozinha, salas e área externa", "Testar água e internet",
               "Conversar com a direção sobre as maiores necessidades", "Ver se há obra/reforma prometida e quando",
               "Conferir merenda do dia"],
    "saude": ["Fotografar recepção, leitos e equipamentos parados", "Perguntar tempo médio de espera",
              "Ver escala de profissionais e se está completa", "Conferir falta de medicamentos/insumos",
              "Ver obras ou reformas em andamento"],
    "gasto": ["Pedir à secretaria o processo completo do gasto (via e-SIC/LAI)", "Conferir se a empresa existe no endereço",
              "Comparar o preço com outras compras parecidas", "Verificar se o serviço/produto foi entregue"],
}


def missoes_e_melhorias(orgaos: list[dict], obras: list, alertas: list, unidades: list, gastos_unid: dict, mes: int):
    missoes = []
    unid_por_id = {u["id"]: u for u in unidades}
    for o in obras:
        if o["status"] in ("Parada", "Sem pagamento ainda") or (o["percentual_pago"] is not None and o["percentual_pago"] < 50
                                                                  and (o["dias_sem_pagamento"] or 0) > 60):
            u = unid_por_id.get(o["unidade_id"]) if o["unidade_id"] else None
            local = f"{u['nome']} ({u['municipio']})" if u else "local da obra"
            missoes.append({
                "id": "mi-" + o["id"], "tipo": "obra", "prioridade": "alta" if o["status"] == "Parada" else "media",
                "titulo": f"Visitar {local}: obra/reforma {o['status'].lower()}",
                "motivo": f"{o['descricao'][:180]}. Empenhado {fmt_reais(o['empenhado'])}, pago {o['percentual_pago']}%."
                          + (f" Sem pagamento há {o['dias_sem_pagamento']} dias." if o["dias_sem_pagamento"] else ""),
                "orgao_id": o["orgao_id"], "unidade_id": o["unidade_id"], "municipio": o["municipio"],
                "fonte_url": o["fonte_url"], "checklist": CHECKLISTS["obra"]})
    for a in alertas:
        if a["severidade"] == "alta" and a["tipo"] != "obra_parada":
            missoes.append({"id": "mi-" + a["id"], "tipo": "gasto", "prioridade": "alta", "titulo": "Verificar: " + a["titulo"],
                            "motivo": a["explicacao"], "orgao_id": a["orgao_id"], "unidade_id": a["unidade_id"],
                            "municipio": None, "fonte_url": a["fonte_url"], "checklist": CHECKLISTS["gasto"]})
    for u in unidades:
        if u["tipo"] == "escola" and u.get("faltando_essencial") and u.get("situacao") == "Em atividade":
            g = gastos_unid.get(u["id"], 0)
            missoes.append({"id": "mi-" + u["id"], "tipo": "escola", "prioridade": "alta" if len(u["faltando_essencial"]) >= 2 else "media",
                            "titulo": f"Visitar {u['nome']} ({u['municipio']}): falta {', '.join(u['faltando_essencial']).lower()}",
                            "motivo": f"Pelo Censo Escolar {u.get('censo_ano')}, a escola não tem: {', '.join(u['faltando_essencial'])}. "
                                      + ("Nenhum gasto ligado a ela foi encontrado neste ano." if not g else f"Gastos ligados a ela: {fmt_reais(g)}."),
                            "orgao_id": u.get("orgao_id"), "unidade_id": u["id"], "municipio": u["municipio"],
                            "fonte_url": u["fonte"], "checklist": CHECKLISTS["escola"]})
    melhorar = {}
    for o in orgaos:
        itens = []
        c = o.get("indice_componentes", {})
        if c.get("execucao") is not None and c["execucao"] < 70:
            itens.append({"titulo": "Execução abaixo do esperado",
                          "texto": f"Liquidou {c['execucao']:.0f}% do que era esperado até o mês {mes}. Dinheiro parado pode significar entregas atrasadas."})
        if c.get("ritmo_pagamento") is not None and c["ritmo_pagamento"] < 80:
            itens.append({"titulo": "Pagamentos atrasando", "texto": f"Pagou só {c['ritmo_pagamento']:.0f}% do que já foi liquidado (serviço entregue)."})
        if c.get("entregas", 100) == 0:
            itens.append({"titulo": "Sem entregas noticiadas", "texto": "Nenhuma notícia oficial de entrega/inauguração nos últimos 90 dias."})
        if c.get("transparencia") is not None and c["transparencia"] < 80:
            itens.append({"titulo": "Dados incompletos", "texto": f"Só {c['transparencia']:.0f}% dos gastos têm favorecido e descrição preenchidos."})
        n_par = len([x for x in obras if x["orgao_id"] == o["id"] and x["status"] == "Parada"])
        if n_par:
            itens.append({"titulo": f"{n_par} obra(s)/reforma(s) parada(s)", "texto": "Sem pagamento há mais de 90 dias."})
        n_alta = len([a for a in alertas if a["orgao_id"] == o["id"] and a["severidade"] == "alta"])
        if n_alta:
            itens.append({"titulo": f"{n_alta} alerta(s) de prioridade alta", "texto": "Ver o botão Alertas."})
        melhorar[o["id"]] = itens
    return missoes, melhorar
