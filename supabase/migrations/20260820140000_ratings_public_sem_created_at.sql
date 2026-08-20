-- Anonimato do voto (ACHADO da auditoria de votação, 20/08/2026).
--
-- A view ratings_public foi criada para o anonimato deixar de ser "só de
-- interface": ela não projeta voter_id. Mas mantinha created_at — e TODAS as
-- notas de uma cédula são gravadas numa única instrução, então compartilham o
-- mesmo instante, ao microssegundo.
--
-- Agrupando por created_at, qualquer um com a chave anônima (que é pública,
-- vive no env.js) remonta a cédula inteira de cada votante. E como ninguém vota
-- em si mesmo, o confirmado que FALTA no grupo é o autor: com 18 confirmados,
-- 17 notas no grupo e o ausente é quem votou. O voter_id estava removido, mas o
-- relógio o devolvia.
--
-- Removemos created_at da projeção. Verificado antes: o cliente não usa esse
-- campo em nenhum agregado — as médias usam kind, game_key, target_id e score
-- (ratings.service.js). A coluna continua na tabela base, para auditoria pelo
-- service_role; deixa apenas de ser pública.
--
-- Nota: `create or replace view` NÃO consegue remover coluna — só acrescentar no
-- fim. Por isso o drop + create.
--
-- Serve os dois formatos de projeto: onde a migration multi-tenant foi aplicada,
-- mantém o filtro por clube (sem ele a view vazaria notas entre clubes, que foi
-- o motivo da p2b); onde não foi (harmonia-fc, sem club_id em tabela nenhuma),
-- cria sem o filtro. Rodar o arquivo inteiro de uma vez.

drop view if exists public.ratings_public;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ratings' and column_name = 'club_id'
  ) then
    execute $v$
      create view public.ratings_public as
        select kind, game_key, target_id, score
        from public.ratings
        where club_id = any (public.current_club_ids())
    $v$;
  else
    execute $v$
      create view public.ratings_public as
        select kind, game_key, target_id, score
        from public.ratings
    $v$;
  end if;
end $$;

grant select on public.ratings_public to anon, authenticated;

-- Conferir depois de rodar (deve devolver exatamente 4 colunas, sem created_at):
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'ratings_public'
--   order by ordinal_position;
