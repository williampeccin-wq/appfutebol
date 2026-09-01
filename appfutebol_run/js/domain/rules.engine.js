import { isCarneOnly as authzIsCarneOnly, isMensalidadeExempt as authzIsMensalidadeExempt } from './authz.js';
// Fonte única de isGoalkeeperEntry (antes havia uma cópia só-entry aqui).
// Importa p/ uso interno (getLineConfirmedCount) e reexporta p/ quem importava
// daqui (game.service). Sem ciclo: confirmations.js é leaf (não importa nada).
import { isGoalkeeperEntry } from './confirmations.js';
export { isGoalkeeperEntry };

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

// mens_ok=true significa "pagou no ciclo atual". O ciclo é resetado pelo admin ao
// salvar uma nova mens_expire_date — até lá, quem pagou continua Em dia mesmo
// após a data de vencimento ter passado.
export function isMensOkEffective(player, _game) {
  return !!player?.mens_ok;
}

// Bloqueia a CONFIRMAÇÃO de presença de inadimplente. Vale tanto no modo
// 'partial' quanto 'total' (ambos impedem inadimplente de confirmar). No modo
// 'none' nunca bloqueia.
export function shouldBlockPresenceForFinance(player, game, mode = MENSALIDADE_MODES.NONE, referenceDate = getLocalDateString()) {
  if (mode !== MENSALIDADE_MODES.PARTIAL && mode !== MENSALIDADE_MODES.TOTAL) return false;
  if (!player) return false;
  // Isento de mensalidade (carne OU goleiro não-pagante) nunca é bloqueado.
  if (authzIsMensalidadeExempt(player)) return false;
  // Só bloqueia quem é EXPLICITAMENTE inadimplente (mens_ok === false), igual ao
  // enforceFinancialPresenceConsistency (remoção). `undefined` (registro sem o
  // campo, comum em legado/sync parcial) NÃO é inadimplente — o antigo `!== true`
  // aqui bloqueava quem estava em dia e divergia da remoção (mesma raiz do bug
  // "16/16 → 14/16").
  return player.mens_ok === false && isAfterMensalidadeDueDate(game, referenceDate);
}


export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

export function getLineConfirmedCount(confirmations = []) {
  return (Array.isArray(confirmations) ? confirmations : [])
    .filter((entry) => entry?.confirmed === true && !isGoalkeeperEntry(entry))
    .length;
}

export function isGameFull(game, confirmations = []) {
  const lineConfirmedCount = getLineConfirmedCount(confirmations);
  // Convidados de LINHA ocupam vaga, igual a um confirmado. Convidado GOLEIRO
  // não entra na conta de linha (ele conta contra o teto de goleiros, checado
  // no addGuestPlayer).
  const guestCount = Array.isArray(game?.guest_players)
    ? game.guest_players.filter((g) => !['gol', 'goleiro'].includes(String(g?.position || '').toLowerCase())).length
    : 0;
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

// ---------------------------------------------------------------------------
// VIRADA DE MÊS DA MENSALIDADE
// ---------------------------------------------------------------------------
// No dia 1º todo mundo volta a "Pendente". O gatilho é o CALENDÁRIO, não o
// vencimento: o dia de vencimento configurado (10, 15, ...) continua sendo só o
// prazo daquele mês. Isto é DIFERENTE do que 58fdb1f tentou e a97d6ad reverteu
// — lá o `isMensOkEffective` mentia sobre quem já tinha pagado assim que a data
// passava, e o ciclo nunca virava. Aqui o dado é reescrito uma vez, na virada, e
// a leitura continua sendo `mens_ok` puro.
//
// `settings.mens_last_reset_month` ('AAAA-MM') carimba o último mês já
// processado. Serve para duas coisas:
//
//  1. IDEMPOTÊNCIA — abrir o app dez vezes no dia 1º zera uma vez só.
//  2. ESTREIA SEM ATROPELO — clube que ainda não tem carimbo é apenas ARMADO
//     com o mês corrente, sem zerar ninguém. É o que protege os status que já
//     estão no ar no dia do deploy: o primeiro reset automático só acontece na
//     virada seguinte.
const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

export function getMensCycleMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function reconcileMensalidadeMonthTurn(state, currentMonth = getMensCycleMonth()) {
  const unchanged = { state, changed: false, reset: false, zerados: 0 };
  if (!MONTH_KEY_RE.test(String(currentMonth))) return unchanged;

  const settings = (state?.settings && typeof state.settings === 'object') ? state.settings : {};
  const stamped = String(settings.mens_last_reset_month || '').slice(0, 7);

  // Sem carimbo = primeira execução desta regra neste clube. Só arma o gatilho.
  if (!MONTH_KEY_RE.test(stamped)) {
    return {
      state: { ...state, settings: { ...settings, mens_last_reset_month: currentMonth } },
      changed: true,
      reset: false,
      zerados: 0,
    };
  }

  // Mesmo mês — ou carimbo à frente, que é relógio do aparelho atrasado/errado.
  // Nos dois casos não se zera nada: um celular com a data trocada não pode
  // reabrir a cobrança do clube inteiro.
  if (stamped >= currentMonth) return unchanged;

  const players = Array.isArray(state?.players) ? state.players : [];
  let zerados = 0;
  const nextPlayers = players.map((player) => {
    if (!player?.mens_ok) return player;
    zerados += 1;
    return { ...player, mens_ok: false };
  });

  return {
    state: {
      ...state,
      players: nextPlayers,
      settings: { ...settings, mens_last_reset_month: currentMonth },
    },
    changed: true,
    reset: true,
    zerados,
  };
}
