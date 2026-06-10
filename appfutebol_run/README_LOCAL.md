# Harmonia FC — rodar local e testar (v1.70.41)

## O que foi corrigido
A contagem de jogadores confirmados aparecia diferente em lugares diferentes da
home (e não batia com o banco) porque existiam **três contadores independentes**,
cada um com regra própria:

- **Banner do topo**: somava confirmações de TODOS os jogos e incluía goleiros/carne.
- **buildGameView** (tela de jogo): filtrava por `status === 'confirmed'` e por jogo.
- **Hero/cards da home**: recálculo próprio por `confirmed === true`, com escopo de jogo diferente.

Agora todos usam **uma única fonte de verdade**: `js/domain/confirmations.js`.
A regra de "confirmado" espelha exatamente o leitor do Supabase
(`confirmationFromPresenceRow`): se houver `status`, ele manda; senão usa `confirmed`.

Arquivos alterados:
- `js/domain/confirmations.js` (novo) — predicados e classificador canônico.
- `js/domain/projection.js` — `buildGameView` agora delega ao classificador.
- `js/core/app.js` — banner do topo e `renderHome` passaram a usar `buildGameView`.

Regras canônicas aplicadas:
- Confirmado = `status ? status==='confirmed' : confirmed===true`.
- Escopo: confirmações do jogo ativo (`game_key`; `game_key` vazio conta como jogo ativo).
- "Linha" exclui goleiros e jogadores `carne`/`plays_football === false`.
- Goleiros e fila contados separadamente.

## Como rodar local
ES modules exigem servidor HTTP (não funciona abrindo o index.html via file://).

Dentro da pasta `appfutebol_run`:

    python3 -m http.server 8000

Depois abra: http://localhost:8000

Alternativa (Node): `npx serve -l 8000`

O `env.js` já aponta para o Supabase **DEV** (`environment: 'dev-supabase'`),
então em localhost ele conecta na base dev e o guard de ambiente libera.
Não use credenciais de PROD em localhost — o guard bloqueia de propósito.

## Dica de cache
O `index.html` e os imports usam `?v=1.70.40` para cache busting. Em teste local,
dê hard refresh (Ctrl+Shift+R). Ao publicar no Pages, suba esses `?v=` para forçar
os clientes a baixarem a versão nova.

## Como validar a correção
1. Conte no Supabase as confirmações do jogo ativo onde a presença está confirmada.
2. Abra a home: banner do topo, "X/Y confirmados de linha" e o card "Confirmados"
   devem mostrar o mesmo número de linha.
3. A tela "Jogo da semana" deve bater com a home.

## v1.70.41 — confirmações estritamente por jogo (sem vazamento)
Bug: confirmações de um jogo apareciam/ficavam confirmadas em um jogo novo.
Causa raiz no gravador (`storage.supabase.js > buildGranularOperations`): ao
trocar o jogo ativo, TODAS as confirmações em memória eram regravadas com a
chave do jogo novo (`game_key: nextGameKey`), migrando o jogo anterior inteiro.

Correção:
- `domain/confirmations.js`: escopo por `game_key` agora é ESTRITO (sem
  fallback para o jogo ativo). Chave vazia não vaza para nenhum jogo.
- `services/storage.supabase.js`: cada confirmação é gravada sob a SUA própria
  `game_key`; diff passa a usar a chave composta (game_key, player_id); removido
  o re-carimbo em massa ao trocar de jogo. Criar um jogo novo não grava nenhuma
  presença -> nasce com zero confirmados.

Limpeza de dados já vazados (opcional, base dev): as linhas que já foram
migradas para o jogo de hoje continuam no banco. Para zerar o jogo atual,
confira e apague as presenças daquela game_key (veja SQL fornecido no chat).
