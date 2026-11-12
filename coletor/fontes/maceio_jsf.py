"""Portal da Transparência de Maceió (telas PrimeFaces/JSF).

As despesas só aparecem depois de preencher o período e clicar em "Consultar". O robô (Playwright) faz isso
nas abas "Despesas por Órgão" e "Despesas", percorre todas as páginas da tabela e devolve as linhas.
O HTML da primeira página de cada tabela fica em docs/paginas/prefeitura-maceio/ para conferência.
"""
from __future__ import annotations

import re

import pandas as pd

from ..util import DOCS, StatusFonte, agora, log

BASE = "https://www.transparencia.maceio.al.gov.br/transparencia/pages/despesas.faces"
ABAS = [  # (nome do formulário, rótulo da aba, nome amigável)
    ("tabs:form-despesas-orgao", "Despesas por Órgão", "despesas por órgão"),
    ("tabs:form-despesas", "Despesas", "despesas (empenhos)"),
    ("tabs:form-diarias", "Diárias", "diárias"),
]


def _ler_tabela(pag, form: str) -> pd.DataFrame:
    tid = form + ":" + {"tabs:form-despesas-orgao": "tabela-despesas-orgao", "tabs:form-despesas": "tabela-despesas",
                        "tabs:form-diarias": "tabela-diarias"}[form]
    sel = f'[id="{tid}"]'
    cab = pag.eval_on_selector_all(f'{sel} thead th', "ths => ths.map(t => t.innerText.trim())")
    linhas = []
    paginas = 0
    # mostra o máximo de linhas por página, se a tabela permitir
    try:
        rpp = pag.query_selector(f'{sel} select.ui-paginator-rpp-options')
        if rpp:
            opcoes = rpp.eval_on_selector_all("option", "os => os.map(o => o.value)")
            maior = max(opcoes, key=lambda v: int(v) if v.isdigit() else 0)
            rpp.select_option(maior)
            pag.wait_for_timeout(3000)
    except Exception as e:  # noqa: BLE001
        log.debug("rpp: %s", e)
    while paginas < 2000:
        paginas += 1
        dados = pag.eval_on_selector_all(f'[id="{tid}_data"] tr', "trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim()))")
        linhas += [d for d in dados if len(d) > 1]
        prox = pag.query_selector(f'[id="{tid}_paginator_bottom"] .ui-paginator-next:not(.ui-state-disabled)')
        if not prox:
            break
        antes = dados[:1]
        prox.click()
        for _ in range(30):
            pag.wait_for_timeout(500)
            if pag.eval_on_selector_all(f'[id="{tid}_data"] tr', "trs => trs.slice(0,1).map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim()))") != antes:
                break
    if not linhas:
        return pd.DataFrame()
    n = max(len(l) for l in linhas)
    cab = (cab + [f"col{i}" for i in range(len(cab), n)])[:n]
    return pd.DataFrame([l + [""] * (n - len(l)) for l in linhas], columns=cab)


def coletar(ano: int):
    from playwright.sync_api import sync_playwright

    st = StatusFonte("Portal da Transparência de Maceió (consultas)", BASE)
    tabelas = []
    hoje = agora()
    fim = hoje.strftime("%d/%m/%Y") if hoje.year == ano else f"31/12/{ano}"
    pasta = DOCS / "paginas" / "prefeitura-maceio"
    pasta.mkdir(parents=True, exist_ok=True)
    try:
        with sync_playwright() as pw:
            nav = pw.chromium.launch()
            pag = nav.new_page(locale="pt-BR")
            pag.set_default_timeout(120_000)
            pag.goto(BASE, wait_until="domcontentloaded")
            pag.wait_for_timeout(4000)
            try:  # ano das consultas
                opcoes = pag.eval_on_selector_all('[id="form-anoAtual:selectAno"] option', "os => os.map(o => o.value)")
                log.info("Maceió: anos disponíveis %s", opcoes)
                if str(ano) in opcoes:
                    pag.select_option('[id="form-anoAtual:selectAno"]', str(ano))
                    pag.wait_for_timeout(5000)
            except Exception as e:  # noqa: BLE001
                log.info("seleção de ano: %s", e)
            for form, aba, nome in ABAS:
                try:
                    pag.click(f'ul[role="tablist"] >> text="{aba}"', timeout=15_000)
                    pag.wait_for_timeout(1500)
                    # os dois campos de data do formulário (ids terminados em _input com valor dd/mm/aaaa)
                    ids = pag.evaluate("""(form) => [...document.getElementById(form).querySelectorAll('input[type=text]')]
                        .filter(i => /^\\d{2}\\/\\d{2}\\/\\d{4}$/.test(i.value)).map(i => i.id)""", form)
                    for cid, valor in zip(ids[:2], (f"01/01/{ano}", fim)):
                        campo = pag.locator(f'[id="{cid}"]')
                        campo.click()
                        campo.press("Control+A")
                        campo.type(valor, delay=40)
                        campo.press("Escape")
                        pag.wait_for_timeout(300)
                    lidos = [pag.locator(f'[id="{c}"]').input_value() for c in ids[:2]]
                    ano_sel = pag.evaluate("() => { const s = document.getElementById('form-anoAtual:selectAno'); return s ? s.value : null }")
                    log.info("Maceió %s: datas %s, ano %s", nome, lidos, ano_sel)
                    pag.click(f'[id="{form}"] button:has-text("Consultar")')
                    tid = form + ":" + {"tabs:form-despesas-orgao": "tabela-despesas-orgao", "tabs:form-despesas": "tabela-despesas",
                                        "tabs:form-diarias": "tabela-diarias"}[form] + "_data"
                    for _ in range(120):  # espera até 2 minutos pela resposta
                        pag.wait_for_timeout(1000)
                        txt = pag.evaluate("(id) => { const e = document.getElementById(id); return e ? e.innerText : '' }", tid)
                        if txt and "Nenhum resultado" not in txt:
                            break
                    msg = pag.evaluate("(f) => { const e = document.querySelector('[id=\"' + f + '\"] .ui-messages, [id=\"' + f + '\"] .ui-message'); return e ? e.innerText : '' }", form)
                    if msg:
                        log.info("Maceió %s: mensagem do portal: %s", nome, msg[:200])
                    (pasta / f"tabela-{re.sub('[^a-z]+', '-', nome)}.html").write_text(pag.content()[:600_000], encoding="utf-8")
                    df = _ler_tabela(pag, form)
                    log.info("Maceió %s: %d linhas, colunas %s", nome, len(df), list(df.columns)[:10])
                    if len(df):
                        tabelas.append((f"Maceió — {nome}", BASE, df))
                except Exception as e:  # noqa: BLE001
                    log.warning("Maceió %s falhou: %s", nome, e)
            nav.close()
        st.status = "ok" if tabelas else "parcial"
        st.registros = sum(len(t[2]) for t in tabelas)
        st.observacao = "; ".join(f"{n}: {len(d)} linhas" for n, _, d in tabelas) or "nenhuma tabela lida"
    except Exception as e:  # noqa: BLE001
        log.exception("Maceió falhou")
        st.status = "erro"
        st.observacao = f"{type(e).__name__}: {e}"[:400]
    return st, tabelas
