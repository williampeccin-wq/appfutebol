# Encerramento de temporada — pontos e notas por ciclo

Status: **fases A e B implementadas** (v1.182.0 e v1.183.0, 31/08/2026); fase C pendente. Origem: o Inverno 26 (01/05–31/08/2026) terminou e o app não tem nada que reaja a isso — a classificação segue somando os jogos de setembro dentro de uma temporada que a própria tela diz ter acabado. Ver `club-profile-design.md` (a temporada já é entidade por-clube na Fase 1).

## O problema

Hoje `end_date` é **texto de tela**, não regra: aparece no hero (`championship.view.js:518`) e em mais lugar nenhum. `calculateCurrentRanking` (`championship.service.js:705`) soma TODOS os resultados de `championship.active.results`, sem recorte de data. A classificação do Inverno 26 nunca é congelada: ela só existe como "atual" e muda a cada jogo novo.

A nota é ainda mais aberta — nunca foi recortada por período. `playerRatingAverages(getCachedRatings())` é sempre chamada sem janela (`championship.view.js:161`), então a coluna ★ é média vitalícia desde o primeiro voto, apesar do comentário no código dizer "campeonato vigente".

## Regra alvo

Nota passa a seguir a mesma lógica do ponto:

| | Temporada | Ano | Depois do ano |
|---|---|---|---|
| **Pontos** | soma dos resultados da janela | soma das temporadas do ano | congela; recomeça do zero |
| **Nota** | média dos votos da janela | média ponderada dos votos do ano | congela; recomeça do zero |

Nada é vitalício. Não existe mais "média histórica do jogador" em lugar nenhum da UI.

**Decisão embutida: a nota anual é média PONDERADA POR VOTOS, não média das médias.** Ponto é grandeza extensiva (soma), nota é intensiva (média) — o análogo correto de "somar as temporadas" é `Σ scores do ano / Σ votos do ano`. Média de médias faria uma temporada com 2 votos pesar igual a uma com 40.

## Princípios

1. **Temporada encerrada é FATO, não cálculo.** O encerramento grava a tabela final; nada a recalcula depois. Sem isso um jogo excluído meses depois reescreveria o passado — `deleteGameRatings` (`ratings.service.js:77`) apaga os votos do jogo quando o admin exclui, e a nota de uma temporada passada mudaria sozinha.
2. **Aditivo.** Tudo dentro de `app_meta.data.championship` (blob por clube). Sem migração SQL, igual ao `profile`.
3. **Encerrar é ato do admin, nunca automático.** A data-limite gera um AVISO, não um corte silencioso: um jogo do dia 27/08 com resultado lançado no dia 02/09 tem que entrar no Inverno 26.
4. **A temporada é resolvida pela DATA DO JOGO**, nunca pela data do lançamento nem pela ordem de gravação.
5. **Nada some sem aviso.** Resultado fora da janela nunca é descartado em silêncio — aparece como "fora da temporada" com a ação de encerrar do lado.

## Onde vive

```jsonc
// app_meta.data.championship
{
  "active": { "id": "primavera-26", "name": "Primavera 26", "label": "Primavera 2026",
              "year": 2026, "start_date": "2026-09-01", "end_date": "2026-12-31",
              "results": [ /* como hoje */ ] },

  // Temporadas encerradas (append-only). O que está aqui NUNCA é recalculado.
  "history": [{
    "id": "inverno-2026", "name": "Inverno 26", "year": 2026,
    "start_date": "2026-05-01", "end_date": "2026-08-31",
    "closed_at": "2026-09-02T22:10:00Z", "closed_by": "<player_id do admin>",
    "points_table": { "win": 3, "draw": 2, "loss": 1, "no_play": 0 },  // com que regra foi apurada
    "rows": [{ "player_id": "…", "name": "Júnior", "rank": 1,
               "points": 16, "wins": 4, "draws": 2, "losses": 0, "no_play": 0, "played": 6,
               "rating": { "sum": 214, "votes": 26, "avg": 8.2 } }],
    "results": [ /* as rodadas movidas do active */ ]
  }],

  // Anos encerrados. Mesma ideia, um nível acima.
  "years": [{ "year": 2026, "closed_at": "…",
              "season_ids": ["abertura-26", "inverno-2026", "primavera-26"],
              "rows": [{ "player_id": "…", "name": "…", "points": 41,
                         "rating": { "sum": 611, "votes": 74, "avg": 8.3 } }] }]
}
```

`sum` e `votes` são inteiros e ficam gravados **junto** do `avg`: é o que permite montar o anual ponderado sem reler a tabela `ratings` (que pode ter perdido linhas por exclusão de jogo).

## Como datar um voto sem quebrar o anonimato

Essa é a peça que viabiliza a nota por temporada sem mexer no banco. A view `ratings_public` omite `created_at` de propósito — agrupar por instante remontava a cédula de cada votante (`ratings.service.js:168`). Mas `game_key` tem o formato `game_YYYY-MM-DD_HHMM` (`app.js:286`), ou seja **a data do jogo já viaja com o voto**. Basta:

```js
// ratings.service.js
export function dateOfGameKey(gameKey) {
  const m = /^game_(\d{4}-\d{2}-\d{2})_/.exec(String(gameKey || ''));
  return m ? m[1] : null;   // 'default' e chaves antigas → null
}
export function playerRatingAverages(rows, window = null) { /* { from, to } por data */ }
```

Chave que não parseia (`default`, votos anteriores ao formato) fica **fora de qualquer temporada** — contada como legado e ignorada, nunca jogada por engano na temporada corrente.

## O fluxo de encerrar

Dois cards de admin na aba Campeonato. **Editar temporada atual** (nome e datas) existe porque encerrar era o único jeito de escrever esses campos: um dígito errado na data só se consertava encerrando de novo, ou seja, congelando uma temporada pela metade para arrumar a seguinte. Ele avisa quantas rodadas entram e saem da classificação antes de salvar, e recusa um início que invada período já congelado — a mesma rodada pontuaria duas vezes.

O segundo é o **Encerrar temporada e abrir a próxima**, com um botão só:

1. **Aviso passivo** quando `hoje > end_date` e a temporada segue aberta: *"O Inverno 26 terminou em 31/08. 2 jogos já lançados estão fora da janela. Encerre para congelar a classificação."*
2. **Diálogo de confirmação**, que faz as três checagens que evitam congelar errado:
   - jogo DENTRO da janela ainda sem resultado lançado → bloqueia com a lista;
   - votação de desempenho ainda aberta em algum jogo da janela (`ratings_perf_window_hours`) → bloqueia com o horário de fechamento, senão a nota congela pela metade;
   - resultados fora da janela → mostra quais vão para a temporada nova.
3. **Prévia**: campeão, pódio e melhor nota, do jeito que vão ficar gravados.
4. **Próxima temporada** pré-preenchida a partir de `profile.championship.cycle` (quadrimestral → +4 meses a partir do dia seguinte), com nome e datas editáveis.
5. **Commit** (`closeSeason`): congela `rows`, move `results`, empurra para `history`, zera o `active` com a temporada nova. Se o `year` da nova ≠ `year` da encerrada, congela também o ano em `years` — **a virada de ano não é um segundo ritual**, sai de graça no mesmo ato.

Temporada que atravessa o Ano Novo pertence ao ano do campo `year` (que já existe no shape), com default no ano do `end_date`.

## Mudanças por arquivo

**`championship.service.js`**
- `seasonWindowOf(snapshot)` + `resultBelongsToSeason(result, season)` (por `result.date`);
- `calculateCurrentRanking` passa a filtrar pela janela; nasce `getOutOfSeasonResults()` para alimentar o aviso;
- `closeSeason(snapshot, nextSeason)` — o congelamento descrito acima;
- `calculateAnnualRanking` deixa de ser "Abertura 26 importado + atual" e vira "temporadas do ano em `history` + a corrente";
- `nextSeasonSuggestion(profile, closingSeason)` a partir do `cycle`.

**`ratings.service.js`**
- `dateOfGameKey` + `playerRatingAverages(rows, { from, to })`;
- `getTopRatedPlayerId()` passa a ser o líder **da temporada corrente**;
- `seasonRatingTotals(rows, window)` devolvendo `{ sum, votes, avg }` por jogador — é o que `closeSeason` congela.

**`championship.view.js`**
- tirar os literais "Inverno 26" (`:525`) e "2026"/"Abertura 26 + Inverno 26" (`:532-533`) — passam a ler `activeMeta` e `year`;
- ★ da matriz vira nota **da temporada**; o card anual ganha uma coluna ★ anual;
- o bloco de histórico passa a listar as temporadas congeladas do blob, além do dataset legado;
- corrigir `pointsByStatus = { win: 3, draw: 2, loss: 1 }` fixo (`:155`) para a tabela do clube — senão a matriz de uma temporada congelada mostra a pontuação de outro clube.

**`storage.supabase.js`**
- `history` e `years` são append-only e **não são recomputáveis**. O guard atual (`META_FIELD_HAS_CONTENT.championship`, `:265`) só exige "objeto não vazio" — um estado degradado com `{active:{}}` passa e apaga o histórico inteiro. Reforçar para nunca gravar um `championship` com MENOS temporadas encerradas do que o anterior.

## O risco: o sorteio fica cego na virada

`buildStrengthResolver` (`game.service.js:569`) monta o índice de força com **50% nota + 50% pontos anuais**. Com a regra nova, no 1º jogo de uma temporada ninguém tem nota; no 1º jogo do ANO ninguém tem nota **nem** pontos — as duas métricas normalizam para 0.5, todo mundo empata em força e o sorteio cai para paridade de posição, ou seja, times praticamente aleatórios justo na semana em que o pessoal volta.

**Recomendação: desacoplar.** A regra do usuário é de *ranking e exibição*; equilibrar time é heurística interna e não deve zerar junto. O sorteio passa a usar **janela móvel de 12 meses** de votos (e pontos das últimas duas temporadas), independente do recorte da UI. Uma linha de código a mais, e a alternativa — "primeiro sorteio do ano no chute" — é bem pior do que a incoerência conceitual.

## Decisões (aprovadas em 31/08/2026)

1. **Nota anual ponderada por votos**, não média de médias (justificativa acima). ✔ já vale no congelamento da fase A.
2. **Áurea de melhor votado segue a temporada corrente** — fica sem dono nas 2–3 primeiras semanas, até alguém bater o mínimo de 3 votos. É a leitura honesta de "recomeça". *Aprovada; entra na fase B.*
3. **Mínimo de 3 votos para ranquear por nota** na temporada (hoje qualquer voto entra na coluna ★ e só a áurea exige 3). Em temporada curta, um único 10.0 lidera. Abaixo do mínimo a coluna mostra a média em cinza, mas não disputa posição. *Fase B.*
4. **Sorteio com janela móvel de 12 meses**, desacoplado da temporada. *Aprovada; entra na fase B.*

## Faseamento

- **Fase A — ENTREGUE (v1.182.0):** janela por data em `calculateCurrentRanking`, aviso de temporada vencida na tela, card de encerramento com as três travas, `closeSeason` congelando pontos **e notas**, virada de ano no mesmo ato, histórico de temporadas no blob (append-only também no merge do save), anual somando as encerradas do ano, títulos da tela e pontuação da matriz deixando de ser fixos, e a tela de **editar a temporada corrente** (nome e datas, com aviso de quantas rodadas entram/saem e recusa de invadir período já congelado). Testes em `tests/temporada-encerramento.regression.mjs`.
  - A nota já é **congelada** aqui, embora ainda seja EXIBIDA como média vitalícia: congelar é a única parte que não dá para fazer depois — excluir um jogo apaga os votos dele do banco.
- **Fase B — ENTREGUE (v1.183.0):** nota da temporada na coluna ★, nota anual ponderada no card anual, áurea por temporada, mínimo de 3 votos (abaixo dele a média aparece apagada), e sorteio com janela móvel de 12 meses, desacoplado da temporada. Junto veio o conserto do `label` da temporada corrente, que não era normalizado: depois do primeiro encerramento o hero anunciava a temporada ANTERIOR em cima das datas da nova. Testes em `tests/nota-por-temporada.regression.mjs`.
  - A janela da temporada chega ao serviço de notas por um setter chamado no `render` (`setRatingSeasonWindow`): a áurea é decidida dentro do render de cada avatar, em `getAvatarHtml`, que não tem o snapshot em mãos.
- **Fase C — aposenta o legado:** materializar Abertura 26 e Inverno 26 do `championship.history.js` dentro do `history` do clube legado, com `player_id` no lugar do casamento por NOME — mata de vez o `IMPORTED_SHEET_NAME_ALIASES` (`championship.service.js:49`), que já quebrou em silêncio três vezes por renomeação. Mais o `cycle` no perfil do clube, para a sugestão da próxima temporada não depender de inferir a duração da anterior (a edição de nome/datas da temporada corrente já saiu na fase A).

A fase C não tem prazo: ela arruma o histórico anterior ao encerramento, e o que vem daqui para frente já nasce congelado por player_id.
