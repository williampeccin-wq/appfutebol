window.__HARMONIA_BUILD__ = 'v1.60.0-presence-normalization-foundation';

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

function renderAvatarForApp(player, extraClass = '') {
  const photo = getPlayerPhoto(player);
  const initials = getInitials(player?.name);

  if (photo) {
    return `<div class="avatar avatar-photo ${extraClass}"><img src="${photo}" alt="Foto de ${escapeHtml(player?.name || 'jogador')}" loading="lazy" /></div>`;
  }

  return `<div class="avatar ${extraClass}">${initials}</div>`;
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
    const builtResult = buildTeamResultStatuses(snapshot, outcome);

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
      team_a: builtResult.team_a,
      team_b: builtResult.team_b,
      statuses: builtResult.statuses,
    });

    const safeSnapshot = repairManualSnapshot(snapshot);
    savePersistedState(safeSnapshot);
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
    savePersistedState(safeSnapshot);
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
      mens_ok,
      is_admin,
      photoDataUrl
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

  const player = snapshot.players.find((p) => String(p.id) === String(id));
  if (!player) {
    showToast("Jogador não encontrado.", "error");
    return;
  }

  if (player.auth_user_id) {
    showToast("Este jogador já tem acesso criado.", "error");
    return;
  }

  const phone = normalizeAdminPhone(player.phone);
  if (phone.length < 10 || phone.length > 11) {
    showToast("Este jogador precisa ter telefone válido antes de criar acesso.", "error");
    return;
  }

  const newPassword = window.prompt(`Senha inicial para ${player.name}:`);
  if (!newPassword) return;

  if (String(newPassword).length < 6) {
    showToast("Senha deve ter pelo menos 6 caracteres.", "error");
    return;
  }

  const adminSecret = window.prompt("Informe o segredo admin para criar acesso:");
  if (!adminSecret) return;

  setActionBusy(trigger, "Criando...");

  try {
    const session = JSON.parse(localStorage.getItem("harmonia_auth_session") || "{}");

    const response = await fetch(
      "https://kpgghcrmbkrwpvtegcjh.supabase.co/functions/v1/admin-reset-password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token || ""}`,
        },
        body: JSON.stringify({
          mode: "create_access",
          admin_secret: adminSecret,
          player_id: player.id,
          name: player.name,
          phone,
          birth_date: player.birthDate || "",
          new_password: newPassword,
        }),
      },
    );

    const data = await response.json().catch(() => ({}));

    clearActionBusy(trigger);

    if (!response.ok || !data?.user_id) {
      showToast(data.error || "Falha ao criar acesso.", "error");
      return;
    }

    const target = snapshot.players.find((p) => String(p.id) === String(player.id));
    if (target) {
      target.auth_user_id = data.user_id;
      target.email = data.email || `${phone}@harmonia.app`;
      target.login_phone = phone;
      target.phone = phone;
    }

    const safeSnapshot = repairManualSnapshot(snapshot);
    replaceState(safeSnapshot);
    savePersistedState(safeSnapshot);
    render(safeSnapshot);

    showToast("Acesso criado com sucesso.", "success");
  } catch (error) {
    clearActionBusy(trigger);
    showToast(error?.message || "Erro inesperado.", "error");
  }

  return;
}


if (action === "reset-player-password") {
  if (!requireAdmin(snapshot, "Apenas administrador pode resetar senha")) return;

  const player = snapshot.players.find((p) => String(p.id) === String(id));
  if (!player) {
    showToast("Jogador não encontrado.", "error");
    return;
  }

  if (!player.auth_user_id) {
    showToast("Este jogador ainda não tem acesso criado.", "error");
    return;
  }

  const newPassword = window.prompt(`Nova senha para ${player.name}:`);
  if (!newPassword) return;

  if (String(newPassword).length < 6) {
    showToast("Senha deve ter pelo menos 6 caracteres.", "error");
    return;
  }

  const adminSecret = window.prompt("Informe o segredo admin da recuperação de senha:");
  if (!adminSecret) return;

  setActionBusy(trigger, "Resetando...");

  try {
    const session = JSON.parse(localStorage.getItem("harmonia_auth_session") || "{}");

    const response = await fetch(
      "https://kpgghcrmbkrwpvtegcjh.supabase.co/functions/v1/admin-reset-password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token || ""}`,
        },
        body: JSON.stringify({
          mode: "reset_password",
          admin_secret: adminSecret,
          user_id: player.auth_user_id,
          new_password: newPassword,
        }),
      },
    );

    const data = await response.json().catch(() => ({}));

    clearActionBusy(trigger);

    if (!response.ok) {
      showToast(data.error || "Falha ao resetar senha.", "error");
      return;
    }

    showToast("Senha resetada com sucesso.", "success");
  } catch (error) {
    clearActionBusy(trigger);
    showToast(error?.message || "Erro inesperado.", "error");
  }

  return;
}


if (action === "delete-player") {
  if (!requireAdmin(snapshot, 'Apenas administrador pode excluir jogadores')) return;
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
    message: `Tem certeza de que deseja excluir ${player.name}? Essa ação remove o jogador, suas confirmações, vínculos de carne e registros relacionados da lista atual.`,
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
    ? snapshot.carne.filter((entry) => {
        if (entry?.type === 'carne_schedule') {
          return String(entry.player1_id) !== String(id) && String(entry.player2_id) !== String(id);
        }
        return String(entry.player_id) !== String(id);
      })
    : [];

  const safeSnapshot = repairManualSnapshot(snapshot);
  replaceState(safeSnapshot);
  savePersistedState(safeSnapshot);
  uiActionInFlight = false;
  showToast("Jogador removido", "success");
  window.scrollTo({ top: 0, behavior: "smooth" });
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

  const result = toggleConfirmation(id);
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

import { buildGameView, buildPlayersView } from "../domain/projection.js";
import { validateAndRepairState } from "../domain/state.guard.js";
import { APP_VERSION } from "./version.js";
import { getState, patchState, replaceState, subscribe } from './state.js';
import { getState as loadPersistedState, saveState as savePersistedState, getStorageMeta } from '../domain/storage.adapter.js';
import { loadRemoteState } from '../services/storage.supabase.js';
import { getCurrentPlayer, login, logout, register, restoreSession, prepareStoredSession, updateOwnPassword } from '../services/auth.service.js';
import { renderAuthScreen } from '../modules/auth/auth.view.js';
import { renderPlayersScreen, renderCarneScreen } from '../modules/players/players.view.js';
import { renderChampionshipScreen } from '../modules/championship/championship.view.js';
import { buildTeamResultStatuses, deleteChampionshipResult, persistChampionshipResult } from '../modules/championship/championship.service.js';
import { canManagePresence, isConfirmed, toggleConfirmation, drawTeams, clearTeamDraw, moveDrawnPlayer, adminRemovePlayerFromGame } from '../modules/game/game.service.js';
import { hasCapacity } from '../modules/game/game.service.js';
import { canConfirm } from '../modules/finance/finance.service.js';
import { canAccessConfig, canManageCarne, canManageChampionship, canManageFinance, canManagePlayers, canManagePresence as canManagePresenceAuthz, exposeAuthz, getPlayerRole, isAdmin as authzIsAdmin, isCarneOnly as authzIsCarneOnly } from '../domain/authz.js';

const appElement = document.getElementById('app');

const REMOTE_SYNC_INTERVAL_MS = 4000;
let isApplyingRemoteState = false;
let lastDomainFingerprint = '';

init();

async function init() {
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

function startRemoteSync() {
  window.setInterval(async () => {
    try {
      // Never poll Supabase REST while the user is not operationally authenticated.
      // With RLS closed, polling on the login screen correctly produces 401.
      if (!getCurrentPlayer()) {
        return;
      }

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

    <nav class="nav" aria-label="Navegação principal">
      ${renderNavButton('home', 'Home', activeTab)}
      ${renderNavButton('weekly_game', 'Jogo da semana', activeTab)}
      ${renderNavButton('players', 'Jogadores', activeTab)}
      ${renderNavButton('carne', 'Carne', activeTab)}
      ${renderNavButton('championship', 'Campeonato', activeTab)}
      ${canAccessConfig(currentPlayer) ? renderNavButton('config', 'Config', activeTab) : ''}
    </nav>

    <main class="content">
      <div style="padding:10px;font-weight:bold;">
${confirmedCount} / ${maxPlayers} jogadores confirmados
</div>
${renderTab(snapshot, activeTab, currentPlayer)}
    </main>
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
  const fillPercent = maxPlayers ? Math.min(100, Math.round((confirmedCount / maxPlayers) * 100)) : 0;
  const mensalidade = buildMensalidadeMeta(game, activePlayer);
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
  const storedNotifications = Array.isArray(workingSnapshot.notifications) ? workingSnapshot.notifications : [];
  const playersByIdForCarneNotification = new Map(workingSnapshot.players.map((player) => [String(player.id), player]));
  const nextCarneEntry = carneScheduleEntries
    .filter((entry) => entry?.active !== false && entry?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  const carneNotification = nextCarneEntry
    ? {
        type: 'carne',
        date: formatDate(nextCarneEntry.date),
        player1: playersByIdForCarneNotification.get(String(nextCarneEntry.player1_id))?.name || '-',
        player2: playersByIdForCarneNotification.get(String(nextCarneEntry.player2_id))?.name || '-',
        message: `Dupla da carne (${formatDate(nextCarneEntry.date)}): ${playersByIdForCarneNotification.get(String(nextCarneEntry.player1_id))?.name || '-'}, ${playersByIdForCarneNotification.get(String(nextCarneEntry.player2_id))?.name || '-'}`,
      }
    : null;
  const notifications = carneNotification
    ? [carneNotification, ...storedNotifications]
    : storedNotifications;

  return `
    <section class="section-stack home-stack">
      <section class="card home-user-card">
        <div class="home-user-main">
          ${renderAvatarForApp(activePlayer)}
          <div class="home-user-text">
            <div class="home-user-name">${activePlayer.name}</div>
            <div class="home-user-meta">${authzIsAdmin(activePlayer) ? `Administrador · ${getPositionLabel(activePlayer.position)}` : getPlayerRole(activePlayer) === 'carne' ? 'Somente carne' : getPositionLabel(activePlayer.position)}</div>
          </div>
          <button class="btn btn-secondary btn-compact" type="button" data-action="toggle-self-profile-edit">${selfProfileEditOpen ? 'Fechar' : 'Editar'}</button>
        </div>
        <div class="home-user-status">
          <span class="tag ${mensalidade.className}">Mensalidade: ${mensalidade.title}</span>
          <span class="tag is-neutral">${carneStatus ? 'Carne ativo' : 'Sem carne'}</span>
        </div>
        <div class="home-user-note">${mensalidade.subline}</div>
      </section>

      ${renderSelfProfileEditCardForHome(activePlayer)}

      <section class="hero-card next-game-card">
        <div class="hero-label">Próximo jogo</div>
        <div class="hero-date">${formatDate(game?.game_date)}</div>
        <div class="hero-meta">${game?.game_time || '--:--'} · ${game?.open ? 'Inscrições abertas' : 'Inscrições fechadas'}</div>
        <div class="hero-progress">
          <div class="progress-track">
            <div class="progress-bar" style="width:${fillPercent}%"></div>
          </div>
          <div class="progress-text">Confirmados: ${confirmedCount} / ${maxPlayers}</div>
        </div>
        <div class="hero-presence-panel">
          <div>
            <div class="hero-presence-label">Sua presença</div>
            <div class="hero-presence-status">${presenceFeedback.icon} ${confirmed ? 'Confirmada' : 'Não confirmada'}</div>
            ${statusNote && statusNote !== presenceFeedback.text ? `<div class="hero-presence-note">${statusNote}</div>` : ''}
          </div>
          ${canRenderPresenceAction ? `
            <button class="btn ${confirmed ? 'btn-secondary' : 'btn-primary'}" type="button" id="confirm-btn">${confirmed ? 'Cancelar' : 'Confirmar'}</button>
          ` : ''}
        </div>
      </section>

      <section class="card notifications-card">
        <div class="card-title compact-title">Notificações</div>
        <div class="notification-list">
          ${notifications.length ? notifications.slice(0, 5).map((notification) => notification.type === 'carne' ? `
            <div class="notification-item notification-item-carne">
              <span class="notification-icon-carne" aria-hidden="true">
                <svg viewBox="0 0 64 64" focusable="false">
                  <line x1="10" y1="54" x2="54" y2="10" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
                  <ellipse cx="25" cy="39" rx="9" ry="13" transform="rotate(45 25 39)" fill="#f97316"/>
                  <ellipse cx="39" cy="25" rx="9" ry="13" transform="rotate(45 39 25)" fill="#fb923c"/>
                  <path d="M20 36c3 1 7 5 8 8" stroke="#7c2d12" stroke-width="3" stroke-linecap="round" fill="none"/>
                  <path d="M34 22c3 1 7 5 8 8" stroke="#7c2d12" stroke-width="3" stroke-linecap="round" fill="none"/>
                </svg>
              </span>
              <span class="notification-content-carne">
                <strong>Dupla da carne (${notification.date}):</strong>
                <span>${notification.player1}, ${notification.player2}</span>
              </span>
            </div>
          ` : `
            <div class="notification-item">• ${notification.message}</div>
          `).join('') : '<div class="notification-item is-empty">Nenhuma notificação recente.</div>'}
        </div>
      </section>
    </section>
  `;
}
function renderWeeklyGame(snapshot, currentPlayer) {
  const view = buildGameView(snapshot, currentPlayer?.id || null);
  const confirmed = isConfirmed(currentPlayer?.id);
  const capacity = snapshot.game?.max_players || 8;
  const remaining = Math.max(capacity - view.confirmedCount, 0);
  const canAct = currentPlayer && currentPlayer.plays_football !== false;

  return `
    <section class="section-stack weekly-game-screen">
      <section class="weekly-summary-grid">
        <div class="weekly-game-card">
          <div class="hero-label">Próximo jogo</div>
          <div class="hero-date">${formatDate(snapshot.game?.game_date)}</div>
          <div class="hero-meta">${snapshot.game?.game_time || '--:--'} · ${snapshot.game?.open ? 'Inscrições abertas' : 'Inscrições fechadas'}</div>
          <div class="weekly-progress"><div style="width:${Math.min((view.confirmedCount / capacity) * 100, 100)}%"></div></div>
          <div class="weekly-game-stats">
            <strong>${view.confirmedCount} / ${capacity}</strong> confirmados
            <span>${remaining} vagas restantes</span>
          </div>
        </div>

        <div class="weekly-self-card">
          <div class="card-title">Minha presença</div>
          <button
            class="switch-control weekly-self-switch ${confirmed ? 'is-on' : 'is-off'}"
            type="button"
            id="confirm-btn"
            ${canAct ? '' : 'disabled'}
            aria-pressed="${confirmed ? 'true' : 'false'}"
          >
            <span class="switch-track"><span class="switch-thumb"></span></span>
            <span class="switch-label ${confirmed ? 'is-ok' : 'is-neutral'}">${confirmed ? 'Dentro do jogo' : 'Fora do jogo'}</span>
          </button>
          <p class="footer-note">${confirmed ? 'Você está confirmado para o próximo jogo.' : 'Ative o switch para confirmar sua presença.'}</p>
        </div>
      </section>

      ${renderPresenceList(snapshot, currentPlayer)}

      ${renderTeamDraw(snapshot, currentPlayer)}
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
  const adminMode = canManagePresenceAuthz(currentPlayer);
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

  return `
    <section class="weekly-presence-card">
      <div class="card-title weekly-presence-main-title">Lista de presença</div>

      <div class="weekly-presence-section">
        <div class="weekly-presence-title">Confirmados (${confirmedPlayers.length})</div>
        <div class="weekly-presence-stack">
          ${confirmedPlayers.length
            ? confirmedPlayers.map((player) => renderWeeklyRow(player, true)).join('')
            : '<div class="empty-inline">Nenhum jogador confirmado ainda.</div>'}
        </div>
      </div>

      <div class="weekly-presence-section">
        <div class="weekly-presence-title">Não confirmados (${pendingPlayers.length})</div>
        <div class="weekly-presence-stack">
          ${pendingPlayers.length
            ? pendingPlayers.map((player) => renderWeeklyRow(player, false)).join('')
            : '<div class="empty-inline">Todos os jogadores confirmaram.</div>'}
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
        ${canManagePresenceAuthz(currentPlayer) ? `
          <div class="actions" style="margin-top:12px;">
            <button class="btn btn-primary" type="button" id="draw-teams-btn">Sortear times</button>
          </div>
        ` : '<p class="footer-note">Aguardando sorteio do administrador.</p>'}
      </section>
    `;
  }

  const isAdmin = authzIsAdmin(currentPlayer);

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
  if (authzIsCarneOnly(currentPlayer)) {
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
      subline: game?.mens_expire_date
        ? `Vencimento ${formatDate(game.mens_expire_date)}. Pagamento pendente, você não poderá confirmar presença.`
        : 'Pagamento pendente, você não poderá confirmar presença.',
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
