"""Configura o Supabase do Time Mourinha pela API de gerenciamento (roda no GitHub Actions).

Precisa só do segredo SUPABASE_ACCESS_TOKEN (token pessoal do Supabase).
- aplica docs/supabase.sql (banco, regras de segurança, Storage, tempo real);
- ajusta o login: entra sem confirmar e-mail (a aprovação é do administrador) e define o endereço do site;
- as funções ponte e whatsapp são publicadas no passo seguinte do workflow (CLI do Supabase).

Também serve para os outros workflows buscarem as chaves na hora:  python notificacoes/supabase_setup.py chaves
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import sys

import requests

RAIZ = pathlib.Path(__file__).resolve().parent.parent
API = "https://api.supabase.com/v1"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
SITE = os.environ.get("SITE_URL", "https://time-mourinha.github.io")


def ref() -> str:
    cfg = (RAIZ / "site/js/config.js").read_text(encoding="utf-8")
    m = re.search(r"https://([a-z0-9]+)\.supabase\.co", cfg)
    if not m:
        sys.exit("SUPABASE_URL não está em site/js/config.js")
    return m.group(1)


def api(metodo: str, caminho: str, **kw):
    r = requests.request(metodo, f"{API}{caminho}", headers={"Authorization": f"Bearer {TOKEN}"}, timeout=120, **kw)
    if r.status_code >= 300:
        raise RuntimeError(f"{metodo} {caminho}: {r.status_code} {r.text[:500]}")
    return r.json() if r.text.strip() else None


def chaves() -> dict:
    """Devolve {'publica': chave anon/publishable, 'servico': chave service_role/secret}."""
    lista = api("GET", f"/projects/{ref()}/api-keys", params={"reveal": "true"})
    nome = {k.get("name"): k.get("api_key") for k in lista if k.get("api_key")}
    tipo = {}
    for k in lista:
        if k.get("api_key"):
            tipo.setdefault(k.get("type"), k["api_key"])
    return {"publica": nome.get("anon") or tipo.get("publishable"), "servico": nome.get("service_role") or tipo.get("secret")}


def chave_ponte(servico: str) -> str:
    """Senha da ponte, derivada da chave de serviço (a mesma conta é feita aqui e na coleta)."""
    import hashlib
    return hashlib.sha256(f"{servico}|ponte-time-mourinha".encode()).hexdigest()


def aplicar_sql():
    sql = (RAIZ / "docs/supabase.sql").read_text(encoding="utf-8")
    api("POST", f"/projects/{ref()}/database/query", json={"query": sql})
    print("Banco aplicado: tabelas, regras de segurança, Storage e tempo real.")


def ajustar_login():
    api("PATCH", f"/projects/{ref()}/config/auth", json={
        "site_url": SITE,
        "uri_allow_list": f"{SITE}/**,{SITE}",
        "mailer_autoconfirm": True,   # entra direto; quem libera o acesso é o administrador do time
        "external_email_enabled": True,
    })
    print("Login ajustado: cadastro por e-mail e senha, sem confirmação; endereço do site:", SITE)


def exportar_para_github():
    """Escreve as chaves no ambiente do passo atual do GitHub Actions, mascaradas no log."""
    c = chaves()
    destino = os.environ.get("GITHUB_ENV")
    for nome, valor in (("SUPABASE_ANON_KEY", c["publica"]), ("SUPABASE_SERVICE_KEY", c["servico"])):
        if not valor:
            continue
        print(f"::add-mask::{valor}")
        if destino:
            with open(destino, "a", encoding="utf-8") as f:
                f.write(f"{nome}={valor}\n")
    if destino:
        with open(destino, "a", encoding="utf-8") as f:
            f.write(f"SUPABASE_URL=https://{ref()}.supabase.co\nPONTE_URL=https://{ref()}.supabase.co/functions/v1/ponte\n")
            if c["servico"]:
                print(f"::add-mask::{chave_ponte(c['servico'])}")
                f.write(f"PONTE_CHAVE={chave_ponte(c['servico'])}\nPONTE_ANON={c['publica'] or ''}\nSUPABASE_REF={ref()}\n")


if __name__ == "__main__":
    if not TOKEN:
        print("SUPABASE_ACCESS_TOKEN não configurado; nada a fazer.")
        sys.exit(0)
    acao = sys.argv[1] if len(sys.argv) > 1 else "tudo"
    if acao == "chaves":
        exportar_para_github()
    else:
        aplicar_sql()
        ajustar_login()
        exportar_para_github()
