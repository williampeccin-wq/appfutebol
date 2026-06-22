-- Segurança (#1 da auditoria jun/26): votos passam a ser gravados SÓ pela Edge
-- Function submit-rating (service_role, que ignora RLS) — que resolve o voter_id
-- pelo JWT e valida a janela/participação. As policies de INSERT/UPDATE do
-- cliente eram using(true)/with check(true) e permitiam FORJAR voto com a anon
-- key (voter_id arbitrário, fora da janela), e como o sorteio usa as médias,
-- dava p/ enviesar os times.
--
-- Removemos as policies de escrita do cliente. Sem policy de insert/update, a
-- RLS NEGA a escrita por anon/authenticated; só service_role grava.
-- O SELECT segue liberado (médias/ranking são calculados no cliente; o anonimato
-- continua sendo só de interface, como antes).

drop policy if exists "ratings_insert" on public.ratings;
drop policy if exists "ratings_update" on public.ratings;

-- (intencional: nenhuma policy de insert/update/delete para anon/authenticated)
