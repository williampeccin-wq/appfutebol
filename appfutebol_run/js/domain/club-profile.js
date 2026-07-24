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

import { isLegacyBlobKey } from '../services/storage.supabase.js';

// Resolve sozinho se este é o blob da instalação original. Sem isto, todo
// chamador teria de repetir o try/catch — e bastava um esquecer para um clube
// novo herdar dado alheio. O default de um erro aqui é o lado SEGURO (não é
// legado), então falha de leitura nunca vira vazamento.
export function currentProfileOptions() {
  try { return { legacyBlob: isLegacyBlobKey() }; } catch (_) { return { legacyBlob: false }; }
}

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
    // Temporada corrente do clube. O DEFAULT é genérico de propósito: antes era
    // 'Inverno 2026' — a temporada do Harmonia — e todo clube novo abria o
    // campeonato vendo o nome da estação de outro grupo. O clube define a sua
    // no perfil; a instalação legada mantém a dela pela ponte.
    season: {
      id: 'temporada-atual',
      name: 'Temporada atual',
      label: 'Temporada atual',
      year: null,
      start_date: '',
      end_date: '',
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

// Temporada da instalação original. Fica aqui, e não no DEFAULT, porque é fato
// de um clube só — ver o comentário em `season`.
const LEGACY_SEASON = {
  id: 'inverno-2026',
  name: 'Inverno 26',
  label: 'Inverno 2026',
  year: 2026,
  start_date: '2026-05-01',
  end_date: '2026-08-31',
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
export function getClubProfile(state, options = null) {
  const { legacyBlob = false } = options || currentProfileOptions();
  const stored = isPlainObject(state?.profile) ? state.profile : null;

  // Ponte da instalação legada: enquanto o clube original (blob sob a key
  // 'default') não tiver perfil gravado, ele continua vendo o próprio histórico
  // E o nome da própria temporada. Clube novo nasce com club_id e nunca passa
  // por aqui — ele vê os defaults genéricos.
  const ehLegadoSemPerfil = !stored && legacyBlob;
  const championshipDefaults = {
    ...DEFAULT_PROFILE.championship,
    legacy_dataset: ehLegadoSemPerfil ? 'harmonia_rei_da_quadra' : DEFAULT_PROFILE.championship.legacy_dataset,
    season: ehLegadoSemPerfil ? LEGACY_SEASON : DEFAULT_PROFILE.championship.season,
  };

  return {
    schema_version: stored?.schema_version || DEFAULT_PROFILE.schema_version,
    game: mergeSection(DEFAULT_PROFILE.game, stored?.game),
    positions: mergeSection(DEFAULT_PROFILE.positions, stored?.positions),
    modules: mergeSection(DEFAULT_PROFILE.modules, stored?.modules),
    championship: mergeSection(championshipDefaults, stored?.championship),
  };
}

/**
 * Próxima data de jogo sugerida, a partir da cadência e do dia da semana do
 * clube. Devolve '' quando o clube não tem periodicidade ('avulso') — nesse
 * caso o admin digita a data, que é o comportamento correto para quem marca
 * jogo sem regra fixa.
 *
 * `hoje` é injetado (não usa Date.now internamente) para ser testável.
 */
export function proximaDataDeJogo(state, hoje, options = null) {
  const perfil = getClubProfile(state, options);
  const { cadence, day_of_week: diaAlvo } = perfil.game;

  if (cadence === 'avulso') return '';

  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  // Semanal e quinzenal: o próximo dia da semana configurado. "Hoje" não conta —
  // quem está criando o jogo hoje quer o próximo, não o de agora.
  if (cadence === 'semanal' || cadence === 'quinzenal') {
    if (!Number.isFinite(Number(diaAlvo))) return '';
    let delta = (Number(diaAlvo) - base.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    if (cadence === 'quinzenal') delta += 7;
    base.setDate(base.getDate() + delta);
    return isoDe(base);
  }

  // Mensal: mesmo dia da semana, no mês seguinte, mantendo a semana do mês
  // (ex.: "2ª quarta") — é assim que os grupos costumam marcar, e não "dia 15".
  if (cadence === 'mensal') {
    if (!Number.isFinite(Number(diaAlvo))) return '';
    const semanaDoMes = Math.floor((base.getDate() - 1) / 7);
    const proximoMes = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    let delta = (Number(diaAlvo) - proximoMes.getDay() + 7) % 7;
    proximoMes.setDate(1 + delta + semanaDoMes * 7);
    // Estourou o mês (5ª ocorrência que não existe): volta para a última.
    if (proximoMes.getMonth() !== (base.getMonth() + 1) % 12) proximoMes.setDate(proximoMes.getDate() - 7);
    return isoDe(proximoMes);
  }

  return '';
}

function isoDe(data) {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

// Presets de formato. Escolher um preenche o resto — é o atalho para quem não
// quer configurar campo a campo. 'custom' deixa os números como estão.
export const FORMATOS = {
  campo11:  { label: 'Campo (11 por time)',   players_per_team: 11, goalkeepers_per_game: 2 },
  society7: { label: 'Society (7 por time)',  players_per_team: 7,  goalkeepers_per_game: 2 },
  futsal5:  { label: 'Futsal (5 por time)',   players_per_team: 5,  goalkeepers_per_game: 2 },
  custom:   { label: 'Outro (eu defino)',     players_per_team: null, goalkeepers_per_game: null },
};

/** Quantos goleiros cabem num jogo deste clube. 0 = clube não usa goleiro fixo. */
export function goleirosPorJogo(state, options = null) {
  const n = Number(getClubProfile(state, options).game.goalkeepers_per_game);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

/** Quantos jogadores de linha por time — usado para sugerir o limite do jogo. */
export function jogadoresPorTime(state, options = null) {
  const n = Number(getClubProfile(state, options).game.players_per_team);
  return Number.isFinite(n) && n > 0 ? n : 11;
}

/**
 * Limite de jogadores de linha sugerido para um jogo novo: os dois times cheios.
 * Só sugestão — o admin edita no formulário, porque a realidade da quadra manda.
 */
export function limiteSugeridoDeJogo(state, options = null) {
  const perfil = getClubProfile(state, options);
  const times = Number(perfil.game.teams) || 2;
  return jogadoresPorTime(state, options) * times;
}

/** Quantos times o sorteio deste clube divide. 2 é o default histórico. */
export function timesPorJogo(state, options = null) {
  const n = Number(getClubProfile(state, options).game.teams);
  return Number.isFinite(n) && n >= 2 ? Math.floor(n) : 2;
}

/**
 * O campeonato está disponível para este clube?
 *
 * Com 3+ times em rodízio, uma noite tem VÁRIAS partidas (A×B, vencedor×C…) e o
 * campeonato modela "um resultado por jogo, um vencedor". Em vez de achatar a
 * realidade — dizendo que um time que ganhou 2 de 3 é igual a um que perdeu
 * todas — o módulo fica indisponível e a aba some, como já acontece com quem
 * desliga o módulo. Os resultados já lançados NÃO são apagados: voltar para 2
 * times traz o campeonato de volta como estava.
 */
export function campeonatoDisponivel(state, options = null) {
  if (!isModuleOn(state, 'campeonato', options)) return { ok: false, motivo: 'modulo_desligado' };
  if (timesPorJogo(state, options) > 2) return { ok: false, motivo: 'rodizio' };
  return { ok: true, motivo: null };
}

/** O clube usa posição em campo? Clube de pelada simples pode não usar. */
export function usaPosicoes(state, options = null) {
  return getClubProfile(state, options).positions.enabled !== false;
}

/** Horário padrão do jogo deste clube. */
export function horarioPadraoDeJogo(state, options = null) {
  return getClubProfile(state, options).game.default_time || '';
}

/**
 * Monta o perfil a partir dos campos do formulário de configuração.
 *
 * É PURA de propósito: `campos` é qualquer coisa com `.get(nome)` — um FormData
 * no browser, um Map no teste. Enquanto essa transformação morava dentro do
 * listener de submit, ela era a única parte da parametrização sem cobertura, e
 * é justamente onde um nome de campo errado (ou uma seção esquecida no spread)
 * passa despercebido: o admin salva, o app diz "salvo", e o valor não foi.
 *
 * Grava o perfil COMPLETO (defaults + o que mudou). O acessor tolera perfil
 * parcial, mas gravar inteiro deixa explícito no banco o que o clube pratica —
 * e tira a instalação legada da ponte do dataset histórico.
 */
export function perfilDoFormulario(campos, perfilAtual) {
  const atual = perfilAtual;
  const texto = (nome, padrao) => String(campos.get(nome) || padrao);
  const ligado = (nome) => campos.get(nome) === 'on';
  const inteiro = (nome, padrao) => {
    // String vazia PRECISA ser rejeitada explicitamente: Number('') é 0, e 0
    // passa em `>= 0`. Sem esta guarda, o admin que apagasse o campo para
    // redigitar e salvasse sem querer zerava a configuração do clube — e
    // "0 jogadores por time" é uma configuração destrutiva e silenciosa.
    const bruto = campos.get(nome);
    if (bruto === null || bruto === undefined || String(bruto).trim() === '') return padrao;
    const n = Number(bruto);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : padrao;
  };

  return {
    ...atual,
    schema_version: 1,
    game: {
      ...atual.game,
      format: texto('format', atual.game.format),
      teams: Math.max(2, inteiro('teams', atual.game.teams)),
      players_per_team: inteiro('players_per_team', atual.game.players_per_team),
      goalkeepers_per_game: inteiro('goalkeepers_per_game', atual.game.goalkeepers_per_game),
      cadence: texto('cadence', atual.game.cadence),
      day_of_week: inteiro('day_of_week', atual.game.day_of_week),
    },
    positions: { ...atual.positions, enabled: ligado('usa_posicoes') },
    modules: {
      ...atual.modules,
      churrasco: ligado('mod_churrasco'),
      campeonato: ligado('mod_campeonato'),
      votacao_desempenho: ligado('mod_votacao'),
    },
    championship: {
      ...atual.championship,
      points: {
        win: inteiro('pts_win', atual.championship.points.win),
        draw: inteiro('pts_draw', atual.championship.points.draw),
        loss: inteiro('pts_loss', atual.championship.points.loss),
        no_play: inteiro('pts_no_play', atual.championship.points.no_play),
      },
    },
  };
}

/** Módulo ligado para este clube? Usado para esconder abas e ações. */
export function isModuleOn(state, moduleName, options = null) {
  const modules = getClubProfile(state, options).modules;
  return modules[moduleName] !== false;
}

/** Temporada corrente do campeonato do clube. */
export function getChampionshipSeason(state, options = null) {
  return getClubProfile(state, options).championship.season;
}

/** Pontuação por resultado do clube (3/2/1/0 por padrão). */
export function getChampionshipPoints(state, options = null) {
  return getClubProfile(state, options).championship.points;
}

/**
 * Qual dataset histórico importado este clube usa (ou null).
 * Ver o comentário em DEFAULT_PROFILE.championship.legacy_dataset.
 */
export function getChampionshipLegacyDataset(state, options = null) {
  return getClubProfile(state, options).championship.legacy_dataset || null;
}
