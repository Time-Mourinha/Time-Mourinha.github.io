"""Testa o processamento com dados FICTÍCIOS de teste (nunca publicados no site)."""
import json

import pandas as pd
import pytest

import coletor.main as main
import coletor.publicar as publicar
from coletor.fontes import ckan_al, externas, portal_al, unidades
from coletor.processa.normaliza import classificar, mapear_colunas, padronizar_despesa
from coletor.util import StatusFonte, valor_br


def tabela_despesas():
    linhas = []
    # Educação: reforma de escola + empenhos fracionados
    linhas += [
        ["14000 - SECRETARIA DE ESTADO DA EDUCAÇÃO - SEDUC", "2026NE0001", "10/02/2026", "CONSTRUTORA ALFA LTDA", "11.111.111/0001-11",
         "4.4.90.51 - OBRAS E INSTALAÇÕES", "REFORMA DA ESCOLA ESTADUAL PROFESSOR TESTE SILVA EM ARAPIRACA", "1.200.000,00", "480.000,00", "480.000,00"],
    ]
    for i, d in enumerate(["01/03/2026", "15/03/2026", "28/03/2026"]):
        linhas.append(["SECRETARIA DE ESTADO DA EDUCAÇÃO - SEDUC", f"2026NE01{i}", d, "PAPELARIA BETA ME", "22.222.222/0001-22",
                       "3.3.90.30 - MATERIAL DE CONSUMO", "AQUISICAO DE MATERIAL", "60.000,00", "60.000,00", "60.000,00"])
    for i in range(20):
        linhas.append(["SECRETARIA DE ESTADO DA SAÚDE - SESAU", f"2026NE2{i:02d}", f"{(i % 9) + 1:02d}/0{(i % 9) + 1}/2026",
                       "HOSPITAL FORNECEDOR GAMA", "33.333.333/0001-33", "3.3.90.39 - SERVIÇOS DE TERCEIROS",
                       "SERVIÇOS NO HOSPITAL GERAL DO TESTE", "10.000,00", "10.000,00", "9.000,00"])
    linhas.append(["SECRETARIA DE ESTADO DA SAÚDE - SESAU", "2026NE999", "07/03/2026", "EMPRESA DELTA", "44.444.444/0001-44",
                   "3.3.90.39 - SERVIÇOS DE TERCEIROS", "SERVIÇO ESPECIAL", "900.000,00", "0", "0"])
    # linha repetida (deve ser removida)
    linhas.append(linhas[-1])
    cols = ["Órgão", "Número do Empenho", "Data", "Favorecido", "CPF/CNPJ", "Elemento de Despesa", "Histórico",
            "Valor Empenhado", "Valor Liquidado", "Valor Pago"]
    return pd.DataFrame(linhas, columns=cols)


def tabela_totais():
    return pd.DataFrame([
        ["SECRETARIA DE ESTADO DA EDUCAÇÃO - SEDUC", "10.000.000,00", "12.000.000,00", "1.380.000,00", "660.000,00", "660.000,00"],
        ["SECRETARIA DE ESTADO DA SAÚDE - SESAU", "20.000.000,00", "20.000.000,00", "1.100.000,00", "200.000,00", "180.000,00"],
    ], columns=["Órgão", "Dotação Inicial", "Dotação Atualizada", "Empenhado", "Liquidado", "Pago"])


def test_mapeia_colunas():
    m = mapear_colunas(tabela_despesas().columns)
    assert m["orgao"] == "Órgão" and m["favorecido"] == "Favorecido" and m["empenhado"] == "Valor Empenhado"
    assert classificar("despesas.csv", tabela_despesas().columns) == "despesa"
    assert valor_br("1.234,56") == 1234.56


def test_remove_repetidos():
    p = padronizar_despesa(tabela_despesas(), "x.csv", "http://x")
    assert len(p) == len(tabela_despesas()) - 1


@pytest.fixture
def rodada(tmp_path, monkeypatch):
    ok = lambda n: StatusFonte(n, "http://teste", status="ok")
    monkeypatch.setattr(portal_al, "coletar", lambda c, a, h, e, n: (ok("portal"), [("despesas_2026.csv", "http://p/d", tabela_despesas()),
                                                                               ("orcamento_orgao_2026.csv", "http://p/o", tabela_totais())]))
    monkeypatch.setattr(ckan_al, "coletar", lambda c, a, h: (ok("ckan"), []))
    monkeypatch.setattr(unidades, "municipios", lambda c, h: {})
    monkeypatch.setattr(unidades, "saude", lambda c, h, m, e: (ok("cnes"), [
        {"id": "saude-1", "tipo": "saude", "codigo": "1", "nome": "Hospital Geral Do Teste", "subtipo": "Hospital",
         "municipio": "Maceió", "lat": -9.6, "lon": -35.7, "indicadores": {}, "fonte": "http://cnes"}]))
    monkeypatch.setattr(unidades, "escolas", lambda c, h, a, e: (ok("inep"), [
        {"id": "escola-9", "tipo": "escola", "codigo": "9", "nome": "Escola Estadual Professor Teste Silva", "subtipo": "Escola estadual",
         "municipio": "Arapiraca", "lat": None, "lon": None, "situacao": "Em atividade", "matriculas": 500,
         "infraestrutura": {"Internet": False}, "faltando_essencial": ["Internet", "Água potável"], "censo_ano": 2025, "fonte": "http://inep"}]))
    monkeypatch.setattr(externas, "noticias", lambda f, d, h, p: (ok("noticias"), [
        {"titulo": "Governo entrega escola reformada", "link": "http://n", "data": "2026-11-01T10:00:00", "resumo": "Educação entrega",
         "tipo": "entrega", "texto_busca": "GOVERNO ENTREGA ESCOLA REFORMADA EDUCACAO ENTREGA"}]))
    monkeypatch.setattr(externas, "dados_cnpj", lambda c, h, l: (ok("cnpj"), {"44444444000144": {"abertura": "2026-08-01"}}))
    monkeypatch.setattr(externas, "sancoes", lambda c, h, l: (ok("cgu"), {}))
    monkeypatch.setattr(publicar, "BASE_SAIDA", tmp_path / "dados")
    monkeypatch.setattr(main, "SAIDA", tmp_path / "dados")
    monkeypatch.setattr(main, "DOCS", tmp_path / "docs")
    assert main.rodar() == 0
    esferas = json.loads((tmp_path / "dados" / "esferas.json").read_text())
    assert [e["id"] for e in esferas] == ["governo-al", "prefeitura-maceio"] and all(e["tem_dados"] for e in esferas)
    return tmp_path / "dados" / "governo-al"


def test_pipeline_completo(rodada):
    orgaos = json.loads((rodada / "orgaos.json").read_text())
    ids = {o["id"] for o in orgaos}
    assert {"seduc", "sesau"} <= ids
    seduc = json.loads((rodada / "orgaos" / "seduc.json").read_text())
    assert seduc["orcado"] == 10_000_000
    assert seduc["despesas"]["por_favorecido"][0]["nome"] == "CONSTRUTORA ALFA LTDA"
    assert seduc["obras"][0]["unidade_id"] == "escola-9"   # reforma ligada à escola certa
    assert seduc["noticias"], "notícia de entrega deveria cair na Educação"
    alertas = json.loads((rodada / "alertas.json").read_text())
    tipos = {a["tipo"] for a in alertas}
    assert "fracionamento" in tipos and "empresa_nova" in tipos
    missoes = json.loads((rodada / "missoes.json").read_text())
    assert any(m["unidade_id"] == "escola-9" for m in missoes)
    assert (rodada / "orgaos" / "sesau" / "despesas-03.json").exists()
    meta = json.loads((rodada / "meta.json").read_text())
    assert meta["conferencia"], "deve comparar total coletado x portal"
    # CPF nunca aparece inteiro; CNPJ sim
    txt = (rodada / "orgaos" / "seduc.json").read_text()
    assert "11.111.111/0001-11" in txt
