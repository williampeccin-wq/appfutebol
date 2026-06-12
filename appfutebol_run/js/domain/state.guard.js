import { getMensalidadeMode, MENSALIDADE_MODES } from './rules.engine.js';

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function clone(value) {
  return structuredClone(value);
}

function normalizeDeletedPlayers(state) {
  const ids = Array.isArray(state?.deleted_player_ids) ? state.deleted_player_ids.map((v) => String(v)) : [];
  const phones = Array.isArray(state?.deleted_player_phones) ? state.deleted_player_phones.map((v) => normalizePhone(v)).filter(Boolean) : [];
  return { ids: [...new Set(ids)], phones: [...new Set(phones)] };
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

export function dedupePlayers(players, seedPlayers = [], tombstones = { ids: [], phones: [] }) {
  const warnings = [];
  const groups = new Map();
  const seedByPhone = new Map(
    (Array.isArray(seedPlayers) ? seedPlayers : []).map((player) => [normalizePhone(player?.phone), clone(player)])
  );

  for (const player of Array.isArray(players) ? players : []) {
    if (!player || typeof player !== 'object') continue;
    const phone = normalizePhone(player.phone);
    if (tombstones.ids.includes(String(player.id)) || tombstones.phones.includes(phone)) {
      warnings.push(`Player removido explicitamente ignorado (${player.id || phone}).`);
      continue;
    }
    if (!phone) {
      warnings.push(`Player descartado sem telefone válido (${player.id || 'sem-id'}).`);
      continue;
    }

    const normalized = { ...clone(player), phone };
    if (!normalized.password_hash && normalized.password) {
      normalized.password_hash = String(normalized.password);
    }
    delete normalized.password;

    // Agrupa por telefone E nome. Antes era só por telefone: dois cadastros
    // DISTINTOS com o mesmo telefone (família, placeholder repetido, erro de
    // digitação) eram fundidos num só, e as confirmações/pontos do eliminado
    // migravam para o outro — perda silenciosa de jogador. Agora só funde quem
    // tem o MESMO telefone e o MESMO nome (duplicata real).
    const nameKey = String(player.name || '').trim().toLowerCase();
    const groupKey = `${phone}|${nameKey}`;
    const list = groups.get(groupKey) || [];
    list.push(normalized);
    groups.set(groupKey, list);
  }

  // Telefones compartilhados por nomes distintos: mantidos separados, mas avisa.
  const namesByPhone = new Map();
  for (const groupKey of groups.keys()) {
    const sep = groupKey.indexOf('|');
    const phone = groupKey.slice(0, sep);
    const set = namesByPhone.get(phone) || new Set();
    set.add(groupKey.slice(sep + 1));
    namesByPhone.set(phone, set);
  }
  for (const [phone, names] of namesByPhone.entries()) {
    if (names.size > 1) {
      warnings.push(`Telefone ${phone} compartilhado por ${names.size} nomes distintos — mantidos separados.`);
    }
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

  for (const [, group] of groups.entries()) {
    const phone = group[0]?.phone || '';
    const preferred = [...group].sort((left, right) => scorePlayer(right) - scorePlayer(left))[0] || null;
    // Seed só é aplicado quando aquele telefone tem um ÚNICO nome (sem ambiguidade).
    const seedPlayer = (namesByPhone.get(phone)?.size === 1) ? (seedByPhone.get(phone) || null) : null;

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
    if (tombstones.ids.includes(String(seedPlayer?.id)) || tombstones.phones.includes(normalizePhone(seedPlayer?.phone))) {
      continue;
    }
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
    const normalizedEntry = {
      ...entry,
      confirmed: Boolean(entry.confirmed),
      status: entry.status || (entry.confirmed ? 'confirmed' : 'cancelled'),
      timestamp: entry.timestamp || entry.waitlisted_at || entry.confirmed_at || entry.cancelled_at || null,
      waitlisted_at: entry.waitlisted_at || null,
      waitlist_position: entry.waitlist_position || null,
    };

    if (!current) {
      byPlayer.set(entry.player_id, normalizedEntry);
      continue;
    }

    const currentTime = Date.parse(current.timestamp || current.waitlisted_at || 0) || 0;
    const nextTime = Date.parse(normalizedEntry.timestamp || normalizedEntry.waitlisted_at || 0) || 0;
    if (nextTime >= currentTime) {
      byPlayer.set(entry.player_id, normalizedEntry);
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
  const validIds = new Set((Array.isArray(nextState.players) ? nextState.players : []).map((player) => String(player.id)));

  nextState.carne = (Array.isArray(nextState.carne) ? nextState.carne : []).filter((entry) => {
    if (!entry || typeof entry !== 'object') {
      warnings.push('Registro de carne inválido removido.');
      return false;
    }

    if (entry.type === 'carne_schedule') {
      const keep = validIds.has(String(entry.player1_id || '')) && validIds.has(String(entry.player2_id || ''));
      if (!keep) warnings.push(`Dupla de carne órfã removida (${entry.id || 'sem-id'}).`);
      return keep;
    }

    const keep = validIds.has(String(entry.player_id || ''));
    if (!keep) warnings.push(`Registro de carne órfão removido (${entry?.player_id || 'sem-id'}).`);
    return keep;
  });

  return { state: nextState, warnings };
}



function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPlayerIdFromDrawEntry(entry) {
  return entry && typeof entry === 'object' ? entry.id : entry;
}

export function enforceFinancialPresenceConsistency(state) {
  const nextState = clone(state || {});
  const warnings = [];
  // Remoção automática de inadimplente confirmado SÓ no "Bloqueio total".
  // Nos modos 'none' e 'partial' ninguém é removido por mensalidade.
  if (getMensalidadeMode(nextState.settings) !== MENSALIDADE_MODES.TOTAL) {
    return { state: nextState, warnings };
  }
  const players = Array.isArray(nextState.players) ? nextState.players : [];
  // Vencimento da mensalidade é global (settings), com fallback ao valor legado por-jogo.
  const dueDate = String(nextState.settings?.mens_expire_date || nextState.game?.mens_expire_date || '').slice(0, 10);

  if (!dueDate || getLocalDateString() <= dueDate) {
    return { state: nextState, warnings };
  }

  const blockedPlayerIds = new Set(
    players
      .filter((player) => {
        if (!player || !player.id) return false;
        const isCarneOnly = player.role === 'carne';
        const playsFootball = player.plays_football !== false && !isCarneOnly;
        // IMPORTANTE: só remove quem é EXPLICITAMENTE inadimplente (mens_ok === false).
        // Antes era `!== true`, então jogadores cujo registro chegasse SEM o campo
        // (undefined, comum em sync parcial) eram removidos mesmo estando em dia —
        // causa do sumiço "16/16 -> 14/16".
        return playsFootball && player.mens_ok === false;
      })
      .map((player) => String(player.id))
  );

  if (!blockedPlayerIds.size) {
    return { state: nextState, warnings };
  }

  const confirmations = Array.isArray(nextState.confirmations) ? nextState.confirmations : [];
  const now = new Date().toISOString();
  let changedConfirmations = false;
  // Em vez de SUMIR com a confirmação do array (o que nunca era propagado ao
  // Supabase, deixando 16 no banco e 14 na tela), marcamos como CANCELADA. Assim
  // o persistidor faz upsert do estado cancelado e a contagem converge entre
  // dispositivos. Só transiciona quem ainda está confirmado (idempotente).
  const nextConfirmations = confirmations.map((entry) => {
    if (blockedPlayerIds.has(String(entry?.player_id || '')) && entry?.confirmed === true) {
      changedConfirmations = true;
      return {
        ...entry,
        confirmed: false,
        status: 'cancelled',
        removed_by_admin: false,
        confirmed_at: null,
        cancelled_at: now,
        waitlisted_at: null,
        waitlist_position: null,
        timestamp: now,
      };
    }
    return entry;
  });
  if (changedConfirmations) {
    warnings.push('Confirmação cancelada automaticamente de jogador inadimplente (bloqueio total).');
  }
  nextState.confirmations = nextConfirmations;

  const sortResult = nextState.game?.sort_result;
  if (sortResult && typeof sortResult === 'object') {
    const sanitizeTeam = (entries) => (Array.isArray(entries) ? entries : [])
      .filter((entry) => !blockedPlayerIds.has(String(getPlayerIdFromDrawEntry(entry) || '')));

    const originalTeamA = Array.isArray(sortResult.team_a) ? sortResult.team_a : [];
    const originalTeamB = Array.isArray(sortResult.team_b) ? sortResult.team_b : [];
    const nextTeamA = sanitizeTeam(originalTeamA);
    const nextTeamB = sanitizeTeam(originalTeamB);

    if (nextTeamA.length !== originalTeamA.length || nextTeamB.length !== originalTeamB.length) {
      warnings.push('Jogador inadimplente removido automaticamente do sorteio de times.');
      nextState.game = {
        ...(nextState.game || {}),
        sort_result: {
          ...sortResult,
          team_a: nextTeamA,
          team_b: nextTeamB,
          total_players: nextTeamA.length + nextTeamB.length,
        },
      };
    }
  }

  return { state: nextState, warnings };
}

export function sanitizeUi(ui, defaultUi = { currentTab: 'home', authMode: 'login', authMessage: null }) {
  return {
    ...clone(defaultUi),
    ...(ui || {}),
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
  nextState.settings = (nextState.settings && typeof nextState.settings === 'object') ? { ...nextState.settings } : {};
  if (!nextState.settings.mens_expire_date) {
    // Migração: o vencimento da mensalidade era guardado por jogo. Passa a ser
    // uma configuração global única do clube, herdando o valor do jogo ativo.
    const legacyDue = String(nextState.game?.mens_expire_date || '').slice(0, 10);
    nextState.settings.mens_expire_date = legacyDue || '';
    if (legacyDue) {
      warnings.push('Vencimento da mensalidade migrado do jogo ativo para configuração global.');
    }
  }
  nextState.ui = sanitizeUi(nextState.ui, defaultUi);
  const tombstones = normalizeDeletedPlayers(nextState);
  nextState.deleted_player_ids = tombstones.ids;
  nextState.deleted_player_phones = tombstones.phones;

  const deduped = dedupePlayers(nextState.players, defaultSeed.players || [], tombstones);
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

  // A remoção destrutiva de inadimplentes (bloqueio total) NÃO roda no caminho
  // de load/save/sync — só quando explicitamente pedida (ações de admin), via
  // options.enforceFinance. Antes rodava a cada poll (4s) em todo cliente,
  // removendo confirmados sem ação do admin e sem convergir.
  if (options.enforceFinance) {
    const financialPresenceResult = enforceFinancialPresenceConsistency(nextState);
    nextState = financialPresenceResult.state;
    warnings.push(...financialPresenceResult.warnings);
  }

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
