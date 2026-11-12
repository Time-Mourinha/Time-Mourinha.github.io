-- =====================================================================
-- TIME MOURINHA — banco de dados da área do time (Supabase)
-- Como usar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar de novo sem problema (é idempotente).
-- =====================================================================

-- ---------- PERFIS (um por pessoa cadastrada)
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  membro_id text,                       -- mourinha, bene, orlandinho... (ver site/js/config.js)
  email text,
  foto_path text,                       -- caminho da foto no Storage
  papel text not null default 'pendente' check (papel in ('pendente','membro','admin','bloqueado')),
  esferas text[] not null default array['governo-al','prefeitura-maceio'],
  criado_em timestamptz not null default now()
);

-- Cria o perfil automaticamente quando alguém se cadastra (fica "pendente" até um admin aprovar)
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, membro_id, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome',''), new.raw_user_meta_data->>'membro_id', new.email)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists ao_cadastrar on auth.users;
create trigger ao_cadastrar after insert on auth.users for each row execute function public.novo_usuario();

create or replace function public.eh_membro() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and papel in ('membro','admin'));
$$;
create or replace function public.eh_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and papel = 'admin');
$$;

-- ---------- ATIVIDADES (visitas, reuniões... de cada membro)
create table if not exists public.atividades (
  id uuid primary key default gen_random_uuid(),
  autor uuid not null references public.perfis(id) on delete cascade default auth.uid(),
  data date not null default (now() at time zone 'America/Maceio')::date,
  esfera text not null,                 -- governo-al | prefeitura-maceio
  orgao_id text,                        -- id da secretaria no site (ex.: sesau)
  orgao_nome text,
  unidade_id text,                      -- escola/unidade de saúde, se for o caso
  local text,                           -- ex.: "Posto de Saúde do bairro X"
  tipo text not null default 'Visita',
  titulo text not null,
  descricao text,                       -- o que vai fazer / observar
  situacao text not null default 'em_andamento' check (situacao in ('em_andamento','resolvido','nao_resolvido')),
  resolvido text,                       -- o que foi resolvido
  pendente text,                        -- o que não foi resolvido / falta fazer
  missao_id text,
  lat double precision, lon double precision,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists atividades_autor on public.atividades(autor, data desc);
create index if not exists atividades_orgao on public.atividades(esfera, orgao_id);

-- ---------- MÍDIAS (o "clipe": fotos e vídeos de cada atividade)
create table if not exists public.midias (
  id uuid primary key default gen_random_uuid(),
  atividade_id uuid not null references public.atividades(id) on delete cascade,
  autor uuid not null references public.perfis(id) on delete cascade default auth.uid(),
  path text not null,
  tipo text not null check (tipo in ('foto','video')),
  legenda text,
  tamanho_bytes bigint,
  criado_em timestamptz not null default now()
);
create index if not exists midias_atividade on public.midias(atividade_id);

-- ---------- STATUS DAS MISSÕES (a fazer / em andamento / feita)
create table if not exists public.missoes_status (
  esfera text not null,
  missao_id text not null,
  situacao text not null default 'a_fazer' check (situacao in ('a_fazer','em_andamento','feita')),
  responsavel uuid references public.perfis(id),
  atualizado_em timestamptz not null default now(),
  primary key (esfera, missao_id)
);

-- ---------- VITRINE: nome e foto de cada integrante aprovado (visível até para visitantes)
create or replace view public.vitrine as
  select id, nome, membro_id, foto_path, papel, esferas from public.perfis where papel in ('membro','admin');
grant select on public.vitrine to anon, authenticated;

-- ---------- SEGURANÇA (RLS)
-- Atividades, fotos e vídeos: só o próprio autor e os ADMINISTRADORES veem.
-- Visitante não vê nenhuma atividade.
alter table public.perfis enable row level security;
alter table public.atividades enable row level security;
alter table public.midias enable row level security;
alter table public.missoes_status enable row level security;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select using (id = auth.uid() or public.eh_admin());
drop policy if exists perfis_editar_proprio on public.perfis;
create policy perfis_editar_proprio on public.perfis for update using (id = auth.uid())
  with check (id = auth.uid() and papel = (select p.papel from public.perfis p where p.id = auth.uid())
              and esferas = (select p.esferas from public.perfis p where p.id = auth.uid()));
drop policy if exists perfis_admin on public.perfis;
create policy perfis_admin on public.perfis for update using (public.eh_admin());

drop policy if exists atv_ler on public.atividades;
create policy atv_ler on public.atividades for select using (autor = auth.uid() or public.eh_admin());
drop policy if exists atv_criar on public.atividades;
create policy atv_criar on public.atividades for insert with check (public.eh_membro() and autor = auth.uid());
drop policy if exists atv_editar on public.atividades;
create policy atv_editar on public.atividades for update using (autor = auth.uid() or public.eh_admin());
drop policy if exists atv_apagar on public.atividades;
create policy atv_apagar on public.atividades for delete using (autor = auth.uid() or public.eh_admin());

drop policy if exists mid_ler on public.midias;
create policy mid_ler on public.midias for select using (autor = auth.uid() or public.eh_admin());
drop policy if exists mid_criar on public.midias;
create policy mid_criar on public.midias for insert with check (public.eh_membro() and autor = auth.uid());
drop policy if exists mid_apagar on public.midias;
create policy mid_apagar on public.midias for delete using (autor = auth.uid() or public.eh_admin());

drop policy if exists ms_ler on public.missoes_status;
create policy ms_ler on public.missoes_status for select using (public.eh_membro());
drop policy if exists ms_gravar on public.missoes_status;
create policy ms_gravar on public.missoes_status for all using (public.eh_membro()) with check (public.eh_membro());

-- ---------- STORAGE
-- "perfis": fotos de rosto (públicas, aparecem para visitantes)
-- "midias": fotos e vídeos das visitas (privadas: autor + administradores)
insert into storage.buckets (id, name, public, file_size_limit)
values ('perfis', 'perfis', true, 5242880) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit)
values ('midias', 'midias', false, 52428800)   -- 50 MB por arquivo (limite do plano grátis)
on conflict (id) do nothing;

drop policy if exists perfis_foto_enviar on storage.objects;
create policy perfis_foto_enviar on storage.objects for insert
  with check (bucket_id = 'perfis' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists perfis_foto_trocar on storage.objects;
create policy perfis_foto_trocar on storage.objects for update
  using (bucket_id = 'perfis' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists midias_ler on storage.objects;
create policy midias_ler on storage.objects for select
  using (bucket_id = 'midias' and (public.eh_admin() or (storage.foldername(name))[1] = auth.uid()::text));
drop policy if exists midias_enviar on storage.objects;
create policy midias_enviar on storage.objects for insert
  with check (bucket_id = 'midias' and public.eh_membro() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists midias_trocar on storage.objects;
create policy midias_trocar on storage.objects for update
  using (bucket_id = 'midias' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists midias_apagar on storage.objects;
create policy midias_apagar on storage.objects for delete
  using (bucket_id = 'midias' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_admin()));

-- =====================================================================
-- PRIMEIRO ADMINISTRADOR
-- Depois que o Bené se cadastrar no site, rode só a linha abaixo trocando o e-mail:
--   update public.perfis set papel = 'admin' where email = 'EMAIL-DO-BENE@exemplo.com';
-- A partir daí o Bené aprova os outros e torna Mourinha e Orlandinho administradores
-- pela página "Administração" do site.
-- =====================================================================

-- =====================================================================
-- AO VIVO: status em tempo real, agenda do dia e lembretes
-- =====================================================================
alter table public.perfis add column if not exists telefone text;              -- WhatsApp com DDD, ex.: 5582999999999
alter table public.perfis add column if not exists notificar_email boolean not null default true;
alter table public.perfis add column if not exists notificar_whatsapp boolean not null default true;

-- Cada "sinal" do integrante: "em home office com o Mourinha", "indo para o posto X", "enviou 3 fotos"...
create table if not exists public.atualizacoes (
  id uuid primary key default gen_random_uuid(),
  autor uuid not null references public.perfis(id) on delete cascade default auth.uid(),
  texto text not null,
  tipo text not null default 'outro',   -- home_office | deslocamento | em_atividade | reuniao | escritorio | encerrado | midia | outro
  local text,
  atividade_id uuid references public.atividades(id) on delete set null,
  origem text not null default 'site' check (origem in ('site','whatsapp','automatico')),
  criado_em timestamptz not null default now()
);
create index if not exists atualizacoes_autor on public.atualizacoes(autor, criado_em desc);

-- Programação do dia: "9h reunião no Sebrae"
create table if not exists public.agenda (
  id uuid primary key default gen_random_uuid(),
  autor uuid not null references public.perfis(id) on delete cascade default auth.uid(),
  data date not null default (now() at time zone 'America/Maceio')::date,
  hora time,
  texto text not null,
  local text,
  feito boolean not null default false,
  origem text not null default 'site',
  criado_em timestamptz not null default now()
);
create index if not exists agenda_autor on public.agenda(autor, data);

alter table public.atualizacoes enable row level security;
alter table public.agenda enable row level security;
drop policy if exists atu_ler on public.atualizacoes;
create policy atu_ler on public.atualizacoes for select using (autor = auth.uid() or public.eh_admin());
drop policy if exists atu_criar on public.atualizacoes;
create policy atu_criar on public.atualizacoes for insert with check (public.eh_membro() and autor = auth.uid());
drop policy if exists atu_apagar on public.atualizacoes;
create policy atu_apagar on public.atualizacoes for delete using (autor = auth.uid() or public.eh_admin());
drop policy if exists ag_ler on public.agenda;
create policy ag_ler on public.agenda for select using (autor = auth.uid() or public.eh_admin());
drop policy if exists ag_criar on public.agenda;
create policy ag_criar on public.agenda for insert with check (public.eh_membro() and autor = auth.uid());
drop policy if exists ag_editar on public.agenda;
create policy ag_editar on public.agenda for update using (autor = auth.uid() or public.eh_admin());
drop policy if exists ag_apagar on public.agenda;
create policy ag_apagar on public.agenda for delete using (autor = auth.uid() or public.eh_admin());

-- Liga o "tempo real" (o painel Ao vivo atualiza sozinho)
do $$
declare t text;
begin
  foreach t in array array['atualizacoes','agenda','atividades','midias'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- PODERES: o DONO (Bené) faz tudo; os ADMINISTRADORES têm os poderes que o dono liberar
--   aprovar    → aprovar cadastros e escolher em qual time cada um joga
--   agenda     → mexer na Agenda do Mourinha
--   cobrancas  → tarefas, contatos e cobranças pelo WhatsApp
-- =====================================================================
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('pendente','membro','admin','dono','bloqueado'));
alter table public.perfis add column if not exists poderes text[] not null default '{}';
update public.perfis set poderes = array['aprovar','agenda','cobrancas'] where papel = 'admin' and poderes = '{}';

create or replace function public.eh_membro() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and papel in ('membro','admin','dono'));
$$;
create or replace function public.eh_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and papel in ('admin','dono'));
$$;
create or replace function public.eh_dono() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and papel = 'dono');
$$;
create or replace function public.tem_poder(p text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and (papel = 'dono' or (papel = 'admin' and p = any(poderes))));
$$;

create or replace view public.vitrine as
  select id, nome, membro_id, foto_path, papel, esferas from public.perfis where papel in ('membro','admin','dono');
grant select on public.vitrine to anon, authenticated;

-- Quem pode mudar o quê nos cadastros
create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare meu text;
begin
  if auth.uid() is null then return new; end if;              -- ajustes feitos pelo próprio sistema
  select papel into meu from perfis where id = auth.uid();
  if meu = 'dono' then
    if old.id = auth.uid() and new.papel <> 'dono' then raise exception 'O dono não pode tirar o próprio poder.'; end if;
    return new;
  end if;
  if new.poderes is distinct from old.poderes then raise exception 'Só o dono muda os poderes.'; end if;
  if new.papel is distinct from old.papel or new.esferas is distinct from old.esferas then
    if old.papel in ('admin','dono') or new.papel in ('admin','dono') then raise exception 'Só o dono define administradores.'; end if;
    if not public.tem_poder('aprovar') then raise exception 'Você não tem o poder de aprovar cadastros.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists proteger_perfil on public.perfis;
create trigger proteger_perfil before update on public.perfis for each row execute function public.proteger_perfil();

-- O primeiro cadastro do Bené vira o dono (só enquanto não existir dono)
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare papel_inicial text := 'pendente';
begin
  if new.raw_user_meta_data->>'membro_id' = 'bene' and not exists (select 1 from perfis where papel = 'dono') then
    papel_inicial := 'dono';
  end if;
  insert into public.perfis (id, nome, membro_id, email, papel)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome',''), new.raw_user_meta_data->>'membro_id', new.email, papel_inicial)
  on conflict (id) do nothing;
  return new;
end $$;
update public.perfis set papel = 'dono'
 where not exists (select 1 from public.perfis where papel = 'dono')
   and id = (select id from public.perfis where membro_id = 'bene' and papel <> 'bloqueado' order by criado_em limit 1);

-- =====================================================================
-- AGENDA DO MOURINHA, CONTATOS, TAREFAS (COBRANÇAS) E LEMBRETES PELO WHATSAPP
-- =====================================================================
create table if not exists public.agenda_chefe (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  hora time,
  titulo text not null,                 -- "Reunião no Hospital do Coração"
  local text,
  pauta text,                           -- o que vai ser tratado
  participantes text,
  decidido text,                        -- o que ficou decidido (ata curta)
  situacao text not null default 'marcado' check (situacao in ('marcado','realizado','cancelado')),
  criado_por uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists agenda_chefe_data on public.agenda_chefe(data, hora);

-- Pessoas de fora do time que recebem cobranças e lembretes (ex.: Sônia, do hospital; Fernando)
create table if not exists public.contatos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,               -- WhatsApp com DDD: 5582999999999
  cargo text,
  orgao text,
  observacao text,
  criado_por uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now()
);

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,   -- aparece como T1, T2... na mensagem
  titulo text not null,                 -- "Resolver 3 eletrocardiogramas"
  detalhes text,
  reuniao_id uuid references public.agenda_chefe(id) on delete set null,
  contato_id uuid references public.contatos(id) on delete set null,
  responsavel_nome text,
  telefone text,
  prazo date,
  situacao text not null default 'aberta' check (situacao in ('aberta','parcial','resolvido','nao_resolvido')),
  cobrancas int not null default 0,
  ultima_cobranca timestamptz,
  ultima_resposta text,
  ultima_resposta_em timestamptz,
  criado_por uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists tarefas_situacao on public.tarefas(situacao, prazo);

-- Linha do tempo de cada tarefa: cobranças enviadas, respostas, mudanças de situação
create table if not exists public.tarefa_eventos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  tipo text not null check (tipo in ('cobranca','resposta','nota','situacao','lembrete')),
  texto text,
  situacao text,
  canal text not null default 'site' check (canal in ('site','whatsapp','link')),
  autor uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists tarefa_eventos_tarefa on public.tarefa_eventos(tarefa_id, criado_em);

-- Mensagens programadas ("Fernando, amanhã lembrar da agenda do Mourinha")
create table if not exists public.lembretes (
  id uuid primary key default gen_random_uuid(),
  contato_id uuid references public.contatos(id) on delete set null,
  nome text,
  telefone text not null,
  mensagem text not null,
  incluir_agenda boolean not null default false,   -- junta a agenda do Mourinha do dia na mensagem
  enviar_em timestamptz not null,
  situacao text not null default 'agendado' check (situacao in ('agendado','enviado','erro','cancelado')),
  erro text,
  enviado_em timestamptz,
  tarefa_id uuid references public.tarefas(id) on delete cascade,
  criado_por uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists lembretes_fila on public.lembretes(situacao, enviar_em);

alter table public.agenda_chefe enable row level security;
alter table public.contatos enable row level security;
alter table public.tarefas enable row level security;
alter table public.tarefa_eventos enable row level security;
alter table public.lembretes enable row level security;

drop policy if exists agc_ler on public.agenda_chefe;
create policy agc_ler on public.agenda_chefe for select using (public.eh_membro());
drop policy if exists agc_gravar on public.agenda_chefe;
create policy agc_gravar on public.agenda_chefe for all using (public.tem_poder('agenda')) with check (public.tem_poder('agenda'));

drop policy if exists ct_tudo on public.contatos;
create policy ct_tudo on public.contatos for all using (public.tem_poder('cobrancas')) with check (public.tem_poder('cobrancas'));

drop policy if exists tf_ler on public.tarefas;
create policy tf_ler on public.tarefas for select using (public.eh_membro());
drop policy if exists tf_gravar on public.tarefas;
create policy tf_gravar on public.tarefas for all using (public.tem_poder('cobrancas')) with check (public.tem_poder('cobrancas'));

drop policy if exists te_ler on public.tarefa_eventos;
create policy te_ler on public.tarefa_eventos for select using (public.eh_membro());
drop policy if exists te_gravar on public.tarefa_eventos;
create policy te_gravar on public.tarefa_eventos for insert with check (public.tem_poder('cobrancas'));

drop policy if exists lb_tudo on public.lembretes;
create policy lb_tudo on public.lembretes for all using (public.tem_poder('cobrancas')) with check (public.tem_poder('cobrancas'));

do $$
declare t text;
begin
  foreach t in array array['agenda_chefe','tarefas','tarefa_eventos','lembretes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Relógio que dispara os lembretes programados a cada 5 minutos (instalado pelo supabase_setup.py)
create extension if not exists pg_net;
create extension if not exists pg_cron;
