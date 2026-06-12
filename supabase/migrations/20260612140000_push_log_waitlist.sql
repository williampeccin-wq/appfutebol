-- Suporte ao aviso "entrou pela fila": o push_log passa a guardar o jogo, e um
-- índice único garante exatamente UMA notificação de promoção por (jogo + jogador),
-- mesmo que vários clientes detectem a vaga aberta ao mesmo tempo.
alter table public.push_log add column if not exists game_key text;

create unique index if not exists uq_push_log_promotion
  on public.push_log (kind, player_id, game_key)
  where kind = 'fila_promovido';
