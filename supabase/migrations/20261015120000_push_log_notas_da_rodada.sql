-- Dedup do push "Votação encerrada" (kind='notas_da_rodada'): um aviso por jogo
-- e por clube. Disparado pelo cron auto-open-games quando a votação de
-- desempenho fecha e as Notas da rodada ficam à mostra.
--
-- A função já confere com SELECT antes de inserir; o índice fecha a corrida de
-- duas invocações simultâneas.
--
-- Serve os dois formatos de projeto: com club_id (multi-tenant, mesmo formato
-- dos índices da p7) e sem (harmonia-fc, single-tenant). Rodar o arquivo inteiro.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'push_log' and column_name = 'club_id'
  ) then
    execute $i$
      create unique index if not exists uq_push_log_notas
        on public.push_log (kind, game_key, club_id)
        where kind = 'notas_da_rodada'
    $i$;
  else
    execute $i$
      create unique index if not exists uq_push_log_notas
        on public.push_log (kind, game_key)
        where kind = 'notas_da_rodada'
    $i$;
  end if;
end $$;
