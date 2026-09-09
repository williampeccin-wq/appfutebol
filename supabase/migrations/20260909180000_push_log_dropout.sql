-- Aviso ao admin de que alguém saiu da escalação (kind='escalacao_desfalque').
--
-- Um aviso por (jogador que saiu + jogo): se a pessoa cancelar, reconfirmar e
-- cancelar de novo, o admin recebe UMA notificação — o objetivo é avisar do
-- desfalque, não narrar cada toque. `player_id` guarda QUEM SAIU (é a chave da
-- deduplicação); os destinatários são os admins do clube.
--
-- Sem este índice a função ainda deduplica com um SELECT antes do INSERT, mas
-- dois clientes detectando a mesma saída ao mesmo tempo passariam pelos dois.
create unique index if not exists uq_push_log_dropout
  on public.push_log (kind, player_id, game_key)
  where kind = 'escalacao_desfalque';
