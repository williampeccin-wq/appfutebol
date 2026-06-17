import { isCarneOnly as authzIsCarneOnly } from './authz.js';

// Controle de mensalidade com TRÊS modos concorrentes (escolha única do clube,
// guardada em state.settings.mens_enforcement_mode). Só passa a valer DEPOIS do
// vencimento (mens_expire_date). O administrador nunca é bloqueado.
//
//  - 'none'    : sem bloqueio. Inadimplência é apenas informativa (Pago/Pendente).
//  - 'partial' : bloqueio parcial. Inadimplente NÃO CONFIRMADO não pode confirmar;
//                inadimplente já confirmado PERMANECE na escalação.
//  - 'total'   : bloqueio total. Inadimplente não confirmado não pode confirmar E
//                inadimplente confirmado é REMOVIDO da escalação (libera vaga para
//                a fila) e não pode mais confirmar.
export const MENSALIDADE_MODES = { NONE: 'none', PARTIAL: 'partial', TOTAL: 'total' };

export function getMensalidadeMode(settings) {
  const mode = String(settings?.mens_enforcement_mode || '').toLowerCase();
  return (mode === MENSALIDADE_MODES.PARTIAL || mode === MENSALIDADE_MODES.TOTAL)
    ? mode
    : MENSALIDADE_MODES.NONE;
}

// Compat: alguns pontos só perguntam "a regra está ligada?". Ligada = partial OU total.
export function isMensalidadeEnforcementEnabled(settings) {
  return getMensalidadeMode(settings) !== MENSALIDADE_MODES.NONE;
}

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

// Bloqueia a CONFIRMAÇÃO de presença de inadimplente. Vale tanto no modo
// 'partial' quanto 'total' (ambos impedem inadimplente de confirmar). No modo
// 'none' nunca bloqueia.
export function shouldBlockPresenceForFinance(player, game, mode = MENSALIDADE_MODES.NONE, referenceDate = getLocalDateString()) {
  if (mode !== MENSALIDADE_MODES.PARTIAL && mode !== MENSALIDADE_MODES.TOTAL) return false;
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
  // Convidados (adicionados pelo admin, só nome) ocupam vaga de LINHA, igual a
  // um confirmado — por isso entram na conta do máximo.
  const guestCount = Array.isArray(game?.guest_players) ? game.guest_players.length : 0;
  const maxPlayers = Number(game?.max_players || 0);
  return maxPlayers > 0 && (lineConfirmedCount + guestCount) >= maxPlayers;
}


export function getPlayerBlockReasons(player, game, mode = MENSALIDADE_MODES.NONE) {
  const reasons = [];

  if (!player) {
    reasons.push('user_not_found');
    return reasons;
  }

  const carneOnly = authzIsCarneOnly(player);

  if (carneOnly) {
    reasons.push('carne_only');
  }

  if (shouldBlockPresenceForFinance(player, game, mode)) {
    reasons.push('mensalidade_pendente');
  }

  if (!game?.open) {
    reasons.push('inscricoes_fechadas');
  }

  return reasons;
}

export function getPlayerStatus(player, game, mode = MENSALIDADE_MODES.NONE) {
  const reasons = getPlayerBlockReasons(player, game, mode);
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

export function getPresenceDecision({ player, game, confirmations = [], mode = MENSALIDADE_MODES.NONE }) {
  const reasons = getPlayerBlockReasons(player, game, mode);
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
