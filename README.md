# Secretaria Executiva · Fiscalização da Saúde

A Secretaria Executiva, ligada ao Gabinete do Prefeito de Maceió, faz a fiscalização das unidades. Este site é o da área da Saúde; as próximas áreas (Educação e outras) terão o próprio site no mesmo modelo.

Aplicativo React, TypeScript e Vite, com 80 registros dos oito distritos sanitários, identificados na lista da SMS de 13/11/2026. O repositório inclui a marca fornecida, SQL para Supabase e os workflows do GitHub Actions que configuram o banco e publicam no GitHub Pages.

Endereço publicado: https://vistoria-saude.github.io

## Teste local

Execute `npm ci` e `npm run dev`. Sem variáveis de ambiente, o aplicativo abre um modo de demonstração com rascunhos no armazenamento local e anexos no IndexedDB. Use somente dados fictícios. A demonstração usa o catálogo real de endereços.

## Operação com usuários e armazenamento privado

O workflow **Configurar banco** faz a configuração sozinho, usando o segredo `SUPABASE_ACCESS_TOKEN`. Ele roda quando algo muda em `supabase/` e também pode ser disparado à mão. O que ele faz:

1. Executa `supabase/schema.sql` e depois `supabase/seed.sql`. O esquema pode ser repetido sem perder dados.
2. Habilita o login por e-mail e senha e configura a URL oficial e as URLs de redirecionamento de produção e de desenvolvimento.
3. Define a administração pelo e-mail guardado em uma tabela privada do banco (esse e-mail nunca vai para o repositório). Quem se cadastra com esse e-mail já entra aprovado como administração e aprova os demais.

Para definir a administração manualmente, use o SQL Editor: `update public.profiles set approved=true, role='admin', needs_code=false where email='SEU_EMAIL';`. Confirme que uma única linha foi atualizada.

**Confirmação de e-mail.** O e-mail gratuito do Supabase só entrega mensagens para quem faz parte da equipe do projeto. Por isso o cadastro entra direto, e quem libera o uso é a administração. Para exigir a confirmação por e-mail de todos, configure um SMTP próprio no Supabase (Authentication → Emails) e mude `mailer_autoconfirm` para `false` em `scripts/supabase_setup.py`.

A conta administradora aprova usuários no menu **Acessos**. Quem é aprovado pode vistoriar qualquer unidade. Os anexos ficam no bucket privado `vistorias`, visível só para contas aprovadas. O relatório é salvo em PDF pela impressão do navegador. O vídeo é acessado pela vistoria no aplicativo. Vistorias concluídas só podem ser alteradas pela administração.

Para rodar localmente contra o Supabase, copie `.env.example` para `.env.local` e informe a URL e a chave pública do projeto. Nunca coloque uma chave service role no frontend.

## GitHub Pages

O workflow **Publicar interface** gera o site e o publica no GitHub Pages (Settings → Pages → GitHub Actions). Ele roda a cada mudança no código e também pode ser disparado à mão. A URL e a chave pública vêm das variáveis de Actions `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Se elas não existirem, o workflow busca os dois valores pelo `SUPABASE_ACCESS_TOKEN`. As inspeções e os anexos ficam no Supabase. O frontend do Pages pode ser acessado publicamente.

Antes de usar dados reais, confira com contas de teste a aprovação, o bloqueio de quem não foi aprovado, o upload privado e a impressão. Defina com a SMS os responsáveis pelos acessos e a guarda dos relatórios.
