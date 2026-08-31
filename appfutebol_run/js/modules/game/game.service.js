import { isCarneOnly, playsFootball as authzPlaysFootball } from '../../domain/authz.js';
import { getState, patchState } from '../../core/state.js';
import { getPresenceDecision, isGameFull, isGoalkeeperEntry, getMensalidadeMode, MENSALIDADE_MODES } from '../../domain/rules.engine.js';
import { getActiveGame, getGameKey } from '../../domain/projection.js';
import { getCachedRatings, playerRatingAverages, rollingRatingWindow } from '../../services/ratings.service.js';
import { calculateAnnualRanking } from '../championship/championship.service.js';
import { isGoalkeeperPlayer } from '../../domain/confirmations.js';


function activeGame(snapshot = getState()) { return getActiveGame(snapshot); }
function activeGameKey(snapshot = getState()) { return getGameKey(activeGame(snapshot)); }
function scopedConfirmations(snapshot = getState()) {
  const key = activeGameKey(snapshot);
  return (snapshot.confirmations || []).filter((entry) => String(entry?.game_key || '') === key);
}
function mergeScopedConfirmations(snapshot, scoped) {
  const key = activeGameKey(snapshot);
  const others = (snapshot.confirmations || []).filter((entry) => String(entry?.game_key || '') !== key);
  return [...others, ...scoped.map((entry) => ({ ...entry, game_key: key }))];
}
function patchScopedConfirmations(snapshot, scoped) { patchState({ confirmations: mergeScopedConfirmations(snapshot, scoped) }); }

function getConfirmedGoalkeeperCount(confirmations = [], players = []) {
  const playersById = new Map((players || []).map((player) => [String(player.id), player]));
  return (Array.isArray(confirmations) ? confirmations : [])
    .filter((entry) => entry?.confirmed)
    .filter((entry) => isGoalkeeperEntry(entry) || isGoalkeeperPlayer(playersById.get(String(entry.player_id))))
    .length;
}

function normalizeGoalkeeperConfirmation(entry, player) {
  if (!isGoalkeeperPlayer(player)) return entry;
  return {
    ...entry,
    goalkeeper: true,
    segment: 'goalkeeper',
    presence_role: 'goalkeeper',
  };
}

function normalizeConfirmationSegments(confirmations = [], players = []) {
  const playersById = new Map((players || []).map((player) => [String(player.id), player]));
  return (Array.isArray(confirmations) ? confirmations : []).map((entry) => (
    normalizeGoalkeeperConfirmation(entry, playersById.get(String(entry?.player_id)))
  ));
}

function getLineConfirmedCount(confirmations = [], players = []) {
  const normalized = normalizeConfirmationSegments(confirmations, players);
  return normalized.filter((entry) => entry?.confirmed && !isGoalkeeperEntry(entry)).length;
}


function patchActiveGame(snapshot, updatedGame) {
  const key = activeGameKey(snapshot);
  patchState({
    game: updatedGame,
    games: (snapshot.games || []).map((item) => String(item.game_key || item.id) === key ? updatedGame : item),
  });
}

function patchForActiveGame(snapshot, updatedGame) {
  const key = activeGameKey(snapshot);
  return {
    game: updatedGame,
    games: (snapshot.games || []).map((item) => String(item.game_key || item.id) === key ? updatedGame : item),
  };
}

function buildDrawRemovalPatch(snapshot, playerId, now = new Date().toISOString()) {
  const game = activeGame(snapshot);
  const sortResult = game?.sort_result;

  if (!sortResult) {
    return {};
  }

  const targetId = String(playerId);
  const getEntryId = (entry) => (entry && typeof entry === 'object') ? entry.id : entry;
  const removeFromTeam = (team) => (
    Array.isArray(team)
      ? team.filter((entry) => String(getEntryId(entry)) !== targetId)
      : []
  );

  const adjustedDraw = {
    ...sortResult,
    team_a: removeFromTeam(sortResult.team_a),
    team_b: removeFromTeam(sortResult.team_b),
    adjusted_at: now,
  };

  const drawHistory = Array.isArray(game.draw_history) ? game.draw_history : [];
  const updatedGame = {
    ...game,
    sort_result: adjustedDraw,
    draw_history: drawHistory.map((entry) => (
      String(entry?.id || '') === String(sortResult.id || '') ? adjustedDraw : entry
    )),
  };

  return patchForActiveGame(snapshot, updatedGame);
}

function clearActiveDrawFromGame(game = {}) {
  return {
    ...game,
    sort_result: null,
  };
}

function clearActiveDraw(snapshot = getState()) {
  const game = activeGame(snapshot);
  patchActiveGame(snapshot, clearActiveDrawFromGame(game));
}

function getRentalGoalkeepers(game = activeGame()) {
  return Array.isArray(game?.rental_goalkeepers) ? game.rental_goalkeepers : [];
}

export function addRentalGoalkeeper(name = '') {
  const snapshot = getState();
  const game = activeGame(snapshot);
  const current = getRentalGoalkeepers(game);
  const cleanName = String(name || '').trim() || `Goleiro de aluguel ${current.length + 1}`;

  if (current.length >= 2) {
    return { ok: false, message: 'Limite de 2 goleiros atingido.' };
  }

  const entry = {
    id: `rental_goalkeeper_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: cleanName,
    temporary: true,
    created_at: new Date().toISOString(),
  };

  patchActiveGame(snapshot, {
    ...game,
    rental_goalkeepers: [...current, entry].slice(0, 2),
  });

  return { ok: true, message: `${cleanName} adicionado como goleiro.`, goalkeeper: entry };
}

export function removeRentalGoalkeeper(id) {
  const snapshot = getState();
  const game = activeGame(snapshot);
  const current = getRentalGoalkeepers(game);
  const next = current.filter((entry) => String(entry.id) !== String(id));

  patchActiveGame(snapshot, {
    ...game,
    rental_goalkeepers: next,
  });

  return { ok: true, message: 'Goleiro de aluguel removido.' };
}

// Convidados: jogadores de linha temporários adicionados pelo admin (só nome),
// nos mesmos moldes do goleiro de aluguel. Ocupam vaga de linha e respeitam o
// máximo do jogo (a checagem de lotação já conta os convidados via isGameFull).
function getGuestPlayers(game = activeGame()) {
  return Array.isArray(game?.guest_players) ? game.guest_players : [];
}

export function getActiveGuestPlayers() {
  return getGuestPlayers(activeGame(getState()));
}

export function addGuestPlayer(name = '', position = 'meia') {
  const snapshot = getState();
  const game = activeGame(snapshot);
  const cleanName = String(name || '').trim();
  if (!cleanName) return { ok: false, message: 'Informe o nome do convidado.' };

  // Posição do convidado: entra no sorteio (paridade por posição) e no lugar
  // certo na imagem da escalação. Default 'meia' se vier algo inválido.
  const cleanPosition = ['gol', 'zag', 'meia', 'atk'].includes(position) ? position : 'meia';
  const current = getGuestPlayers(game);

  if (cleanPosition === 'gol') {
    // Goleiro respeita o TETO DE GOLEIROS (não a vaga de linha), junto com os
    // goleiros de aluguel e os goleiros-convidados já no jogo.
    // 2 fixo, igual ao addRentalGoalkeeper logo acima. O port do Lote 1 (e5d4ae8)
    // trouxe a chamada a goleirosPorJogo() do app genérico, mas o perfil de
    // clube não existe nesta branch: a função nunca foi definida aqui e a linha
    // estourava ReferenceError ao adicionar convidado goleiro.
    const teto = 2;
    const rentalGks = getRentalGoalkeepers(game).length;
    const guestGks = current.filter((g) => ['gol', 'goleiro'].includes(String(g?.position || '').toLowerCase())).length;
    if (rentalGks + guestGks >= teto) {
      return { ok: false, message: `Limite de ${teto} goleiro(s) atingido.` };
    }
  } else {
    // Linha: respeita a lotação de linha.
    const confirmations = normalizeConfirmationSegments(scopedConfirmations(snapshot), snapshot.players || []);
    if (isGameFull(game, confirmations)) {
      return { ok: false, message: 'Jogo lotado: limite de jogadores de linha atingido.' };
    }
  }
  const entry = {
    id: `guest_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: cleanName,
    guest: true,
    temporary: true,
    position: cleanPosition,
    created_at: new Date().toISOString(),
  };

  patchActiveGame(snapshot, { ...game, guest_players: [...current, entry] });

  return { ok: true, message: `${cleanName} adicionado como convidado.`, guest: entry };
}

export function removeGuestPlayer(id) {
  const snapshot = getState();
  const game = activeGame(snapshot);
  const current = getGuestPlayers(game);

  patchActiveGame(snapshot, {
    ...game,
    guest_players: current.filter((entry) => String(entry.id) !== String(id)),
  });

  return { ok: true, message: 'Convidado removido.' };
}


export function hasCapacity() {
  const snapshot = getState();
  const confirmations = normalizeConfirmationSegments(scopedConfirmations(snapshot), snapshot.players || []);
  return !isGameFull(activeGame(snapshot), confirmations);
}

export function isConfirmed(playerId) {
  const snapshot = getState();
  return scopedConfirmations(snapshot).some((item) => item.player_id === playerId && item.confirmed);
}

export function getPresenceGuard(player, game) {
  const snapshot = getState();
  const confirmations = normalizeConfirmationSegments(scopedConfirmations(snapshot), snapshot.players || []);
  const decision = getPresenceDecision({
    player,
    game: activeGame(snapshot),
    confirmations,
    mode: getMensalidadeMode(snapshot.settings),
  });

  return {
    ok: decision.canConfirm || decision.canCancel,
    message: decision.message,
    decision,
  };
}


export function canManagePresence(player, game) {
  return getPresenceGuard(player, game);
}


function isWaitlistEntry(entry) {
  return !!entry && entry.confirmed !== true && (entry.status === 'waitlist' || entry.status === 'waitlisted');
}

function getWaitlistEntries(confirmations = []) {
  return (Array.isArray(confirmations) ? confirmations : [])
    .filter(isWaitlistEntry)
    .sort((a, b) => String(a.waitlisted_at || a.timestamp || '').localeCompare(String(b.waitlisted_at || b.timestamp || '')));
}

function promoteFirstWaitlisted(confirmations = [], now = new Date().toISOString(), excludedPlayerId = null) {
  const waitlist = getWaitlistEntries(confirmations)
    .filter((entry) => String(entry.player_id) !== String(excludedPlayerId || ''));

  if (!waitlist.length) {
    return {
      confirmations,
      promoted: null,
    };
  }

  const promotedId = String(waitlist[0].player_id);

  return {
    promoted: promotedId,
    confirmations: confirmations.map((entry) => (
      String(entry.player_id) === promotedId
        ? {
            ...entry,
            confirmed: true,
            status: 'confirmed',
            waitlisted_at: null,
            waitlist_position: null,
            removed_by_admin: false,
            confirmed_at: now,
            cancelled_at: null,
            timestamp: now,
          }
        : entry
    )),
  };
}

function upsertWaitlistEntry(snapshot, playerId, now = new Date().toISOString()) {
  const currentWaitlist = getWaitlistEntries(snapshot.confirmations);
  const existing = (snapshot.confirmations || []).find((entry) => String(entry.player_id) === String(playerId));

  const waitlistEntry = {
    ...(existing || {}),
    player_id: playerId,
    confirmed: false,
    status: 'waitlist',
    removed_by_admin: false,
    confirmed_at: null,
    cancelled_at: null,
    waitlisted_at: existing?.waitlisted_at || now,
    waitlist_position: currentWaitlist.some((entry) => String(entry.player_id) === String(playerId))
      ? currentWaitlist.findIndex((entry) => String(entry.player_id) === String(playerId)) + 1
      : currentWaitlist.length + 1,
    timestamp: now,
  };

  if (existing) {
    return (snapshot.confirmations || []).map((entry) => (
      String(entry.player_id) === String(playerId) ? waitlistEntry : entry
    ));
  }

  return [
    ...(snapshot.confirmations || []),
    waitlistEntry,
  ];
}

function normalizeWaitlistPositions(confirmations = []) {
  const waitlistIds = getWaitlistEntries(confirmations).map((entry) => String(entry.player_id));
  return confirmations.map((entry) => {
    if (!isWaitlistEntry(entry)) return entry;
    const position = waitlistIds.indexOf(String(entry.player_id)) + 1;
    return {
      ...entry,
      waitlist_position: position > 0 ? position : null,
    };
  });
}

export function getWaitlistView(snapshot = getState()) {
  const playersById = new Map((snapshot.players || []).map((player) => [String(player.id), player]));
  return getWaitlistEntries(scopedConfirmations(snapshot))
    .map((entry, index) => ({
      ...entry,
      position: index + 1,
      player: playersById.get(String(entry.player_id)) || null,
    }))
    .filter((entry) => entry.player);
}


export function toggleConfirmation(playerId, options = {}) {
  const snapshot = getState();
  const game = activeGame(snapshot);
  // Admin pode confirmar inadimplente a qualquer momento: ignora o bloqueio
  // financeiro tratando o modo como 'none' só para esta decisão.
  const effectiveMode = options.bypassFinance ? MENSALIDADE_MODES.NONE : getMensalidadeMode(snapshot.settings);
  const gameKey = activeGameKey(snapshot);
  const confirmations = scopedConfirmations(snapshot);
  const capacityConfirmations = normalizeConfirmationSegments(confirmations, snapshot.players || []);
  const player = snapshot.players.find((item) => String(item.id) === String(playerId));
  const existing = confirmations.find((entry) => String(entry.player_id) === String(playerId));
  const currentlyConfirmed = existing?.confirmed === true;
  const currentlyWaitlisted = isWaitlistEntry(existing);
  const now = new Date().toISOString();

  if (currentlyConfirmed) {
    const cancelled = confirmations.map((entry) => String(entry.player_id) === String(playerId) ? { ...entry, confirmed: false, status: 'cancelled', removed_by_admin: false, confirmed_at: null, cancelled_at: now, timestamp: now } : entry);
    const promoted = promoteFirstWaitlisted(cancelled, now, playerId);
    patchState({
      confirmations: mergeScopedConfirmations(snapshot, normalizeWaitlistPositions(promoted.confirmations)),
      ...buildDrawRemovalPatch(snapshot, playerId, now),
    });
    return { ok: true, message: promoted.promoted ? 'Presença cancelada. Primeiro da fila entrou automaticamente.' : 'Presença cancelada.', promotedPlayerId: promoted.promoted || null, gameKey };
  }

  if (currentlyWaitlisted) {
    const updated = confirmations.map((entry) => String(entry.player_id) === String(playerId) ? { ...entry, confirmed: false, status: 'cancelled', removed_by_admin: false, confirmed_at: null, cancelled_at: now, waitlisted_at: null, waitlist_position: null, timestamp: now } : entry);
    patchState({
      confirmations: mergeScopedConfirmations(snapshot, normalizeWaitlistPositions(updated)),
      ...buildDrawRemovalPatch(snapshot, playerId, now),
    });
    return { ok: true, message: 'Você saiu da fila de espera.' };
  }

  const goalkeeperPlayer = isGoalkeeperPlayer(player);
  const goalkeeperCount = getConfirmedGoalkeeperCount(capacityConfirmations, snapshot.players || []);

  if (goalkeeperPlayer && goalkeeperCount >= 2) {
    return { ok: false, message: 'O jogo já tem 2 goleiros confirmados.' };
  }

  const decision = getPresenceDecision({ player, game, confirmations: capacityConfirmations, mode: effectiveMode });

  if (!decision.canConfirm) {
    if (decision.reasonBlocked === 'game_full' && !goalkeeperPlayer) {
      const updated = normalizeWaitlistPositions(upsertWaitlistEntry({ ...snapshot, confirmations }, playerId, now));
      const position = getWaitlistEntries(updated).findIndex((entry) => String(entry.player_id) === String(playerId)) + 1;
      patchScopedConfirmations(snapshot, updated);
        return { ok: true, message: `Jogo cheio. Você entrou na fila de espera${position ? ` na posição ${position}` : ''}.` };
    }

    if (decision.reasonBlocked === 'game_full' && goalkeeperPlayer) {
      // Goleiro tem segmento próprio e não deve ser bloqueado pela lotação dos jogadores de linha.
    } else {
      return { ok: false, message: decision.message || 'Você não pode confirmar presença agora.' };
    }
  }

  let updated;
  if (existing) {
    updated = confirmations.map((entry) => String(entry.player_id) === String(playerId) ? normalizeGoalkeeperConfirmation({ ...entry, confirmed: true, status: 'confirmed', waitlisted_at: null, waitlist_position: null, removed_by_admin: false, confirmed_at: now, cancelled_at: null, timestamp: now, game_key: gameKey }, player) : entry);
  } else {
    updated = [...confirmations, normalizeGoalkeeperConfirmation({ player_id: playerId, game_key: gameKey, confirmed: true, status: 'confirmed', removed_by_admin: false, confirmed_at: now, cancelled_at: null, waitlisted_at: null, waitlist_position: null, timestamp: now }, player)];
  }
  patchScopedConfirmations(snapshot, normalizeWaitlistPositions(updated));
  return { ok: true, message: 'Presença confirmada.' };
}

// Remove um jogador do resultado de campeonato JÁ LANÇADO do jogo informado
// (tira dos statuses e dos times A/B). Sem isto, remover alguém da escalação
// deixava os pontos daquele jogo pendurados na classificação — um jogador que
// não jogou continuava com a derrota (1 ponto) lançada pelo sorteio.
function scrubPlayerFromGameResults(championship, gameKey, playerId) {
  const active = championship && typeof championship === 'object' ? championship.active : null;
  if (!active || !Array.isArray(active.results)) return { championship, changed: false };
  const pid = String(playerId);
  let changed = false;
  const results = active.results.map((result) => {
    if (String(result?.game_key || '') !== String(gameKey)) return result;
    const inStatuses = result.statuses && Object.prototype.hasOwnProperty.call(result.statuses, pid);
    const inTeams = (Array.isArray(result.team_a) && result.team_a.some((id) => String(id) === pid)) ||
                    (Array.isArray(result.team_b) && result.team_b.some((id) => String(id) === pid));
    if (!inStatuses && !inTeams) return result;
    changed = true;
    const statuses = { ...(result.statuses || {}) };
    delete statuses[pid];
    return {
      ...result,
      statuses,
      team_a: (Array.isArray(result.team_a) ? result.team_a : []).filter((id) => String(id) !== pid),
      team_b: (Array.isArray(result.team_b) ? result.team_b : []).filter((id) => String(id) !== pid),
    };
  });
  return changed ? { championship: { ...championship, active: { ...active, results } }, changed: true } : { championship, changed: false };
}

/**
 * Remove um jogador confirmado do jogo vigente por ação administrativa.
 *
 * Efeitos:
 * - marca a confirmação como false;
 * - preserva o histórico da entrada em confirmations;
 * - remove o jogador dos times sorteados, quando houver sorteio ativo;
 * - remove o jogador do resultado de campeonato já lançado deste jogo;
 * - libera a vaga para nova confirmação futura.
 */
export function adminRemovePlayerFromGame(playerId) {
  const snapshot = getState();

  const targetId = String(playerId);
  const now = new Date().toISOString();
  const gameKey = activeGameKey(snapshot);

  const scoped = scopedConfirmations(snapshot);
  const updatedScopedConfirmations = scoped.map((entry) => (
    String(entry.player_id) === targetId
      ? {
          ...entry,
          confirmed: false,
          status: 'removed',
          removed_by_admin: true,
          confirmed_at: null,
          cancelled_at: null,
          waitlisted_at: null,
          waitlist_position: null,
          timestamp: now,
        }
      : entry
  ));

  const promoted = promoteFirstWaitlisted(updatedScopedConfirmations, now, targetId);
  const scrub = scrubPlayerFromGameResults(snapshot.championship, gameKey, targetId);

  patchState({
    confirmations: mergeScopedConfirmations(snapshot, normalizeWaitlistPositions(promoted.confirmations)),
    ...(scrub.changed ? { championship: scrub.championship } : {}),
    ...buildDrawRemovalPatch(snapshot, targetId, now),
  });

  return {
    ok: true,
    message: promoted.promoted
      ? 'Jogador removido. Primeiro da fila entrou automaticamente.'
      : (scrub.changed
          ? 'Jogador removido do jogo e dos pontos deste jogo no campeonato.'
          : 'Jogador removido do jogo pelo admin.'),
    promotedPlayerId: promoted.promoted || null,
    gameKey,
  };
}


function getPositionBucket(player) {
  const raw = String(player?.position || 'meia')
    .trim()
    .toLowerCase();

  if (
    raw === 'gol' ||
    raw === 'goleiro'
  ) {
    return 'gol';
  }

  if (
    raw === 'zag' ||
    raw === 'zagueiro'
  ) {
    return 'zag';
  }

  if (
    raw === 'atk' ||
    raw === 'atacante'
  ) {
    return 'atk';
  }

  return 'meia';
}

function sortByName(a, b) {
  return String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR');
}

function getDisplayOrderValue(player) {
  const position = getPositionBucket(player);
  if (position === 'gol') return 0;
  if (position === 'zag') return 1;
  if (position === 'meia') return 2;
  if (position === 'atk') return 3;
  return 99;
}

function sortPlayersForDisplay(players = []) {
  return [...players].sort((a, b) => {
    const positionDiff = getDisplayOrderValue(a) - getDisplayOrderValue(b);
    if (positionDiff !== 0) return positionDiff;
    return sortByName(a, b);
  });
}


// Pesos do índice de força do sorteio (ajustáveis): metade nota de desempenho,
// metade pontuação no campeonato. O campeonato entra para distribuir os líderes
// e evitar que quem está disparando caia sempre no time mais forte.
const STRENGTH_WEIGHTS = { perf: 0.5, champ: 0.5 };

// Monta um "índice de força" por jogador combinando a média da votação de
// desempenho com a pontuação no campeonato (anual). Cada métrica é normalizada
// 0..1 dentro do plantel do dia e a combinação volta numa escala 1–10 (intuitiva
// para o selo). Jogador sem nota usa a média do plantel; sem pontos = 0 pontos.
// Devolve { strengthOf, perfOf, champOf } para reuso no selo da UI.
export function buildStrengthResolver(players = [], snapshot = getState()) {
  const list = Array.isArray(players) ? players : [];
  // JANELA MÓVEL de 12 meses, e não a temporada: se o índice de força zerasse
  // junto com a classificação, o primeiro sorteio de cada temporada — e pior, o
  // primeiro do ANO, quando os pontos também recomeçam — sairia com todo mundo
  // empatado em força, ou seja, times sem critério bem na semana em que o
  // pessoal volta. O recorte por temporada é regra de RANKING; equilibrar time
  // é heurística interna.
  const avgs = playerRatingAverages(getCachedRatings(), rollingRatingWindow(12));
  const ratedVals = list.map((p) => avgs[String(p?.id)]).filter((r) => r && r.votes > 0).map((r) => r.avg);
  const perfFallback = ratedVals.length ? ratedVals.reduce((a, b) => a + b, 0) / ratedVals.length : 6;
  const perfOf = (player) => {
    const r = avgs[String(player?.id)];
    return (r && r.votes > 0) ? r.avg : perfFallback;
  };

  const champMap = new Map();
  try {
    for (const row of calculateAnnualRanking(snapshot)) champMap.set(String(row.player_id), Number(row.points) || 0);
  } catch (_) { /* sem campeonato → só a nota pesa */ }
  const champOf = (player) => champMap.get(String(player?.id)) || 0;

  const perfArr = list.map(perfOf);
  const champArr = list.map(champOf);
  const norm = (val, arr) => {
    if (!arr.length) return 0.5;
    const mn = Math.min(...arr), mx = Math.max(...arr);
    return (mx > mn) ? (val - mn) / (mx - mn) : 0.5; // todos iguais → neutro
  };

  const strengthOf = (player) => {
    const c01 = STRENGTH_WEIGHTS.perf * norm(perfOf(player), perfArr)
      + STRENGTH_WEIGHTS.champ * norm(champOf(player), champArr);
    return 1 + c01 * 9;
  };
  return { strengthOf, perfOf, champOf };
}

// Divide os confirmados em dois times equilibrados pelo ÍNDICE DE FORÇA
// (nota de desempenho + pontuação no campeonato), mantendo a PARIDADE DE
// POSIÇÃO como restrição rígida (cada posição é dividida o mais igual possível
// entre os times). Dentro de cada posição, os jogadores entram do mais forte
// para o mais fraco — com um leve "tremor" aleatório (±0.4) para que jogadores
// de força parecida possam trocar de lado entre um sorteio e outro (os times não
// saem idênticos toda semana), sem quebrar o equilíbrio.
function balanceTeams(players, ratingOf = () => 0) {
  const teamA = [];
  const teamB = [];
  const totals = { A: 0, B: 0 };

  const buckets = {
    gol: [],
    zag: [],
    meia: [],
    atk: [],
  };

  players.forEach((player) => {
    buckets[getPositionBucket(player)].push(player);
  });

  const countPos = (team, pos) => team.filter((p) => getPositionBucket(p) === pos).length;

  Object.keys(buckets).forEach((pos) => {
    const ordered = [...buckets[pos]].sort((a, b) => {
      const ja = ratingOf(a) + (Math.random() - 0.5) * 0.8;
      const jb = ratingOf(b) + (Math.random() - 0.5) * 0.8;
      return jb - ja;
    });

    ordered.forEach((player) => {
      const cA = countPos(teamA, pos);
      const cB = countPos(teamB, pos);

      let target;
      if (cA !== cB) target = cA < cB ? 'A' : 'B';                          // 1º: paridade de posição
      else if (totals.A !== totals.B) target = totals.A <= totals.B ? 'A' : 'B'; // 2º: equilíbrio de nota
      else target = teamA.length <= teamB.length ? 'A' : 'B';              // 3º: menor time

      if (target === 'A') { teamA.push(player); totals.A += ratingOf(player); }
      else { teamB.push(player); totals.B += ratingOf(player); }
    });
  });

  return {
    teamA: sortPlayersForDisplay(teamA),
    teamB: sortPlayersForDisplay(teamB),
  };
}


export function drawTeams() {
  const snapshot = getState();
  const game = activeGame(snapshot);
  const gameKey = activeGameKey(snapshot);
  const confirmedIds = new Set(
    scopedConfirmations(snapshot)
      .filter((entry) => entry?.confirmed)
      .map((entry) => entry.player_id)
  );

  const confirmedPlayers = (snapshot.players || [])
    .filter((player) => confirmedIds.has(String(player.id)))
    .filter((player) => player.plays_football !== false)
    .filter((player) => !isCarneOnly(player));

  const rentalGoalkeepers = getRentalGoalkeepers(game).map((entry) => ({
    id: entry.id,
    name: entry.name,
    position: 'gol',
    plays_football: true,
    role: 'player',
    temporary: true,
    rental_goalkeeper: true,
  }));

  const guestPlayers = getGuestPlayers(game).map((entry) => ({
    id: entry.id,
    name: entry.name,
    position: ['gol', 'zag', 'meia', 'atk'].includes(entry.position) ? entry.position : 'meia',
    plays_football: true,
    role: 'player',
    temporary: true,
    guest: true,
  }));

  const eligiblePlayers = [...confirmedPlayers, ...rentalGoalkeepers, ...guestPlayers];

  if (eligiblePlayers.length < 2) {
    return {
      ok: false,
      message: 'É preciso ter pelo menos 2 jogadores confirmados para sortear times.',
    };
  }

  const { strengthOf } = buildStrengthResolver(eligiblePlayers, snapshot);
  const { teamA, teamB } = balanceTeams(eligiblePlayers, strengthOf);
  const createdAt = new Date().toISOString();
  
  const drawId = `draw_${gameKey}_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const sortResult = {
    id: drawId,
    game_key: gameKey,
    game_date: game.game_date || '',
    game_time: game.game_time || '',
    created_at: createdAt,
    total_players: eligiblePlayers.length,
    team_a: teamA.map((player) => (player.rental_goalkeeper || player.guest) ? player : player.id),
    team_b: teamB.map((player) => (player.rental_goalkeeper || player.guest) ? player : player.id),
    // Preserva o uniforme atribuído a cada time — sortear de novo não deve zerar.
    ...(Array.isArray(game.sort_result?.uniforms) ? { uniforms: game.sort_result.uniforms } : {}),
  };

  const drawHistory = Array.isArray(game.draw_history) ? game.draw_history : [];

  const updatedGame = { ...game, sort_result: sortResult, draw_history: [...drawHistory.filter((entry) => String(entry?.id || '') !== drawId), sortResult].slice(-30) };
  patchState({ game: updatedGame, games: (snapshot.games || []).map((item) => String(item.game_key || item.id) === gameKey ? updatedGame : item) });

  return {
    ok: true,
    message: 'Times sorteados com sucesso.',
    sortResult,
  };
}


export function addConfirmedPlayerToDraw(playerId, targetTeamKey = 'team_a') {
  const snapshot = getState();
  const game = activeGame(snapshot);
  const sortResult = game?.sort_result;

  if (!sortResult) {
    return { ok: false, message: 'Nenhum sorteio disponível para editar.' };
  }

  const targetKey = targetTeamKey === 'team_b' ? 'team_b' : 'team_a';
  const sourceKey = targetKey === 'team_a' ? 'team_b' : 'team_a';

  const teamA = Array.isArray(sortResult.team_a) ? [...sortResult.team_a] : [];
  const teamB = Array.isArray(sortResult.team_b) ? [...sortResult.team_b] : [];
  const getEntryId = (entry) => (entry && typeof entry === 'object') ? entry.id : entry;
  const targetId = String(playerId);

  if ([...teamA, ...teamB].some((entry) => String(getEntryId(entry)) === targetId)) {
    return { ok: false, message: 'Jogador já está no sorteio.' };
  }

  const confirmedIds = new Set(
    scopedConfirmations(snapshot)
      .filter((entry) => entry?.confirmed)
      .map((entry) => String(entry.player_id))
  );

  const rentalGoalkeeper = getRentalGoalkeepers(game).find((entry) => String(entry.id) === targetId);
  const registeredPlayer = (snapshot.players || []).find((player) => String(player.id) === targetId);

  if (!rentalGoalkeeper && (!registeredPlayer || !confirmedIds.has(targetId))) {
    return { ok: false, message: 'Jogador precisa estar confirmado para entrar no sorteio.' };
  }

  const playerEntry = rentalGoalkeeper
    ? {
        id: rentalGoalkeeper.id,
        name: rentalGoalkeeper.name,
        position: 'gol',
        plays_football: true,
        role: 'player',
        temporary: true,
        rental_goalkeeper: true,
      }
    : registeredPlayer.id;

  const adjustedDraw = {
    ...sortResult,
    [targetKey]: targetKey === 'team_a' ? [...teamA, playerEntry] : [...teamB, playerEntry],
    [sourceKey]: sourceKey === 'team_a' ? teamA : teamB,
    adjusted_at: new Date().toISOString(),
  };

  const drawHistory = Array.isArray(game.draw_history) ? game.draw_history : [];
  const updatedGame = {
    ...game,
    sort_result: adjustedDraw,
    draw_history: drawHistory.map((entry) => (
      String(entry?.id || '') === String(sortResult.id || '') ? adjustedDraw : entry
    )),
  };

  patchActiveGame(snapshot, updatedGame);

  return { ok: true, message: 'Jogador incluído no sorteio.' };
}


export function moveDrawnPlayer(playerId, fromTeamKey) {
  const snapshot = getState();
  const game = activeGame(snapshot);
  const sortResult = game?.sort_result;

  if (!sortResult) {
    return { ok: false, message: 'Nenhum sorteio disponível para ajustar.' };
  }

  const sourceKey = fromTeamKey === 'team_a' ? 'team_a' : fromTeamKey === 'team_b' ? 'team_b' : null;

  if (!sourceKey) {
    return { ok: false, message: 'Time de origem inválido.' };
  }

  const targetKey = sourceKey === 'team_a' ? 'team_b' : 'team_a';
  const sourceTeam = Array.isArray(sortResult[sourceKey]) ? [...sortResult[sourceKey]] : [];
  const targetTeam = Array.isArray(sortResult[targetKey]) ? [...sortResult[targetKey]] : [];
  const getEntryId = (entry) => (entry && typeof entry === 'object') ? entry.id : entry;
  const sourceIndex = sourceTeam.findIndex((entry) => String(getEntryId(entry)) === String(playerId));

  if (sourceIndex === -1) {
    return { ok: false, message: 'Jogador não encontrado no time informado.' };
  }

  const [movedPlayerEntry] = sourceTeam.splice(sourceIndex, 1);
  targetTeam.push(movedPlayerEntry);

  const adjustedDraw = {
    ...sortResult,
    [sourceKey]: sourceTeam,
    [targetKey]: targetTeam,
    adjusted_at: new Date().toISOString(),
  };
  const drawHistory = Array.isArray(game.draw_history) ? game.draw_history : [];

  patchActiveGame(snapshot, {
    ...game,
    sort_result: adjustedDraw,
    draw_history: drawHistory.map((entry) => (
      String(entry?.id || '') === String(sortResult.id || '') ? adjustedDraw : entry
    )),
  });

  return { ok: true, message: 'Jogador movido.' };
}

// Limpa APENAS o sorteio ativo. O draw_history fica: resultados de campeonato já
// lançados guardam o draw_id, e apagar o histórico fazia esses resultados
// apontarem para um sorteio inexistente — a escalação de origem sumia da
// auditoria e o seletor de lançamento não conseguia mais exibi-la.
export function clearTeamDraw() {
  const snapshot = getState();
  const game = activeGame(snapshot);
  patchActiveGame(snapshot, {
    ...game,
    sort_result: null,
  });

  return { ok: true, message: 'Sorteio limpo. O histórico de sorteios foi preservado.' };
}
