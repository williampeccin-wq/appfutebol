-- Multi-tenant Fase 1 · PASSO 3a (EXPAND) — copia o blob 'default' p/ key=club1.
--
-- Expand/contract sem janela quebrada: COPIA (não move) o blob app_meta/game_state
-- da key='default' para key = clube padrão. Os dois passam a coexistir, então:
--   - cliente ANTIGO segue lendo key='default'  ✓
--   - cliente NOVO (Passo 3b) lê key=<club1>     ✓
-- Depois que o cliente novo estiver no ar e confirmado, o Passo 3c apaga a
-- 'default' órfã e liga a RLS por clube nessas duas tabelas.
-- NÃO mexe em RLS aqui (senão o cliente antigo perde a leitura de 'default').

insert into public.app_meta (key, data, updated_at)
select '00000000-0000-0000-0000-000000000001', data, updated_at
from public.app_meta
where key = 'default'
on conflict (key) do update
  set data = excluded.data, updated_at = excluded.updated_at;

insert into public.game_state (key, data, updated_at)
select '00000000-0000-0000-0000-000000000001', data, updated_at
from public.game_state
where key = 'default'
on conflict (key) do update
  set data = excluded.data, updated_at = excluded.updated_at;
