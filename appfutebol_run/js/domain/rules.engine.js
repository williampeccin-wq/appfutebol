import { isCarneOnly as authzIsCarneOnly } from './authz.js';

// PAUSADO: o controle de mensalidade está temporariamente INÓCUO até definirmos
// as regras de negócio. Com isto em false:
//  - inadimplentes NÃO são bloqueados de confirmar presença (aqui);
//  - inadimplentes NÃO são removidos automaticamente do jogo (state.guard).
// Os rótulos "Pago/Pendente" continuam aparecendo (apenas informativos).
// Para religar a regra: mude para true.
export const MENSALIDADE_ENFORCEMENT_ENABLED = false;

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isAfterMensalidadeDueDate(game, referenceDate = getLocalDateString()) {
  const dueDate = String(game?.mens_expire_date || '').slice(0, 10);
  if (!dueDate) return false;
  return String(referenceDate) > dueDate;
}

export function shouldBlockPresenceForFinance(player, game, referenceDate = getLocalDateString()) {
  if (!MENSALIDADE_ENFORCEMENT_ENABLED) return false;
  if (!player) return false;
  const carneOnly = authzIsCarneOnly(player);
  if (carneOnly) return false;
  return player.mens_ok !== true && isAfterMensalidadeDueDate(game, referenceDate);
}


export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isGoalkeeperEntry(entry) {
  return entry?.goalkeeper === true || entry?.segment === 'goalkeeper' || entry?.presence_role === 'goalkeeper';
}

export function getLineConfirmedCount(confirmations = []) {
  return (Array.isArray(confirmations) ? confirmations : [])
    .filter((entry) => entry?.confirmed === true && !isGoalkeeperEntry(entry))
    .length;
}

export function isGameFull(game, confirmations = []) {
  const lineConfirmedCount = getLineConfirmedCount(confirmations);
  const maxPlayers = Number(game?.max_players || 0);
  return maxPlayers > 0 && lineConfirmedCount >= maxPlayers;
}

export function canLogin(player, password) {
  const normalizedPassword = String(password || '').trim();

  if (!player) {
    return { ok: false, message: 'Telefone não cadastrado.' };
  }

  if (!normalizedPassword) {
    return { ok: false, message: 'Informe telefone e senha.' };
  }

  if (String(player.password_hash || '') !== normalizedPassword) {
    return { ok: false, message: 'Senha inválida.' };
  }

  return { ok: true, message: '', player };
}

export function getPlayerBlockReasons(player, game) {
  const reasons = [];

  if (!player) {
    reasons.push('user_not_found');
    return reasons;
  }

  const carneOnly = authzIsCarneOnly(player);

  if (carneOnly) {
    reasons.push('carne_only');
  }

  if (shouldBlockPresenceForFinance(player, game)) {
    reasons.push('mensalidade_pendente');
  }

  if (!game?.open) {
    reasons.push('inscricoes_fechadas');
  }

  return reasons;
}

export function getPlayerStatus(player, game) {
  const reasons = getPlayerBlockReasons(player, game);
  return {
    blocked: reasons.length > 0,
    reasons,
  };
}

function getBlockMessage(reason) {
  switch (reason) {
    case 'user_not_found':
      return 'Usuário não identificado.';
    case 'carne_only':
      return 'Perfis somente carne não participam da confirmação do jogo.';
    case 'mensalidade_pendente':
      return 'Você não pode confirmar presença pois a mensalidade está pendente e o vencimento já passou.';
    case 'inscricoes_fechadas':
      return 'As inscrições estão fechadas.';
    case 'game_full':
      return 'O jogo já está cheio.';
    default:
      return 'Ação indisponível no momento.';
  }
}

export function getPresenceDecision({ player, game, confirmations = [] }) {
  const reasons = getPlayerBlockReasons(player, game);
  const isConfirmed = confirmations.some((entry) => entry?.player_id === player?.id && entry?.confirmed);
  const gameFull = isGameFull(game, confirmations);

  if (isConfirmed) {
    return {
      isConfirmed: true,
      canConfirm: false,
      canCancel: true,
      blocked: false,
      reasonBlocked: null,
      message: '',
      reasons,
      gameFull,
    };
  }

  if (reasons.length > 0) {
    return {
      isConfirmed: false,
      canConfirm: false,
      canCancel: false,
      blocked: true,
      reasonBlocked: reasons[0],
      message: getBlockMessage(reasons[0]),
      reasons,
      gameFull,
    };
  }

  if (gameFull) {
    return {
      isConfirmed: false,
      canConfirm: false,
      canCancel: false,
      blocked: true,
      reasonBlocked: 'game_full',
      message: getBlockMessage('game_full'),
      reasons: ['game_full'],
      gameFull,
    };
  }

  return {
    isConfirmed: false,
    canConfirm: true,
    canCancel: false,
    blocked: false,
    reasonBlocked: null,
    message: '',
    reasons: [],
    gameFull,
  };
}

export function validateState(state) {
  const players = Array.isArray(state?.players) ? state.players : [];
  const confirmations = Array.isArray(state?.confirmations) ? state.confirmations : [];
  const playerIds = new Set(players.map((player) => player?.id).filter(Boolean));
  const phoneGroups = new Map();
  const issues = [];

  for (const player of players) {
    const phone = normalizePhone(player?.phone);
    if (!phone) {
      issues.push({ type: 'player_missing_phone', playerId: player?.id || null });
      continue;
    }
    const current = phoneGroups.get(phone) || [];
    current.push(player?.id || null);
    phoneGroups.set(phone, current);
  }

  for (const [phone, ids] of phoneGroups.entries()) {
    if (ids.length > 1) {
      issues.push({ type: 'duplicate_phone', phone, playerIds: ids });
    }
  }

  const sessionPlayerId = state?.session?.playerId || null;
  if (sessionPlayerId && !playerIds.has(sessionPlayerId)) {
    issues.push({ type: 'invalid_session_player', playerId: sessionPlayerId });
  }

  confirmations.forEach((entry, index) => {
    if (!playerIds.has(entry?.player_id)) {
      issues.push({ type: 'orphan_confirmation', index, playerId: entry?.player_id || null });
    }
  });

  return {
    ok: issues.length === 0,
    issues,
  };
}
