"""Reconhece o tipo de cada tabela e traduz as colunas para um formato padrão.

O portal pode mudar nomes de colunas; por isso a tradução usa listas de sinônimos.
Para acrescentar um sinônimo, basta incluí-lo em SINONIMOS.
"""
from __future__ import annotations

import re

import pandas as pd

from ..util import norm, so_digitos, valor_br

SINONIMOS = {
    "orgao": ["ORGAO", "NOMEORGAO", "DESCRICAOORGAO", "DSORGAO", "ORGAONOME", "SECRETARIA",
              "UNIDADEORCAMENTARIA", "NOMEUNIDADEORCAMENTARIA", "UO", "NOMEUO", "ENTIDADE"],
    "ug": ["UNIDADEGESTORA", "NOMEUNIDADEGESTORA", "UG", "NOMEUG", "DSUG"],
    "data": ["DATA", "DATAEMPENHO", "DATAPAGAMENTO", "DATALIQUIDACAO", "DATAEMISSAO", "DTEMISSAO",
             "DATADOCUMENTO", "DTPAGAMENTO", "DTEMPENHO", "DATAMOVIMENTO", "DTMOVIMENTO"],
    "numero": ["NUMEROEMPENHO", "NUMEMPENHO", "NOTAEMPENHO", "NUMERONOTAEMPENHO", "EMPENHO", "NE",
               "NUMERODOCUMENTO", "NUMDOCUMENTO", "DOCUMENTO", "ORDEMBANCARIA", "NUMEROOB", "OB", "NUMERO"],
    "favorecido": ["FAVORECIDO", "NOMEFAVORECIDO", "CREDOR", "NOMECREDOR", "FORNECEDOR", "NOMEFORNECEDOR",
                   "RAZAOSOCIAL", "BENEFICIARIO", "NOMEBENEFICIARIO", "CONTRATADO"],
    "documento": ["CPFCNPJ", "CNPJCPF", "CPFCNPJFAVORECIDO", "CNPJCPFFAVORECIDO", "CNPJCPFCREDOR",
                  "CPFCNPJCREDOR", "DOCUMENTOFAVORECIDO", "CNPJ", "CPF", "CNPJFORNECEDOR"],
    "elemento": ["ELEMENTODESPESA", "ELEMENTODEDESPESA", "DESCRICAOELEMENTO", "NOMEELEMENTO", "ELEMENTO",
                 "NATUREZADESPESA", "NATUREZADADESPESA", "NATUREZA", "ND"],
    "programa": ["PROGRAMA", "NOMEPROGRAMA", "DESCRICAOPROGRAMA"],
    "acao": ["ACAO", "NOMEACAO", "DESCRICAOACAO", "PROJETOATIVIDADE", "PROJETOATIVIDADEOPERACAOESPECIAL"],
    "funcao": ["FUNCAO", "NOMEFUNCAO", "DESCRICAOFUNCAO"],
    "fonte_recurso": ["FONTERECURSO", "FONTEDERECURSO", "FONTEDERECURSOS", "FONTERECURSOS", "DESCRICAOFONTE",
                      "NOMEFONTE", "FONTE"],
    "historico": ["HISTORICO", "OBJETO", "DESCRICAODESPESA", "ESPECIFICACAO", "DESCRICAO", "OBSERVACAO", "FINALIDADE"],
    "fase": ["FASE", "ESTAGIO", "TIPODOCUMENTO", "TIPODESPESA"],
    "empenhado": ["VALOREMPENHADO", "EMPENHADO", "VLEMPENHADO", "TOTALEMPENHADO", "VALOREMPENHO"],
    "liquidado": ["VALORLIQUIDADO", "LIQUIDADO", "VLLIQUIDADO", "TOTALLIQUIDADO"],
    "pago": ["VALORPAGO", "PAGO", "VLPAGO", "TOTALPAGO", "VALORPAGAMENTO"],
    "orcado": ["DOTACAOINICIAL", "ORCAMENTOINICIAL", "VALORORCADO", "ORCADO", "PREVISTO", "VALORPREVISTO"],
    "atualizado": ["DOTACAOATUALIZADA", "ORCAMENTOATUALIZADO", "ORCADOATUALIZADO", "AUTORIZADO", "VALORAUTORIZADO", "DOTACAOAUTORIZADA"],
    "valor": ["VALOR", "VALORDOCUMENTO", "VALORTOTAL", "VLDOCUMENTO", "VALORBRUTO"],
}
VALORES = ["empenhado", "liquidado", "pago", "orcado", "atualizado", "valor"]


def chave_col(c: str) -> str:
    # tira a unidade do cabeçalho: "Pago (R$)" → "PAGO"
    return re.sub(r"[^A-Z0-9]", "", re.sub(r"\(?\s*R\$\s*\)?|\(EM REAIS\)", "", norm(c)))


def mapear_colunas(colunas) -> dict[str, str]:
    """Retorna {campo_padrao: coluna_original}."""
    chaves = {c: chave_col(c) for c in colunas}
    usados, mapa = set(), {}
    # 1ª passada: nome exato (vale para todos os campos antes de qualquer aproximação)
    for campo, sins in SINONIMOS.items():
        for s in sins:
            achou = next((c for c, k in chaves.items() if k == s and c not in usados), None)
            if achou:
                mapa[campo] = achou
                usados.add(achou)
                break
    # 2ª passada: nome que contém o sinônimo (só sinônimos longos, para evitar confusão)
    for campo, sins in SINONIMOS.items():
        if campo in mapa or campo in ("valor", "numero", "data"):
            continue
        for s in sins:
            if len(s) < 6:
                continue
            achou = next((c for c, k in chaves.items() if s in k and c not in usados), None)
            if achou:
                mapa[campo] = achou
                usados.add(achou)
                break
    return mapa


def classificar(nome: str, colunas) -> str:
    ks = " ".join(chave_col(c) for c in colunas)
    n = chave_col(nome)
    if "RECEITA" in ks or "ARRECAD" in ks or ("RECEITA" in n and "DESPESA" not in n):
        return "receita"
    if "DIARIA" in ks or "DIARIA" in n:
        return "diaria"
    if any(k in ks for k in ("REMUNERACAO", "SALARIO", "VENCIMENTO")) or "FOLHA" in n:
        return "folha"
    if "CONTRATO" in ks and any(k in ks for k in ("VIGENCIA", "OBJETO", "DATAFIM", "DATAINICIO")):
        return "contrato"
    if "CONVENIO" in ks or "CONVENIO" in n:
        return "convenio"
    m = mapear_colunas(colunas)
    if any(v in m for v in VALORES) and any(c in m for c in ("orgao", "favorecido", "elemento", "ug")):
        return "despesa"
    return "nao_classificada"


def limpar_orgao(txt) -> str:
    t = re.sub(r"^\s*[\d.\-/]+\s*[-–]?\s*", "", str(txt or "")).strip()
    return re.sub(r"\s+", " ", t)


def _fase(txt: str, origem: str) -> str | None:
    t = norm(f"{txt} {origem}")
    if "PAGAMENTO" in t or "PAGO" in t or " OB " in f" {t} " or "ORDEM BANCARIA" in t:
        return "pagamento"
    if "LIQUIDA" in t:
        return "liquidacao"
    if "EMPENH" in t or " NE " in f" {t} ":
        return "empenho"
    return None


def padronizar_despesa(df: pd.DataFrame, origem: str, url: str) -> pd.DataFrame:
    df = df.drop_duplicates()  # itens repetidos idênticos no próprio arquivo
    m = mapear_colunas(df.columns)
    out = pd.DataFrame(index=df.index)
    for campo in ["orgao", "ug", "numero", "favorecido", "documento", "elemento", "programa", "acao",
                  "funcao", "fonte_recurso", "historico", "fase"]:
        out[campo] = df[m[campo]].fillna("").astype(str).str.strip() if campo in m else ""
    out["orgao"] = out["orgao"].map(limpar_orgao)
    if not out["orgao"].str.len().any() and "ug" in m:
        out["orgao"] = out["ug"].map(limpar_orgao)
    out["data"] = pd.to_datetime(df[m["data"]], errors="coerce", dayfirst=True) if "data" in m else pd.NaT
    for v in VALORES:
        out[v] = df[m[v]].map(valor_br).fillna(0.0) if v in m else 0.0
    # Linhas com um "valor" único: decide a fase pelo campo fase ou pelo nome da origem.
    sem_fases = (out[["empenhado", "liquidado", "pago"]].sum(axis=1) == 0) & (out["valor"] != 0)
    if sem_fases.any():
        fases = [(_fase(f, origem) or "empenho") for f in out.loc[sem_fases, "fase"]]
        col = {"empenho": "empenhado", "liquidacao": "liquidado", "pagamento": "pago"}
        for idx, f in zip(out.index[sem_fases], fases):
            out.at[idx, col[f]] = out.at[idx, "valor"]
            out.at[idx, "fase"] = f
    out["documento"] = out["documento"].map(so_digitos)
    out["origem"] = origem
    out["fonte_url"] = url
    out["detalhado"] = (out["favorecido"].str.len() > 0) | (out["numero"].str.len() > 0)
    return out


def juntar_despesas(tabelas: list[pd.DataFrame]):
    """Separa linhas detalhadas (empenhos/pagamentos) de totais por órgão e remove
    duplicatas entre fontes (o mesmo empenho vindo do CSV e da API interna)."""
    if not tabelas:
        vazio = pd.DataFrame(columns=["orgao", "data", "favorecido", "documento", "empenhado", "liquidado",
                                      "pago", "orcado", "atualizado", "numero", "detalhado"])
        return vazio, vazio.copy()
    tudo = pd.concat(tabelas, ignore_index=True)
    tudo = tudo[tudo["orgao"].str.len() > 0]
    det = tudo[tudo["detalhado"]].copy()
    tot = tudo[~tudo["detalhado"]].copy()
    chave = ["orgao", "numero", "data", "favorecido", "documento", "empenhado", "liquidado", "pago", "historico"]
    if not det.empty:  # (DataFrame vazio + agg devolve DataFrame e quebra a atribuição)
        det["_k"] = det[chave].astype(str).agg("|".join, axis=1)
        det = det.drop_duplicates("_k").drop(columns="_k")
    tot = tot.groupby("orgao", as_index=False)[["orcado", "atualizado", "empenhado", "liquidado", "pago"]].max()
    return det.reset_index(drop=True), tot


def sigla_de(nome: str) -> str:
    m = re.search(r"\(([A-Z]{2,12}(?:/AL)?)\)|[-–]\s*([A-Z]{2,12})\s*$", nome or "")
    if m:
        return (m.group(1) or m.group(2)).replace("/AL", "")
    vazias = {"DE", "DA", "DO", "DAS", "DOS", "E", "ESTADO", "SECRETARIA", "ESTADUAL", "MUNICIPAL", "A", "O", "EM", "PARA"}
    palavras = [p for p in re.sub(r"[^A-Z0-9 ]", " ", norm(nome)).split() if p not in vazias]
    if len(palavras) >= 3:
        return "".join(p[0] for p in palavras[:5])
    # nomes curtos ("Secretaria de Estado da Saúde") viram o próprio tema: "Saude", "Educacao Esporte"
    return " ".join(p.title() for p in palavras[:2]) or norm(nome)[:12]
