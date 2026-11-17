# Modelo: como criar outro site igual (Educação, Assistência, Obras…)

Este repositório é um **modelo completo**. Um site novo leva tudo o que este tem:

- **Layout**: as 3 aparências e o modo celular com abas.
- **Formulário**: ambientes um de cada vez, com a faixa "📍 Você está em". Cada ambiente é Bom, Regular ou Péssimo. Regular e Péssimo exigem descrição e foto, e toda foto exige descrição. Há também as Observações, com o que funcionários e agentes relatam.
- **Relatório em PDF (A4)**: classificação da unidade em verde, amarelo ou vermelho, situação de cada ambiente, fotos grandes por ambiente, observações. 3 estilos.
- **Painel**: ranking, problemas, ações imediatas, distritos, visitadas e as que faltam.
- **App instalável**: no Android e no iPhone, e se atualiza sozinho.
- **Avisos no celular**: novo pedido de acesso, vistoria começou, vistoria concluída.
- **Administração**: aprovar e remover usuários, excluir rascunhos de outras pessoas.
- **Economias** (lista completa no fim deste guia).

Tudo o que muda de um site para outro está em **um arquivo só**, o `modelo.config.json`. O resto se ajusta sozinho.

---

## 1. Criar o repositório a partir do modelo

O repositório precisa ter o nome `<organização>.github.io` para o site ficar em `https://<organização>.github.io`.

Pelo GitHub: abra este repositório, toque em **Use this template** e depois em **Create a new repository**.

Ou pelo terminal:

```bash
gh repo create Vistoria-Educacao/vistoria-educacao.github.io --public \
  --template Vistoria-Saude/vistoria-saude.github.io --clone
cd vistoria-educacao.github.io
```

Se o repositório tiver outro nome, o site fica em `https://<organização>.github.io/<repositório>/`. O app funciona nos dois casos.

## 2. Criar o banco (Supabase, plano grátis)

1. Em https://supabase.com/dashboard, crie um **New project**. Região: South America (São Paulo).
2. Copie a **referência do projeto**, o código que aparece no endereço `https://supabase.com/dashboard/project/<REF>`.
3. Em **Account → Access Tokens**, crie uma chave **sem data de validade**.

O plano grátis permite **2 projetos ativos por conta**. O 3º site precisa de outra conta Supabase, com outro e-mail.

## 3. Guardar os segredos no GitHub

Os segredos nunca ficam no código.

```bash
gh secret set SUPABASE_ACCESS_TOKEN   # cole a chave do passo 2.3
gh secret set ADMIN_EMAIL             # e-mail de quem vai administrar e aprovar os acessos
```

## 4. Trocar a identidade: `modelo.config.json`

```json
{
  "orgao": "Prefeitura de Maceió",
  "orgao_logo_alt": "Prefeitura de Maceió — Cidade de Todos Nós",
  "cidade": "Maceió",
  "uf": "AL",
  "secretaria": "Secretaria Executiva",
  "vinculo": "Gabinete do Prefeito",
  "area": "Educação",
  "titulo": "Fiscalização da Educação",
  "nome_curto": "Fiscalização Educação",
  "rede": "rede municipal de ensino",
  "unidade_tipo": "unidade de ensino",
  "cor": "#103656",
  "site_url": "https://vistoria-educacao.github.io",
  "supabase_ref": "<REF do passo 2>",
  "chave_local": "vistoria-educacao-demo",
  "pacote": "vistoria-educacao"
}
```

Depois rode `python3 scripts/aplicar_config.py`. Ele atualiza:

- o ícone e o nome do app no celular;
- a cor;
- os textos dos avisos;
- o banco;
- a lista de unidades do banco.

O GitHub também roda esse script sozinho a cada publicação.

## 5. O que mais costuma mudar

| O quê | Onde |
|---|---|
| Lista de unidades (nome, distrito, tipo, endereço, código) | `src/data/unidades.json`. O banco recebe o mesmo conteúdo sozinho. |
| Situações de cada ambiente (Bom, Regular, Péssimo) | `SITUACOES` em `src/lib/modelo.ts` |
| Regra da classificação da unidade (verde, amarelo, vermelho) | `nivelDe` e `REGRA_CLASSIFICACAO` em `src/lib/analise.ts` |
| Ambientes sugeridos (Recepção, Sala de aula…) | `AMBIENTES_SUGERIDOS` em `src/lib/modelo.ts` |
| O que cada problema causa (texto do painel e do relatório) | `IMPACTOS` em `src/lib/analise.ts` |
| Logotipo do topo e do relatório | `src/assets/marca.png` |
| Ícones do app instalado | `public/icones/` (192, 512, maskable 512, apple-touch 180) |
| Cores das 3 aparências | `src/visual.css` (início do arquivo) |

Para a Educação, por exemplo, troque "Consultório", "Vacinação" e "Farmácia" por "Sala de aula", "Cozinha/Refeitório", "Quadra", "Biblioteca" e assim por diante.

## 6. Ligar o site

```bash
# GitHub Pages publicando pelo Actions
gh api -X POST repos/<org>/<repo>/pages -f build_type=workflow

# na ordem:
gh workflow run "Configurar banco"          # cria tabelas, regras, unidades, login, avisos
gh workflow run "Conta da administração"    # manda ao ADMIN_EMAIL o link para criar a senha
gh workflow run "Publicar interface"        # gera e publica o site
gh workflow run "Testar banco"              # teste de ponta a ponta (cria e apaga um usuário de teste)
```

Pronto. O robô **Manter banco ativo** passa a rodar sozinho a cada 3 dias.

## 7. Comandos do dia a dia

```bash
npm ci && npm run dev                 # rodar no computador (sem Supabase abre o modo demonstração)
npm run build                         # conferir se compila
python3 scripts/aplicar_config.py     # depois de mudar modelo.config.json ou unidades.json
gh workflow run "Manter banco ativo"  # faxina e verificação na hora
gh run list                           # ver se os robôs rodaram bem
```

---

## Economias (já vêm no modelo, custo zero)

1. **Nenhuma foto vai para o servidor.** As fotos ficam só no aparelho até o PDF. Depois são apagadas pelo botão "Já salvei o PDF" ou sozinhas em 24 h. Só se aceitam fotos, sem vídeo.
2. **Um relatório completo por unidade.** Os anteriores viram um resumo de poucos bytes após 30 dias: data, quem fez, situação e 5 principais problemas. Função `compactar_relatorios` no banco.
3. **Faxina a cada 3 dias.** Apaga rascunhos parados há 30 dias, registros de login antigos, respostas dos avisos e tentativas de código.
4. **Banco sempre ativo.** O robô consulta o banco a cada 3 dias, para o plano grátis não pausar o projeto, e religa se ele pausar. O robô também mantém o próprio agendamento ligado.
5. **Pouco tráfego.** O histórico de visitas antigas só é baixado ao abrir "Visitadas", e só os últimos 12 meses, com um botão para ver os mais antigos.
6. **Espaço monitorado.** Cada execução do robô mostra quanto do banco de 500 MB está usado. Acima de 400 MB, ele avisa.

## Segurança

- Telefones, e-mails e chaves **nunca** entram no repositório. O e-mail da administração fica numa tabela privada do banco.
- A chave do Supabase fica só como segredo do GitHub.
- Quem se cadastra só entra depois de aprovado. Relatórios concluídos só mudam pela administração.
- Rascunhos podem ser excluídos por quem fez e pela administração.

## Mapa dos arquivos

```
modelo.config.json          identidade do site (o único arquivo obrigatório de trocar)
src/data/unidades.json      unidades
src/App.tsx                 telas: início, unidades, relatórios, navegação
src/Formulario.tsx          vistoria (ambientes, checklist em botões, fotos, terminar)
src/Painel.tsx              painel (ranking, problemas, visitadas, faltam…)
src/Relatorio.tsx           relatório em PDF (3 estilos)
src/Acessos.tsx             aprovar e remover usuários, avisos no celular
src/lib/modelo.ts           checklist, ambientes, tipos, link do mapa
src/lib/analise.ts          pontuação, situação, impactos, ranking
src/lib/armazenamento.ts    banco, fotos no aparelho
src/lib/pwa.ts, atualizar.ts  instalar o app, avisos, atualização automática
src/estilo.css, visual.css  layout e aparências
public/                     ícones, manifest (app instalável), sw.js (avisos e atualização)
supabase/schema.sql         tabelas, regras de acesso, avisos, compactação, remover usuário
supabase/functions/avisar   envia os avisos ao celular
scripts/                    aplicar_config, supabase_setup, conta_admin, teste_banco
.github/workflows/          Publicar interface, Configurar banco, Conta da administração,
                            Testar banco, Manter banco ativo
```
