window.__HARMONIA_BUILD__ = 'v1.55.9-admin-presence-manage';

function showToast(msg, type='success') {
  const text = String(msg || '');

  // Sync/polling remoto deve ser silencioso. Este bloqueio é defensivo
  // e impede que qualquer caminho antigo volte a exibir o toast de sync.
  if (/dados\s+atualizados|atualizados\s+em\s+outro\s+dispositivo|remote\s+sync|remote-conflict/i.test(text)) {
    window.__HARMONIA_LAST_BLOCKED_TOAST__ = {
      text,
      type,
      blockedAt: new Date().toISOString(),
      build: window.__HARMONIA_BUILD__,
    };
    return;
  }

  let t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(()=>t.classList.add('show'),10);
  setTimeout(()=>{t.classList.remove('show'); setTimeout(()=>t.remove(),200)},2000);
}



let editingPlayerId = null;


let uiActionInFlight = false;

function setActionBusy(trigger, busyText = 'Processando...') {
  if (!trigger) return;
  trigger.dataset.originalText = trigger.textContent || '';
  trigger.textContent = busyText;
  trigger.disabled = true;
  trigger.classList.add('is-busy');
}

function clearActionBusy(trigger) {
  if (!trigger) return;
  if (trigger.dataset.originalText) trigger.textContent = trigger.dataset.originalText;
  trigger.disabled = false;
  trigger.classList.remove('is-busy');
  delete trigger.dataset.originalText;
}

function showConfirmModal({
  title = 'Confirmar ação',
  message = 'Tem certeza que deseja continuar?',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal-overlay';
    overlay.innerHTML = `
      <div class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <div class="confirm-modal-title" id="confirm-modal-title">${title}</div>
        <div class="confirm-modal-message">${message}</div>
        <div class="confirm-modal-actions">
          <button type="button" class="btn btn-secondary" data-confirm-modal="cancel">${cancelText}</button>
          <button type="button" class="btn btn-primary" data-confirm-modal="confirm">${confirmText}</button>
        </div>
      </div>
    `;

    const cleanup = (result) => {
      document.removeEventListener('keydown', handleKeydown);
      overlay.remove();
      resolve(result);
    };

    const handleKeydown = (event) => {
      if (event.key === 'Escape') cleanup(false);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) cleanup(false);
      const button = event.target.closest('[data-confirm-modal]');
      if (!button) return;
      cleanup(button.dataset.confirmModal === 'confirm');
    });

    document.addEventListener('keydown', handleKeydown);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-confirm-modal="confirm"]')?.focus();
  });
}

function setPlayerFormMode(isEditing) {
  const submitButton = document.querySelector('[data-action="add-player"]');
  const cancelButton = document.getElementById('cancel-edit-button');
  const title = document.getElementById('player-management-title');

  if (submitButton) submitButton.textContent = isEditing ? 'Salvar alteração' : 'Adicionar';
  if (cancelButton) cancelButton.style.display = isEditing ? 'inline-flex' : 'none';
  if (title) title.textContent = isEditing ? 'Editando jogador' : 'Gerenciar jogadores';
}

function resetPlayerForm() {
  const nameInput = document.getElementById("new-name");
  const phoneInput = document.getElementById("new-phone");
  const birthDateInput = document.getElementById("new-birthdate");
  const roleInput = document.getElementById("new-role");
  const positionInput = document.getElementById("new-position");
  const adminInput = document.getElementById("new-admin");
  const mensInput = document.getElementById("new-mens");

  if (nameInput) nameInput.value = "";
  if (phoneInput) phoneInput.value = "";
  if (birthDateInput) birthDateInput.value = "";
  if (roleInput) roleInput.value = "player";
  if (positionInput) {
    positionInput.value = "meia";
    positionInput.disabled = false;
  }
  if (adminInput) adminInput.checked = false;
  if (mensInput) mensInput.checked = true;
}

function normalizePlayer(player) {
  if (player.plays_football === undefined) {
    player.plays_football = player.role !== 'carne';
  }
  if (player.in_carne_group === undefined) {
    player.in_carne_group = true;
  }
  return player;
}

function repairManualSnapshot(snapshot) {
  const repaired = validateAndRepairState(snapshot);
  if (repaired.warnings.length) {
    console.warn('[app] Reparos aplicados antes do save manual:', repaired.warnings);
  }
  return repaired.state;
}

document.addEventListener("click", async (e) => {
  const trigger = e.target.closest("[data-action]");
  if (!trigger) return;

  const action = trigger.dataset.action;
  if (!action) return;
  if (uiActionInFlight && action !== "cancel-edit") return;
  const id = trigger.dataset.id || "";

  const raw = localStorage.getItem("harmonia_data");
  const snapshot = raw ? JSON.parse(raw) : {};
  if (Array.isArray(snapshot.players)) {
    snapshot.players = snapshot.players.map(normalizePlayer);
  }
  if (!Array.isArray(snapshot.players)) return;

  if (action === "add-player") {
  uiActionInFlight = true;
  setActionBusy(trigger, editingPlayerId ? "Salvando..." : "Adicionando...");
  const name = document.getElementById("new-name")?.value?.trim();
  const phone = document.getElementById("new-phone")?.value?.trim();
  const birthDate = document.getElementById("new-birthdate")?.value?.trim();
  const role = document.getElementById("new-role")?.value;
  const position = document.getElementById("new-position")?.value;
  const is_admin = document.getElementById("new-admin")?.checked;
  const mens_ok = document.getElementById("new-mens")?.checked;

  if (!name || !phone || !birthDate) {
    clearActionBusy(trigger);
    uiActionInFlight = false;
    alert("Nome, telefone e data de nascimento são obrigatórios");
    return;
  }

  if (snapshot.players.some((p) => p.phone === phone && p.id !== editingPlayerId)) {
    clearActionBusy(trigger);
    uiActionInFlight = false;
    alert("Telefone duplicado");
    return;
  }

  const isEditing = !!editingPlayerId;

  if (editingPlayerId) {
    const playerToEdit = snapshot.players.find((p) => p.id === editingPlayerId);
    if (!playerToEdit) {
      clearActionBusy(trigger);
      uiActionInFlight = false;
      return;
    }

    playerToEdit.name = name;
    playerToEdit.phone = phone;
    playerToEdit.birthDate = birthDate;
    playerToEdit.plays_football = role === "player";
    playerToEdit.in_carne_group = true;
    playerToEdit.position = role === "player" ? position : null;
    playerToEdit.mens_ok = role === "player" ? !!mens_ok : false;
    playerToEdit.is_admin = !!is_admin;
  } else {
    snapshot.players.push({
      id: "p_" + Date.now(),
      name,
      phone,
      birthDate,
      plays_football: role === "player",
      in_carne_group: true,
      position: role === "player" ? position : null,
      mens_ok,
      is_admin
    });
  }

  const safeSnapshot = repairManualSnapshot(snapshot);
  savePersistedState(safeSnapshot);
  editingPlayerId = null;
  setPlayerFormMode(false);
  resetPlayerForm();
  render(safeSnapshot);
  uiActionInFlight = false;
  showToast(isEditing ? "Jogador atualizado com sucesso" : "Jogador adicionado", "success");
  window.scrollTo({ top: 0, behavior: "smooth" });
  return;
}

  if (action === "edit-player") {
  const playerToEdit = snapshot.players.find((p) => p.id === id);
  if (!playerToEdit) return;

  const card = document.getElementById("player-management-card");
  const nameInput = document.getElementById("new-name");
  const phoneInput = document.getElementById("new-phone");
  const birthDateInput = document.getElementById("new-birthdate");
  const roleInput = document.getElementById("new-role");
  const positionInput = document.getElementById("new-position");
  const adminInput = document.getElementById("new-admin");
  const mensInput = document.getElementById("new-mens");

  if (!nameInput || !phoneInput || !birthDateInput || !roleInput || !positionInput || !adminInput || !mensInput) return;

  editingPlayerId = id;
  nameInput.value = playerToEdit.name || "";
  phoneInput.value = playerToEdit.phone || "";
  birthDateInput.value = playerToEdit.birthDate || "";
  roleInput.value = playerToEdit.plays_football === false ? "carne" : "player";
  roleInput.dispatchEvent(new Event("change", { bubbles: true }));
  positionInput.value = playerToEdit.position || "meia";
  adminInput.checked = !!playerToEdit.is_admin;
  mensInput.checked = !!playerToEdit.mens_ok;

  setPlayerFormMode(true);
  if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
  nameInput.focus();
  nameInput.select();
  return;
}

if (action === "cancel-edit") {
  editingPlayerId = null;
  resetPlayerForm();
  setPlayerFormMode(false);
  showToast("Edição cancelada", "success");
  return;
}


if (action === "delete-player") {
  const player = snapshot.players.find(p => p.id === id);
  if (!player) return;

  const current = snapshot.session?.playerId;
  if (player.id === current) {
    showToast("Você não pode excluir seu próprio usuário", "error");
    return;
  }

  const admins = snapshot.players.filter(p => p.is_admin);
  if (player.is_admin && admins.length <= 1) {
    showToast("Não é possível remover o último administrador", "error");
    return;
  }

  const confirmedDelete = await showConfirmModal({
    title: 'Excluir jogador',
    message: `Tem certeza que deseja excluir ${player.name}? Essa ação remove o perfil da lista atual.`,
    confirmText: 'Excluir',
    cancelText: 'Cancelar',
  });

  if (!confirmedDelete) return;

  uiActionInFlight = true;
  setActionBusy(trigger, 'Excluindo...');

  if (!Array.isArray(snapshot.deleted_player_ids)) snapshot.deleted_player_ids = [];
  if (!Array.isArray(snapshot.deleted_player_phones)) snapshot.deleted_player_phones = [];

  snapshot.deleted_player_ids = [...new Set([...snapshot.deleted_player_ids, String(player.id)])];
  const normalizedDeletedPhone = String(player.phone || '').replace(/\D/g, '');
  snapshot.deleted_player_phones = [...new Set([...snapshot.deleted_player_phones, normalizedDeletedPhone].filter(Boolean))];

  snapshot.players = snapshot.players.filter(p => p.id !== id);
  snapshot.confirmations = Array.isArray(snapshot.confirmations)
    ? snapshot.confirmations.filter(entry => entry.player_id !== id)
    : [];
  if (snapshot.championship?.ranking) {
    snapshot.championship = {
      ...snapshot.championship,
      ranking: snapshot.championship.ranking.filter(entry => entry.player_id !== id),
    };
  }
  snapshot.carne = Array.isArray(snapshot.carne)
    ? snapshot.carne.filter(entry => entry.player_id !== id)
    : [];

  const safeSnapshot = repairManualSnapshot(snapshot);
  savePersistedState(safeSnapshot);
  render(safeSnapshot);
  uiActionInFlight = false;
  showToast("Jogador removido", "success");
  window.scrollTo({ top: 0, behavior: "smooth" });
  return;
}


if (action === "admin-remove-from-game") {
  const current = snapshot.players.find((p) => p.id === snapshot.session?.playerId);
  const player = snapshot.players.find((p) => p.id === id);

  if (!current?.is_admin) {
    showToast("Apenas administrador pode remover jogador do jogo", "error");
    return;
  }

  if (!player) return;

  const isPlayerConfirmed = Array.isArray(snapshot.confirmations)
    && snapshot.confirmations.some((entry) => String(entry.player_id) === String(id) && entry.confirmed === true);

  if (!isPlayerConfirmed) {
    showToast("Jogador não está confirmado no jogo", "error");
    return;
  }

  const confirmedRemoval = await showConfirmModal({
    title: 'Remover do jogo',
    message: `Remover ${player.name} do jogo vigente? A vaga será liberada e ele poderá confirmar novamente depois.`,
    confirmText: 'Remover',
    cancelText: 'Cancelar',
  });

  if (!confirmedRemoval) return;

  uiActionInFlight = true;
  setActionBusy(trigger, 'Removendo...');

  const result = adminRemovePlayerFromGame(id);
  const safeSnapshot = repairManualSnapshot(getState());
  savePersistedState(safeSnapshot);
  render(safeSnapshot);

  uiActionInFlight = false;
  showToast(result.message, result.ok ? "success" : "error");
  return;
}

if (action === "admin-add-to-game") {
  const current = snapshot.players.find((p) => p.id === snapshot.session?.playerId);
  const player = snapshot.players.find((p) => p.id === id);

  if (!current?.is_admin) {
    showToast("Apenas administrador pode incluir jogador no jogo", "error");
    return;
  }

  if (!player) return;

  const isPlayerConfirmed = Array.isArray(snapshot.confirmations)
    && snapshot.confirmations.some((entry) => String(entry.player_id) === String(id) && entry.confirmed === true);

  if (isPlayerConfirmed) {
    showToast("Jogador já está confirmado no jogo", "error");
    return;
  }

  uiActionInFlight = true;
  setActionBusy(trigger, 'Incluindo...');

  const result = toggleConfirmation(id);
  const safeSnapshot = repairManualSnapshot(getState());
  savePersistedState(safeSnapshot);
  render(safeSnapshot);

  uiActionInFlight = false;
  showToast(result.message, result.ok ? "success" : "error");
  return;
}



  const player = snapshot.players.find(p => p.id === id);
  if (!player) return;

  if (action === "mark-paid" || action === "mark-debt") {
    uiActionInFlight = true;
    setActionBusy(trigger, action === "mark-paid" ? "Salvando..." : "Atualizando...");
  }

  if (action === "mark-paid") player.mens_ok = true;
  if (action === "mark-debt") player.mens_ok = false;

  const safeSnapshot = repairManualSnapshot(snapshot);
  savePersistedState(safeSnapshot);
  render(safeSnapshot);
  uiActionInFlight = false;
  showToast(action === "mark-paid" ? "Mensalidade marcada como paga" : "Jogador marcado como inadimplente", "success");
});


document.addEventListener("change", (e) => {
  const target = e.target;
  if (!target || target.id !== "new-role") return;

  const position = document.getElementById("new-position");
  if (!position) return;

  if (target.value === "carne") {
    position.value = "meia";
    position.disabled = true;
  } else {
    position.disabled = false;
  }
});

import { buildGameView, buildPlayersView } from "../domain/projection.js";
import { validateAndRepairState } from "../domain/state.guard.js";
import { APP_VERSION } from "./version.js";
import { getState, patchState, replaceState, subscribe } from './state.js';
import { getState as loadPersistedState, saveState as savePersistedState, getStorageMeta } from '../domain/storage.adapter.js';
import { loadRemoteState } from '../services/storage.supabase.js';
import { getCurrentPlayer, login, logout, register, restoreSession } from '../services/auth.service.js';
import { renderAuthScreen } from '../modules/auth/auth.view.js';
import { renderPlayersScreen } from '../modules/players/players.view.js';
import { canManagePresence, isConfirmed, toggleConfirmation, drawTeams, clearTeamDraw, moveDrawnPlayer, adminRemovePlayerFromGame } from '../modules/game/game.service.js';
import { hasCapacity } from '../modules/game/game.service.js';
import { canConfirm } from '../modules/finance/finance.service.js';

const appElement = document.getElementById('app');

const REMOTE_SYNC_INTERVAL_MS = 4000;
let isApplyingRemoteState = false;
let lastDomainFingerprint = '';

init();

async function init() {
  const data = await loadPersistedState();
  replaceState(data);
  restoreSession();
  lastDomainFingerprint = getDomainFingerprint(getState());

  subscribe((snapshot) => {
    if (!isApplyingRemoteState) {
      persist(snapshot);
      lastDomainFingerprint = getDomainFingerprint(snapshot);
    }
    render(snapshot);
  });

  render(getState());
  bindGlobalSystemEvents();
  startRemoteSync();
}

function bindGlobalSystemEvents() {
  window.addEventListener('harmonia:remote-conflict', () => {
    // Conflito remoto de polling/sync não deve gerar toast recorrente.
    // Apenas atualiza o estado local de forma silenciosa, preservando sessão/UI.
    setTimeout(async () => {
      isApplyingRemoteState = true;
      try {
        const remoteSnapshot = await loadPersistedState();
        replaceState(mergeRemoteDomainWithLocalSession(remoteSnapshot, getState()));
        lastDomainFingerprint = getDomainFingerprint(getState());
      } finally {
        isApplyingRemoteState = false;
      }
    }, 600);
  });
}


function getDomainFingerprint(snapshot) {
  return JSON.stringify({
    players: snapshot.players || [],
    game: snapshot.game || null,
    confirmations: snapshot.confirmations || [],
    championship: snapshot.championship || null,
    carne: snapshot.carne || [],
    notifications: snapshot.notifications || [],
  });
}

function mergeRemoteDomainWithLocalSession(remoteSnapshot, localSnapshot) {
  return {
    ...remoteSnapshot,
    session: localSnapshot.session,
    ui: localSnapshot.ui,
  };
}

function isValidRemoteDomainSnapshot(snapshot) {
  return !!(
    snapshot &&
    typeof snapshot === 'object' &&
    Array.isArray(snapshot.players) &&
    snapshot.players.length > 0 &&
    snapshot.game &&
    typeof snapshot.game === 'object' &&
    Array.isArray(snapshot.confirmations)
  );
}

function startRemoteSync() {
  window.setInterval(async () => {
    try {
      const localSnapshot = getState();
      const remote = await loadRemoteState();

      if (!remote.ok || !isValidRemoteDomainSnapshot(remote.state)) {
        return;
      }

      const repairedRemote = validateAndRepairState(remote.state);
      const safeRemoteState = repairedRemote.state;

      if (repairedRemote.warnings.length) {
        console.warn('[remote-sync] Reparos aplicados antes de comparar estado remoto:', repairedRemote.warnings);
      }

      const currentFingerprint = getDomainFingerprint(localSnapshot);
      const remoteFingerprint = getDomainFingerprint(safeRemoteState);

      if (!remoteFingerprint || remoteFingerprint === currentFingerprint) {
        lastDomainFingerprint = currentFingerprint;
        return;
      }

      isApplyingRemoteState = true;
      replaceState(mergeRemoteDomainWithLocalSession(safeRemoteState, localSnapshot));
      lastDomainFingerprint = remoteFingerprint;
      isApplyingRemoteState = false;
    } catch (error) {
      isApplyingRemoteState = false;
      console.warn('[remote-sync] failed to sync remote state', error);
    }
  }, REMOTE_SYNC_INTERVAL_MS);
}

function persist(snapshot) {
  savePersistedState(snapshot);
}

function render(snapshot) {
  const confirmedCount = snapshot.confirmations?.filter(c => c.confirmed).length || 0;
  const maxPlayers = snapshot.game?.max_players || 10;
  console.log(`CONFIRMADOS: ${confirmedCount}/${maxPlayers}`);

  const currentPlayer = getCurrentPlayer();

  if (!currentPlayer) {
    appElement.innerHTML = renderAuthScreen(snapshot.ui);
    bindAuthEvents();
    return;
  }

  const requestedTab = snapshot.ui.currentTab || 'home';
  const activeTab = !currentPlayer.is_admin && requestedTab === 'config' ? 'home' : requestedTab;
  if (activeTab !== requestedTab) {
    patchState({ ui: { currentTab: activeTab } });
    return;
  }

  appElement.innerHTML = `
    <div class="header">
      <div class="header-row">
        <div>
          <div class="header-title">HARMONIA <span style='font-size:12px;opacity:0.7;'>${APP_VERSION}</span></div>
          <div class="header-subtitle">${buildHeaderSubtitle(currentPlayer)}</div>
        </div>
        <div class="header-actions">
          <div class="header-badge">${currentPlayer.is_admin ? 'Admin' : currentPlayer.role === 'carne' ? 'Carne' : 'Jogador'}</div>
          <button class="header-logout" type="button" id="logout-button">Sair</button>
        </div>
      </div>
    </div>

    <nav class="nav" aria-label="Navegação principal">
      ${renderNavButton('home', 'Home', activeTab)}
      ${renderNavButton('weekly_game', 'Jogo da semana', activeTab)}
      ${renderNavButton('players', 'Jogadores', activeTab)}
      ${renderNavButton('championship', 'Campeonato', activeTab)}
      ${currentPlayer.is_admin ? renderNavButton('config', 'Config', activeTab) : ''}
    </nav>

    <main class="content">
      <div style="padding:10px;font-weight:bold;">
${confirmedCount} / ${maxPlayers} jogadores confirmados
</div>
${renderTab(snapshot, activeTab, currentPlayer)}
    </main>
  `;

  bindAppEvents(currentPlayer);
}

function bindAuthEvents() {
  const modeButtons = appElement.querySelectorAll('[data-auth-mode]');
  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      patchState({
        ui: {
          authMode: button.dataset.authMode,
          authMessage: null,
        },
      });
    });
  });

  const loginForm = appElement.querySelector('#login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const result = login(formData.get('phone'), formData.get('password'));
      if (!result.ok) {
        patchState({
          ui: {
            authMode: 'login',
            authMessage: { type: 'error', text: result.message },
          },
        });
      }
    });
  }

  const registerForm = appElement.querySelector('#register-form');
  if (registerForm) {
    const roleSelect = registerForm.querySelector('#register-role');
    const positionGroup = registerForm.querySelector('#position-group');
    const togglePosition = () => {
      const role = roleSelect?.value === 'carne' ? 'carne' : 'jogador';
      if (positionGroup) {
        positionGroup.style.display = role === 'carne' ? 'none' : 'grid';
      }
    };

    togglePosition();
    roleSelect?.addEventListener('change', togglePosition);

    registerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      const result = register({
        name: formData.get('name'),
        phone: formData.get('phone'),
        birthDate: formData.get('birthDate'),
        role: formData.get('role'),
        position: formData.get('position'),
        password: formData.get('password'),
        passwordConfirm: formData.get('passwordConfirm'),
      });

      if (!result.ok) {
        patchState({
          ui: {
            authMode: 'register',
            authMessage: { type: 'error', text: result.message },
          },
        });
      }
    });
  }
}



function getPresenceIcon(reason, confirmed, capacityOk) {
  if (confirmed) return "✅";
  if (!capacityOk) return "🚫";

  switch (reason) {
    case "inadimplente":
    case "mensalidade_pendente":
    case "mensalidade_vencida":
      return "💸";
    case "carne":
    case "carne_only":
      return "📄";
    case "inactive":
      return "⛔";
    default:
      return "ℹ️";
  }
}

function getPresenceReasonLabel(reason) {
  switch (reason) {
    case 'carne_only':
      return 'Somente carnê';
    case 'mensalidade_pendente':
      return 'Mensalidade pendente';
    case 'mensalidade_sem_data':
      return 'Mensalidade sem data';
    case 'mensalidade_vencida':
      return 'Mensalidade vencida';
    case 'inscricoes_fechadas':
      return 'Inscrições fechadas';
    case 'game_full':
      return 'Jogo cheio';
    default:
      return 'Ação indisponível';
  }
}

function buildPresenceFeedback({ confirmed, capacityOk, presenceGuard, currentPlayer, carneStatus }) {
  if (confirmed) {
    return {
      icon: getPresenceIcon('confirmed', confirmed, capacityOk),
      toneClass: 'is-ok',
      title: 'Você está confirmado',
      text: 'Sua vaga está reservada. Se precisar, você ainda pode cancelar a presença.',
      badge: 'Confirmado',
    };
  }

  if (!capacityOk) {
    return {
      icon: getPresenceIcon('game_full', confirmed, capacityOk),
      toneClass: 'is-warn',
      title: 'Sem vagas no momento',
      text: 'O jogo já está cheio. Se alguém cancelar, a vaga volta a ficar disponível.',
      badge: 'Jogo cheio',
    };
  }

  if (presenceGuard.ok) {
    return {
      icon: getPresenceIcon('ok', confirmed, capacityOk),
      toneClass: 'is-neutral',
      title: 'Pronto para confirmar',
      text: 'Seu cadastro está apto para confirmar presença neste jogo.',
      badge: 'Liberado',
    };
  }

  const reasons = Array.isArray(presenceGuard?.decision?.reasons) ? presenceGuard.decision.reasons : [];
  const primaryReason = reasons[0] || 'unknown';

  return {
    icon: getPresenceIcon(primaryReason, confirmed, capacityOk),
    toneClass: 'is-warn',
    title: getPresenceReasonLabel(primaryReason),
    text: presenceGuard.message || (
      carneStatus
        ? 'Você está vinculado ao grupo do carnê e não pode confirmar presença agora.'
        : currentPlayer?.role === 'carne'
          ? 'Perfis somente carnê não participam da confirmação do jogo.'
          : 'Sua confirmação está bloqueada no momento.'
    ),
    badge: getPresenceReasonLabel(primaryReason),
  };
}


function bindAppEvents(currentPlayer) {
  appElement.querySelector('#logout-button')?.addEventListener('click', () => logout());

  const buttons = appElement.querySelectorAll('[data-tab]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      patchState({ ui: { currentTab: button.dataset.tab } });
    });
  });

  appElement.querySelector('#confirm-btn')?.addEventListener('click', () => {
    const result = toggleConfirmation(currentPlayer.id);
    if (result?.message) showToast(result.message, result.ok ? 'success' : 'error');
  });

  appElement.querySelector('#draw-teams-btn')?.addEventListener('click', () => {
    const result = drawTeams();
    showToast(result.message, result.ok ? 'success' : 'error');
  });

  appElement.querySelector('#clear-draw-btn')?.addEventListener('click', () => {
    const result = clearTeamDraw();
    showToast(result.message, result.ok ? 'success' : 'error');
  });

  appElement.querySelector('#copy-draw-btn')?.addEventListener('click', () => {
    copyTeamDrawToClipboard();
  });

  appElement.querySelectorAll('[data-action="move-drawn-player"]').forEach((button) => {
    button.addEventListener('click', () => {
      const result = moveDrawnPlayer(button.dataset.playerId, button.dataset.fromTeam);
      showToast(result.message, result.ok ? 'success' : 'error');
    });
  });

  const gameConfigForm = appElement.querySelector('#game-config-form');
  if (gameConfigForm) {
    gameConfigForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const formData = new FormData(gameConfigForm);
      const maxPlayers = Number(formData.get('max_players'));

      if (!Number.isFinite(maxPlayers) || maxPlayers < 1) {
        showToast('Informe um limite de jogadores válido.', 'error');
        return;
      }

      patchState({
        game: {
          ...(getState().game || {}),
          game_date: String(formData.get('game_date') || ''),
          game_time: String(formData.get('game_time') || ''),
          max_players: maxPlayers,
          mens_expire_date: String(formData.get('mens_expire_date') || ''),
          open: formData.get('open') === 'on',
        },
      });

      showToast('Configuração do jogo salva.');
    });
  }
}

function renderNavButton(tab, label, activeTab) {
  const activeClass = tab === activeTab ? 'is-active' : '';
  return `<button class="nav-button ${activeClass}" type="button" data-tab="${tab}">${label}</button>`;
}

function renderTab(snapshot, activeTab, currentPlayer) {
  switch (activeTab) {
    case 'weekly_game':
      return renderWeeklyGame(snapshot, currentPlayer);
    case 'players':
      return renderPlayersScreen(snapshot, currentPlayer, buildPlayersView(snapshot), editingPlayerId);
    case 'championship':
      return renderChampionship(snapshot);
    case 'config':
      return renderConfig(snapshot, currentPlayer);
    case 'home':
    default:
      return renderHome(snapshot, currentPlayer);
  }
}

function renderHome(snapshot, currentPlayer) {
  const workingSnapshot = snapshot;
  const activePlayer = workingSnapshot.players.find((player) => String(player.id) === String(currentPlayer.id)) || currentPlayer;

  const gameView = buildGameView(workingSnapshot, activePlayer.id);
  const game = gameView.game;
  const confirmedCount = gameView.confirmedCount;
  const maxPlayers = gameView.maxPlayers || 0;
  const fillPercent = maxPlayers ? Math.min(100, Math.round((confirmedCount / maxPlayers) * 100)) : 0;
  const vagasRestantes = gameView.spotsLeft;
  const mensalidade = buildMensalidadeMeta(game, activePlayer);
  const carneStatus = workingSnapshot.carne.some((entry) => String(entry.player_id) === String(activePlayer.id) && entry.active);
  const confirmed = gameView.isConfirmed;
  const presenceGuard = canManagePresence(activePlayer, game);
  const capacityOk = confirmed || gameView.canConfirm || hasCapacity();
  const canRenderPresenceAction = confirmed || (presenceGuard.ok && capacityOk);
  const statusNote = !confirmed && !capacityOk
    ? 'O jogo já está cheio.'
    : presenceGuard.ok
      ? ''
      : presenceGuard.message;
  const presenceFeedback = buildPresenceFeedback({
    confirmed,
    capacityOk,
    presenceGuard,
    currentPlayer: activePlayer,
    carneStatus,
  });

  return `
    <section class="section-stack">
      <section class="hero-card">
        <div class="hero-label">Próximo jogo</div>
        <div class="hero-date">${formatDate(game?.game_date)}</div>
        <div class="hero-meta">${game?.game_time || '--:--'} · ${game?.open ? 'Inscrições abertas' : 'Inscrições fechadas'}</div>
        <div class="hero-progress">
          <div class="progress-track">
            <div class="progress-bar" style="width:${fillPercent}%"></div>
          </div>
          <div class="progress-text">${confirmedCount} / ${maxPlayers} confirmados</div>
        </div>
      </section>

      <section class="card">
        <div class="card-title">Usuário logado</div>
        <div class="session-card compact">
          <div class="session-main">
            <div class="avatar avatar-lg">${getInitials(activePlayer.name)}</div>
            <div>
              <div class="row-title">${activePlayer.name}</div>
              <div class="row-subtitle">${activePlayer.is_admin ? 'Administrador' : activePlayer.role === 'carne' ? 'Somente carne' : getPositionLabel(activePlayer.position)} · ${formatPhone(activePlayer.phone)}</div>
            </div>
          </div>
          <div class="chip-row">
            <span class="tag ${activePlayer.role === 'carne' || activePlayer.mens_ok === true ? 'is-ok' : 'is-warn'}">${activePlayer.role === 'carne' || activePlayer.mens_ok === true ? 'Mensalidade ok' : 'Mensalidade pendente'}</span>
            <span class="tag is-neutral">${carneStatus ? 'Grupo da carne ativo' : 'Sem grupo da carne'}</span>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-title">Confirmação de presença</div>
        <div class="info-block">
          <div class="chip-row" style="margin-bottom:12px;">
            <span class="tag ${presenceFeedback.toneClass}">${presenceFeedback.badge}</span>
          </div>
          <div class="info-line">Vagas restantes: <strong>${vagasRestantes}</strong></div>
          <div class="info-line">Seu status atual: <strong>${confirmed ? 'Confirmado' : 'Não confirmado'}</strong></div>
          <div class="status-box ${presenceFeedback.toneClass}" style="margin-top:12px;">
            <div class="status-title">${presenceFeedback.icon} ${presenceFeedback.title}</div>
            <div class="status-subline">${presenceFeedback.text}</div>
          </div>
          ${statusNote && statusNote !== presenceFeedback.text ? `<p class="footer-note">${statusNote}</p>` : ''}
          ${canRenderPresenceAction ? `
            <div class="actions" style="margin-top:12px;">
              <button class="btn btn-primary" type="button" id="confirm-btn">${confirmed ? 'Cancelar presença' : 'Confirmar presença'}</button>
            </div>
          ` : ''}
        </div>
      </section>

      <section class="status-box ${mensalidade.className}">
        <div class="status-title">Mensalidade · ${mensalidade.title}</div>
        <div class="status-subline">${mensalidade.subline}</div>
      </section>

      <section class="card">
        <div class="card-title">Notificações recentes</div>
        <div class="info-block">
          ${workingSnapshot.notifications.map((notification) => `
            <div class="info-line">• ${notification.message}</div>
          `).join('')}
        </div>
      </section>
    </section>
  `;
}

function renderWeeklyGame(snapshot, currentPlayer) {
  return `
    <section class="section-stack">
      <section class="hero-card">
        <div class="hero-label">Jogo da semana</div>
        <div class="hero-date">${formatDate(snapshot.game?.game_date)}</div>
        <div class="hero-meta">${snapshot.game?.game_time || '--:--'} · ${snapshot.game?.open ? 'Inscrições abertas' : 'Inscrições fechadas'}</div>
      </section>

      ${renderPresenceList(snapshot, currentPlayer)}

      ${renderTeamDraw(snapshot, currentPlayer)}
    </section>
  `;
}

function renderChampionship(snapshot) {
  const ranking = snapshot.championship?.ranking || [];

  return `
    <section class="section-stack">
      <section class="card">
        <div class="card-title">Campeonato atual</div>
        <div class="info-block">
          <div class="info-line">Período iniciado em ${formatDate(snapshot.championship?.start_date)}</div>
          <div class="info-line">Status: ${snapshot.championship?.closed ? 'Encerrado' : 'Ativo'}</div>
        </div>
      </section>

      <section class="card">
        <div class="card-title">Ranking</div>
        <div class="placeholder-list">
          ${ranking.map((item, index) => {
            const player = snapshot.players.find((entry) => entry.id === item.player_id);
            return `
              <div class="placeholder-row">
                <div class="placeholder-main">
                  <div class="avatar">${index + 1}</div>
                  <div>
                    <div class="row-title">${player?.name || 'Jogador removido'}</div>
                    <div class="row-subtitle">Pontuação acumulada</div>
                  </div>
                </div>
                <div class="tag is-neutral">${item.points} pts</div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    </section>
  `;
}

function buildTeamDrawShareText(snapshot) {
  const sortResult = snapshot.game?.sort_result;
  if (!sortResult) return '';

  const playerById = new Map((snapshot.players || []).map((player) => [player.id, player]));
  const game = snapshot.game || {};
  const formatTeam = (label, ids = []) => {
    const lines = ids.map((id, index) => {
      const player = playerById.get(id);
      const name = player?.name || 'Jogador removido';
      const position = getPositionLabel(player?.position);
      return `${index + 1}. ${name} (${position})`;
    });

    return [`${label}:`, ...lines].join('\n');
  };

  return [
    '⚽ Times do Harmonia',
    `Jogo: ${formatDate(game.game_date)} às ${game.game_time || '--:--'}`,
    '',
    formatTeam('Time A', sortResult.team_a),
    '',
    formatTeam('Time B', sortResult.team_b),
  ].join('\n');
}

async function copyTeamDrawToClipboard() {
  const snapshot = getState();
  const text = buildTeamDrawShareText(snapshot);

  if (!text) {
    showToast('Nenhum sorteio disponível para copiar.', 'error');
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    showToast('Times copiados.');
  } catch (error) {
    console.error(error);
    showToast('Não foi possível copiar automaticamente.', 'error');
  }
}

function renderPresenceList(snapshot, currentPlayer) {
  const adminMode = !!currentPlayer?.is_admin;
  const confirmedIds = new Set(
    (snapshot.confirmations || [])
      .filter((entry) => entry?.confirmed)
      .map((entry) => entry.player_id)
  );

  const footballPlayers = (snapshot.players || [])
    .filter((player) => player.plays_football !== false)
    .filter((player) => player.role !== 'carne')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));

  const confirmedPlayers = footballPlayers.filter((player) => confirmedIds.has(player.id));
  const pendingPlayers = footballPlayers.filter((player) => !confirmedIds.has(player.id));

  const renderMiniRow = (player, statusLabel, statusClass, confirmed = false) => `
    <div class="presence-mini-row">
      <div class="presence-mini-main">
        <div class="avatar">${getInitials(player.name)}</div>
        <div>
          <div class="row-title">${player.name}</div>
          <div class="row-subtitle">${getPositionLabel(player.position)} · ${formatPhone(player.phone)}</div>
        </div>
      </div>
      <div style="display:flex; gap:8px; align-items:center; justify-content:flex-end; flex-wrap:wrap;">
        <span class="tag ${statusClass}">${statusLabel}</span>
        ${adminMode && confirmed ? `<button class="btn btn-danger presence-remove-button" type="button" data-action="admin-remove-from-game" data-id="${player.id}">Remover</button>` : ''}
        ${adminMode && !confirmed ? `<button class="btn btn-primary presence-add-button" type="button" data-action="admin-add-to-game" data-id="${player.id}">Incluir</button>` : ''}
      </div>
    </div>
  `;

  return `
    <section class="card">
      <div class="card-title">Lista de presença</div>
      <div class="presence-list-grid">
        <div class="presence-list-column">
          <div class="presence-list-title">Confirmados (${confirmedPlayers.length})</div>
          <div class="presence-list-stack">
            ${confirmedPlayers.length
              ? confirmedPlayers.map((player) => renderMiniRow(player, 'Confirmado', 'is-ok', true)).join('')
              : '<div class="empty-inline">Nenhum jogador confirmado ainda.</div>'}
          </div>
        </div>

        <div class="presence-list-column">
          <div class="presence-list-title">Não confirmados (${pendingPlayers.length})</div>
          <div class="presence-list-stack">
            ${pendingPlayers.length
              ? pendingPlayers.map((player) => renderMiniRow(player, 'Pendente', 'is-neutral', false)).join('')
              : '<div class="empty-inline">Todos os jogadores confirmaram.</div>'}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderTeamDraw(snapshot, currentPlayer) {
  const sortResult = snapshot.game?.sort_result;
  const playerById = new Map((snapshot.players || []).map((player) => [player.id, player]));
  const confirmedCount = buildGameView(snapshot, currentPlayer?.id || null).confirmedCount;

  if (!sortResult) {
    return `
      <section class="card">
        <div class="card-title">Sorteio de times</div>
        <div class="info-block">
          <div class="info-line">• Confirmados disponíveis: ${confirmedCount}</div>
          <div class="info-line">• O sorteio usa apenas jogadores confirmados.</div>
        </div>
        ${currentPlayer?.is_admin ? `
          <div class="actions" style="margin-top:12px;">
            <button class="btn btn-primary" type="button" id="draw-teams-btn">Sortear times</button>
          </div>
        ` : '<p class="footer-note">Aguardando sorteio do administrador.</p>'}
      </section>
    `;
  }

  const isAdmin = currentPlayer?.is_admin === true || currentPlayer?.is_admin === 'true' || currentPlayer?.is_admin === 1 || currentPlayer?.is_admin === '1' || currentPlayer?.role === 'admin';

  const resolveDrawEntry = (entry) => {
    const id = (entry && typeof entry === 'object') ? entry.id : entry;
    const player = (entry && typeof entry === 'object') ? entry : playerById.get(id);
    return { id, player };
  };

  const renderTeam = (title, entries, teamKey) => `
    <div class="team-draw-box">
      <div class="team-draw-title">${title}</div>
      <div class="placeholder-list">
        ${(entries || []).map((entry) => {
          const { id, player } = resolveDrawEntry(entry);
          const targetLabel = teamKey === 'team_a' ? 'Time B' : 'Time A';
          return `
            <div class="placeholder-row team-draw-player-row">
              <div class="placeholder-main team-draw-player-main">
                <div class="avatar">${getInitials(player?.name || '?')}</div>
                <div class="team-draw-player-text">
                  <div class="row-title">${player?.name || 'Jogador removido'}</div>
                  <div class="row-subtitle">${getPositionLabel(player?.position)}</div>
                </div>
              </div>
              ${isAdmin && id && player ? `
                <button
                  class="team-inline-move-button"
                  type="button"
                  data-action="move-drawn-player"
                  data-player-id="${id}"
                  data-from-team="${teamKey}"
                  aria-label="Mover ${player.name || 'jogador'} para ${targetLabel}"
                  title="Mover para ${targetLabel}"
                >
                  ⇄
                  <span>Mover</span>
                </button>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  return `
    <section class="card">
      <div class="card-title">Sorteio de times</div>
      <div class="info-block">
        <div class="info-line">• Sorteado em: ${new Date(sortResult.created_at).toLocaleString('pt-BR')}</div>
        <div class="info-line">• Jogadores sorteados: ${sortResult.total_players}</div>
      </div>
      <div class="team-draw-grid">
        ${renderTeam('Time A', sortResult.team_a, 'team_a')}
        ${renderTeam('Time B', sortResult.team_b, 'team_b')}
      </div>
      ${currentPlayer?.is_admin ? `
        <div class="actions" style="margin-top:12px;">
          <button class="btn btn-secondary" type="button" id="copy-draw-btn">Copiar times</button>
          <button class="btn btn-secondary" type="button" id="clear-draw-btn">Limpar sorteio</button>
          <button class="btn btn-primary" type="button" id="draw-teams-btn">Sortear novamente</button>
        </div>
      ` : ''}
    </section>
  `;
}

function renderConfig(snapshot, currentPlayer) {
  if (!currentPlayer.is_admin) {
    return `
      <section class="section-stack">
        <section class="card">
          <div class="card-title">Acesso restrito</div>
          <p class="footer-note">Somente administradores podem acessar a configuração do sistema.</p>
        </section>
      </section>
    `;
  }

  const game = snapshot.game || {};
  const confirmedCount = buildGameView(snapshot, null).confirmedCount;
  const maxPlayers = Number(game.max_players || 10);

  return `
    <section class="section-stack">
      <section class="card">
        <div class="card-title">Configuração do jogo</div>
        <form id="game-config-form" class="player-admin-form">
          <label class="field-label">
            Data do jogo
            <input class="input" type="date" name="game_date" value="${game.game_date || ''}" />
          </label>

          <label class="field-label">
            Hora do jogo
            <input class="input" type="time" name="game_time" value="${game.game_time || ''}" />
          </label>

          <label class="field-label">
            Máximo de jogadores
            <input class="input" type="number" min="1" step="1" name="max_players" value="${maxPlayers}" />
          </label>

          <label class="field-label">
            Vencimento da mensalidade
            <input class="input" type="date" name="mens_expire_date" value="${game.mens_expire_date || ''}" />
          </label>

          <label class="checkbox-line">
            <input type="checkbox" name="open" ${game.open ? 'checked' : ''} />
            Inscrições abertas
          </label>

          <div class="player-admin-actions">
            <button class="btn btn-primary" type="submit">Salvar configuração</button>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-title">Resumo do jogo</div>
        <div class="info-block">
          <div class="info-line">• Data: ${formatDate(game.game_date)}</div>
          <div class="info-line">• Hora: ${game.game_time || '--:--'}</div>
          <div class="info-line">• Inscrições: ${game.open ? 'abertas' : 'fechadas'}</div>
          <div class="info-line">• Confirmados: ${confirmedCount} / ${maxPlayers}</div>
          <div class="info-line">• Vencimento mensalidade: ${game.mens_expire_date ? formatDate(game.mens_expire_date) : 'não definido'}</div>
        </div>
      </section>
    </section>
  `;
}
function buildMensalidadeMeta(game, currentPlayer) {
  if (currentPlayer.role === 'carne') {
    return {
      className: 'is-ok',
      title: 'Não aplicável',
      subline: 'Este perfil não participa da mensalidade do futebol.',
    };
  }

  if (currentPlayer.mens_ok !== true) {
    return {
      className: 'is-danger',
      title: 'Pendente',
      subline: 'Sua mensalidade está marcada como pendente no sistema. Você pode cancelar uma presença já confirmada, mas não pode confirmar novamente até regularizar.',
    };
  }

  return {
    className: 'is-ok',
    title: 'Em dia',
    subline: game?.mens_expire_date
      ? `Controle administrativo: ${formatDate(game.mens_expire_date)}.`
      : 'Mensalidade marcada como ok no sistema.',
  };
}

function buildHeaderSubtitle(currentPlayer) {
  const profile = currentPlayer.is_admin ? 'Administrador' : currentPlayer.role === 'carne' ? 'Perfil carne' : getPositionLabel(currentPlayer.position);
  return `${currentPlayer.name} · ${profile}`;
}

function formatDate(value) {
  if (!value) return '--/--/----';
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
}

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return digits;
}

function getPositionLabel(position) {
  const labels = { zag: 'Zagueiro', meia: 'Meia', atk: 'Atacante' };
  return labels[position] || 'Sem posição';
}

function getInitials(name) {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}
