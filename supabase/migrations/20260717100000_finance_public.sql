-- Resumo financeiro PUBLICADO ao grupo (transparência). Só o agregado (saldo,
-- entradas/saídas do mês) — SEM PII de quem deve. Admin escreve, todo membro lê.
-- Distinto de finance_entries (livro-caixa, admin-only). Ver docs/finance-design.md F3.

create table if not exists public.finance_public (
  club_id     uuid primary key,
  data        jsonb not null,        -- { saldo, entMes, saiMes, ym, publishedAt }
  updated_at  timestamptz not null default now()
);

alter table public.finance_public enable row level security;

-- Isolamento por clube (RESTRICTIVE)
create policy tenant_isolation_finance_public on public.finance_public
  as restrictive to authenticated
  using (club_id = any (public.current_club_ids()))
  with check (club_id = any (public.current_club_ids()));

-- Todo membro do clube LÊ o resumo publicado
create policy finance_public_read on public.finance_public
  for select to authenticated using (true);

-- Só admin PUBLICA (insert/update)
create policy finance_public_write_admin on public.finance_public
  to authenticated
  using (public.harmonia_is_admin())
  with check (public.harmonia_is_admin());

grant all on table public.finance_public to anon;
grant all on table public.finance_public to authenticated;
grant all on table public.finance_public to service_role;
