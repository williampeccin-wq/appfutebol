
function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function clone(value) {
  return structuredClone(value);
}

export function sanitizeSession(state) {
  const nextState = clone(state);
  const playerId = nextState.session?.playerId || null;

  if (!playerId) {
    nextState.session = { ...(nextState.session || {}), playerId: null };
    return { state: nextState, warnings: [] };
  }

  const exists = Array.isArray(nextState.players) && nextState.players.some((player) => player?.id === playerId);
  if (exists) {
    return { state: nextState, warnings: [] };
  }

  nextState.session = { ...(nextState.session || {}), playerId: null };
  return {
    state: nextState,
    warnings: [`Sessão removida: playerId inexistente (${playerId}).`],
  };
}

export function dedupePlayers(players, seedPlayers = []) {
  const warnings = [];
  const groups = new Map();
  const seedByPhone = new Map(
    (Array.isArray(seedPlayers) ? seedPlayers : []).map((player) => [normalizePhone(player?.phone), clone(player)])
  );

  for (const player of Array.isArray(players) ? players : []) {
    if (!player || typeof player !== 'object') continue;
    const phone = normalizePhone(player.phone);
    if (!phone) {
      warnings.push(`Player descartado sem telefone válido (${player.id || 'sem-id'}).`);
      continue;
    }

    const normalized = { ...clone(player), phone };
    if (!normalized.password_hash && normalized.password) {
      normalized.password_hash = String(normalized.password);
    }
    delete normalized.password;

    const list = groups.get(phone) || [];
    list.push(normalized);
    groups.set(phone, list);
  }

  const deduped = [];
  const idMap = new Map();

  const scorePlayer = (player) => {
    let score = 0;
    if (player?.password_hash) score += 100;
    if (player?.is_admin) score += 20;
    if (player?.mens_ok) score += 10;
    if (player?.birthDate) score += 5;
    if (player?.position) score += 5;
    if (/^p\d+$/.test(String(player?.id || ''))) score += 5;
    return score;
  };

  for (const [phone, group] of groups.entries()) {
    const preferred = [...group].sort((left, right) => scorePlayer(right) - scorePlayer(left))[0] || null;
    const seedPlayer = seedByPhone.get(phone) || null;

    let canonical = preferred ? clone(preferred) : null;
    if (seedPlayer) {
      canonical = {
        ...clone(seedPlayer),
        ...(preferred || {}),
        id: seedPlayer.id,
        phone: seedPlayer.phone,
        password_hash: preferred?.password_hash || seedPlayer.password_hash,
      };
    }

    if (!canonical) continue;
    delete canonical.password;
    deduped.push(canonical);

    if (group.length > 1) {
      warnings.push(`Duplicidade removida para telefone ${phone}.`);
    }

    for (const item of group) {
      idMap.set(item.id, canonical.id);
    }
    idMap.set(canonical.id, canonical.id);
  }

  for (const seedPlayer of Array.isArray(seedPlayers) ? seedPlayers : []) {
    const phone = normalizePhone(seedPlayer?.phone);
    if (!phone) continue;
    const exists = deduped.some((player) => normalizePhone(player?.phone) === phone);
    if (!exists) {
      deduped.push(clone(seedPlayer));
      idMap.set(seedPlayer.id, seedPlayer.id);
      warnings.push(`Player seed restaurado: ${seedPlayer.name}.`);
    }
  }

  deduped.sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')));

  return { players: deduped, idMap, warnings };
}

export function sanitizeConfirmations(state) {
  const nextState = clone(state);
  const warnings = [];
  const validIds = new Set((Array.isArray(nextState.players) ? nextState.players : []).map((player) => player.id));
  const byPlayer = new Map();

  for (const entry of Array.isArray(nextState.confirmations) ? nextState.confirmations : []) {
    if (!entry || !entry.player_id) continue;
    if (!validIds.has(entry.player_id)) {
      warnings.push(`Confirmação órfã removida (${entry.player_id}).`);
      continue;
    }

    const current = byPlayer.get(entry.player_id);
    if (!current) {
      byPlayer.set(entry.player_id, { ...entry, confirmed: Boolean(entry.confirmed), timestamp: entry.timestamp || null });
      continue;
    }

    const currentTime = Date.parse(current.timestamp || 0) || 0;
    const nextTime = Date.parse(entry.timestamp || 0) || 0;
    if (nextTime >= currentTime) {
      byPlayer.set(entry.player_id, { ...entry, confirmed: Boolean(entry.confirmed), timestamp: entry.timestamp || null });
    }
    warnings.push(`Confirmação duplicada consolidada (${entry.player_id}).`);
  }

  nextState.confirmations = [...byPlayer.values()].sort((left, right) => String(left.player_id).localeCompare(String(right.player_id)));
  return { state: nextState, warnings };
}

export function sanitizeRanking(state) {
  const nextState = clone(state);
  const warnings = [];
  const validIds = new Set((Array.isArray(nextState.players) ? nextState.players : []).map((player) => player.id));
  if (!nextState.championship || !Array.isArray(nextState.championship.ranking)) {
    return { state: nextState, warnings };
  }

  nextState.championship = {
    ...nextState.championship,
    ranking: nextState.championship.ranking.filter((entry) => {
      const keep = entry && validIds.has(entry.player_id);
      if (!keep) warnings.push(`Ranking órfão removido (${entry?.player_id || 'sem-id'}).`);
      return keep;
    }),
  };

  return { state: nextState, warnings };
}

export function sanitizeCarne(state) {
  const nextState = clone(state);
  const warnings = [];
  const validIds = new Set((Array.isArray(nextState.players) ? nextState.players : []).map((player) => player.id));
  nextState.carne = (Array.isArray(nextState.carne) ? nextState.carne : []).filter((entry) => {
    const keep = entry && validIds.has(entry.player_id);
    if (!keep) warnings.push(`Registro de carne órfão removido (${entry?.player_id || 'sem-id'}).`);
    return keep;
  });
  return { state: nextState, warnings };
}

export function sanitizeUi(ui, defaultUi = { currentTab: 'home', authMode: 'login', authMessage: null }) {
  return {
    ...clone(defaultUi),
    ...(ui || {}),
    authMessage: null,
  };
}

export function validateAndRepairState(state, options = {}) {
  const warnings = [];
  const defaultSeed = options.defaultSeed || {};
  const defaultUi = defaultSeed.ui || { currentTab: 'home', authMode: 'login', authMessage: null };

  let nextState = clone(state || {});
  nextState.session = { playerId: null, ...(nextState.session || {}) };
  nextState.players = Array.isArray(nextState.players) ? nextState.players : [];
  nextState.confirmations = Array.isArray(nextState.confirmations) ? nextState.confirmations : [];
  nextState.carne = Array.isArray(nextState.carne) ? nextState.carne : [];
  nextState.notifications = Array.isArray(nextState.notifications) ? nextState.notifications : [];
  nextState.ui = sanitizeUi(nextState.ui, defaultUi);

  const deduped = dedupePlayers(nextState.players, defaultSeed.players || []);
  nextState.players = deduped.players;
  warnings.push(...deduped.warnings);

  const mapId = (id) => deduped.idMap.get(id) || id;
  nextState.session.playerId = nextState.session.playerId ? mapId(nextState.session.playerId) : null;
  nextState.confirmations = nextState.confirmations.map((entry) => ({ ...entry, player_id: mapId(entry.player_id) }));
  if (nextState.championship?.ranking) {
    nextState.championship = {
      ...nextState.championship,
      ranking: nextState.championship.ranking.map((entry) => ({ ...entry, player_id: mapId(entry.player_id) })),
    };
  }
  nextState.carne = nextState.carne.map((entry) => ({ ...entry, player_id: mapId(entry.player_id) }));

  const sessionResult = sanitizeSession(nextState);
  nextState = sessionResult.state;
  warnings.push(...sessionResult.warnings);

  const confirmationsResult = sanitizeConfirmations(nextState);
  nextState = confirmationsResult.state;
  warnings.push(...confirmationsResult.warnings);

  const rankingResult = sanitizeRanking(nextState);
  nextState = rankingResult.state;
  warnings.push(...rankingResult.warnings);

  const carneResult = sanitizeCarne(nextState);
  nextState = carneResult.state;
  warnings.push(...carneResult.warnings);

  return {
    state: nextState,
    warnings: [...new Set(warnings)],
  };
}
