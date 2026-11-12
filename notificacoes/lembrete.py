"""Lembretes automáticos do Time Mourinha (e-mail + WhatsApp) para TODOS os integrantes aprovados.

Horários (Maceió), disparados pelo GitHub Actions:
  manha    08h  "Já começou sua atividade do dia?"
  meio_dia 12h  "Como estão as visitas? Alguma atualização?"
  tarde    15h  "Já finalizou o dia ou vamos finalizar? Mande as fotos."
  resumo   18h  Resumo do dia de cada integrante, por e-mail, para os administradores.

Variáveis (segredos do GitHub): SUPABASE_URL, SUPABASE_SERVICE_KEY, SITE_URL,
GMAIL_USER, GMAIL_APP_PASSWORD (e-mail), WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE (WhatsApp).
Canal sem segredo configurado é simplesmente pulado.
"""
from __future__ import annotations

import os
import smtplib
import sys
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from html import escape

import requests

FUSO = timezone(timedelta(hours=-3))
SB = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
SITE = os.environ.get("SITE_URL", "").rstrip("/")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

PERGUNTAS = {
    "manha": ("Bom dia, {nome}! Já começou sua atividade do dia?",
              "Me conte onde você está agora e sua programação de hoje. Exemplos: \"hoje estou em home office com o Mourinha\" "
              "ou \"9h reunião no Sebrae\"."),
    "meio_dia": ("{nome}, como estão as visitas da manhã?",
                 "Tem alguma atualização? Conte por aqui o que viu e mande as fotos pela atividade do dia."),
    "tarde": ("{nome}, já finalizou o dia ou vamos finalizar?",
              "Envie as fotos que faltam e marque o que foi resolvido e o que ficou pendente em cada atividade."),
}


def get(tabela: str, **params):
    r = requests.get(f"{SB}/rest/v1/{tabela}", headers=H, params=params, timeout=60)
    r.raise_for_status()
    return r.json()


def hoje():
    agora = datetime.now(FUSO)
    return agora.date().isoformat(), agora.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def enviar_email(para: str, assunto: str, html: str) -> bool:
    user, senha = os.environ.get("GMAIL_USER"), os.environ.get("GMAIL_APP_PASSWORD")
    if not (user and senha and para):
        return False
    m = EmailMessage()
    m["From"] = f"Time Mourinha <{user}>"
    m["To"] = para
    m["Subject"] = assunto
    m.set_content("Abra este e-mail num aplicativo que mostre HTML.")
    m.add_alternative(html, subtype="html")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as s:
        s.login(user, senha)
        s.send_message(m)
    return True


def enviar_whatsapp(telefone: str, nome: str, texto: str) -> bool:
    token, phone_id = os.environ.get("WHATSAPP_TOKEN"), os.environ.get("WHATSAPP_PHONE_ID")
    modelo = os.environ.get("WHATSAPP_TEMPLATE", "lembrete_time_mourinha")
    if not (token and phone_id and telefone):
        return False
    corpo = {"messaging_product": "whatsapp", "to": telefone, "type": "template",
             "template": {"name": modelo, "language": {"code": "pt_BR"},
                          "components": [{"type": "body", "parameters": [
                              {"type": "text", "text": nome}, {"type": "text", "text": texto[:900]},
                              {"type": "text", "text": f"{SITE}/#/hoje" if SITE else "o site do Time Mourinha"}]}]}}
    r = requests.post(f"https://graph.facebook.com/v21.0/{phone_id}/messages", json=corpo,
                      headers={"Authorization": f"Bearer {token}"}, timeout=60)
    if r.status_code >= 300:
        print("WhatsApp falhou para", nome, r.status_code, r.text[:300])
        return False
    return True


def cartao(titulo: str, corpo: str, botao: str = "Abrir a atividade do dia", link: str = "/#/hoje") -> str:
    return f"""<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #D9E1EE;border-radius:12px;overflow:hidden">
      <div style="background:#0A2F6B;color:#fff;padding:16px 20px;border-bottom:5px solid #FF6A13;font-size:20px;font-weight:bold">Time Mourinha</div>
      <div style="padding:20px;color:#14203A;font-size:16px;line-height:1.5"><p style="font-size:19px;font-weight:bold;margin-top:0">{titulo}</p>{corpo}
      {f'<p><a href="{SITE}{link}" style="background:#FF6A13;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">{botao}</a></p>' if SITE else ''}
      </div></div>"""


def lembrar(momento: str) -> None:
    data, inicio = hoje()
    perfis = get("perfis", select="*", papel="in.(membro,admin)")
    sinais = get("atualizacoes", select="autor,criado_em,texto", criado_em=f"gte.{inicio}", order="criado_em.desc")
    atvs = get("atividades", select="id,autor,situacao,local", data=f"eq.{data}")
    enviados = 0
    for p in perfis:
        nome = (p.get("nome") or "").split(" ")[0] or "time"
        meus = [s for s in sinais if s["autor"] == p["id"]]
        minhas = [a for a in atvs if a["autor"] == p["id"]]
        if momento == "tarde" and minhas and all(a["situacao"] != "em_andamento" for a in minhas) and any(s["texto"].startswith("Encerrei") for s in meus):
            continue  # já encerrou o dia
        titulo, texto = (x.format(nome=nome) for x in PERGUNTAS[momento])
        if momento == "meio_dia" and not meus:
            texto = "Ainda não vi nenhum sinal seu hoje. " + texto
        if momento == "tarde" and minhas:
            abertas = [a["local"] for a in minhas if a["situacao"] == "em_andamento"]
            if abertas:
                texto += " Ainda em andamento: " + ", ".join(abertas[:5]) + "."
        ok_e = p.get("notificar_email", True) and enviar_email(p.get("email"), titulo, cartao(escape(titulo), f"<p>{escape(texto)}</p>"))
        ok_w = p.get("notificar_whatsapp", True) and enviar_whatsapp(p.get("telefone"), nome, f"{titulo} {texto}")
        enviados += bool(ok_e) + bool(ok_w)
    print(f"{momento}: {enviados} mensagens enviadas para {len(perfis)} integrantes")


def resumo() -> None:
    data, inicio = hoje()
    perfis = get("perfis", select="*", papel="in.(membro,admin)")
    sinais = get("atualizacoes", select="*", criado_em=f"gte.{inicio}", order="criado_em.asc")
    atvs = get("atividades", select="*", data=f"eq.{data}")
    mids = get("midias", select="atividade_id,tipo", criado_em=f"gte.{inicio}")
    sit = {"em_andamento": "em andamento", "resolvido": "resolvido", "nao_resolvido": "não resolvido"}
    blocos = []
    for p in perfis:
        meus = [s for s in sinais if s["autor"] == p["id"]]
        minhas = [a for a in atvs if a["autor"] == p["id"]]
        nf = sum(1 for m in mids if any(m["atividade_id"] == a["id"] for a in minhas))
        linhas = "".join(f"<li>{datetime.fromisoformat(s['criado_em']).astimezone(FUSO):%H:%M} {escape(s['texto'])}</li>" for s in meus) or "<li>Nenhum sinal hoje.</li>"
        ativ = "".join(f"<li><b>{escape(a.get('local') or a.get('titulo') or '')}</b>: {sit.get(a['situacao'], '')}"
                       f"{(' · falta: ' + escape(a['pendente'])) if a.get('pendente') else ''}</li>" for a in minhas)
        blocos.append(f"<h3 style='color:#0A2F6B;margin:18px 0 4px'>{escape(p.get('nome') or '')}</h3>"
                      f"<p style='margin:0;color:#5A6680'>{len(minhas)} atividades · {nf} fotos/vídeos</p><ul>{linhas}</ul>{f'<ul>{ativ}</ul>' if ativ else ''}")
    html = cartao(f"Resumo do dia {datetime.now(FUSO):%d/%m/%Y}", "".join(blocos), "Abrir o painel Ao vivo", "/#/ao-vivo")
    n = sum(enviar_email(p.get("email"), "Time Mourinha: resumo do dia", html) for p in perfis if p["papel"] == "admin" and p.get("notificar_email", True))
    print(f"resumo enviado para {n} administradores")


if __name__ == "__main__":
    if not (SB and KEY):
        print("SUPABASE_URL e SUPABASE_SERVICE_KEY não configurados; nada a fazer.")
        sys.exit(0)
    momento = sys.argv[1] if len(sys.argv) > 1 else "manha"
    resumo() if momento == "resumo" else lembrar(momento)
