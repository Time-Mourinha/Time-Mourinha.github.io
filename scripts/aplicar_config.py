"""Aplica o modelo.config.json em todos os arquivos que não conseguem ler o JSON sozinhos
(ícone do celular, avisos, banco, seed das unidades). Roda sozinho no GitHub Actions antes de
publicar e de configurar o banco; pode rodar à mão também:  python scripts/aplicar_config.py
"""
from __future__ import annotations

import json
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parent.parent
C = json.loads((RAIZ / "modelo.config.json").read_text(encoding="utf-8"))
NOME = f"{C['secretaria']} · {C['titulo']}"
PEDIDO = f"pediu acesso à {C['titulo']} ({C['secretaria']}). Toque para aprovar."


def editar(rel: str, pares: list[tuple[str, str]]):
    p = RAIZ / rel
    s = p.read_text(encoding="utf-8")
    for padrao, novo in pares:
        s, n = re.subn(padrao, lambda _m: novo, s)
        if not n:
            raise SystemExit(f"{rel}: não achei {padrao!r}")
    p.write_text(s, encoding="utf-8")


# ícone/instalação no celular
m = json.loads((RAIZ / "public/manifest.webmanifest").read_text(encoding="utf-8"))
m.update(name=NOME, short_name=C["nome_curto"], theme_color=C["cor"],
         description=f"{C['secretaria']} ({C['vinculo']}): fiscalização das unidades da {C['rede']} de {C['cidade']}.")
(RAIZ / "public/manifest.webmanifest").write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

editar("index.html", [(r'<meta name="theme-color" content="[^"]*">', f'<meta name="theme-color" content="{C["cor"]}">'),
                      (r"<title>[^<]*</title>", f"<title>{NOME}</title>")])
editar("public/sw.js", [(r"d\.title \|\| '[^']*'", f"d.title || '{NOME}'")])
editar("supabase/functions/avisar/index.ts", [(r"pediu acesso à [^`]*?Toque para aprovar\.", PEDIDO)])
editar("supabase/schema.sql", [(r"' pediu acesso à [^']*?Toque para aprovar\.'", f"' {PEDIDO}'")])

pk = json.loads((RAIZ / "package.json").read_text(encoding="utf-8"))
pk["name"] = C["pacote"]
pk["description"] = f"{NOME}: checklist de vistoria das unidades, com fotos e relatório em PDF."
(RAIZ / "package.json").write_text(json.dumps(pk, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# unidades: o app usa src/data/unidades.json; o banco recebe o mesmo conteúdo pelo seed.sql
uns = json.loads((RAIZ / "src/data/unidades.json").read_text(encoding="utf-8"))
q = lambda x: "'" + str(x).replace("'", "''") + "'"
linhas = ",\n".join(f"({u['id']}, {q(u['name'])}, {q(u['district'])}, {q(u['kind'])}, {q(u['address'])}, {q(u['cnes'])}, {q(u['status'])})" for u in uns)
(RAIZ / "supabase/seed.sql").write_text(
    f"-- {len(uns)} unidades (gerado de src/data/unidades.json por scripts/aplicar_config.py; não edite à mão).\n"
    "insert into public.units (id, name, district, kind, address, cnes, status) values\n" + linhas + "\n"
    "on conflict (id) do update set name = excluded.name, district = excluded.district, kind = excluded.kind,\n"
    "  address = excluded.address, cnes = excluded.cnes, status = excluded.status;\n"
    f"delete from public.units where id not in ({', '.join(str(u['id']) for u in uns)})\n"
    "  and not exists (select 1 from public.inspections i where i.unit_id = units.id)\n"
    "  and not exists (select 1 from public.visit_history h where h.unit_id = units.id);\n", encoding="utf-8")
print(f"Modelo aplicado: {NOME} · {len(uns)} unidades · banco {C['supabase_ref']} · site {C['site_url']}")
