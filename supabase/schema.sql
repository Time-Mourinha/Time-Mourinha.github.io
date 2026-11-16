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
    new.owner := old.owner;
    new.unit_id := old.unit_id;
    if old.status = 'completed' and not public.is_admin() then raise exception 'Vistoria concluída: só a administração pode alterar.'; end if;
  end if;
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then new.completed_at := now(); end if;
  return new;
end $$;
drop trigger if exists guard_inspection on public.inspections;
create trigger guard_inspection before insert or update on public.inspections for each row execute function public.guard_inspection();

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

drop policy if exists insp_read on public.inspections;
create policy insp_read on public.inspections for select to authenticated using (public.can_access_unit(unit_id));
drop policy if exists insp_insert on public.inspections;
create policy insp_insert on public.inspections for insert to authenticated with check (public.can_access_unit(unit_id));
drop policy if exists insp_update on public.inspections;
create policy insp_update on public.inspections for update to authenticated
  using (public.can_access_unit(unit_id) and (owner = auth.uid() or public.is_admin()))
  with check (public.can_access_unit(unit_id));
drop policy if exists insp_delete on public.inspections;
create policy insp_delete on public.inspections for delete to authenticated using (public.is_admin());

-- ------------------------------------------------------------------ anexos privados
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vistorias', 'vistorias', false, 52428800,
        array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Caminho: {unidade}/{vistoria}/{anexo}.ext — só quem tem a unidade atribuída (ou a administração) vê e envia.
create or replace function public.can_access_path(path text) returns boolean language sql stable security definer set search_path = public as $$
  select case when split_part(path, '/', 1) ~ '^[0-9]+$' then public.can_access_unit(split_part(path, '/', 1)::int) else false end;
$$;
drop policy if exists vist_read on storage.objects;
create policy vist_read on storage.objects for select to authenticated using (bucket_id = 'vistorias' and public.can_access_path(name));
drop policy if exists vist_insert on storage.objects;
create policy vist_insert on storage.objects for insert to authenticated with check (bucket_id = 'vistorias' and public.can_access_path(name));
drop policy if exists vist_delete on storage.objects;
create policy vist_delete on storage.objects for delete to authenticated using (bucket_id = 'vistorias' and public.is_admin());

-- Conta da administração que ainda esteja esperando código: libera direto.
update public.profiles p set approved = true, role = 'admin', needs_code = false
  from public.private_config c
 where c.key = 'admin_email' and lower(p.email) = lower(c.value) and (not p.approved or p.needs_code);

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
    perform public.notify_admins('Novo pedido de acesso', new.email || ' pediu acesso ao Formulário de Vistoria Saúde. Toque para aprovar.', './#acessos');
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
