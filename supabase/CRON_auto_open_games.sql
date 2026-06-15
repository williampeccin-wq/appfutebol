-- ============================================================================
-- Agendamento da abertura automática de inscrições.
-- Rode no Supabase Studio > SQL Editor, UMA VEZ por ambiente (DEV/PROD).
-- Requer pg_cron e pg_net habilitados (Database > Extensions).
-- Roda a cada 5 minutos: abre os jogos cujo auto_open_at já chegou e avisa todos.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- SUBSTITUA <PROJECT_REF> (DEV=fjnelycvneutmyzjrozs, PROD=kpgghcrmbkrwpvtegcjh),
-- <CRON_SECRET> (o MESMO secret CRON_SECRET das funções) e <ANON_KEY> (a anon
-- key pública do projeto — Settings > API). O header Authorization é OBRIGATÓRIO:
-- sem ele o gateway do Supabase rejeita com "Missing authorization header".
select cron.schedule(
  'auto-open-games',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/auto-open-games',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Conferir / remover:
--   select * from cron.job;
--   select cron.unschedule('auto-open-games');
