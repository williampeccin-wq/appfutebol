# Club Profile — parametrização por clube (multi-tenant)

Status: **design** (não implementado). Origem: auditoria de particularidades hardcoded do Harmonia (17/07/2026). Ver `multitenant-design.md`, `gating-plano.md`.

## Objetivo

Cada clube tem costumes diferentes (período de campeonato, dia do jogo, nº de times, se tem churrasco/carnê…). Hoje esses costumes estão **hardcoded pra realidade do Harmonia**. Este doc define um **perfil de clube** parametrizável.

## Princípios

1. **Aditivo, não-destrutivo.** Novo objeto `profile` dentro de `app_meta.data` (blob por clube). Sem migração de tabela.
2. **Default = comportamento legado.** Clube SEM `profile` (Harmonia hoje) se comporta EXATAMENTE como antes. O accessor preenche defaults iguais ao hardcoded atual.
3. **Uma fonte de leitura.** Todo consumo passa por `getClubProfile(state)` — nada lê o blob cru. Facilita evoluir o schema.
4. **Onboarding escolhe um preset.** `register-player` grava um `profile` explícito no clube novo (a partir de um preset), então clube novo NÃO herda os módulos/dados do Harmonia.

## Onde vive

`app_meta.data.profile` (por `club_id`). Convive com o que já existe no blob: `games`, `carne`, `championship`, `settings`, `active_game_id`.

Relação com `settings`: `settings` já guarda a parte de **dinheiro** por-clube (`mens_amount`, `mens_beneficiary`, `mens_expire_date`, `mens_enforcement_mode`, `ratings_perf_window_hours`, `notifications`) — **fica como está**. `profile` cobre a parte **estrutural** (formato do jogo, módulos, campeonato). Não duplicar; unificar só se um dia valer a pena.

## Schema

```jsonc
// app_meta.data.profile
{
  "schema_version": 1,

  "game": {
    "format": "campo11" | "society7" | "futsal5" | "custom",
    "players_per_team": 11,          // derivado do format; editável no custom
    "teams": 2,                      // nº de times no sorteio (2 hoje; 3+ = fase 2)
    "rotation": "fixo" | "vencedor_fica",  // relevante p/ 3+ times
    "goalkeepers_per_game": 2,       // 0 = sem goleiro dedicado
    "goalkeeper_takes_spot": false,  // goleiro ocupa vaga de linha?
    "cadence": "semanal" | "quinzenal" | "mensal" | "avulso",
    "day_of_week": 3,                // 0=dom..6=sáb; null = sem dia fixo. Alimenta "próxima quarta" e auto-open
    "default_time": "20:00",
    "max_players": 14                // teto de linha do jogo
  },

  "positions": {
    "enabled": true,
    "set": ["gol", "zag", "meia", "atk"]  // customizável; [] = clube não usa posição
  },

  "modules": {
    "mensalidade": true,
    "campeonato": true,
    "carne": true,        // rodízio de pagamento (carnê)
    "churrasco": true,    // rodízio de duplas + votação de churrasco
    "votacao_desempenho": true,
    "pix_ia": true,
    "passkey": false
  },

  "championship": {
    "enabled": true,
    "cycle": "mensal" | "trimestral" | "quadrimestral" | "anual" | "custom",
    "points": { "win": 3, "draw": 2, "loss": 1, "no_play": 0 },
    "title": "Rei da Quadra",        // rótulo do ranking (jargão do clube)
    "season_label": "temporada"      // "Inverno 26" era estação; genérico aqui
    // temporadas em si viram entidade de dados por-clube (não hardcoded)
  }
}
```

## Accessor + defaults

`domain/club-profile.js` (novo):

```js
export const LEGACY_PROFILE = {           // = comportamento atual do Harmonia
  schema_version: 1,
  game: { format: 'campo11', players_per_team: 11, teams: 2, rotation: 'fixo',
          goalkeepers_per_game: 2, goalkeeper_takes_spot: false,
          cadence: 'semanal', day_of_week: 3, default_time: '20:00', max_players: 14 },
  positions: { enabled: true, set: ['gol','zag','meia','atk'] },
  modules: { mensalidade: true, campeonato: true, carne: true, churrasco: true,
             votacao_desempenho: true, pix_ia: true, passkey: false },
  championship: { enabled: true, cycle: 'quadrimestral',
                  points: { win: 3, draw: 2, loss: 1, no_play: 0 },
                  title: 'Rei da Quadra', season_label: 'temporada' },
};

// merge profundo raso: profile do clube sobrepõe LEGACY campo a campo.
export function getClubProfile(state) {
  return deepDefaults(state?.profile || state?.settings?.profile || {}, LEGACY_PROFILE);
}
export const isModuleOn = (state, name) => getClubProfile(state).modules?.[name] !== false;
```

Ponto-chave: **profile ausente ⇒ LEGACY** ⇒ Harmonia intacto sem tocar em dado.

## Módulos (preferência) vs cadeado Pro (comercial) — precedência

São **eixos independentes** e ambos permanecem. Não confundir:
- **`profile.modules.X`** (preferência): o clube USA esse recurso? Config do admin.
- **`isPro()`** (comercial): o clube tem ACESSO ao recurso Pro? Billing. Já existe em `domain/gating.js` (`renderProLock`, cadeados de Carnê/Campeonato/Relatório) — **não muda**.

Regra de precedência (definir no render de cada aba/recurso):
1. `!isModuleOn(state, X)` → **esconde** a aba (o clube optou por não usar; nem cadeado).
2. `isModuleOn && recursoÉPro && !isPro()` → **cadeado** (`renderProLock`, upsell).
3. `isModuleOn && (isPro() || recursoÉFree)` → **recurso liberado**.

Preferência primeiro, comercial depois. Sem isso, um clube que desligou o churrasco ainda veria o cadeado do churrasco — ruído.

## Presets de onboarding

`register-player` (e a UI de criar clube) escolhe UM preset e grava como `profile`:

| Preset | game.format / players_per_team / goalkeepers | módulos ligados por padrão |
|---|---|---|
| **Campo 11** | campo11 / 11 / 2 | jogo, presença, mensalidade, votação (churrasco/carnê/campeonato **perguntar**) |
| **Society 7** | society7 / 7 / 1 | idem |
| **Futsal 5** | futsal5 / 5 / 1 | idem |
| **Pelada (custom)** | custom / admin define | admin liga o que quiser |

Decisão a validar com o usuário: churrasco/carnê/campeonato **default OFF** pra clube novo (onboarding mais limpo) — o admin liga se quiser. Harmonia (legacy) permanece com tudo ON.

## Pontos de integração (hardcoded atual → ler do profile)

| Hardcoded hoje | Arquivo | Passa a ler |
|---|---|---|
| `ACTIVE_CHAMPIONSHIP {inverno-2026, quadrimestre}` | `championship.service.js:5` | temporada por-clube + `profile.championship.cycle` |
| Pontos 3/2/1/0 (`RESULT_OPTIONS`) | `championship.service.js` | `profile.championship.points` |
| "Rei da Quadra" / "Inverno 26" na UI | `championship.view.js` | `profile.championship.title` + temporada |
| "Rodízio semanal de quarta-feira" | `players.view.js:422,563` | `profile.game.day_of_week` + `cadence` |
| Ranking de churrasco sempre visível | `players.view.js:628` | `isModuleOn('churrasco')` |
| "Limite de 2 goleiros" | `game.service.js:129` | `profile.game.goalkeepers_per_game` |
| Posições fixas gol/zag/meia/atk | `authz.js`, `confirmations.js`, `players.service.js`, `championship.view.js` | `profile.positions.set` |
| Sorteio 2 times (`team_a`/`team_b`) | `state.guard.js`, sorteio, `championship.service.js` | `profile.game.teams` (**fase 2** — mudança estrutural) |
| **Rodízio do carnê fixo em DUPLA** (`player1_id`/`player2_id`) | `players.view.js` (Responsável 1/2, "Dupla responsável", filtro exige os 2) | `responsibles: []` livre — solo/dupla/trio/N (**fase 2** — mudança de shape, igual aos times) |
| Abas sempre presentes | `app.js` (render das abas) | `isModuleOn(...)` esconde Carnê/Campeonato/Churrasco |

## Migração

Nenhuma migração SQL (blob JSON). A adoção é por código:

1. **`validateAndRepairState` / `composeState`**: expõem `state.profile = getClubProfile(...)` no repair (com defaults). Clubes antigos: profile ausente → LEGACY.
2. **`register-player`**: ao criar clube, grava `app_meta.data.profile` a partir do preset escolhido no onboarding.
3. **Consumidores**: trocar cada hardcoded da tabela acima por leitura do profile, um de cada vez (cada troca é isolada e testável).
4. **Harmonia**: opcionalmente escrever um `profile` explícito = LEGACY_PROFILE (documenta o estado); ou deixar ausente (cai no default). Sem urgência.

## Faseamento (impacto × esforço)

- **Fase 1 — desbloqueia multi-tenant público (barato):**
  scaffold `profile` + `getClubProfile` + `isModuleOn`; **liga/desliga de módulos** (esconde Carnê/Campeonato/Churrasco quando off); campeonato vira **entidade por-clube** com `cycle`/`title`/`points` configuráveis (+ resolve o vazamento do histórico, task_6ba438cf). Resultado: clube novo não vê nada do Harmonia.
- **Fase 2 — formato do jogo:** `teams` 2→N (o item **mais caro** — `team_a`/`team_b` está estrutural no sorteio, state.guard e resultados do campeonato; generalizar p/ array de times), goleiros configuráveis, posições configuráveis. Impacta a "escalação visual" do backlog.
- **Fase 3 — refino:** cadência/dia do jogo, regra de pontos custom, unificar `settings` sob `profile` se valer.

## Os casos difíceis: cardinalidade que virou shape

Dois lugares onde um número (2) virou **estrutura de dados**, não config — generalizar exige migrar o shape, não só ler um parâmetro:

**2 → N times** (`team_a`/`team_b`):
- sorteio devolver `teams: [[...],[...],...]` em vez de `{team_a, team_b}`;
- `state.guard` (sortResult), resultados de campeonato (`outcome: team_a|draw|team_b`) e a UI de lançar resultado passarem a lidar com N times;
- formato de rodízio "vencedor fica" (fila de times).

**Dupla → N responsáveis do carnê** (`player1_id`/`player2_id`):
- `carne_schedule` passa a ter `responsibles: [id, ...]` (1 = solo, 2 = dupla, 3 = trio, N = livre);
- UI: um seletor de N responsáveis em vez de "Responsável 1/2"; render "A, B e C" em vez de "A e B";
- filtro/composeState: manter a entrada se `responsibles.length >= 1` e todos visíveis;
- **backward-compat**: ler `[player1_id, player2_id]` como `responsibles` quando o array novo estiver ausente (dados antigos do Harmonia).

Recomendação p/ os dois: manter o default atual (2 times / dupla) e tratar a generalização como projeto próprio na **Fase 2** — não misturar com o scaffold da Fase 1. São o mesmo padrão: cardinalidade fixa embutida no shape.
