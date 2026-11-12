"""Unidades na ponta: unidades de saúde (CNES) e escolas estaduais (INEP/Censo Escolar)."""
from __future__ import annotations

import io
import zipfile

from ..util import BRUTOS, Http, StatusFonte, log, nome_bonito, norm, slug

# Campos possíveis na API do CNES (variam conforme a versão da API).
C_CNES = ["codigo_cnes", "co_cnes", "cnes"]
C_NOME = ["nome_fantasia", "no_fantasia", "nome_razao_social"]
C_RAZAO = ["nome_razao_social", "no_razao_social"]
C_MUN = ["codigo_municipio", "co_municipio_gestor", "co_ibge"]
C_LAT = ["latitude_estabelecimento_decimo_grau", "nu_latitude", "latitude"]
C_LON = ["longitude_estabelecimento_decimo_grau", "nu_longitude", "longitude"]
C_TIPO = ["descricao_tipo_unidade", "ds_tipo_unidade", "codigo_tipo_unidade"]
C_GESTAO = ["tipo_gestao", "tp_gestao", "codigo_esfera_administrativa", "descricao_esfera_administrativa"]


def _pega(d: dict, campos):
    for c in campos:
        if d.get(c) not in (None, ""):
            return d[c]
    return None


def municipios(cfg, http: Http) -> dict[str, str]:
    """Mapa código IBGE (6 e 7 dígitos) -> nome do município."""
    try:
        r = http.get(cfg["ibge_municipios"])
        r.raise_for_status()
        m = {}
        for item in r.json():
            cod = str(item["id"])
            m[cod] = item["nome"]
            m[cod[:6]] = item["nome"]
        return m
    except Exception as e:  # noqa: BLE001
        log.warning("IBGE falhou: %s", e)
        return {}


def _pertence(d: dict, esf: dict) -> bool:
    sc = esf["saude"]
    g = norm(_pega(d, C_GESTAO) or "")
    razao = norm(_pega(d, C_RAZAO) or "")
    cm = str(_pega(d, C_MUN) or "")
    if sc.get("municipio_ibge") and cm[:6] != str(sc["municipio_ibge"])[:6]:
        return False
    if any(norm(r) in razao for r in sc.get("razao_contem", [])):
        return True
    if sc["filtro"] == "estadual":
        return g in {"E", "ESTADUAL", "2"} or "ESTADUAL" in g
    return g in {"M", "MUNICIPAL", "3"} or "MUNICIPAL" in g


_CACHE_CNES: list | None = None


def _todos_cnes(cfg, http: Http):
    global _CACHE_CNES
    if _CACHE_CNES is not None:
        return _CACHE_CNES
    itens_todos, offset, lote = [], 0, 20
    while offset <= 30000:
        r = http.get(cfg["cnes"]["base"], params={"codigo_uf": cfg["cnes"]["uf_codigo"], "limit": lote, "offset": offset})
        r.raise_for_status()
        j = r.json()
        itens = j.get("estabelecimentos") or j.get("data") or (j if isinstance(j, list) else [])
        if not itens:
            break
        itens_todos += itens
        offset += lote
    _CACHE_CNES = itens_todos
    return itens_todos


def saude(cfg, http: Http, mun: dict, esf: dict):
    status = StatusFonte("CNES — unidades de saúde", cfg["cnes"]["base"])
    unidades = []
    try:
        for d in _todos_cnes(cfg, http):
            if not _pertence(d, esf):
                continue
            cod = str(_pega(d, C_CNES) or "")
            nome = _pega(d, C_NOME) or _pega(d, C_RAZAO) or f"CNES {cod}"
            cm = str(_pega(d, C_MUN) or "")
            unidades.append({
                "id": f"saude-{cod or slug(nome)}",
                "tipo": "saude",
                "codigo": cod,
                "nome": nome_bonito(str(nome)),
                "subtipo": str(_pega(d, C_TIPO) or ""),
                "municipio": mun.get(cm, mun.get(cm[:6], cm)),
                "lat": _num(_pega(d, C_LAT)),
                "lon": _num(_pega(d, C_LON)),
                "indicadores": {k: v for k, v in d.items()
                                if k.startswith(("estabelecimento_possui", "quantidade_", "descricao_turno"))},
                "fonte": f"https://cnes.datasus.gov.br/pages/estabelecimentos/ficha/index.jsp?coUnidade={cm[:6]}{cod}",
            })
        status.status = "ok" if unidades else "parcial"
        status.registros = len(unidades)
        status.observacao = f"{len(unidades)} unidades de saúde ({esf['saude']['filtro']})"
    except Exception as e:  # noqa: BLE001
        status.status = "erro" if not unidades else "parcial"
        status.registros = len(unidades)
        status.observacao = f"{type(e).__name__}: {e}"[:400]
    return status, unidades


def _num(v):
    try:
        x = float(str(v).replace(",", "."))
        return x if x != 0 else None
    except (TypeError, ValueError):
        return None


# Indicadores do Censo Escolar mostrados na ficha da escola.
INFRA = {
    "IN_AGUA_POTAVEL": "Água potável", "IN_ENERGIA_REDE_PUBLICA": "Energia da rede pública",
    "IN_ESGOTO_REDE_PUBLICA": "Esgoto da rede pública", "IN_INTERNET": "Internet",
    "IN_BANDA_LARGA": "Banda larga", "IN_BIBLIOTECA": "Biblioteca", "IN_LABORATORIO_CIENCIAS": "Laboratório de ciências",
    "IN_LABORATORIO_INFORMATICA": "Laboratório de informática", "IN_QUADRA_ESPORTES": "Quadra de esportes",
    "IN_QUADRA_ESPORTES_COBERTA": "Quadra coberta", "IN_REFEITORIO": "Refeitório", "IN_COZINHA": "Cozinha",
    "IN_BANHEIRO": "Banheiro", "IN_BANHEIRO_PNE": "Banheiro acessível", "IN_ACESSIBILIDADE_RAMPAS": "Rampas de acessibilidade",
    "IN_SALA_ATENDIMENTO_ESPECIAL": "Sala de atendimento especial", "IN_ALIMENTACAO": "Oferece alimentação",
}
ESSENCIAIS = ["IN_AGUA_POTAVEL", "IN_ENERGIA_REDE_PUBLICA", "IN_BANHEIRO", "IN_COZINHA", "IN_INTERNET"]


_CACHE_INEP: tuple | None = None


def _censo_al(cfg, http: Http, ano: int):
    """Baixa o Censo Escolar mais recente e guarda só as escolas de Alagoas (uma vez por execução)."""
    global _CACHE_INEP
    if _CACHE_INEP is not None:
        return _CACHE_INEP
    import pandas as pd

    icfg = cfg["inep"]
    erro = ""
    for a in range(ano - 1, ano - 1 - icfg["anos_para_tentar"], -1):
        url = icfg["url_modelo"].format(ano=a)
        try:
            r = http.get(url, timeout=600, stream=True)
            if r.status_code != 200:
                continue
            conteudo = r.content
            (BRUTOS / "inep").mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(io.BytesIO(conteudo)) as z:
                alvo = next((n for n in z.namelist()
                             if "ed_basica" in n.lower() and n.lower().endswith(".csv")), None)
                if not alvo:
                    continue
                pedacos = []
                with z.open(alvo) as f:
                    for ch in pd.read_csv(io.TextIOWrapper(f, encoding="latin-1"), sep=";", dtype=str,
                                          chunksize=50_000, low_memory=False):
                        pedacos.append(ch[ch.get("SG_UF") == "AL"])
            _CACHE_INEP = (a, url, pd.concat(pedacos))
            return _CACHE_INEP
        except Exception as e:  # noqa: BLE001
            erro = f"{a}: {type(e).__name__}: {e}"[:400]
            log.warning("INEP %s falhou: %s", a, e)
    _CACHE_INEP = (None, None, erro)
    return _CACHE_INEP


def escolas(cfg, http: Http, ano: int, esf: dict):
    import pandas as pd

    rede = "estadual" if esf["escolas"]["dependencia"] == "2" else "municipal"
    status = StatusFonte(f"INEP — Censo Escolar (rede {rede})", "https://www.gov.br/inep")
    try:
        a, url, df = _censo_al(cfg, http, ano)
        if a is None:
            status.status = "erro"
            status.observacao = str(df)
            return status, []
        df = df[df.get("TP_DEPENDENCIA") == esf["escolas"]["dependencia"]]
        if esf["escolas"].get("municipio_ibge"):
            df = df[df.get("CO_MUNICIPIO") == str(esf["escolas"]["municipio_ibge"])]
        lista = []
        for _, l in df.iterrows():
            cod = l.get("CO_ENTIDADE")
            infra = {rotulo: (l.get(c) == "1") for c, rotulo in INFRA.items() if c in l and pd.notna(l.get(c))}
            faltando = [INFRA[c] for c in ESSENCIAIS if c in l and l.get(c) == "0"]
            lista.append({
                "id": f"escola-{cod}",
                "tipo": "escola",
                "codigo": cod,
                "nome": nome_bonito(str(l.get("NO_ENTIDADE", ""))),
                "subtipo": f"Escola {rede}",
                "municipio": str(l.get("NO_MUNICIPIO", "")),
                "lat": None, "lon": None,
                "situacao": {"1": "Em atividade", "2": "Paralisada", "3": "Extinta"}.get(l.get("TP_SITUACAO_FUNCIONAMENTO"), ""),
                "matriculas": _int(l.get("QT_MAT_BAS")),
                "infraestrutura": infra,
                "faltando_essencial": faltando,
                "censo_ano": a,
                "fonte": f"https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-escolar",
            })
        status.status = "ok"
        status.registros = len(lista)
        status.observacao = f"Censo Escolar {a}: {len(lista)} escolas da rede {rede}"
        status.url = url
    except Exception as e:  # noqa: BLE001
        status.status = "erro"
        status.observacao = f"{type(e).__name__}: {e}"[:400]
        return status, []
    return status, lista


def _int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None
