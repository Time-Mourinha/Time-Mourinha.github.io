"""Teste de ponta a ponta no banco real: cria um vistoriador temporário, salva rascunho, conclui e apaga tudo.
Roda no GitHub Actions; não imprime chaves nem dados pessoais."""
from __future__ import annotations

import secrets
import uuid

import base64
import json
import requests

from supabase_setup import CFG, URL, chaves, sql

c = chaves()
srv = {"apikey": c["servico"], "Authorization": f"Bearer {c['servico']}", "Content-Type": "application/json"}
email = f"teste-{secrets.token_hex(4)}@exemplo.com"
senha = secrets.token_urlsafe(16)
r = requests.post(f"{URL}/auth/v1/admin/users", headers=srv, json={"email": email, "password": senha, "email_confirm": True, "user_metadata": {"nome": "Teste Automático"}}, timeout=60)
r.raise_for_status()
uid = r.json()["id"]
extras: list[str] = []
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

    # --- administração: excluir rascunho de outra pessoa e remover usuário
    email2 = f"teste-adm-{secrets.token_hex(4)}@exemplo.com"
    r = requests.post(f"{URL}/auth/v1/admin/users", headers=srv, json={"email": email2, "password": senha, "email_confirm": True, "user_metadata": {"nome": "Adm Teste"}}, timeout=60)
    r.raise_for_status(); uid2 = r.json()["id"]; extras.append(uid2)
    sql(f"update public.profiles set approved = true, role = 'admin' where id = '{uid2}'")
    tok2 = requests.post(f"{URL}/auth/v1/token", params={"grant_type": "password"}, headers={"apikey": c["publica"]}, json={"email": email2, "password": senha}, timeout=60).json()["access_token"]
    adm = {**usr, "Authorization": f"Bearer {tok2}"}
    outro = dict(corpo, id=str(uuid.uuid4()), status="draft")
    requests.post(f"{URL}/rest/v1/inspections", headers=usr, json=outro, timeout=60)
    r6 = requests.delete(f"{URL}/rest/v1/inspections", headers={**adm, "Prefer": "return=representation"}, params={"id": f"eq.{outro['id']}"}, timeout=60)
    print("Adm exclui rascunho de outra pessoa:", r6.status_code, "linhas apagadas:", len(r6.json()) if r6.ok else r6.text[:200])
    outro2 = dict(corpo, id=str(uuid.uuid4()), status="draft")
    requests.post(f"{URL}/rest/v1/inspections", headers=usr, json=outro2, timeout=60)
    r7 = requests.post(f"{URL}/rest/v1/rpc/remover_usuario", headers=adm, json={"alvo": uid}, timeout=60)
    print("Remover usuário:", r7.status_code, "" if r7.ok else r7.text[:300])
    fica = sql(f"select status, owner from public.inspections where id in ('{vid}', '{outro2['id']}')")
    print("Depois de remover: relatório concluído continua =", any(x["status"] == "completed" and x["owner"] is None for x in fica),
          "| rascunho apagado =", not any(x["status"] == "draft" for x in fica))
    print("Conta removida =", not sql(f"select 1 from auth.users where id = '{uid}'"))
    r8 = requests.post(f"{URL}/rest/v1/rpc/remover_usuario", headers=adm, json={"alvo": uid2}, timeout=60)
    print("Remover a própria conta (deve recusar):", r8.status_code)

    # --- ajudar no rascunho de outra pessoa (vistoriador aprovado, não admin)
    email3 = f"teste-ajuda-{secrets.token_hex(4)}@exemplo.com"
    r = requests.post(f"{URL}/auth/v1/admin/users", headers=srv, json={"email": email3, "password": senha, "email_confirm": True, "user_metadata": {"nome": "Ajuda Teste"}}, timeout=60)
    r.raise_for_status(); uid3 = r.json()["id"]; extras.append(uid3)
    sql(f"update public.profiles set approved = true where id = '{uid3}'")
    tok3 = requests.post(f"{URL}/auth/v1/token", params={"grant_type": "password"}, headers={"apikey": c["publica"]}, json={"email": email3, "password": senha}, timeout=60).json()["access_token"]
    ajuda = {**usr, "Authorization": f"Bearer {tok3}"}
    rasc = dict(corpo, id=str(uuid.uuid4()), status="draft", photos=[{"id": "f1", "type": "image/jpeg", "name": "a.jpg", "caption": "do dono"}])
    requests.post(f"{URL}/rest/v1/inspections", headers=usr, json=rasc, timeout=60)
    r9 = requests.patch(f"{URL}/rest/v1/inspections", headers={**ajuda, "Prefer": "return=representation"}, params={"id": f"eq.{rasc['id']}"},
                        json={"photos": rasc["photos"] + [{"id": "f2", "type": "image/jpeg", "name": "b.jpg", "caption": "da ajuda"}], "observacoes": [{"id": "o1", "quem": "", "texto": "teste"}]}, timeout=60)
    dono_ok = sql(f"select owner = '{uid}' as ok, jsonb_array_length(photos) as n from public.inspections where id = '{rasc['id']}'")
    print("Ajudar no rascunho de outra pessoa:", r9.status_code, "| dono continua =", dono_ok[0]["ok"] if dono_ok else None, "| fotos =", dono_ok[0]["n"] if dono_ok else None)
    sql(f"delete from public.inspections where id = '{rasc['id']}'")

    # --- Google Drive: o script aceita quem está aprovado e consegue usar o Drive?
    cfg = CFG
    if cfg.get("drive_url"):
        try:
            rd = requests.post(cfg["drive_url"], data=json.dumps({"acao": "teste", "token": tok2}), headers={"Content-Type": "text/plain"}, timeout=90)
            print("Drive (teste):", rd.status_code, rd.text[:300].replace(cfg["drive_url"], "<url>"))
            vt = str(uuid.uuid4())
            pdf = base64.b64encode(b"%PDF-1.4\n% teste do app\n").decode()
            re_ = requests.post(cfg["drive_url"], data=json.dumps({"acao": "enviar", "token": tok2, "vistoria": vt, "unidade": "TESTE AUTOMATICO", "data": "2026-01-01", "nome": "teste.pdf", "tipo": "application/pdf", "base64": pdf}), headers={"Content-Type": "text/plain"}, timeout=90).json()
            print("Drive enviar arquivo:", "ok" if re_.get("id") else re_)
            ra = requests.post(cfg["drive_url"], data=json.dumps({"acao": "apagar", "token": tok2, "vistoria": vt}), headers={"Content-Type": "text/plain"}, timeout=90).json()
            print("Drive apagar pasta:", ra)
            rn = requests.post(cfg["drive_url"], data=json.dumps({"acao": "teste", "token": "invalido"}), headers={"Content-Type": "text/plain"}, timeout=90)
            print("Drive sem login (deve negar):", rn.text[:120])
        except Exception as e:
            print("Drive: falhou", e)

    # --- compactar relatórios antigos: fica o último completo da unidade, o anterior vira resumo
    v_old, v_new = str(uuid.uuid4()), str(uuid.uuid4())
    sql(f"""set session_replication_role = replica;
      insert into public.inspections (id, unit_id, owner, inspected_on, inspector, status, rooms, summary, completed_at, updated_at) values
      ('{v_old}', 79, null, '2026-01-10', 'Teste Compacta', 'completed', '[]', '{{"nivel":"Alta","problemas":3,"principais":["Corrimãos"]}}', now() - interval '60 days', now() - interval '60 days'),
      ('{v_new}', 79, null, '2026-02-10', 'Teste Compacta', 'completed', '[]', null, now() - interval '40 days', now() - interval '40 days');
      set session_replication_role = origin;""")
    n = sql("select public.compactar_relatorios(30) as n")[0]["n"]
    ficou = sql(f"select id from public.inspections where id in ('{v_old}','{v_new}')")
    hist = sql(f"select summary->>'nivel' as nivel from public.visit_history where id = '{v_old}'")
    print("Compactar:", n, "compactado(s) | último completo ficou =", [x["id"] for x in ficou] == [v_new], "| resumo guardado =", hist[0]["nivel"] if hist else None)
    lido = requests.get(f"{URL}/rest/v1/visit_history", headers=adm, params={"id": f"eq.{v_old}", "select": "inspected_on"}, timeout=60)
    print("Histórico visível para a administração:", lido.status_code, len(lido.json()) if lido.ok else lido.text[:200])
    sql(f"delete from public.inspections where id in ('{v_old}','{v_new}'); delete from public.visit_history where id = '{v_old}'")
finally:
    sql(f"delete from public.inspections where id = '{vid}' or owner = '{uid}'")
    for x in [uid, *extras]:
        requests.delete(f"{URL}/auth/v1/admin/users/{x}", headers=srv, timeout=60)
    print("Teste limpo.")
