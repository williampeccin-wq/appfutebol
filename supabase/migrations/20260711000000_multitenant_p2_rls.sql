-- Multi-tenant Fase 1 · PASSO 2 — Isolamento por clube via RLS RESTRICTIVE.
--
-- Estratégia NÃO-DESTRUTIVA: não reescreve nenhuma policy existente. Adiciona uma
-- camada RESTRICTIVE (AS RESTRICTIVE) que se SOMA (AND) às permissivas de hoje —
-- ou seja, "além do que já vale, a linha TEM que ser de um clube do usuário".
-- Como hoje todos os players estão no clube 1 e todo usuário logado é do clube 1,
-- NADA muda no app atual. Quando existir clube 2, ele não enxerga o clube 1.
--
-- Escopo deste passo: players + presence_confirmations (o vazamento real, lidos
-- direto pelo cliente com SELECT true) + push_subscriptions (defesa).
-- Ficam para depois: ratings/pix_receipts/push_log (Passo 2b, envolvem a view
-- ratings_public e dados de pagamento) e app_meta/game_state (Passo 3, re-key).

-- 1) Clubes do usuário logado. SECURITY DEFINER + dono postgres (BYPASSRLS) para
--    NÃO recorrer na própria policy de players (evita "infinite recursion").
--    auth_user_id é text; casta os dois lados por segurança.
create or replace function public.current_club_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct p.club_id), array[]::uuid[])
  from public.players p
  where p.auth_user_id::text = (auth.uid())::text;
$$;

revoke all on function public.current_club_ids() from public;
grant execute on function public.current_club_ids() to authenticated, service_role;

-- 2) Camada RESTRICTIVE por tabela (idempotente: drop + create).

-- players
drop policy if exists tenant_isolation_players on public.players;
create policy tenant_isolation_players on public.players
  as restrictive for all to authenticated
  using      (club_id = any (public.current_club_ids()))
  with check (club_id = any (public.current_club_ids()));

-- presence_confirmations
drop policy if exists tenant_isolation_presence on public.presence_confirmations;
create policy tenant_isolation_presence on public.presence_confirmations
  as restrictive for all to authenticated
  using      (club_id = any (public.current_club_ids()))
  with check (club_id = any (public.current_club_ids()));

-- push_subscriptions (o cliente só apaga a própria inscrição; defesa em profundidade)
drop policy if exists tenant_isolation_pushsub on public.push_subscriptions;
create policy tenant_isolation_pushsub on public.push_subscriptions
  as restrictive for all to authenticated
  using      (club_id = any (public.current_club_ids()))
  with check (club_id = any (public.current_club_ids()));

-- NOTA: Edge Functions usam service_role, que IGNORA RLS — register-player,
-- submit-rating, read-pix-receipt, send-push etc. seguem funcionando iguais.
