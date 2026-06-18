-- Dedup dos pushes de votação: 1 aviso por jogo para cada tipo de votação.
-- Espelha uq_push_log_open (inscrições), mas para os tipos de votação.
-- A função insere uma linha (kind, game_key) antes de enviar o lote; se já
-- existir (23505), o push daquela janela já foi mandado e é pulado.

create unique index if not exists uq_push_log_voting
  on public.push_log (kind, game_key)
  where kind in ('votacao_desempenho', 'votacao_churrasco');
