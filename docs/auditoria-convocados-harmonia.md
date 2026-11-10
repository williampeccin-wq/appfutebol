# Auditoria Convocados × Harmonia — 10/11/2026

Levantamento feito antes de criar o app na conta de organização, para responder
duas perguntas: **(1)** o que foi corrigido no Harmonia e não chegou ao
Convocados, e **(2)** quanto de "Harmonia" ainda sobra dentro do produto.

## Método

As duas branches **não têm ancestral comum** (`git merge-base origin/main
origin/production` devolve vazio). `git log main..production` lista 242 commits,
incluindo o commit inicial do projeto — é ruído, não divergência. A comparação
teve de ser por **conteúdo e por assunto de commit**, não por histórico.

Conferidos: os 42 commits da `production` desde 01/08/2026, um a um, procurando
o equivalente no `main` por palavra-chave.

## 1. O porte Harmonia → Convocados está em dia

Os 42 commits têm equivalente no `main`. A numeração diverge (o Convocados está
em v1.213.0 e o Harmonia em v1.202.0) porque o `main` recebe também o que é só
do produto, mas o conteúdo chegou.

Dois casos que parecem lacuna e não são:

- `ee9d531 fix(convidado): goleiro convidado estourava ReferenceError` — é um
  conserto que **desfaz** no Harmonia uma chamada a `goleirosPorJogo()`, função
  que mora em `domain/club-profile.js` e **só existe no Convocados**. O `main`
  está certo como está.
- `v1.184.0` existe nos dois com redação diferente ("restringe o churrasco a
  quem jogou" lá, "só quem esteve no jogo vota no churrasco" aqui).

## 2. Lacuna real: `admin-reset-password`

**O Convocados chama uma Edge Function que não existe no projeto dele.**

| | |
|---|---|
| Chamada | [player-operations.service.js:33](../appfutebol_run/js/modules/players/player-operations.service.js:33) |
| Fonte no repositório | só na branch `production` — **não está no `main`** |
| Publicada em `convocados-prod` (`nwsnakzttmvuyejbfzom`) | **não** — `OPTIONS` devolve **404** |
| Publicada em `harmonia-prod` (`kpgghcrmbkrwpvtegcjh`) | sim — 200 |

Efeito para quem usa: o admin abre a ficha do jogador, digita a senha nova,
digita o segredo admin, e recebe **"Falha na operação de acesso."** O recurso
nunca funcionou no Convocados.

Dois detalhes antes de portar:

1. A versão do Harmonia tem `TECHNICAL_EMAIL_DOMAIN = "harmonia.app"` fixo. O
   Convocados usa o mesmo domínio técnico (ver item 3b), então funcionaria — mas
   o valor precisa virar o mesmo dos dois lados conscientemente, não por acaso.
2. A função é **single-tenant**: não carimba `club_id`. Antes de publicar no
   Convocados, conferir se ela precisa do carimbo — ver
   [club-id-stamp-rls](rls-audit-2026-08.md).

## 3. Resíduos de "Harmonia" no Convocados

105 linhas em 31 arquivos. Não são todas o mesmo problema.

### a) Visíveis ao público — estes importam agora

| Onde | O quê |
|---|---|
| `https://convocados.app.br/landing.html` | serve 200 e mostra um mockup do app rotulado **"Harmonia FC"**. Não está linkada de lugar nenhum, mas é pública e indexável. A landing boa é outra (`landing/index.html`, publicada à parte, sem nenhuma menção). |
| `https://convocados.app.br/autoteste.html` | serve 200. É ferramenta interna que **grava configuração de clube**. Exige sessão, e a trava embutida só bloqueia o Supabase do *Harmonia* — contra o `convocados-prod` ela roda. Um admin de clube real que achar a URL reescreve a própria configuração. |

Com o app indo para análise do Google, essas duas URLs ficam no mesmo domínio
que o revisor inspeciona.

### b) Identidade — dá para mexer, mas não de graça

`TECHNICAL_EMAIL_DOMAIN = 'harmonia.app'` em
[auth.service.js:7](../appfutebol_run/js/services/auth.service.js:7), repetido em
`storage.supabase.js:1584` e `player-operations.service.js:100`.

**Toda conta do Convocados é criada como `<telefone>@harmonia.app` no Supabase
Auth.** Trocar o domínio sem migrar os usuários existentes derruba o login de
todo mundo. É dívida real, mas não é tarefa de "limpeza" — é migração.

### c) Chaves internas — cosmético, com custo escondido

`window.HARMONIA_SUPABASE` (19), `harmonia_auth_session` (14), eventos
`harmonia:storage-full` / `:remote-conflict` / `:remote-save-failed`,
`__harmonia_build__`, `harmonia_push_onboarded`, `harmonia_browser_state`.

Renomear `harmonia_auth_session` **desloga todo mundo** (é chave de
`localStorage`). O resto é renomeação segura, mas toca muitos arquivos sem
mudar nada para quem usa.

### d) Comentários de incidente — manter

A maioria das 49 ocorrências de "harmonia" solto são comentários como
*"INCIDENTE 29/09/2026 (Harmonia): o admin removeu o Caue e a promoção…"*.
São o registro de onde cada bug foi visto. Apagar isso destrói a única
documentação de por que metade das travas existe.

## 4. Generalização por perfil de clube

Está mais avançada do que o `CLAUDE.md` sugere. O `club-profile.js` já resolveu
o essencial:

- temporada padrão genérica (`Temporada atual`), não mais `Inverno 2026`;
- dataset histórico do Harmonia (`harmonia_rei_da_quadra`) é **opt-in**, default
  `null` — clube novo não herda pontos de pessoa real por casamento de nome.

O que falta: dos **6 módulos declarados** no perfil padrão
(`mensalidade`, `campeonato`, `carne`, `churrasco`, `votacao_desempenho`,
`pix_ia`), só **3 são consultados** por `isModuleOn()` — `campeonato`,
`churrasco` e `votacao_desempenho`.

Ou seja: um clube que desligar `mensalidade`, `carne` ou `pix_ia` no perfil
continua vendo tudo. A chave existe, a tela ignora.

## 5. Prioridade — os três primeiros, feitos em 10/11/2026

1. ✅ **`landing.html` e `autoteste.html` fora do diretório publicado**
   (commit `2d20b8a`). A landing foi apagada; o autoteste foi para `tools/`,
   com receita de uso e `.gitignore` para a cópia de trabalho.
2. ✅ **`admin-reset-password` no `main`** (commit `c815bcc`, v1.214.0).
   Reescrita multi-clube: autoriza pelo JWT de quem chama, exige admin E
   mesmo `club_id`, resolve o `auth_user_id` no servidor. Sumiu o prompt do
   segredo nas duas telas. Descobriu-se no caminho que eram **duas** operações
   quebradas, não uma: "Criar acesso" também.
   ⚠️ **Falta publicar à mão no projeto `convocados-prod`** — push não publica
   Edge Function.
3. ✅ **Upsell do Pro sem link para fora** (commit `51e4748`, v1.215.0).
   `linkExternoPermitido()` decide em tempo de execução e falha para o lado
   seguro. 11 asserções em `tests/upsell-fora-do-app.regression.mjs`.

**Nada disso vai para a branch `production`.** O Harmonia não tem `gating.js`,
não tem `autoteste.html`, e `players` lá não tem `club_id` — a função nova
quebraria. A versão antiga dele continua certa para o contexto dele.

Depois, sem pressa:

4. Fazer `isModuleOn` valer para `mensalidade`, `carne` e `pix_ia`.
5. Decidir se vale migrar o domínio técnico `harmonia.app`. Hoje: não vale.
6. Renomear `window.HARMONIA_SUPABASE` e os eventos `harmonia:*`. Deixar
   `harmonia_auth_session` quieto.
7. `.confirm-modal` ainda é `background: var(--white)` — uma superfície clara
   dentro de um app escuro, que obriga cada conteúdo novo de modal a inverter
   a paleta. Achado ao estilizar o texto do upsell.
