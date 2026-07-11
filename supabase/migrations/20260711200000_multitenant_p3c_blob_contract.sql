-- Multi-tenant Fase 1 · PASSO 3c (CONTRACT) — fecha o blob por clube + limpa órfã.
--
-- Roda DEPOIS do cliente novo (Passo 3b) estar no ar e verificado lendo key=club1.
-- 1) RLS RESTRICTIVE por clube em app_meta/game_state: a KEY do blob É o club_id
--    (text). Soma (AND) às policies existentes — só lê/grava o blob do PRÓPRIO
--    clube. Como o app lê/grava key=club1 e o usuário é do club1, nada quebra.
-- 2) Apaga a linha 'default' órfã (o cliente novo não a usa mais).

-- 1) Isolamento do blob por clube (key = club_id)
drop policy if exists tenant_isolation_app_meta on public.app_meta;
create policy tenant_isolation_app_meta on public.app_meta
  as restrictive for all to authenticated
  using      (key = any (public.current_club_ids()::text[]))
  with check (key = any (public.current_club_ids()::text[]));

drop policy if exists tenant_isolation_game_state on public.game_state;
create policy tenant_isolation_game_state on public.game_state
  as restrictive for all to authenticated
  using      (key = any (public.current_club_ids()::text[]))
  with check (key = any (public.current_club_ids()::text[]));

-- 2) Remove a 'default' órfã (roda como postgres => bypassa RLS)
delete from public.app_meta   where key = 'default';
delete from public.game_state where key = 'default';
