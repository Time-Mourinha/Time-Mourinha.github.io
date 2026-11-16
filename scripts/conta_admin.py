"""Cria (ou conserta) a conta da administração e manda para o e-mail dela o link para definir a senha.

Roda no GitHub Actions. Não imprime e-mail nem senha: a senha é escolhida pela própria pessoa pelo link.
"""
from __future__ import annotations

import secrets

import requests

from supabase_setup import REF, SITE, URL, chaves, sql

serv = chaves()["servico"]
cab = {"apikey": serv, "Authorization": f"Bearer {serv}", "Content-Type": "application/json"}

linha = sql("select value from public.private_config where key = 'admin_email'")
if not linha:
    raise SystemExit("Nenhum e-mail de administração guardado no banco.")
email = linha[0]["value"].strip().lower()

usuario = None
pagina = 1
while usuario is None:
    r = requests.get(f"{URL}/auth/v1/admin/users", headers=cab, params={"page": pagina, "per_page": 200}, timeout=60)
    r.raise_for_status()
    lista = r.json().get("users", [])
    usuario = next((u for u in lista if (u.get("email") or "").lower() == email), None)
    if len(lista) < 200:
        break
    pagina += 1

if usuario is None:
    r = requests.post(f"{URL}/auth/v1/admin/users", headers=cab, timeout=60,
                      json={"email": email, "password": secrets.token_urlsafe(24), "email_confirm": True})
    r.raise_for_status()
    usuario = r.json()
    print("Conta da administração criada.")
else:
    requests.put(f"{URL}/auth/v1/admin/users/{usuario['id']}", headers=cab, json={"email_confirm": True}, timeout=60).raise_for_status()
    print("Conta da administração já existia: e-mail confirmado.")

sql(f"""
insert into public.profiles (id, email, role, approved, needs_code)
values ('{usuario['id']}', (select email from auth.users where id = '{usuario['id']}'), 'admin', true, false)
on conflict (id) do update set role = 'admin', approved = true, needs_code = false;
""")
print("Perfil: administração aprovada.")

r = requests.post(f"{URL}/auth/v1/recover", headers=cab, params={"redirect_to": SITE + "/"}, json={"email": email}, timeout=60)
print("Link para criar a senha enviado ao e-mail da administração." if r.status_code < 300 else f"Falha ao enviar o link: {r.status_code} {r.text[:200]}")
n = sql("select count(*) as contas, count(*) filter (where approved) as aprovadas from public.profiles")[0]
print(f"Contas no app: {n['contas']} (aprovadas: {n['aprovadas']}). Projeto {REF}.")
