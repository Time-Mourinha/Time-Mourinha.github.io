# Time Mourinha

Monitor da gestão do **Governo de Alagoas** e da **Prefeitura de Maceió**, secretaria por secretaria,
com a área do time (cadastro com foto, atividades do dia com fotos e vídeos).

- **Dados públicos** (qualquer pessoa vê): secretarias, despesas, receitas, obras e reformas, escolas,
  unidades de saúde, alertas, missões, ranking, fornecedores e entregas.
- **Área do time**: visitante vê o time e as fotos dos integrantes, mas **não vê as atividades**.
  Cada integrante vê as próprias atividades. **Administradores** (Bené, Mourinha e Orlandinho) veem todas
  e aprovam os cadastros.

## Como está organizado

| Pasta | O que tem |
|---|---|
| `site/` | O site (HTML, CSS e JavaScript). É o que vai para o GitHub Pages. |
| `coletor/` | O robô em Python que coleta os dados todo dia às 18h. |
| `coletor/config/geral.yaml` | Endereços dos portais das duas esferas. Dá para acrescentar outra esfera aqui. |
| `coletor/config/regras.yaml` | Regras dos alertas e pesos do Índice Mourinha. |
| `docs/supabase.sql` | Banco de dados da área do time (rodar uma vez no Supabase). |
| `docs/mapa-portal-*.json` | Mapa de cada portal, gerado pelo robô. Serve para ajustar o coletor. |
| `.github/workflows/coleta.yml` | Roda a coleta todo dia e publica o site. |

## Colocar no ar (uma vez)

1. **GitHub Pages:** em *Settings → Pages → Source*, escolha **GitHub Actions**.
2. **Permissões:** em *Settings → Actions → General → Workflow permissions*, marque **Read and write permissions** e clique em *Save*.
3. **Primeira coleta:** na aba *Actions*, abra **Coleta diária e publicação**, clique em **Run workflow** e espere ficar verde (pode levar de 20 a 60 minutos).
   O site fica em `https://SEU-USUARIO.github.io/time-mourinha/`.
4. *(Opcional)* **Empresas punidas:** peça a chave grátis da API do Portal da Transparência federal e cadastre em
   *Settings → Secrets and variables → Actions → New repository secret* com o nome `CGU_API_KEY`.

## Ligar a área do time (Supabase, grátis)

1. Crie uma conta em supabase.com e um projeto novo (região *South America (São Paulo)*).
2. Em **SQL Editor → New query**, cole todo o conteúdo de `docs/supabase.sql` e clique em **Run**.
3. Em **Authentication → Sign In / Providers → Email**, desligue **Confirm email**. Assim o cadastro já entra direto (a aprovação continua sendo feita pelo administrador).
4. Em **Authentication → URL Configuration**, coloque o endereço do site em *Site URL*.
5. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public** e cole em `site/js/config.js`.
6. No site, o Bené faz o cadastro. Depois, no SQL Editor, rode:
   `update public.perfis set papel = 'admin' where email = 'EMAIL-DO-BENE';`
   A partir daí o Bené aprova os outros pela página **Administração** e torna Mourinha e Orlandinho administradores.

### Espaço para fotos e vídeos

O plano grátis do Supabase guarda **1 GB** de arquivos, com no máximo **50 MB por arquivo**.
O site já diminui as fotos antes de enviar (entre 300 e 500 KB cada, então cabem umas 2 mil fotos).
Vídeo pesa mais: grave vídeos curtos (até 1 minuto, em 720p). Se o espaço acabar, o plano Pro
do Supabase custa US$ 25 por mês e dá 100 GB. Nada disso usa o armazenamento do seu celular ou da sua nuvem.

## Na mídia e Manual do fiscal

- **Na mídia (72h):** notícias negativas da imprensa sobre cada secretaria, atualizadas às 7h, 12h e 17h.
  Cada uma mostra o que cobrar, o que fazer e a situação da cobrança.
- **Manual do fiscal:** página com o que cobrar e o que fazer em cada tipo de problema.

## Ao vivo e lembretes automáticos

- **Painel Ao vivo** (`#/ao-vivo`): os administradores veem, em tempo real, onde está cada integrante,
  a programação do dia, as atividades e as fotos que acabaram de chegar. Quem não deu sinal no dia aparece em vermelho.
- **Lembretes para todos os integrantes aprovados**, por e-mail e WhatsApp:
  08h "já começou sua atividade do dia?", 12h "como estão as visitas?", 15h "já finalizou o dia?",
  18h resumo do dia por e-mail para os administradores. (O GitHub pode atrasar alguns minutos.)
- **Respostas pelo WhatsApp** entram direto no painel: "hoje estou em home office com o Mourinha" vira o status;
  "9h reunião no Sebrae" vira compromisso na agenda do dia.
- Cada integrante coloca o próprio WhatsApp em **Meu perfil** no site. Telefones e e-mails ficam só no banco
  do Supabase, **nunca** neste repositório (que é público).

### Ligar o e-mail (grátis)
1. Numa conta Gmail do time, ative a verificação em duas etapas e crie uma **senha de app**
   (Conta Google → Segurança → Senhas de app).
2. No GitHub, em *Settings → Secrets and variables → Actions*, crie:
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (chave *service_role* do Supabase — é secreta, nunca coloque no site),
   `SITE_URL` (endereço do site), `GMAIL_USER` e `GMAIL_APP_PASSWORD`.

### Ligar o WhatsApp (API oficial da Meta)
1. Use um **número só para o robô** (um chip novo), não o WhatsApp pessoal de ninguém.
2. Em developers.facebook.com crie um app do tipo *Business*, adicione o produto **WhatsApp** e cadastre o número.
3. Crie o modelo de mensagem **lembrete_time_mourinha** (categoria *Utilidade*, idioma *Português (BR)*) com o texto:
   `Olá, {{1}}! {{2}} Responda por aqui ou abra: {{3}}`
4. Gere um token permanente (usuário do sistema) e anote o *Phone number ID*.
5. No GitHub, crie os segredos `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` e `WHATSAPP_TEMPLATE` (= lembrete_time_mourinha).
6. No Supabase, em *Edge Functions*, crie a função **whatsapp** com o conteúdo de `supabase/functions/whatsapp/index.ts`,
   **desligue "Verify JWT"** e cadastre os segredos `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`,
   `WHATSAPP_VERIFY_TOKEN` (uma senha que você inventa) e `WHATSAPP_APP_SECRET` (do app da Meta).
7. Na Meta, em *WhatsApp → Configuração → Webhook*, coloque a URL
   `https://SEU-PROJETO.supabase.co/functions/v1/whatsapp`, o mesmo `WHATSAPP_VERIFY_TOKEN`, e assine o campo **messages**.

Custo: a Meta cobra cada mensagem de modelo enviada (alguns centavos de dólar por mensagem no Brasil).
Com 7 integrantes e 3 lembretes por dia, fica na casa de poucos dólares por mês. O e-mail é grátis.

## Rodar no computador (opcional)

```bash
pip install -r requirements.txt
python -m playwright install chromium
python -m coletor.main                      # coleta as duas esferas
python -m coletor.main --esfera governo-al  # só uma
python -m pytest -q tests
cd site && python -m http.server 8000       # abre em http://localhost:8000
```

## Regras de ouro

Nenhum dado inventado. Sem excluir nenhuma despesa. Fonte e data em tudo.
Alerta é ponto de atenção, não acusação. Detalhes em `CLAUDE.md`.
