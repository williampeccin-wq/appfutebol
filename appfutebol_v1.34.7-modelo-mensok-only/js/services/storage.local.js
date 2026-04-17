

// WRITE SAFETY v1.24.4
function __isValidStateForWrite(state) {
  return state && typeof state === "object" && Array.isArray(state.players);
}
import { validateAndRepairState, sanitizeUi } from '../domain/state.guard.js';

const STORAGE_KEY = 'harmonia_data';

const defaultSeed = {
  session: {
    playerId: null,
  },
  players: [
    {
      id: 'p1',
      name: 'William',
      phone: '48991520230',
      birthDate: '1988-01-15',
      role: 'jogador',
      position: 'meia',
      mens_ok: true,
      is_admin: true,
      password_hash: '123456',
    },
    {
      id: 'p2',
      name: 'André',
      phone: '48999999999',
      birthDate: '1991-03-12',
      role: 'jogador',
      position: 'zag',
      mens_ok: true,
      is_admin: false,
      password_hash: '123456',
    },
    {
      id: 'p3',
      name: 'Lucas',
      phone: '48988888888',
      birthDate: '1994-07-25',
      role: 'jogador',
      position: 'atk',
      mens_ok: false,
      is_admin: false,
      password_hash: '123456',
    },
    {
      id: 'p4',
      name: 'Marcelo',
      phone: '48977777777',
      birthDate: '1987-10-01',
      role: 'carne',
      position: null,
      mens_ok: false,
      is_admin: false,
      password_hash: '123456',
    },
    {
      id: 'p5',
      name: 'Carlos',
      phone: '48966666666',
      birthDate: '1990-06-20',
      role: 'jogador',
      position: 'meia',
      mens_ok: true,
      is_admin: false,
      password_hash: '123456',
    },
  ],
  game: {
    game_date: '2026-04-01',
    game_time: '20:30',
    max_players: 2,
    mens_expire_date: '2026-04-10',
    open: true,
    sort_result: null,
  },
  confirmations: [
    { player_id: 'p1', confirmed: true, timestamp: '2026-03-29T18:00:00.000Z' },
    { player_id: 'p2', confirmed: true, timestamp: '2026-03-29T18:05:00.000Z' },
    { player_id: 'p3', confirmed: false, timestamp: null },
    { player_id: 'p5', confirmed: false, timestamp: null },
  ],
  championship: {
    id: 'champ-2026-01',
    start_date: '2026-01-08',
    end_date: null,
    closed: false,
    ranking: [
      { player_id: 'p1', points: 14 },
      { player_id: 'p2', points: 11 },
      { player_id: 'p3', points: 8 },
      { player_id: 'p5', points: 6 },
    ],
  },
  carne: [
    { player_id: 'p1', active: true },
    { player_id: 'p4', active: true },
  ],
  notifications: [
    {
      id: 'n1',
      message: 'Jogo confirmado para quarta às 20:30.',
      created_at: '2026-03-29T19:30:00.000Z',
    },
    {
      id: 'n2',
      message: 'Tabela da carne atualizada para a próxima quarta.',
      created_at: '2026-03-28T17:10:00.000Z',
    },
  ],
  ui: {
    currentTab: 'home',
    authMode: 'login',
    authMessage: null,
  },
};

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
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

function dedupePlayers(players) {
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
  const { finance: _legacyFinance, ...safeSource } = source;
  const { deduped, idMap } = dedupePlayers(Array.isArray(safeSource.players) ? safeSource.players : []);

  return {
    ...safeSource,
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
  const { finance: _legacyFinance, ...safeParsed } = parsed || {};

  return {
    ...seed,
    ...safeParsed,
    session: {
      ...seed.session,
      ...(safeParsed.session || {}),
    },
    ui: sanitizeUi(safeParsed.ui, defaultSeed.ui),
    players: Array.isArray(safeParsed.players) ? safeParsed.players : structuredClone(seed.players),
    game: safeParsed.game ? { ...seed.game, ...safeParsed.game } : structuredClone(seed.game),
    confirmations: Array.isArray(safeParsed.confirmations) ? safeParsed.confirmations : structuredClone(seed.confirmations),
    championship: safeParsed.championship
      ? {
          ...seed.championship,
          ...safeParsed.championship,
          ranking: Array.isArray(safeParsed.championship.ranking)
            ? safeParsed.championship.ranking
            : structuredClone(seed.championship.ranking),
        }
      : structuredClone(seed.championship),
    carne: Array.isArray(safeParsed.carne) ? safeParsed.carne : structuredClone(seed.carne),
    notifications: Array.isArray(safeParsed.notifications) ? safeParsed.notifications : structuredClone(seed.notifications),
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
    const normalized = normalizeData(buildMergedData(parsed));
    const repaired = validateAndRepairState(normalized, { defaultSeed });
    const normalizedRaw = JSON.stringify(repaired.state);

    if (repaired.warnings.length) {
      console.warn('[state.guard] Reparos aplicados no load:', repaired.warnings);
    }

    if (normalizedRaw !== raw) {
      localStorage.setItem(STORAGE_KEY, normalizedRaw);
    }

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
