-- Multi-tenant Fase 1 · PASSO 2b — club-scoping de ratings/pix/push.
--
-- Diagnóstico: ratings/pix_receipts/push_log já estão com RLS ON e SEM policy
-- permissiva → authenticated/anon NÃO leem as tabelas cruas (só service_role).
-- Logo pix_receipts e push_log JÁ estão isolados (ninguém além do servidor lê).
-- O ÚNICO vazamento é a VIEW public.ratings_public: ela é security_definer (roda
-- como o dono, postgres) e portanto CONTORNA a RLS de ratings — mostrava as notas
-- de TODOS os clubes. O cliente lê essa view.

-- 1) FIX PRINCIPAL: embute o filtro por clube na view. current_club_ids() usa
--    auth.uid() do INVOCADOR (vale mesmo em view definer), então cada usuário só
--    vê as notas do próprio clube. Mantém o anonimato (não projeta voter_id) e não
--    exige dar acesso à tabela crua (o dono da view é quem lê ratings).
create or replace view public.ratings_public as
  select kind, game_key, target_id, score, created_at
  from public.ratings
  where club_id = any (public.current_club_ids());

-- 2) DEFESA EM PROFUNDIDADE: camada RESTRICTIVE por clube nas 3 tabelas. Hoje é
--    inócua (não há policy permissiva → segue só service_role), mas garante que
--    QUALQUER policy permissiva futura fique auto-escopada ao clube — nunca vaza
--    entre clubes por engano (ex.: uma futura tela admin de comprovantes PIX).
drop policy if exists tenant_isolation_ratings on public.ratings;
create policy tenant_isolation_ratings on public.ratings
  as restrictive for all to authenticated
  using      (club_id = any (public.current_club_ids()))
  with check (club_id = any (public.current_club_ids()));

drop policy if exists tenant_isolation_pix on public.pix_receipts;
create policy tenant_isolation_pix on public.pix_receipts
  as restrictive for all to authenticated
  using      (club_id = any (public.current_club_ids()))
  with check (club_id = any (public.current_club_ids()));

drop policy if exists tenant_isolation_pushlog on public.push_log;
create policy tenant_isolation_pushlog on public.push_log
  as restrictive for all to authenticated
  using      (club_id = any (public.current_club_ids()))
  with check (club_id = any (public.current_club_ids()));
