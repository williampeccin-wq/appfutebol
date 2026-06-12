import { assertRuntimeEnvironmentAllowed } from '../domain/environment.guard.js';
import { auditPresenceProjection } from '../domain/presence.audit.js';
assertRuntimeEnvironmentAllowed();
window.HarmoniaPresenceAudit = () => auditPresenceProjection(getState());
window.__HARMONIA_BUILD__ = 'v1.71.5-foto';

function getDisplayVersion() {
  return String(APP_VERSION || '').replace(/^v/, '').split('-')[0];
}

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
let selfProfileEditOpen = false;


let uiActionInFlight = false;

// Dev/test hook: exposes centralized authorization decisions without leaking DB keys.
exposeAuthz(() => getCurrentPlayer());

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

async function reloadRemoteStateAfterCriticalOperation(fallbackSnapshot = null) {
  const freshState = await loadPersistedState();
  const safeSnapshot = repairManualSnapshot(freshState || fallbackSnapshot || getState());
  replaceState(safeSnapshot);
  saveLocalState(safeSnapshot);
  render(safeSnapshot);
  return safeSnapshot;
}

function showConfirmModal({
  title = 'Confirmar ação',
  message = 'Tem certeza que deseja continuar?',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  requiredText = '',
  requiredLabel = '',
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal-overlay';
    overlay.innerHTML = `
      <div class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <div class="confirm-modal-title" id="confirm-modal-title">${title}</div>
        <div class="confirm-modal-message">${message}</div>
        ${requiredText ? `
          <label class="confirm-modal-field">
            <span>${requiredLabel || `Digite "${requiredText}" para confirmar:`}</span>
            <input type="text" class="input" data-confirm-modal-input autocomplete="off" />
          </label>
        ` : ''}
        <div class="confirm-modal-actions">
          <button type="button" class="btn btn-secondary" data-confirm-modal="cancel">${cancelText}</button>
          <button type="button" class="btn btn-primary" data-confirm-modal="confirm" ${requiredText ? 'disabled' : ''}>${confirmText}</button>
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
      if (button.dataset.confirmModal === 'confirm' && button.disabled) return;
      cleanup(button.dataset.confirmModal === 'confirm');
    });

    const input = overlay.querySelector('[data-confirm-modal-input]');
    const confirmButton = overlay.querySelector('[data-confirm-modal="confirm"]');
    if (input && confirmButton) {
      input.addEventListener('input', () => {
        confirmButton.disabled = String(input.value || '').trim() !== String(requiredText || '').trim();
      });
    }

    document.addEventListener('keydown', handleKeydown);
    document.body.appendChild(overlay);
    (input || confirmButton)?.focus();
  });
}

function setPlayerFormMode(isEditing) {
  const submitButton = document.querySelector('[data-action="add-player"]');
  const cancelButton = document.getElementById('cancel-edit-button');
  const title = document.getElementById('player-management-title');
  const details = document.getElementById('player-form-details');
  const indicator = document.querySelector('.player-create-open-indicator');

  if (submitButton) submitButton.textContent = isEditing ? 'Salvar alteração' : 'Adicionar';
  if (cancelButton) cancelButton.style.display = isEditing ? 'inline-flex' : 'none';
  if (title) title.textContent = isEditing ? 'Editando jogador' : 'Novo jogador';
  if (indicator) indicator.style.display = isEditing ? 'none' : '';
  // Ao editar, o formulário precisa estar aberto para ser visível/preenchido.
  if (details && isEditing) details.open = true;
}

function resetPlayerForm() {
  const nameInput = document.getElementById("new-name");
  const phoneInput = document.getElementById("new-phone");
  const birthDateInput = document.getElementById("new-birthdate");
  const roleInput = document.getElementById("new-role");
  const positionInput = document.getElementById("new-position");
  const adminInput = document.getElementById("new-admin");
  const mensInput = document.getElementById("new-mens");
  const photoInput = document.getElementById("new-photo");

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
  if (photoInput) {
    photoInput.value = "";
    photoInput.dataset.photoDataUrl = "";
  }
  setPlayerPhotoPreview("", "");
  // Volta o formulário ao estado recolhido ("Novo jogador") após adicionar/cancelar.
  document.getElementById('player-form-details')?.removeAttribute('open');
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
  // enforceFinance: true -> a regra de bloqueio total (remover inadimplente
  // confirmado) só roda em ações explícitas do admin (marcar inadimplente,
  // salvar modo "total"), nunca no poll de sync. Ver state.guard.js.
  const repaired = validateAndRepairState(snapshot, { enforceFinance: true });
  if (repaired.warnings.length) {
    console.warn('[app] Reparos aplicados antes do save manual:', repaired.warnings);
  }
  // Após reparo (que pode REMOVER inadimplentes no "Bloqueio total"), promove a
  // fila para preencher vagas liberadas — mesma regra idempotente do load.
  const reconciled = reconcileWaitlistOnLoad(repaired.state);
  return reconciled.state;
}


function makeGameKeyFromForm(date, time) {
  const safeDate = String(date || '').replace(/[^0-9-]/g, '') || new Date().toISOString().slice(0, 10);
  const safeTime = String(time || '').replace(/[^0-9]/g, '') || '0000';
  return `game_${safeDate}_${safeTime}`;
}
function normalizeGameForList(game) { const key = getGameKey(game); return { ...(game || {}), id: game?.id || key, game_key: key }; }
function getCurrentGames(snapshot) { return getGames(snapshot).map(normalizeGameForList); }
function getActiveGameFromSnapshot(snapshot) { return normalizeGameForList(getActiveGame(snapshot)); }
function replaceGameInSnapshot(snapshot, updatedGame) {
  const normalized = normalizeGameForList(updatedGame);
  const games = getCurrentGames(snapshot);
  const exists = games.some((game) => String(game.game_key || game.id) === String(normalized.game_key));
  const nextGames = exists ? games.map((game) => String(game.game_key || game.id) === String(normalized.game_key) ? normalized : game) : [...games, normalized];
  return nextGames.sort((a,b)=>String(a.game_date||'').localeCompare(String(b.game_date||'')) || String(a.game_time||'').localeCompare(String(b.game_time||'')));
}
function scopedConfirmationsForApp(snapshot, game) { const key = getGameKey(game || getActiveGameFromSnapshot(snapshot)); return (snapshot.confirmations || []).filter((entry) => String(entry?.game_key || '') === key); }

function promoteWaitlistForGameCapacity(snapshot, game) {
  const key = getGameKey(game || getActiveGameFromSnapshot(snapshot));
  const maxPlayers = Number(game?.max_players || game?.maxPlayers || 0);

  if (!maxPlayers || maxPlayers < 1) {
    return Array.isArray(snapshot.confirmations) ? snapshot.confirmations : [];
  }

  const confirmations = Array.isArray(snapshot.confirmations) ? snapshot.confirmations : [];
  const scoped = confirmations.filter((entry) => String(entry?.game_key || '') === String(key));
  const others = confirmations.filter((entry) => String(entry?.game_key || '') !== String(key));

  const playersById = new Map((snapshot.players || []).map((player) => [String(player.id), player]));
  const isGoalkeeper = (player) => {
    const raw = String(player?.position || '').trim().toLowerCase();
    return raw === 'gol' || raw === 'goleiro';
  };

  const lineConfirmedCount = scoped
    .filter((entry) => entry?.confirmed)
    .filter((entry) => !isGoalkeeper(playersById.get(String(entry.player_id))))
    .length;

  let availableSlots = Math.max(maxPlayers - lineConfirmedCount, 0);
  if (!availableSlots) {
    return confirmations;
  }

  const now = new Date().toISOString();
  const waitlistEntries = scoped
    .filter((entry) => entry?.confirmed !== true)
    .filter((entry) => entry?.status === 'waitlist' || entry?.status === 'waitlisted')
    .sort((a, b) => {
      const posA = Number(a?.waitlist_position || 9999);
      const posB = Number(b?.waitlist_position || 9999);
      if (posA !== posB) return posA - posB;
      return String(a?.waitlisted_at || '').localeCompare(String(b?.waitlisted_at || ''));
    });

  const promoteIds = new Set(waitlistEntries.slice(0, availableSlots).map((entry) => String(entry.player_id)));

  const promotedScoped = scoped.map((entry) => (
    promoteIds.has(String(entry.player_id))
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
          game_key: key,
        }
      : entry
  ));

  const remainingWaitlist = promotedScoped
    .filter((entry) => entry?.confirmed !== true)
    .filter((entry) => entry?.status === 'waitlist' || entry?.status === 'waitlisted')
    .sort((a, b) => {
      const posA = Number(a?.waitlist_position || 9999);
      const posB = Number(b?.waitlist_position || 9999);
      if (posA !== posB) return posA - posB;
      return String(a?.waitlisted_at || '').localeCompare(String(b?.waitlisted_at || ''));
    })
    .map((entry, index) => ({ ...entry, waitlist_position: index + 1 }));

  const remainingById = new Map(remainingWaitlist.map((entry) => [String(entry.player_id), entry]));
  const normalizedScoped = promotedScoped.map((entry) => {
    const replacement = remainingById.get(String(entry.player_id));
    return replacement || entry;
  });

  return [...others, ...normalizedScoped.map((entry) => ({ ...entry, game_key: key }))];
}

// Assinatura semântica das confirmações (player_id + confirmado + status),
// ignorando diferenças de referência/ordem. Usada para detectar se a
// reconciliação por capacidade realmente mudou algo (promoveu alguém).
function confirmationsFingerprint(confirmations) {
  return (Array.isArray(confirmations) ? confirmations : [])
    .map((entry) => `${entry?.player_id}:${entry?.confirmed === true ? 1 : 0}:${String(entry?.status || '')}`)
    .sort()
    .join('|');
}

// Reconcilia a fila de espera do jogo ativo contra a capacidade de linha ao
// CARREGAR o estado. Antes, a promoção automática só rodava em três eventos
// (cancelar, remover por admin, editar o jogo); se uma vaga abrisse por
// qualquer outro caminho, o primeiro da fila ficava preso indefinidamente.
// Aqui aplicamos a mesma regra do form de editar jogo, de forma idempotente,
// para que uma vaga aberta nunca deixe alguém preso.
function reconcileWaitlistOnLoad(loadedState) {
  const game = getActiveGameFromSnapshot(loadedState);
  const reconciledConfirmations = promoteWaitlistForGameCapacity(loadedState, game);
  const changed = confirmationsFingerprint(loadedState?.confirmations)
    !== confirmationsFingerprint(reconciledConfirmations);
  if (!changed) {
    return { state: loadedState, changed: false };
  }
  return { state: { ...loadedState, confirmations: reconciledConfirmations }, changed: true };
}


function getCurrentSnapshotPlayer(snapshot) {
  return Array.isArray(snapshot?.players)
    ? snapshot.players.find((player) => String(player.id) === String(snapshot.session?.playerId))
    : null;
}

function requireAdmin(snapshot, message = 'Apenas administrador pode executar esta ação') {
  const current = getCurrentSnapshotPlayer(snapshot);
  if (!authzIsAdmin(current)) {
    showToast(message, 'error');
    return false;
  }
  return true;
}

function normalizeSelfPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeAdminPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatPhoneForInput(value) {
  const digits = normalizeAdminPhone(value).slice(0, 11);

  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function validatePhoneWithDDD(value) {
  const digits = normalizeAdminPhone(value);

  if (digits.length < 10 || digits.length > 11) {
    return {
      ok: false,
      digits,
      message: 'Informe um telefone válido com DDD. Use apenas números.',
    };
  }

  const ddd = digits.slice(0, 2);
  if (ddd === '00' || ddd[0] === '0') {
    return {
      ok: false,
      digits,
      message: 'Informe um DDD válido, sem zero inicial.',
    };
  }

  return { ok: true, digits, message: '' };
}

function bindPhoneOnlyInputs() {
  document.querySelectorAll('input[type="tel"]').forEach((input) => {
    if (input.dataset.phoneOnlyBound === '1') return;
    input.dataset.phoneOnlyBound = '1';
    input.inputMode = 'numeric';
    input.autocomplete = input.autocomplete || 'tel';

    input.addEventListener('input', () => {
      const formatted = formatPhoneForInput(input.value);
      input.value = formatted;
      const validation = validatePhoneWithDDD(formatted);
      input.setCustomValidity(validation.ok || !validation.digits ? '' : validation.message);
    });

    input.addEventListener('blur', () => {
      const validation = validatePhoneWithDDD(input.value);
      if (validation.digits && !validation.ok) {
        input.reportValidity?.();
      }
    });
  });
}


function normalizeSelfPosition(value) {
  return ['gol', 'zag', 'meia', 'atk'].includes(value) ? value : null;
}


function getPlayerPhoto(player) {
  return player?.photoDataUrl || '';
}

function openAvatarLightbox(src, alt) {
  if (!src) return;
  const previous = document.getElementById('avatar-lightbox');
  if (previous) previous.remove();

  const overlay = document.createElement('div');
  overlay.id = 'avatar-lightbox';
  overlay.className = 'avatar-lightbox';
  overlay.innerHTML = `
    <button class="avatar-lightbox-close" type="button" aria-label="Fechar">&times;</button>
    <img class="avatar-lightbox-img" src="${src}" alt="${escapeHtml(alt || 'Foto')}" />
  `;

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (event) => { if (event.key === 'Escape') close(); };

  overlay.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
}

// Listener único e delegado (capture): tocar numa foto de avatar abre a
// ampliação. Não é registrado por render — sobrevive aos re-renders.
function bindAvatarLightbox() {
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const photoWrap = target.closest('.avatar-photo');
    if (!photoWrap) return;
    const img = photoWrap.querySelector('img');
    if (!img || !img.getAttribute('src')) return;
    // Evita disparar handlers de linha/card ao tocar na foto.
    event.preventDefault();
    event.stopPropagation();
    openAvatarLightbox(img.getAttribute('src'), img.getAttribute('alt'));
  }, true);
}

function renderAvatarForApp(player, extraClass = '') {
  const photo = getPlayerPhoto(player);
  const initials = getInitials(player?.name);

  if (photo) {
    return `<div class="avatar avatar-photo ${extraClass}"><img src="${photo}" alt="Foto de ${escapeHtml(player?.name || 'jogador')}" loading="lazy" /></div>`;
  }

  return `<div class="avatar ${extraClass}">${initials}</div>`;
}


function isGoalkeeperPlayerForApp(player) {
  const raw = String(player?.position || '').trim().toLowerCase();
  return raw === 'gol' || raw === 'goleiro';
}

function getActiveRentalGoalkeepersForApp(snapshot) {
  const game = getActiveGameFromSnapshot(snapshot);
  return Array.isArray(game?.rental_goalkeepers) ? game.rental_goalkeepers : [];
}

function buildConfirmedPresenceShareText(snapshot) {
  const game = getActiveGameFromSnapshot(snapshot);
  const confirmedIds = new Set(
    (snapshot.confirmations || [])
      .filter((entry) => entry?.confirmed)
      .filter((entry) => String(entry?.game_key || getGameKey(game)) === String(getGameKey(game)))
      .map((entry) => String(entry.player_id))
  );

  const players = (snapshot.players || []).filter((player) => confirmedIds.has(String(player.id)));
  const goalkeepers = players.filter(isGoalkeeperPlayerForApp);
  const linePlayers = players.filter((player) => !isGoalkeeperPlayerForApp(player));
  const rentalGoalkeepers = getActiveRentalGoalkeepersForApp(snapshot);

  const lines = [
    '⚽ Presença Harmonia FC',
    `Jogo: ${formatDate(game.game_date)} às ${game.game_time || '--:--'}`,
    '',
    `🧤 Goleiros (${goalkeepers.length + rentalGoalkeepers.length}/2):`,
    ...(goalkeepers.length || rentalGoalkeepers.length
      ? [
          ...goalkeepers.map((player, index) => `${index + 1}. ${player.name}`),
          ...rentalGoalkeepers.map((entry, index) => `${goalkeepers.length + index + 1}. ${entry.name} (aluguel)`),
        ]
      : ['Nenhum goleiro confirmado.']),
    '',
    `✅ Linha (${linePlayers.length}):`,
    ...(linePlayers.length
      ? linePlayers.map((player, index) => `${index + 1}. ${player.name}`)
      : ['Nenhum jogador de linha confirmado.']),
  ];

  return lines.join('\n');
}

async function copyConfirmedPresenceToClipboard() {
  const snapshot = getState();
  const text = buildConfirmedPresenceShareText(snapshot);

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

    showToast('Lista de presença copiada.');
  } catch (error) {
    console.error(error);
    showToast('Não foi possível copiar automaticamente.', 'error');
  }
}


function readAndResizePlayerPhoto(file, maxSize = 360, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }

    if (!String(file.type || '').startsWith('image/')) {
      reject(new Error('Selecione um arquivo de imagem.'));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(new Error('Imagem inválida.'));
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width || 1, image.height || 1));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', quality));
      };

      image.src = String(reader.result || '');
    };

    reader.readAsDataURL(file);
  });
}

function setPlayerPhotoPreview(photoDataUrl = '', name = '') {
  const preview = document.getElementById('new-photo-preview');
  if (!preview) return;

  if (photoDataUrl) {
    preview.innerHTML = `<img src="${photoDataUrl}" alt="Foto de ${escapeHtml(name || 'jogador')}" />`;
    preview.classList.add('has-photo');
  } else {
    preview.innerHTML = 'Foto';
    preview.classList.remove('has-photo');
  }
}


function setSelfPhotoPreview(photoDataUrl = '', name = '') {
  const preview = document.getElementById('self-photo-preview');
  if (!preview) return;

  if (photoDataUrl) {
    preview.innerHTML = `<img src="${photoDataUrl}" alt="Foto de ${escapeHtml(name || 'jogador')}" />`;
    preview.classList.add('has-photo');
  } else {
    preview.innerHTML = 'Foto';
    preview.classList.remove('has-photo');
  }
}


function hydratePlayerEditForm(playerToEdit) {
  if (!playerToEdit) return;

  const nameInput = document.getElementById("new-name");
  const phoneInput = document.getElementById("new-phone");
  const birthDateInput = document.getElementById("new-birthdate");
  const roleInput = document.getElementById("new-role");
  const positionInput = document.getElementById("new-position");
  const adminInput = document.getElementById("new-admin");
  const mensInput = document.getElementById("new-mens");
  const photoInput = document.getElementById("new-photo");

  if (!nameInput || !phoneInput || !birthDateInput || !roleInput || !positionInput || !adminInput || !mensInput) return;

  nameInput.value = playerToEdit.name || "";
  phoneInput.value = playerToEdit.phone || "";
  birthDateInput.value = playerToEdit.birthDate || "";
  roleInput.value = playerToEdit.plays_football === false ? "carne" : "player";
  roleInput.dispatchEvent(new Event("change", { bubbles: true }));
  positionInput.value = playerToEdit.position || "meia";
  adminInput.checked = !!playerToEdit.is_admin;
  mensInput.checked = !!playerToEdit.mens_ok;

  const currentPhotoDataUrl = getPlayerPhoto(playerToEdit);
  if (photoInput) {
    photoInput.value = "";
    photoInput.dataset.photoDataUrl = currentPhotoDataUrl || "";
  }
  setPlayerPhotoPreview(currentPhotoDataUrl || "", playerToEdit.name || "");
  setPlayerFormMode(true);
}

function bindPlayerPhotoInput() {
  const input = document.getElementById('new-photo');

  if (!input || input.dataset.boundPlayerPhoto === '1') {
    return;
  }

  input.dataset.boundPlayerPhoto = '1';

  input.addEventListener('change', async () => {
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    try {
      const dataUrl = await readAndResizePlayerPhoto(file);
      input.dataset.photoDataUrl = dataUrl;
      setPlayerPhotoPreview(dataUrl, document.getElementById('new-name')?.value || '');

      if (editingPlayerId) {
        const currentSnapshot = structuredClone(getState());
        currentSnapshot.players = (currentSnapshot.players || []).map((player) => {
          if (String(player.id) !== String(editingPlayerId)) return player;
          return {
            ...player,
            photoDataUrl: dataUrl,
          };
        });

        const safeSnapshot = repairManualSnapshot(currentSnapshot);
        replaceState(safeSnapshot);
        savePersistedState(safeSnapshot);

        setTimeout(() => {
          const updatedSnapshot = getState();
          const updatedPlayer = (updatedSnapshot.players || []).find((player) => String(player.id) === String(editingPlayerId));
          hydratePlayerEditForm(updatedPlayer);
        }, 0);

        showToast('Foto do jogador salva.');
      }
    } catch (error) {
      input.value = '';
      input.dataset.photoDataUrl = '';
      showToast(error.message || 'Não foi possível carregar a foto.', 'error');
    }
  });
}


function bindSelfPhotoInput() {
  const input = document.getElementById('self-photo');

  if (!input || input.dataset.boundSelfPhoto === '1') {
    return;
  }

  input.dataset.boundSelfPhoto = '1';

  input.addEventListener('change', async () => {
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    try {
      const dataUrl = await readAndResizePlayerPhoto(file);
      input.dataset.photoDataUrl = dataUrl;

      const snapshot = structuredClone(getState());
      const currentPlayerId = snapshot.session?.playerId;

      if (!currentPlayerId) {
        showToast('Sessão inválida. Faça login novamente.', 'error');
        return;
      }

      snapshot.players = (snapshot.players || []).map((player) => {
        if (String(player.id) !== String(currentPlayerId)) return player;
        return {
          ...player,
          photoDataUrl: dataUrl,
        };
      });

      const safeSnapshot = repairManualSnapshot(snapshot);
      replaceState(safeSnapshot);
      savePersistedState(safeSnapshot);
      setSelfPhotoPreview(dataUrl, document.getElementById('self-name')?.value || '');
      showToast('Sua foto foi salva.');
    } catch (error) {
      input.value = '';
      input.dataset.photoDataUrl = '';
      showToast(error.message || 'Não foi possível carregar a foto.', 'error');
    }
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderSelfProfileEditCardForHome(activePlayer) {
  if (!selfProfileEditOpen) return '';

  return `
      <section class="card self-profile-card" id="self-profile-card">
        <div class="card-title">Editar meu cadastro</div>
        <div class="self-profile-form">
          <label class="form-group">
            <span class="form-label">Nome</span>
            <input id="self-name" class="input" type="text" placeholder="Nome completo" value="${escapeHtml(activePlayer.name || '')}" autocomplete="name" />
          </label>

          <label class="form-group">
            <span class="form-label">Telefone</span>
            <input id="self-phone" class="input" type="tel" placeholder="(48) 99999-9999" value="${escapeHtml(formatPhone(activePlayer.phone || ''))}" autocomplete="tel" />
          </label>

          <label class="form-group">
            <span class="form-label">Nascimento</span>
            <input id="self-birthdate" class="input" type="date" value="${escapeHtml(activePlayer.birthDate || '')}" />
          </label>

          <label class="player-photo-upload self-photo-upload">
            <span class="player-photo-preview ${getPlayerPhoto(activePlayer) ? 'has-photo' : ''}" id="self-photo-preview">
              ${getPlayerPhoto(activePlayer) ? `<img src="${getPlayerPhoto(activePlayer)}" alt="Foto de ${escapeHtml(activePlayer.name || 'jogador')}" />` : 'Foto'}
            </span>
            <span class="player-photo-upload-copy">
              <strong>Foto do meu perfil</strong>
              <small>Selecionar ou trocar minha foto</small>
            </span>
            <input id="self-photo" type="file" accept="image/*" />
          </label>

          ${activePlayer.plays_football === false ? '' : `
            <label class="form-group">
              <span class="form-label">Posição</span>
              <select id="self-position" class="input">
                <option value="gol" ${activePlayer.position === 'gol' ? 'selected' : ''}>Goleiro</option>
                <option value="zag" ${activePlayer.position === 'zag' ? 'selected' : ''}>Zagueiro</option>
                <option value="meia" ${activePlayer.position === 'meia' ? 'selected' : ''}>Meia</option>
                <option value="atk" ${activePlayer.position === 'atk' ? 'selected' : ''}>Atacante</option>
              </select>
            </label>
          `}

          <div class="self-profile-note">
            Você pode alterar nome, telefone, nascimento e posição. Mensalidade, perfil, grupo da carne e permissão de admin continuam restritos ao administrador.
          </div>

          <div class="password-change-card">
            <div class="password-change-title">Alterar senha</div>

            <label class="form-group">
              <span class="form-label">Senha atual</span>
              <input id="change-password-current" class="input" type="password" autocomplete="current-password" />
            </label>

            <label class="form-group">
              <span class="form-label">Nova senha</span>
              <input id="change-password-new" class="input" type="password" autocomplete="new-password" />
            </label>

            <label class="form-group">
              <span class="form-label">Confirmar nova senha</span>
              <input id="change-password-confirm" class="input" type="password" autocomplete="new-password" />
            </label>

            <button class="btn btn-secondary" type="button" id="change-own-password-button">
              Salvar nova senha
            </button>
          </div>

          <div class="self-profile-actions">
            <button class="btn btn-primary" type="button" data-action="update-self-profile">Salvar</button>
            <button class="btn btn-secondary" type="button" data-action="toggle-self-profile-edit">Cancelar</button>
          </div>
        </div>
      </section>
`;
}


const DEFAULT_CARNE_SCHEDULE = [
  ['2026-05-19', 'PANGA', 'ADRIEL'],
  ['2026-05-13', 'SOLI', 'MALVADEZA'],
  ['2026-05-20', 'DICÃO', 'GUILHERME'],
  ['2026-05-27', 'ADRIANO', 'NINIU'],
  ['2026-06-03', 'DICK', 'LUQUINHA'],
  ['2026-06-10', 'WILLIAM', 'TELO'],
  ['2026-06-17', 'VINÍ', 'PH'],
  ['2026-06-24', 'CAETANO', 'PAULO'],
  ['2026-07-01', 'BAHIA', 'TROCHINHO'],
  ['2026-07-08', 'DAVID', 'MATEUS'],
  ['2026-07-15', 'MARIO', 'VINICIUS'],
  ['2026-07-22', 'JÚNIOR', 'SAMUEL'],
  ['2026-07-29', 'BROCA', 'BROQUINHA'],
  ['2026-08-05', 'ANDRÉ', 'CAUÊ'],
  ['2026-08-12', 'GEDIMITO', 'VITOR'],
];

function normalizeCarneScheduleName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

function getCarneScheduleEntriesForApp(snapshot) {
  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const rawEntries = Array.isArray(snapshot?.carne) ? snapshot.carne : [];
  const savedSchedule = rawEntries
    .filter((entry) => entry?.type === 'carne_schedule')
    .map((entry, index) => ({
      id: String(entry.id || `carne_schedule_${index}`),
      type: 'carne_schedule',
      date: String(entry.date || ''),
      player1_id: String(entry.player1_id || ''),
      player2_id: String(entry.player2_id || ''),
      active: entry.active !== false,
    }))
    .filter((entry) => entry.date && entry.player1_id && entry.player2_id);

  if (savedSchedule.length) {
    return savedSchedule.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  const playersByName = new Map();
  players.forEach((player) => {
    playersByName.set(normalizeCarneScheduleName(player.name), player);
  });

  return DEFAULT_CARNE_SCHEDULE
    .map(([date, name1, name2], index) => {
      const player1 = playersByName.get(normalizeCarneScheduleName(name1));
      const player2 = playersByName.get(normalizeCarneScheduleName(name2));
      if (!player1 || !player2) return null;
      return {
        id: `seed_carne_schedule_${index}`,
        type: 'carne_schedule',
        date,
        player1_id: String(player1.id),
        player2_id: String(player2.id),
        active: true,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function persistCarneSchedule(snapshot, scheduleEntries) {
  const nonScheduleEntries = Array.isArray(snapshot.carne)
    ? snapshot.carne.filter((entry) => entry?.type !== 'carne_schedule')
    : [];

  snapshot.carne = [
    ...nonScheduleEntries,
    ...scheduleEntries
      .filter((entry) => entry?.date && entry?.player1_id && entry?.player2_id)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((entry, index) => ({
        id: String(entry.id || `carne_schedule_${Date.now()}_${index}`),
        type: 'carne_schedule',
        date: String(entry.date),
        player1_id: String(entry.player1_id),
        player2_id: String(entry.player2_id),
        active: entry.active !== false,
      })),
  ];
}

function resetCarneScheduleForm() {
  const idInput = document.getElementById('carne-schedule-id');
  const dateInput = document.getElementById('carne-schedule-date');
  const player1Input = document.getElementById('carne-schedule-player-1');
  const player2Input = document.getElementById('carne-schedule-player-2');
  const title = document.getElementById('carne-schedule-form-title');
  const cancelButton = document.getElementById('cancel-carne-schedule-edit-button');
  const saveButton = document.querySelector('[data-action="save-carne-schedule"]');

  if (idInput) idInput.value = '';
  if (dateInput) dateInput.value = '';
  if (player1Input) player1Input.value = '';
  if (player2Input) player2Input.value = '';
  if (title) title.textContent = 'Cadastrar dupla da carne';
  if (cancelButton) cancelButton.style.display = 'none';
  if (saveButton) saveButton.textContent = 'Salvar dupla';
}

document.addEventListener("click", async (e) => {
  const trigger = e.target.closest("[data-action]");
  if (!trigger) return;

  const action = trigger.dataset.action;
  if (!action) return;
  if (uiActionInFlight && action !== "cancel-edit") return;
  const id = trigger.dataset.id || "";

  const snapshot = structuredClone(getState());
  if (Array.isArray(snapshot.players)) {
    snapshot.players = snapshot.players.map(normalizePlayer);
  }
  if (!Array.isArray(snapshot.players)) return;


  if (action === "select-active-game") {
    e.preventDefault();
    e.stopPropagation();
    const selected = getCurrentGames(snapshot).find((game) => String(getGameKey(game)) === String(id));
    if (!selected) { showToast("Jogo não encontrado.", "error"); return; }
    patchState({ game: selected, active_game_id: getGameKey(selected) });
    showToast("Jogo ativo alterado.");
    return;
  }

  if (action === "toggle-self-profile-edit") {
    const currentPlayer = getCurrentSnapshotPlayer(snapshot);
    if (!currentPlayer) {
      showToast("Sessão inválida. Faça login novamente.", "error");
      return;
    }

    selfProfileEditOpen = !selfProfileEditOpen;
    render(snapshot);

    if (selfProfileEditOpen) {
      setTimeout(() => {
        document.getElementById("self-profile-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("self-name")?.focus();
      }, 0);
    }
    return;
  }

  if (action === "save-carne-schedule") {
    const current = snapshot.players.find((p) => p.id === snapshot.session?.playerId);
    if (!authzIsAdmin(current)) {
      showToast("Apenas administrador pode alterar a tabela da carne", "error");
      return;
    }

    const scheduleId = document.getElementById('carne-schedule-id')?.value?.trim();
    const date = document.getElementById('carne-schedule-date')?.value?.trim();
    const player1Id = document.getElementById('carne-schedule-player-1')?.value?.trim();
    const player2Id = document.getElementById('carne-schedule-player-2')?.value?.trim();

    if (!date || !player1Id || !player2Id) {
      showToast("Data e dois responsáveis são obrigatórios", "error");
      return;
    }

    if (player1Id === player2Id) {
      showToast("A dupla precisa ter dois jogadores diferentes", "error");
      return;
    }

    const player1Exists = snapshot.players.some((player) => String(player.id) === String(player1Id));
    const player2Exists = snapshot.players.some((player) => String(player.id) === String(player2Id));

    if (!player1Exists || !player2Exists) {
      showToast("Só é possível selecionar jogadores cadastrados", "error");
      return;
    }

    uiActionInFlight = true;
    setActionBusy(trigger, scheduleId ? 'Salvando...' : 'Cadastrando...');

    const schedule = getCarneScheduleEntriesForApp(snapshot);
    const normalizedId = scheduleId || `carne_schedule_${Date.now()}`;
    const nextEntry = {
      id: normalizedId,
      type: 'carne_schedule',
      date,
      player1_id: player1Id,
      player2_id: player2Id,
      active: true,
    };

    const updatedSchedule = schedule.some((entry) => String(entry.id) === String(normalizedId))
      ? schedule.map((entry) => String(entry.id) === String(normalizedId) ? nextEntry : entry)
      : [...schedule, nextEntry];

    persistCarneSchedule(snapshot, updatedSchedule);
    const safeSnapshot = repairManualSnapshot(snapshot);
    savePersistedState(safeSnapshot);
    resetCarneScheduleForm();
    render(safeSnapshot);
    uiActionInFlight = false;
    showToast(scheduleId ? "Dupla atualizada" : "Dupla cadastrada", "success");
    return;
  }

  if (action === "edit-carne-schedule") {
    const current = snapshot.players.find((p) => p.id === snapshot.session?.playerId);
    if (!authzIsAdmin(current)) {
      showToast("Apenas administrador pode editar a tabela da carne", "error");
      return;
    }

    const entry = getCarneScheduleEntriesForApp(snapshot).find((item) => String(item.id) === String(id));
    if (!entry) return;

    const idInput = document.getElementById('carne-schedule-id');
    const dateInput = document.getElementById('carne-schedule-date');
    const player1Input = document.getElementById('carne-schedule-player-1');
    const player2Input = document.getElementById('carne-schedule-player-2');
    const title = document.getElementById('carne-schedule-form-title');
    const cancelButton = document.getElementById('cancel-carne-schedule-edit-button');
    const saveButton = document.querySelector('[data-action="save-carne-schedule"]');
    const card = document.getElementById('carne-schedule-form-card');

    if (!idInput || !dateInput || !player1Input || !player2Input) return;

    idInput.value = entry.id;
    dateInput.value = entry.date;
    player1Input.value = entry.player1_id;
    player2Input.value = entry.player2_id;
    if (title) title.textContent = 'Editando dupla da carne';
    if (cancelButton) cancelButton.style.display = 'inline-flex';
    if (saveButton) saveButton.textContent = 'Salvar alteração';
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    dateInput.focus();
    return;
  }

  if (action === "cancel-carne-schedule-edit") {
    resetCarneScheduleForm();
    showToast("Edição da dupla cancelada", "success");
    return;
  }

  if (action === "delete-carne-schedule") {
    const current = snapshot.players.find((p) => p.id === snapshot.session?.playerId);
    if (!authzIsAdmin(current)) {
      showToast("Apenas administrador pode excluir dupla da carne", "error");
      return;
    }

    const schedule = getCarneScheduleEntriesForApp(snapshot);
    const entry = schedule.find((item) => String(item.id) === String(id));
    if (!entry) return;

    const confirmedDelete = await showConfirmModal({
      title: 'Excluir dupla da carne',
      message: 'Tem certeza que deseja excluir esta dupla da tabela?',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
    });

    if (!confirmedDelete) return;

    uiActionInFlight = true;
    setActionBusy(trigger, 'Excluindo...');

    persistCarneSchedule(snapshot, schedule.filter((item) => String(item.id) !== String(id)));
    const safeSnapshot = repairManualSnapshot(snapshot);
    savePersistedState(safeSnapshot);
    render(safeSnapshot);
    uiActionInFlight = false;
    showToast("Dupla removida", "success");
    return;
  }


  if (action === "save-championship-result") {
    const current = snapshot.players.find((p) => p.id === snapshot.session?.playerId);
    if (!authzIsAdmin(current)) {
      showToast("Apenas administrador pode lançar resultado do campeonato", "error");
      return;
    }

    const date = document.getElementById('championship-result-date')?.value?.trim();
    if (!date) {
      showToast("Informe a data do jogo", "error");
      return;
    }

    const outcome = document.getElementById('championship-team-outcome')?.value;
    const drawId = document.getElementById('championship-draw-id')?.value || null;
    const builtResult = buildTeamResultStatuses(snapshot, outcome, drawId);

    if (!builtResult.ok) {
      showToast(builtResult.message || "Resultado inválido", "error");
      return;
    }

    uiActionInFlight = true;
    setActionBusy(trigger, 'Salvando...');

    persistChampionshipResult(snapshot, {
      id: globalThis.crypto?.randomUUID ? `championship_result_${globalThis.crypto.randomUUID()}` : `championship_result_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      date,
      outcome: builtResult.outcome,
      draw_id: builtResult.draw_id,
      game_key: builtResult.game_key,
      team_a: builtResult.team_a,
      team_b: builtResult.team_b,
      statuses: builtResult.statuses,
    });

    const safeSnapshot = repairManualSnapshot(snapshot);
    await Promise.resolve(savePersistedState(safeSnapshot));
    render(safeSnapshot);
    uiActionInFlight = false;
    showToast("Resultado lançado e classificação recalculada", "success");
    return;
  }

  if (action === "delete-championship-result") {
    const current = snapshot.players.find((p) => p.id === snapshot.session?.playerId);
    if (!authzIsAdmin(current)) {
      showToast("Apenas administrador pode excluir resultado do campeonato", "error");
      return;
    }

    const confirmedDelete = await showConfirmModal({
      title: 'Excluir resultado',
      message: 'Excluir este resultado do campeonato? A classificação será recalculada automaticamente.',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
    });

    if (!confirmedDelete) return;

    uiActionInFlight = true;
    setActionBusy(trigger, 'Excluindo...');

    deleteChampionshipResult(snapshot, id);
    const safeSnapshot = repairManualSnapshot(snapshot);
    await Promise.resolve(savePersistedState(safeSnapshot));
    render(safeSnapshot);
    uiActionInFlight = false;
    showToast("Resultado removido e classificação recalculada", "success");
    return;
  }

  if (action === "add-player") {
  if (!requireAdmin(snapshot, 'Apenas administrador pode gerenciar jogadores')) return;
  uiActionInFlight = true;
  setActionBusy(trigger, editingPlayerId ? "Salvando..." : "Adicionando...");
  const name = document.getElementById("new-name")?.value?.trim();
  const phoneRaw = document.getElementById("new-phone")?.value?.trim();
  const phone = normalizeAdminPhone(phoneRaw);
  const birthDate = document.getElementById("new-birthdate")?.value?.trim();
  const role = document.getElementById("new-role")?.value;
  const position = document.getElementById("new-position")?.value;
  const is_admin = document.getElementById("new-admin")?.checked;
  const mens_ok = document.getElementById("new-mens")?.checked;
  const photoDataUrl = document.getElementById("new-photo")?.dataset?.photoDataUrl || "";

  if (!name || !phone || !birthDate) {
    clearActionBusy(trigger);
    uiActionInFlight = false;
    alert("Nome, telefone e data de nascimento são obrigatórios");
    return;
  }

  if (phone.length < 10 || phone.length > 11) {
    clearActionBusy(trigger);
    uiActionInFlight = false;
    alert("Informe um telefone válido com DDD. Use apenas números.");
    return;
  }

  if (snapshot.players.some((p) => normalizeAdminPhone(p.phone) === phone && String(p.id) !== String(editingPlayerId))) {
    clearActionBusy(trigger);
    uiActionInFlight = false;
    alert("Telefone duplicado");
    return;
  }

  const isEditing = !!editingPlayerId;

  if (!isEditing) {
    const deletedPhoneExistsLocally = Array.isArray(snapshot.deleted_player_phones) && snapshot.deleted_player_phones.includes(phone);
    if (deletedPhoneExistsLocally && !requireCriticalOperationAllowed('restaurar jogador excluído', trigger)) {
      clearActionBusy(trigger);
      uiActionInFlight = false;
      return;
    }

    const restoreResult = await restoreDeletedPlayerByPhoneOperation(phone, {
      name,
      phone,
      birthDate,
      plays_football: role === "player",
      in_carne_group: true,
      position: role === "player" ? position : null,
      mens_ok: role === "player" ? !!mens_ok : false,
      is_admin: !!is_admin,
      ...(photoDataUrl ? { photoDataUrl } : {}),
    });

    if (restoreResult.ok) {
      const remoteResult = await loadRemoteState();
      const nextSnapshot = remoteResult.ok && remoteResult.state ? repairManualSnapshot(remoteResult.state) : repairManualSnapshot({
        ...snapshot,
        players: [
          ...snapshot.players.filter((player) => normalizeAdminPhone(player.phone) !== phone),
          restoreResult.player,
        ],
        deleted_player_ids: Array.isArray(snapshot.deleted_player_ids)
          ? snapshot.deleted_player_ids.filter((playerId) => String(playerId) !== String(restoreResult.player?.id || ''))
          : [],
        deleted_player_phones: Array.isArray(snapshot.deleted_player_phones)
          ? snapshot.deleted_player_phones.filter((deletedPhone) => normalizeAdminPhone(deletedPhone) !== phone)
          : [],
      });

      replaceState(nextSnapshot);
      saveLocalState(nextSnapshot);
      editingPlayerId = null;
      setPlayerFormMode(false);
      resetPlayerForm();
      clearActionBusy(trigger);
      uiActionInFlight = false;
      showToast("Jogador restaurado com sucesso", "success");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (restoreResult.reason && restoreResult.reason !== 'deleted_player_not_found_for_phone') {
      console.warn('[players] Falha ao verificar/restaurar jogador excluído:', restoreResult);
      clearActionBusy(trigger);
      uiActionInFlight = false;
      showToast("Não foi possível verificar jogador excluído com este telefone. Tente novamente.", "error");
      return;
    }
  }

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
    if (photoDataUrl) {
      playerToEdit.photoDataUrl = photoDataUrl;
    }
  } else {
    snapshot.players.push({
      id: "p_" + Date.now(),
      name,
      phone,
      birthDate,
      plays_football: role === "player",
      in_carne_group: true,
      position: role === "player" ? position : null,
      mens_ok: role === "player" ? !!mens_ok : false,
      is_admin: !!is_admin,
      photoDataUrl,
      active: true,
      deleted: false
    });
  }

  const safeSnapshot = repairManualSnapshot(snapshot);
  replaceState(safeSnapshot);
  savePersistedState(safeSnapshot);
  editingPlayerId = null;
  setPlayerFormMode(false);
  resetPlayerForm();
  uiActionInFlight = false;
  showToast(isEditing ? "Jogador atualizado com sucesso" : "Jogador adicionado", "success");
  window.scrollTo({ top: 0, behavior: "smooth" });
  return;
}

  if (action === "edit-player") {
  if (!requireAdmin(snapshot, 'Apenas administrador pode editar jogadores')) return;
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
  hydratePlayerEditForm(playerToEdit);
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


if (action === "update-self-profile") {
  const currentPlayer = getCurrentSnapshotPlayer(snapshot);
  if (!currentPlayer) {
    showToast("Sessão inválida. Faça login novamente.", "error");
    return;
  }

  uiActionInFlight = true;
  setActionBusy(trigger, "Salvando...");

  const name = document.getElementById("self-name")?.value?.trim();
  const phoneValidation = validatePhoneWithDDD(document.getElementById("self-phone")?.value);
  const phone = phoneValidation.digits;
  const birthDate = document.getElementById("self-birthdate")?.value?.trim();
  const positionInput = document.getElementById("self-position");
  const selfPhotoDataUrl = document.getElementById("self-photo")?.dataset?.photoDataUrl || "";
  const position = currentPlayer.plays_football === false ? currentPlayer.position : normalizeSelfPosition(positionInput?.value);

  if (!name || !phone || !birthDate) {
    clearActionBusy(trigger);
    uiActionInFlight = false;
    alert("Nome, telefone e data de nascimento são obrigatórios");
    return;
  }

  if (phone.length < 10 || phone.length > 11) {
    clearActionBusy(trigger);
    uiActionInFlight = false;
    alert("Informe um telefone válido");
    return;
  }

  if (currentPlayer.plays_football !== false && !position) {
    clearActionBusy(trigger);
    uiActionInFlight = false;
    alert("Selecione a posição em campo");
    return;
  }

  const duplicatePhone = snapshot.players.some((player) => normalizeSelfPhone(player.phone) === phone && player.id !== currentPlayer.id);
  if (duplicatePhone) {
    clearActionBusy(trigger);
    uiActionInFlight = false;
    alert("Telefone duplicado");
    return;
  }

  snapshot.players = snapshot.players.map((player) => {
    if (player.id !== currentPlayer.id) return player;
    return {
      ...player,
      name,
      phone,
      birthDate,
      position: player.plays_football === false ? player.position : position,
      photoDataUrl: selfPhotoDataUrl || player.photoDataUrl || '',
    };
  });

  const safeSnapshot = repairManualSnapshot(snapshot);
  replaceState(safeSnapshot);
  savePersistedState(safeSnapshot);
  selfProfileEditOpen = false;
  uiActionInFlight = false;
  showToast("Cadastro atualizado com sucesso", "success");
  return;
}



if (action === "create-player-access") {
  if (!requireAdmin(snapshot, "Apenas administrador pode criar acesso")) return;
  if (!requireCriticalOperationAllowed('criar acesso de jogador', trigger)) return;

  const player = snapshot.players.find((p) => String(p.id) === String(id));
  if (!player) {
    showToast("Jogador não encontrado.", "error");
    return;
  }

  if (player.auth_user_id) {
    showToast("Este jogador já tem acesso criado.", "error");
    return;
  }

  const newPassword = window.prompt(`Senha inicial para ${player.name}:`);
  if (!newPassword) return;

  const adminSecret = window.prompt("Informe o segredo admin para criar acesso:");
  if (!adminSecret) return;

  setActionBusy(trigger, "Criando...");

  try {
    const result = await createPlayerAccessOperation({ player, newPassword, adminSecret });
    clearActionBusy(trigger);

    if (!result.ok) {
      showToast(result.message || "Falha ao criar acesso.", "error");
      console.warn("[players] create access failed", result);
      return;
    }

    await reloadRemoteStateAfterCriticalOperation(snapshot);
    showToast(result.message || "Acesso criado com sucesso.", "success");
  } catch (error) {
    clearActionBusy(trigger);
    showToast(error?.message || "Erro inesperado.", "error");
  }

  return;
}


if (action === "reset-player-password") {
  if (!requireAdmin(snapshot, "Apenas administrador pode resetar senha")) return;
  if (!requireCriticalOperationAllowed('resetar senha de jogador', trigger)) return;

  const player = snapshot.players.find((p) => String(p.id) === String(id));
  if (!player) {
    showToast("Jogador não encontrado.", "error");
    return;
  }

  const newPassword = window.prompt(`Nova senha para ${player.name}:`);
  if (!newPassword) return;

  const adminSecret = window.prompt("Informe o segredo admin da recuperação de senha:");
  if (!adminSecret) return;

  setActionBusy(trigger, "Resetando...");

  try {
    const result = await resetPlayerPasswordOperation({ player, newPassword, adminSecret });
    clearActionBusy(trigger);

    if (!result.ok) {
      showToast(result.message || "Falha ao resetar senha.", "error");
      console.warn("[players] reset password failed", result);
      return;
    }

    await reloadRemoteStateAfterCriticalOperation(snapshot);
    showToast(result.message || "Senha resetada com sucesso.", "success");
  } catch (error) {
    clearActionBusy(trigger);
    showToast(error?.message || "Erro inesperado.", "error");
  }

  return;
}


if (action === "delete-player") {
  if (!requireAdmin(snapshot, 'Apenas administrador pode excluir jogadores')) return;
  if (!requireCriticalOperationAllowed('excluir jogador', trigger)) return;

  const player = snapshot.players.find((p) => String(p.id) === String(id));
  if (!player) return;

  const currentPlayerId = snapshot.session?.playerId;

  const typedName = await showConfirmModal({
    title: 'Excluir jogador',
    message: `Essa é uma operação crítica. Para excluir ${player.name}, digite exatamente o nome do jogador abaixo.`,
    confirmText: 'Excluir jogador',
    cancelText: 'Cancelar',
    requiredText: player.name,
    requiredLabel: `Digite exatamente "${player.name}" para confirmar a exclusão:`,
  });

  if (!typedName) return;

  uiActionInFlight = true;
  setActionBusy(trigger, 'Excluindo...');

  try {
    const result = await deletePlayerOperation({
      player,
      currentPlayerId,
      allPlayers: snapshot.players,
      confirmationText: player.name,
    });

    clearActionBusy(trigger);
    uiActionInFlight = false;

    if (!result.ok) {
      showToast(result.message || 'Não foi possível excluir o jogador.', 'error');
      console.warn('[players] delete operation failed', result);
      return;
    }

    await reloadRemoteStateAfterCriticalOperation(snapshot);
    showToast(result.message || 'Jogador removido.', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    clearActionBusy(trigger);
    uiActionInFlight = false;
    showToast(error?.message || 'Erro inesperado ao excluir jogador.', 'error');
  }

  return;
}


if (action === "admin-remove-from-game") {
  const current = snapshot.players.find((p) => p.id === snapshot.session?.playerId);
  const player = snapshot.players.find((p) => p.id === id);

  if (!authzIsAdmin(current)) {
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

  if (!authzIsAdmin(current)) {
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

  const result = toggleConfirmation(id, { bypassFinance: true });
  const safeSnapshot = repairManualSnapshot(getState());
  savePersistedState(safeSnapshot);
  render(safeSnapshot);

  uiActionInFlight = false;
  showToast(result.message, result.ok ? "success" : "error");
  return;
}



  if (action === "mark-paid" || action === "mark-debt") {
    if (!requireAdmin(snapshot, 'Apenas administrador pode alterar mensalidade')) return;
    const currentSnapshot = structuredClone(getState());
    if (Array.isArray(currentSnapshot.players)) {
      currentSnapshot.players = currentSnapshot.players.map(normalizePlayer);
    }

    const player = currentSnapshot.players.find(p => p.id === id);
    if (!player) return;

    uiActionInFlight = true;
    setActionBusy(trigger, action === "mark-paid" ? "Salvando..." : "Atualizando...");

    player.mens_ok = action === "mark-paid";

    const safeSnapshot = repairManualSnapshot(currentSnapshot);

    // Critical: update the canonical in-memory state. Calling render() directly here
    // would redraw the UI without changing core/state.js, so the next fast click
    // could be based on a stale snapshot and revert the previous mensalidade change.
    replaceState(safeSnapshot);

    uiActionInFlight = false;
    showToast(action === "mark-paid" ? "Mensalidade marcada como paga" : "Jogador marcado como inadimplente", "success");
    return;
  }
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

import { buildGameView, buildPlayersView, getGames, getActiveGame, getGameKey } from "../domain/projection.js";
import { classifyGameConfirmations } from "../domain/confirmations.js";
import { validateAndRepairState } from "../domain/state.guard.js";
import { getMensalidadeMode, MENSALIDADE_MODES } from "../domain/rules.engine.js";
import { APP_VERSION } from "./version.js";
import { getState, patchState, replaceState, subscribe } from './state.js';
import { getState as loadPersistedState, saveState as savePersistedState, getStorageMeta, hasPendingRemoteWrites } from '../domain/storage.adapter.js';
import { saveLocalState } from '../services/storage.local.js';
import { loadRemoteState } from '../services/storage.supabase.js';
import { createPlayerAccessOperation, deletePlayerOperation, resetPlayerPasswordOperation, restoreDeletedPlayerByPhoneOperation } from '../modules/players/player-operations.service.js';
import { getCurrentPlayer, login, logout, register, restoreSession, prepareStoredSession, updateOwnPassword } from '../services/auth.service.js';
import { renderAuthScreen } from '../modules/auth/auth.view.js';
import { renderPlayersScreen, renderCarneScreen } from '../modules/players/players.view.js';
import { renderChampionshipScreen } from '../modules/championship/championship.view.js';
import { buildTeamResultStatuses, deleteChampionshipResult, persistChampionshipResult } from '../modules/championship/championship.service.js';
import { canManagePresence, isConfirmed, toggleConfirmation, drawTeams, clearTeamDraw, moveDrawnPlayer, adminRemovePlayerFromGame, getWaitlistView, addRentalGoalkeeper, removeRentalGoalkeeper, addConfirmedPlayerToDraw } from '../modules/game/game.service.js';
import { hasCapacity } from '../modules/game/game.service.js';
import { canConfirm } from '../modules/finance/finance.service.js';
import { canAccessConfig, canManageCarne, canManageChampionship, canManageFinance, canManagePlayers, canManagePresence as canManagePresenceAuthz, exposeAuthz, getPlayerRole, isAdmin as authzIsAdmin, isCarneOnly as authzIsCarneOnly } from '../domain/authz.js';
import { SUPABASE_CONFIG } from "../config/supabase.config.js";
import { assertCriticalOperationAllowed, isLocalhostWithProdSupabase, getRuntimeSupabaseConfig } from '../services/environment.guard.js';

const appElement = document.getElementById('app');

const REMOTE_SYNC_INTERVAL_MS = 4000;
let isApplyingRemoteState = false;
let lastDomainFingerprint = '';

// Rede de segurança global: erros não tratados (síncronos ou de promessas) não
// devem passar despercebidos. Apenas registram no console — a recuperação de
// "tela branca" é feita pelos try/catch de init()/render() abaixo.
window.addEventListener('unhandledrejection', (event) => {
  console.error('[harmonia] Promessa não tratada:', event.reason);
});
window.addEventListener('error', (event) => {
  console.error('[harmonia] Erro não tratado:', event.error || event.message);
});

// Tela de fallback quando init()/render() lançam: evita ficar preso no boot
// screen ou com a tela em branco, e oferece recarregar.
function renderFatalError() {
  try {
    appElement.innerHTML = `
      <div class="fatal-screen">
        <div class="fatal-card">
          <div class="fatal-title">Ops, algo deu errado</div>
          <p class="fatal-text">O app encontrou um erro inesperado ao desenhar a tela. Seus dados continuam salvos. Tente recarregar.</p>
          <button class="btn btn-primary" type="button" onclick="window.location.reload()">Recarregar</button>
        </div>
      </div>`;
  } catch (_) {
    appElement.textContent = 'Erro ao carregar. Recarregue a página.';
  }
}

init();


function displayEnvironmentSafetyBanner() {
  if (!isLocalhostWithProdSupabase()) return;
  if (document.querySelector('[data-env-safety-banner="prod-local"]')) return;

  const config = getRuntimeSupabaseConfig();
  const banner = document.createElement('div');
  banner.dataset.envSafetyBanner = 'prod-local';
  banner.className = 'env-safety-banner env-safety-banner--danger';
  banner.textContent = `⚠ Localhost conectado ao PROD (${config.environment || 'prod'}). Escritas críticas estão bloqueadas.`;
  document.body.prepend(banner);
}

function requireCriticalOperationAllowed(operation, trigger = null) {
  const guard = assertCriticalOperationAllowed(operation);
  if (guard.ok) return true;
  if (trigger) clearActionBusy(trigger);
  showToast(guard.message, 'error');
  console.warn('[safety] blocked critical operation', guard);
  return false;
}

async function init() {
  try {
    await initInner();
  } catch (err) {
    console.error('[harmonia] Falha no boot do app:', err);
    renderFatalError();
  }
}

async function initInner() {
  displayEnvironmentSafetyBanner();
  await prepareStoredSession();

  // Auth gate:
  // 1. Validate Supabase Auth first.
  // 2. If the stored auth session is invalid, restoreSession() clears it.
  // 3. Only after that do we load persisted state, avoiding unauthenticated REST calls on the login screen.
  await restoreSession();

  if (!getCurrentPlayer()) {
    const data = await loadPersistedState();
    replaceState(data);
  }

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
  bindAvatarLightbox();

  window.addEventListener('harmonia:storage-full', () => {
    showToast('Armazenamento do aparelho cheio. Os dados seguem salvos no servidor; considere remover fotos grandes.', 'error');
  });

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
    snapshot.game &&
    typeof snapshot.game === 'object' &&
    Array.isArray(snapshot.confirmations)
  );
}

// Sessão do Supabase Auth expirou e o refresh falhou (401/403 nas chamadas REST).
// Encerra a sessão local e leva ao login, em vez de deixar o polling repetir o
// erro indefinidamente. Após o logout, getCurrentPlayer() fica nulo e o guarda
// no topo do polling interrompe naturalmente as chamadas.
async function handleExpiredSession() {
  if (!getCurrentPlayer()) return;
  console.warn('[auth] Sessão do Supabase expirou (401/403). Encerrando sessão e voltando ao login.');
  await logout();
  patchState({ ui: { authMode: 'login', authMessage: { type: 'info', text: 'Sua sessão expirou por segurança. Faça login novamente para continuar.' } } });
}

function startRemoteSync() {
  window.setInterval(async () => {
    try {
      // Never poll Supabase REST while the user is not operationally authenticated.
      // With RLS closed, polling on the login screen correctly produces 401.
      if (!getCurrentPlayer()) {
        return;
      }

      // Há escrita local ainda não confirmada no servidor: aplicar o remoto
      // agora reverteria a edição do usuário (lost update). Pula este ciclo;
      // quando a escrita drenar, o próximo ciclo sincroniza normalmente.
      if (hasPendingRemoteWrites()) {
        return;
      }

      const localSnapshot = getState();
      const remote = await loadRemoteState();

      if (!remote.ok || !isValidRemoteDomainSnapshot(remote.state)) {
        // Sessão do Supabase morta (token expirado/refresh inválido): em vez de
        // ficar batendo 401 a cada ciclo, encerra a sessão e volta ao login.
        if (remote.status === 401 || remote.status === 403) {
          await handleExpiredSession();
        }
        return;
      }

      const repairedRemote = validateAndRepairState(remote.state);
      let safeRemoteState = repairedRemote.state;

      if (repairedRemote.warnings.length) {
        console.warn('[remote-sync] Reparos aplicados antes de comparar estado remoto:', repairedRemote.warnings);
      }

      // Auto-promoção da fila ao carregar: se o jogo ativo tem vaga de linha
      // aberta e alguém na fila, promove e persiste o estado curado de volta,
      // para o DB convergir e a fila não ficar presa em nenhum cliente.
      const reconciled = reconcileWaitlistOnLoad(safeRemoteState);
      safeRemoteState = reconciled.state;
      if (reconciled.changed) {
        savePersistedState(safeRemoteState);
        console.info('[remote-sync] Fila reconciliada: jogador(es) promovido(s) por vaga aberta.');
      }

      const currentFingerprint = getDomainFingerprint(localSnapshot);
      const remoteFingerprint = getDomainFingerprint(safeRemoteState);

      if (!remoteFingerprint || remoteFingerprint === currentFingerprint) {
        lastDomainFingerprint = currentFingerprint;
        return;
      }

      // Reverificação: durante o await acima o usuário pode ter disparado uma
      // escrita. Não sobrepor a edição local pendente.
      if (hasPendingRemoteWrites()) {
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
  // Qualquer throw aqui apagaria a tela (innerHTML) sem repintar. O try/catch
  // garante uma tela de erro recuperável em vez de "tela branca" travada.
  try {
    renderInner(snapshot);
  } catch (err) {
    console.error('[harmonia] Falha ao renderizar a tela:', err);
    renderFatalError();
  }
}

function renderInner(snapshot) {
  // Fonte única: o mesmo buildGameView que alimenta a home e a tela de jogo.
  // Antes este banner somava confirmações de TODOS os jogos e incluía
  // goleiros/carne, divergindo do resto da home e do banco.
  const headerView = buildGameView(snapshot, null);
  const confirmedCount = headerView.confirmedCount;
  const maxPlayers = headerView.maxPlayers || 0;

  const currentPlayer = getCurrentPlayer();

  if (!currentPlayer) {
    appElement.innerHTML = renderAuthScreen(snapshot.ui);
    bindAuthEvents();
    bindPhoneOnlyInputs();
    return;
  }

  const requestedTab = snapshot.ui.currentTab || 'home';
  const activeTab = !canAccessConfig(currentPlayer) && requestedTab === 'config' ? 'home' : requestedTab;
  if (activeTab !== requestedTab) {
    patchState({ ui: { currentTab: activeTab } });
    return;
  }

  appElement.innerHTML = `
    <div class="header">
      <div class="header-row">
        <div class="brand-lockup">
          <img class="brand-crest" src="./assets/harmonia-crest.jpeg" alt="Escudo Harmonia">
          <div>
            <div class="header-title">HARMONIA <span style='font-size:12px;opacity:0.7;'>${getDisplayVersion()}</span></div>
            <div class="header-subtitle">${buildHeaderSubtitle(currentPlayer)}</div>
          </div>
        </div>
        <div class="header-actions">
          <div class="header-badge">${authzIsAdmin(currentPlayer) ? 'Admin' : getPlayerRole(currentPlayer) === 'carne' ? 'Carne' : 'Jogador'}</div>
          <button class="header-logout" type="button" id="logout-button">Sair</button>
        </div>
      </div>
    </div>

    <main class="content content--${activeTab}">
      <div style="padding:10px;font-weight:bold;">
${confirmedCount} / ${maxPlayers} jogadores de linha confirmados
</div>
${renderTab(snapshot, activeTab, currentPlayer)}
    </main>

    ${renderBottomNav(activeTab, currentPlayer)}
  `;

  bindAppEvents(currentPlayer);
  bindPhoneOnlyInputs();
  bindPlayerPhotoInput();
  bindSelfPhotoInput();
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
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const submitButton = loginForm.querySelector('button[type="submit"]');
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Entrando...'; }
      const result = await login(formData.get('phone'), formData.get('password'));
      if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Entrar'; }
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

    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      const submitButton = registerForm.querySelector('button[type="submit"]');
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Criando...'; }
      const result = await register({
        name: formData.get('name'),
        phone: formData.get('phone'),
        birthDate: formData.get('birthDate'),
        role: formData.get('role'),
        position: formData.get('position'),
        password: formData.get('password'),
        passwordConfirm: formData.get('passwordConfirm'),
      });

      if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Criar cadastro'; }

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
  appElement.querySelector('#logout-button')?.addEventListener('click', async () => { await logout(); });

  appElement.querySelector('#change-own-password-button')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const currentPassword = document.getElementById("change-password-current")?.value || "";
    const newPassword = document.getElementById("change-password-new")?.value || "";
    const confirmPassword = document.getElementById("change-password-confirm")?.value || "";

    setActionBusy(button, "Salvando...");

    const result = await updateOwnPassword(currentPassword, newPassword, confirmPassword);

    clearActionBusy(button);

    if (!result.ok) {
      showToast(result.message || "Não foi possível alterar a senha.", "error");
      return;
    }

    document.getElementById("change-password-current").value = "";
    document.getElementById("change-password-new").value = "";
    document.getElementById("change-password-confirm").value = "";

    showToast("Senha alterada com sucesso.", "success");
  });


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

  appElement.querySelector('#copy-payments-btn')?.addEventListener('click', () => {
    copyPaymentsToClipboard();
  });

  appElement.querySelector('#copy-confirmed-btn')?.addEventListener('click', () => {
    copyConfirmedPresenceToClipboard();
  });

  appElement.querySelector('#add-rental-goalkeeper-btn')?.addEventListener('click', () => {
    const input = document.getElementById('rental-goalkeeper-name');
    const result = addRentalGoalkeeper(input?.value || '');
    if (result.ok && input) input.value = '';
    const safeSnapshot = repairManualSnapshot(getState());
    savePersistedState(safeSnapshot);
    render(safeSnapshot);
    showToast(result.message, result.ok ? 'success' : 'error');
  });

  appElement.querySelectorAll('[data-action="remove-rental-goalkeeper"]').forEach((button) => {
    button.addEventListener('click', () => {
      const result = removeRentalGoalkeeper(button.dataset.id);
      const safeSnapshot = repairManualSnapshot(getState());
      savePersistedState(safeSnapshot);
      render(safeSnapshot);
      showToast(result.message, result.ok ? 'success' : 'error');
    });
  });

  appElement.querySelectorAll('[data-action="move-drawn-player"]').forEach((button) => {
    button.addEventListener('click', () => {
      const result = moveDrawnPlayer(button.dataset.playerId, button.dataset.fromTeam);
      showToast(result.message, result.ok ? 'success' : 'error');
    });
  });

  appElement.querySelectorAll('[data-action="add-player-to-draw"]').forEach((button) => {
    button.addEventListener('click', () => {
      const result = addConfirmedPlayerToDraw(button.dataset.playerId, button.dataset.team);
      const safeSnapshot = repairManualSnapshot(getState());
      savePersistedState(safeSnapshot);
      render(safeSnapshot);
      showToast(result.message, result.ok ? 'success' : 'error');
    });
  });

  appElement.querySelectorAll('[data-game-config-form="edit-game"]').forEach((gameConfigForm) => {
    gameConfigForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const formData = new FormData(gameConfigForm);
      const maxPlayers = Number(formData.get('max_players'));
      const originalGameKey = String(formData.get('game_key') || gameConfigForm.dataset.gameKey || '');

      if (!originalGameKey) {
        showToast('Jogo não identificado.', 'error');
        return;
      }

      if (!Number.isFinite(maxPlayers) || maxPlayers < 1) {
        showToast('Informe um limite de jogadores válido.', 'error');
        return;
      }

      const currentState = getState();
      const currentGames = getCurrentGames(currentState);
      const existingGame = currentGames.find((item) => String(getGameKey(item)) === originalGameKey);

      if (!existingGame) {
        showToast('Jogo não encontrado.', 'error');
        return;
      }

      const updatedGame = {
        ...(existingGame || {}),
        id: originalGameKey,
        game_key: originalGameKey,
        game_date: String(formData.get('game_date') || ''),
        game_time: String(formData.get('game_time') || ''),
        max_players: maxPlayers,
        open: formData.get('open') === 'on',
      };

      const activeGameKey = getGameKey(getActiveGameFromSnapshot(currentState));
      const isActiveGame = originalGameKey === activeGameKey;

      const promotedConfirmations = promoteWaitlistForGameCapacity(currentState, updatedGame);

      patchState({
        confirmations: promotedConfirmations,
        game: isActiveGame ? updatedGame : getActiveGameFromSnapshot(currentState),
        games: replaceGameInSnapshot(currentState, updatedGame),
        active_game_id: activeGameKey,
      });

      showToast(isActiveGame ? 'Jogo ativo atualizado.' : 'Jogo atualizado. O jogo ativo não foi alterado.');
    });
  });

  const createGameForm = appElement.querySelector('#create-game-form');
  if (createGameForm) {
    createGameForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const formData = new FormData(createGameForm);
      const maxPlayers = Number(formData.get('max_players'));
      const gameDate = String(formData.get('game_date') || '');
      const gameTime = String(formData.get('game_time') || '');

      if (!gameDate) {
        showToast('Informe a data do novo jogo.', 'error');
        return;
      }

      if (!gameTime) {
        showToast('Informe o horário do novo jogo.', 'error');
        return;
      }

      if (!Number.isFinite(maxPlayers) || maxPlayers < 1) {
        showToast('Informe um limite de jogadores válido para o novo jogo.', 'error');
        return;
      }

      const currentState = getState();
      const newGameKey = makeGameKeyFromForm(gameDate, gameTime);
      const existingGame = getCurrentGames(currentState).find((item) => String(getGameKey(item)) === String(newGameKey));

      if (existingGame) {
        patchState({ game: existingGame, active_game_id: getGameKey(existingGame) });
        showToast('Esse jogo já existia e foi selecionado como ativo.');
        return;
      }

      const newGame = {
        id: newGameKey,
        game_key: newGameKey,
        game_date: gameDate,
        game_time: gameTime,
        max_players: maxPlayers,
        open: formData.get('open') === 'on',
        sort_result: null,
        draw_history: [],
      };

      patchState({
        game: newGame,
        games: replaceGameInSnapshot(currentState, newGame),
        active_game_id: newGameKey,
      });

      createGameForm.reset();
      showToast('Novo jogo criado e selecionado como ativo.');
    });
  }

  const mensalidadeForm = appElement.querySelector('#mensalidade-config-form');
  if (mensalidadeForm) {
    mensalidadeForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!requireAdmin(getState(), 'Apenas administrador pode alterar a mensalidade')) return;
      const formData = new FormData(mensalidadeForm);
      const mensExpireDate = String(formData.get('mens_expire_date') || '').slice(0, 10);
      const rawMode = String(formData.get('mens_enforcement_mode') || '');
      const mensMode = [MENSALIDADE_MODES.PARTIAL, MENSALIDADE_MODES.TOTAL].includes(rawMode) ? rawMode : MENSALIDADE_MODES.NONE;
      patchState({ settings: { ...(getState().settings || {}), mens_expire_date: mensExpireDate, mens_enforcement_mode: mensMode } });
      // Aplica imediatamente a regra (no "total" pode remover inadimplentes e
      // promover a fila) e persiste/renderiza no padrão das demais ações admin.
      const safeSnapshot = repairManualSnapshot(getState());
      savePersistedState(safeSnapshot);
      render(safeSnapshot);
      const modeLabel = mensMode === MENSALIDADE_MODES.TOTAL ? 'Bloqueio total' : mensMode === MENSALIDADE_MODES.PARTIAL ? 'Bloqueio parcial' : 'Sem bloqueio';
      showToast(`Mensalidade salva. Regra: ${modeLabel}.`);
    });
  }


  const notificationsForm = appElement.querySelector('#notifications-config-form');
  if (notificationsForm) {
    notificationsForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const formData = new FormData(notificationsForm);
      const adminNotification = String(formData.get('admin_notification') || '').trim();
      const currentState = getState();
      const otherNotifications = Array.isArray(currentState.notifications)
        ? currentState.notifications.filter((item) => item?.type !== 'admin')
        : [];

      patchState({
        notifications: adminNotification
          ? [{ type: 'admin', message: adminNotification, created_at: new Date().toISOString() }, ...otherNotifications]
          : otherNotifications,
      });

      showToast(adminNotification ? 'Notificação geral salva.' : 'Notificação geral removida.');
    });
  }
}

function renderNavButton(tab, label, activeTab) {
  const activeClass = tab === activeTab ? 'is-active' : '';
  return `<button class="nav-button ${activeClass}" type="button" data-tab="${tab}">${label}</button>`;
}

const BOTTOM_NAV_ICONS = {
  home: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>',
  weekly_game: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.7h-5L8 10z"/></svg>',
  players: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M18 13.7a5.5 5.5 0 0 1 3.5 6.3"/></svg>',
  carne: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3v6a2 2 0 0 0 2 2v10"/><path d="M8 3v5"/><path d="M16 3c-1.6 0-2.6 2-2.6 5s1 4 2.6 4v9"/></svg>',
  championship: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11"/><path d="M17 6h3v1.5A3.5 3.5 0 0 1 16.5 11"/><path d="M9 21h6"/><path d="M12 14v7"/></svg>',
  config: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"/></svg>',
};

function renderBottomNav(activeTab, currentPlayer) {
  const items = [
    ['home', 'Home'],
    ['weekly_game', 'Jogo da semana'],
    ['players', 'Jogadores'],
    ['carne', 'Carne'],
    ['championship', 'Campeonato'],
  ];
  if (canAccessConfig(currentPlayer)) items.push(['config', 'Config']);

  return `
    <nav class="bottom-nav" aria-label="Navegação principal">
      ${items.map(([tab, label]) => `
        <button class="bnav-btn ${tab === activeTab ? 'is-active' : ''}" type="button" data-tab="${tab}" aria-label="${label}" title="${label}">
          ${BOTTOM_NAV_ICONS[tab] || ''}
        </button>
      `).join('')}
    </nav>
  `;
}

function renderTab(snapshot, activeTab, currentPlayer) {
  switch (activeTab) {
    case 'weekly_game':
      return renderWeeklyGame(snapshot, currentPlayer);
    case 'players':
      return renderPlayersScreen(snapshot, currentPlayer, buildPlayersView(snapshot), editingPlayerId);
    case 'carne':
      return renderCarneScreen(snapshot, currentPlayer, buildPlayersView(snapshot), editingPlayerId);
    case 'championship':
      return renderChampionshipScreen(snapshot, currentPlayer);
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
  const waitlistView = getWaitlistView(workingSnapshot);
  const waitlistCount = waitlistView.length;
  const fillPercent = maxPlayers ? Math.min(100, Math.round((confirmedCount / maxPlayers) * 100)) : 0;
  const mensalidade = buildMensalidadeMeta(game, activePlayer, getMensalidadeMode(workingSnapshot.settings));
  const carneScheduleEntries = getCarneScheduleEntriesForApp(workingSnapshot);
  const carneStatus =
    workingSnapshot.carne.some((entry) => String(entry?.player_id || '') === String(activePlayer.id) && entry?.active !== false) ||
    carneScheduleEntries.some((entry) =>
      entry?.active !== false &&
      (
        String(entry?.player1_id || '') === String(activePlayer.id) ||
        String(entry?.player2_id || '') === String(activePlayer.id)
      )
    );
  const confirmed = gameView.isConfirmed;
  const waitlisted = gameView.isWaitlisted;
  const waitlistPosition = gameView.waitlistPosition;
  const presenceGuard = canManagePresence(activePlayer, game);
  const capacityOk = confirmed || gameView.canConfirm || hasCapacity();
  // Bloqueio por inadimplência (modo parcial/total, após o vencimento). Só vale
  // como CTA visível quando as inscrições estão abertas e o jogador ainda não
  // está confirmado/na fila — aí o botão troca para "Bloqueado · Inadimplente".
  const presenceReasons = Array.isArray(presenceGuard?.decision?.reasons) ? presenceGuard.decision.reasons : [];
  const financeBlocked = !!(game && game.open) && !confirmed && !waitlisted && presenceReasons.includes('mensalidade_pendente');
  const canRenderPresenceAction = confirmed || waitlisted || presenceGuard.ok || presenceGuard.decision?.reasonBlocked === 'game_full';
  const statusNote = waitlisted
    ? `Você está na fila de espera${waitlistPosition ? ` na posição ${waitlistPosition}` : ''}.`
    : !confirmed && !capacityOk
      ? 'O jogo já está cheio. Você pode entrar na fila de espera.'
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
  const storedNotifications = Array.isArray(workingSnapshot.notifications) ? workingSnapshot.notifications : [];
  const playersByIdForCarneNotification = new Map(workingSnapshot.players.map((player) => [String(player.id), player]));
  const nextCarneEntry = carneScheduleEntries
    .filter((entry) => {
      if (entry?.active === false || !entry?.date) return false;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const entryDate = new Date(`${entry.date}T00:00:00`);
      return entryDate >= today;
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  const carneNotification = nextCarneEntry
    ? {
        type: 'carne',
        date: formatDate(nextCarneEntry.date),
        player1: playersByIdForCarneNotification.get(String(nextCarneEntry.player1_id))?.name || '-',
        player2: playersByIdForCarneNotification.get(String(nextCarneEntry.player2_id))?.name || '-',
        player1Record: playersByIdForCarneNotification.get(String(nextCarneEntry.player1_id)) || null,
        player2Record: playersByIdForCarneNotification.get(String(nextCarneEntry.player2_id)) || null,
        message: `Dupla da carne (${formatDate(nextCarneEntry.date)}): ${playersByIdForCarneNotification.get(String(nextCarneEntry.player1_id))?.name || '-'}, ${playersByIdForCarneNotification.get(String(nextCarneEntry.player2_id))?.name || '-'}`,
      }
    : null;

  const allGamesForBirthdays = getCurrentGames(workingSnapshot)
    .map((game) => ({ ...game, dateForBirthday: game.game_date || game.date || null }))
    .filter((game) => !!game.dateForBirthday)
    .sort((a,b) => String(a.dateForBirthday).localeCompare(String(b.dateForBirthday)));

  let birthdayNotifications = [];

  try {
    const parseBirthMonthDay = (birthDate) => {
      const raw = String(birthDate || '').trim();

      let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        return { month: Number(match[2]), day: Number(match[3]) };
      }

      match = raw.match(/^(\d{2})\/(\d{2})(?:\/(\d{4}))?$/);
      if (match) {
        return { day: Number(match[1]), month: Number(match[2]) };
      }

      return null;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const nextGameEntry = allGamesForBirthdays.find((game) => {
      const gameDate = new Date(`${game.dateForBirthday}T00:00:00`);
      return gameDate >= today;
    });

    if (nextGameEntry?.dateForBirthday) {
      const nextGameIndex = allGamesForBirthdays.findIndex((game) => String(game.dateForBirthday) === String(nextGameEntry.dateForBirthday));
      const previousGameEntry = nextGameIndex > 0 ? allGamesForBirthdays[nextGameIndex - 1] : null;

      const end = new Date(`${nextGameEntry.dateForBirthday}T00:00:00`);
      const start = previousGameEntry?.dateForBirthday
        ? new Date(`${previousGameEntry.dateForBirthday}T00:00:00`)
        : new Date(end);

      if (previousGameEntry?.dateForBirthday) {
        start.setDate(start.getDate() + 1);
      } else {
        start.setDate(start.getDate() - 6);
      }

      birthdayNotifications = (workingSnapshot.players || [])
        .filter((player) => player?.birthDate)
        .map((player) => {
          const parsed = parseBirthMonthDay(player.birthDate);
          if (!parsed?.month || !parsed?.day) return null;

          const birthday = new Date(end.getFullYear(), parsed.month - 1, parsed.day);

          return {
            player,
            birthday,
            inRange: birthday >= start && birthday <= end,
          };
        })
        .filter((entry) => entry?.inRange)
        .sort((a,b) => a.birthday - b.birthday || String(a.player.name || '').localeCompare(String(b.player.name || ''), 'pt-BR'))
        .map((entry) => ({
          type: 'birthday',
          playerName: entry.player.name,
          birthDate: entry.player.birthDate,
          birthdayDate: formatDate(entry.birthday.toISOString().slice(0, 10)),
        }));
    }
  } catch (e) {
    console.warn('birthday notification failed', e);
  }

  const notifications = [
    ...(carneNotification ? [carneNotification] : []),
    ...birthdayNotifications,
    ...storedNotifications
  ];

  // Fonte única: usa diretamente o gameView (mesma regra do banner e da tela
  // de jogo). Removido o recálculo local que divergia do resto e do banco.
  const sortByName = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR');
  const homeLinePlayers = [...gameView.confirmed].sort(sortByName);
  const homeGoalkeepers = [...gameView.confirmedGoalkeepers].sort(sortByName);
  const homeRentalGoalkeepers = Array.isArray(game && game.rental_goalkeepers) ? game.rental_goalkeepers : [];
  const homeGoalkeeperCount = homeGoalkeepers.length + homeRentalGoalkeepers.length;
  const homeRemainingLine = Math.max((maxPlayers || 0) - homeLinePlayers.length, 0);
  const homeStatusText = game && game.open ? 'Aberto' : 'Fechado';
  const homePresenceText = waitlisted ? 'Na fila' : (confirmed ? 'Confirmado' : (financeBlocked ? 'Inadimplente' : ((game && game.open) ? 'Pendente' : 'Abertura das inscrições em breve')));
  const homeActionText = confirmed ? 'Cancelar presença' : (waitlisted ? 'Sair da fila' : (!capacityOk ? 'Entrar na fila' : 'Confirmar presença'));
  const homeLineAvatars = homeLinePlayers.slice(0, 5).map((player) => renderAvatarForApp(player, 'home-v2-avatar')).join('');
  const homeMoreLine = Math.max(homeLinePlayers.length - 5, 0);
  const homeGoalkeeperAvatars = [
    ...homeGoalkeepers.map((player) => renderAvatarForApp(player, 'home-v2-avatar')),
    ...homeRentalGoalkeepers.map((entry) => '<span class="home-v2-avatar home-v2-rental-goalie-avatar">🧤</span>')
  ].join('');
  const homeMoreGoalkeepers = Math.max(homeGoalkeeperCount - 5, 0);
  const homeGoalkeeperNames = [
    ...homeGoalkeepers.map((player) => player.name),
    ...homeRentalGoalkeepers.map((entry) => String(entry.name || '') + ' (aluguel)')
  ].filter(Boolean).join(', ') || 'Nenhum goleiro confirmado';
  const homeNoticeItems = [
    carneNotification ? {
      icon: '🍢',
      title: 'Dupla da carne',
      text: String(carneNotification.player1 || '-') + ', ' + String(carneNotification.player2 || '-'),
      html: '<div class="notification-content-carne">'
        + '<div class="home-carne-avatars">'
        + (carneNotification.player1Record ? renderAvatarForApp(carneNotification.player1Record, 'home-carne-avatar') : '<span class="avatar home-carne-avatar">?</span>')
        + (carneNotification.player2Record ? renderAvatarForApp(carneNotification.player2Record, 'home-carne-avatar') : '<span class="avatar home-carne-avatar">?</span>')
        + '</div>'
        + '<div class="home-carne-text"><span>' + escapeHtml(String(carneNotification.player1 || '-')) + '</span><span>e</span><span>' + escapeHtml(String(carneNotification.player2 || '-')) + '</span></div>'
        + '</div>'
    } : null,
    ...birthdayNotifications.map((notification) => ({
      icon: '🎂',
      title: 'Aniversariante',
      text: String(notification.playerName || 'Jogador') + (notification.birthdayDate ? ' · ' + notification.birthdayDate : '')
    })),
    storedNotifications.length ? {
      icon: '📢',
      title: 'Avisos',
      text: String(storedNotifications.length) + ' recado(s)'
    } : null
  ].filter(Boolean);


  return `
    <section class="home-v2">
      <section class="home-v2-hero">
        <div class="home-v2-hero-main">
          <div>
            <div class="home-v2-kicker">Hoje no Harmonia</div>
            <div class="home-v2-date">${formatDate(game && game.game_date)}</div>
            <div class="home-v2-time">${(game && game.game_time) || '--:--'} · ${homeStatusText}</div>
          </div>
          <div class="home-v2-status ${confirmed ? 'is-ok' : waitlisted ? 'is-wait' : financeBlocked ? 'is-blocked' : 'is-off'}${(!confirmed && !waitlisted && !financeBlocked && !(game && game.open)) ? ' is-soon' : ''}">${homePresenceText}</div>
        </div>

        <div class="home-v2-big-number">
          <strong>${homeLinePlayers.length}/${maxPlayers || 0}</strong>
          <span>confirmados de linha</span>
        </div>

        <div class="home-v2-progress" aria-label="Ocupação do jogo">
          <div class="home-v2-progress-track">
            <div class="home-v2-progress-bar" style="width:${maxPlayers ? Math.min(100, Math.round((homeLinePlayers.length / maxPlayers) * 100)) : 0}%"></div>
          </div>
          <div class="home-v2-progress-caption">
            <span>${maxPlayers ? Math.min(100, Math.round((homeLinePlayers.length / maxPlayers) * 100)) : 0}% preenchido</span>
            <span>${homeRemainingLine} vaga${homeRemainingLine === 1 ? '' : 's'} restante${homeRemainingLine === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div class="home-v2-actions">
          ${financeBlocked
            ? '<button class="home-v2-primary is-blocked" type="button" disabled title="Mensalidade pendente e vencimento já passou. Regularize para confirmar.">Bloqueado · Inadimplente</button>'
            : (canRenderPresenceAction ? '<button class="home-v2-primary" type="button" id="confirm-btn">' + homeActionText + '</button>' : '')}
          <button class="home-v2-secondary" type="button" data-tab="weekly_game">Ver jogo</button>
        </div>
        ${financeBlocked ? '<p class="home-v2-blocked-note">Mensalidade pendente e o vencimento já passou. Regularize com o administrador para confirmar presença.</p>' : ''}
      </section>

      <section class="home-v2-metrics">
        <div class="home-v2-metric">
          <strong>${homeLinePlayers.length}</strong>
          <span>Linha</span>
        </div>
        <div class="home-v2-metric">
          <strong>${homeGoalkeeperCount}/2</strong>
          <span>Goleiros</span>
        </div>
        <div class="home-v2-metric">
          <strong>${waitlistCount}</strong>
          <span>Fila</span>
        </div>
        <div class="home-v2-metric">
          <strong>${homeStatusText}</strong>
          <span>Status</span>
        </div>
      </section>

      <section class="home-v2-card home-v2-confirmed-card">
        <div class="home-v2-card-head">
          <div>
            <strong>Confirmados</strong>
            <span>${homeRemainingLine} vaga${homeRemainingLine === 1 ? '' : 's'} de linha</span>
          </div>
          <button class="home-v2-link" type="button" data-tab="weekly_game">Lista</button>
        </div>

        <div class="home-v2-confirmed-group">
          <div class="home-v2-confirmed-group-title">Linha (${homeLinePlayers.length})</div>
          <div class="home-v2-avatar-row">
            ${homeLineAvatars || '<span class="home-v2-empty">Nenhum jogador de linha confirmado.</span>'}
            ${homeMoreLine ? '<span class="home-v2-more">+' + homeMoreLine + '</span>' : ''}
          </div>
        </div>

        <div class="home-v2-confirmed-group home-v2-confirmed-goalkeepers">
          <div class="home-v2-confirmed-group-title">🧤 Goleiros (${homeGoalkeeperCount}/2)</div>
          <div class="home-v2-avatar-row">
            ${homeGoalkeeperAvatars || '<span class="home-v2-empty">Nenhum goleiro confirmado.</span>'}
            ${homeMoreGoalkeepers ? '<span class="home-v2-more">+' + homeMoreGoalkeepers + '</span>' : ''}
          </div>
          <div class="home-v2-goalie-names">${homeGoalkeeperNames}</div>
        </div>
      </section>

      <section class="home-v2-card">
        <div class="home-v2-card-head">
          <div>
            <strong>Notificações</strong>
            <span>Resumo da semana</span>
          </div>
        </div>
        <div class="home-v2-notices">
          ${homeNoticeItems.length ? homeNoticeItems.map((item) => '<div class="home-v2-notice"><span>' + item.icon + '</span><div><strong>' + escapeHtml(item.title) + '</strong><small>' + (item.html || escapeHtml(item.text || '')) + '</small></div></div>').join('') : '<span class="home-v2-empty">Sem notificações por enquanto.</span>'}
        </div>
      </section>

      <section class="home-v2-profile">
        ${renderAvatarForApp(activePlayer, 'home-v2-profile-avatar')}
        <div>
          <strong>${activePlayer.name}</strong>
          <span>${authzIsAdmin(activePlayer) ? 'Administrador · ' + getPositionLabel(activePlayer.position) : getPlayerRole(activePlayer) === 'carne' ? 'Somente carne' : getPositionLabel(activePlayer.position)}</span>
        </div>
        <button class="home-v2-link" type="button" data-action="toggle-self-profile-edit">${selfProfileEditOpen ? 'Fechar' : 'Editar'}</button>
      </section>

      ${renderSelfProfileEditCardForHome(activePlayer)}
    </section>
  `;
}
function renderWeeklyGame(snapshot, currentPlayer) {
  const view = buildGameView(snapshot, currentPlayer?.id || null);
  const confirmed = isConfirmed(currentPlayer?.id);
  const activeGame = view.game || getActiveGameFromSnapshot(snapshot);
  const capacity = activeGame?.max_players || 8;
  const remaining = Math.max(capacity - view.confirmedCount, 0);
  const canAct = currentPlayer && currentPlayer.plays_football !== false;

  return `
    <section class="section-stack weekly-game-screen">
      <section class="weekly-summary-grid">
        <div class="weekly-game-card">
          <div class="hero-label">Próximo jogo</div>
          <div class="hero-date">${formatDate(activeGame?.game_date)}</div>
          <div class="hero-meta">${activeGame?.game_time || '--:--'} · ${activeGame?.open ? 'Inscrições abertas' : 'Inscrições fechadas'}</div>
          <div class="weekly-progress"><div style="width:${Math.min((view.confirmedCount / capacity) * 100, 100)}%"></div></div>
          <div class="weekly-game-stats">
            <strong>${view.confirmedCount} / ${capacity}</strong> confirmados
            <span>${remaining} vagas restantes</span>
          </div>
        </div>
      </section>

      ${renderTeamDraw(snapshot, currentPlayer)}
      ${renderPresenceList(snapshot, currentPlayer)}
    </section>
  `;
}

function renderChampionship(snapshot, currentPlayer) {
  return renderChampionshipScreen(snapshot, currentPlayer);
}

function buildTeamDrawShareText(snapshot) {
  const sortResult = snapshot.game?.sort_result;
  if (!sortResult) return '';

  const playerById = new Map((snapshot.players || []).map((player) => [player.id, player]));
  const game = getActiveGameFromSnapshot(snapshot);
  const formatTeam = (label, ids = []) => {
    const players = ids.map((id) => ((id && typeof id === 'object') ? id : playerById.get(id)));
    const goalkeepers = players.filter((p) => p && (p.rental_goalkeeper || ['gol','goleiro'].includes(String(p.position || '').toLowerCase())));
    const linePlayers = players.filter((p) => p && !goalkeepers.includes(p));
    const ordered = [...goalkeepers, ...linePlayers];

    const lines = ordered.map((player, index) => {
      const prefix = (player?.rental_goalkeeper || ['gol','goleiro'].includes(String(player?.position || '').toLowerCase()))
        ? '🧤 '
        : '';
      return `${index + 1}. ${prefix}${player?.name || 'Jogador removido'}`;
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

function buildPaymentsShareText(snapshot) {
  const players = (snapshot.players || [])
    .filter((player) => player && player.plays_football !== false && player.role !== 'carne')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  const unpaid = players.filter((player) => player.mens_ok !== true);
  const paid = players.filter((player) => player.mens_ok === true);
  const due = String(snapshot.settings?.mens_expire_date || '').slice(0, 10);
  const list = (arr) => (arr.length ? arr.map((player, index) => `${index + 1}. ${player.name}`).join('\n') : '—');

  return [
    '💰 Mensalidade Harmonia FC',
    due ? `Vencimento: ${formatDate(due)}` : 'Vencimento: não definido',
    '',
    `❌ Pendentes (${unpaid.length}):`,
    list(unpaid),
    '',
    `✅ Pagos (${paid.length}):`,
    list(paid),
  ].join('\n');
}

async function copyPaymentsToClipboard() {
  const text = buildPaymentsShareText(getState());
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
    showToast('Lista de pagamentos copiada.');
  } catch (error) {
    console.error(error);
    showToast('Não foi possível copiar automaticamente.', 'error');
  }
}

function renderPresenceList(snapshot, currentPlayer) {
  const adminMode = canManagePresenceAuthz(currentPlayer);
  const game = getActiveGameFromSnapshot(snapshot);
  const gameKey = getGameKey(game);
  const confirmedIds = new Set(
    (snapshot.confirmations || [])
      .filter((entry) => entry?.confirmed)
      .filter((entry) => String(entry?.game_key || '') === String(gameKey))
      .map((entry) => String(entry.player_id))
  );
  const waitlistEntries = getWaitlistView(snapshot);
  const waitlistedIds = new Set(waitlistEntries.map((entry) => String(entry.player_id)));

  const footballPlayers = (snapshot.players || [])
    .filter((player) => player.plays_football !== false)
    .filter((player) => player.role !== 'carne')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));

  const confirmedFootballPlayers = footballPlayers.filter((player) => confirmedIds.has(String(player.id)));
  const goalkeeperPlayers = confirmedFootballPlayers.filter(isGoalkeeperPlayerForApp).slice(0, 2);
  const confirmedPlayers = confirmedFootballPlayers.filter((player) => !isGoalkeeperPlayerForApp(player));
  const rentalGoalkeepers = getActiveRentalGoalkeepersForApp(snapshot);
  const totalGoalkeepers = goalkeeperPlayers.length + rentalGoalkeepers.length;
  const waitlistPlayers = waitlistEntries.map((entry) => entry.player).filter(Boolean);
  const pendingPlayers = footballPlayers.filter((player) => !confirmedIds.has(String(player.id)) && !waitlistedIds.has(String(player.id)));
  const pendingGoalkeepers = pendingPlayers.filter(isGoalkeeperPlayerForApp);
  const pendingLinePlayers = pendingPlayers.filter((player) => !isGoalkeeperPlayerForApp(player));

  const renderWeeklyRow = (player, confirmed = false) => `
    <div class="weekly-player-row">
      <div class="players-switch-player">
        ${renderAvatarForApp(player)}
        <div>
          <div class="row-title">${player.name}</div>
          <div class="row-subtitle">${getPositionLabel(player.position)} · ${formatPhone(player.phone)}</div>
        </div>
      </div>
      <div class="weekly-player-meta">
        <span class="tag ${player.mens_ok ? 'is-ok' : 'is-warn'}">${player.mens_ok ? 'Pago' : 'Pendente'}</span>
        ${adminMode ? `
          <button
            class="switch-control switch-control-inline ${confirmed ? 'is-on' : 'is-off'}"
            type="button"
            data-action="${confirmed ? 'admin-remove-from-game' : 'admin-add-to-game'}"
            data-id="${player.id}"
            aria-pressed="${confirmed ? 'true' : 'false'}"
            title="${confirmed ? 'Remover do jogo' : 'Incluir no jogo'}"
          >
            <span class="switch-track"><span class="switch-thumb"></span></span>
            <span class="switch-label ${confirmed ? 'is-ok' : 'is-neutral'}">${confirmed ? 'Dentro' : 'Fora'}</span>
          </button>
        ` : `<span class="tag ${confirmed ? 'is-ok' : 'is-neutral'}">${confirmed ? 'Confirmado' : 'Pendente'}</span>`}
      </div>
    </div>
  `;

  const renderGoalkeeperRow = (player) => `
    <div class="weekly-player-row goalkeeper-player-row">
      <div class="players-switch-player">
        ${renderAvatarForApp(player)}
        <div>
          <div class="row-title">🧤 ${player.name}</div>
          <div class="row-subtitle">Goleiro confirmado · não ocupa vaga de linha</div>
        </div>
      </div>
      <div class="weekly-player-meta">
        <span class="tag is-ok">Goleiro</span>
        ${adminMode ? `
          <button
            class="switch-control switch-control-inline is-on"
            type="button"
            data-action="admin-remove-from-game"
            data-id="${player.id}"
            aria-pressed="true"
            title="Remover goleiro do jogo"
          >
            <span class="switch-track"><span class="switch-thumb"></span></span>
            <span class="switch-label is-ok">Dentro</span>
          </button>
        ` : ''}
      </div>
    </div>
  `;

  const renderRentalGoalkeeperRow = (entry) => `
    <div class="weekly-player-row goalkeeper-player-row rental-goalkeeper-row">
      <div class="players-switch-player">
        <div class="avatar rental-goalkeeper-avatar">🧤</div>
        <div>
          <div class="row-title">${escapeHtml(entry.name)}</div>
          <div class="row-subtitle">Goleiro de aluguel · temporário deste jogo</div>
        </div>
      </div>
      <div class="weekly-player-meta">
        <span class="tag is-warn">Aluguel</span>
        ${adminMode ? `<button class="btn btn-secondary btn-sm" type="button" data-action="remove-rental-goalkeeper" data-id="${escapeHtml(entry.id)}">Remover</button>` : ''}
      </div>
    </div>
  `;

  return `
    <section class="weekly-presence-card">
      <div class="card-title weekly-presence-main-title">Lista de presença</div>

      <div class="weekly-presence-section goalkeeper-section">
        <div class="weekly-presence-title">🧤 Goleiros (${totalGoalkeepers}/2)</div>
        <div class="weekly-presence-stack">
          ${goalkeeperPlayers.length || rentalGoalkeepers.length
            ? `${goalkeeperPlayers.map(renderGoalkeeperRow).join('')}${rentalGoalkeepers.map(renderRentalGoalkeeperRow).join('')}`
            : '<div class="empty-inline">Nenhum goleiro confirmado ainda.</div>'}
        </div>
        ${adminMode && totalGoalkeepers < 2 ? `
          <div class="rental-goalkeeper-form">
            <input id="rental-goalkeeper-name" class="input" type="text" placeholder="Nome do goleiro de aluguel" />
            <button id="add-rental-goalkeeper-btn" class="btn btn-secondary" type="button">Adicionar goleiro de aluguel</button>
          </div>
        ` : ''}
        ${pendingGoalkeepers.length ? `
          <div class="goalkeeper-pending-list">
            <div class="weekly-presence-subtitle">Goleiros cadastrados ainda fora</div>
            ${pendingGoalkeepers.map((player) => renderWeeklyRow(player, false)).join('')}
          </div>
        ` : ''}
      </div>

      <div class="weekly-presence-section">
        <div class="weekly-presence-title">Confirmados linha (${confirmedPlayers.length})</div>
        <div class="weekly-presence-stack">
          ${confirmedPlayers.length
            ? confirmedPlayers.map((player) => renderWeeklyRow(player, true)).join('')
            : '<div class="empty-inline">Nenhum jogador de linha confirmado ainda.</div>'}
        </div>
        <div class="weekly-copy-presence-actions">
          <button class="btn btn-secondary btn-sm" type="button" id="copy-confirmed-btn">Copiar presença para WhatsApp</button>
        </div>
      </div>

      <div class="weekly-presence-section waitlist-section">
        <div class="weekly-presence-title">Fila de espera (${waitlistPlayers.length})</div>
        <div class="weekly-presence-stack">
          ${waitlistPlayers.length
            ? waitlistPlayers.map((player, index) => `
              <div class="weekly-player-row waitlist-player-row">
                <div class="players-switch-player">
                  ${renderAvatarForApp(player)}
                  <div>
                    <div class="row-title">#${index + 1} · ${player.name}</div>
                    <div class="row-subtitle">${getPositionLabel(player.position)} · aguardando vaga</div>
                  </div>
                </div>
                <div class="weekly-player-meta">
                  <span class="tag is-warn">Fila</span>
                </div>
              </div>
            `).join('')
            : '<div class="empty-inline">Nenhum jogador na fila de espera.</div>'}
        </div>
      </div>

      <div class="weekly-presence-section">
        <div class="weekly-presence-title">Não confirmados linha (${pendingLinePlayers.length})</div>
        <div class="weekly-presence-stack">
          ${pendingLinePlayers.length
            ? pendingLinePlayers.map((player) => renderWeeklyRow(player, false)).join('')
            : '<div class="empty-inline">Todos os jogadores de linha confirmaram.</div>'}
        </div>
      </div>
    </section>
  `;
}

function getPositionDrawOrder(player) {
  const raw = String(player?.position || '').trim().toLowerCase();

  if (raw === 'gol' || raw === 'goleiro') return 0;
  if (raw === 'zag' || raw === 'zagueiro') return 1;
  if (raw === 'meia') return 2;
  if (raw === 'atk' || raw === 'atacante') return 3;

  return 99;
}

function sortDrawEntriesForDisplay(entries = [], playerById = new Map()) {
  return [...entries].sort((a, b) => {
    const idA = (a && typeof a === 'object') ? a.id : a;
    const idB = (b && typeof b === 'object') ? b.id : b;

    const playerA = playerById.get(idA) || ((a && typeof a === 'object') ? a : null);
    const playerB = playerById.get(idB) || ((b && typeof b === 'object') ? b : null);

    const positionDiff = getPositionDrawOrder(playerA) - getPositionDrawOrder(playerB);
    if (positionDiff !== 0) return positionDiff;

    return String(playerA?.name || '').localeCompare(String(playerB?.name || ''), 'pt-BR');
  });
}

function renderTeamDraw(snapshot, currentPlayer) {
  const sortResult = snapshot.game?.sort_result;
  const playerById = new Map((snapshot.players || []).map((player) => [String(player.id), player]));
  const game = getActiveGameFromSnapshot(snapshot);
  const gameKey = getGameKey(game);
  const confirmedCount = buildGameView(snapshot, currentPlayer?.id || null).confirmedCount;
  const isAdmin = authzIsAdmin(currentPlayer);

  const getEntryId = (entry) => (entry && typeof entry === 'object') ? entry.id : entry;
  const sortEntryIds = sortResult
    ? new Set([...(sortResult.team_a || []), ...(sortResult.team_b || [])].map((entry) => String(getEntryId(entry))))
    : new Set();

  const confirmedIds = new Set(
    (snapshot.confirmations || [])
      .filter((entry) => entry?.confirmed)
      .filter((entry) => String(entry?.game_key || '') === String(gameKey))
      .map((entry) => String(entry.player_id))
  );

  const confirmedPlayersOutsideDraw = (snapshot.players || [])
    .filter((player) => confirmedIds.has(String(player.id)))
    .filter((player) => !sortEntryIds.has(String(player.id)))
    .filter((player) => player.plays_football !== false)
    .filter((player) => player.role !== 'carne')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));

  const rentalGoalkeepersOutsideDraw = (Array.isArray(game?.rental_goalkeepers) ? game.rental_goalkeepers : [])
    .filter((entry) => !sortEntryIds.has(String(entry.id)))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      position: 'gol',
      rental_goalkeeper: true,
    }));

  const outsideDraw = [...confirmedPlayersOutsideDraw, ...rentalGoalkeepersOutsideDraw];

  if (!sortResult) {
    return `
      <section class="card">
        <div class="card-title">Sorteio de times</div>
        <div class="info-block">
          <div class="info-line">• Confirmados disponíveis: ${confirmedCount}</div>
          <div class="info-line">• O sorteio usa apenas jogadores confirmados.</div>
        </div>
        ${canManagePresenceAuthz(currentPlayer) ? `
          <div class="actions" style="margin-top:12px;">
            <button class="btn btn-primary" type="button" id="draw-teams-btn">Sortear times</button>
          </div>
        ` : '<p class="footer-note">Aguardando sorteio do administrador.</p>'}
      </section>
    `;
  }

  const resolveDrawEntry = (entry) => {
    const id = getEntryId(entry);
    const player = (entry && typeof entry === 'object') ? entry : playerById.get(String(id));
    return { id, player };
  };

  const renderTeam = (title, entries, teamKey) => `
    <div class="team-draw-box">
      <div class="team-draw-title">${title}</div>
      <div class="placeholder-list">
        ${sortDrawEntriesForDisplay(entries || [], playerById).map((entry) => {
          const { id, player } = resolveDrawEntry(entry);
          const targetLabel = teamKey === 'team_a' ? 'Time B' : 'Time A';
          return `
            <div class="placeholder-row team-draw-player-row">
              <div class="placeholder-main team-draw-player-main">
                ${renderAvatarForApp(player)}
                <div class="team-draw-player-text">
                  <div class="row-title">${(player?.rental_goalkeeper || ['gol','goleiro'].includes(String(player?.position || '').toLowerCase())) ? '🧤 ' : ''}${player?.name || 'Jogador removido'}</div>
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
        <div class="info-line">• Jogadores sorteados: ${[...(sortResult.team_a || []), ...(sortResult.team_b || [])].length}</div>
      </div>
      <div class="team-draw-grid">
        ${renderTeam('Time A', sortResult.team_a, 'team_a')}
        ${renderTeam('Time B', sortResult.team_b, 'team_b')}
      </div>

      ${isAdmin && outsideDraw.length ? `
        <div class="draw-outside-panel">
          <div class="weekly-presence-title">Confirmados fora do sorteio</div>
          <div class="weekly-presence-stack">
            ${outsideDraw.map((player) => `
              <div class="weekly-player-row draw-outside-row">
                <div class="players-switch-player">
                  ${player.rental_goalkeeper ? `<div class="avatar rental-goalkeeper-avatar">🧤</div>` : renderAvatarForApp(player)}
                  <div>
                    <div class="row-title">${player.name}</div>
                    <div class="row-subtitle">${player.rental_goalkeeper ? 'Goleiro de aluguel' : getPositionLabel(player.position)}</div>
                  </div>
                </div>
                <div class="weekly-player-meta draw-add-actions">
                  <button class="btn btn-secondary btn-sm" type="button" data-action="add-player-to-draw" data-player-id="${player.id}" data-team="team_a">Time A</button>
                  <button class="btn btn-secondary btn-sm" type="button" data-action="add-player-to-draw" data-player-id="${player.id}" data-team="team_b">Time B</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${canManagePresenceAuthz(currentPlayer) ? `
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
  if (!authzIsAdmin(currentPlayer)) {
    return `
      <section class="section-stack">
        <section class="card">
          <div class="card-title">Acesso restrito</div>
          <p class="footer-note">Somente administradores podem acessar a configuração do sistema.</p>
        </section>
      </section>
    `;
  }

  const game = getActiveGameFromSnapshot(snapshot) || {};
  const games = getCurrentGames(snapshot);
  const maxPlayers = Number(game.max_players || game.maxPlayers || 10);
  const defaultNewGameMaxPlayers = maxPlayers || 10;
  const adminNotification = (Array.isArray(snapshot.notifications) ? snapshot.notifications.find((item) => item?.type === 'admin')?.message : '') || '';
  const mensEnforcementMode = getMensalidadeMode(snapshot.settings);

  const renderGameEditForm = (item) => {
    const key = getGameKey(item);
    const active = key === getGameKey(game);
    // Mesma regra da home: conta jogadores de LINHA (goleiros e carne não somam).
    const classified = classifyGameConfirmations(snapshot, key);
    const count = classified.lineCount;
    const waitlistCount = classified.waitlistCount;
    const limit = Number(item.max_players || item.maxPlayers || 0);

    return `
      <details class="game-config-row game-config-details ${active ? 'is-active' : ''}">
        <summary class="game-config-summary">
          <div class="game-config-summary-main">
            <strong>${formatDate(item.game_date)} · ${item.game_time || '--:--'}${active ? ' · Ativo' : ''}</strong>
            <span>${count}/${limit} confirmados${waitlistCount ? ` · ${waitlistCount} na fila` : ''} · ${item.open ? 'aberto' : 'fechado'}</span>
          </div>
          <div class="game-config-summary-actions">
            <button class="btn btn-secondary btn-sm" type="button" data-action="select-active-game" data-id="${key}">${active ? 'Ativo' : 'Ativar'}</button>
            <span class="btn btn-secondary btn-sm game-config-edit-indicator">Editar</span>
          </div>
        </summary>

        <form data-game-config-form="edit-game" data-game-key="${key}" class="player-admin-form game-config-form game-edit-form">
          <input type="hidden" name="game_key" value="${key}" />

          <label class="field-label">
            Data do jogo
            <input class="input" type="date" name="game_date" value="${item.game_date || ''}" />
          </label>

          <label class="field-label">
            Hora do jogo
            <input class="input" type="time" name="game_time" value="${item.game_time || ''}" />
          </label>

          <label class="field-label">
            Máximo de jogadores
            <input class="input" type="number" min="1" step="1" name="max_players" value="${limit || 10}" />
          </label>

          <label class="checkbox-line">
            <input type="checkbox" name="open" ${item.open ? 'checked' : ''} />
            Inscrições abertas neste jogo
          </label>

          <div class="player-admin-actions game-config-actions">
            <button class="btn btn-primary" type="submit">Salvar alterações deste jogo</button>
          </div>
        </form>
      </details>
    `;
  };

  return `
    <section class="section-stack">
      <section class="card games-config-card">
        <div class="card-title">Jogos</div>
        
        <div class="games-list-config">
          ${games.map(renderGameEditForm).join('')}
        </div>
      </section>

      <section class="card mensalidade-config-card">
        <div class="card-title">Mensalidade</div>
        <p class="footer-note">Vencimento único, válido para todos os jogos do clube. A regra abaixo só passa a valer depois do vencimento.</p>
        <form id="mensalidade-config-form" class="player-admin-form game-config-form">
          <label class="field-label">
            Data de vencimento
            <input class="input" type="date" name="mens_expire_date" value="${snapshot.settings?.mens_expire_date || ''}" />
          </label>

          <fieldset class="mens-mode-fieldset">
            <legend class="field-label">Regra para inadimplentes</legend>
            ${[
              { value: 'none', title: 'Sem bloqueio', desc: 'Inadimplência é só informativa. Ninguém é bloqueado nem removido.' },
              { value: 'partial', title: 'Bloqueio parcial', desc: 'Inadimplente não pode confirmar, mas quem já está confirmado permanece na escalação.' },
              { value: 'total', title: 'Bloqueio total', desc: 'Inadimplente não pode confirmar e quem já está confirmado é removido — a vaga vai para a fila.' },
            ].map((opt) => `
              <label class="mens-mode-option${mensEnforcementMode === opt.value ? ' is-selected' : ''}">
                <input type="radio" name="mens_enforcement_mode" value="${opt.value}" ${mensEnforcementMode === opt.value ? 'checked' : ''} />
                <span class="mens-mode-text">
                  <strong>${opt.title}</strong>
                  <small>${opt.desc}</small>
                </span>
              </label>
            `).join('')}
          </fieldset>
          <p class="footer-note">O administrador sempre pode confirmar e remover qualquer jogador, mesmo inadimplente.</p>

          <div class="player-admin-actions game-config-actions">
            <button class="btn btn-primary" type="submit">Salvar mensalidade</button>
          </div>
        </form>
      </section>

      <section class="card create-game-card">
        <details class="create-game-details">
          <summary class="create-game-summary">
            <span>
              <strong>Novo jogo</strong>
              
            </span>
            <span class="btn btn-secondary btn-sm create-game-open-indicator">Criar novo jogo</span>
          </summary>

          <form id="create-game-form" class="player-admin-form game-config-form create-game-form">
            <label class="field-label">
              Data do novo jogo
              <input class="input" type="date" name="game_date" value="" />
            </label>

            <label class="field-label">
              Hora do novo jogo
              <input class="input" type="time" name="game_time" value="${game.game_time || ''}" />
            </label>

            <label class="field-label">
              Máximo de jogadores
              <input class="input" type="number" min="1" step="1" name="max_players" value="${defaultNewGameMaxPlayers}" />
            </label>

            <label class="checkbox-line">
              <input type="checkbox" name="open" />
              Já criar com inscrições abertas
            </label>

            <div class="player-admin-actions game-config-actions">
              <button class="btn btn-primary" type="submit">Criar jogo</button>
            </div>
          </form>
        </details>
      </section>

      <section class="card notifications-config-card">
        <div class="card-title">Notificações gerais</div>
        
        <form id="notifications-config-form" class="player-admin-form notifications-config-form">
          <label class="field-label config-notifications-field">
            Recado para todos
            <textarea class="input notification-textarea" name="admin_notification" rows="4" placeholder="Ex.: recado sobre churrasco, pagamento, uniforme ou qualquer aviso geral.">${adminNotification}</textarea>
          </label>
          <p class="footer-note config-notifications-help"></p>
          <div class="player-admin-actions game-config-actions">
            <button class="btn btn-primary" type="submit">Salvar notificação</button>
          </div>
        </form>
      </section>
    </section>
  `;
}

function buildMensalidadeMeta(game, currentPlayer, mode = MENSALIDADE_MODES.NONE) {
  if (authzIsCarneOnly(currentPlayer)) {
    return {
      className: 'is-ok',
      title: 'Não aplicável',
      subline: 'Este perfil não participa da mensalidade do futebol.',
    };
  }

  if (currentPlayer.mens_ok !== true) {
    // A consequência da pendência depende da regra do clube (modo).
    let consequence;
    if (mode === MENSALIDADE_MODES.TOTAL) {
      consequence = 'Após o vencimento você não pode confirmar e, se já estiver confirmado, será removido (a vaga vai para a fila).';
    } else if (mode === MENSALIDADE_MODES.PARTIAL) {
      consequence = 'Após o vencimento você não pode confirmar presença até regularizar.';
    } else {
      consequence = 'Apenas informativo: regularize quando puder.';
    }
    return {
      className: 'is-danger',
      title: 'Pendente',
      subline: game?.mens_expire_date
        ? `Vencimento ${formatDate(game.mens_expire_date)}. ${consequence}`
        : consequence,
    };
  }

  return {
    className: 'is-ok',
    title: 'Em dia',
    subline: game?.mens_expire_date
      ? `Data de vencimento da mensalidade: ${formatDate(game.mens_expire_date)}.`
      : 'Mensalidade marcada como ok no sistema.',
  };
}

function buildHeaderSubtitle(currentPlayer) {
  const profile = authzIsAdmin(currentPlayer) ? `Administrador · ${getPositionLabel(currentPlayer.position)}` : getPlayerRole(currentPlayer) === 'carne' ? 'Perfil carne' : getPositionLabel(currentPlayer.position);
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
  const labels = { gol: 'Goleiro', zag: 'Zagueiro', meia: 'Meia', atk: 'Atacante' };
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
