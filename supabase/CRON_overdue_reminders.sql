-- ============================================================================
-- Agendamento do lembrete diário de mensalidade atrasada
-- Rode este SQL no Supabase Studio > SQL Editor, UMA VEZ por ambiente (DEV/PROD).
-- Requer as extensões pg_cron e pg_net (Database > Extensions > habilitar ambas).
-- ============================================================================

-- 1) Habilite as extensões (ou faça pelo painel Extensions):
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Agende o disparo diário às 10:00 UTC (= 07:00 de Brasília).
--    SUBSTITUA:
--      <PROJECT_REF>  -> ref do projeto (ex.: kpgghcrmbkrwpvtegcjh em PROD,
--                        fjnelycvneutmyzjrozs em DEV)
--      <CRON_SECRET>  -> o MESMO valor que você definir no secret CRON_SECRET
--                        da função (Edge Functions > send-overdue-reminders > Secrets)
select cron.schedule(
  'overdue-reminders-daily',
  '0 10 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-overdue-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ----------------------------------------------------------------------------
-- Conferir / remover o agendamento:
--   select * from cron.job;
--   select cron.unschedule('overdue-reminders-daily');
-- ----------------------------------------------------------------------------
