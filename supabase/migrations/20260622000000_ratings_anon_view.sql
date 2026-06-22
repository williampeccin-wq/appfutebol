-- Privacidade do voto (#B1 da re-auditoria): o SELECT em public.ratings era
-- using(true), então qualquer um com a anon key conseguia ler voter_id+target_id
-- +score no REST e reconstruir quem deu nota baixa a quem (o anonimato era só de
-- interface). Fechamos expondo só os agregados via uma VIEW sem voter_id e
-- removendo o SELECT direto na tabela base.

-- View pública só com o necessário para calcular médias/rankings no cliente.
create or replace view public.ratings_public as
  select kind, game_key, target_id, score, created_at
  from public.ratings;

grant select on public.ratings_public to anon, authenticated;

-- A view (definer's rights) lê a base ignorando a RLS; o cliente passa a ler a
-- view. Remove a leitura direta da tabela base — voter_id deixa de ser exposto.
-- (Escrita já era só via Edge Function submit-rating; "já votei?" idem.)
drop policy if exists "ratings_select" on public.ratings;
