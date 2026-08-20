# Testes

Sem dependências e sem build: usam o runner embutido do Node e importam os
módulos reais de `appfutebol_run/js`.

```bash
node --test "tests/*.regression.mjs"
```

Rodam sozinhos a cada push em `main` e `production` (`.github/workflows/testes.yml`).

## O que cada suíte protege

| arquivo | incidente / risco |
|---|---|
| `apagao.regression.mjs` | cache local devolvia semente e o adapter publicava ela no servidor |
| `conflito-sobrescrita.regression.mjs` | gravação concorrente apagava alteração alheia em silêncio (15/07); e o merge de um nível levava junto resultado de campeonato que o cliente nunca viu (20/08) |
| `votacao-confirmacoes.regression.mjs` | votação sumia da tela ao criar o próximo jogo: elegibilidade vinha das confirmações do jogo ATIVO, não do jogo com janela aberta (20/08) |
| `notas-paginacao.regression.mjs` | leitura de notas truncava no teto do PostgREST sem erro, e a média truncada desequilibrava o sorteio (20/08) |
| `campeonato-pontuacao.regression.mjs` | heurística de remoção atropelava a declaração do admin; substituição muda |
| `club-profile.regression.mjs` | clube novo herdava pontos de outro clube por coincidência de nome |
| `profile-persistencia.regression.mjs` | perfil do clube sumia no ida-e-volta com o servidor |
| `perfil-formulario.regression.mjs` | tela de configuração gravar errado ou apagar o que não está nela |
| `cadencia.regression.mjs` | campo de parametrização exposto que não decide nada |

## Como escrever uma nova

Duas regras que vieram de erro real nesta base:

1. **Verifique que o teste FALHA no código anterior.** Um teste que passa dos
   dois lados não protege nada. `git stash` no arquivo corrigido, rode, confirme
   a falha, `git stash pop`.

2. **Lógica dentro de listener de DOM não é testável.** Extraia a transformação
   para uma função pura no domínio e deixe o listener como casca. Foi assim que
   `perfilDoFormulario` apareceu — e ela achou um bug (campo vazio virava 0)
   que ninguém tinha visto na tela.

## O que estas suítes NÃO cobrem

- **Renderização e CSS.** Três bugs de contraste nesta base passaram por aqui.
  Para telas novas: extraia o template do `app.js`, avalie com dados de exemplo,
  sirva com o `app.css` real e olhe. Não é automático, mas é barato.
- **O caminho completo com Supabase real.** O `fetch` é falso nas suítes.

## Autoteste de ponta a ponta (`/autoteste.html`)

As suítes acima usam `fetch` falso. Para exercitar o caminho REAL — gravar no
Supabase, reler do servidor, conferir que o app enxerga — abra `/autoteste.html`
**já logado** no Convocados.

Ele grava um perfil bem diferente do default (futsal, 0 goleiros, churrasco
desligado, pontuação 2/1/0/0), relê, confere, e **devolve a configuração
original** — inclusive se estourar no meio (o restore roda no `catch`).

Duas travas, em código e não em cuidado do operador:
- recusa rodar se o Supabase configurado for o do **Harmonia de produção**;
- recusa rodar sem sessão (não faz login sozinho).

Não roda em CI: precisa de sessão autenticada. É o preço de testar o caminho de
verdade sem guardar senha em segredo de repositório.
