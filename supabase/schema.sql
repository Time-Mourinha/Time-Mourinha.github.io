-- Vistorias da Saúde de Maceió — esquema do banco (Supabase/Postgres).
-- Pode ser executado de novo sem perder dados (cria só o que falta e atualiza as regras).

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------ tabelas
create table if not exists public.units (
  id int primary key,
  name text not null,
  district text not null,
  kind text not null,
  address text not null default '',
  cnes text not null default '',
  status text not null default ''
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  approved boolean not null default false,
  role text not null default 'inspector' check (role in ('inspector','admin')),
  needs_code boolean not null default false,       -- primeira administradora: falta confirmar o código do e-mail
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists name text not null default '';

create table if not exists public.unit_assignments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  unit_id int not null references public.units(id) on delete cascade,
  primary key (user_id, unit_id)
);

create table if not exists public.inspections (
  id uuid primary key,
  unit_id int not null references public.units(id),
  owner uuid not null default auth.uid() references public.profiles(id),
  inspected_on date not null,
  inspector text not null default '',
  status text not null default 'draft' check (status in ('draft','completed')),
  rooms jsonb not null default '[]'::jsonb,
  general_reason text not null default '',
  general_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists inspections_unit on public.inspections(unit_id, inspected_on desc);
alter table public.inspections add column if not exists photos jsonb not null default '[]'::jsonb;  -- galeria de fotos da visita
alter table public.inspections add column if not exists observacoes jsonb not null default '[]'::jsonb;  -- observações da visita (gerais e por ambiente)
alter table public.inspections add column if not exists summary jsonb;  -- resumo pequeno (situação, pontos, principais problemas)

-- Visitas antigas compactadas: o relatório completo é apagado e fica só esta linha (poucos bytes).
create table if not exists public.visit_history (
  id uuid primary key,
  unit_id int not null references public.units(id),
  inspected_on date not null,
  inspector text not null default '',
  summary jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  compacted_at timestamptz not null default now()
);
create index if not exists visit_history_unit on public.visit_history(unit_id, inspected_on desc);

-- Links do Google Drive (PDF e fotos de cada relatório). As fotos NÃO ficam no Supabase: só o link (texto).
create table if not exists public.report_files (
  inspection_id uuid primary key references public.inspections(id) on delete cascade,
  pasta_url text not null default '',
  pdf_url text not null default '',
  pdf_id text not null default '',
  fotos jsonb not null default '{}'::jsonb,   -- { id da foto no app: id do arquivo no Drive }
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- Usuário removido: os relatórios dele ficam (sem dono); só o vínculo some.
alter table public.inspections alter column owner drop not null;
alter table public.inspections drop constraint if exists inspections_owner_fkey;
alter table public.inspections add constraint inspections_owner_fkey foreign key (owner) references public.profiles(id) on delete set null;

-- Configuração privada (sem regras de acesso: só o banco lê). Guarda o e-mail da primeira administração.
create table if not exists public.private_config (key text primary key, value text not null);
create table if not exists public.admin_code_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failures int not null default 0,
  last_used text,
  at timestamptz not null default now()
);

-- ------------------------------------------------------------------ funções de permissão
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and approved and role = 'admin');
$$;
create or replace function public.is_approved() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and approved);
$$;
create or replace function public.can_access_unit(u int) returns boolean language sql stable security definer set search_path = public as $$
  -- quem foi aprovado pode vistoriar qualquer unidade
  select public.is_approved() and exists (select 1 from units where id = u);
$$;

-- Perfil criado no cadastro. O e-mail guardado em private_config já entra como administração aprovada.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare admin_email text;
begin
  select value into admin_email from private_config where key = 'admin_email';
  -- o e-mail da administração entra direto, já aprovado; os demais esperam a aprovação dela
  insert into profiles (id, email, name, role, approved, needs_code)
  values (new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data->>'nome', ''),
          case when admin_email is not null and lower(new.email) = lower(admin_email) then 'admin' else 'inspector' end,
          admin_email is not null and lower(new.email) = lower(admin_email),
          false)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Código de segurança da administração: o Supabase envia (reauthenticate) e aqui se confere
-- com a mesma conta do Supabase Auth: sha224(e-mail + código).
create or replace function public.confirm_admin_code(code text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare u record; t record;
begin
  select id, email, reauthentication_token, reauthentication_sent_at into u from auth.users where id = auth.uid();
  if u.id is null or not exists (select 1 from profiles where id = u.id and needs_code) then return false; end if;
  if coalesce(u.reauthentication_token,'') = '' or u.reauthentication_sent_at < now() - interval '15 minutes' then return false; end if;
  select * into t from admin_code_attempts where user_id = u.id;
  if t.user_id is not null and t.failures >= 5 and t.at > now() - interval '15 minutes' then return false; end if;
  if t.user_id is not null and t.last_used = u.reauthentication_token then return false; end if;
  if encode(extensions.digest(u.email || trim(code), 'sha224'), 'hex') = u.reauthentication_token then
    perform set_config('app.admin_code', 'ok', true);
    update profiles set approved = true, role = 'admin', needs_code = false where id = u.id;
    insert into admin_code_attempts (user_id, failures, last_used, at) values (u.id, 0, u.reauthentication_token, now())
      on conflict (user_id) do update set failures = 0, last_used = excluded.last_used, at = now();
    return true;
  end if;
  insert into admin_code_attempts (user_id, failures, at) values (u.id, 1, now())
    on conflict (user_id) do update set failures = case when admin_code_attempts.at > now() - interval '15 minutes' then admin_code_attempts.failures + 1 else 1 end, at = now();
  return false;
end $$;
revoke all on function public.confirm_admin_code(text) from public, anon;
grant execute on function public.confirm_admin_code(text) to authenticated;

-- Só a administração muda aprovação e papel; ninguém tira o próprio acesso.
create or replace function public.guard_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.admin_code', true) = 'ok' then return new; end if;
  if (new.approved is distinct from old.approved or new.role is distinct from old.role or new.needs_code is distinct from old.needs_code
      or new.email is distinct from old.email) then
    if new.id = auth.uid() and new.email is distinct from old.email then raise exception 'O e-mail não pode ser trocado aqui.'; end if;
    if new.approved is distinct from old.approved or new.role is distinct from old.role or new.needs_code is distinct from old.needs_code then
      if not public.is_admin() then raise exception 'Só a administração altera acessos.'; end if;
      if new.id = auth.uid() then raise exception 'Peça a outra pessoa da administração para alterar a sua conta.'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

-- Vistoria concluída só muda pela administração; dono não troca.
create or replace function public.guard_inspection() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.owner := auth.uid();
  else
    -- dono não troca (só vira vazio quando a administração remove o usuário)
    if not (new.owner is null and old.owner::text = coalesce(current_setting('app.removendo', true), '')) then new.owner := old.owner; end if;
    new.unit_id := old.unit_id;
    if old.status = 'completed' and not public.is_admin() then raise exception 'Vistoria concluída: só a administração pode alterar.'; end if;
  end if;
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then new.completed_at := now(); end if;
  return new;
end $$;
drop trigger if exists guard_inspection on public.inspections;
create trigger guard_inspection before insert or update on public.inspections for each row execute function public.guard_inspection();

-- ------------------------------------------------------------------ compactar relatórios antigos
-- Fica o relatório completo só da ÚLTIMA vistoria de cada unidade (é ela que entra no painel e no ranking).
-- Os anteriores, depois de 30 dias (tempo de reimprimir o PDF), viram uma linha de resumo e são apagados.
create or replace function public.compactar_relatorios(dias int default 30) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with ultimas as (
    select distinct on (unit_id) id from inspections where status = 'completed'
    order by unit_id, inspected_on desc, completed_at desc nulls last
  ), velhas as (
    select i.* from inspections i
    where i.status = 'completed' and i.id not in (select id from ultimas)
      and coalesce(i.completed_at, i.updated_at) < now() - make_interval(days => dias)
  ), guardadas as (
    insert into visit_history (id, unit_id, inspected_on, inspector, summary, completed_at)
    select velhas.id, unit_id, inspected_on, inspector,
      coalesce(summary, jsonb_build_object('problemas', (select coalesce(sum(jsonb_array_length(coalesce(r->'findings', '[]'::jsonb))), 0) from jsonb_array_elements(rooms) r)))
        || case when rf.pdf_url <> '' then jsonb_build_object('pdf', rf.pdf_url, 'pasta', rf.pasta_url) else '{}'::jsonb end,
      completed_at
    from velhas left join report_files rf on rf.inspection_id = velhas.id
    on conflict (id) do nothing
    returning id
  ), apagadas as (
    delete from inspections where id in (select id from velhas) returning 1
  )
  select count(*) into n from apagadas;
  return n;
end $$;
revoke all on function public.compactar_relatorios(int) from public, anon, authenticated;

-- ------------------------------------------------------------------ remover usuário
-- Só a administração. Apaga a conta e os rascunhos dela; os relatórios concluídos ficam.
create or replace function public.remover_usuario(alvo uuid) returns void language plpgsql security definer set search_path = public, auth as $$
declare principal text;
begin
  if not public.is_admin() then raise exception 'Só a administração pode remover usuários.'; end if;
  if alvo = auth.uid() then raise exception 'Você não pode remover a própria conta.'; end if;
  select value into principal from private_config where key = 'admin_email';
  if principal is not null and exists (select 1 from profiles where id = alvo and lower(email) = lower(principal)) then
    raise exception 'A conta principal da administração não pode ser removida.';
  end if;
  delete from inspections where owner = alvo and status = 'draft';
  perform set_config('app.removendo', alvo::text, true);
  update inspections set owner = null where owner = alvo;
  perform set_config('app.removendo', '', true);
  delete from auth.users where id = alvo;
  delete from profiles where id = alvo;
end $$;
revoke all on function public.remover_usuario(uuid) from public, anon;
grant execute on function public.remover_usuario(uuid) to authenticated;

-- ------------------------------------------------------------------ regras de acesso (RLS)
alter table public.units enable row level security;
alter table public.profiles enable row level security;
alter table public.unit_assignments enable row level security;
alter table public.inspections enable row level security;
alter table public.private_config enable row level security;
alter table public.admin_code_attempts enable row level security;

drop policy if exists units_read on public.units;
create policy units_read on public.units for select to authenticated using (public.can_access_unit(id));

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists assign_read on public.unit_assignments;
create policy assign_read on public.unit_assignments for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists assign_admin on public.unit_assignments;
create policy assign_admin on public.unit_assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.report_files enable row level security;
drop policy if exists rf_read on public.report_files;
create policy rf_read on public.report_files for select to authenticated using (public.is_approved());
drop policy if exists rf_insert on public.report_files;
create policy rf_insert on public.report_files for insert to authenticated with check (public.is_approved());
drop policy if exists rf_update on public.report_files;
create policy rf_update on public.report_files for update to authenticated using (public.is_approved()) with check (public.is_approved());
drop policy if exists rf_delete on public.report_files;
create policy rf_delete on public.report_files for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.report_files to authenticated;

alter table public.visit_history enable row level security;
drop policy if exists hist_read on public.visit_history;
create policy hist_read on public.visit_history for select to authenticated using (public.is_approved());
drop policy if exists hist_admin_delete on public.visit_history;
create policy hist_admin_delete on public.visit_history for delete to authenticated using (public.is_admin());

drop policy if exists insp_read on public.inspections;
create policy insp_read on public.inspections for select to authenticated using (public.can_access_unit(unit_id));
drop policy if exists insp_insert on public.inspections;
create policy insp_insert on public.inspections for insert to authenticated with check (public.can_access_unit(unit_id));
drop policy if exists insp_update on public.inspections;
create policy insp_update on public.inspections for update to authenticated
  using (public.can_access_unit(unit_id) and (owner = auth.uid() or public.is_admin()))
  with check (public.can_access_unit(unit_id));
drop policy if exists insp_delete on public.inspections;
create policy insp_delete on public.inspections for delete to authenticated
  using (public.is_admin() or owner = auth.uid());  -- quem fez pode excluir o rascunho ou o relatório; a administração, qualquer um

-- ------------------------------------------------------------------ fotos
-- O app NÃO guarda fotos: elas ficam só no aparelho do vistoriador até o PDF do relatório.
-- (o antigo depósito "vistorias" é esvaziado e apagado pelo scripts/supabase_setup.py)
drop policy if exists vist_read on storage.objects;
drop policy if exists vist_insert on storage.objects;
drop policy if exists vist_delete on storage.objects;
drop function if exists public.can_access_path(text);

-- ------------------------------------------------------------------ avisos no celular (novos pedidos de acesso)
create extension if not exists pg_net;

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_admin());

-- Chave pública dos avisos (não é segredo; o navegador precisa dela para assinar)
create or replace function public.vapid_public_key() returns text language sql stable security definer set search_path = public as $$
  select value from private_config where key = 'vapid_public';
$$;
grant execute on function public.vapid_public_key() to authenticated;

-- Avisos para a administração: o banco chama a função "avisar", que manda o aviso para o celular.
create or replace function public.notify_admins(titulo text, texto text, destino text) returns void
language plpgsql security definer set search_path = public as $$
declare url text; chave text;
begin
  select value into url from private_config where key = 'aviso_url';
  select value into chave from private_config where key = 'aviso_chave';
  if url is null or chave is null then return; end if;
  perform net.http_post(url := url,
                        headers := jsonb_build_object('Content-Type', 'application/json', 'x-chave', chave),
                        body := jsonb_build_object('title', titulo, 'body', texto, 'url', destino));
end $$;
revoke all on function public.notify_admins(text, text, text) from public, anon, authenticated;

-- Novo pedido de acesso
create or replace function public.notify_new_request() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.approved then
    perform public.notify_admins('Novo pedido de acesso', new.email || ' pediu acesso à Fiscalização da Saúde (Secretaria Executiva). Toque para aprovar.', './#acessos');
  end if;
  return new;
end $$;

-- Quem está em visita: aviso quando uma vistoria começa e quando é concluída
create or replace function public.notify_visit() returns trigger language plpgsql security definer set search_path = public as $$
declare nome_unidade text;
begin
  select name into nome_unidade from units where id = new.unit_id;
  if tg_op = 'INSERT' then
    perform public.notify_admins('Vistoria iniciada', coalesce(nullif(new.inspector, ''), 'Alguém da equipe') || ' começou a vistoria em ' || nome_unidade || '.', './#unidades');
  elsif new.status = 'completed' and old.status <> 'completed' then
    perform public.notify_admins('Vistoria concluída', coalesce(nullif(new.inspector, ''), 'Alguém da equipe') || ' concluiu a vistoria em ' || nome_unidade || '. O relatório já está pronto.', './#painel');
  end if;
  return new;
end $$;
drop trigger if exists notify_visit on public.inspections;
create trigger notify_visit after insert or update of status on public.inspections for each row execute function public.notify_visit();

drop trigger if exists notify_new_request on public.profiles;
create trigger notify_new_request after insert on public.profiles for each row execute function public.notify_new_request();

-- Tempo real: a tela Acessos mostra pedidos novos na hora
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- Cada pessoa pode corrigir o próprio nome (aparece como vistoriador e no "em visita agora")
drop policy if exists profiles_own_name on public.profiles;
create policy profiles_own_name on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
