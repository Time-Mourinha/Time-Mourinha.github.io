"""Funções de apoio usadas por todo o coletor."""
from __future__ import annotations

import hashlib
import io
import json
import logging
import re
import time
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

RAIZ = Path(__file__).resolve().parent.parent
BRUTOS = RAIZ / "dados" / "brutos"
AMOSTRAS = RAIZ / "dados" / "amostras"
SAIDA = RAIZ / "site" / "dados"
DOCS = RAIZ / "docs"

FUSO_MACEIO = timezone(timedelta(hours=-3))
UA = "TimeMourinha/1.0 (monitor de gestao publica; contato via GitHub)"

log = logging.getLogger("mourinha")


def agora() -> datetime:
    return datetime.now(FUSO_MACEIO)


def agora_iso() -> str:
    return agora().isoformat(timespec="seconds")


# ---------------------------------------------------------------- texto
def sem_acento(txt: str) -> str:
    if txt is None:
        return ""
    txt = unicodedata.normalize("NFKD", str(txt))
    return "".join(c for c in txt if not unicodedata.combining(c))


def norm(txt) -> str:
    """Maiúsculas, sem acento, espaços simples."""
    return re.sub(r"\s+", " ", sem_acento(txt).upper()).strip()


def slug(txt: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", sem_acento(txt).lower()).strip("-")
    return s[:60] or "sem-nome"


def so_digitos(txt) -> str:
    return re.sub(r"\D", "", str(txt or ""))


def valor_br(v) -> float | None:
    """Converte '1.234,56', 'R$ 1.234,56', 1234.56 em float."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("R$", "").replace(" ", "")
    if not s or s in {"-", "--"}:
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        x = float(s)
    except ValueError:
        return None
    return -x if neg else x


def mascarar_doc(doc: str) -> str:
    """CNPJ fica completo (é público). CPF é mascarado: ***.123.456-**."""
    d = so_digitos(doc)
    if len(d) == 11:
        return f"***.{d[3:6]}.{d[6:9]}-**"
    if len(d) == 14:
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    return str(doc or "")


def hash_curto(txt: str) -> str:
    return hashlib.sha1(txt.encode()).hexdigest()[:12]


# ---------------------------------------------------------------- http
# Sites do governo que só respondem para acessos de dentro do Brasil. Quando a "ponte"
# (função no Supabase em São Paulo) está configurada, os pedidos a esses sites passam por ela.
HOSTS_PONTE = ("al.gov.br", "ibge.gov.br", "inep.gov.br", "saude.gov.br")
# Sites com certificado da cadeia ICP-Brasil, que não vem instalada no Linux do GitHub.
HOSTS_SEM_CADEIA = ("download.inep.gov.br",)


def precisa_ponte(url: str) -> bool:
    import os
    from urllib.parse import urlparse
    host = urlparse(url).netloc
    return bool(os.environ.get("PONTE_URL")) and any(host == h or host.endswith("." + h) for h in HOSTS_PONTE)


class Http:
    """Sessão HTTP educada: no máximo 1 requisição por segundo por padrão."""

    def __init__(self, intervalo: float = 1.0, timeout: int = 90):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = UA
        self.intervalo = intervalo
        self.timeout = timeout
        self._ultimo = 0.0

    def _pedido(self, url, kw):
        import os
        from urllib.parse import urlparse
        if precisa_ponte(url):
            params = kw.pop("params", None)
            if params:
                url = requests.Request("GET", url, params=params).prepare().url
            kw["headers"] = {**kw.get("headers", {}), "x-chave": os.environ.get("PONTE_CHAVE", ""),
                             "x-region": "sa-east-1", "Authorization": f"Bearer {os.environ.get('PONTE_ANON', '')}"}
            return self.s.get(os.environ["PONTE_URL"], params={"url": url}, **kw)
        if urlparse(url).netloc in HOSTS_SEM_CADEIA:
            import urllib3
            urllib3.disable_warnings()
            kw.setdefault("verify", False)  # dado público; só falta a cadeia ICP-Brasil no servidor
        return self.s.get(url, **kw)

    def get(self, url, **kw) -> requests.Response:
        espera = self.intervalo - (time.time() - self._ultimo)
        if espera > 0:
            time.sleep(espera)
        kw.setdefault("timeout", (15, self.timeout))  # 15 s para conectar; site que não atende não trava a coleta
        ultimo_erro = None
        for tentativa in range(2):
            try:
                r = self._pedido(url, dict(kw))
                self._ultimo = time.time()
                if r.status_code in (429, 502, 503, 504):
                    time.sleep(5 * (tentativa + 1))
                    continue
                return r
            except requests.RequestException as e:
                ultimo_erro = e
                log.warning("Falha em %s (%s), tentativa %d", url, str(e)[:160], tentativa + 1)
                time.sleep(3)
        if ultimo_erro:
            raise ultimo_erro
        return r


# ---------------------------------------------------------------- arquivos
def salvar_json(caminho: Path, dados, compacto: bool = True) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        if compacto:
            json.dump(dados, f, ensure_ascii=False, separators=(",", ":"), default=str)
        else:
            json.dump(dados, f, ensure_ascii=False, indent=2, default=str)


def ler_json(caminho: Path, padrao=None):
    try:
        with open(caminho, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return padrao


def ler_tabela_bytes(conteudo: bytes, nome: str):
    """Lê CSV/TXT/XLSX/JSON em DataFrame tentando separadores e codificações."""
    import pandas as pd

    nome_l = nome.lower()
    if nome_l.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(conteudo), dtype=str)
    if nome_l.endswith(".json"):
        dados = json.loads(conteudo.decode("utf-8", errors="replace"))
        lista = achar_lista_registros(dados)
        return pd.DataFrame(lista) if lista else pd.DataFrame()
    for cod in ("utf-8-sig", "latin-1"):
        try:
            texto = conteudo.decode(cod)
            break
        except UnicodeDecodeError:
            continue
    amostra = texto[:5000]
    sep = max([";", ",", "|", "\t"], key=amostra.count)
    return pd.read_csv(io.StringIO(texto), sep=sep, dtype=str, on_bad_lines="skip")


def achar_lista_registros(obj, minimo: int = 1):
    """Procura, dentro de um JSON qualquer, a maior lista de dicionários."""
    melhor: list = []

    def visita(o):
        nonlocal melhor
        if isinstance(o, list):
            if o and all(isinstance(i, dict) for i in o[:20]) and len(o) > len(melhor):
                melhor = o
            for i in o[:50]:
                visita(i)
        elif isinstance(o, dict):
            for v in o.values():
                visita(v)

    visita(obj)
    return melhor if len(melhor) >= minimo else []


@dataclass
class StatusFonte:
    nome: str
    url: str
    status: str = "nao_executada"  # ok | parcial | erro | sem_chave | nao_executada
    registros: int = 0
    observacao: str = ""
    coletado_em: str = field(default_factory=agora_iso)

    def como_dict(self):
        return self.__dict__.copy()


MINUSCULAS = {"de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "a", "o", "para", "com"}
SIGLAS_FIXAS = {"UPA", "UBS", "CAPS", "SUS", "PM", "AL", "SAMU", "USF", "CRAS", "CREAS", "EJA", "ETI", "II", "III", "IV"}


def nome_bonito(txt: str) -> str:
    """'SECRETARIA DE ESTADO DA EDUCAÇÃO - SEDUC' -> 'Secretaria de Estado da Educação - SEDUC'."""
    if not txt:
        return ""
    s = str(txt).strip()
    partes = re.split(r"(\s*[-–]\s*)", s)
    saida = []
    for i, p in enumerate(partes):
        if re.fullmatch(r"\s*[-–]\s*", p):
            saida.append(" - ")
            continue
        if i > 0 and re.fullmatch(r"[A-ZÀ-Ú/]{2,12}", p.strip()):  # sigla depois do traço
            saida.append(p.strip())
            continue
        palavras = []
        for j, w in enumerate(p.split()):
            wl = w.lower()
            if w.upper() in SIGLAS_FIXAS:
                palavras.append(w.upper())
            elif j > 0 and wl in MINUSCULAS:
                palavras.append(wl)
            else:
                palavras.append(wl[:1].upper() + wl[1:])
        saida.append(" ".join(palavras))
    return "".join(saida)
