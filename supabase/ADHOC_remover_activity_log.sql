-- REMOVER A TELEMETRIA DO PILOTO (rodar no SQL Editor, projeto convocados-prod)
--
-- O `activity_log` nasceu para medir o teste fechado: saber quem abria o app e em
-- que passo cada testador parava. Era a única forma de enxergar o teste por
-- dentro. Com a publicação pela conta de organização não há mais teste fechado a
-- provar, e manter a tabela obrigaria a declarar "App activity → App interactions"
-- no Data Safety da loja — declaração que, se ficar imprecisa, custa remoção do
-- app, não só rejeição.
--
-- O código que gravava aqui saiu na v1.199.0 (js/services/activity-log.js e
-- js/services/tester-meter.js). Esta tabela é o que sobrou.
--
-- ⚠️ Isto APAGA o histórico do piloto. O que foi medido já está registrado em
-- docs/play-producao-respostas.md (14 testadores, mediana de 3 dias e 4min19s na
-- janela de 02 a 14/09). As consultas em supabase/ADHOC_*testadores*.sql e
-- ADHOC_engajamento_visivel_google.sql param de funcionar — ficam no repositório
-- como registro do que foi feito, não como ferramenta.

drop table if exists public.activity_log;
