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


def chave_enviar(servico: str) -> str:
    """Senha que o relógio do banco usa para chamar a função que envia os lembretes."""
    import hashlib
    return hashlib.sha256(f"{servico}|enviar-time-mourinha".encode()).hexdigest()


def instalar_relogio():
    """A cada 5 minutos o banco chama a função 'enviar', que manda os lembretes programados."""
    c = chaves()
    if not c["servico"]:
        print("Sem chave de serviço; relógio dos lembretes não instalado.")
        return
    url = f"https://{ref()}.supabase.co/functions/v1/enviar"
    cab = json.dumps({"Content-Type": "application/json", "x-chave": chave_enviar(c["servico"])})
    sql = f"""
select cron.unschedule(jobid) from cron.job where jobname = 'tm-lembretes';
select cron.schedule('tm-lembretes', '*/5 * * * *',
  $job$select net.http_post(url := '{url}', headers := '{cab}'::jsonb, body := '{{"acao":"processar"}}'::jsonb)$job$);
"""
    api("POST", f"/projects/{ref()}/database/query", json={"query": sql})
    print("Relógio dos lembretes instalado (a cada 5 minutos).")


def conferir_dono():
    """Mostra só os 8 primeiros caracteres do resumo sha256 do e-mail do dono (não dá para descobrir o e-mail)."""
    r = api("POST", f"/projects/{ref()}/database/query", json={"query":
        "select left(encode(sha256(lower(email)::bytea),'hex'), 8) as h, telefone is not null as tem_tel from public.perfis where papel = 'dono'"})
    for linha in r or []:
        print("Dono: resumo do e-mail", linha["h"], "| WhatsApp no perfil:", "sim" if linha["tem_tel"] else "não")


def resumo_time():
    """Mostra no log quantos cadastros há em cada papel (sem nomes nem e-mails)."""
    r = api("POST", f"/projects/{ref()}/database/query", json={"query":
        "select papel, count(*) as n, string_agg(coalesce(membro_id,'outro'), ',' order by membro_id) as quem from public.perfis group by papel order by papel"})
    for linha in r or []:
        print(f"Cadastros {linha['papel']}: {linha['n']} ({linha['quem']})")


def ajustar_login():
    api("PATCH", f"/projects/{ref()}/config/auth", json={
        "site_url": SITE,
        "uri_allow_list": f"{SITE}/**,{SITE}",
        "mailer_autoconfirm": True,   # entra direto; quem libera o acesso é o administrador do time
        "external_email_enabled": True,
        # código de segurança do dono e dos administradores (6 dígitos, vale 10 minutos)
        "mailer_otp_length": 6,
        "mailer_otp_exp": 600,
        "mailer_subjects_magic_link": "Seu código de segurança do Time Mourinha",
        "mailer_templates_magic_link_content": (
            "<div style='font-family:Arial,sans-serif;max-width:480px;margin:auto'>"
            "<h2 style='color:#0A2F6B'>Time Mourinha</h2>"
            "<p>Seu código de segurança para entrar:</p>"
            "<p style='font-size:34px;font-weight:bold;letter-spacing:8px;color:#FF6A13'>{{ .Token }}</p>"
            "<p>Ele vale por 10 minutos. Se não foi você que tentou entrar, ignore este e-mail e troque sua senha.</p></div>"),
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
                print(f"::add-mask::{chave_enviar(c['servico'])}")
                f.write(f"ENVIAR_CHAVE={chave_enviar(c['servico'])}\n")
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
        instalar_relogio()
        resumo_time()
        conferir_dono()
        exportar_para_github()
