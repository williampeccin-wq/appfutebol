-- Dedup do push "inscrições abertas" disparado pela abertura automática:
-- garante UM aviso por jogo, mesmo que o cron rode mais de uma vez.
create unique index if not exists uq_push_log_open
  on public.push_log (kind, game_key)
  where kind = 'inscricoes_abertas';
