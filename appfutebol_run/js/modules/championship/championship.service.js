import { isCarneOnly, playsFootball as authzPlaysFootball } from '../../domain/authz.js';
import { CHAMPIONSHIP_HISTORY } from './championship.history.js';
import { dateOfGameKey } from '../../services/ratings.service.js';

export const ACTIVE_CHAMPIONSHIP = {
  id: 'inverno-2026',
  name: 'Inverno 26',
  year: 2026,
  label: 'Inverno 2026',
  start_date: '2026-05-01',
  end_date: '2026-08-31',
};

export const RESULT_OPTIONS = [
  { value: 'no_play', label: 'Não jogou', points: 0 },
  { value: 'win', label: 'Vitória', points: 3 },
  { value: 'draw', label: 'Empate', points: 2 },
  { value: 'loss', label: 'Derrota', points: 1 },
];

export const TEAM_RESULT_OPTIONS = [
  { value: 'team_a', label: 'Time A venceu' },
  { value: 'draw', label: 'Empate' },
  { value: 'team_b', label: 'Time B venceu' },
];

const POINTS_BY_STATUS = RESULT_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.points;
  return acc;
}, {});

const IMPORTED_SHEET_NAME_ALIASES = {
  // De/para validado com a planilha Inverno 26.
  // ATENÇÃO: o alvo é o NOME DE EXIBIÇÃO ATUAL do jogador. Se alguém for
  // renomeado no app, o alias quebra em silêncio e a pessoa deixa de pontuar nas
  // rodadas importadas (foi o que aconteceu com Vinicius/Lucas/Samuel — os
  // alvos antigos "Vinicius amigo Caue"/"Lucas Neto" não existiam mais).
  'ADRIANO': 'DANO',
  'CAUE': 'S2CANSADO',
  'VINICIUS': 'VINICIUS CAUE',   // era 'VINICIUS AMIGO CAUE' (renomeado); confirmado admin 23/07
  'ANDRE DAMS': 'ANDRE',
  'ANDRÉ DAMS': 'ANDRE',
  'LUCAS SILVA': 'LUKINHA',      // era 'LUCAS NETO' (renomeado p/ Lukinha😎, mesmo fone); o emoji é removido pelo normalizeName; confirmado admin 23/07
  'DAVID': 'DVD',
  'GEDE': 'GEDIEL',
  'NATAN': 'NATAN',
  'PAPAI PH': 'PH',
  'SAMUEL': 'SAMUEL REIS',       // renomeado de 'Samuel'; confirmado admin 23/07
  'WILLIAM': 'WILLIAM',
};

const IMPORTED_SHEET_STATUS_BY_POINTS = {
  0: 'no_play',
  1: 'loss',
  2: 'draw',
  3: 'win',
};

const IMPORTED_SHEET_ROUNDS = [
  {
    id: 'import_rei_da_quadra_2026_05_06',
    date: '2026-05-06',
    label: '06/05',
    source: 'Planilha Rei da Quadra',
    values: {
      'Júnior': 2,
      'Adriano': 2,
      'André Dams': 2,
      'Broquinha': 2,
      'Broca': 2,
      'Cauê': 2,
      'David': 2,
      'Dick': 2,
      'William': 2,
      'Niniu': 2,
      'Papai PH': 2,
      'Vinícius': 2,
      'Lucas Silva': 0,
      'Gui': 2,
      'Caetano': 2,
      'Natan': 0,
      'Digão': 2,
      'Mário': 2,
      'Panga': 2,
      'Samuel': 0,
      'Gede': 0,
      'Vítor': 0,
      'Telo': 0,
      'Trocinho': 0,
    },
  },
  {
    id: 'import_rei_da_quadra_2026_05_13',
    date: '2026-05-13',
    label: '13/05',
    source: 'Planilha Rei da Quadra',
    values: {
      'Júnior': 3,
      'Adriano': 3,
      'André Dams': 3,
      'Broquinha': 3,
      'Broca': 3,
      'Cauê': 3,
      'David': 3,
      'Dick': 3,
      'William': 1,
      'Niniu': 1,
      'Papai PH': 1,
      'Vinícius': 1,
      'Lucas Silva': 1,
      'Gui': 1,
      'Caetano': 1,
      'Natan': 3,
      'Digão': 0,
      'Mário': 0,
      'Panga': 0,
      'Samuel': 1,
      'Gede': 0,
      'Vítor': 0,
      'Telo': 0,
      'Trocinho': 0,
    },
  },
  {
    id: 'import_rei_da_quadra_2026_05_20',
    date: '2026-05-20',
    label: '20/05',
    source: 'Planilha Rei da Quadra',
    values: {
      'Júnior': 3,
      'Adriano': 3,
      'André Dams': 1,
      'Broquinha': 1,
      'Broca': 1,
      'Cauê': 1,
      'David': 1,
      'Dick': 1,
      'William': 3,
      'Niniu': 3,
      'Papai PH': 3,
      'Vinícius': 3,
      'Lucas Silva': 3,
      'Gui': 1,
      'Caetano': 1,
      'Natan': 0,
      'Digão': 0,
      'Mário': 0,
      'Panga': 0,
      'Samuel': 0,
      'Gede': 0,
      'Vítor': 0,
      'Telo': 0,
      'Trocinho': 0,
    },
  },
  {
    id: 'import_rei_da_quadra_2026_05_27',
    date: '2026-05-27',
    label: '27/05',
    source: 'Planilha Rei da Quadra',
    values: {
      'Júnior': 2,
      'Adriano': 2,
      'André Dams': 2,
      'Broquinha': 2,
      'Broca': 2,
      'Cauê': 2,
      'David': 2,
      'Dick': 2,
      'William': 2,
      'Niniu': 2,
      'Papai PH': 2,
      'Vinícius': 2,
      'Lucas Silva': 2,
      'Gui': 2,
      'Caetano': 0,
      'Natan': 2,
      'Digão': 2,
      'Mário': 0,
      'Panga': 0,
      'Samuel': 0,
      'Gede': 0,
      'Vítor': 0,
      'Telo': 2,
      'Trocinho': 0,
    },
  },
  {
    id: 'import_rei_da_quadra_2026_06_03',
    date: '2026-06-03',
    label: '03/06',
    source: 'Planilha Rei da Quadra',
    values: {
      'Júnior': 3,
      'Adriano': 1,
      'André Dams': 1,
      'Broquinha': 3,
      'Broca': 1,
      'Cauê': 0,
      'David': 3,
      'Dick': 3,
      'William': 3,
      'Niniu': 3,
      'Papai PH': 1,
      'Vinícius': 0,
      'Lucas Silva': 1,
      'Gui': 3,
      'Caetano': 1,
      'Natan': 0,
      'Digão': 3,
      'Mário': 0,
      'Panga': 0,
      'Samuel': 0,
      'Gede': 0,
      'Vítor': 0,
      'Telo': 1,
      'Trocinho': 0,
      // Jogou em 03/06 mas ficou de fora da planilha importada (por isso nunca
      // pontuou nessa rodada). Confirmado pelo admin em 23/07/2026. 3 = vitória.
      'Robson': 3,
    },
  },
];

function normalizeImportedSheetName(value) {
  const normalized = normalizeName(value);
  return IMPORTED_SHEET_NAME_ALIASES[normalized] || normalized;
}

function getStatusFromImportedPoints(points) {
  return IMPORTED_SHEET_STATUS_BY_POINTS[Number(points)] || 'no_play';
}

function buildPlayerNameIndex(players) {
  const index = new Map();

  players.forEach((player) => {
    const normalized = normalizeName(player.name);
    if (normalized) index.set(normalized, player);
  });

  return index;
}

export function getImportedChampionshipResults(snapshot) {
  const players = getFootballPlayers(snapshot);
  const playerByName = buildPlayerNameIndex(players);

  return IMPORTED_SHEET_ROUNDS.map((round) => {
    const statuses = {};
    const audit_entries = [];

    Object.entries(round.values || {}).forEach(([sheetName, points]) => {
      const normalizedSheetName = normalizeImportedSheetName(sheetName);
      const player = playerByName.get(normalizedSheetName) || null;
      const status = getStatusFromImportedPoints(points);

      if (player?.id) {
        statuses[String(player.id)] = status;
      }

      audit_entries.push({
        sheet_name: sheetName,
        normalized_name: normalizedSheetName,
        app_name: player?.name || null,
        player_id: player?.id ? String(player.id) : null,
        status,
        points: Number(points || 0),
      });
    });

    return {
      id: round.id,
      date: round.date,
      created_at: round.date,
      outcome: 'imported_sheet',
      source: round.source,
      imported: true,
      team_a: [],
      team_b: [],
      statuses,
      audit_entries,
    };
  });
}

export function getEffectiveChampionshipResults(snapshot) {
  const imported = getImportedChampionshipResults(snapshot);
  const championship = getChampionshipState(snapshot);
  const importedIds = new Set(imported.map((result) => String(result.id)));

  return [
    ...imported,
    ...championship.active.results.filter((result) => !importedIds.has(String(result.id))),
  ].sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

// ===========================================================================
// TEMPORADA — janela, encerramento e histórico congelado
//
// Até 31/08/2026 `end_date` era só texto no hero: a classificação somava TODOS
// os resultados, então o jogo de setembro entrava no Inverno 26 — uma temporada
// que a própria tela dizia ter acabado. Aqui a janela passa a valer, e encerrar
// vira ato explícito do admin que CONGELA a tabela final.
//
// PRINCÍPIO: temporada encerrada é FATO, não cálculo. Nada recalcula o que está
// em `championship.history`. Sem isso, mudar a pontuação do clube, renomear um
// jogador ou excluir um jogo antigo reescreveria um quadrimestre já premiado —
// e no caso da nota o estrago é irreversível, porque excluir o jogo APAGA os
// votos dele do banco (deleteGameRatings).
//
// Clube sem datas na temporada (o default genérico do perfil) não tem janela:
// tudo continua entrando na classificação, como antes. A regra só aperta para
// quem definiu um período.
// ===========================================================================

export function getSeasonWindow(snapshot) {
  const active = getChampionshipState(snapshot).active;
  return {
    start: String(active.start_date || '').slice(0, 10),
    end: String(active.end_date || '').slice(0, 10),
  };
}

export function hasSeasonWindow(window) {
  return !!(window && (window.start || window.end));
}

export function isDateInSeason(date, window) {
  const dia = String(date || '').slice(0, 10);
  if (!dia) return false;
  if (window?.start && dia < window.start) return false;
  if (window?.end && dia > window.end) return false;
  return true;
}

/** Resultados que contam para a temporada CORRENTE. */
export function getSeasonResults(snapshot) {
  const window = getSeasonWindow(snapshot);
  const todos = getEffectiveChampionshipResults(snapshot);
  if (!hasSeasonWindow(window)) return todos;
  return todos.filter((result) => isDateInSeason(result.date, window));
}

/**
 * Resultados lançados FORA da janela da temporada. Nunca são descartados em
 * silêncio: alimentam o aviso na tela e migram para a próxima temporada no
 * encerramento. As rodadas importadas ficam de fora desta lista — elas
 * pertencem à temporada em que foram importadas e não são editáveis pelo admin,
 * então cobrá-las depois do encerramento seria um alerta que nunca some.
 */
export function getOutOfSeasonResults(snapshot) {
  const window = getSeasonWindow(snapshot);
  if (!hasSeasonWindow(window)) return [];
  return getEffectiveChampionshipResults(snapshot)
    .filter((result) => !result.imported && !isDateInSeason(result.date, window));
}

export function getFrozenSeasons(snapshot) {
  const history = getChampionshipState(snapshot).history;
  return Array.isArray(history) ? history : [];
}

export function getFrozenYears(snapshot) {
  const years = getChampionshipState(snapshot).years;
  return Array.isArray(years) ? years : [];
}

// Ano a que a temporada corrente pertence. O campo explícito manda (temporada
// que atravessa o Ano Novo pertence ao ano que o clube declarar); na falta
// dele, vale o ano do fim, e depois o do começo.
export function getSeasonYear(season) {
  const explicito = Number(season?.year);
  if (Number.isFinite(explicito) && explicito > 0) return explicito;
  const data = String(season?.end_date || season?.start_date || '').slice(0, 4);
  const ano = Number(data);
  return Number.isFinite(ano) && ano > 0 ? ano : null;
}

// Totais de nota (desempenho) por jogador dentro da janela. Devolve soma E
// quantidade — não a média — porque é a soma que permite montar o anual
// ponderado por votos depois, sem reler a tabela `ratings` (que pode ter
// perdido linhas por exclusão de jogo).
export function seasonRatingTotals(ratingRows, window) {
  const totais = new Map();
  for (const row of Array.isArray(ratingRows) ? ratingRows : []) {
    if (!row || row.kind !== 'desempenho') continue;
    const data = dateOfGameKey(row.game_key);
    if (!data) continue;                                   // voto sem data → fora
    if (hasSeasonWindow(window) && !isDateInSeason(data, window)) continue;
    const id = String(row.target_id);
    const atual = totais.get(id) || { sum: 0, votes: 0 };
    atual.sum += Number(row.score) || 0;
    atual.votes += 1;
    totais.set(id, atual);
  }
  return totais;
}

// Janela de votação de desempenho ainda aberta em algum jogo da temporada.
// Espelha getPerfWindow() do app.js: abre quando o resultado é LANÇADO e dura
// `ratings_perf_window_hours`. Encerrar com voto em andamento congelaria a nota
// pela metade — e a temporada congelada não é recalculável.
export function getOpenVotingResults(snapshot, nowMs) {
  const horas = Number(snapshot?.settings?.ratings_perf_window_hours) || 0;
  if (horas <= 0) return [];
  const agora = Number.isFinite(nowMs) ? nowMs : Date.now();
  return getSeasonResults(snapshot)
    .map((result) => {
      const abriu = Date.parse(result.created_at || '');
      if (!Number.isFinite(abriu)) return null;
      const fecha = abriu + horas * 3600_000;
      return fecha > agora ? { date: result.date, game_key: result.game_key, closeMs: fecha } : null;
    })
    .filter(Boolean);
}

// Jogos DENTRO da janela que já aconteceram e não têm resultado lançado. Um
// encerramento com jogo pendente congela a temporada sem uma rodada inteira.
export function getPendingSeasonGames(snapshot, today) {
  const window = getSeasonWindow(snapshot);
  const comResultado = new Set(getSeasonResults(snapshot).map((result) => String(result.date)));
  const hoje = String(today || '').slice(0, 10);
  return (Array.isArray(snapshot?.games) ? snapshot.games : [])
    .map((game) => ({ date: String(game?.game_date || '').slice(0, 10), game_key: game?.game_key || null }))
    .filter((game) => game.date
      && (!hoje || game.date <= hoje)
      && isDateInSeason(game.date, window)
      && !comResultado.has(game.date))
    .sort((left, right) => left.date.localeCompare(right.date));
}

/**
 * Situação da temporada para a tela e para o diálogo de encerramento.
 * `today` (AAAA-MM-DD) e `nowMs` vêm de fora: data local é do chamador, não do
 * domínio — calcular aqui com toISOString viraria o dia à noite, no fuso.
 */
export function getSeasonStatus(snapshot, { today = '', nowMs = Date.now() } = {}) {
  const active = getChampionshipState(snapshot).active;
  const window = getSeasonWindow(snapshot);
  const hoje = String(today || '').slice(0, 10);
  return {
    season: active,
    window,
    hasWindow: hasSeasonWindow(window),
    ended: !!(window.end && hoje && hoje > window.end),
    seasonResults: getSeasonResults(snapshot).length,
    outOfSeason: getOutOfSeasonResults(snapshot),
    pendingGames: getPendingSeasonGames(snapshot, hoje),
    openVoting: getOpenVotingResults(snapshot, nowMs),
    alreadyClosed: getFrozenSeasons(snapshot).some((s) => String(s.id) === String(active.id)),
  };
}

// --- Sugestão da próxima temporada -----------------------------------------
// Sem campo novo de configuração: a duração da próxima sai da duração da que
// está sendo encerrada (01/05→31/08 = 4 meses ⇒ 01/09→31/12). O admin edita o
// que quiser antes de confirmar.

function partesIso(iso) {
  const [ano, mes, dia] = String(iso || '').split('-').map(Number);
  return (ano && mes && dia) ? { ano, mes, dia } : null;
}

function isoDe(ano, mes, dia) {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function diaSeguinte(iso) {
  const p = partesIso(iso);
  if (!p) return '';
  const d = new Date(Date.UTC(p.ano, p.mes - 1, p.dia + 1));
  return isoDe(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function mesesEntre(inicio, fim) {
  const a = partesIso(inicio);
  const b = partesIso(fim);
  if (!a || !b) return 0;
  return (b.ano - a.ano) * 12 + (b.mes - a.mes) + 1;
}

function ultimoDiaApos(inicioIso, meses) {
  const p = partesIso(inicioIso);
  if (!p || meses <= 0) return '';
  const d = new Date(Date.UTC(p.ano, p.mes - 1 + meses, 0));   // dia 0 = último do mês anterior
  return isoDe(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function suggestNextSeason(snapshot, today = '') {
  const active = getChampionshipState(snapshot).active;
  const window = getSeasonWindow(snapshot);
  const inicio = diaSeguinte(window.end) || String(today || '').slice(0, 10);
  const meses = mesesEntre(window.start, window.end) || 4;
  const fim = ultimoDiaApos(inicio, meses);
  const ano = Number(String(fim || inicio).slice(0, 4)) || getSeasonYear(active);
  const anteriores = getFrozenSeasons(snapshot).filter((s) => getSeasonYear(s) === ano).length;
  const ordem = anteriores + (getSeasonYear(active) === ano ? 2 : 1);
  const nome = `Temporada ${ordem}/${ano}`;
  return { id: `temporada-${inicio}`, name: nome, label: nome, year: ano, start_date: inicio, end_date: fim };
}

// --- Edição da temporada corrente -------------------------------------------

// Fim da última temporada encerrada. É o piso do que a temporada corrente pode
// cobrir: uma janela que invade período já congelado faria a mesma rodada
// pontuar duas vezes (uma no congelado, outra no atual).
function fimDoUltimoCongelado(snapshot) {
  return getFrozenSeasons(snapshot)
    .map((temporada) => String(temporada.end_date || '').slice(0, 10))
    .filter(Boolean)
    .sort()
    .pop() || '';
}

/**
 * O que muda na classificação se a janela virar `novaJanela`. A UI pergunta com
 * isto na mão: mexer nas datas move rodadas para dentro e para fora da
 * classificação, e sem o aviso o admin corrige um dígito da data e vê a tabela
 * inteira mudar sem entender por quê.
 */
export function seasonWindowChangeImpact(snapshot, novaJanela) {
  const todos = getEffectiveChampionshipResults(snapshot);
  const dentroHoje = new Set(getSeasonResults(snapshot).map((result) => String(result.id)));
  const temJanela = hasSeasonWindow(novaJanela);
  const dentroDepois = new Set(todos
    .filter((result) => !temJanela || isDateInSeason(result.date, novaJanela))
    .map((result) => String(result.id)));

  return {
    entering: todos.filter((result) => !dentroHoje.has(String(result.id)) && dentroDepois.has(String(result.id))),
    leaving: todos.filter((result) => dentroHoje.has(String(result.id)) && !dentroDepois.has(String(result.id))),
  };
}

/**
 * Renomeia / corrige as datas da temporada CORRENTE. MUTA o snapshot.
 *
 * Existe porque encerrar era o único jeito de escrever nome e datas de
 * temporada: um dígito errado na data ali só se consertava encerrando de novo —
 * ou seja, congelando uma temporada pela metade para arrumar a seguinte.
 *
 * O `id` NÃO muda: é a chave que identifica a temporada no histórico quando ela
 * for encerrada, e trocá-la deixaria uma temporada já congelada passar por
 * aberta de novo.
 */
export function updateSeason(snapshot, { name, label = '', start_date = '', end_date = '', year = null } = {}) {
  const championship = getChampionshipState(snapshot);
  const nome = String(name || '').trim();
  if (!nome) return { ok: false, reason: 'name_required' };

  const inicio = String(start_date || '').slice(0, 10);
  const fim = String(end_date || '').slice(0, 10);
  if (inicio && fim && fim < inicio) return { ok: false, reason: 'end_before_start' };

  const piso = fimDoUltimoCongelado(snapshot);
  if (piso && (!inicio || inicio <= piso)) {
    return { ok: false, reason: 'overlaps_closed_season', limit: piso };
  }

  const proximo = {
    ...championship.active,
    name: nome,
    label: String(label || nome),
    start_date: inicio,
    end_date: fim,
  };
  // O ano acompanha as datas novas (é ele que decide o título do anual e a
  // virada de ano no encerramento); um `year` explícito do chamador ganha.
  proximo.year = Number(year) || getSeasonYear({ end_date: fim, start_date: inicio }) || championship.active.year || null;

  snapshot.championship = { ...championship, active: proximo };
  return { ok: true, season: proximo };
}

// --- Encerramento -----------------------------------------------------------

function linhaCongelada(row, totalNota) {
  const rating = totalNota
    ? { sum: totalNota.sum, votes: totalNota.votes, avg: Number((totalNota.sum / totalNota.votes).toFixed(2)) }
    : { sum: 0, votes: 0, avg: null };
  return {
    player_id: row.player_id,
    name: row.name,
    rank: row.rank,
    points: row.points,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    no_play: row.no_play,
    played: row.played,
    rating,
  };
}

// Tabela anual a partir das temporadas congeladas de um ano. Ponto SOMA;
// nota é MÉDIA PONDERADA por votos (Σ scores / Σ votos) — média de médias faria
// uma temporada com 2 votos pesar igual a uma com 40.
function consolidaAno(temporadas) {
  const porJogador = new Map();
  temporadas.forEach((temporada) => {
    (temporada.rows || []).forEach((row) => {
      const id = String(row.player_id);
      const atual = porJogador.get(id) || { player_id: id, name: row.name, points: 0, sum: 0, votes: 0 };
      atual.name = row.name || atual.name;
      atual.points += Number(row.points) || 0;
      atual.sum += Number(row.rating?.sum) || 0;
      atual.votes += Number(row.rating?.votes) || 0;
      porJogador.set(id, atual);
    });
  });
  return [...porJogador.values()]
    .map((linha) => ({
      player_id: linha.player_id,
      name: linha.name,
      points: linha.points,
      rating: { sum: linha.sum, votes: linha.votes, avg: linha.votes ? Number((linha.sum / linha.votes).toFixed(2)) : null },
    }))
    .sort((left, right) => right.points - left.points || String(left.name).localeCompare(String(right.name), 'pt-BR'))
    .map((linha, index) => ({ ...linha, rank: index + 1 }));
}

/**
 * Encerra a temporada corrente e abre a próxima. MUTA o snapshot (mesmo
 * contrato de persistChampionshipResult).
 *
 * - congela a tabela final (pontos E nota) em `championship.history`;
 * - leva as rodadas da temporada junto, para o congelado ser auditável sozinho;
 * - o que ficou FORA da janela migra para a temporada nova (não some);
 * - se o ano mudou, consolida o anual em `championship.years` no mesmo ato —
 *   a virada de ano não é um segundo ritual que alguém possa esquecer.
 *
 * `ratingRows` vem de fora (cache de notas do cliente) para esta função seguir
 * pura e testável. Sem elas a temporada congelaria sem nota, e nota não é
 * recomputável depois — por isso o chamador é obrigado a passar.
 */
export function closeSeason(snapshot, { nextSeason, ratingRows = [], closedBy = null, now = new Date().toISOString() } = {}) {
  const championship = getChampionshipState(snapshot);
  const active = championship.active;
  const historico = getFrozenSeasons(snapshot);

  if (historico.some((temporada) => String(temporada.id) === String(active.id))) {
    return { ok: false, reason: 'season_already_closed' };
  }
  if (!nextSeason || !nextSeason.name || !nextSeason.start_date) {
    return { ok: false, reason: 'next_season_invalid' };
  }

  const window = getSeasonWindow(snapshot);
  const notas = seasonRatingTotals(ratingRows, window);
  const congelada = {
    id: String(active.id || `temporada-${active.start_date || now.slice(0, 10)}`),
    name: active.name || 'Temporada',
    label: active.label || active.name || 'Temporada',
    year: getSeasonYear(active),
    start_date: window.start,
    end_date: window.end,
    closed_at: now,
    closed_by: closedBy ? String(closedBy) : null,
    points_table: { ...POINTS_BY_STATUS },   // sem perfil de clube aqui: a tabela é a do módulo
    rows: calculateCurrentRanking(snapshot).map((row) => linhaCongelada(row, notas.get(String(row.player_id)))),
    results: getSeasonResults(snapshot),
  };

  // Fica no `active` só o que NÃO era desta temporada: os lançamentos fora da
  // janela migram para a temporada nova. As rodadas importadas não moram no
  // blob (vêm do dataset do clube), então não entram aqui.
  const idsDaTemporada = new Set(congelada.results.map((result) => String(result.id)));
  const migrados = championship.active.results.filter((result) => !idsDaTemporada.has(String(result.id)));

  const proxima = {
    id: String(nextSeason.id || `temporada-${nextSeason.start_date}`),
    name: String(nextSeason.name),
    label: String(nextSeason.label || nextSeason.name),
    year: getSeasonYear(nextSeason),
    start_date: String(nextSeason.start_date).slice(0, 10),
    end_date: String(nextSeason.end_date || '').slice(0, 10),
    results: migrados,
  };

  const history = [...historico, congelada];

  // Virada de ano: a temporada que fecha e a que abre são de anos diferentes ⇒
  // o ano da que fechou está completo e vira fato também.
  const anoFechado = congelada.year;
  const anos = getFrozenYears(snapshot);
  let years = anos;
  let yearClosed = null;
  const precisaFecharAno = anoFechado
    && proxima.year !== anoFechado
    && !anos.some((registro) => Number(registro.year) === Number(anoFechado));
  if (precisaFecharAno) {
    const doAno = history.filter((temporada) => getSeasonYear(temporada) === anoFechado);
    yearClosed = {
      year: anoFechado,
      closed_at: now,
      season_ids: doAno.map((temporada) => temporada.id),
      rows: consolidaAno(doAno),
    };
    years = [...anos, yearClosed];
  }

  snapshot.championship = { ...championship, active: proxima, history, years };
  return { ok: true, frozen: congelada, next: proxima, yearClosed };
}

export function getResultAuditRows(result, players) {
  const playerById = new Map((players || []).map((player) => [String(player.id), player]));

  if (Array.isArray(result.audit_entries)) {
    return result.audit_entries.map((entry) => ({
      player_id: entry.player_id || null,
      name: entry.app_name || entry.sheet_name || 'Jogador não vinculado',
      sheet_name: entry.sheet_name || '',
      status: entry.status || 'no_play',
      points: Number(entry.points || 0),
      matched: !!entry.player_id,
    }));
  }

  return (players || []).map((player) => {
    const status = result.statuses?.[String(player.id)] || 'no_play';
    return {
      player_id: String(player.id),
      name: player.name || 'Sem nome',
      sheet_name: '',
      status,
      points: POINTS_BY_STATUS[status] || 0,
      matched: true,
    };
  });
}



export function isFootballPlayer(player) {
  return !!player && authzPlaysFootball(player);
}

export function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')      // remove acentos
    // Remove emojis/pictogramas: um jogador com emoji no nome (ex.: "Lukinha\ud83d\ude0e")
    // n\u00e3o casava com a planilha importada porque o emoji sobrevivia \u00e0
    // normaliza\u00e7\u00e3o. Como isto roda nos DOIS lados da compara\u00e7\u00e3o, tirar n\u00e3o
    // quebra nenhum casamento existente e conserta os nomes com emoji.
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function getFootballPlayers(snapshot) {
  return (Array.isArray(snapshot?.players) ? snapshot.players : [])
    .filter(isFootballPlayer)
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR'));
}

function makeChampionshipResultId() {
  if (globalThis.crypto?.randomUUID) return `championship_result_${globalThis.crypto.randomUUID()}`;
  return `championship_result_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getChampionshipState(snapshot) {
  const source = snapshot?.championship && typeof snapshot.championship === 'object'
    ? snapshot.championship
    : {};
  const active = source.active && typeof source.active === 'object' ? source.active : {};
  const rawResults = Array.isArray(active.results)
    ? active.results
    : Array.isArray(source.results)
      ? source.results
      : [];

  return {
    ...source,
    // Temporadas e anos ENCERRADOS. Normalizados aqui para ninguém precisar
    // checar o tipo: o que está nestas listas é fato congelado e nunca é
    // recalculado — ver o bloco TEMPORADA acima.
    history: Array.isArray(source.history) ? source.history : [],
    years: Array.isArray(source.years) ? source.years : [],
    active: {
      id: active.id || ACTIVE_CHAMPIONSHIP.id,
      name: active.name || ACTIVE_CHAMPIONSHIP.name,
      // O `label` PRECISA cair no `name` do blob antes de cair na constante:
      // sem esta linha ele não era normalizado, o meta ficava com o label do
      // módulo e o hero anunciava a temporada ANTERIOR ("Inverno 2026") em cima
      // das datas da nova — foi o que apareceu logo após o primeiro
      // encerramento.
      label: active.label || active.name || ACTIVE_CHAMPIONSHIP.label,
      year: active.year || ACTIVE_CHAMPIONSHIP.year,
      start_date: active.start_date || ACTIVE_CHAMPIONSHIP.start_date,
      end_date: active.end_date || ACTIVE_CHAMPIONSHIP.end_date,
      results: rawResults
        .filter((result) => result && typeof result === 'object')
        .map((result, index) => ({
          id: String(result.id || `championship_result_${index}`),
          date: String(result.date || ''),
          created_at: result.created_at || null,
          outcome: result.outcome || null,
          draw_id: result.draw_id || null,
          game_key: result.game_key || null,
          team_a: Array.isArray(result.team_a) ? result.team_a.map(String) : [],
          team_b: Array.isArray(result.team_b) ? result.team_b.map(String) : [],
          statuses: result.statuses && typeof result.statuses === 'object' ? { ...result.statuses } : {},
          lineup_adjusted: result.lineup_adjusted === true,
        }))
        .filter((result) => result.date)
        .sort((left, right) => String(left.date).localeCompare(String(right.date))),
    },
  };
}

// Duas entradas são a MESMA rodada quando têm o mesmo id, quando são do mesmo
// jogo (game_key), ou quando caem na mesma data. Gravar uma substitui a outra.
//
// O game_key entrou aqui porque relançar o mesmo jogo com a data corrigida
// criava uma rodada duplicada em vez de corrigir a existente. A data continua
// valendo para as rodadas antigas, que não têm game_key.
function isSameRound(entry, candidate) {
  if (String(entry?.id || '') === String(candidate?.id || '')) return true;
  const entryGame = String(entry?.game_key || '');
  const candidateGame = String(candidate?.game_key || '');
  if (entryGame && candidateGame && entryGame === candidateGame) return true;
  return String(entry?.date || '') === String(candidate?.date || '');
}

// Qual resultado JÁ LANÇADO seria substituído por este. A UI usa isto para
// perguntar antes — a substituição era silenciosa, e um lançamento apagava
// outro sem que ninguém percebesse (INCIDENTE 23/07).
export function findReplacedChampionshipResult(snapshot, candidate) {
  return getChampionshipState(snapshot).active.results
    .find((entry) => !entry.imported && isSameRound(entry, candidate)) || null;
}

export function persistChampionshipResult(snapshot, result) {
  const championship = getChampionshipState(snapshot);
  const normalizedResult = {
    id: String(result.id || makeChampionshipResultId()),
    date: String(result.date || ''),
    created_at: result.created_at || new Date().toISOString(),
    outcome: result.outcome || null,
    draw_id: result.draw_id || null,
    game_key: result.game_key || null,
    team_a: Array.isArray(result.team_a) ? result.team_a.map(String) : [],
    team_b: Array.isArray(result.team_b) ? result.team_b.map(String) : [],
    statuses: result.statuses && typeof result.statuses === 'object' ? { ...result.statuses } : {},
    lineup_adjusted: result.lineup_adjusted === true,
  };

  const results = championship.active.results.filter((entry) => !isSameRound(entry, normalizedResult));
  results.push(normalizedResult);

  snapshot.championship = {
    ...championship,
    active: {
      ...championship.active,
      results: results.sort((left, right) => String(left.date).localeCompare(String(right.date))),
    },
  };
}

export function deleteChampionshipResult(snapshot, resultId) {
  const championship = getChampionshipState(snapshot);
  snapshot.championship = {
    ...championship,
    active: {
      ...championship.active,
      results: championship.active.results.filter((entry) => String(entry.id) !== String(resultId)),
    },
  };
}

function buildEmptyRow(player) {
  return {
    player_id: String(player.id),
    name: player.name || 'Sem nome',
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    no_play: 0,
    played: 0,
    rank: null,
  };
}

function compareRows(left, right) {
  return (
    right.points - left.points ||
    right.wins - left.wins ||
    right.draws - left.draws ||
    right.losses - left.losses ||
    String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR')
  );
}

function isSameScore(left, right) {
  return !!left && !!right &&
    left.points === right.points &&
    left.wins === right.wins &&
    left.draws === right.draws &&
    left.losses === right.losses;
}

function applyRanks(sortedRows) {
  let lastRank = 0;
  let lastComparable = null;

  return sortedRows.map((row, index) => {
    const rank = isSameScore(row, lastComparable) ? lastRank : index + 1;
    lastRank = rank;
    lastComparable = row;
    return { ...row, rank };
  });
}


function normalizeDrawEntry(draw, fallbackId = '') {
  if (!draw || typeof draw !== 'object') return null;

  const teamA = Array.isArray(draw.team_a) ? draw.team_a.map(String).filter(Boolean) : [];
  const teamB = Array.isArray(draw.team_b) ? draw.team_b.map(String).filter(Boolean) : [];
  if (!teamA.length || !teamB.length) return null;

  const gameDate = draw.game_date || draw.date || '';
  const gameTime = draw.game_time || '';
  const createdAt = draw.created_at || null;
  const id = String(draw.id || fallbackId || `${gameDate}_${createdAt || Date.now()}`);

  return {
    ok: true,
    id,
    draw_id: id,
    game_key: draw.game_key || null,
    game_date: gameDate,
    game_time: gameTime,
    created_at: createdAt,
    total_players: Number(draw.total_players || teamA.length + teamB.length),
    team_a: teamA,
    team_b: teamB,
  };
}

// Sorteios disponíveis para lançar resultado. Varre TODOS os jogos, não só o
// ativo: cada jogo guarda o próprio `sort_result`/`draw_history`, e ler apenas
// o ativo fazia o resultado do jogo ANTERIOR virar inalcançável assim que um
// novo jogo era aberto (o novo nasce sem sorteio → lista vazia → o app dizia
// "faça o sorteio antes de lançar o resultado"). Como a abertura do próximo
// jogo é automática (cron `auto-open-games`, 2 dias antes), a janela para
// lançar fechava sozinha toda semana — foi o que deixou 15/07 e 22/07 sem
// resultado no campeonato. A ordenação por created_at desc é preservada, então
// o caso normal continua trazendo o sorteio mais recente primeiro.
export function getChampionshipDrawOptions(snapshot) {
  const options = [];
  const pushDraw = (draw, fallbackId) => {
    const normalized = normalizeDrawEntry(draw, fallbackId);
    if (!normalized) return;
    if (options.some((entry) => String(entry.id) === String(normalized.id))) return;
    options.push(normalized);
  };

  const collectFrom = (game, prefix) => {
    if (!game || typeof game !== 'object') return;
    pushDraw(game.sort_result, `${prefix}_draw`);
    (Array.isArray(game.draw_history) ? game.draw_history : [])
      .forEach((draw, index) => pushDraw(draw, `${prefix}_history_${index}`));
  };

  // O ativo primeiro (mantém os ids de fallback históricos p/ não invalidar
  // resultados já lançados que referenciam 'current_draw'/'draw_history_N').
  const active = snapshot?.game || {};
  pushDraw(active.sort_result, 'current_draw');
  (Array.isArray(active.draw_history) ? active.draw_history : []).forEach((draw, index) => pushDraw(draw, `draw_history_${index}`));

  // Depois todos os demais jogos do histórico.
  const games = Array.isArray(snapshot?.games) ? snapshot.games : [];
  games.forEach((game) => collectFrom(game, String(game?.game_key || game?.id || game?.game_date || 'game')));

  return options.sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')));
}

export function getActiveDrawTeams(snapshot, drawId = null) {
  const options = getChampionshipDrawOptions(snapshot);
  const selected = drawId
    ? options.find((draw) => String(draw.id) === String(drawId))
    : options[0];

  if (!selected) {
    return { ok: false, message: 'Faça o sorteio dos times antes de lançar o resultado do campeonato.' };
  }

  return selected;
}

// Escalação REAL do jogo, a partir do sorteio: { playerId: 'a' | 'b' }.
// Convidado / goleiro alugado não entram — o sorteio embute o objeto do jogador
// (sem id persistente) e o campeonato só pontua jogador registrado.
export function buildLineupFromDraw(draw) {
  const map = {};
  const add = (arr, side) => (Array.isArray(arr) ? arr : []).forEach((v) => {
    if (typeof v === 'string' || typeof v === 'number') map[String(v)] = side;
  });
  add(draw?.team_a, 'a');
  add(draw?.team_b, 'b');
  return map;
}

// `lineup` permite corrigir o que o sorteio não sabe: quem desistiu em cima da
// hora, quem entrou no lugar, quem saiu no meio. Sem ele, vale o sorteio.
// Formato: { playerId: 'a' | 'b' | 'out' } — 'out' (ou ausente) = não jogou.
export function buildTeamResultStatuses(snapshot, outcome, drawId = null, lineup = null) {
  const draw = getActiveDrawTeams(snapshot, drawId);
  if (!draw.ok) return { ok: false, message: draw.message };

  const validOutcome = TEAM_RESULT_OPTIONS.some((option) => option.value === outcome) ? outcome : null;
  if (!validOutcome) return { ok: false, message: 'Informe se venceu o Time A, venceu o Time B ou se houve empate.' };

  const players = getFootballPlayers(snapshot);
  const statuses = Object.fromEntries(players.map((player) => [String(player.id), 'no_play']));

  const assignTeam = (ids, status) => {
    ids.forEach((playerId) => {
      if (Object.prototype.hasOwnProperty.call(statuses, String(playerId))) {
        statuses[String(playerId)] = status;
      }
    });
  };

  // A escalação ajustada manda; sem ajuste, vale o sorteio. Só entram ids que
  // são jogador registrado — convidado/goleiro alugado não pontuam (o sorteio
  // embute o objeto do jogador, sem id persistente, e String(obj) virava
  // "[object Object]" no registro antigo).
  const lineupAdjusted = !!(lineup && typeof lineup === 'object' && Object.keys(lineup).length);
  const map = lineupAdjusted ? lineup : buildLineupFromDraw(draw);
  const isPlayer = (id) => Object.prototype.hasOwnProperty.call(statuses, String(id));
  const teamA = Object.keys(map).filter((id) => map[id] === 'a' && isPlayer(id));
  const teamB = Object.keys(map).filter((id) => map[id] === 'b' && isPlayer(id));

  if (!teamA.length && !teamB.length) {
    return { ok: false, message: 'Nenhum jogador registrado na escalação. Ajuste quem jogou antes de lançar.' };
  }

  if (validOutcome === 'draw') {
    assignTeam(teamA, 'draw');
    assignTeam(teamB, 'draw');
  } else if (validOutcome === 'team_a') {
    assignTeam(teamA, 'win');
    assignTeam(teamB, 'loss');
  } else if (validOutcome === 'team_b') {
    assignTeam(teamA, 'loss');
    assignTeam(teamB, 'win');
  }

  return {
    ok: true,
    outcome: validOutcome,
    draw_id: draw.id,
    game_key: draw.game_key || null,
    game_date: draw.game_date || null,
    game_time: draw.game_time || null,
    team_a: teamA,
    team_b: teamB,
    statuses,
    // Marca que o admin declarou explicitamente quem jogou. A classificação usa
    // isto para NÃO deixar a heurística de remoção sobrescrever a declaração.
    lineup_adjusted: lineupAdjusted,
  };
}

export function getTeamOutcomeLabel(outcome) {
  return TEAM_RESULT_OPTIONS.find((option) => option.value === outcome)?.label || 'Resultado lançado';
}

export function getManualChampionshipResults(snapshot) {
  return getChampionshipState(snapshot).active.results
    .filter((result) => !result.imported)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

// Mapa game_key -> jogadores removidos do jogo por admin. Quem foi removido da
// escalação não pontua naquele jogo, mesmo que um resultado já tenha sido
// lançado antes da remoção (rede de segurança para dados já gravados).
export function buildRemovedByGameKey(snapshot) {
  const map = new Map();
  (Array.isArray(snapshot?.confirmations) ? snapshot.confirmations : []).forEach((entry) => {
    if (!entry || entry.confirmed === true) return;
    const out = entry.removed_by_admin === true || entry.status === 'removed' || entry.status === 'cancelled';
    if (!out) return;
    const key = String(entry.game_key || '');
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(String(entry.player_id));
  });
  return map;
}

export function calculateCurrentRanking(snapshot) {
  const players = getFootballPlayers(snapshot);
  const rowsById = new Map(players.map((player) => [String(player.id), buildEmptyRow(player)]));
  // Só as rodadas DENTRO da janela da temporada. Antes era `getEffective...`
  // (tudo), e o jogo de setembro entrava no Inverno 26 — uma temporada que a
  // própria tela dizia ter terminado em 31/08. Clube sem datas na temporada não
  // tem janela e continua somando tudo.
  const results = getSeasonResults(snapshot);
  const removedByGameKey = buildRemovedByGameKey(snapshot);

  results.forEach((result) => {
    const gameKey = String(result.game_key || '');
    // A rede de segurança existe para resultados lançados ANTES de o admin
    // remover alguém da escalação — dados já gravados que ninguém revisou.
    // Quando o admin declarou explicitamente quem jogou ("Ajustar quem jogou"),
    // a declaração dele é a verdade: sem esta ressalva, um substituto que havia
    // cancelado e acabou entrando em campo tinha os pontos zerados em silêncio,
    // exatamente o caso que motivou o editor de escalação.
    const removedSet = (gameKey && result.lineup_adjusted !== true) ? removedByGameKey.get(gameKey) : null;
    rowsById.forEach((row, playerId) => {
      const rawStatus = (removedSet && removedSet.has(playerId)) ? 'no_play' : (result.statuses?.[playerId] || 'no_play');
      const status = Object.prototype.hasOwnProperty.call(POINTS_BY_STATUS, rawStatus) ? rawStatus : 'no_play';
      row.points += POINTS_BY_STATUS[status] || 0;

      if (status === 'win') row.wins += 1;
      if (status === 'draw') row.draws += 1;
      if (status === 'loss') row.losses += 1;
      if (status === 'no_play') row.no_play += 1;
      if (status !== 'no_play') row.played += 1;
    });
  });

  return applyRanks([...rowsById.values()].sort(compareRows));
}

export function getResultSummary(result, players) {
  const ids = new Set(players.map((player) => String(player.id)));
  const counters = { win: 0, draw: 0, loss: 0, no_play: 0 };
  Object.entries(result.statuses || {}).forEach(([playerId, status]) => {
    if (!ids.has(String(playerId))) return;
    if (Object.prototype.hasOwnProperty.call(counters, status)) counters[status] += 1;
  });
  return counters;
}

export function getHistoricalTournaments() {
  return (CHAMPIONSHIP_HISTORY.tournaments || [])
    .filter((tournament) => tournament.name !== ACTIVE_CHAMPIONSHIP.name)
    .map((tournament) => ({
      ...tournament,
      rows: (tournament.rows || []).map((row, index) => ({
        rank: row.rank || index + 1,
        name: row.name,
        points: Number(row.points || 0),
        wins: Number(row.wins || 0),
        draws: Number(row.draws || 0),
        losses: Number(row.losses || 0),
        wo: Number(row.wo || 0),
      })),
    }));
}

export function getHistoricalAnnual() {
  return (CHAMPIONSHIP_HISTORY.annual || []).map((annual) => ({
    ...annual,
    rows: (annual.rows || []).map((row, index) => ({
      rank: index + 1,
      name: row.name,
      points: Number(row.points || 0),
    })),
  }));
}

function historicalTournamentPointsByName(tournamentName) {
  const tournament = (CHAMPIONSHIP_HISTORY.tournaments || []).find((item) => item.name === tournamentName);
  const points = new Map();
  (tournament?.rows || []).forEach((row) => {
    points.set(normalizeName(row.name), Number(row.points || 0));
  });
  return points;
}

export function calculateAnnualRanking(snapshot) {
  const currentRanking = calculateCurrentRanking(snapshot);
  const anoCorrente = getSeasonYear(getChampionshipState(snapshot).active);

  // Temporadas JÁ ENCERRADAS deste ano. Sem isto, encerrar o Inverno 26 fazia o
  // anual perder o quadrimestre inteiro no instante em que ele virava fato.
  // Casamento por player_id — o do legado abaixo é por nome, e é justamente o
  // que quebra quando alguém é renomeado.
  const congeladas = getFrozenSeasons(snapshot)
    .filter((temporada) => !anoCorrente || getSeasonYear(temporada) === anoCorrente);
  const pontosCongelados = new Map();
  const notaCongelada = new Map();
  congeladas.forEach((temporada) => {
    (temporada.rows || []).forEach((row) => {
      const id = String(row.player_id);
      pontosCongelados.set(id, (pontosCongelados.get(id) || 0) + (Number(row.points) || 0));
      const nota = notaCongelada.get(id) || { sum: 0, votes: 0 };
      nota.sum += Number(row.rating?.sum) || 0;
      nota.votes += Number(row.rating?.votes) || 0;
      notaCongelada.set(id, nota);
    });
  });

  const jaCongelada = (nome) => congeladas
    .some((temporada) => normalizeName(temporada.name) === normalizeName(nome));
  // Aqui o dataset do Rei da Quadra É deste clube (instalação do Harmonia),
  // então ele entra sempre — só sai quando a temporada dele for materializada
  // no histórico congelado (fase C).
  const abertura26 = jaCongelada('Abertura 26')
    ? new Map()
    : historicalTournamentPointsByName('Abertura 26');

  const rows = currentRanking.map((row) => {
    const id = String(row.player_id);
    const legado = abertura26.get(normalizeName(row.name)) || 0;
    const encerradas = (pontosCongelados.get(id) || 0) + legado;
    return {
      player_id: row.player_id,
      name: row.name,
      points: row.points + encerradas,
      current_points: row.points,
      closed_points: encerradas,
      abertura_points: legado,          // preservado: a coluna antiga ainda lê
      closed_rating: notaCongelada.get(id) || { sum: 0, votes: 0 },
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
    };
  });

  return applyRanks(rows.sort(compareRows));
}

export function getActiveChampionshipMeta(snapshot) {
  const championship = getChampionshipState(snapshot);
  return {
    ...ACTIVE_CHAMPIONSHIP,
    ...championship.active,
    ranking: calculateCurrentRanking(snapshot),
  };
}
