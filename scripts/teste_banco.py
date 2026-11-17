"""Teste de ponta a ponta no banco real: cria um vistoriador temporário, salva rascunho, conclui e apaga tudo.
Roda no GitHub Actions; não imprime chaves nem dados pessoais."""
from __future__ import annotations

import secrets
import uuid

import requests

from supabase_setup import URL, chaves, sql

c = chaves()
srv = {"apikey": c["servico"], "Authorization": f"Bearer {c['servico']}", "Content-Type": "application/json"}
email = f"teste-{secrets.token_hex(4)}@exemplo.com"
senha = secrets.token_urlsafe(16)
r = requests.post(f"{URL}/auth/v1/admin/users", headers=srv, json={"email": email, "password": senha, "email_confirm": True, "user_metadata": {"nome": "Teste Automático"}}, timeout=60)
r.raise_for_status()
uid = r.json()["id"]
try:
    sql(f"update public.profiles set approved = true where id = '{uid}'")
    tok = requests.post(f"{URL}/auth/v1/token", params={"grant_type": "password"}, headers={"apikey": c["publica"]}, json={"email": email, "password": senha}, timeout=60).json()["access_token"]
    usr = {"apikey": c["publica"], "Authorization": f"Bearer {tok}", "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=representation"}
    vid = str(uuid.uuid4())
    corpo = {"id": vid, "unit_id": 2, "inspected_on": "2026-11-16", "inspector": "Teste Automático", "status": "draft",
             "rooms": [{"id": "a1", "name": "Recepção", "checks": {"Área externa · Corrimãos": "Reparo"},
                        "findings": [{"id": "f1", "check": "Área externa · Corrimãos", "item": "Corrimãos", "point": "Recepção", "issue": "x", "action": "y", "priority": "Prioritária", "reason": "", "owner": "", "due": "", "media": []}]}],
             "photos": [], "general_reason": "", "general_by": ""}
    r1 = requests.post(f"{URL}/rest/v1/inspections", headers=usr, json=corpo, timeout=60)
    print("Salvar rascunho:", r1.status_code, "" if r1.ok else r1.text[:300])
    corpo["status"] = "completed"
    r2 = requests.post(f"{URL}/rest/v1/inspections", headers=usr, json=corpo, timeout=60)
    print("Concluir:", r2.status_code, "" if r2.ok else r2.text[:300])
    r3 = requests.get(f"{URL}/rest/v1/inspections", headers=usr, params={"id": f"eq.{vid}", "select": "status,completed_at"}, timeout=60)
    print("Conferência:", r3.status_code, r3.json() if r3.ok else r3.text[:200])
    r4 = requests.post(f"{URL}/rest/v1/inspections", headers=usr, json={**corpo, "inspector": "mudou"}, timeout=60)
    print("Alterar concluída (deve ser recusado):", r4.status_code)
    rascunho = dict(corpo, id=str(uuid.uuid4()), status="draft")
    requests.post(f"{URL}/rest/v1/inspections", headers=usr, json=rascunho, timeout=60)
    r5 = requests.delete(f"{URL}/rest/v1/inspections", headers=usr, params={"id": f"eq.{rascunho['id']}"}, timeout=60)
    print("Excluir rascunho:", r5.status_code)
finally:
    sql(f"delete from public.inspections where owner = '{uid}'")
    requests.delete(f"{URL}/auth/v1/admin/users/{uid}", headers=srv, timeout=60)
    print("Teste limpo.")
