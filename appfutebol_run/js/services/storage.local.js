

// WRITE SAFETY v1.24.4
function __isValidStateForWrite(state) {
  return state && typeof state === "object" && Array.isArray(state.players);
}
import { validateAndRepairState, sanitizeUi } from '../domain/state.guard.js';

const STORAGE_KEY = 'harmonia_browser_state';
const LEGACY_STORAGE_KEY = 'harmonia_data';

const defaultSeed = {
  session: {
    playerId: null,
    authUserId: null,
  },
  players: [],
  game: {
    game_date: '2026-05-06',
    game_time: '20:30',
    max_players: 18,
    mens_expire_date: '2026-05-10',
    open: true,
    sort_result: null,
  },
  confirmations: [],
  championship: {
    id: 'champ-2026-01',
    start_date: '2026-01-08',
    end_date: null,
    closed: false,
    ranking: [],
  },
  carne: [],
  notifications: [],
  ui: {
    currentTab: 'home',
    authMode: 'login',
    authMessage: null,
  },
};

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeDeletedPlayers(data) {
  const ids = Array.isArray(data?.deleted_player_ids) ? data.deleted_player_ids.map((v) => String(v)) : [];
  const phones = Array.isArray(data?.deleted_player_phones) ? data.deleted_player_phones.map((v) => normalizePhone(v)).filter(Boolean) : [];
  return { ids: [...new Set(ids)], phones: [...new Set(phones)] };
}

function normalizePlayer(player) {
  if (!player || typeof player !== 'object') {
    return null;
  }

  const nextPlayer = { ...player };
  const normalizedPhone = normalizePhone(nextPlayer.phone);

  if (!normalizedPhone) {
    return null;
  }

  nextPlayer.phone = normalizedPhone;

  if (!nextPlayer.password_hash && nextPlayer.password) {
    nextPlayer.password_hash = String(nextPlayer.password);
  }

  delete nextPlayer.password;

  return nextPlayer;
}

function scorePlayer(player) {
  let score = 0;

  if (player?.password_hash) score += 100;
  if (player?.is_admin) score += 20;
  if (player?.mens_ok) score += 10;
  if (player?.birthDate) score += 5;
  if (player?.position) score += 5;
  if (/^p\d+$/.test(String(player?.id || ''))) score += 5;

  return score;
}

function choosePreferredPlayer(players) {
  return [...players].sort((left, right) => scorePlayer(right) - scorePlayer(left))[0] || null;
}

function dedupePlayers(players, tombstones = { ids: [], phones: [] }) {
  const seedByPhone = new Map(defaultSeed.players.map((player) => [normalizePhone(player.phone), player]));
  const groups = new Map();

  for (const player of players) {
    const normalized = normalizePlayer(player);
    if (!normalized) {
      continue;
    }

    const phone = normalized.phone;
    const currentGroup = groups.get(phone) || [];
    currentGroup.push(normalized);
    groups.set(phone, currentGroup);
  }

  const deduped = [];
  const idMap = new Map();

  for (const [phone, group] of groups.entries()) {
    const seedPlayer = seedByPhone.get(phone) || null;
    const preferred = choosePreferredPlayer(group);

    let canonical;
    if (seedPlayer) {
      canonical = {
        ...structuredClone(seedPlayer),
        ...preferred,
        id: seedPlayer.id,
        phone: seedPlayer.phone,
        password_hash: preferred?.password_hash || seedPlayer.password_hash,
      };
    } else {
      canonical = { ...preferred, phone };
    }

    delete canonical.password;
    deduped.push(canonical);

    for (const player of group) {
      idMap.set(player.id, canonical.id);
    }
  }

  for (const seedPlayer of defaultSeed.players) {
    if (tombstones.ids.includes(String(seedPlayer.id)) || tombstones.phones.includes(normalizePhone(seedPlayer.phone))) {
      continue;
    }
    const phone = normalizePhone(seedPlayer.phone);
    const exists = deduped.some((player) => normalizePhone(player.phone) === phone);
    if (!exists) {
      deduped.push(structuredClone(seedPlayer));
      idMap.set(seedPlayer.id, seedPlayer.id);
    }
  }

  deduped.sort((left, right) => String(left.id || '').localeCompare(String(right.id || '')));

  return { deduped, idMap };
}

function mapPlayerId(id, idMap) {
  return idMap.get(id) || id;
}


function normalizeData(data) {
  const source = data && typeof data === 'object' ? data : {};
  const tombstones = normalizeDeletedPlayers(source);
  const { deduped, idMap } = dedupePlayers(Array.isArray(source.players) ? source.players : [], tombstones);

  return {
    ...source,
    session: {
      ...defaultSeed.session,
      ...(source.session || {}),
      playerId: source.session?.playerId ? mapPlayerId(source.session.playerId, idMap) : null,
    },
    players: deduped,
    game: source.game ? { ...defaultSeed.game, ...source.game } : structuredClone(defaultSeed.game),
    confirmations: Array.isArray(source.confirmations)
      ? source.confirmations.map((entry) => ({
          ...entry,
          player_id: mapPlayerId(entry.player_id, idMap),
        }))
      : structuredClone(defaultSeed.confirmations),
    championship: source.championship
      ? {
          ...structuredClone(defaultSeed.championship),
          ...source.championship,
          ranking: Array.isArray(source.championship.ranking)
            ? source.championship.ranking.map((entry) => ({
                ...entry,
                player_id: mapPlayerId(entry.player_id, idMap),
              }))
            : structuredClone(defaultSeed.championship.ranking),
        }
      : structuredClone(defaultSeed.championship),
    carne: Array.isArray(source.carne)
      ? source.carne.map((entry) => ({
          ...entry,
          player_id: mapPlayerId(entry.player_id, idMap),
        }))
      : structuredClone(defaultSeed.carne),
    notifications: Array.isArray(source.notifications)
      ? source.notifications
      : structuredClone(defaultSeed.notifications),
    ui: sanitizeUi(source.ui, defaultSeed.ui),
  };
}

function buildMergedData(parsed) {
  const seed = structuredClone(defaultSeed);

  return {
    ...seed,
    ...parsed,
    session: {
      ...seed.session,
      ...(parsed.session || {}),
    },
    ui: sanitizeUi(parsed.ui, defaultSeed.ui),
    players: Array.isArray(parsed.players) ? parsed.players : structuredClone(seed.players),
    game: parsed.game ? { ...seed.game, ...parsed.game } : structuredClone(seed.game),
    confirmations: Array.isArray(parsed.confirmations) ? parsed.confirmations : structuredClone(seed.confirmations),
    championship: parsed.championship
      ? {
          ...seed.championship,
          ...parsed.championship,
          ranking: Array.isArray(parsed.championship.ranking)
            ? parsed.championship.ranking
            : structuredClone(seed.championship.ranking),
        }
      : structuredClone(seed.championship),
    carne: Array.isArray(parsed.carne) ? parsed.carne : structuredClone(seed.carne),
    notifications: Array.isArray(parsed.notifications) ? parsed.notifications : structuredClone(seed.notifications),
  };
}

export function loadLocalState() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    const seed = validateAndRepairState(normalizeData(structuredClone(defaultSeed)), { defaultSeed }).state;
    if (__isValidStateForWrite(seed)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  } else {
    console.warn("[storage.local] blocked invalid seed write");
  }
    return seed;
  }

  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeData(buildMergedData({
      session: parsed?.session || {},
      ui: parsed?.ui || {},
    }));
    const repaired = validateAndRepairState(normalized, { defaultSeed });
    const normalizedRaw = JSON.stringify(repaired.state);

    if (repaired.warnings.length) {
      console.warn('[state.guard] Reparos aplicados no load:', repaired.warnings);
    }

    if (normalizedRaw !== raw) {
      localStorage.setItem(STORAGE_KEY, normalizedRaw);
    }

    localStorage.removeItem(LEGACY_STORAGE_KEY);

    return repaired.state;
  } catch (error) {
    console.warn('Falha ao ler dados locais. Seed padrão foi restaurada.', error);
    const seed = validateAndRepairState(normalizeData(structuredClone(defaultSeed)), { defaultSeed }).state;
    if (__isValidStateForWrite(seed)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  } else {
    console.warn("[storage.local] blocked invalid seed write");
  }
    return seed;
  }
}

export function saveLocalState(data) {
  const normalized = normalizeData(data);
  const repaired = validateAndRepairState(normalized, { defaultSeed });

  if (repaired.warnings.length) {
    console.warn('[state.guard] Reparos aplicados no save:', repaired.warnings);
  }

  if (__isValidStateForWrite(repaired.state)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(repaired.state));
  } else {
    console.warn("[storage.local] blocked invalid repaired.state write");
  }
}

export function resetLocalState() {
  const seed = normalizeData(structuredClone(defaultSeed));
  if (__isValidStateForWrite(seed)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  } else {
    console.warn("[storage.local] blocked invalid seed write");
  }
  return seed;
}


export const load = loadLocalState;
export const save = saveLocalState;
export const reset = resetLocalState;
