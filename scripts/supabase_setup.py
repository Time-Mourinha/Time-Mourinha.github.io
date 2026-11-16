"""Configura o Supabase das Vistorias pela API de gerenciamento (roda no GitHub Actions).

Precisa só do segredo SUPABASE_ACCESS_TOKEN.
  python scripts/supabase_setup.py          → limpa o projeto antigo (se houver), aplica schema.sql + seed.sql e ajusta o login
  python scripts/supabase_setup.py chaves   → grava VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no ambiente do Actions

Nenhum e-mail, telefone ou chave secreta é gravado no repositório nem impresso no log.
"""
from __future__ import annotations

import os
import pathlib
import sys
import time

import requests

RAIZ = pathlib.Path(__file__).resolve().parent.parent
API = "https://api.supabase.com/v1"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
REF = os.environ.get("SUPABASE_REF") or "apqkewsdzwawtiajbmyl"
URL = f"https://{REF}.supabase.co"
SITE = os.environ.get("SITE_URL", "https://vistoria-saude.github.io")


def api(metodo: str, caminho: str, ok404: bool = False, **kw):
    r = requests.request(metodo, f"{API}{caminho}", headers={"Authorization": f"Bearer {TOKEN}"}, timeout=180, **kw)
    if ok404 and r.status_code == 404:
        return None
    if r.status_code >= 300:
        raise RuntimeError(f"{metodo} {caminho}: {r.status_code} {r.text[:400]}")
    return r.json() if r.text.strip() else None


def sql(consulta: str):
    return api("POST", f"/projects/{REF}/database/query", json={"query": consulta})


def chaves() -> dict:
    lista = api("GET", f"/projects/{REF}/api-keys", params={"reveal": "true"})
    por_tipo, por_nome = {}, {}
    for k in lista:
        if k.get("api_key"):
            por_tipo.setdefault(k.get("type"), k["api_key"])
            por_nome[k.get("name")] = k["api_key"]
    return {"publica": por_tipo.get("publishable") or por_nome.get("anon"),
            "servico": por_nome.get("service_role") or por_tipo.get("secret")}


def limpar_projeto_antigo() -> str | None:
    """Apaga o conteúdo do Time Mourinha (tabelas, arquivos, contas, funções e agendamentos). Devolve o e-mail do dono."""
    existe = sql("select to_regclass('public.perfis') is not null as tem")
    if not existe or not existe[0]["tem"]:
        print("Nada do projeto antigo para apagar.")
        return None
    linha = sql("select email from public.perfis where papel = 'dono' order by criado_em limit 1")
    email = linha[0]["email"] if linha else None
    serv = chaves()["servico"]
    cab = {"apikey": serv, "Authorization": f"Bearer {serv}"}

    for f in ("ponte", "whatsapp", "enviar"):
        api("DELETE", f"/projects/{REF}/functions/{f}", ok404=True)
    sql("do $$ begin if exists (select 1 from pg_namespace where nspname = 'cron') then "
        "perform cron.unschedule(jobid) from cron.job where jobname like 'tm-%'; end if; end $$;")

    for bucket in ("perfis", "midias"):
        for _ in range(20):
            requests.post(f"{URL}/storage/v1/bucket/{bucket}/empty", headers=cab, timeout=120)
            r = requests.delete(f"{URL}/storage/v1/bucket/{bucket}", headers=cab, timeout=120)
            if r.status_code < 300 or r.status_code == 404 or "not found" in r.text.lower():
                break
            time.sleep(3)
        print(f"Arquivos do Time Mourinha apagados ({bucket}).")

    apagadas = 0
    while True:
        r = requests.get(f"{URL}/auth/v1/admin/users", headers=cab, params={"page": 1, "per_page": 200}, timeout=60)
        r.raise_for_status()
        usuarios = r.json().get("users", [])
        if not usuarios:
            break
        for u in usuarios:
            requests.delete(f"{URL}/auth/v1/admin/users/{u['id']}", headers=cab, timeout=60).raise_for_status()
            apagadas += 1
    print(f"Contas do Time Mourinha apagadas: {apagadas}.")

    sql("""
drop schema public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all functions in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
""")
    print("Banco do Time Mourinha apagado.")
    return email


def apagar_segredos_antigos():
    """Segredos das funções do Time Mourinha (ponte, WhatsApp): apaga os que ainda existirem."""
    existentes = {s["name"] for s in (api("GET", f"/projects/{REF}/secrets") or [])}
    velhos = sorted(existentes & {"PONTE_CHAVE", "ENVIAR_CHAVE", "SITE_URL", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID",
                                  "WHATSAPP_TEMPLATE", "WHATSAPP_VERIFY_TOKEN"})
    if velhos:
        api("DELETE", f"/projects/{REF}/secrets", json=velhos)
        print(f"Segredos antigos apagados: {len(velhos)}.")


def aplicar(email_admin: str | None):
    sql((RAIZ / "supabase/schema.sql").read_text(encoding="utf-8"))
    sql((RAIZ / "supabase/seed.sql").read_text(encoding="utf-8"))
    if email_admin:
        sql("insert into public.private_config (key, value) values ('admin_email', %s) on conflict (key) do nothing"
            .replace("%s", "'" + email_admin.replace("'", "''") + "'"))
    n = sql("select (select count(*) from public.units) as unidades, (select count(*) from public.profiles) as contas, "
            "(select count(*) from public.private_config where key = 'admin_email') as admin_definida")[0]
    print(f"Banco das Vistorias pronto: {n['unidades']} unidades, {n['contas']} contas, administração definida: {'sim' if n['admin_definida'] else 'não'}.")


def preparar_avisos():
    """Gera (uma vez) as chaves dos avisos no celular e a senha que o banco usa para chamar a função 'avisar'."""
    import base64
    import secrets as sec
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    def b64(b: bytes) -> str:
        return base64.urlsafe_b64encode(b).decode().rstrip("=")

    tem = {r["key"] for r in sql("select key from public.private_config")}
    valores = {"aviso_url": f"{URL}/functions/v1/avisar", "site_url": SITE}
    if "vapid_private" not in tem:
        k = ec.generate_private_key(ec.SECP256R1())
        valores["vapid_private"] = b64(k.private_numbers().private_value.to_bytes(32, "big"))
        valores["vapid_public"] = b64(k.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
    if "aviso_chave" not in tem:
        valores["aviso_chave"] = sec.token_urlsafe(32)
    linhas = ", ".join("('" + k + "', '" + v.replace("'", "''") + "')" for k, v in valores.items())
    sql(f"insert into public.private_config (key, value) values {linhas} on conflict (key) do update set value = excluded.value")
    print("Avisos no celular: chaves prontas.")


def ajustar_login():
    api("PATCH", f"/projects/{REF}/config/auth", json={
        "site_url": SITE,
        "uri_allow_list": f"{SITE}/**,http://localhost:5173/**",
        "external_email_enabled": True,
        "disable_signup": False,
        # O e-mail gratuito do Supabase só chega a quem é da equipe do projeto; por isso o cadastro entra direto
        # e quem libera o uso é a administração (aprovação + unidades atribuídas).
        "mailer_autoconfirm": True,
        "password_min_length": 8,
    })
    print("Login ajustado: e-mail e senha, aprovação pela administração.")


def exportar_chaves():
    c = chaves()
    destino = os.environ.get("GITHUB_ENV")
    if not destino or not c["publica"]:
        sys.exit("Sem GITHUB_ENV ou sem chave pública.")
    with open(destino, "a", encoding="utf-8") as f:
        f.write(f"VITE_SUPABASE_URL={URL}\nVITE_SUPABASE_PUBLISHABLE_KEY={c['publica']}\n")
    print("Chave pública pronta para o build.")


if __name__ == "__main__":
    if not TOKEN:
        sys.exit("Falta o segredo SUPABASE_ACCESS_TOKEN.")
    if sys.argv[1:] == ["chaves"]:
        exportar_chaves()
    else:
        email = limpar_projeto_antigo()
        apagar_segredos_antigos()
        aplicar(email)
        preparar_avisos()
        ajustar_login()
