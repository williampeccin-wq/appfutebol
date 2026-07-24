// PERFIL DO CLUBE — parametrização dos costumes que estavam hardcoded
//
// Cada clube joga de um jeito: nem todo mundo joga toda semana, nem todo mundo
// faz churrasco, nem todo campeonato é quadrimestral. Até aqui esses costumes
// eram constantes de módulo escritas para a realidade do Harmonia, então
// qualquer outro clube herdava as convenções — e, no caso do campeonato,
// herdava os DADOS também.
//
// Design completo em `docs/club-profile-design.md`. Este arquivo é a Fase 1:
// o acessor, os defaults e os módulos liga/desliga.
//
// PRINCÍPIOS
//
// 1. Aditivo. O perfil mora em `app_meta.data.profile`, junto do resto do blob.
//    Sem migração de tabela.
// 2. Default = comportamento atual. Clube sem perfil se comporta como hoje —
//    EXCETO no dataset histórico (ver abaixo), que é fato de um clube só.
// 3. Uma porta de leitura. Ninguém lê o blob cru; tudo passa por getClubProfile.

// Defaults estruturais: são os valores que o app já pratica hoje. Um clube sem
// perfil continua idêntico ao que era.
export const DEFAULT_PROFILE = {
  schema_version: 1,

  game: {
    format: 'campo11',
    players_per_team: 11,
    teams: 2,                    // 2 é estrutural hoje (team_a/team_b); N é Fase 2
    goalkeepers_per_game: 2,
    cadence: 'semanal',
    day_of_week: 3,              // 0=dom … 6=sáb
    default_time: '20:00',
  },

  positions: {
    enabled: true,
    set: ['gol', 'zag', 'meia', 'atk'],
  },

  modules: {
    mensalidade: true,
    campeonato: true,
    carne: true,
    churrasco: true,
    votacao_desempenho: true,
    pix_ia: true,
  },

  championship: {
    enabled: true,
    title: 'Rei da Quadra',
    points: { win: 3, draw: 2, loss: 1, no_play: 0 },
    // Temporada corrente. Fica no perfil (por clube) e não mais em código.
    season: {
      id: 'inverno-2026',
      name: 'Inverno 26',
      label: 'Inverno 2026',
      year: 2026,
      start_date: '2026-05-01',
      end_date: '2026-08-31',
    },
    // Dataset histórico importado de planilha. É FATO DE UM CLUBE ESPECÍFICO —
    // rodadas reais, com nomes reais de pessoas reais.
    //
    // Por isso o default aqui é `null` e não o legado: ele é OPT-IN. O doc
    // original previa "sem perfil = legado" para tudo, mas isso deixaria o
    // dataset do Harmonia ligado por omissão em qualquer clube novo — e o
    // casamento é por NOME, então um "Junior" qualquer herdaria 13 pontos de um
    // estranho. Não é uma convenção que dá para herdar por engano.
    legacy_dataset: null,
  },
};

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Merge raso por seção: o perfil do clube sobrepõe chave a chave, e o que ele
// não disser vem do default. Assim um perfil parcial (só `modules`, por ex.)
// não zera o resto.
function mergeSection(base, override) {
  if (!isPlainObject(override)) return { ...base };
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = isPlainObject(base[key]) && isPlainObject(value)
      ? { ...base[key], ...value }
      : value;
  }
  return merged;
}

/**
 * Perfil efetivo do clube: o que está gravado, completado pelos defaults.
 *
 * `legacyBlob` marca a instalação original single-tenant (blob sob a key
 * 'default', anterior ao multi-tenant). Serve de PONTE: enquanto o perfil do
 * Harmonia não for gravado, ele continua vendo o próprio histórico. Clube novo
 * nasce com club_id e nunca passa por aqui.
 */
export function getClubProfile(state, { legacyBlob = false } = {}) {
  const stored = isPlainObject(state?.profile) ? state.profile : null;

  const championshipDefaults = {
    ...DEFAULT_PROFILE.championship,
    legacy_dataset: (!stored && legacyBlob) ? 'harmonia_rei_da_quadra' : DEFAULT_PROFILE.championship.legacy_dataset,
  };

  return {
    schema_version: stored?.schema_version || DEFAULT_PROFILE.schema_version,
    game: mergeSection(DEFAULT_PROFILE.game, stored?.game),
    positions: mergeSection(DEFAULT_PROFILE.positions, stored?.positions),
    modules: mergeSection(DEFAULT_PROFILE.modules, stored?.modules),
    championship: mergeSection(championshipDefaults, stored?.championship),
  };
}

/** Módulo ligado para este clube? Usado para esconder abas e ações. */
export function isModuleOn(state, moduleName, options = {}) {
  const modules = getClubProfile(state, options).modules;
  return modules[moduleName] !== false;
}

/** Temporada corrente do campeonato do clube. */
export function getChampionshipSeason(state, options = {}) {
  return getClubProfile(state, options).championship.season;
}

/** Pontuação por resultado do clube (3/2/1/0 por padrão). */
export function getChampionshipPoints(state, options = {}) {
  return getClubProfile(state, options).championship.points;
}

/**
 * Qual dataset histórico importado este clube usa (ou null).
 * Ver o comentário em DEFAULT_PROFILE.championship.legacy_dataset.
 */
export function getChampionshipLegacyDataset(state, options = {}) {
  return getClubProfile(state, options).championship.legacy_dataset || null;
}
