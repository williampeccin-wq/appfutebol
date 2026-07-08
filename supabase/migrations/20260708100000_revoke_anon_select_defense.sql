-- Defense-in-depth: revoga o SELECT do role `anon` nas tabelas que ainda
-- respondiam 200-[] ao anon (a RLS filtrava as linhas, mas o GRANT deixava a
-- query passar). Passam a 401 — não há vazamento hoje, isto é só endurecer a barra.
--
-- Seguro: nenhum read ANÔNIMO do frontend depende delas —
--   * ratings: o cliente lê a VIEW public.ratings_public (definer's rights, grant
--     anon MANTIDO), nunca a tabela base;
--   * push_subscriptions: o cliente só faz DELETE autenticado (não SELECT);
--   * pix_receipts / push_log: o cliente nunca lê (só Edge Functions service_role).
-- Os grants do role `authenticated` ficam INTACTOS.

revoke select on public.ratings from anon;
revoke select on public.pix_receipts from anon;
revoke select on public.push_subscriptions from anon;
revoke select on public.push_log from anon;
