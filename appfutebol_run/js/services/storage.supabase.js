import { SUPABASE_CONFIG } from '../config/supabase.config.js';
import { assertCriticalOperationAllowed } from './environment.guard.js';

let lastRemoteUpdatedAt = null;
let lastSplitSnapshot = null;
let lastSplitFingerprint = '';
let gameStateHadVolatileDraw = false;

const SPLIT_TABLES = {
  players: 'players',
  game: 'game_state',
  presence: 'presence_confirmations',
  meta: 'app_meta',
};

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function getConfig() {
  const runtimeConfig = window.HARMONIA_SUPABASE || {};
  return {
    ...SUPABASE_CONFIG,
    ...runtimeConfig,
  };
}

export function isSupabaseConfigured() {
  const config = getConfig();
  return !!(config.enabled && config.url && config.anonKey && config.stateTable && config.stateKey);
}

function baseUrl(config) {
  return trimTrailingSlash(config.url);
}

function tableUrl(config, table, query = '') {
  const suffix = query ? `?${query}` : '';
  return `${baseUrl(config)}/rest/v1/${encodeURIComponent(table)}${suffix}`;
}

function getAuthSession() {
  try {
    const raw = localStorage.getItem('harmonia_auth_session');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function getAccessToken() {
  return getAuthSession()?.access_token || null;
}

function getCurrentAuthUserId() {
  return getAuthSession()?.user?.id || null;
}

function buildHeaders(config, prefer = null) {
  const accessToken = getAccessToken();

  const headers = {
    apikey: config.anonKey,
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

function isValidSplitState(state) {
  return !!(
    state &&
    typeof state === 'object' &&
    Array.isArray(state.players) &&
    state.game &&
    typeof state.game === 'object' &&
    Array.isArray(state.confirmations)
  );
}

function hasVolatileDrawFields(game) {
  if (!game || typeof game !== 'object') return false;

  return (
    Object.prototype.hasOwnProperty.call(game, 'sort_result') ||
    Object.prototype.hasOwnProperty.call(game, 'draw_history') ||
    (game.data && typeof game.data === 'object' && (
      Object.prototype.hasOwnProperty.call(game.data, 'sort_result') ||
      Object.prototype.hasOwnProperty.call(game.data, 'draw_history')
    ))
  );
}

function stripVolatileDrawFields(game) {
  if (!game || typeof game !== 'object') return game || null;

  const nextGame = cloneJson(game) || {};
  delete nextGame.sort_result;
  delete nextGame.draw_history;

  if (nextGame.data && typeof nextGame.data === 'object') {
    delete nextGame.data.sort_result;
    delete nextGame.data.draw_history;
  }

  return nextGame;
}

function mergeGameStateWithMetaGame(game, meta = {}) {
  const normalizedGame = normalizeGameForPresenceCutover(game);
  const games = Array.isArray(meta.games) ? meta.games : [];
  const activeGameId = String(meta.active_game_id || normalizedGame?.game_key || '').trim();

  const metaGame = games.find((item) => {
    const key = String(item?.game_key || item?.id || '').trim();
    return key && (key === activeGameId || key === String(normalizedGame?.game_key || '').trim());
  }) || games[0] || null;

  if (!metaGame) return normalizedGame;

  return normalizeGameForPresenceCutover({
    ...(normalizedGame || {}),
    ...metaGame,
    game_key: metaGame.game_key || metaGame.id || normalizedGame?.game_key,
  });
}

function normalizeDeletedPlayerIds(meta = {}) {
  return Array.isArray(meta.deleted_player_ids)
    ? [...new Set(meta.deleted_player_ids.map((id) => String(id)).filter(Boolean))]
    : [];
}

function normalizeDeletedPlayerPhones(meta = {}) {
  return Array.isArray(meta.deleted_player_phones)
    ? [...new Set(meta.deleted_player_phones.map((phone) => String(phone || '').replace(/\D/g, '')).filter(Boolean))]
    : [];
}

function isDeletedPlayerRecord(player, deletedIds, deletedPhones) {
  if (!player) return false;
  const playerId = String(player.id || '');
  const phone = String(player.phone || '').replace(/\D/g, '');
  const logicallyInactive = player.active === false || player.deleted === true || !!player.deleted_at;
  return logicallyInactive || deletedIds.includes(playerId) || (phone && deletedPhones.includes(phone));
}

function composeState({ players = [], game = null, confirmations = [], meta = {} }) {
  const games = Array.isArray(meta.games) ? meta.games : (game ? [normalizeGameForPresenceCutover(game)] : []);
  const activeGame = mergeGameStateWithMetaGame(game, { ...meta, games });
  const deletedPlayerIds = normalizeDeletedPlayerIds(meta);
  const deletedPlayerPhones = normalizeDeletedPlayerPhones(meta);
  const visiblePlayers = Array.isArray(players)
    ? players.filter((player) => !isDeletedPlayerRecord(player, deletedPlayerIds, deletedPlayerPhones))
    : [];
  const visiblePlayerIds = new Set(visiblePlayers.map((player) => String(player.id)));
  const visibleConfirmations = Array.isArray(confirmations)
    ? confirmations.filter((entry) => visiblePlayerIds.has(String(entry?.player_id)))
    : [];
  const visibleCarne = Array.isArray(meta.carne)
    ? meta.carne.filter((entry) => {
        // O rodízio recorrente (carne_rotation) NÃO tem player_id — guarda `pairs`.
        // Mantemos sempre; a limpeza de jogadores removidos das duplas é feita no
        // sanitizeCarne (state.guard). Sem isto, o filtro abaixo o descartava na
        // leitura do servidor e o rodízio "voltava" ao seed a cada reload/sync.
        if (entry?.type === 'carne_rotation') return true;
        if (entry?.type === 'carne_schedule') {
          return visiblePlayerIds.has(String(entry.player1_id)) && visiblePlayerIds.has(String(entry.player2_id));
        }
        return visiblePlayerIds.has(String(entry?.player_id));
      })
    : [];

  return {
    session: { playerId: null },
    players: visiblePlayers,
    game: activeGame,
    confirmations: visibleConfirmations,
    championship: meta.championship || null,
    games,
    active_game_id: meta.active_game_id || activeGame?.game_key || game?.game_key || null,
    carne: visibleCarne,
    notifications: Array.isArray(meta.notifications) ? meta.notifications : [],
    // Configuração global do clube. Migração: se ainda não existir em meta,
    // herda o vencimento do jogo ativo (valor legado por-jogo).
    settings: {
      mens_expire_date: String(meta.settings?.mens_expire_date || activeGame?.mens_expire_date || '').slice(0, 10),
      mens_enforcement_mode: String(meta.settings?.mens_enforcement_mode || 'none'),
      ratings_perf_window_hours: Number(meta.settings?.ratings_perf_window_hours) || 0,
    },
    deleted_player_ids: deletedPlayerIds,
    deleted_player_phones: deletedPlayerPhones,
    ui: {
      currentTab: 'home',
      authMode: 'login',
      authMessage: null,
    },
  };
}

function splitState(state) {
  const normalizedGame = normalizeGameForPresenceCutover(state.game || null);

  return {
    players: Array.isArray(state.players) ? state.players : [],
    // Fonte única do sorteio: app_meta.data.games[].
    // game_state guarda apenas configuração do jogo atual/presença.
    game: stripVolatileDrawFields(normalizedGame),
    confirmations: Array.isArray(state.confirmations) ? state.confirmations : [],
    meta: {
      championship: state.championship || null,
      games: Array.isArray(state.games) ? state.games : [],
      active_game_id: state.active_game_id || normalizedGame?.game_key || null,
      carne: Array.isArray(state.carne) ? state.carne : [],
      notifications: Array.isArray(state.notifications) ? state.notifications : [],
      settings: {
        mens_expire_date: String(state.settings?.mens_expire_date || '').slice(0, 10),
        mens_enforcement_mode: String(state.settings?.mens_enforcement_mode || 'none'),
        ratings_perf_window_hours: Number(state.settings?.ratings_perf_window_hours) || 0,
      },
      deleted_player_ids: Array.isArray(state.deleted_player_ids) ? state.deleted_player_ids.map((id) => String(id)) : [],
      deleted_player_phones: Array.isArray(state.deleted_player_phones) ? state.deleted_player_phones.map((phone) => String(phone)) : [],
    },
  };
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  return JSON.stringify(value ?? null);
}

function snapshotFingerprint(parts) {
  return stableStringify({
    players: parts.players,
    game: parts.game,
    confirmations: parts.confirmations,
    meta: parts.meta,
  });
}

function indexBy(items, keyGetter) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const key = keyGetter(item);
    if (key) map.set(String(key), item);
  }
  return map;
}

function buildGameKeyFromGame(game) {
  const date = String(game?.game_date || '').trim();
  const time = String(game?.game_time || '').trim();

  if (!date) return 'default';

  const safeDate = date.replace(/[^0-9-]/g, '');
  const safeTime = time.replace(/[^0-9]/g, '') || '0000';

  return `game_${safeDate}_${safeTime}`;
}

function getActiveGameKey(game) {
  const explicit = String(game?.game_key || '').trim();
  return explicit || buildGameKeyFromGame(game);
}

function normalizeConfirmationGameKey(confirmation, fallbackGameKey) {
  return String(confirmation?.game_key || fallbackGameKey || 'default');
}

function normalizeGameForPresenceCutover(game) {
  if (!game || typeof game !== 'object') return game || null;

  const nextGame = cloneJson(game) || {};

  delete nextGame.confirmedPlayers;
  delete nextGame.confirmed_players;
  delete nextGame.confirmations;

  if (nextGame.data && typeof nextGame.data === 'object') {
    delete nextGame.data.confirmedPlayers;
    delete nextGame.data.confirmed_players;
    delete nextGame.data.confirmations;
  }

  nextGame.game_key = getActiveGameKey(nextGame);

  return nextGame;
}

function confirmationFromPresenceRow(row) {
  if (!row || typeof row !== 'object') return null;

  const data = row.data && typeof row.data === 'object' ? row.data : {};
  const rowStatus = String(row.status || '').toLowerCase();
  const dataStatus = String(data.status || '').toLowerCase();
  const status = (dataStatus === 'waitlist' || dataStatus === 'waitlisted') ? dataStatus : (rowStatus || dataStatus);
  const confirmed = status ? status === 'confirmed' : data.confirmed === true;
  const timestamp = data.waitlisted_at || data.timestamp || row.confirmed_at || row.cancelled_at || row.updated_at || null;

  return {
    ...data,
    game_key: row.game_key || data.game_key || 'default',
    player_id: row.player_id || data.player_id,
    confirmed,
    status: status || (confirmed ? 'confirmed' : 'cancelled'),
    timestamp,
    confirmed_at: row.confirmed_at || data.confirmed_at || null,
    cancelled_at: row.cancelled_at || data.cancelled_at || null,
    waitlisted_at: data.waitlisted_at || null,
    waitlist_position: data.waitlist_position || null,
    removed_by_admin: row.removed_by_admin === true || data.removed_by_admin === true,
    source: 'presence_confirmations',
  };
}

function presencePayloadFromConfirmation(confirmation, now, gameKey = 'default') {
  const confirmed = confirmation?.confirmed === true;
  const removedByAdmin = confirmation?.removed_by_admin === true;
  const requestedStatus = String(confirmation?.status || '').toLowerCase();
  const isWaitlist = !confirmed && (requestedStatus === 'waitlist' || requestedStatus === 'waitlisted');
  const status = confirmed ? 'confirmed' : (removedByAdmin ? 'removed' : (isWaitlist ? 'waitlist' : 'cancelled'));
  const timestamp = confirmation?.timestamp || confirmation?.waitlisted_at || now;
  const actorAuthUserId = getCurrentAuthUserId();
  const normalizedGameKey = normalizeConfirmationGameKey(confirmation, gameKey);

  const normalizedPayload = {
    player_id: String(confirmation.player_id),
    game_key: normalizedGameKey,
    confirmed,
    status,
    timestamp,
    confirmed_at: confirmed ? timestamp : null,
    cancelled_at: (!confirmed && !removedByAdmin && !isWaitlist) ? timestamp : null,
    waitlisted_at: isWaitlist ? (confirmation?.waitlisted_at || timestamp) : null,
    waitlist_position: isWaitlist ? (confirmation?.waitlist_position || null) : null,
    removed_by_admin: removedByAdmin,
    source: 'presence_confirmations_app_write',
    actor_auth_user_id: actorAuthUserId,
  };

  return {
    game_key: normalizedGameKey,
    player_id: String(confirmation.player_id),
    status: status === 'waitlist' ? 'cancelled' : status,
    confirmed_at: normalizedPayload.confirmed_at,
    cancelled_at: normalizedPayload.cancelled_at,
    removed_by_admin: removedByAdmin,
    created_by_auth_user_id: actorAuthUserId,
    data: normalizedPayload,
    updated_at: now,
  };
}

function rememberSplitSnapshot(state, updatedAt = null) {
  const parts = splitState(state);
  lastSplitSnapshot = cloneJson(parts);
  lastSplitFingerprint = snapshotFingerprint(parts);
  lastRemoteUpdatedAt = updatedAt || lastRemoteUpdatedAt;
}

async function requestJson(config, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(config, options.prefer || null),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      ok: false,
      status: response.status,
      body,
      data: null,
    };
  }

  const data = await response.json().catch(() => null);
  return {
    ok: true,
    status: response.status,
    body: '',
    data,
  };
}

async function requestNoContent(config, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(config, options.prefer || null),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      ok: false,
      status: response.status,
      body,
    };
  }

  return {
    ok: true,
    status: response.status,
    body: '',
  };
}

async function loadSplitState(config) {
  const [playersResult, gameResult, metaResult] = await Promise.all([
    requestJson(config, tableUrl(config, SPLIT_TABLES.players, 'select=id,auth_user_id,is_admin,data,updated_at&order=data->>name.asc'), { method: 'GET' }),
    requestJson(config, tableUrl(config, SPLIT_TABLES.game, 'key=eq.default&select=key,data,updated_at&limit=1'), { method: 'GET' }),
    requestJson(config, tableUrl(config, SPLIT_TABLES.meta, 'key=eq.default&select=key,data,updated_at&limit=1'), { method: 'GET' }),
  ]);

  if (!playersResult.ok || !gameResult.ok || !metaResult.ok) {
    const failed = [playersResult, gameResult, metaResult].find((result) => !result.ok);
    return {
      ok: false,
      state: null,
      updatedAt: null,
      status: failed?.status || null,
      reason: 'single_source_tables_unavailable',
    };
  }

  const players = Array.isArray(playersResult.data)
    ? playersResult.data
        .map((row) => ({
          ...(row.data || {}),
          id: row.id || row.data?.id,
          auth_user_id: row.auth_user_id || row.data?.auth_user_id || null,
          is_admin: row.is_admin === true,
        }))
        .filter((player) => player.id)
    : [];

  const gameRow = Array.isArray(gameResult.data) ? gameResult.data[0] : null;
  const rawGameData = gameRow?.data || null;
  gameStateHadVolatileDraw = hasVolatileDrawFields(rawGameData);
  const normalizedGame = normalizeGameForPresenceCutover(stripVolatileDrawFields(rawGameData));
  const activeGameKey = getActiveGameKey(normalizedGame);

  const presenceResult = await requestJson(
    config,
    tableUrl(config, SPLIT_TABLES.presence, `game_key=eq.${encodeURIComponent(activeGameKey)}&select=game_key,player_id,status,confirmed_at,cancelled_at,removed_by_admin,data,updated_at`),
    { method: 'GET' }
  );

  if (!presenceResult.ok) {
    return {
      ok: false,
      state: null,
      updatedAt: null,
      status: presenceResult.status || null,
      reason: 'single_source_presence_unavailable',
    };
  }

  const confirmations = Array.isArray(presenceResult.data)
    ? presenceResult.data.map(confirmationFromPresenceRow).filter((entry) => entry?.player_id)
    : [];

  const metaRow = Array.isArray(metaResult.data) ? metaResult.data[0] : null;

  // Guard anti-degradação: num clube populado a linha app_meta 'default' SEMPRE
  // existe (carne, campeonato, settings, games). Se a leitura voltou OK mas sem
  // meta (linha ausente/filtrada por sessão degradada) enquanto HÁ jogadores,
  // NÃO componha um estado com esses campos vazios — persistido por um save
  // seguinte, isso apagaria os dados bons. Trata como leitura indisponível.
  if (!metaRow && players.length) {
    return {
      ok: false,
      state: null,
      updatedAt: null,
      reason: 'single_source_meta_missing_for_populated_club',
    };
  }

  const state = composeState({
    players,
    game: normalizedGame,
    confirmations,
    meta: metaRow?.data || {},
  });

  const updatedValues = [
    ...(Array.isArray(playersResult.data) ? playersResult.data.map((row) => row.updated_at) : []),
    ...(Array.isArray(presenceResult.data) ? presenceResult.data.map((row) => row.updated_at) : []),
    gameRow?.updated_at,
    metaRow?.updated_at,
  ].filter(Boolean).sort();

  lastRemoteUpdatedAt = updatedValues.length ? updatedValues[updatedValues.length - 1] : null;

  if (!isValidSplitState(state)) {
    return {
      ok: false,
      state,
      updatedAt: lastRemoteUpdatedAt,
      reason: 'single_source_state_empty_or_invalid',
    };
  }

  rememberSplitSnapshot(state, lastRemoteUpdatedAt);

  return {
    ok: true,
    state,
    updatedAt: lastRemoteUpdatedAt,
    reason: 'presence_single_source_loaded_by_game_key',
    mode: 'presence-single-source-game-key',
  };
}

async function upsertRow(config, table, payload, onConflict = null) {
  const query = onConflict ? `on_conflict=${encodeURIComponent(onConflict)}` : '';
  return await requestJson(config, tableUrl(config, table, query), {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: JSON.stringify(payload),
  });
}

async function upsertPresenceConfirmation(config, confirmation, now, gameKey) {
  const payload = presencePayloadFromConfirmation(confirmation, now, gameKey);
  const result = await upsertRow(config, SPLIT_TABLES.presence, payload, 'game_key,player_id');

  if (!result.ok) {
    console.warn('[presence] Falha ao gravar em presence_confirmations:', result.status, result.body);
  }

  return result;
}

async function deleteRow(config, table, column, value) {
  return await requestNoContent(config, tableUrl(config, table, `${column}=eq.${encodeURIComponent(String(value))}`), {
    method: 'DELETE',
  });
}

function buildGranularOperations(config, previousParts, nextParts, now) {
  const operations = [];
  const previousPlayers = indexBy(previousParts?.players || [], (player) => player.id);
  const nextPlayers = indexBy(nextParts.players, (player) => player.id);

  const previousGameKey = getActiveGameKey(previousParts?.game || null);
  const nextGameKey = getActiveGameKey(nextParts.game || null);

  // Chave composta: cada confirmação pertence ao par (game_key, player_id),
  // que é exatamente a chave única da tabela presence_confirmations.
  const confKey = (entry) => `${String((entry && entry.game_key) || '')}|${String((entry && entry.player_id) || '')}`;
  const previousConfirmations = indexBy(previousParts?.confirmations || [], confKey);
  const nextConfirmations = indexBy(nextParts.confirmations, confKey);

  for (const [id, player] of nextPlayers.entries()) {
    if (stableStringify(previousPlayers.get(id)) !== stableStringify(player)) {
      const authUserId = player.auth_user_id || null;
      const isAdmin = player.is_admin === true;
      operations.push({
        type: 'upsert_player',
        run: () => upsertRow(config, SPLIT_TABLES.players, {
          id,
          auth_user_id: authUserId,
          is_admin: isAdmin,
          data: {
            ...player,
            id,
            auth_user_id: authUserId,
            is_admin: isAdmin,
          },
          updated_at: now,
        }),
      });
    }
  }

  // HOTFIX v1.70.14
  // Nunca deletar players automaticamente por diff de snapshot.
  // Exclusão de jogador deve ser ação explícita.
  const explicitDeletedPlayerIds = new Set(
    (Array.isArray(nextParts.meta?.deleted_player_ids) ? nextParts.meta.deleted_player_ids : [])
      .map((playerId) => String(playerId))
      .filter(Boolean)
  );

  // v1.70.20: exclusão de jogador é lógica.
  // Não deletar public.players aqui. O tombstone em app_meta é a fonte de verdade
  // para ocultar o jogador sem destruir histórico de campeonato/carne/presença.

  // v1.70.41: CADA confirmação é gravada sob a SUA própria game_key.
  // Antes, o save re-carimbava todas com a chave do jogo ativo (e reescrevia
  // tudo quando o jogo ativo mudava), fazendo confirmações de um jogo
  // "vazarem" para o jogo seguinte. Agora a chave é preservada; só caímos
  // no jogo ativo quando a confirmação é nova e ainda não tem chave.
  for (const [key, confirmation] of nextConfirmations.entries()) {
    const ownGameKey = String(confirmation?.game_key || '') || nextGameKey;
    const normalizedConfirmation = {
      ...confirmation,
      game_key: ownGameKey,
    };

    if (stableStringify(previousConfirmations.get(key)) !== stableStringify(normalizedConfirmation)) {
      operations.push({
        type: 'upsert_presence_confirmation',
        run: () => upsertPresenceConfirmation(config, normalizedConfirmation, now, ownGameKey),
      });
    }
  }

  // HOTFIX v1.70.14
  // Nunca deletar confirmações automaticamente por diff de snapshot.
  // Remoções devem ocorrer por fluxo explícito do domínio.
  for (const [, confirmation] of previousConfirmations.entries()) {
    const key = confKey(confirmation);
    const entryGameKey = String(confirmation?.game_key || '') || previousGameKey;
    const entryPlayerId = String(confirmation?.player_id || '');
    if (!nextConfirmations.has(key) && explicitDeletedPlayerIds.has(entryPlayerId)) {
      operations.push({
        type: 'delete_presence_confirmation_explicit',
        run: () => requestNoContent(
          config,
          tableUrl(config, SPLIT_TABLES.presence, `game_key=eq.${encodeURIComponent(entryGameKey)}&player_id=eq.${encodeURIComponent(entryPlayerId)}`),
          { method: 'DELETE' }
        ),
      });
    }
  }


  if (stableStringify(previousParts?.game || null) !== stableStringify(nextParts.game || null)) {
    operations.push({
      type: 'upsert_game',
      run: () => upsertRow(config, SPLIT_TABLES.game, { key: 'default', data: stripVolatileDrawFields(nextParts.game), updated_at: now }),
    });
  }

  if (gameStateHadVolatileDraw && !operations.some((operation) => operation.type === 'upsert_game')) {
    operations.push({
      type: 'cleanup_game_draw_fields',
      run: () => upsertRow(config, SPLIT_TABLES.game, { key: 'default', data: stripVolatileDrawFields(nextParts.game), updated_at: now }),
    });
  }

  if (stableStringify(previousParts?.meta || {}) !== stableStringify(nextParts.meta || {})) {
    operations.push({
      type: 'upsert_meta',
      run: () => upsertRow(config, SPLIT_TABLES.meta, { key: 'default', data: nextParts.meta, updated_at: now }),
    });
  }

  return operations;
}

// Lê o updated_at mais recente das LINHAS ÚNICAS compartilhadas (game/meta) —
// os objetos gravados "inteiros" e, portanto, o alvo de sobrescrita cega entre
// admins. players/presence usam chave por linha e não sofrem esse problema.
async function fetchSharedUpdatedAt(config) {
  const [gameRes, metaRes] = await Promise.all([
    requestJson(config, tableUrl(config, SPLIT_TABLES.game, 'key=eq.default&select=updated_at&limit=1'), { method: 'GET' }),
    requestJson(config, tableUrl(config, SPLIT_TABLES.meta, 'key=eq.default&select=updated_at&limit=1'), { method: 'GET' }),
  ]);
  const values = [];
  if (gameRes?.ok && Array.isArray(gameRes.data) && gameRes.data[0]?.updated_at) values.push(gameRes.data[0].updated_at);
  if (metaRes?.ok && Array.isArray(metaRes.data) && metaRes.data[0]?.updated_at) values.push(metaRes.data[0].updated_at);
  values.sort();
  return values.length ? values[values.length - 1] : null;
}

async function saveSplitState(config, state) {
  const parts = splitState(state);

  if (!parts.game) {
    return { ok: false, conflict: false, reason: 'split_save_invalid_state' };
  }

  const nextFingerprint = snapshotFingerprint(parts);

  if (lastSplitFingerprint && nextFingerprint === lastSplitFingerprint) {
    return { ok: true, conflict: false, reason: 'split_no_changes', updatedAt: lastRemoteUpdatedAt };
  }

  const now = new Date().toISOString();
  const previousParts = lastSplitSnapshot || { players: [], game: null, confirmations: [], meta: {} };

  // Guard anti-apagão: nunca persista um meta que ZERA a carne quando o último
  // estado conhecido a tinha preenchida. Carne só vai a vazio por estado em
  // memória degradado (leitura falha/sessão expirada), nunca por ação real (não
  // há UI para limpar o rodízio inteiro; "Salvar rodízio" bloqueia vazio). Já
  // causou perda do rodízio em produção. Aborta sem gravar nada.
  const prevCarne = Array.isArray(previousParts?.meta?.carne) ? previousParts.meta.carne : [];
  const nextCarne = Array.isArray(parts?.meta?.carne) ? parts.meta.carne : [];
  if (prevCarne.length > 0 && nextCarne.length === 0) {
    console.warn('[storage.supabase] save abortado: tentativa de zerar a carne a partir de estado preenchido (degradado?). Nada foi gravado.');
    return { ok: false, conflict: false, reason: 'meta_carne_wipe_blocked' };
  }

  const operations = buildGranularOperations(config, previousParts, parts, now);

  if (!operations.length) {
    rememberSplitSnapshot(state, lastRemoteUpdatedAt || now);
    return { ok: true, conflict: false, reason: 'split_no_changes', updatedAt: lastRemoteUpdatedAt };
  }

  // Concorrência otimista para os objetos compartilhados (game/meta): se vamos
  // sobrescrever um deles e o remoto avançou além do que conhecemos (outro admin
  // gravou), ABORTA e sinaliza conflito em vez de apagar a alteração do outro.
  // Nossas próprias gravações avançam lastRemoteUpdatedAt, então saves
  // sequenciais do mesmo usuário não geram falso-positivo.
  const touchesShared = operations.some((op) => op.type === 'upsert_game' || op.type === 'cleanup_game_draw_fields' || op.type === 'upsert_meta');
  if (touchesShared && lastRemoteUpdatedAt) {
    const freshShared = await fetchSharedUpdatedAt(config);
    // Compara por timestamp numérico (robusto a diferenças de formato/precisão
    // entre o que gravamos e o que o Postgres devolve). Só conflita se o remoto
    // for MAIS NOVO que o último estado que conhecíamos — ou seja, outro cliente
    // gravou. Margem de 1s evita ruído de precisão.
    const freshMs = freshShared ? new Date(freshShared).getTime() : 0;
    const baseMs = new Date(lastRemoteUpdatedAt).getTime() || 0;
    if (freshMs && baseMs && freshMs - baseMs > 1000) {
      console.warn('[storage.supabase] remoto avançou desde a última sync; abortando para não sobrescrever (conflito).');
      return { ok: false, conflict: true, reason: 'remote_advanced' };
    }
  }

  const results = await Promise.all(operations.map((operation) => operation.run()));
  const failed = results.find((result) => !result.ok);

  if (failed) {
    return { ok: false, conflict: false, reason: `split_granular_save_failed_${failed.status}` };
  }

  rememberSplitSnapshot(state, now);
  gameStateHadVolatileDraw = false;

  // Re-ancora o baseline ao updated_at REAL do servidor (que pode diferir do
  // nosso `now` por trigger/precisão). Sem isso, o próximo save poderia
  // falso-conflitar consigo mesmo. Falha de leitura não é crítica: mantém `now`.
  if (touchesShared) {
    try {
      const serverUpdatedAt = await fetchSharedUpdatedAt(config);
      if (serverUpdatedAt) lastRemoteUpdatedAt = serverUpdatedAt;
    } catch (_) {}
  }

  return {
    ok: true,
    conflict: false,
    reason: 'split_granular_saved',
    updatedAt: lastRemoteUpdatedAt,
    operations: operations.map((operation) => operation.type),
  };
}

export function getLastRemoteUpdatedAt() {
  return lastRemoteUpdatedAt;
}

export function setLastRemoteUpdatedAt(value) {
  lastRemoteUpdatedAt = value || null;
}

// Heartbeat barato: lê só o `updated_at` mais recente de cada tabela (1 linha,
// 1 coluna) para detectar SE algo mudou no servidor — sem reler a tabela inteira
// de jogadores a cada ciclo. O poll usa isto e só faz a leitura completa quando
// o timestamp avança. Retorna { ok, status, updatedAt }; em falha de auth
// (401/403) propaga o status para o chamador decidir refresh/logout.
export async function fetchRemoteHeartbeat(activeGameKey = null) {
  const config = getConfig();
  if (!isSupabaseConfigured()) return { ok: false, status: null, updatedAt: null };
  const requests = [
    requestJson(config, tableUrl(config, SPLIT_TABLES.players, 'select=updated_at&order=updated_at.desc&limit=1'), { method: 'GET' }),
    requestJson(config, tableUrl(config, SPLIT_TABLES.game, 'key=eq.default&select=updated_at&limit=1'), { method: 'GET' }),
    requestJson(config, tableUrl(config, SPLIT_TABLES.meta, 'key=eq.default&select=updated_at&limit=1'), { method: 'GET' }),
  ];
  // Presença só do jogo ATIVO — espelha o que loadSplitState usa para compor o
  // lastRemoteUpdatedAt. Filtrar por outro jogo (ou todos) faria o heartbeat
  // divergir do baseline e disparar full-load a cada ciclo.
  if (activeGameKey) {
    requests.push(requestJson(config, tableUrl(config, SPLIT_TABLES.presence, `game_key=eq.${encodeURIComponent(activeGameKey)}&select=updated_at&order=updated_at.desc&limit=1`), { method: 'GET' }));
  }
  const reqs = await Promise.all(requests);
  const bad = reqs.find((r) => !r.ok);
  if (bad) return { ok: false, status: bad.status || null, updatedAt: null };
  const values = [];
  for (const r of reqs) {
    const row = Array.isArray(r.data) ? r.data[0] : null;
    if (row?.updated_at) values.push(row.updated_at);
  }
  values.sort();
  return { ok: true, status: 200, updatedAt: values.length ? values[values.length - 1] : null };
}

export async function loadRemoteState() {
  const config = getConfig();

  if (!isSupabaseConfigured()) {
    return { ok: false, state: null, updatedAt: null, reason: 'supabase_not_configured' };
  }

  try {
    return await loadSplitState(config);
  } catch (error) {
    console.warn('[storage.supabase] load failed; presence_confirmations single source is unavailable', error);
    return { ok: false, state: null, updatedAt: null, reason: 'single_source_load_exception' };
  }
}

export async function saveRemoteState(state, _options = {}) {
  const operationGuard = assertCriticalOperationAllowed('salvar estado remoto');
  if (!operationGuard.ok) {
    console.warn('[storage.supabase] blocked remote save', operationGuard);
    return { ok: false, conflict: false, reason: operationGuard.reason, message: operationGuard.message };
  }

  const config = getConfig();

  if (!isSupabaseConfigured()) {
    return { ok: false, conflict: false, reason: 'supabase_not_configured' };
  }

  try {
    return await saveSplitState(config, state);
  } catch (error) {
    console.warn('[storage.supabase] save failed; local storage remains available', error);
    return { ok: false, conflict: false, reason: 'single_source_save_exception' };
  }
}




export async function savePlayerAccessLink({ playerId, authUserId, email, phone }) {
  const operationGuard = assertCriticalOperationAllowed('vincular acesso de jogador');
  if (!operationGuard.ok) {
    return { ok: false, reason: operationGuard.reason, message: operationGuard.message };
  }

  const config = getConfig();

  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'supabase_not_configured' };
  }

  const normalizedId = String(playerId || '').trim();
  const normalizedAuthUserId = String(authUserId || '').trim();
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  const normalizedEmail = String(email || (normalizedPhone ? `${normalizedPhone}@harmonia.app` : '')).trim();

  if (!normalizedId || !normalizedAuthUserId || !normalizedPhone || !normalizedEmail) {
    return { ok: false, reason: 'missing_required_access_link_fields' };
  }

  const currentResult = await requestJson(
    config,
    tableUrl(config, SPLIT_TABLES.players, `id=eq.${encodeURIComponent(normalizedId)}&select=id,auth_user_id,is_admin,data,updated_at&limit=1`),
    { method: 'GET' }
  );

  if (!currentResult.ok) {
    return { ok: false, reason: `load_player_failed_${currentResult.status}`, status: currentResult.status, body: currentResult.body };
  }

  const row = Array.isArray(currentResult.data) ? currentResult.data[0] : null;

  if (!row) {
    return { ok: false, reason: 'player_not_found' };
  }

  const now = new Date().toISOString();
  const currentData = row?.data && typeof row.data === 'object' ? row.data : {};
  const nextData = {
    ...currentData,
    id: normalizedId,
    auth_user_id: normalizedAuthUserId,
    email: normalizedEmail,
    login_phone: normalizedPhone,
    phone: normalizedPhone,
  };

  const patchResult = await requestJson(
    config,
    tableUrl(config, SPLIT_TABLES.players, `id=eq.${encodeURIComponent(normalizedId)}&select=id,auth_user_id,is_admin,data,updated_at`),
    {
      method: 'PATCH',
      prefer: 'return=representation',
      body: JSON.stringify({
        auth_user_id: normalizedAuthUserId,
        data: nextData,
        updated_at: now,
      }),
    }
  );

  if (!patchResult.ok) {
    return { ok: false, reason: `save_player_access_link_failed_${patchResult.status}`, status: patchResult.status, body: patchResult.body };
  }

  let savedRow = Array.isArray(patchResult.data) ? patchResult.data[0] : null;
  let savedData = savedRow?.data && typeof savedRow.data === 'object' ? savedRow.data : {};

  const representationLooksPersisted =
    String(savedRow?.auth_user_id || '') === normalizedAuthUserId &&
    String(savedData.auth_user_id || '') === normalizedAuthUserId;

  if (!representationLooksPersisted) {
    const verifyResult = await requestJson(
      config,
      tableUrl(config, SPLIT_TABLES.players, `id=eq.${encodeURIComponent(normalizedId)}&select=id,auth_user_id,is_admin,data,updated_at&limit=1`),
      { method: 'GET' }
    );

    if (!verifyResult.ok) {
      return {
        ok: false,
        reason: `save_player_access_link_verify_failed_${verifyResult.status}`,
        status: verifyResult.status,
        body: verifyResult.body,
      };
    }

    savedRow = Array.isArray(verifyResult.data) ? verifyResult.data[0] : null;
    savedData = savedRow?.data && typeof savedRow.data === 'object' ? savedRow.data : {};
  }

  if (String(savedRow?.auth_user_id || '') !== normalizedAuthUserId || String(savedData.auth_user_id || '') !== normalizedAuthUserId) {
    return {
      ok: false,
      reason: 'save_player_access_link_did_not_persist',
      status: patchResult.status,
      patchBody: JSON.stringify(patchResult.data || null),
      savedAuthUserId: savedRow?.auth_user_id || null,
      savedDataAuthUserId: savedData.auth_user_id || null,
    };
  }

  if (lastSplitSnapshot?.players) {
    lastSplitSnapshot.players = lastSplitSnapshot.players.map((player) => (
      String(player?.id) === normalizedId
        ? {
            ...player,
            auth_user_id: normalizedAuthUserId,
            email: normalizedEmail,
            login_phone: normalizedPhone,
            phone: normalizedPhone,
          }
        : player
    ));
    lastSplitFingerprint = snapshotFingerprint(lastSplitSnapshot);
  }
  lastRemoteUpdatedAt = savedRow?.updated_at || now;

  return { ok: true, reason: 'player_access_link_saved_on_player_row', updatedAt: lastRemoteUpdatedAt };
}

export async function savePlayerLogicalDelete(playerId) {
  const operationGuard = assertCriticalOperationAllowed('excluir jogador');
  if (!operationGuard.ok) {
    return { ok: false, reason: operationGuard.reason, message: operationGuard.message };
  }

  const config = getConfig();

  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'supabase_not_configured' };
  }

  const normalizedId = String(playerId || '').trim();

  if (!normalizedId) {
    return { ok: false, reason: 'missing_player_id' };
  }

  const currentResult = await requestJson(
    config,
    tableUrl(config, SPLIT_TABLES.players, `id=eq.${encodeURIComponent(normalizedId)}&select=id,auth_user_id,is_admin,data,updated_at&limit=1`),
    { method: 'GET' }
  );

  if (!currentResult.ok) {
    return { ok: false, reason: `load_player_failed_${currentResult.status}`, status: currentResult.status, body: currentResult.body };
  }

  const row = Array.isArray(currentResult.data) ? currentResult.data[0] : null;

  if (!row) {
    return { ok: false, reason: 'player_not_found' };
  }

  const now = new Date().toISOString();
  const currentData = row?.data && typeof row.data === 'object' ? row.data : {};
  const nextData = {
    ...currentData,
    id: normalizedId,
    active: false,
    deleted: true,
    deleted_at: now,
    deleted_by_auth_user_id: getCurrentAuthUserId(),
  };

  const patchResult = await requestJson(
    config,
    tableUrl(config, SPLIT_TABLES.players, `id=eq.${encodeURIComponent(normalizedId)}&select=id,auth_user_id,is_admin,data,updated_at`),
    {
      method: 'PATCH',
      prefer: 'return=representation',
      body: JSON.stringify({
        data: nextData,
        updated_at: now,
      }),
    }
  );

  if (!patchResult.ok) {
    return { ok: false, reason: `save_player_logical_delete_failed_${patchResult.status}`, status: patchResult.status, body: patchResult.body };
  }

  const savedRow = Array.isArray(patchResult.data) ? patchResult.data[0] : null;
  const savedData = savedRow?.data && typeof savedRow.data === 'object' ? savedRow.data : null;

  if (!savedData || savedData.active !== false || savedData.deleted !== true) {
    return {
      ok: false,
      reason: 'save_player_logical_delete_did_not_persist',
      status: patchResult.status,
      body: JSON.stringify(patchResult.data || null),
    };
  }

  if (lastSplitSnapshot?.players) {
    lastSplitSnapshot.players = lastSplitSnapshot.players.filter((player) => String(player?.id) !== normalizedId);
    lastSplitFingerprint = snapshotFingerprint(lastSplitSnapshot);
  }
  lastRemoteUpdatedAt = savedRow?.updated_at || now;

  return { ok: true, reason: 'player_logical_delete_saved_on_player_row', updatedAt: lastRemoteUpdatedAt };
}

export async function savePlayerDeletionTombstone(playerId, phone = '') {
  const config = getConfig();

  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'supabase_not_configured' };
  }

  const normalizedId = String(playerId || '').trim();
  const normalizedPhone = String(phone || '').replace(/\D/g, '');

  if (!normalizedId) {
    return { ok: false, reason: 'missing_player_id' };
  }

  const currentResult = await requestJson(
    config,
    tableUrl(config, SPLIT_TABLES.meta, 'key=eq.default&select=key,data,updated_at&limit=1'),
    { method: 'GET' }
  );

  if (!currentResult.ok) {
    return { ok: false, reason: `load_meta_failed_${currentResult.status}`, status: currentResult.status, body: currentResult.body };
  }

  const row = Array.isArray(currentResult.data) ? currentResult.data[0] : null;
  const currentData = row?.data && typeof row.data === 'object' ? row.data : {};
  const deletedIds = Array.isArray(currentData.deleted_player_ids) ? currentData.deleted_player_ids.map((id) => String(id)) : [];
  const deletedPhones = Array.isArray(currentData.deleted_player_phones) ? currentData.deleted_player_phones.map((value) => String(value || '').replace(/\D/g, '')).filter(Boolean) : [];

  const nextData = {
    ...currentData,
    deleted_player_ids: [...new Set([...deletedIds, normalizedId])],
    deleted_player_phones: [...new Set([...deletedPhones, normalizedPhone].filter(Boolean))],
  };

  const now = new Date().toISOString();

  // v1.70.21: gravar tombstone por PATCH direto no app_meta existente.
  // O POST/upsert genérico pode ser bloqueado por políticas/triggers de insert
  // e mascarar a exclusão lógica. Aqui a operação é explicitamente UPDATE.
  const patchResult = await requestJson(
    config,
    tableUrl(config, SPLIT_TABLES.meta, 'key=eq.default&select=key,data,updated_at'),
    {
      method: 'PATCH',
      prefer: 'return=representation',
      body: JSON.stringify({
        data: nextData,
        updated_at: now,
      }),
    }
  );

  if (!patchResult.ok) {
    return { ok: false, reason: `save_meta_patch_failed_${patchResult.status}`, status: patchResult.status, body: patchResult.body };
  }

  const savedRow = Array.isArray(patchResult.data) ? patchResult.data[0] : null;
  const savedIds = Array.isArray(savedRow?.data?.deleted_player_ids)
    ? savedRow.data.deleted_player_ids.map((id) => String(id))
    : [];

  if (!savedIds.includes(normalizedId)) {
    return {
      ok: false,
      reason: 'save_meta_patch_did_not_persist_tombstone',
      status: patchResult.status,
      body: JSON.stringify(patchResult.data || null),
    };
  }

  if (lastSplitSnapshot?.meta) {
    lastSplitSnapshot.meta = cloneJson(nextData);
    lastSplitFingerprint = snapshotFingerprint(lastSplitSnapshot);
  }
  lastRemoteUpdatedAt = savedRow?.updated_at || now;

  return { ok: true, reason: 'player_deletion_tombstone_saved_by_patch', updatedAt: lastRemoteUpdatedAt };
}

export async function restoreDeletedPlayerByPhone(phone, updates = {}) {
  const operationGuard = assertCriticalOperationAllowed('restaurar jogador excluído');
  if (!operationGuard.ok) {
    return { ok: false, reason: operationGuard.reason, message: operationGuard.message };
  }

  const config = getConfig();

  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'supabase_not_configured' };
  }

  const normalizedPhone = String(phone || '').replace(/\D/g, '');

  if (!normalizedPhone) {
    return { ok: false, reason: 'missing_phone' };
  }

  const [playersResult, metaResult] = await Promise.all([
    requestJson(
      config,
      tableUrl(config, SPLIT_TABLES.players, `data->>phone=eq.${encodeURIComponent(normalizedPhone)}&select=id,auth_user_id,is_admin,data,updated_at`),
      { method: 'GET' }
    ),
    requestJson(
      config,
      tableUrl(config, SPLIT_TABLES.meta, 'key=eq.default&select=key,data,updated_at&limit=1'),
      { method: 'GET' }
    ),
  ]);

  if (!playersResult.ok) {
    return { ok: false, reason: `load_player_by_phone_failed_${playersResult.status}`, status: playersResult.status, body: playersResult.body };
  }

  if (!metaResult.ok) {
    return { ok: false, reason: `load_meta_failed_${metaResult.status}`, status: metaResult.status, body: metaResult.body };
  }

  const metaRow = Array.isArray(metaResult.data) ? metaResult.data[0] : null;
  const currentMeta = metaRow?.data && typeof metaRow.data === 'object' ? metaRow.data : {};
  const deletedIds = normalizeDeletedPlayerIds(currentMeta);
  const deletedPhones = normalizeDeletedPlayerPhones(currentMeta);

  const rows = Array.isArray(playersResult.data) ? playersResult.data : [];
  const deletedRows = rows.filter((row) => {
    const data = row?.data && typeof row.data === 'object' ? row.data : {};
    const rowPhone = String(data.phone || '').replace(/\D/g, '');
    return (
      rowPhone === normalizedPhone &&
      (
        data.active === false ||
        data.deleted === true ||
        !!data.deleted_at ||
        deletedIds.includes(String(row.id || data.id || '')) ||
        deletedPhones.includes(normalizedPhone)
      )
    );
  });

  const row = deletedRows[0] || null;

  if (!row) {
    return { ok: false, reason: 'deleted_player_not_found_for_phone' };
  }

  const playerId = String(row.id || row.data?.id || '').trim();
  const currentData = row?.data && typeof row.data === 'object' ? row.data : {};
  const now = new Date().toISOString();
  const nextData = {
    ...currentData,
    ...updates,
    id: playerId,
    phone: normalizedPhone,
    active: true,
    deleted: false,
  };

  delete nextData.deleted_at;
  delete nextData.deleted_by_auth_user_id;

  const nextAuthUserId = nextData.auth_user_id || row.auth_user_id || null;
  const nextIsAdmin = nextData.is_admin === true || row.is_admin === true;

  if (nextAuthUserId) {
    nextData.auth_user_id = nextAuthUserId;
  }
  nextData.is_admin = nextIsAdmin;

  const patchPlayerResult = await requestJson(
    config,
    tableUrl(config, SPLIT_TABLES.players, `id=eq.${encodeURIComponent(playerId)}&select=id,auth_user_id,is_admin,data,updated_at`),
    {
      method: 'PATCH',
      prefer: 'return=representation',
      body: JSON.stringify({
        auth_user_id: nextAuthUserId,
        is_admin: nextIsAdmin,
        data: nextData,
        updated_at: now,
      }),
    }
  );

  if (!patchPlayerResult.ok) {
    return { ok: false, reason: `restore_player_failed_${patchPlayerResult.status}`, status: patchPlayerResult.status, body: patchPlayerResult.body };
  }

  const nextMeta = {
    ...currentMeta,
    deleted_player_ids: deletedIds.filter((id) => id !== playerId),
    deleted_player_phones: deletedPhones.filter((value) => value !== normalizedPhone),
  };

  const patchMetaResult = await requestJson(
    config,
    tableUrl(config, SPLIT_TABLES.meta, 'key=eq.default&select=key,data,updated_at'),
    {
      method: 'PATCH',
      prefer: 'return=representation',
      body: JSON.stringify({
        data: nextMeta,
        updated_at: now,
      }),
    }
  );

  if (!patchMetaResult.ok) {
    return { ok: false, reason: `restore_meta_tombstone_cleanup_failed_${patchMetaResult.status}`, status: patchMetaResult.status, body: patchMetaResult.body };
  }

  const savedRow = Array.isArray(patchPlayerResult.data) ? patchPlayerResult.data[0] : null;
  const savedPlayer = savedRow ? {
    ...(savedRow.data || {}),
    id: savedRow.id || savedRow.data?.id,
    auth_user_id: savedRow.auth_user_id || savedRow.data?.auth_user_id || null,
    is_admin: savedRow.is_admin === true,
  } : { ...nextData, auth_user_id: nextAuthUserId, is_admin: nextIsAdmin };

  if (lastSplitSnapshot) {
    lastSplitSnapshot.meta = cloneJson(nextMeta);
    const currentPlayers = Array.isArray(lastSplitSnapshot.players) ? lastSplitSnapshot.players : [];
    lastSplitSnapshot.players = [
      ...currentPlayers.filter((player) => String(player?.id) !== playerId),
      savedPlayer,
    ];
    lastSplitFingerprint = snapshotFingerprint(lastSplitSnapshot);
  }
  lastRemoteUpdatedAt = now;

  return { ok: true, reason: 'deleted_player_restored_by_phone', player: savedPlayer, updatedAt: now };
}

export function getSupabaseMeta() {
  const config = getConfig();
  return {
    enabled: !!config.enabled,
    configured: isSupabaseConfigured(),
    url: config.url ? trimTrailingSlash(config.url) : '',
    table: config.stateTable,
    key: config.stateKey,
    lastRemoteUpdatedAt,
    splitTables: SPLIT_TABLES,
    granularWrites: true,
    presenceNormalization: true,
    presenceReadCutover: true,
    presenceSingleSource: true,
    presenceWriteCutover: true,
    presenceCleanup: true,
    presenceGameKeyScoped: true,
    gameCycleResetFix: true,
  };
}
