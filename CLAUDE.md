# TIME MOURINHA — Monitor da Gestão (Governo de Alagoas e Prefeitura de Maceió)

> Este arquivo é a especificação oficial do projeto. Toda tarefa feita neste repositório deve seguir o que está aqui.
> Idioma do site e do código (comentários, nomes de páginas): **português do Brasil**.

## 1. Missão

O **Time Mourinha** é um time de monitoramento da gestão do Governo do Estado de Alagoas. O site é o "fiscal" do time:
mostra, **secretaria por secretaria**, o que cada órgão está gastando, recebendo, entregando e onde há pontos de atenção.
O time precisa ter os dados "na ponta da língua": tudo rápido de achar, claro e com a fonte oficial ao lado.

## 1A. Duas esferas

O site tem dois botões grandes na página inicial: **Governo de Alagoas** e **Prefeitura de Maceió**.
Tudo o que está descrito abaixo vale igual para as duas. As esferas ficam em `coletor/config/geral.yaml`;
para acrescentar outra no futuro, basta um novo bloco ali. Não incluir nenhuma outra prefeitura sem pedido.

## 1B. Área do Time Mourinha

- Integrantes: **Mourinha** (chefe), **Orlandinho**, **Bené**, **Diogo**, **Fábio**, **Hamona** (com H no começo) e **Ricardo**.
  Todos jogam nos dois times (Governo e Prefeitura); o administrador pode tirar alguém de um dos times.
- **Administradores:** Bené, Mourinha e Orlandinho. Aprovam cadastros e veem as atividades de todos.
- **Cadastro:** foto do rosto tirada na hora + e-mail + senha. Fica "aguardando aprovação" até um administrador aprovar.
- **Visitante:** navega por todos os dados públicos e vê o time (nomes e fotos), mas **não vê atividades**.
- **Atividade do dia:** o integrante diz onde vai (ex.: um posto de saúde), a secretaria e o que vai observar;
  depois enche o **clipe** com fotos e vídeos com legenda; no fim marca resolvido / não resolvido / em andamento,
  o que foi resolvido e o que falta.
- **Painel de cada integrante:** números (atividades, visitas, fotos, vídeos, resolvidas, pendentes), o que fez hoje,
  gráfico dos últimos 30 dias, botões por secretaria em cada time e a linha do tempo.
- **Ao vivo:** status em tempo real de cada integrante (sinais, agenda do dia, atividades e fotos), Supabase Realtime.
  Sinais automáticos quando começa atividade, envia fotos ou marca resultado.
- **Lembretes** para todos os integrantes (e-mail + WhatsApp): 08h, 12h, 15h; resumo 18h para administradores
  (`notificacoes/lembrete.py`, `.github/workflows/lembretes.yml`). Respostas do WhatsApp entram no painel pela
  função `supabase/functions/whatsapp`. Telefones e e-mails nunca vão para o repositório.
- Backend: Supabase (Auth + Postgres + Storage), esquema e regras de segurança em `docs/supabase.sql`.
  Fotos de perfil ficam públicas; fotos e vídeos das atividades são privados (autor + administradores).

## 2. Regras de ouro (não negociáveis)

1. **Nenhum dado inventado.** Todo número exibido vem de uma fonte oficial coletada automaticamente. Nada de dados de exemplo no site publicado.
2. **Sem excluir nada.** O coletor baixa **todas** as despesas de **todos** os órgãos do exercício corrente (empenhos, liquidações e pagamentos), sem filtro de valor. Itens repetidos no portal são deduplicados pela chave do documento (nº do empenho/OB + órgão + data), nunca descartados por valor.
3. **Conferência de totais.** A cada coleta, a soma por órgão deve bater com o total exibido pelo portal. Se não bater, a diferença aparece no site na página "Saúde dos dados" (não esconder).
4. **Fonte e data em tudo.** Cada card, tabela e gráfico mostra "Fonte: … · Coletado em dd/mm/aaaa hh:mm" com link para a página original.
5. **Alerta não é acusação.** Achados incomuns são "pontos de atenção" com a regra que os gerou explicada em linguagem simples. Nunca usar palavras como "fraude", "desvio" ou "crime".
6. **Lista de secretarias descoberta automaticamente** a partir do portal (não fixar no código). Se surgir ou sumir um órgão, o site se ajusta sozinho.

## 3. Fontes de dados

Mapear cada uma antes de programar o coletor e documentar em `docs/fontes.md` (URL, formato, campos, frequência).

| Fonte | Endereço | O que pegar |
|---|---|---|
| Portal da Transparência de Alagoas (Sefaz) | https://transparencia.al.gov.br | Órgãos/unidades gestoras, despesas (empenhado, liquidado, pago) por órgão, elemento, função, programa, ação e favorecido; diárias; contratos; convênios; licitações; receitas; folha (agregada por órgão); arquivos de download/dados abertos |
| Alagoas em Dados (CKAN) | https://dados.al.gov.br/catalogo — API `/api/3/action/package_search` | Conjuntos de dados abertos do Estado, LOA/LDO, orçamento por órgão |
| Portal do Orçamento (Seplag) | localizar no site da Seplag | Dotação inicial e atualizada por órgão, fonte de recursos e região |
| Diário Oficial do Estado | https://diario.imprensaoficial.al.gov.br | Nomeações, decretos de crédito, extratos de contratos, dispensas e inexigibilidades |
| Agência Alagoas (notícias oficiais) | https://www.agenciaalagoas.al.gov.br (RSS se houver) | Notícias de entregas, inaugurações e ações por secretaria |
| Portal da Transparência federal (CGU) | API https://api.portaldatransparencia.gov.br (chave gratuita no secret `CGU_API_KEY`) | Transferências da União para o Estado por área (ex.: SUS para a Saúde) e checagem de fornecedores em CEIS/CNEP (empresas sancionadas) |
| BrasilAPI CNPJ | https://brasilapi.com.br/api/cnpj/v1/{cnpj} | Data de abertura, situação e atividade dos fornecedores |

Se uma fonte bloquear robôs ou exigir navegação, usar Playwright (Chromium headless) no GitHub Actions. Respeitar os servidores: no máximo 1 requisição por segundo e cache local.

## 4. Arquitetura

- **Hospedagem:** GitHub Pages (site estático).
- **Coleta:** GitHub Actions agendado **1x por dia às 06:00 de Maceió** (`cron: "0 9 * * *"` em UTC) + botão manual (`workflow_dispatch`).
- **Coletor:** Python 3.12 em `coletor/` (requests, pandas, playwright, duckdb). Cada fonte em um módulo próprio.
- **Dados:**
  - `dados/brutos/` — arquivos originais baixados (compactados, divididos por mês para ficar abaixo de 50 MB cada).
  - `site/dados/` — JSONs prontos para o site: `orgaos.json`, `resumo.json`, `ranking.json`, `alertas.json`, `noticias.json` e uma pasta por secretaria (`site/dados/orgaos/{sigla}/resumo.json`, `despesas-{mes}.json`).
- **Site:** HTML + CSS + JavaScript sem framework pesado; gráficos com Chart.js; busca e filtros no navegador. Funcionar bem no **celular primeiro**.
- **Testes:** `pytest` para o coletor (inclui teste de conferência de totais) e checagem de links quebrados no site.

## 5. Páginas do site

1. **Início (Painel Geral)**
   - Totais do ano: orçado, empenhado, liquidado, pago (e % de execução).
   - Ranking das secretarias (Índice Mourinha) — top 5 e últimas 5.
   - Destaques do dia: maiores pagamentos, novos alertas, notícias de entregas.
   - "Quem precisa engajar mais": secretarias com execução baixa, sem entregas noticiadas ou com muitos alertas.
2. **Secretarias** — grade com um card por órgão (nome, sigla, nota, % executado, nº de alertas). Ordenável e com busca.
3. **Página da Secretaria** (ex.: Educação, Saúde) — organizada em **botões**, nunca em uma página longa. Ver seção 5A.
4. **Ranking** — tabela completa com todos os componentes do índice.
5. **Radar de Alertas** — todos os pontos de atenção, filtráveis por órgão, tipo e valor.
6. **Fornecedores** — quem mais recebe no Estado, em quantas secretarias, desde quando a empresa existe.
7. **Notícias e Entregas** — feed classificado por secretaria.
8. **Saúde dos dados** — status de cada fonte, data da última coleta, diferenças de totais, lacunas e falhas encontradas no próprio portal.
9. **Missões** — todas as missões de fiscalização (seção 5C).
10. **Metodologia** — como tudo é coletado e calculado, em linguagem simples.

## 5A. Navegação por botões (regra principal de layout)

Os dados são enormes, então **tudo é clicável e organizado em botões**. Nenhuma página despeja tabelas longas de uma vez.

- Toda secretaria, órgão, unidade, fornecedor, contrato e alerta é um **link clicável** que abre a própria ficha.
- Cada botão mostra: ícone, título curto, **um número-resumo** (ex.: "R$ 412 mi pagos", "7 alertas", "23 obras") e uma frase dizendo **do que se trata**.
- Ao clicar, abre o detalhe com: explicação simples, gráfico, tabela com busca/filtro/paginação, download CSV e link da fonte.
- Botão "Voltar" e trilha de navegação (Início › Secretarias › Educação › Escolas › Escola X) sempre visíveis.
- No celular, os botões ficam em grade de 2 colunas.

### Botões da página de cada secretaria

| Botão | O que abre |
|---|---|
| **Painel** | Dashboard da secretaria: orçado, empenhado, liquidado, pago, evolução mês a mês, nota no Índice Mourinha |
| **Principais despesas** | Por elemento, programa/ação e favorecido — top 20 + tabela completa |
| **Principais receitas** | Fontes de recursos (Tesouro, SUS, Fundeb, convênios, operações de crédito) e transferências federais recebidas |
| **Ranking** | Posição da secretaria no Estado e ranking interno (maiores fornecedores, maiores contratos, unidades que mais/menos recebem) |
| **Unidades** | Escolas (Educação), hospitais/UPAs/unidades de saúde (Saúde), batalhões/delegacias (Segurança) etc. — lista + mapa |
| **Obras e reformas** | Todas as obras, reformas, ampliações e manutenções do órgão, com status |
| **Entregas** | Notícias oficiais de entregas, inaugurações e serviços |
| **Alertas** | Pontos de atenção do órgão |
| **Contratos e diárias** | Contratos, aditivos, convênios e diárias |
| **Onde melhorar** | Indicadores ruins, execução baixa, obras paradas, unidades com problemas |
| **O que fazer** | Missões de fiscalização sugeridas (ver 5C) |

## 5B. Unidades na ponta (escolas, unidades de saúde e demais)

**Prioridade máxima: assistência direta ao cidadão** — reformas e obras em escolas e unidades de saúde, e onde as secretarias realmente entregam.

Cada unidade tem a **sua ficha** (clicável), com botões: Dados gerais · Gastos e contratos ligados à unidade · Obras e reformas · Indicadores · Notícias · Alertas · O que fazer · Mapa.

Fontes extras para unidades (mapear em `docs/fontes.md`):

| Área | Fonte | Dados |
|---|---|---|
| Escolas | INEP — Catálogo de Escolas e Censo Escolar (microdados) | Lista de escolas estaduais de AL, código INEP, endereço, matrículas, infraestrutura (água, energia, internet, biblioteca, quadra, acessibilidade) |
| Escolas | INEP — Ideb/Saeb | Resultado por escola e evolução |
| Escolas | FNDE (PDDE, Fundeb, obras do PAR/SIMEC) | Repasses e obras financiadas por escola |
| Saúde | CNES/DATASUS | Hospitais, UPAs e unidades estaduais, leitos, equipamentos, profissionais |
| Saúde | DATASUS/FNS | Repasses federais por estabelecimento |
| Obras | Portal da Transparência AL (elementos 4.4.90.51 Obras e Instalações, 3.3.90.39 manutenção, 4.4.90.52 equipamentos), contratos e Diário Oficial (extratos e ordens de serviço) | Obras e reformas por unidade |
| Obras | Obrasgov.br / Transferegov (federal) | Obras com dinheiro federal no Estado |

Ligar gastos a unidades pelo nome/código da unidade no objeto do empenho ou contrato (busca por nome da escola/hospital e município). Quando não der para ligar com segurança, deixar em "não identificado" — nunca adivinhar.

**Status de obra/reforma:** Em dia · Atrasada (prazo vencido sem 100% pago) · Parada (sem pagamento há mais de 90 dias) · Concluída · Sem informação.

## 5C. "O que fazer" — Missões de fiscalização

Cada ponto de atenção vira uma **missão** clara para o time, em linguagem direta. Exemplos:

- "Visitar a **Escola Estadual X** (Arapiraca): reforma contratada em mar/2026 por R$ 1,2 mi, prazo venceu em set/2026 e só 40% foi pago. Verificar se a obra está andando."
- "Verificar o **Hospital Y**: 3 contratos de manutenção com o mesmo fornecedor em 60 dias, cada um abaixo do limite de dispensa."
- "Escola Z sem internet e sem quadra segundo o Censo Escolar, e nenhum gasto de infraestrutura em 2026."

Cada missão tem: unidade, município, motivo, dados de apoio (com links), prioridade (alta/média/baixa), e um **checklist de visita** (o que fotografar, o que perguntar, que documento pedir). Missões ficam numa página **Missões** geral, filtrável por secretaria, município e prioridade, e podem ser marcadas como "a fazer / em andamento / feita" (estado salvo no navegador).

## 6. Índice Mourinha (nota de 0 a 100 por secretaria)

Fórmula pública e configurável em `coletor/config/indice.yaml`. Pesos iniciais:

- **Execução (30%)** — liquidado ÷ dotação atualizada, comparado ao esperado para o mês do ano.
- **Ritmo de pagamento (15%)** — pago ÷ liquidado (quanto paga em dia).
- **Entregas (25%)** — notícias oficiais de entregas/inaugurações/serviços nos últimos 90 dias.
- **Transparência (15%)** — completude dos registros (favorecido, objeto, contrato vinculado preenchidos).
- **Atenção (15%)** — começa em 100 e perde pontos por alerta de severidade média/alta.

Mostrar sempre o aviso: "Indicador criado pelo Time Mourinha a partir de dados públicos; não é avaliação oficial."

## 7. Regras de alerta (Radar)

Cada regra fica em `coletor/alertas/` com nome, descrição simples, severidade e parâmetros configuráveis:

- **Possível fracionamento:** vários pagamentos ao mesmo fornecedor, mesmo órgão e objeto parecido, cada um logo abaixo do limite de dispensa vigente (valor do limite em config, atualizado conforme decreto federal anual).
- **Concentração:** um fornecedor recebe mais de 30% dos gastos de um elemento de despesa no órgão.
- **Empresa nova:** fornecedor com CNPJ aberto há menos de 12 meses recebendo valor alto.
- **Fornecedor sancionado:** CNPJ presente no CEIS/CNEP.
- **Valor fora da curva:** pagamento muito acima do padrão do mesmo elemento no mesmo órgão (método IQR).
- **Inconsistência:** pago maior que empenhado, empenho sem favorecido ou sem objeto, datas impossíveis.
- **Data incomum:** pagamentos em fins de semana/feriados.
- **Diárias acima da média:** servidor/órgão com diárias muito acima dos demais.
- **Falha no portal:** página fora do ar, arquivo vazio, dado atrasado ou total que não confere.

## 8. Notícias e entregas

- Coletar notícias oficiais diariamente; associar a cada secretaria por nome, sigla e palavras-chave.
- Classificar como **entrega** (inaugurou, entregou, concluiu, iniciou atendimento, pagou) ou **anúncio**.
- Guardar título, data, link e trecho curto (até 2 linhas). Não copiar a matéria inteira.

## 9. Identidade visual

- **Marca:** escudo de clube azul com faixa laranja, estrela, monograma TM e uma lupa (`site/img/marca.svg`).
- **Cores:** anil `#0A2F6B`, brasa (laranja) `#FF6A13`, giz `#FFFFFF`, névoa `#F1F4F9`, tinta `#14203A`.
- **Elemento-assinatura:** a escalação do time num campo azul.
- Fontes: Barlow Condensed (títulos, números, placar) e Barlow (texto).
- Visual moderno, alegre e limpo; cards com cantos arredondados; números grandes; linguagem simples para leigos.
- Nada de fundo preto.

## 10. Privacidade

- Folha de pagamento: mostrar **agregada por órgão** (total, nº de servidores, média). Não montar ranking de salários individuais.
- Não publicar CPF completo; mascarar como o próprio portal faz.

## 11. Ordem de construção

1. Mapear as fontes e escrever `docs/fontes.md`.
2. Coletor de órgãos + despesas do ano corrente (todas) + conferência de totais.
3. Site: Início, Secretarias, Página da Secretaria (com os botões da seção 5A), Saúde dos dados, Metodologia.
4. Unidades (escolas e unidades de saúde primeiro), Obras e reformas, mapa (Leaflet + OpenStreetMap).
5. Alertas + Radar + Fornecedores + Missões ("O que fazer").
6. Receitas/fontes de recursos + transferências federais.
7. Notícias e entregas + Índice Mourinha + Ranking.
8. Workflow diário + publicação no GitHub Pages.

Ao final de cada etapa: rodar os testes, atualizar o `README.md` e listar o que ficou pendente.

## 12. Critérios de pronto

- Todas as secretarias que aparecem no portal aparecem no site.
- Totais do site conferem com o portal (diferença exibida se houver).
- Toda informação tem fonte e data.
- Site abre rápido no celular e passa no teste de links.
- Coleta diária roda sozinha e, se falhar, abre uma *issue* automática avisando o que quebrou.
