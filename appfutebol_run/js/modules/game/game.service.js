import { isCarneOnly, playsFootball as authzPlaysFootball } from '../../domain/authz.js';
import { getState, patchState } from '../../core/state.js';
import { getPresenceDecision, isGameFull, isGoalkeeperEntry, getMensalidadeMode, MENSALIDADE_MODES } from '../../domain/rules.engine.js';
import { getActiveGame, getGameKey } from '../../domain/projection.js';
import { getCachedRatings, playerRatingAverages } from '../../services/ratings.service.js';
import { calculateAnnualRanking } from '../championship/championship.service.js';
import { isPro } from '../../domain/gating.js';
import { isGoalkeeperPlayer } from '../../domain/confirmations.js';
import { goleirosPorJogo, timesPorJogo, usaPosicoes } from '../../domain/club-profile.js';
import { comTimes, idDaEntrada, semJogador, timesDoSorteio } from '../../domain/draw-teams.js';


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

  const adjustedDraw = { ...semJogador(sortResult, playerId), adjusted_at: now };

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
  // O teto de goleiros vem do perfil do clube: futsal costuma usar 2, mas há
  // clube que joga sem goleiro fixo (0) ou com um só.
  const tetoGoleiros = goleirosPorJogo(snapshot);

  if (tetoGoleiros <= 0) {
    return { ok: false, message: 'Este clube não usa goleiro fixo. Ajuste em Config › Como o clube joga.' };
  }

  if (current.length >= tetoGoleiros) {
    return { ok: false, message: `Limite de ${tetoGoleiros} goleiro(s) atingido.` };
  }

  const entry = {
    id: `rental_goalkeeper_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: cleanName,
    temporary: true,
    created_at: new Date().toISOString(),
  };

  patchActiveGame(snapshot, {
    ...game,
    rental_goalkeepers: [...current, entry].slice(0, tetoGoleiros),
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
    const teto = goleirosPorJogo(snapshot);
    if (teto <= 0) {
      return { ok: false, message: 'Este clube não usa goleiro fixo. Ajuste em Config › Como o clube joga.' };
    }
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

  const tetoGoleiros = goleirosPorJogo(snapshot);
  if (goalkeeperPlayer && tetoGoleiros > 0 && goalkeeperCount >= tetoGoleiros) {
    return { ok: false, message: `O jogo já tem ${tetoGoleiros} goleiro(s) confirmado(s).` };
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
    const inTeams = timesDoSorteio(result).some((time) =>
      time.some((entry) => String(idDaEntrada(entry)) === pid));
    if (!inStatuses && !inTeams) return result;
    changed = true;
    const statuses = { ...(result.statuses || {}) };
    delete statuses[pid];
    return { ...semJogador(result, pid), statuses };
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
  const avgs = playerRatingAverages(getCachedRatings());
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

// Divide os confirmados em N times equilibrados pelo ÍNDICE DE FORÇA (nota de
// desempenho + pontuação no campeonato), mantendo a PARIDADE DE POSIÇÃO como
// restrição rígida: cada posição é distribuída o mais igual possível entre os
// times. Dentro de cada posição, os jogadores entram do mais forte para o mais
// fraco — com um leve "tremor" aleatório (±0.4) para que jogadores de força
// parecida troquem de lado entre um sorteio e outro (os times não saem
// idênticos toda semana), sem quebrar o equilíbrio.
//
// A generalização de 2 para N preservou a ordem de critérios: paridade de
// posição primeiro, depois soma das notas, depois tamanho. Com N=2 o resultado
// é o mesmo de antes.
//
// `porPosicao=false`: clube que não usa posição (pelada simples). Sem isso a
// paridade vira uma restrição fantasma que atrapalha o equilíbrio por nota.
function balanceTeams(players, ratingOf = () => 0, porPosicao = true, quantidadeTimes = 2) {
  const n = Math.max(1, Math.floor(Number(quantidadeTimes) || 2));
  const times = Array.from({ length: n }, () => []);
  const somas = Array.from({ length: n }, () => 0);

  const buckets = { gol: [], zag: [], meia: [], atk: [] };
  players.forEach((player) => {
    buckets[porPosicao ? getPositionBucket(player) : 'meia'].push(player);
  });

  const contaPos = (time, pos) => time.filter((p) => getPositionBucket(p) === pos).length;

  Object.keys(buckets).forEach((pos) => {
    const ordered = [...buckets[pos]].sort((a, b) => {
      const ja = ratingOf(a) + (Math.random() - 0.5) * 0.8;
      const jb = ratingOf(b) + (Math.random() - 0.5) * 0.8;
      return jb - ja;
    });

    ordered.forEach((player) => {
      // Escolhe o time "mais carente", na mesma ordem de critérios de antes:
      // menos jogadores DESTA posição, depois menor soma de notas, depois menor
      // tamanho. O empate cai sempre no time de índice menor, o que torna o
      // sorteio determinístico dado o tremor — sem isso, times iguais ficariam
      // à mercê da ordem de iteração.
      let alvo = 0;
      for (let i = 1; i < n; i += 1) {
        const cAtual = contaPos(times[alvo], pos);
        const cCandidato = contaPos(times[i], pos);
        if (cCandidato !== cAtual) { if (cCandidato < cAtual) alvo = i; continue; }
        if (somas[i] !== somas[alvo]) { if (somas[i] < somas[alvo]) alvo = i; continue; }
        if (times[i].length < times[alvo].length) alvo = i;
      }
      times[alvo].push(player);
      somas[alvo] += ratingOf(player);
    });
  });

  return times.map(sortPlayersForDisplay);
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

  // Sorteio INTELIGENTE (índice de força = nota + campeonato) é Pro. No Free o
  // sorteio é BÁSICO: mantém a paridade de posição (restrição rígida no
  // balanceTeams) e sorteia aleatório dentro de cada posição (ratingOf = 0).
  const { strengthOf } = buildStrengthResolver(eligiblePlayers, snapshot);
  const ratingOf = isPro() ? strengthOf : () => 0;
  // Quantos times este clube joga. Mais de 2 exige gente suficiente: com 5
  // confirmados e 3 times sairia um time de 1, o que não é jogo — cai para o
  // número de times que o plantel comporta.
  const timesDesejados = timesPorJogo(snapshot);
  const timesPossiveis = Math.max(2, Math.min(timesDesejados, Math.floor(eligiblePlayers.length / 2)));
  const listas = balanceTeams(eligiblePlayers, ratingOf, usaPosicoes(snapshot), timesPossiveis);
  const createdAt = new Date().toISOString();

  const paraEntrada = (player) => ((player.rental_goalkeeper || player.guest) ? player : player.id);
  const drawId = `draw_${gameKey}_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  // comTimes grava `teams` (a verdade) E `team_a`/`team_b` (compatibilidade com
  // código antigo em cache) — ver domain/draw-teams.js.
  const sortResult = comTimes({
    id: drawId,
    game_key: gameKey,
    game_date: game.game_date || '',
    game_time: game.game_time || '',
    created_at: createdAt,
    total_players: eligiblePlayers.length,
    // Preserva o uniforme atribuído a cada time (índice estável: Time A, B…) —
    // sortear de novo não deve zerar a escolha de uniforme.
    ...(Array.isArray(game.sort_result?.uniforms) ? { uniforms: game.sort_result.uniforms } : {}),
  }, listas.map((time) => time.map(paraEntrada)));

  const drawHistory = Array.isArray(game.draw_history) ? game.draw_history : [];

  const updatedGame = { ...game, sort_result: sortResult, draw_history: [...drawHistory.filter((entry) => String(entry?.id || '') !== drawId), sortResult].slice(-30) };
  patchState({ game: updatedGame, games: (snapshot.games || []).map((item) => String(item.game_key || item.id) === gameKey ? updatedGame : item) });

  return {
    ok: true,
    message: 'Times sorteados com sucesso.',
    sortResult,
  };
}


// `alvo` é o ÍNDICE do time (0 = A, 1 = B, ...). Aceita as chaves antigas
// ('team_a'/'team_b') porque a UI e chamadas em cache ainda as usam.
function indiceDoTime(alvo) {
  if (typeof alvo === 'number' && Number.isFinite(alvo)) return Math.max(0, Math.floor(alvo));
  if (alvo === 'team_b') return 1;
  if (alvo === 'team_a') return 0;
  const n = Number(alvo);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function addConfirmedPlayerToDraw(playerId, targetTeamKey = 'team_a') {
  const snapshot = getState();
  const game = activeGame(snapshot);
  const sortResult = game?.sort_result;

  if (!sortResult) {
    return { ok: false, message: 'Nenhum sorteio disponível para editar.' };
  }

  const listas = timesDoSorteio(sortResult).map((time) => [...time]);
  const alvo = Math.min(indiceDoTime(targetTeamKey), Math.max(0, listas.length - 1));
  const targetId = String(playerId);

  if (listas.some((time) => time.some((entry) => String(idDaEntrada(entry)) === targetId))) {
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

  listas[alvo] = [...listas[alvo], playerEntry];
  const adjustedDraw = { ...comTimes(sortResult, listas), adjusted_at: new Date().toISOString() };

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

  const listas = timesDoSorteio(sortResult).map((time) => [...time]);
  if (listas.length < 2) {
    return { ok: false, message: 'É preciso ter pelo menos dois times para mover jogadores.' };
  }

  const origem = indiceDoTime(fromTeamKey);
  if (origem >= listas.length) {
    return { ok: false, message: 'Time de origem inválido.' };
  }

  const posicao = listas[origem].findIndex((entry) => String(idDaEntrada(entry)) === String(playerId));
  if (posicao === -1) {
    return { ok: false, message: 'Jogador não encontrado no time informado.' };
  }

  // Com 2 times, mover = trocar de lado (comportamento de sempre). Com 3+,
  // avança para o PRÓXIMO e dá a volta — assim um toque repetido passeia o
  // jogador por todos os times, sem precisar de um seletor.
  const destino = (origem + 1) % listas.length;
  const [entrada] = listas[origem].splice(posicao, 1);
  listas[destino].push(entrada);

  const adjustedDraw = { ...comTimes(sortResult, listas), adjusted_at: new Date().toISOString() };
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
