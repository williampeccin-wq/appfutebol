import { assertRuntimeEnvironmentAllowed } from '../domain/environment.guard.js';
import { auditPresenceProjection } from '../domain/presence.audit.js';
assertRuntimeEnvironmentAllowed();
window.HarmoniaPresenceAudit = () => auditPresenceProjection(getState());
window.__HARMONIA_BUILD__ = 'v1.82.0-aura';

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
let selfProfileOpen = false;      // painel de perfil aberto (modo visualização)
let selfProfileEditOpen = false;  // dentro do painel, formulário de edição aberto
// Rascunho local do rodízio do carnê. Editado em memória (imune ao poll de
// sync, que reverteria as alterações no meio da edição) e só persistido quando
// o admin clica em "Salvar rodízio".
let carneRotationDraft = null;
// Cópia do rascunho no momento em que foi aberto/salvo, para detectar alterações.
let carneRotationBaseline = null;
// Índice da dupla em edição inline no rodízio (-1 = nenhuma).
let editingCarnePairIndex = -1;


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
    // O avatar do header é um botão que abre o perfil — não deve ampliar a foto.
    if (photoWrap.closest('.header-avatar-btn')) return;
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
  const aura = (player?.id && String(player.id) === String(getTopRatedPlayerId())) ? ' avatar-aura' : '';

  if (photo) {
    return `<div class="avatar avatar-photo ${extraClass}${aura}"><img src="${photo}" alt="Foto de ${escapeHtml(player?.name || 'jogador')}" loading="lazy" /></div>`;
  }

  return `<div class="avatar ${extraClass}${aura}">${initials}</div>`;
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

          <section class="home-v2-card push-optin-card self-push-card">
            ${renderPushOptinInner()}
          </section>

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

// ---------- Rodízio recorrente do carnê ----------
function carneIsoToNoon(iso) { return new Date(`${String(iso).slice(0, 10)}T12:00:00`); }
function carneTodayIso() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
function carneAddDays(iso, days) {
  const d = carneIsoToNoon(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function carneDiffDays(aIso, bIso) {
  return Math.round((carneIsoToNoon(aIso).getTime() - carneIsoToNoon(bIso).getTime()) / 86400000);
}

// Fonte de verdade do rodízio. Se ainda não foi salvo, MIGRA da tabela datada
// atual (carne_schedule): duplas distintas na ordem das datas = um ciclo.
function getCarneRotation(snapshot) {
  const carne = Array.isArray(snapshot?.carne) ? snapshot.carne : [];
  const existing = carne.find((entry) => entry?.type === 'carne_rotation');
  if (existing && Array.isArray(existing.pairs) && existing.pairs.length && existing.start_date) {
    return {
      start_date: String(existing.start_date).slice(0, 10),
      pairs: existing.pairs.map((p) => ({ player1_id: String(p.player1_id), player2_id: String(p.player2_id) })),
      persisted: true,
    };
  }
  const schedule = getCarneScheduleEntriesForApp(snapshot);
  if (!schedule.length) return { start_date: '', pairs: [], persisted: false };
  const seen = new Set();
  const pairs = [];
  for (const entry of schedule) {
    const key = `${entry.player1_id}|${entry.player2_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ player1_id: entry.player1_id, player2_id: entry.player2_id });
  }
  return { start_date: schedule[0].date, pairs, persisted: false };
}

// Gera o calendário das próximas semanas (calculado, não digitado): semana w ->
// dupla pairs[w % N], a partir de start_date (+7 dias por semana).
function computeCarneCalendar(rotation, weeksAhead = 8, refIso = carneTodayIso()) {
  const pairs = Array.isArray(rotation?.pairs) ? rotation.pairs : [];
  const startIso = String(rotation?.start_date || '').slice(0, 10);
  const total = pairs.length;
  if (!total || !startIso) return [];
  const diffDays = carneDiffDays(refIso, startIso);
  let w0 = Math.ceil(diffDays / 7);
  if (w0 < 0) w0 = 0;
  const out = [];
  for (let i = 0; i < weeksAhead; i += 1) {
    const w = w0 + i;
    const idx = ((w % total) + total) % total;
    const pair = pairs[idx];
    out.push({
      date: carneAddDays(startIso, w * 7),
      player1_id: pair.player1_id,
      player2_id: pair.player2_id,
      cycleIndex: idx,
      isNext: i === 0,
    });
  }
  return out;
}

// Salva o rodízio em snapshot.carne. PRESERVA as entradas antigas (carne_schedule)
// como backup — a migração só as usa se o rodízio não existir, então elas ficam
// dormentes, mas evitam perda de dados caso o rodízio seja zerado/corrompido.
function persistCarneRotation(snapshot, rotation) {
  const others = (Array.isArray(snapshot.carne) ? snapshot.carne : [])
    .filter((entry) => entry?.type !== 'carne_rotation');
  const pairs = (Array.isArray(rotation.pairs) ? rotation.pairs : [])
    .filter((p) => p?.player1_id && p?.player2_id)
    .map((p) => ({ player1_id: String(p.player1_id), player2_id: String(p.player2_id) }));
  snapshot.carne = [
    ...others,
    { id: 'carne_rotation', type: 'carne_rotation', start_date: String(rotation.start_date || '').slice(0, 10), pairs },
  ];
}

// Monta a visão das PRÓXIMAS semanas: gira o ciclo para que a dupla da próxima
// quarta fique no topo, e ancora start_date nessa próxima data. Assim a lista
// mostra sempre o futuro, e arrastar uma dupla muda a data dela (a data fica na
// posição). Salvar persiste já nessa forma re-ancorada.
function buildCarneUpcoming(persisted) {
  const pairs = Array.isArray(persisted?.pairs) ? persisted.pairs : [];
  const startIso = String(persisted?.start_date || '').slice(0, 10);
  if (!pairs.length || !startIso) {
    return { start_date: startIso, pairs: pairs.map((p) => ({ player1_id: p.player1_id, player2_id: p.player2_id })) };
  }
  const total = pairs.length;
  const diffDays = carneDiffDays(carneTodayIso(), startIso);
  let w0 = Math.ceil(diffDays / 7);
  if (w0 < 0) w0 = 0;
  const nextDate = carneAddDays(startIso, w0 * 7);
  const currentIndex = ((w0 % total) + total) % total;
  const rotated = [];
  for (let i = 0; i < total; i += 1) {
    const p = pairs[(currentIndex + i) % total];
    rotated.push({ player1_id: p.player1_id, player2_id: p.player2_id });
  }
  return { start_date: nextDate, pairs: rotated };
}

// Rascunho: inicializa da visão "próximas semanas" na primeira vez. Edições
// mexem só aqui (não no estado sincronizado), então o poll não as reverte.
function getCarneRotationDraft(snapshot) {
  if (!carneRotationDraft) {
    carneRotationDraft = buildCarneUpcoming(getCarneRotation(snapshot));
    carneRotationBaseline = JSON.parse(JSON.stringify(carneRotationDraft));
  }
  return carneRotationDraft;
}
function resetCarneRotationDraft() { carneRotationDraft = null; carneRotationBaseline = null; editingCarnePairIndex = -1; }
// Captura o valor do input de data para o rascunho (preserva o que foi digitado
// através dos re-renders de outras edições).
function carneDraftSyncDate() {
  const input = document.getElementById('carne-rotation-start');
  if (input && carneRotationDraft) carneRotationDraft.start_date = input.value || carneRotationDraft.start_date;
}

// Concorrência: um jogador não pode estar em duas duplas do rodízio.
function carnePlayerUsedElsewhere(draft, playerId, exceptIndex = -1) {
  const id = String(playerId);
  return (draft.pairs || []).some((pair, i) => i !== exceptIndex
    && (String(pair.player1_id) === id || String(pair.player2_id) === id));
}
// Conjunto de ids de jogadores que aparecem em mais de uma dupla (para alertar).
function carneDuplicatePlayerIds(draft) {
  const counts = new Map();
  (draft?.pairs || []).forEach((pair) => {
    [pair.player1_id, pair.player2_id].forEach((id) => {
      const key = String(id);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id));
}

// Move a dupla de uma posição para outra no rascunho (usado pelo drag-and-drop).
function carneReorderDraftPairs(from, to) {
  if (!carneRotationDraft) return;
  const pairs = carneRotationDraft.pairs;
  if (from < 0 || from >= pairs.length || to < 0 || to >= pairs.length || from === to) return;
  const [moved] = pairs.splice(from, 1);
  pairs.splice(to, 0, moved);
  render(getState());
}
function isCarneRotationDirty() {
  if (!carneRotationDraft || !carneRotationBaseline) return false;
  return JSON.stringify(carneRotationDraft) !== JSON.stringify(carneRotationBaseline);
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

  if (action === "open-profile") {
    const currentPlayer = getCurrentSnapshotPlayer(snapshot);
    if (!currentPlayer) { showToast("Sessão inválida. Faça login novamente.", "error"); return; }
    selfProfileOpen = true;
    selfProfileEditOpen = false;
    if (snapshot.ui?.currentTab !== 'home') {
      patchState({ ui: { ...(snapshot.ui || {}), currentTab: 'home' } });
    } else {
      render(snapshot);
    }
    setTimeout(() => document.getElementById('self-profile-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    return;
  }

  if (action === "close-profile") {
    selfProfileOpen = false;
    selfProfileEditOpen = false;
    render(snapshot);
    return;
  }

  if (action === "toggle-self-profile-edit") {
    const currentPlayer = getCurrentSnapshotPlayer(snapshot);
    if (!currentPlayer) {
      showToast("Sessão inválida. Faça login novamente.", "error");
      return;
    }

    selfProfileOpen = true;
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

  // ----- Rodízio recorrente do carnê -----
  // Edições do rodízio mexem só no RASCUNHO local (não no estado sincronizado),
  // re-renderizam, e só persistem em "Salvar rodízio". Assim o poll não reverte
  // as alterações no meio de uma sequência de edições.
  if (action === "carne-rotation-add-pair") {
    if (!requireAdmin(snapshot, 'Apenas administrador pode editar o rodízio do carnê')) return;
    const p1 = document.getElementById('carne-rotation-player-1')?.value?.trim();
    const p2 = document.getElementById('carne-rotation-player-2')?.value?.trim();
    if (!p1 || !p2) { showToast('Selecione as duas pessoas da dupla.', 'error'); return; }
    if (p1 === p2) { showToast('A dupla precisa ser de duas pessoas diferentes.', 'error'); return; }
    const draft = getCarneRotationDraft(snapshot);
    carneDraftSyncDate();
    const dupId = carnePlayerUsedElsewhere(draft, p1) ? p1 : (carnePlayerUsedElsewhere(draft, p2) ? p2 : null);
    if (dupId) {
      const nm = snapshot.players.find((pl) => String(pl.id) === String(dupId))?.name || 'Esse jogador';
      showToast(`${nm} já está em outra dupla do rodízio.`, 'error');
      return;
    }
    if (!draft.start_date) draft.start_date = carneTodayIso();
    draft.pairs.push({ player1_id: p1, player2_id: p2 });
    render(getState());
    return;
  }

  if (action === "carne-rotation-remove-pair") {
    if (!requireAdmin(snapshot, 'Apenas administrador pode editar o rodízio do carnê')) return;
    const idx = Number(id);
    const draft = getCarneRotationDraft(snapshot);
    carneDraftSyncDate();
    if (!(idx >= 0 && idx < draft.pairs.length)) return;
    draft.pairs.splice(idx, 1);
    editingCarnePairIndex = -1;
    render(getState());
    return;
  }

  if (action === "carne-pair-edit") {
    if (!requireAdmin(snapshot, 'Apenas administrador pode editar o rodízio do carnê')) return;
    carneDraftSyncDate();
    editingCarnePairIndex = Number(id);
    render(getState());
    return;
  }

  if (action === "carne-pair-cancel-edit") {
    editingCarnePairIndex = -1;
    render(getState());
    return;
  }

  if (action === "carne-pair-save") {
    if (!requireAdmin(snapshot, 'Apenas administrador pode editar o rodízio do carnê')) return;
    const idx = Number(id);
    const draft = getCarneRotationDraft(snapshot);
    carneDraftSyncDate();
    if (!(idx >= 0 && idx < draft.pairs.length)) return;
    const p1 = document.getElementById('carne-pair-edit-1')?.value?.trim();
    const p2 = document.getElementById('carne-pair-edit-2')?.value?.trim();
    if (!p1 || !p2) { showToast('Selecione as duas pessoas da dupla.', 'error'); return; }
    if (p1 === p2) { showToast('A dupla precisa ser de duas pessoas diferentes.', 'error'); return; }
    const dupId = carnePlayerUsedElsewhere(draft, p1, idx) ? p1 : (carnePlayerUsedElsewhere(draft, p2, idx) ? p2 : null);
    if (dupId) {
      const nm = snapshot.players.find((pl) => String(pl.id) === String(dupId))?.name || 'Esse jogador';
      showToast(`${nm} já está em outra dupla do rodízio.`, 'error');
      return;
    }
    draft.pairs[idx] = { player1_id: p1, player2_id: p2 };
    editingCarnePairIndex = -1;
    render(getState());
    return;
  }

  if (action === "save-carne-rotation") {
    if (!requireAdmin(snapshot, 'Apenas administrador pode editar o rodízio do carnê')) return;
    const draft = getCarneRotationDraft(snapshot);
    carneDraftSyncDate();
    if (!draft.start_date) { showToast('Informe a data de início do rodízio.', 'error'); return; }
    if (!draft.pairs.length) { showToast('Adicione pelo menos uma dupla ao rodízio.', 'error'); return; }
    persistCarneRotation(snapshot, draft);
    carneRotationBaseline = JSON.parse(JSON.stringify(draft));
    const safe = repairManualSnapshot(snapshot);
    savePersistedState(safe);
    render(safe);
    showToast('Rodízio salvo.', 'success');
    return;
  }

  if (action === "discard-carne-rotation") {
    resetCarneRotationDraft();
    editingCarnePairIndex = -1;
    render(getState());
    showToast('Alterações descartadas.', 'success');
    return;
  }

  if (action === "test-overdue-reminders") {
    if (!requireAdmin(snapshot, 'Apenas administrador pode enviar lembretes')) return;
    showToast('Enviando lembretes de atraso…');
    const result = await triggerOverdueReminders();
    if (result.ok) {
      const d = result.data || {};
      if (d.skipped === 'sem_vencimento_definido') showToast('Defina a data de vencimento primeiro.', 'error');
      else if (d.skipped === 'ainda_nao_venceu') showToast('Ainda não venceu — ninguém em atraso hoje.', 'info');
      else showToast(`Lembretes: ${d.sent || 0} enviado(s) para ${d.overdue || 0} atrasado(s).`, 'success');
    } else {
      showToast(`Falha ao enviar lembretes (${result.reason}).`, 'error');
    }
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
  notifyWaitlistPromotion(result);
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
import { registerServiceWorker, getPushState, enablePush, disablePush, triggerServerPush, triggerOverdueReminders, triggerWaitlistPromotion, syncExistingPushSubscription } from '../services/push.service.js';
import { submitRatings, fetchRatings, loadRatingsCache, getTopRatedPlayerId } from '../services/ratings.service.js';

// Carrega as notas (uma vez por sessão) para os rankings da aba Campeonato e
// re-renderiza quando chegarem.
let _ratingsLoadStarted = false;
function ensureRatingsLoaded() {
  if (_ratingsLoadStarted) return;
  _ratingsLoadStarted = true;
  loadRatingsCache().then(() => render(getState())).catch(() => {});
}

// Avisa por push quem foi promovido da fila. Best-effort, fora do fluxo de UI;
// o servidor deduplica por (jogo + jogador), então é seguro chamar de qualquer
// cliente que tenha detectado a promoção.
function notifyWaitlistPromotion(result) {
  const promotedId = result?.promotedPlayerId;
  if (!promotedId) return;
  triggerWaitlistPromotion(result.gameKey, [promotedId]).catch(() => {});
}

// Sugestão padrão de abertura automática: segunda-feira 21h da semana do jogo.
// Formato datetime-local "YYYY-MM-DDTHH:mm" (hora local = Brasília).
function computeDefaultAutoOpen(gameDate) {
  const iso = String(gameDate || '').slice(0, 10);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0); // meio-dia evita virada de fuso
  const dow = d.getDay(); // 0=Dom, 1=Seg, ...
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow)); // recua até a segunda da semana
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}T21:00`;
}

// Controle de "Avisos no celular" (push). Markup com seletores por CLASSE para
// poder existir em dois lugares: na home (onboarding, até a 1ª ativação) e
// dentro da edição do perfil (gestão permanente).
function renderPushOptinInner() {
  return `
    <div class="home-v2-card-head">
      <div>
        <strong>Avisos no celular</strong>
        <span class="push-status-line">Verificando…</span>
      </div>
      <button class="btn btn-secondary btn-sm push-toggle-btn" type="button" style="display:none;"></button>
    </div>
    <p class="footer-note push-optin-hint push-hint" style="display:none;"></p>
  `;
}
function isPushOnboarded() {
  try { return localStorage.getItem('harmonia_push_onboarded') === '1'; } catch (_) { return false; }
}
function setPushOnboarded() {
  try { localStorage.setItem('harmonia_push_onboarded', '1'); } catch (_) {}
}

// Rótulo curto da abertura automática, ex.: "seg 21:00".
function formatAutoOpenLabel(at) {
  const m = String(at || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  const wd = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()];
  return `${wd} ${m[4]}:${m[5]}`;
}

// Resolve o auto_open_at a partir do formulário de jogo (vazio = manual).
function readAutoOpenFromForm(formData) {
  if (formData.get('auto_open_enabled') !== 'on') return '';
  const raw = String(formData.get('auto_open_at') || '').trim();
  return raw || computeDefaultAutoOpen(String(formData.get('game_date') || ''));
}

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

  // PWA / Web Push: registra o service worker em segundo plano (não bloqueia o
  // boot) e re-salva a inscrição existente no servidor (cura "inscrito no
  // navegador mas não salvo no banco").
  registerServiceWorker().then(() => {
    const current = getCurrentPlayer();
    if (current) syncExistingPushSubscription(current.id);
  });
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
    // Votação de desempenho (modal bloqueante) — fora do #app, não é apagado
    // pelo re-render. Best-effort/async.
    maybeShowPerfVote(snapshot, getCurrentPlayer());
    maybeShowCarneVote(snapshot, getCurrentPlayer());
  } catch (err) {
    console.error('[harmonia] Falha ao renderizar a tela:', err);
    renderFatalError();
  }
}

// ===================== Votação de desempenho (modal bloqueante) =====================
// Abre 1h após o início do jogo e dura settings.ratings_perf_window_hours. Só para
// quem esteve dentro do jogo e ainda não votou. Cada votante dá nota 1–10 em cada
// OUTRO jogador. O overlay vive fora de #app, então o re-render (poll 4s) não o apaga.
let perfVote = null;          // { gameKey, voterId, targets:[player], index, scores:{id:score} }
let perfVoteGameKey = null;   // jogo cujo status já foi avaliado
let perfVoteStatus = 'idle';  // idle | checking | active | voted
let ratingsUnavailable = false; // tabela ratings indisponível (ex.: ainda não migrada) → não bloqueia

function parseGameDateTimeMs(game) {
  const d = String(game?.game_date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!d) return null;
  const t = String(game?.game_time || '').match(/^(\d{2}):(\d{2})/);
  const hh = t ? Number(t[1]) : 20;
  const mm = t ? Number(t[2]) : 0;
  return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hh, mm, 0).getTime();
}

function getPerfWindow(snapshot, game) {
  const hours = Number(snapshot?.settings?.ratings_perf_window_hours) || 0;
  if (hours <= 0) return null;
  const startMs = parseGameDateTimeMs(game);
  if (!startMs) return null;
  const openMs = startMs + 60 * 60 * 1000; // 1h após o início
  return { openMs, closeMs: openMs + hours * 60 * 60 * 1000 };
}

function getInGamePlayers(snapshot, game) {
  const key = getGameKey(game);
  const ids = new Set((snapshot.confirmations || [])
    .filter((e) => e?.confirmed && String(e?.game_key || '') === String(key))
    .map((e) => String(e.player_id)));
  return (snapshot.players || []).filter((p) => ids.has(String(p.id)));
}

async function maybeShowPerfVote(snapshot, currentPlayer) {
  if (!currentPlayer) { unmountPerfVote(); return; }
  const game = getActiveGameFromSnapshot(snapshot);
  const key = getGameKey(game);
  const win = getPerfWindow(snapshot, game);
  const now = Date.now();
  const active = !!win && now >= win.openMs && now <= win.closeMs;
  const inGame = active && getInGamePlayers(snapshot, game).some((p) => String(p.id) === String(currentPlayer.id));

  if (perfVoteGameKey !== key) { perfVoteGameKey = key; perfVoteStatus = 'idle'; }

  if (!active || !inGame || ratingsUnavailable) { unmountPerfVote(); return; }
  if (perfVoteStatus === 'voted' || perfVoteStatus === 'active' || perfVoteStatus === 'checking') return;

  perfVoteStatus = 'checking';
  const res = await fetchRatings({ kind: 'desempenho', gameKey: key });
  if (!res.ok) {
    // Tabela indisponível (ex.: migração ainda não aplicada). NUNCA bloquear o
    // app por uma votação que não tem onde gravar.
    ratingsUnavailable = true;
    perfVoteStatus = 'idle';
    return;
  }
  if (res.rows.some((r) => String(r.voter_id) === String(currentPlayer.id))) {
    perfVoteStatus = 'voted';
    return;
  }
  const targets = getInGamePlayers(snapshot, game).filter((p) => String(p.id) !== String(currentPlayer.id));
  if (!targets.length) { perfVoteStatus = 'voted'; return; }
  perfVote = { gameKey: key, voterId: String(currentPlayer.id), targets, index: 0, scores: {} };
  perfVoteStatus = 'active';
  mountPerfVote();
}

// Trava o scroll do body enquanto QUALQUER modal de votação estiver aberto.
function syncVoteBodyLock() {
  document.body.classList.toggle('vote-open', !!document.querySelector('.vote-overlay'));
}

function unmountPerfVote() {
  const el = document.getElementById('perf-vote-overlay');
  if (el) el.remove();
  syncVoteBodyLock();
}

function mountPerfVote() {
  let el = document.getElementById('perf-vote-overlay');
  if (!el) { el = document.createElement('div'); el.id = 'perf-vote-overlay'; el.className = 'vote-overlay'; document.body.appendChild(el); }
  syncVoteBodyLock();
  el.onclick = (ev) => {
    if (!perfVote) return;
    const nav = ev.target.closest('[data-perf-nav]');
    if (nav) {
      const dir = nav.dataset.perfNav === 'next' ? 1 : -1;
      perfVote.index = Math.max(0, Math.min(perfVote.targets.length - 1, perfVote.index + dir));
      renderPerfVoteCard();
      return;
    }
    if (ev.target.closest('[data-perf-submit]')) submitPerfVote();
  };
  // Slider de nota: atualiza o valor sem re-renderizar (não interrompe o arraste).
  el.oninput = (ev) => {
    const slider = ev.target.closest('[data-perf-slider]');
    if (!slider || !perfVote) return;
    const v = Number(slider.value);
    perfVote.scores[String(perfVote.targets[perfVote.index].id)] = v;
    slider.removeAttribute('data-untouched');
    const cls = perfScoreClass(v);
    slider.className = `perf-vote-slider ${cls}`;
    const badge = el.querySelector('[data-score-badge]');
    if (badge) { badge.textContent = v; badge.className = `perf-vote-value ${cls}`; }
    const next = el.querySelector('[data-perf-nav="next"]');
    if (next) next.disabled = false;
    const submit = el.querySelector('[data-perf-submit]');
    if (submit) submit.disabled = !perfVote.targets.every((t) => perfVote.scores[String(t.id)] != null);
    const hint = el.querySelector('.perf-vote-hint');
    if (hint) hint.textContent = 'Sua nota é anônima. Avalie todos para liberar o app.';
  };
  renderPerfVoteCard();
}

function perfScoreClass(v) {
  if (v == null) return 'is-empty';
  if (v <= 3) return 'is-low';
  if (v <= 6) return 'is-mid';
  if (v <= 8) return 'is-good';
  return 'is-top';
}

function renderPerfVoteCard() {
  const el = document.getElementById('perf-vote-overlay');
  if (!el || !perfVote) return;
  const total = perfVote.targets.length;
  const i = perfVote.index;
  const target = perfVote.targets[i];
  const current = perfVote.scores[String(target.id)];
  const isLast = i === total - 1;
  const allRated = perfVote.targets.every((t) => perfVote.scores[String(t.id)] != null);
  el.innerHTML = `
    <div class="perf-vote-backdrop"></div>
    <div class="perf-vote-modal game-vote-modal" role="dialog" aria-modal="true">
      <div class="perf-vote-head">
        <div class="perf-vote-kicker">Avalie o jogo ⚽</div>
        <div class="perf-vote-progress">${i + 1} de ${total}</div>
      </div>
      <div class="perf-vote-player">
        ${renderAvatarForApp(target, 'perf-vote-avatar')}
        <div class="perf-vote-name">${escapeHtml(target.name || '')}</div>
        <div class="perf-vote-pos">${getPositionLabel(target.position)}</div>
      </div>

      <div class="perf-vote-rate">
        <div class="perf-vote-value ${perfScoreClass(current)}" data-score-badge>${current != null ? current : '–'}</div>
        <input class="perf-vote-slider ${perfScoreClass(current)}" type="range" min="1" max="10" step="1"
               value="${current != null ? current : 5}" ${current == null ? 'data-untouched="1"' : ''} data-perf-slider
               aria-label="Nota de ${escapeHtml(target.name || '')}" />
        <div class="perf-vote-scale-labels"><span>1</span><span>5</span><span>10</span></div>
      </div>

      <div class="perf-vote-actions">
        ${i > 0 ? '<button type="button" class="btn btn-secondary" data-perf-nav="prev">Voltar</button>' : '<span></span>'}
        ${isLast
          ? `<button type="button" class="btn btn-primary" data-perf-submit ${allRated ? '' : 'disabled'}>Enviar notas</button>`
          : `<button type="button" class="btn btn-primary" data-perf-nav="next" ${current != null ? '' : 'disabled'}>Próximo</button>`}
      </div>
      <p class="perf-vote-hint">${current == null ? 'Arraste para dar a nota (1 a 10).' : 'Sua nota é anônima.'} Avalie todos para liberar o app.</p>
    </div>
  `;
}

async function submitPerfVote() {
  if (!perfVote) return;
  const rows = perfVote.targets.map((t) => ({
    kind: 'desempenho',
    game_key: perfVote.gameKey,
    voter_id: perfVote.voterId,
    target_id: String(t.id),
    score: perfVote.scores[String(t.id)],
  }));
  const btn = document.querySelector('[data-perf-submit]');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  const res = await submitRatings(rows);
  if (!res.ok) {
    showToast('Não foi possível enviar as notas. Tente de novo.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar notas'; }
    return;
  }
  perfVoteStatus = 'voted';
  perfVote = null;
  unmountPerfVote();
  showToast('Notas enviadas. Valeu! ⚽', 'success');
}
// =================== fim votação de desempenho ===================

// ===================== Votação do churrasco (modal bloqueante) =====================
// Abre 23h do dia do jogo, fecha 12h do dia seguinte. Todos os membros votam UMA
// nota 1–10 na dupla responsável (do rodízio). O modal de desempenho tem prioridade.
let carneVote = null;          // { gameKey, voterId, duo, score }
let carneVoteGameKey = null;
let carneVoteStatus = 'idle';

function getCarneWindow(game) {
  const m = String(game?.game_date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const openMs = new Date(y, mo, d, 23, 0, 0).getTime();      // 23h do dia do jogo
  const closeMs = new Date(y, mo, d + 1, 12, 0, 0).getTime(); // 12h do dia seguinte
  return { openMs, closeMs };
}

// Dupla responsável pelo churrasco do jogo, a partir do rodízio.
function getChurrascoDuo(snapshot, game) {
  const rotation = getCarneRotation(snapshot);
  const pairs = Array.isArray(rotation?.pairs) ? rotation.pairs : [];
  const startIso = String(rotation?.start_date || '').slice(0, 10);
  const gameIso = String(game?.game_date || '').slice(0, 10);
  if (!pairs.length || !startIso || !gameIso) return null;
  const week = Math.round(carneDiffDays(gameIso, startIso) / 7);
  const idx = ((week % pairs.length) + pairs.length) % pairs.length;
  const pair = pairs[idx];
  if (!pair) return null;
  const find = (id) => (snapshot.players || []).find((p) => String(p.id) === String(id)) || { id, name: 'Jogador' };
  const key = [String(pair.player1_id), String(pair.player2_id)].sort().join('|');
  return { player1: find(pair.player1_id), player2: find(pair.player2_id), key };
}

async function maybeShowCarneVote(snapshot, currentPlayer) {
  if (!currentPlayer) { unmountCarneVote(); return; }
  // Desempenho tem prioridade: se o modal dele está aberto, espera.
  if (document.getElementById('perf-vote-overlay')) return;

  const game = getActiveGameFromSnapshot(snapshot);
  const key = getGameKey(game);
  const win = getCarneWindow(game);
  const now = Date.now();
  const active = !!win && now >= win.openMs && now <= win.closeMs;

  if (carneVoteGameKey !== key) { carneVoteGameKey = key; carneVoteStatus = 'idle'; }
  if (!active || ratingsUnavailable) { unmountCarneVote(); return; }
  if (carneVoteStatus === 'voted' || carneVoteStatus === 'active' || carneVoteStatus === 'checking') return;

  const duo = getChurrascoDuo(snapshot, game);
  if (!duo) { carneVoteStatus = 'voted'; return; } // sem rodízio/dupla → nada a votar

  carneVoteStatus = 'checking';
  const res = await fetchRatings({ kind: 'churrasco', gameKey: key });
  if (!res.ok) { ratingsUnavailable = true; carneVoteStatus = 'idle'; return; }
  if (res.rows.some((r) => String(r.voter_id) === String(currentPlayer.id))) { carneVoteStatus = 'voted'; return; }

  carneVote = { gameKey: key, voterId: String(currentPlayer.id), duo, score: null };
  carneVoteStatus = 'active';
  mountCarneVote();
}

function unmountCarneVote() {
  const el = document.getElementById('carne-vote-overlay');
  if (el) el.remove();
  syncVoteBodyLock();
}

function mountCarneVote() {
  let el = document.getElementById('carne-vote-overlay');
  if (!el) { el = document.createElement('div'); el.id = 'carne-vote-overlay'; el.className = 'vote-overlay'; document.body.appendChild(el); }
  syncVoteBodyLock();
  el.onclick = (ev) => {
    if (ev.target.closest('[data-carne-submit]')) submitCarneVote();
  };
  el.oninput = (ev) => {
    const slider = ev.target.closest('[data-carne-slider]');
    if (!slider || !carneVote) return;
    const v = Number(slider.value);
    carneVote.score = v;
    slider.removeAttribute('data-untouched');
    const cls = perfScoreClass(v);
    slider.className = `perf-vote-slider ${cls}`;
    const badge = el.querySelector('[data-score-badge]');
    if (badge) { badge.textContent = v; badge.className = `perf-vote-value ${cls}`; }
    const submit = el.querySelector('[data-carne-submit]');
    if (submit) submit.disabled = false;
    const hint = el.querySelector('.perf-vote-hint');
    if (hint) hint.textContent = 'Sua nota é anônima. Nota do churrasco da dupla.';
  };
  renderCarneVoteCard();
}

function renderCarneVoteCard() {
  const el = document.getElementById('carne-vote-overlay');
  if (!el || !carneVote) return;
  const v = carneVote.score;
  const duo = carneVote.duo;
  el.innerHTML = `
    <div class="perf-vote-backdrop"></div>
    <div class="perf-vote-modal carne-vote-modal" role="dialog" aria-modal="true">
      <div class="perf-vote-head">
        <div class="perf-vote-kicker">Avalie o churrasco 🥩</div>
      </div>
      <div class="carne-vote-duo">
        ${renderAvatarForApp(duo.player1, 'perf-vote-avatar')}
        ${renderAvatarForApp(duo.player2, 'perf-vote-avatar')}
      </div>
      <div class="perf-vote-name">${escapeHtml(duo.player1?.name || '?')} e ${escapeHtml(duo.player2?.name || '?')}</div>

      <div class="perf-vote-rate">
        <div class="perf-vote-value ${perfScoreClass(v)}" data-score-badge>${v != null ? v : '–'}</div>
        <input class="perf-vote-slider ${perfScoreClass(v)}" type="range" min="1" max="10" step="1"
               value="${v != null ? v : 5}" ${v == null ? 'data-untouched="1"' : ''} data-carne-slider aria-label="Nota do churrasco" />
        <div class="perf-vote-scale-labels"><span>1</span><span>5</span><span>10</span></div>
      </div>

      <div class="perf-vote-actions">
        <span></span>
        <button type="button" class="btn btn-primary" data-carne-submit ${v != null ? '' : 'disabled'}>Enviar nota</button>
      </div>
      <p class="perf-vote-hint">${v == null ? 'Arraste para dar a nota (1 a 10).' : 'Sua nota é anônima.'} Nota do churrasco da dupla.</p>
    </div>
  `;
}

async function submitCarneVote() {
  if (!carneVote || carneVote.score == null) return;
  const row = {
    kind: 'churrasco',
    game_key: carneVote.gameKey,
    voter_id: carneVote.voterId,
    target_id: carneVote.duo.key,
    score: carneVote.score,
  };
  const btn = document.querySelector('[data-carne-submit]');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  const res = await submitRatings([row]);
  if (!res.ok) {
    showToast('Não foi possível enviar a nota. Tente de novo.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar nota'; }
    return;
  }
  carneVoteStatus = 'voted';
  carneVote = null;
  unmountCarneVote();
  showToast('Nota do churrasco enviada. Valeu! 🥩', 'success');
}
// =================== fim votação do churrasco ===================

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
  ensureRatingsLoaded(); // carrega as notas (uma vez) p/ rankings + áurea em todo lugar
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
            <div class="header-subtitle">${authzIsAdmin(currentPlayer) ? 'Administrador' : getPlayerRole(currentPlayer) === 'carne' ? 'Grupo do carnê' : 'Jogador'}</div>
          </div>
        </div>
        <div class="header-actions">
          <button class="header-avatar-btn" type="button" data-action="open-profile" aria-label="Meu perfil">
            ${renderAvatarForApp(currentPlayer, 'header-avatar')}
          </button>
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


async function bindPushOptin(currentPlayer) {
  const cards = [...appElement.querySelectorAll('.push-optin-card')];
  for (const card of cards) {
    // eslint-disable-next-line no-await-in-loop
    await bindPushControl(card, currentPlayer);
  }
}

async function bindPushControl(card, currentPlayer) {
  const statusLine = card.querySelector('.push-status-line');
  const button = card.querySelector('.push-toggle-btn');
  const hint = card.querySelector('.push-hint');
  if (!statusLine || !button) return;
  // O card da home (id push-optin-card) é só onboarding: some assim que o push
  // está ativo. A gestão permanente fica no card dentro da edição do perfil.
  const isHomeCard = card.id === 'push-optin-card';

  const showHint = (text) => { if (hint) { hint.textContent = text; hint.style.display = text ? '' : 'none'; } };
  const showButton = (label) => { button.textContent = label; button.style.display = label ? 'inline-flex' : 'none'; };

  const state = await getPushState();

  if (!state.supported) {
    if (state.iosNeedsInstall) {
      statusLine.textContent = 'Disponível ao instalar o app';
      showButton('');
      showHint('No iPhone: toque em Compartilhar → "Adicionar à Tela de Início". Depois abra o app por esse ícone para ativar os avisos.');
    } else {
      statusLine.textContent = 'Não suportado neste navegador';
      showButton('');
      showHint('');
    }
    return;
  }

  const refresh = (s) => {
    if (s.permission === 'denied') {
      statusLine.textContent = 'Bloqueado nas configurações do navegador';
      showButton('');
      showHint('Você bloqueou as notificações. Reative nas permissões do site no navegador.');
    } else if (s.subscribed && s.permission === 'granted') {
      setPushOnboarded();
      // Já ativado: na home o card desaparece (gestão migra para o perfil).
      if (isHomeCard) { card.style.display = 'none'; return; }
      statusLine.textContent = 'Ativado ✓';
      showButton('Desativar');
      showHint('Você receberá os avisos do Harmonia neste aparelho. Pode desativar aqui quando quiser.');
    } else {
      statusLine.textContent = 'Desativado';
      showButton('Ativar');
      showHint(state.iosNeedsInstall ? 'No iPhone, ative com o app aberto pela Tela de Início.' : 'Receba um aviso quando as inscrições abrirem.');
    }
  };
  refresh(state);

  button.onclick = async () => {
    // IMPORTANTE: nada de `await` antes de pedir a permissão. Notification
    // .requestPermission() exige o gesto do toque ainda "fresco"; um await
    // aqui (ex.: getPushState) consome o gesto e o Chrome ignora o pedido.
    // Por isso decidimos ativar/desativar pelo RÓTULO atual do botão.
    const isCurrentlyOn = String(button.textContent || '').trim() === 'Desativar';
    const original = isCurrentlyOn ? 'Desativar' : 'Ativar';
    button.disabled = true;
    button.textContent = '...';
    let activated = false;
    if (isCurrentlyOn) {
      await disablePush();
    } else {
      const result = await enablePush(currentPlayer?.id);
      if (!result.ok) {
        const messages = {
          denied: 'Permissão negada. Libere as notificações nas configurações do site.',
          ios_needs_install: 'No iPhone, instale o app (Adicionar à Tela de Início) e abra por ele para ativar.',
          unsupported: 'Este navegador não suporta notificações.',
          subscribe_failed: 'Não foi possível ativar agora. Tente novamente.',
        };
        showToast(messages[result.reason] || 'Não foi possível ativar as notificações.', 'error');
      } else {
        activated = true;
        setPushOnboarded();
        showToast('Notificações ativadas.', 'success');
      }
    }
    button.disabled = false;
    button.textContent = original;
    // Ao ativar pela 1ª vez, re-renderiza para tirar o card de onboarding da home.
    if (activated && isHomeCard) { render(getState()); return; }
    refresh(await getPushState());
  };
}

function bindCarneRotationDrag() {
  const list = appElement.querySelector('.carne-rotation-list');
  if (!list) return;

  list.querySelectorAll('.carne-drag-handle').forEach((handle) => {
    handle.addEventListener('pointerdown', (event) => {
      const dragItem = handle.closest('.carne-rotation-item');
      if (!dragItem) return;
      event.preventDefault();

      const fromIndex = Number(dragItem.dataset.pairIndex);
      const startY = event.clientY;
      // Centros originais de cada dupla, para calcular onde soltar.
      const centers = [...list.querySelectorAll('.carne-rotation-item')].map((el) => {
        const rect = el.getBoundingClientRect();
        return { index: Number(el.dataset.pairIndex), mid: rect.top + rect.height / 2 };
      });
      let dropTo = fromIndex;
      dragItem.classList.add('is-dragging');
      try { handle.setPointerCapture(event.pointerId); } catch (_) {}

      const onMove = (ev) => {
        ev.preventDefault();
        const dy = ev.clientY - startY;
        dragItem.style.transform = `translateY(${dy}px)`;
        const rect = dragItem.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        dropTo = centers.filter((c) => c.index !== fromIndex && c.mid < center).length;
      };
      const onUp = (ev) => {
        try { handle.releasePointerCapture(ev.pointerId); } catch (_) {}
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        dragItem.classList.remove('is-dragging');
        dragItem.style.transform = '';
        if (dropTo !== fromIndex) carneReorderDraftPairs(fromIndex, dropTo);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    });
  });
}

function bindAppEvents(currentPlayer) {
  appElement.querySelector('#logout-button')?.addEventListener('click', async () => { selfProfileOpen = false; selfProfileEditOpen = false; resetCarneRotationDraft(); await logout(); });
  bindPushOptin(currentPlayer);
  bindCarneRotationDrag();
  appElement.querySelector('#carne-rotation-start')?.addEventListener('change', () => {
    if (!carneRotationDraft) return;
    carneDraftSyncDate();
    render(getState());
  });

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
    notifyWaitlistPromotion(result);
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
        auto_open_at: readAutoOpenFromForm(formData),
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

      // Gatilho de push: inscrições acabaram de ABRIR (fechado -> aberto).
      if (!existingGame.open && updatedGame.open) {
        triggerServerPush({
          target: 'all',
          title: 'Inscrições abertas ⚽',
          body: `Já dá para confirmar presença no jogo de ${formatDate(updatedGame.game_date)}.`,
          url: './',
        });
      }

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
        auto_open_at: readAutoOpenFromForm(formData),
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


  const ratingsForm = appElement.querySelector('#ratings-config-form');
  if (ratingsForm) {
    ratingsForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!requireAdmin(getState(), 'Apenas administrador pode alterar a votação')) return;
      const hours = Math.max(0, Math.round(Number(new FormData(ratingsForm).get('ratings_perf_window_hours')) || 0));
      patchState({ settings: { ...(getState().settings || {}), ratings_perf_window_hours: hours } });
      const safeSnapshot = repairManualSnapshot(getState());
      savePersistedState(safeSnapshot);
      render(safeSnapshot);
      showToast(hours ? `Votação de desempenho: janela de ${hours}h.` : 'Votação de desempenho desativada (janela 0).');
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
  weekly_game: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polygon points="12,8.8 15,11 13.9,14.6 10.1,14.6 9,11" fill="currentColor" stroke="currentColor"/><path d="M12 8.8V3"/><path d="M15 11l5.6-1.8"/><path d="M13.9 14.6l3.4 4.7"/><path d="M10.1 14.6l-3.4 4.7"/><path d="M9 11 3.4 9.2"/></svg>',
  players: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M18 13.7a5.5 5.5 0 0 1 3.5 6.3"/></svg>',
  carne: '<span class="bnav-emoji" aria-hidden="true">🥩</span>',
  championship: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11"/><path d="M17 6h3v1.5A3.5 3.5 0 0 1 16.5 11"/><path d="M9 21h6"/><path d="M12 14v7"/></svg>',
  config: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
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
      {
        const carneRotation = getCarneRotationDraft(snapshot);
        const carneDates = (carneRotation.pairs || []).map((_, i) => (carneRotation.start_date ? carneAddDays(carneRotation.start_date, i * 7) : ''));
        const carneDirty = isCarneRotationDirty();
        return renderCarneScreen(snapshot, currentPlayer, buildPlayersView(snapshot), editingPlayerId, carneRotation, carneDates, carneDirty, editingCarnePairIndex);
      }
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
  const carneRotationForHome = getCarneRotation(workingSnapshot);
  const carneCalendarForHome = computeCarneCalendar(carneRotationForHome, 1);
  const carneStatus =
    workingSnapshot.carne.some((entry) => String(entry?.player_id || '') === String(activePlayer.id) && entry?.active !== false) ||
    (Array.isArray(carneRotationForHome.pairs) && carneRotationForHome.pairs.some((pair) =>
      String(pair?.player1_id || '') === String(activePlayer.id) ||
      String(pair?.player2_id || '') === String(activePlayer.id)
    ));
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
  const nextCarneEntry = carneCalendarForHome[0];
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
  const homeClosedSubline = (game && game.auto_open_at)
    ? `Abre automaticamente: ${formatAutoOpenLabel(game.auto_open_at)}`
    : ((game && game.game_date) ? 'Abertura das inscrições em breve.' : 'Aguarde o próximo jogo ser marcado.');
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
      icon: '🥩',
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
      ${(game && game.open) ? `
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
      ` : `
      <section class="home-v2-card home-v2-closed-card">
        <div class="home-v2-closed-main">
          <div class="home-v2-kicker">Próximo jogo</div>
          <div class="home-v2-closed-date">${(game && game.game_date) ? formatDate(game.game_date) + (game.game_time ? ' · ' + game.game_time : '') : 'Nenhum jogo agendado'}</div>
          <div class="home-v2-closed-sub">${homeClosedSubline}</div>
        </div>
        ${(game && game.game_date) ? '<button class="home-v2-secondary" type="button" data-tab="weekly_game">Ver jogo</button>' : ''}
      </section>
      `}

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

      ${isPushOnboarded() ? '' : `
      <section class="home-v2-card push-optin-card" id="push-optin-card">
        ${renderPushOptinInner()}
      </section>`}

      ${renderProfilePanel(activePlayer)}
    </section>
  `;
}

// Painel de perfil (abre pelo avatar do header). Modo VER por padrão; o botão
// "Editar cadastro" abre o formulário (renderSelfProfileEditCardForHome).
function renderProfilePanel(activePlayer) {
  if (!selfProfileOpen) return '';
  if (selfProfileEditOpen) return renderSelfProfileEditCardForHome(activePlayer);

  const carneOnly = activePlayer.plays_football === false;
  const roleLabel = authzIsAdmin(activePlayer)
    ? 'Administrador · ' + getPositionLabel(activePlayer.position)
    : (getPlayerRole(activePlayer) === 'carne' ? 'Somente carne' : getPositionLabel(activePlayer.position));

  return `
    <section class="card self-profile-card profile-view-card" id="self-profile-card">
      <div class="profile-view-head">
        ${renderAvatarForApp(activePlayer, 'profile-view-avatar')}
        <div class="profile-view-id">
          <strong>${escapeHtml(activePlayer.name || '')}</strong>
          <span>${roleLabel}</span>
        </div>
        <button class="home-v2-link" type="button" data-action="close-profile">Fechar</button>
      </div>

      <div class="profile-view-rows">
        <div class="profile-view-row"><span>Telefone</span><strong>${escapeHtml(formatPhone(activePlayer.phone || '')) || '—'}</strong></div>
        <div class="profile-view-row"><span>Nascimento</span><strong>${(() => { const m = String(activePlayer.birthDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (escapeHtml(activePlayer.birthDate || '') || '—'); })()}</strong></div>
        ${carneOnly ? '' : `<div class="profile-view-row"><span>Mensalidade</span><strong class="tag ${activePlayer.mens_ok ? 'is-ok' : 'is-warn'}">${activePlayer.mens_ok ? 'Em dia' : 'Pendente'}</strong></div>`}
      </div>

      <div class="profile-view-actions">
        <button class="btn btn-primary" type="button" data-action="toggle-self-profile-edit">Editar cadastro</button>
        <button class="btn btn-secondary" type="button" id="logout-button">Sair</button>
      </div>
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

          <label class="checkbox-line">
            <input type="checkbox" name="auto_open_enabled" ${item.auto_open_at ? 'checked' : ''} />
            Abrir inscrições automaticamente no horário
          </label>
          <label class="field-label">
            Abrir automaticamente em
            <input class="input" type="datetime-local" name="auto_open_at" value="${escapeHtml(item.auto_open_at || computeDefaultAutoOpen(item.game_date))}" />
            <small class="footer-note">Só vale se a opção acima estiver marcada. Padrão: segunda 21h da semana do jogo.</small>
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

        <details class="create-game-details games-create-inline">
          <summary class="create-game-summary">
            <span><strong>Novo jogo</strong></span>
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

            <label class="checkbox-line">
              <input type="checkbox" name="auto_open_enabled" />
              Abrir inscrições automaticamente no horário
            </label>
            <label class="field-label">
              Abrir automaticamente em
              <input class="input" type="datetime-local" name="auto_open_at" value="" />
              <small class="footer-note">Só vale se a opção acima estiver marcada. Em branco usa segunda 21h da semana do jogo.</small>
            </label>

            <div class="player-admin-actions game-config-actions">
              <button class="btn btn-primary" type="submit">Criar jogo</button>
            </div>
          </form>
        </details>
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

        <div class="mens-reminder-block">
          <div class="card-subtitle">Lembrete de atraso (push)</div>
          <p class="footer-note">Todo dia às 7h, quem estiver em atraso (a partir do 1º dia após o vencimento) recebe um aviso amigável por push, automaticamente.</p>
        </div>
      </section>

      <section class="card ratings-config-card">
        <div class="card-title">Votação de desempenho</div>
        <p class="footer-note">A votação abre automaticamente 1h após o início do jogo e dura a quantidade de horas abaixo. Aparece como aviso obrigatório só para quem esteve dentro do jogo. 0 = desativada.</p>
        <form id="ratings-config-form" class="player-admin-form game-config-form">
          <label class="field-label">
            Janela de votação (horas)
            <input class="input" type="number" min="0" max="48" step="1" name="ratings_perf_window_hours" value="${Number(snapshot.settings?.ratings_perf_window_hours) || 0}" />
          </label>
          <div class="player-admin-actions game-config-actions">
            <button class="btn btn-primary" type="submit">Salvar votação</button>
          </div>
        </form>
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
