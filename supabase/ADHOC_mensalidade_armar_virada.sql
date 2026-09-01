-- AD-HOC — ARMAR a virada automática de mês da mensalidade (v1.186.0).
--
-- CONTEXTO
-- Até a v1.185 não existia gatilho nenhum: no dia 1º ninguém voltava a
-- "Pendente". O único reset era manual (admin salvando uma nova data de
-- vencimento no Config). A v1.186 automatiza pela VIRADA DE MÊS, carimbando
-- `app_meta.data.settings.mens_last_reset_month` ('AAAA-MM') com o último mês
-- já processado.
--
-- REQUISITO DO DEPLOY: os status que já estão no ar foram acertados na mão e
-- NÃO podem ser atropelados. Por isso o app, ao encontrar um clube SEM carimbo,
-- apenas ARMA o gatilho com o mês corrente e não zera ninguém — o primeiro reset
-- automático acontece só na virada seguinte.
--
-- POR QUE ESTE SCRIPT EXISTE
-- Esse "armar" roda no app, e só na sessão de um ADMIN (o trigger
-- mens_ok_is_admin_only recusa a gravação de qualquer outro perfil). Se nenhum
-- admin abrir o app durante o mês do deploy, o carimbo só nasce no dia 1º — e
-- aí ele nasce já valendo o mês novo, adiando o primeiro reset em um mês.
-- Rodar isto no dia do deploy elimina essa dependência.
--
-- É SEGURO: escreve UM campo novo em settings e não toca em `mens_ok`,
-- `mens_expire_date` nem em nenhum status de jogador.
--
-- Rodar no SQL Editor do projeto harmonia-fc (kpgghcrmbkrwpvtegcjh), DEPOIS de
-- publicar a v1.186.0. Não toca em `clubs` nem em `club_id`, então roda igual
-- neste projeto single-tenant.

-- ---------------------------------------------------------------- passo 0
-- Confere o que está lá hoje. `carimbo` deve vir NULL (nunca armado).
select key,
       data->'settings'->>'mens_expire_date'      as vencimento,
       data->'settings'->>'mens_enforcement_mode' as modo,
       data->'settings'->>'mens_last_reset_month' as carimbo,
       updated_at
  from public.app_meta
 order by key;

-- ---------------------------------------------------------------- passo 1
begin;

-- Carimba o MÊS CORRENTE. Só onde ainda não há carimbo: reexecutar não
-- reprocessa nada, e um clube que o app já armou fica intocado.
update public.app_meta
   set data = jsonb_set(
                data,
                '{settings,mens_last_reset_month}',
                to_jsonb(to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')),
                true
              ),
       -- O updated_at é de propósito: é ele que o heartbeat do app compara para
       -- decidir que precisa reler o estado.
       updated_at = now()
 where data->'settings'->>'mens_last_reset_month' is null;

-- Confere ANTES de fechar. Esperado: carimbo preenchido, e o vencimento e o
-- modo exatamente como estavam no passo 0.
select key,
       data->'settings'->>'mens_expire_date'      as vencimento,
       data->'settings'->>'mens_enforcement_mode' as modo,
       data->'settings'->>'mens_last_reset_month' as carimbo
  from public.app_meta
 order by key;

-- Se algo estiver diferente do passo 0: rollback;
commit;

-- ---------------------------------------------------------------- passo 2
-- Prova de que nenhum status foi tocado: a contagem de pagos tem de ser a mesma
-- de antes de rodar o script.
select count(*) filter (where data->>'mens_ok' = 'true')  as pagos,
       count(*) filter (where data->>'mens_ok' = 'false') as pendentes,
       count(*)                                           as total
  from public.players
 where coalesce((data->>'active')::boolean, true);
