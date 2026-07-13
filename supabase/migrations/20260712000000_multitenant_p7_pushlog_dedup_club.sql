-- Multi-tenant Fase 1 · PASSO 7 — dedup do push_log por clube.
--
-- Os índices únicos de deduplicação de push eram por (kind, game_key) [e
-- (kind, player_id, game_key)], SEM club_id. Como dois clubes podem ter um jogo
-- no MESMO dia/hora (mesmo game_key), o 1º a notificar "reivindicava" o game_key
-- e o 2º ficava silenciado. Recria os três incluindo club_id.
-- (club_id já é backfillado nas linhas existentes e setado por todos os inserters.)

drop index if exists uq_push_log_open;
create unique index uq_push_log_open on public.push_log (kind, game_key, club_id)
  where kind = 'inscricoes_abertas';

drop index if exists uq_push_log_voting;
create unique index uq_push_log_voting on public.push_log (kind, game_key, club_id)
  where kind = any (array['votacao_desempenho', 'votacao_churrasco']);

drop index if exists uq_push_log_promotion;
create unique index uq_push_log_promotion on public.push_log (kind, player_id, game_key, club_id)
  where kind = 'fila_promovido';
