"""Testa a busca de notícias negativas com um RSS de exemplo (sem internet)."""
from datetime import timedelta
from email.utils import format_datetime

import coletor.midia as midia
from coletor.util import agora


class Resp:
    def __init__(self, txt): self.status_code, self.content = 200, txt.encode()


def rss(itens):
    corpo = "".join(f"<item><title>{t} - {f}</title><link>http://n/{i}</link><pubDate>{format_datetime(d)}</pubDate>"
                    f"<description>{t}</description><source url=\"{u}\">{f}</source></item>" for i, (t, f, u, d) in enumerate(itens))
    return f"<rss><channel>{corpo}</channel></rss>"


def test_filtra_negativas_recentes_e_nao_oficiais(monkeypatch, tmp_path):
    agora_ = agora()
    feed = rss([
        ("Falta de remédios no hospital de Alagoas revolta pacientes", "Jornal A", "https://jornala.com", agora_ - timedelta(hours=5)),
        ("Governo de Alagoas inaugura nova escola", "Jornal B", "https://jornalb.com", agora_ - timedelta(hours=3)),
        ("Fila enorme em posto de Alagoas", "Agência Alagoas", "https://www.agenciaalagoas.al.gov.br", agora_ - timedelta(hours=2)),
        ("Greve em Alagoas paralisa escolas", "Jornal C", "https://jornalc.com", agora_ - timedelta(hours=100)),
    ])
    monkeypatch.setattr(midia, "SAIDA", tmp_path)
    http = type("H", (), {"get": lambda self, url: Resp(feed)})()
    esf = {"id": "governo-al", "tipo": "estado", "temas_midia": ["Sesau"]}
    itens = midia.buscar(esf, http)
    assert [i["titulo"] for i in itens] == ["Falta de remédios no hospital de Alagoas revolta pacientes"]
    assert "falta" in itens[0]["motivos"] and itens[0]["temas"] == ["Sesau"]


def test_frases_positivas_nao_contam():
    assert midia._palavras_negativas("Prefeitura zera a fila de exames") == []
    assert "atraso" in midia._palavras_negativas("Salários atrasados de professores")
