-- Livro-caixa do clube (controle financeiro Pro). Ver docs/finance-design.md.
-- Tabela granular (NÃO vai no blob app_meta): dado append-only que cresce sem teto.
-- Isolamento por clube via RLS, espelhando o padrão de pix_receipts/app_meta.

create table if not exists public.finance_entries (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null,
  kind         text not null check (kind in ('receita','despesa')),
  category     text not null default 'outro',   -- mensalidade | diaria | quadra | material | outro
  amount       numeric(12,2) not null check (amount >= 0),
  date         date not null,                    -- competência (dia do fato)
  description  text,
  player_id    text,                             -- quando é mensalidade/diária de um membro
  cycle_id     text,                             -- vincula ao ciclo de mensalidade (fase 2)
  source       text not null default 'manual' check (source in ('pix_ia','manual','ajuste')),
  pix_e2e_id   text unique,                      -- rastro do comprovante PIX (idempotência)
  created_by   uuid,
  created_at   timestamptz not null default now()
);

create index if not exists finance_entries_club_date_idx  on public.finance_entries (club_id, date desc);
create index if not exists finance_entries_club_cycle_idx on public.finance_entries (club_id, cycle_id);

alter table public.finance_entries enable row level security;

-- Isolamento por clube (RESTRICTIVE: vale para toda operação)
create policy tenant_isolation_finance on public.finance_entries
  as restrictive to authenticated
  using (club_id = any (public.current_club_ids()))
  with check (club_id = any (public.current_club_ids()));

-- Admin do clube: acesso total (leitura + escrita). Membro comum: nada por ora
-- (publicar-ao-grupo é fase futura, com policy de leitura própria).
create policy finance_admin_all on public.finance_entries
  to authenticated
  using (public.harmonia_is_admin())
  with check (public.harmonia_is_admin());

grant all on table public.finance_entries to anon;
grant all on table public.finance_entries to authenticated;
grant all on table public.finance_entries to service_role;
