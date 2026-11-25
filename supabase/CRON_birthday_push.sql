-- ============================================================================
-- Agendamento do push de aniversário (send-birthday-push), todo dia às 8h BRT.
-- Rode no Supabase Studio > SQL Editor, UMA VEZ em cada projeto (Harmonia e
-- Convocados), depois de deployar a função.
--
-- Não precisa colar segredo: copia o comando do cron do lembrete de mensalidade,
-- que já leva a URL do projeto, o anon key e o x-cron-secret, e só troca o nome
-- da função. O CRON_SECRET é do projeto, vale para as duas funções.
-- ============================================================================

select cron.schedule(
  'birthday-push-daily',
  '0 11 * * *',                       -- 11:00 UTC = 08:00 de Brasília
  replace(command, 'send-overdue-reminders', 'send-birthday-push')
)
from cron.job
where command like '%send-overdue-reminders%'
limit 1;

-- Conferir (deve aparecer birthday-push-daily, 0 11 * * *):
--   select jobname, schedule from cron.job;
-- Ver a resposta das últimas execuções:
--   select status_code, content, created from net._http_response order by created desc limit 5;
-- Remover:
--   select cron.unschedule('birthday-push-daily');
