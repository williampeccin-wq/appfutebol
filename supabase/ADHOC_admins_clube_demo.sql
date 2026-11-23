-- Reduz os admins do clube de demonstração (Nova Resenha FC) a dois.
--
-- Por quê: os 25 admins vieram dos testes de agosto. Num clube que o revisor da
-- Play abre e que vira material de divulgação, "todo mundo é admin" some com a
-- tela de aprovação de quem entra e não representa uma pelada de verdade.
--
-- Quem fica: William Peccin (dono) e Revisor Google (a credencial declarada à
-- Play, final 0001 — sem admin ela perde acesso e derruba a próxima análise).
--
-- Projeto: convocados-prod (nwsnakzttmvuyejbfzom)
-- Clube:   e2af269c-20d0-4739-b7db-80ed93165192
-- Data:    23/11/2026 — estado anterior: 25 admins de 39 jogadores

begin;

-- Confira o antes (deve dar 25)
select count(*) as admins_antes
from players
where club_id = 'e2af269c-20d0-4739-b7db-80ed93165192' and is_admin;

update players
set is_admin = false
where club_id = 'e2af269c-20d0-4739-b7db-80ed93165192'
  and is_admin
  and data->>'name' not in ('William Peccin', 'Revisor Google');

-- Confira o depois (tem que dar exatamente 2)
select count(*) as admins_depois,
       string_agg(data->>'name', ', ' order by data->>'name') as quem_ficou
from players
where club_id = 'e2af269c-20d0-4739-b7db-80ed93165192' and is_admin;

-- Se o "depois" não der 2, rode `rollback;` em vez de `commit;`
commit;

-- ---------------------------------------------------------------------------
-- DESFAZER (devolve o admin aos 23 removidos)
-- ---------------------------------------------------------------------------
-- update players set is_admin = true
-- where club_id = 'e2af269c-20d0-4739-b7db-80ed93165192'
--   and data->>'name' in (
--     'Pedro Valente','Everton Maciel','Joao Rezende','Lucas Peixoto',
--     'Mauricio Galvao','Nelson Arruda','Osvaldo Tinoco','Caio Bitencourt',
--     'Luciano Freitas','Daniel Amorim','Ricardo Portela','Fabio Marinho',
--     'Alexandre Pires','Tiago Salgado','Paulo Vergara','Mateus Linhares',
--     'Gabriel Fontes','Anderson Reis','Cesar Dantas','Henrique Vilela',
--     'Bruno Teixeira','Thiago Barros','Marcelo Antunes'
--   );
