---
name: design-harmonia
description: Regras visuais e de interação do app do Harmonia FC (branch production, appfutebol_run). Use SEMPRE que for criar ou alterar tela, componente, CSS ou markup gerado por JS — tela nova, botão, card, modal, estado vazio, formulário, chip de status, ajuste de cor/espaçamento/tipografia. Também use ao revisar CSS antes de commitar. Define os tokens canônicos (--hfc-*), o tema Stadium Glass, alvos de toque, vocabulário do produto e as armadilhas conhecidas do arquivo css/app.css.
---

# Design do Harmonia FC

O app é uma PWA vanilla JS, sem framework e sem biblioteca de componentes. Um único
`appfutebol_run/css/app.css` (~7,1 mil linhas) serve 6 telas. Não existe nada que
force consistência: se esta skill não for seguida, cada tela nova inventa o próprio
botão. Foi o que aconteceu até aqui — ver "Dívida conhecida".

## Contexto de uso (decide mais que gosto)

Quem abre é jogador de futebol amador, no celular, quase sempre com **uma mão**, e
com frequência **na beira do campo, com sol na tela**. Disso saem regras, não
preferências:

- Alvo de toque nunca abaixo de **44 px** de altura. Ação destrutiva ou irreversível
  (excluir jogador, fechar convocação, remover do sorteio): **48 px** e separada por
  no mínimo 8 px de qualquer outro botão.
- Ação principal da tela fica na **metade de baixo**, alcançável com o polegar.
  O topo é para informação, não para o botão que a pessoa mais aperta.
- O app é PWA e roda em **modo standalone**. Todo container de ação ancorado na
  base leva `padding-bottom: max(16px, env(safe-area-inset-bottom))` — barra de
  ação fixa, footer de modal, navegação inferior. Sem isso o botão mais apertado
  do app fica sob o home indicator do iPhone.
- Contraste mínimo **4.5:1** para texto. Sol na tela não perdoa cinza sobre cinza.
- Texto de conteúdo nunca abaixo de **13 px**. 11 px e 12 px são só para rótulo
  auxiliar (data, contador, unidade) — nunca para algo que precise ser lido.
- O app roda dentro de `.app-shell`, `max-width: 480px`, centralizado. Projete para
  360–430 px de largura útil. Não existe layout de desktop.

## O tema é escuro. Só o escuro.

O app é **Stadium Glass**: fundo navy com gradiente radial, superfícies de vidro
translúcido, ouro como acento. O tema claro que existiu antes **está morto**, mas o
CSS ainda carrega restos dele — e é daí que vem quase todo bug visual do projeto.

Duas armadilhas ativas:

1. `body` ainda herda `color: #111827` (escuro), do tema claro. Quem estabelece o
   texto claro é o container: `.login-screen, .content { color: var(--hfc-text); }`.
   Texto solto fora de um desses containers **some**. Já custou ~70 correções tela a
   tela (ver o comentário datado em `css/app.css` na regra `.content`).
2. `.content` genérico ainda tem `background: var(--gray-050)` — claro. Cada tela
   declara o próprio fundo escuro no seu `.content--<tela>`.

**Regra da tela nova:** ao criar `.content--<nome>`, declare o fundo escuro no mesmo
commit. Sem isso a tela nasce com fundo cinza-claro e texto claro por herança —
invisível. Padrão a copiar:

```css
.content--<nome> {
  background: radial-gradient(130% 60% at 50% -6%,
    var(--hfc-navy-700) 0%, var(--hfc-navy-800) 40%, var(--hfc-navy-900) 100%);
  position: relative;
  overflow: hidden;
}
```

Telas existentes: `home`, `weekly_game`, `players`, `carne`, `championship`, `config`.
Não há tela de financeiro nesta branch — `finance.service.js` existe, view não.

## Tokens canônicos

Use **só** o conjunto `--hfc-*` (definido em `css/app.css`, bloco `:root` por volta
da linha 5474). Ele é o tema atual.

| Token | Valor | Uso |
|---|---|---|
| `--hfc-navy-900` | `#060a16` | fim do gradiente, fundo mais profundo |
| `--hfc-navy-800` | `#0c1a38` | fundo base das telas |
| `--hfc-navy-700` | `#1b3a73` | topo do gradiente, realce |
| `--hfc-gold` | `#f0a500` | acento: borda de foco, marca |
| `--hfc-gold-200` | `#ffc23d` | **acento em texto** (link, aviso, destaque) |
| `--hfc-grass` | `#19c37d` | sucesso, confirmado, pago |
| `--hfc-glass` | `rgba(0,0,0,.18)` | superfície de card — **escurece** o fundo |
| `--hfc-glass-2` | `rgba(0,0,0,.15)` | superfície aninhada — escurece menos, logo fica *mais clara* que `--hfc-glass` |
| `--hfc-glass-border` | `rgba(255,255,255,.12)` | borda de qualquer superfície |
| `--hfc-line` | `rgba(150,195,255,.16)` | divisória |
| `--hfc-text` | `#eef2f9` | texto principal |
| `--hfc-text-muted` | `#9ea8bd` | texto secundário — 4.63:1 no topo do gradiente |
| `--hfc-text-dim` | `#7e8aa3` | **LEGADO, não usar.** 3.19:1 sobre `--hfc-navy-700`: reprova no topo de qualquer tela. Ao tocar numa regra que o usa, converta para `--hfc-text-muted` |
| `--hfc-accent-blue` | `#8fb4ff` | informação, neutro ativo |
| `--hfc-radius-lg` | `20px` | card, modal |
| `--hfc-radius` | `16px` | superfície menor, campo |

**Ouro nunca como texto sobre fundo claro** — `#f0a500` sobre branco dá 2.08:1,
reprova em qualquer critério. Sobre navy dá 8.26:1, e aí pode. Em texto sobre
escuro prefira `--hfc-gold-200`.

**Contraste se verifica contra o fundo composto — `--hfc-navy-700` com a superfície
de vidro por cima**, que é onde quase todo texto do app está. Navy-700 é o topo do
gradiente radial, e é exatamente onde esta skill manda pôr informação.

O vidro **escurece**. Isso significa que o pior caso é **texto solto direto no
gradiente, sem card** — a coluna "puro" abaixo. Um texto que passa lá passa em
qualquer lugar. Referência medida sobre navy-700:

| Token | puro | vidro | aninhado |
|---|---|---|---|
| `--hfc-text` | 9.85 | 11.56 | 11.32 |
| `--hfc-text-muted` | 4.63 | 5.43 | 5.32 |
| `--hfc-gold-200` | 6.86 | 8.05 | 7.89 |
| `--hfc-accent-blue` | 5.34 | 6.27 | 6.14 |
| `--hfc-grass` | 4.81 | 5.65 | 5.53 |
| `--hfc-text-dim` (legado) | **3.19** | **3.74** | **3.66** |

O `--hfc-text-dim` reprova nas três colunas — não há fundo neste app onde ele passe.

Não crie token novo para resolver uma tela. Se precisou de uma cor que não está
aqui, ou é caso de reusar uma existente, ou é decisão de paleta — pergunte antes.

### Tokens legados: não use

`--blue-*`, `--gold-*`, `--gray-*`, `--red-*`, `--green-*`, `--radius-md/lg`,
`--shadow-sm/md`, `--harmonia-*` são do tema claro morto. Estão no arquivo só porque
ainda há regras antigas dependendo deles. **Código novo não os referencia.** Ao
mexer numa regra que já usa um deles, converta para o equivalente `--hfc-*`.

Estes são referenciados mas **nunca foram definidos** — qualquer uso é bug silencioso
(a propriedade cai fora): `--primary`, `--text`, `--border`, `--gray-600`,
`--hfc-accent`, `--hfc-accent-green`, `--hfc-border`.

## Escala

Só estes valores. A ausência de escala é o que fez o arquivo acumular 42 tamanhos de
fonte e 24 raios diferentes.

- **Espaçamento e gap:** 4, 8, 12, 16, 24 px. (8, 10 e 12 já dominam o arquivo; 10 é
  tolerado no que existe, mas não use em código novo.)
- **Padding de superfície:** 12 px (compacto), 16 px (padrão), 24 px (tela).
- **Tipografia:** 11 (rótulo), 13 (secundário), 15 (corpo), 20 (título de seção),
  24 (título de tela). Peso 400 corpo, 600 ênfase e botão, 800 título.
- **Raio:** 12 px (campo, botão), `--hfc-radius` 16 px (superfície), `--hfc-radius-lg`
  20 px (card, modal), 999 px (chip, pill, avatar). Nada além disso.
- **Sombra:** o tema é vidro — a separação vem de `--hfc-glass-border`, não de sombra.
  Sombra só em modal e em elemento que flutua sobre a tela.

## Componentes

Antes de escrever CSS novo, procure a classe existente. `grep -n '^\.' css/app.css`.

**Botão** — base `.btn`, variantes `.btn-primary` (ação da tela, uma por tela) e
`.btn-secondary`. Compacto: `.btn-sm` / `.btn-compact`. Nunca crie
`.<tela>-<coisa>-btn`; se a variante não existe, adicione uma modificadora ao `.btn`.

**Superfície de vidro** — `background: var(--hfc-glass)`, `border: 1px solid
var(--hfc-glass-border)`, `border-radius: var(--hfc-radius-lg)`, `padding: 16px`.
Superfície dentro de superfície usa `--hfc-glass-2` e raio 16 px.
Desde o porte do Convocados v1.193.0 (aqui, v1.196.0) o vidro escurece, então `--hfc-glass-2` (menos preto)
fica **mais claro** que `--hfc-glass` — a superfície aninhada sobe, como elevação em
tema escuro.

`--hfc-glass-2` é sempre aninhado: solto direto no gradiente ele compete com o card
que deveria contê-lo. São 28 declarações no `app.css`.

Ao verificar isso você não pode ler a ancestralidade no arquivo: as views são
compostas por **fragmentos** (`renderWeeklyRow`, `renderTeam`, `pairRow`,
`renderRankingTable`, `renderLineupEditor`…) que devolvem pedaço de HTML e são
injetados noutro lugar. Quem determina o pai é o **consumidor** do fragmento, não o
que está acima dele no arquivo. Rastreie a chamada — no `main` essa confusão gerou
uma classificação errada de 7 componentes.

### Exceção: card sobre `--hfc-navy-900`

O vidro escuro pressupõe fundo com alguma luz. Sobre `--hfc-navy-900` — a base do
gradiente, e o fundo cheio de telas como `.fatal-screen` — ele deixa de funcionar:

| Superfície sobre navy-900 | separação vs. fundo |
|---|---|
| `--hfc-glass-2` | 1.01 |
| `--hfc-glass` | 1.01 |
| branco `rgba(255,255,255,.06)` | 1.13 |

Em 1.01:1 o card e o fundo são a mesma cor, e só a borda sobra. Trocar um token de
vidro pelo outro não resolve — os dois são pretos. **Card cujo fundo é navy-900
declara superfície clara explícita**, sem token de vidro. É o caso de `.fatal-card`
(`appfutebol_run/css/app.css`, procure "EXCEÇÃO ao vidro escuro").

## Onde mora o markup

Toda tela é uma função que **devolve string de HTML** (template literal), aplicada com
`innerHTML`. Não há DOM API, não há componente. É por isso que estilo inline se
infiltra com facilidade — a classe é a única defesa.

O despachante é `renderTab()` em `js/core/app.js`: um `switch` sobre a aba ativa que
chama a função da tela.

**Convenção:** `js/modules/<domínio>/<domínio>.view.js`, exportando
`render<Tela>Screen(...)`. O `.service.js` irmão guarda a lógica; o `.view.js` é só
markup.

A migração está **pela metade** — não presuma que a tela que você procura já foi
extraída:

| Tela | Onde está |
|---|---|
| auth | `modules/auth/auth.view.js` → `renderAuthScreen` |
| players | `modules/players/players.view.js` → `renderPlayersScreen` |
| carne | `modules/players/players.view.js` → `renderCarneScreen` |
| championship | `modules/championship/championship.view.js` → `renderChampionshipScreen` |
| **home** | `core/app.js` → `renderHome` |
| **weekly_game** | `core/app.js` → `renderWeeklyGame` |
| **config** | `core/app.js` → `renderConfig` |
| navegação inferior | `core/app.js` → `renderBottomNav` |

Duas coisas que a tabela não mostra e importam:

- `players.view.js` serve **duas** telas (players e carnê). Um arquivo por domínio,
  não por tela — o domínio é que manda.
- `game/` e `finance/` têm service mas **não têm view**. O markup do jogo da semana
  está em `core/app.js`; financeiro não tem tela nesta branch.

**Regra:** tela nova nasce em `modules/<domínio>/<domínio>.view.js`. Nunca faça
`core/app.js` crescer — é o maior arquivo do projeto, e cada tela que continua lá é uma tela que
ninguém consegue mexer com segurança. Já mexer numa tela que ainda mora no `app.js`
não obriga a extrair: extração é mudança grande, decida à parte.

## Vocabulário

Use os termos do produto, sempre, na UI e nos nomes de classe. Nunca traduza para
termo genérico de software.

| Certo | Errado |
|---|---|
| convocado / convocação | selecionado, escalação |
| carnê | mensalidade, cobrança, fatura |
| sorteio | balanceamento, geração de times |
| nota | rating, avaliação, score |
| presença | check-in, RSVP |
| clube | organização, tenant, workspace |
| jogador | usuário, membro |
| mensalista / avulso | assinante, convidado |

Texto de interface em português do Brasil, sem ponto final em rótulo de botão, sem
CAIXA ALTA em título (só em `.boot-subtitle`, que é assinatura de marca).

### Carnê e churrasco não são a mesma coisa

Nesta branch a palavra de interface é **Carne** — `['carne', 'Carne']` no
`core/app.js`. "Churrasco" existe, mas nomeia outra coisa: a **dupla** sorteada no
rodízio (`getChurrascoDuo`, "Votação do churrasco"). Carnê é o grupo/rodízio de
pagamento; churrasco é a dupla da semana.

| Camada | Palavra |
|---|---|
| Rótulo na navegação | **Carne** |
| Chave da aba, seletor CSS, classes | `carne` — `.content--carne`, `.carne-rotation-item` |
| Papel do jogador | `getPlayerRole() === 'carne'` → "Grupo do carnê", "Somente carnê" |
| A dupla da semana | churrasco — `getChurrascoDuo`, "Dupla da carne" na tela |

**Atenção ao portar do `main`:** lá o Convocados chama a aba inteira de
"Churrasco" e não usa "carnê" na interface. É o conflito mais comum do
cherry-pick — resolva mantendo a palavra **desta** branch.

## Não faça

- **`!important`.** Já há 370 no arquivo, e cada um torna o próximo inevitável. Se
  precisou, o seletor está errado — aumente a especificidade prefixando com
  `.content--<tela>`, que é como o resto do arquivo resolve isso.
- **`style="..."` em template de JS.** Há 71 espalhados (34 só em
  `finance.ledger.view.js`). São invisíveis para qualquer refatoração de tema. Crie
  a classe.
- **Hex cru.** Há ~500 fora do `:root`. Toda cor nova sai de um token `--hfc-*`.
- **Um `:root` novo.** Já existem 4 blocos `:root` no arquivo, e essa fragmentação é
  a razão de duas paletas conviverem. O bloco válido é o do Stadium Glass.
- Emoji como ícone de ação, seta `→` colada no texto do botão, eyebrow em CAIXA
  ALTA acima de todo título, card genérico repetido com o mesmo raio e a mesma
  sombra para tudo. São os tiques de interface gerada por IA.

## Dívida conhecida (contexto, não tarefa)

Auditoria de 08/09/2026, feita no `main` e conferida aqui, para calibrar
expectativa ao ler o arquivo: 2 paletas convivendo, 4 blocos `:root`, tokens
fantasma (usados e nunca definidos), **356 `!important`**, centenas de hex fora do
`:root`, dezenas de tamanhos de fonte e de raios, 6 famílias de estado vazio, 5 de
modal, estilos inline no JS. O `app.css` daqui tem 7.146 linhas.

Esta branch também tem uma suíte **menor** que a do `main` (12 arquivos de
regressão contra 24) e não tem `tests/README.md` — lembre disso no cherry-pick.

Não saia consertando isso em massa — é mudança grande e arriscada de validar num app
sem teste visual. A regra é **não piorar**: código novo segue esta skill, e regra
antiga que você já está tocando por outro motivo você converte de passagem.

## Antes de fechar

- [ ] Toda cor sai de token `--hfc-*`; nenhum hex cru, nenhum token legado.
- [ ] Tela nova declara o próprio fundo escuro em `.content--<nome>`.
- [ ] Espaçamento, fonte e raio saem da escala.
- [ ] Alvo de toque ≥ 44 px; ação destrutiva ≥ 48 px e afastada.
- [ ] Ação principal alcançável com o polegar.
- [ ] Contraste ≥ 4.5:1 no texto, medido contra `--hfc-navy-700` **puro** (topo do gradiente, sem card) — é o pior caso.
- [ ] Container ancorado na base tem `env(safe-area-inset-bottom)`.
- [ ] Nenhum `!important` e nenhum `style=` novo.
- [ ] Reusou classe existente em vez de criar a sétima variante.
- [ ] Vocabulário do produto na UI e nos nomes de classe.
- [ ] Estado vazio diz o que fazer.
