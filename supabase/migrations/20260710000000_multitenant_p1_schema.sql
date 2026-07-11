-- Multi-tenant Fase 1 · PASSO 1 — Fundação do schema (clubs + club_id).
--
-- Puramente ADITIVO: NÃO quebra o app atual. club_id entra com DEFAULT = o "clube
-- padrão" (a base existente), então as linhas de hoje são backfilladas na hora e o
-- app segue lendo/gravando igual (ele ignora a coluna nova por enquanto).
-- app_meta/game_state continuam em key='default' — o cliente só passa a usar
-- key=club_id no PASSO 3. RLS por clube vem no PASSO 2.

-- 1) Inquilino
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  plan text not null default 'free',            -- free | pro
  plan_status text,
  invite_code text unique,
  owner_auth_user_id uuid,
  created_at timestamptz not null default now()
);

-- 2) Clube padrão: a base atual (DEV) vira 1 clube, com id FIXO para referência.
insert into public.clubs (id, name, slug, plan, invite_code)
values ('00000000-0000-0000-0000-000000000001', 'Clube Padrão (DEV)', 'default', 'free', 'DEV0001')
on conflict (id) do nothing;

-- 3) club_id nas tabelas de linhas (DEFAULT = clube padrão => backfill automático).
alter table public.players                add column if not exists club_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.clubs(id);
alter table public.presence_confirmations add column if not exists club_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.clubs(id);
alter table public.ratings                add column if not exists club_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.clubs(id);
alter table public.pix_receipts           add column if not exists club_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.clubs(id);
alter table public.push_subscriptions     add column if not exists club_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.clubs(id);
alter table public.push_log               add column if not exists club_id uuid          default '00000000-0000-0000-0000-000000000001' references public.clubs(id);

-- 4) Índices para os filtros por clube (leituras da RLS e do app).
create index if not exists idx_players_club  on public.players(club_id);
create index if not exists idx_presence_club on public.presence_confirmations(club_id);
create index if not exists idx_ratings_club  on public.ratings(club_id);
create index if not exists idx_pix_club      on public.pix_receipts(club_id);
create index if not exists idx_pushsub_club  on public.push_subscriptions(club_id);

-- 5) clubs com RLS LIGADA e SEM policy ainda => ninguém acessa (nada lê clubs
--    hoje; as policies por clube entram no PASSO 2). Secure-by-default.
alter table public.clubs enable row level security;
