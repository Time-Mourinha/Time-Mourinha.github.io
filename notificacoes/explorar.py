"""Busca as URLs de docs/explorar.txt (pela ponte quando preciso) e salva em docs/explorar/. Só diagnóstico."""
import pathlib
import re

from coletor.util import Http, hash_curto

RAIZ = pathlib.Path(__file__).resolve().parent.parent
http = Http(intervalo=1.0)
saida = RAIZ / "docs" / "explorar"
saida.mkdir(parents=True, exist_ok=True)
for linha in (RAIZ / "docs" / "explorar.txt").read_text().splitlines():
    url = linha.strip()
    if not url or url.startswith("#"):
        continue
    nome = re.sub(r"[^a-z0-9]+", "-", url.lower().split("//", 1)[-1])[:90] + "-" + hash_curto(url)
    try:
        r = http.get(url)
        ext = "json" if "json" in r.headers.get("content-type", "") else "html"
        (saida / f"{nome}.{ext}").write_bytes(r.content[:2_000_000])
        print("OK", r.status_code, len(r.content), url)
    except Exception as e:  # noqa: BLE001
        (saida / f"{nome}.erro.txt").write_text(str(e))
        print("ERRO", url, e)
