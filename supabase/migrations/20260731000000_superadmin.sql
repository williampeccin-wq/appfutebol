-- Superadmin: painel de gestão de planos (billing manual Opção C).
--
-- A tabela superadmins é escrita APENAS via service_role (SQL Editor / scripts).
-- O cliente só lê a própria linha para saber se é superadmin.
-- Superadmins enxergam e atualizam TODOS os clubes (políticas adicionais abaixo).

-- 1) Tabela de superadmins
create table if not exists public.superadmins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now()
);
alter table public.superadmins enable row level security;

-- Superadmin enxerga apenas a própria linha (confirma se é superadmin no cliente)
drop policy if exists superadmins_read_self on public.superadmins;
create policy superadmins_read_self on public.superadmins
  for select to authenticated
  using (auth_user_id = auth.uid());

-- 2) Função auxiliar: verdadeiro se o usuário logado é superadmin
create or replace function public.is_superadmin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.superadmins where auth_user_id = auth.uid())
$$;

-- 3) Colunas extras na tabela clubs (adicionadas agora, sem quebrar nada)
alter table public.clubs
  add column if not exists pro_until timestamptz,
  add column if not exists notes     text;

-- 4) Superadmin lê TODOS os clubes (sobrepõe a policy clubs_read_own existente)
drop policy if exists clubs_read_superadmin on public.clubs;
create policy clubs_read_superadmin on public.clubs
  for select to authenticated
  using (public.is_superadmin());

-- 5) Superadmin pode atualizar qualquer clube (plan, pro_until, notes)
drop policy if exists clubs_update_superadmin on public.clubs;
create policy clubs_update_superadmin on public.clubs
  for update to authenticated
  using  (public.is_superadmin())
  with check (public.is_superadmin());

-- INSTRUÇÃO DE USO:
-- Para adicionar um superadmin, rode no SQL Editor do Supabase:
--   insert into public.superadmins (auth_user_id)
--   values ('<uuid do auth.users do admin>');
