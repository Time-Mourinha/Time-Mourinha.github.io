"""Na mídia: notícias NEGATIVAS das últimas 72 horas sobre cada secretaria (imprensa em geral).

Roda sozinho 3 vezes por dia (workflow "Notícias da mídia") e também no fim da coleta diária.
Fonte: busca do Google Notícias (RSS), uma busca por secretaria/tema de cada esfera.
Notícias de sites oficiais do governo ficam de fora (essas já aparecem em "Entregas").
Uso: python -m coletor.midia
"""
from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET
from datetime import timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus, urlparse

import yaml

from .processa.analise import nucleo_orgao
from .util import SAIDA, Http, agora, agora_iso, hash_curto, ler_json, log, norm, salvar_json, slug

HORAS = 72
# Palavras que indicam problema. Cada uma que aparece no título/resumo vira um "motivo".
NEGATIVAS = {
    "FALTA": "falta", "FALTAM": "falta", "SEM AGUA": "sem água", "SEM ENERGIA": "sem energia", "SEM MEDICO": "sem médico",
    "SEM PROFESSOR": "sem professor", "SEM AULA": "sem aula", "DENUNCI": "denúncia", "RECLAM": "reclamação",
    "ATRASO": "atraso", "ATRASAD": "atraso", "FILA": "fila", "SUPERLOT": "superlotação", "PRECARI": "precariedade",
    "PRECARIA": "precariedade", "ABANDON": "abandono", "DESCASO": "descaso", "INTERDIT": "interdição", "GREVE": "greve",
    "PARALIS": "paralisação", "PARADA": "obra parada", "QUEBRAD": "quebrado", "DANIFICAD": "danificado",
    "DESAB": "desabamento", "INFILTRA": "infiltração", "GOTEIRA": "goteira", "ALAGAMENTO": "alagamento",
    "BURACO": "buraco", "ESGOTO": "esgoto", "LIXO": "lixo", "RATO": "ratos", "MOFO": "mofo",
    "IRREGULAR": "irregularidade", "INVESTIGA": "investigação", "MINISTERIO PUBLICO": "Ministério Público",
    "MPAL": "Ministério Público", "MPF": "Ministério Público", "MP-AL": "Ministério Público", "TCE": "Tribunal de Contas",
    "CPI": "CPI", "OPERACAO": "operação policial", "POLICIA FEDERAL": "Polícia Federal", "PRESO": "prisão",
    "AFASTAD": "afastamento", "SUPERFATUR": "superfaturamento", "FRAUDE": "suspeita de fraude", "DESVIO": "suspeita de desvio",
    "PROPINA": "propina", "MORTE": "morte", "MORRE": "morte", "MORREU": "morte", "OBITO": "óbito", "CRISE": "crise",
    "CAOS": "caos", "PROTESTO": "protesto", "MANIFESTA": "protesto", "CALOTE": "calote", "SALARIO": "salários",
    "SUSPEN": "suspensão", "CANCELAD": "cancelamento", "DESPERDICIO": "desperdício", "CRITIC": "crítica",
    "NEGLIGENC": "negligência", "INSEGURANCA": "insegurança", "VIOLENCIA": "violência", "ESCASSEZ": "escassez",
    "DESABASTEC": "desabastecimento", "SUCATEAD": "sucateamento", "VAZAMENTO": "vazamento", "ACIDENTE": "acidente",
    "PROCESSAD": "processo", "CONDENAD": "condenação", "MULTAD": "multa", "PREJUIZO": "prejuízo", "POLEMIC": "polêmica",
}
# Frases que costumam ser boas notícias mesmo contendo uma palavra da lista acima.
POSITIVAS = ["ACABA COM A FILA", "ZERA A FILA", "REDUZ FILA", "FIM DA GREVE", "ENCERRA GREVE", "COMBATE A FALTA",
             "INAUGURA", "ENTREGA", "SALARIO EM DIA", "PAGA SALARIO", "ANTECIPA SALARIO"]
OFICIAIS = ("agenciaalagoas.al.gov.br", "al.gov.br", "maceio.al.gov.br")


def _carregar_esferas():
    from pathlib import Path
    cfg = yaml.safe_load((Path(__file__).parent / "config" / "geral.yaml").read_text(encoding="utf-8"))
    return cfg["esferas"]


def _temas(esf: dict) -> list[dict]:
    """Usa as secretarias reais coletadas do portal; enquanto não houver, usa os temas da configuração."""
    orgaos = ler_json(SAIDA / esf["id"] / "orgaos.json", []) or []
    temas = []
    for o in orgaos:
        nucleo = o.get("nucleo") or nucleo_orgao(o.get("nome_portal") or o.get("nome", ""))
        if len(nucleo) >= 4:
            temas.append({"id": o["id"], "nome": o.get("sigla") or o["nome"], "termo": nucleo.title(), "sigla": o.get("sigla", ""), "tem_pagina": True})
    if not temas:
        for t in esf.get("temas_midia", []):
            temas.append({"id": slug(t), "nome": t, "termo": t, "sigla": "", "tem_pagina": False})
    return temas


def _palavras_negativas(texto: str) -> list[str]:
    t = f" {norm(texto)} "
    if any(p in t for p in POSITIVAS):
        return []
    achados = []
    for chave, rotulo in NEGATIVAS.items():
        if re.search(r"\b" + re.escape(chave), t) and rotulo not in achados:
            achados.append(rotulo)
    return achados


def _contexto_ok(esf: dict, texto: str) -> bool:
    t = norm(texto)
    if esf["tipo"] == "municipio":
        return "MACEIO" in t
    return any(p in t for p in ("ALAGOAS", "ESTADUAL", "GOVERNO DO ESTADO", "ESTADO"))


def buscar(esf: dict, http: Http) -> list[dict]:
    limite = agora() - timedelta(hours=HORAS)
    contexto = '"Maceió"' if esf["tipo"] == "municipio" else '"Alagoas"'
    temas = _temas(esf)
    itens: dict[str, dict] = {}
    for tema in temas:
        termos = f'"{tema["termo"]}"' + (f' OR "{tema["sigla"]}"' if len(tema["sigla"]) >= 4 else "")
        q = f"({termos}) {contexto} when:3d"
        url = f"https://news.google.com/rss/search?q={quote_plus(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419"
        try:
            r = http.get(url)
            if r.status_code != 200:
                continue
            raiz = ET.fromstring(r.content)
        except Exception as e:  # noqa: BLE001
            log.warning("mídia %s/%s: %s", esf["id"], tema["nome"], e)
            continue
        for it in raiz.iter("item"):
            titulo = (it.findtext("title") or "").strip()
            fonte_el = it.find("source")
            fonte = (fonte_el.text or "").strip() if fonte_el is not None else ""
            fonte_url = fonte_el.get("url", "") if fonte_el is not None else ""
            if fonte and titulo.endswith(" - " + fonte):
                titulo = titulo[: -len(fonte) - 3]
            if any(urlparse(fonte_url).netloc.endswith(d) for d in OFICIAIS):
                continue  # site oficial: não é "mídia"
            try:
                data = parsedate_to_datetime(it.findtext("pubDate") or "")
            except (TypeError, ValueError):
                continue
            if data < limite:
                continue
            resumo = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", it.findtext("description") or "")).strip()
            texto = f"{titulo} {resumo}"
            motivos = _palavras_negativas(texto)
            if not motivos or not _contexto_ok(esf, texto + " " + tema["termo"]):
                continue
            chave = hash_curto(norm(titulo)[:120])
            item = itens.setdefault(chave, {
                "id": chave, "titulo": titulo, "link": (it.findtext("link") or "").strip(), "fonte": fonte,
                "data": data.isoformat(), "motivos": motivos, "orgaos": [], "temas": [],
            })
            if tema["tem_pagina"] and tema["id"] not in item["orgaos"]:
                item["orgaos"].append(tema["id"])
            if tema["nome"] not in item["temas"]:
                item["temas"].append(tema["nome"])
    return sorted(itens.values(), key=lambda x: x["data"], reverse=True)


def rodar() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    http = Http(intervalo=1.0)
    for esf in _carregar_esferas():
        try:
            itens = buscar(esf, http)
            salvar_json(SAIDA / esf["id"] / "midia.json", {"atualizado_em": agora_iso(), "horas": HORAS, "itens": itens})
            log.info("Mídia %s: %d notícias negativas nas últimas %dh", esf["id"], len(itens), HORAS)
        except Exception:  # noqa: BLE001
            log.exception("mídia %s falhou", esf["id"])
    return 0


if __name__ == "__main__":
    raise SystemExit(rodar())
