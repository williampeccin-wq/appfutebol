-- Votação/notas: desempenho dos jogadores e do churrasco (dupla da carne).
-- Um voto = (tipo, jogo, votante, alvo, nota 1–10). A média por jogador é
-- calculada no cliente (a UI esconde quem votou; anonimato só na interface).
create table if not exists public.ratings (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,                 -- 'desempenho' | 'churrasco'
  game_key    text not null,                 -- jogo a que o voto se refere
  voter_id    text not null,                 -- id do jogador que votou
  target_id   text not null,                 -- desempenho: id do jogador avaliado; churrasco: chave da dupla
  score       int  not null check (score between 1 and 10),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (kind, game_key, voter_id, target_id)  -- 1 voto por votante/alvo/jogo
);

create index if not exists idx_ratings_kind_game on public.ratings (kind, game_key);
create index if not exists idx_ratings_target on public.ratings (target_id);
create index if not exists idx_ratings_created on public.ratings (created_at);

alter table public.ratings enable row level security;

-- Modelo de confiança igual ao resto do app (anon/authenticated com a chave do
-- clube). Permite votar (insert), corrigir o próprio voto (update) e ler para
-- calcular médias. A UI nunca mostra quem votou. SEM delete.
drop policy if exists "ratings_select" on public.ratings;
create policy "ratings_select" on public.ratings for select to anon, authenticated using (true);

drop policy if exists "ratings_insert" on public.ratings;
create policy "ratings_insert" on public.ratings for insert to anon, authenticated with check (true);

drop policy if exists "ratings_update" on public.ratings;
create policy "ratings_update" on public.ratings for update to anon, authenticated using (true) with check (true);
