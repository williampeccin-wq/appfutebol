import { assertRuntimeEnvironmentAllowed } from '../domain/environment.guard.js';
import { auditPresenceProjection } from '../domain/presence.audit.js';
import { getChurrascoDuo as calcChurrascoDuo, carneDiffDays as _carneDiffDays } from '../domain/carne.js';
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
// Sorteio escolhido no seletor de "lançar resultado". null = o mais recente.
// Precisa ser estado (não só o valor do <select>): a data e as escalações
// exibidas dependem dele, e o app re-renderiza por innerHTML a cada poll.
// Foto escolhida e ainda não salva. Mora aqui, e não no dataset do <input>,
// porque o re-render recria o input e levava o dataset junto — o Salvar então
// não achava foto nenhuma e gravava o cadastro sem ela, dizendo "sucesso".
let selfPhotoPending = '';
let championshipDrawId = null;
// Escalação AJUSTADA pelo admin ({ playerId: 'a'|'b'|'out' }). Estado, e não só
// o valor dos <select>, porque o app re-renderiza por innerHTML a cada poll —
// sem isto o ajuste sumia no meio da edição.
let championshipLineup = null;
// O card "Lançar resultado" é um <details>: o re-render o fechava a cada ajuste,
// obrigando o admin a reabrir e rolar até ele por jogador.
let championshipResultCardOpen = false;
let selfProfileOpen = false;      // painel de perfil aberto (modo visualização)
let selfProfileEditOpen = false;  // dentro do painel, formulário de edição aberto
let selfDeleteOpen = false;       // dentro do painel, zona de exclusão de conta aberta
// Índice da dupla em edição inline no rodízio (-1 = nenhuma). É o único estado
// transitório da edição do rodízio — todo o resto é auto-salvo no estado.
let editingCarnePairIndex = -1;
let financeMonth = null; // 'YYYY-MM' selecionado na aba Financeiro; null = mês atual
function financeCurrentYm() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function financeEffectiveYm() { return financeMonth || financeCurrentYm(); }
function financeAddYm(ym, delta) {
  const [y, m] = String(ym).split('-').map(Number);
  const d = new Date(y, (m - 1) + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}


let uiActionInFlight = false;

function isoToDisplay(iso) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function displayToIso(display) {
  if (!display) return '';
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const day = parseInt(m[1], 10), month = parseInt(m[2], 10), year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

document.addEventListener('input', (e) => {
  if (!e.target.matches('[data-date-mask]')) return;
  const raw = e.target.value.replace(/\D/g, '').slice(0, 8);
  let v = raw;
  if (raw.length > 4) v = raw.slice(0, 2) + '/' + raw.slice(2, 4) + '/' + raw.slice(4);
  else if (raw.length > 2) v = raw.slice(0, 2) + '/' + raw.slice(2);
  e.target.value = v;
});

// Quantos ciclos de sync seguidos foram pulados por causa de uiActionInFlight.
// Teto de segurança para a flag não conseguir travar a sincronização para
// sempre caso vaze ligada. 5 ciclos x 6s = ~30s, bem acima de qualquer upload
// de foto ou tempo de leitura de um modal.
let syncSkipStreak = 0;
const SYNC_SKIP_MAX = 5;

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

function showInfoModal({ title = 'Detalhes', html = '' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal-overlay';
    overlay.innerHTML = `
      <div class="confirm-modal" role="dialog" aria-modal="true">
        <div class="confirm-modal-title">${title}</div>
        <div class="confirm-modal-message">${html}</div>
        <div class="confirm-modal-actions">
          <button type="button" class="btn btn-primary" data-confirm-modal="close">Fechar</button>
        </div>
      </div>`;
    const cleanup = () => { document.removeEventListener('keydown', onKey); overlay.remove(); resolve(); };
    const onKey = (event) => { if (event.key === 'Escape') cleanup(); };
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-confirm-modal]')) cleanup();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
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
  const gkPaysReset = document.getElementById("new-gk-pays");
  if (gkPaysReset) gkPaysReset.checked = false;
  syncGkPaysVisibility();
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
  document.querySelectorAll('input[type="tel"]:not([data-date-mask])').forEach((input) => {
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


// Bucket de fotos é PRIVADO: `photo_url` guarda só o PATH; a exibição usa URL
// ASSINADA temporária, buscada em lote por ensureSignedPhotos() e servida daqui.
// Fallback enquanto não assina (ou se falhar): base64 local ou a inicial.
const signedPhotoUrls = new Map();
let signedPhotoUrlsAt = 0;
let signingPhotosInFlight = false;

function getPlayerPhoto(player) {
  const signed = signedPhotoUrls.get(String(player?.id));
  if (signed) return signed;
  const url = String(player?.photo_url || '');
  if (/^https?:/i.test(url)) return url;            // URL completa antiga
  if (url) {                                         // path nu (upload novo) → URL pública
    const base = String((window.HARMONIA_SUPABASE || {}).url || '').replace(/\/+$/, '');
    if (base) return `${base}/storage/v1/object/public/player-photos/${url}`;
  }
  return player?.photoDataUrl || '';
}

function ensureSignedPhotos(_snapshot) {
  // DESLIGADO: o bucket é público e getPlayerPhoto usa a URL pública direta
  // (nunca expira, funciona em qualquer versão de cliente). A assinatura ficava
  // frágil (expira em 1h + dependia de código fresco, que o SW às vezes cacheia
  // velho). Mantido como no-op p/ facilitar reativar quando o bucket for privado
  // de novo, num desenho que trate o cache do SW.
}

// Após novo upload de foto: descarta a URL assinada antiga do jogador e zera o
// cooldown, forçando re-assinar o path novo no próximo render — senão o avatar
// continuaria mostrando a foto velha (cache por jogador).
function invalidateSignedPhoto(id) {
  signedPhotoUrls.delete(String(id));
  signedPhotoUrlsAt = 0;
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

  // Convidado: sem foto, com selo "conv" abaixo da inicial para não se confundir
  // com jogador confirmado no carrossel da Home.
  if (player?.guest === true) {
    return `<div class="avatar avatar-guest ${extraClass}" title="Convidado"><span class="avatar-guest-initial">${initials}</span><span class="avatar-guest-tag">conv</span></div>`;
  }

  if (photo) {
    return `<div class="avatar avatar-photo ${extraClass}${aura}"><img src="${escapeHtml(photo)}" alt="Foto de ${escapeHtml(player?.name || 'jogador')}" loading="lazy" /></div>`;
  }

  return `<div class="avatar ${extraClass}${aura}">${initials}</div>`;
}


function getActiveRentalGoalkeepersForApp(snapshot) {
  const game = getActiveGameFromSnapshot(snapshot);
  return Array.isArray(game?.rental_goalkeepers) ? game.rental_goalkeepers : [];
}

function getActiveGuestPlayersForApp(snapshot) {
  const game = getActiveGameFromSnapshot(snapshot);
  return Array.isArray(game?.guest_players) ? game.guest_players : [];
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
  const goalkeepers = players.filter(isGoalkeeperPlayer);
  const linePlayers = players.filter((player) => !isGoalkeeperPlayer(player));
  const rentalGoalkeepers = getActiveRentalGoalkeepersForApp(snapshot);

  const lines = [
    '⚽ Presença Convocados',
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

  lines.push('', '— via Convocados · convocados.app.br');
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
  birthDateInput.value = isoToDisplay(playerToEdit.birthDate || "");
  roleInput.value = playerToEdit.plays_football === false ? "carne" : "player";
  roleInput.dispatchEvent(new Event("change", { bubbles: true }));
  positionInput.value = playerToEdit.position || "meia";
  adminInput.checked = !!playerToEdit.is_admin;
  mensInput.checked = !!playerToEdit.mens_ok;
  const gkPaysInput = document.getElementById("new-gk-pays");
  if (gkPaysInput) gkPaysInput.checked = !!playerToEdit.gk_pays;
  syncGkPaysVisibility();

  // PREVIEW pode ser qualquer URL de exibição (assinada/pública/base64); mas o
  // dataset.photoDataUrl é o gatilho de UPLOAD e só pode conter um data: URL
  // (foto nova). Nunca prefill com a URL assinada — senão o "Salvar" tenta subir
  // a URL e falha, e a re-hidratação apagava o base64 recém-selecionado.
  const previewPhoto = getPlayerPhoto(playerToEdit);
  const uploadablePhoto = String(playerToEdit.photoDataUrl || "").startsWith("data:") ? playerToEdit.photoDataUrl : "";
  if (photoInput) {
    photoInput.value = "";
    photoInput.dataset.photoDataUrl = uploadablePhoto;
  }
  setPlayerPhotoPreview(previewPhoto || "", playerToEdit.name || "");
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
          // photo_url tem prioridade sobre photoDataUrl no getPlayerPhoto: sem
          // zerar a URL antiga, a foto recém-escolhida ficava guardada mas
          // INVISÍVEL — a tela seguia mostrando a anterior. É o upload bem
          // sucedido que repõe photo_url; se ele falhar, o base64 é o fallback.
          return {
            ...player,
            photoDataUrl: dataUrl,
            photo_url: '',
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
      selfPhotoPending = dataUrl;   // sobrevive ao re-render; o dataset não

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
          photo_url: '',   // ver comentário no fluxo do admin acima
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
            <input id="self-birthdate" class="input" type="tel" inputmode="numeric" placeholder="DD/MM/AAAA" maxlength="10" data-date-mask value="${escapeHtml(isoToDisplay(activePlayer.birthDate || ''))}" />
          </label>

          <label class="player-photo-upload self-photo-upload">
            <span class="player-photo-preview ${getPlayerPhoto(activePlayer) ? 'has-photo' : ''}" id="self-photo-preview">
              ${getPlayerPhoto(activePlayer) ? `<img src="${escapeHtml(getPlayerPhoto(activePlayer))}" alt="Foto de ${escapeHtml(activePlayer.name || 'jogador')}" />` : 'Foto'}
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
            Você pode alterar nome, telefone, nascimento e posição. Mensalidade, perfil, grupo do churrasco e permissão de admin continuam restritos ao administrador.
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
function carneDiffDays(aIso, bIso) { return _carneDiffDays(aIso, bIso); }

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
  // Só aceita id PRIMITIVO (string/number). Um objeto passaria no filtro truthy e
  // viraria "[object Object]" via String() — mesma classe do bug do resultado.
  const asId = (v) => (typeof v === 'string' || typeof v === 'number') ? String(v) : null;
  const pairs = (Array.isArray(rotation.pairs) ? rotation.pairs : [])
    .map((p) => ({ player1_id: asId(p?.player1_id), player2_id: asId(p?.player2_id) }))
    .filter((p) => p.player1_id && p.player2_id);
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

// Visão "próximas semanas" do rodízio, recalculada do estado a cada render
// (topo = próxima quarta). Não há mais rascunho: cada edição é auto-salva.
function carneEditingView() {
  return buildCarneUpcoming(getCarneRotation(getState()));
}
// Auto-save: persiste a visão editada no estado canônico via replaceState (mesmo
// caminho do mark-paid) — assim a home reflete e o poll não reverte. NUNCA usar
// só render()/savePersistedState aqui, senão o estado canônico fica defasado e a
// próxima ação sobrescreve o remoto de volta (foi o bug do "salvei e não pegou").
function commitCarneRotation(view) {
  const next = structuredClone(getState());
  persistCarneRotation(next, view);
  replaceState(repairManualSnapshot(next));
}
// Mantido para o logout: agora só zera o índice de edição inline.
function resetCarneRotationDraft() { editingCarnePairIndex = -1; }

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

// Move a dupla de uma posição para outra e auto-salva (usado pelo drag-and-drop).
function carneReorderDraftPairs(from, to) {
  const view = carneEditingView();
  const pairs = view.pairs;
  if (from < 0 || from >= pairs.length || to < 0 || to >= pairs.length || from === to) return;
  const [moved] = pairs.splice(from, 1);
  pairs.splice(to, 0, moved);
  commitCarneRotation(view);
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
  if (title) title.textContent = 'Cadastrar dupla do churrasco';
  if (cancelButton) cancelButton.style.display = 'none';
  if (saveButton) saveButton.textContent = 'Salvar dupla';
}

// Atribuição de uniforme a um time do sorteio (select). Grava em
// game.sort_result.uniforms[idx]; a imagem da escalação lê dali.
document.addEventListener("change", (e) => {
  const sel = e.target.closest('[data-action="set-team-uniform"]');
  if (!sel) return;
  if (!requireAdmin(getState(), 'Apenas administrador pode definir o uniforme')) return;
  const idx = Number(sel.dataset.team);
  if (!Number.isInteger(idx)) return;
  const val = sel.value || null;
  const next = structuredClone(getState());
  const game = next.game;
  if (!game || !game.sort_result) return;
  const uniforms = Array.isArray(game.sort_result.uniforms) ? game.sort_result.uniforms.slice() : [];
  uniforms[idx] = val;
  game.sort_result.uniforms = uniforms;
  const key = String(game.game_key || game.id || '');
  next.games = (next.games || []).map((g) => String(g.game_key || g.id || '') === key ? game : g);
  replaceState(repairManualSnapshot(next));
});

document.addEventListener("click", async (e) => {
  const trigger = e.target.closest("[data-action]");
  if (!trigger) return;

  const action = trigger.dataset.action;
  if (!action) return;
  if (uiActionInFlight && action !== "cancel-edit") return;
  const id = trigger.dataset.id || "";

  if (action === "pro-upsell") {
    e.preventDefault();
    showProUpsellModal();
    return;
  }

  if (action === "finance-submit") {
    e.preventDefault();
    const kind = (document.getElementById('fin-kind')?.value) === 'receita' ? 'receita' : 'despesa';
    const category = document.getElementById('fin-category')?.value || 'outro';
    const amount = Number((document.getElementById('fin-amount')?.value || '').replace(/\./g, '').replace(',', '.'));
    const date = displayToIso(document.getElementById('fin-date')?.value || '');
    const description = (document.getElementById('fin-desc')?.value || '').trim();
    if (!(amount > 0)) { showToast('Informe um valor maior que zero.', 'error'); return; }
    if (!date) { showToast('Informe a data.', 'error'); return; }
    const clubId = getCurrentClubId();
    if (!clubId) { showToast('Não consegui identificar o clube. Recarregue e tente de novo.', 'error'); return; }
    let createdBy = null;
    try { createdBy = JSON.parse(localStorage.getItem('harmonia_auth_session') || 'null')?.user?.id || null; } catch (_) { /* ok */ }
    trigger.disabled = true;
    addLedgerEntry({ kind, category, amount, date, description, clubId, createdBy })
      .then((res) => {
        trigger.disabled = false;
        if (res.ok) { showToast('Lançamento adicionado. 💸', 'success'); render(getState()); }
        else { showToast('Não deu pra salvar o lançamento. Tente de novo.', 'error'); }
      })
      .catch(() => { trigger.disabled = false; showToast('Falha ao salvar o lançamento.', 'error'); });
    return;
  }

  if (action === "remove-uniform") {
    e.preventDefault();
    if (!requireAdmin(getState(), 'Apenas administrador pode mexer nos uniformes')) return;
    const uid = trigger.dataset.id;
    if (!uid) return;
    const next = structuredClone(getState());
    const uniforms = ((next.settings && next.settings.uniforms) || []).filter((u) => String(u.id) !== String(uid));
    next.settings = { ...(next.settings || {}), uniforms };
    replaceState(repairManualSnapshot(next));
    showToast('Uniforme removido.', 'success');
    render(getState());
    return;
  }

  if (action === "finance-delete-entry") {
    e.preventDefault();
    const entryId = trigger.dataset.id;
    if (!entryId) return;
    showConfirmModal({ title: 'Excluir lançamento', message: 'Remover este lançamento do caixa? Não dá pra desfazer.', confirmText: 'Excluir', cancelText: 'Cancelar' })
      .then((ok) => {
        if (!ok) return null;
        return deleteLedgerEntry(entryId).then((res) => {
          if (res.ok) { showToast('Lançamento removido.', 'success'); render(getState()); }
          else { showToast('Não deu pra remover o lançamento. Tente de novo.', 'error'); }
        });
      })
      .catch(() => {});
    return;
  }

  if (action === "finance-charge") {
    e.preventDefault();
    const pid = trigger.dataset.id;
    const name = trigger.dataset.name || '';
    if (!pid) return;
    const amount = Number(getState().settings?.mens_amount) || 0;
    trigger.disabled = true;
    chargeMember(pid, name, amount)
      .then((res) => {
        trigger.disabled = false;
        const primeiro = String(name).trim().split(/\s+/)[0] || '';
        if (res.ok) showToast(`Cobrança enviada${primeiro ? ' pra ' + primeiro : ''}. 📤`, 'success');
        else showToast('Não deu pra enviar a cobrança. Tente de novo.', 'error');
      })
      .catch(() => { trigger.disabled = false; showToast('Falha ao enviar a cobrança.', 'error'); });
    return;
  }

  if (action === "finance-month-prev") {
    e.preventDefault();
    financeMonth = financeAddYm(financeEffectiveYm(), -1);
    render(getState());
    return;
  }
  if (action === "finance-month-next") {
    e.preventDefault();
    const next = financeAddYm(financeEffectiveYm(), 1);
    if (next <= financeCurrentYm()) { financeMonth = (next === financeCurrentYm()) ? null : next; render(getState()); }
    return;
  }

  if (action === "finance-publish") {
    e.preventDefault();
    const clubId = getCurrentClubId();
    if (!clubId) { showToast('Não identifiquei o clube. Recarregue e tente de novo.', 'error'); return; }
    const pubYm = financeEffectiveYm();
    const allRows = getCachedLedger();
    const s = ledgerSummary(allRows, pubYm);
    // Os lançamentos do mês vão junto do resumo: prestação de contas item a item,
    // não só os totais. Levamos só campos de exibição — o NOME do jogador é
    // resolvido no cliente do membro (payload menor e nome sempre atual).
    const pubEntries = allRows
      .filter((r) => String(r.date || '').slice(0, 7) === pubYm)
      .slice(0, 60)
      .map((r) => ({ id: r.id, kind: r.kind, category: r.category, amount: r.amount, date: r.date, description: r.description, player_id: r.player_id, source: r.source }));
    trigger.disabled = true;
    publishSummary(clubId, { saldo: s.saldo, entMes: s.entMes, saiMes: s.saiMes, ym: pubYm, entries: pubEntries, publishedAt: new Date().toISOString() })
      .then((res) => {
        trigger.disabled = false;
        if (res.ok) { showToast('Resumo publicado pro grupo. 📢', 'success'); render(getState()); }
        else showToast('Não deu pra publicar. Tente de novo.', 'error');
      })
      .catch(() => { trigger.disabled = false; showToast('Falha ao publicar o resumo.', 'error'); });
    return;
  }

  // Copiar o código de convite do clube (área admin). Independe do estado.
  if (action === "copy-invite-code") {
    e.preventDefault();
    const code = trigger.dataset.code || "";
    if (!code) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const ta = document.createElement('textarea');
        ta.value = code; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      showToast(`Código ${code} copiado. Compartilhe com o pessoal.`);
    } catch (_error) {
      showToast(`Não foi possível copiar. Código: ${code}`, 'error');
    }
    return;
  }

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

  if (action === "delete-game") {
    e.preventDefault();
    e.stopPropagation();
    if (!requireAdmin(snapshot, 'Apenas administrador pode excluir jogos')) return;
    const allGames = getCurrentGames(snapshot);
    const target = allGames.find((game) => String(getGameKey(game)) === String(id));
    if (!target) { showToast("Jogo não encontrado.", "error"); return; }
    // O estado assume sempre um jogo ativo (singleton game_state); excluir o
    // único jogo não persistiria (o save aborta com game=null e o jogo "volta"
    // no reload). Bloqueia com aviso em vez de deixar o comportamento confuso.
    if (allGames.length <= 1) {
      showToast('Não dá para excluir o único jogo. Crie ou ative outro antes.', 'error');
      return;
    }
    const label = `${formatDate(target.game_date)}${target.game_time ? ' · ' + target.game_time : ''}`;
    const confirmed = await showConfirmModal({
      title: 'Excluir jogo',
      message: `Excluir o jogo de <strong>${label}</strong>? As confirmações de presença e o sorteio deste jogo também serão apagados. Não dá para desfazer.`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
    });
    if (!confirmed) return;
    const remainingGames = allGames.filter((game) => String(getGameKey(game)) !== String(id));
    const remainingConfirmations = (snapshot.confirmations || []).filter((entry) => String(entry?.game_key || '') !== String(id));
    const wasActive = String(getGameKey(getActiveGameFromSnapshot(snapshot))) === String(id);
    const nextActiveGame = wasActive ? remainingGames[remainingGames.length - 1] : getActiveGameFromSnapshot(snapshot);
    // replaceState(repairManualSnapshot) — caminho canônico: persiste de verdade
    // e reconcilia a fila de espera do novo jogo ativo (promove se abriu vaga).
    const next = {
      ...snapshot,
      games: remainingGames,
      confirmations: remainingConfirmations,
      active_game_id: nextActiveGame ? getGameKey(nextActiveGame) : null,
      game: nextActiveGame || null,
    };
    replaceState(repairManualSnapshot(next));
    showToast('Jogo excluído.');
    // Remove os votos daquele jogo no servidor (senão continuam contando na
    // média/sorteio) e atualiza o cache de notas. Best-effort.
    if (isVotingEnabled()) {
      deleteGameRatings(id).then((r) => { if (r.ok) loadRatingsCache(true).then(() => render(getState())); }).catch(() => {});
    }
    return;
  }

  if (action === "open-profile") {
    const currentPlayer = getCurrentSnapshotPlayer(snapshot);
    if (!currentPlayer) { showToast("Sessão inválida. Faça login novamente.", "error"); return; }
    selfProfileOpen = true;
    selfProfileEditOpen = false;
    selfPhotoPending = '';
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
    selfPhotoPending = '';
    selfDeleteOpen = false;
    render(snapshot);
    return;
  }

  if (action === "toggle-self-delete") {
    selfProfileOpen = true;
    selfDeleteOpen = !selfDeleteOpen;
    render(snapshot);
    if (selfDeleteOpen) {
      setTimeout(() => {
        document.getElementById("self-delete-zone")?.scrollIntoView({ behavior: "smooth", block: "center" });
        document.getElementById("self-delete-password")?.focus();
      }, 60);
    }
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

  if (action === "register-passkey") {
    if (!isPasskeyEnabled()) return;
    showToast('Siga as instruções do aparelho para criar a passkey…', 'info');
    const res = await registerPasskeyForCurrentUser();
    showToast(res.ok ? 'Passkey ativada! Na próxima vez, é só tocar no campo de telefone e escolher a passkey.' : res.message, res.ok ? 'success' : 'error');
    return;
  }

  if (action === "save-carne-schedule") {
    const current = snapshot.players.find((p) => p.id === snapshot.session?.playerId);
    if (!authzIsAdmin(current)) {
      showToast("Apenas administrador pode alterar a tabela do churrasco", "error");
      return;
    }

    const scheduleId = document.getElementById('carne-schedule-id')?.value?.trim();
    const date = displayToIso(document.getElementById('carne-schedule-date')?.value?.trim() || '');
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
      showToast("Apenas administrador pode editar a tabela do churrasco", "error");
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
    dateInput.value = isoToDisplay(entry.date);
    player1Input.value = entry.player1_id;
    player2Input.value = entry.player2_id;
    if (title) title.textContent = 'Editando dupla do churrasco';
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
      showToast("Apenas administrador pode excluir dupla do churrasco", "error");
      return;
    }

    const schedule = getCarneScheduleEntriesForApp(snapshot);
    const entry = schedule.find((item) => String(item.id) === String(id));
    if (!entry) return;

    const confirmedDelete = await showConfirmModal({
      title: 'Excluir dupla do churrasco',
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
    if (!requireAdmin(snapshot, 'Apenas administrador pode editar o rodízio do churrasco')) return;
    const p1 = document.getElementById('carne-rotation-player-1')?.value?.trim();
    const p2 = document.getElementById('carne-rotation-player-2')?.value?.trim();
    if (!p1 || !p2) { showToast('Selecione as duas pessoas da dupla.', 'error'); return; }
    if (p1 === p2) { showToast('A dupla precisa ser de duas pessoas diferentes.', 'error'); return; }
    const view = carneEditingView();
    const dupId = carnePlayerUsedElsewhere(view, p1) ? p1 : (carnePlayerUsedElsewhere(view, p2) ? p2 : null);
    if (dupId) {
      const nm = snapshot.players.find((pl) => String(pl.id) === String(dupId))?.name || 'Esse jogador';
      showToast(`${nm} já está em outra dupla do rodízio.`, 'error');
      return;
    }
    if (!view.start_date) view.start_date = carneTodayIso();
    view.pairs.push({ player1_id: p1, player2_id: p2 });
    commitCarneRotation(view);
    return;
  }

  if (action === "carne-rotation-remove-pair") {
    if (!requireAdmin(snapshot, 'Apenas administrador pode editar o rodízio do churrasco')) return;
    const idx = Number(id);
    const view = carneEditingView();
    if (!(idx >= 0 && idx < view.pairs.length)) return;
    view.pairs.splice(idx, 1);
    editingCarnePairIndex = -1;
    commitCarneRotation(view);
    return;
  }

  if (action === "carne-pair-edit") {
    if (!requireAdmin(snapshot, 'Apenas administrador pode editar o rodízio do churrasco')) return;
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
    if (!requireAdmin(snapshot, 'Apenas administrador pode editar o rodízio do churrasco')) return;
    const idx = Number(id);
    const view = carneEditingView();
    if (!(idx >= 0 && idx < view.pairs.length)) return;
    const p1 = document.getElementById('carne-pair-edit-1')?.value?.trim();
    const p2 = document.getElementById('carne-pair-edit-2')?.value?.trim();
    if (!p1 || !p2) { showToast('Selecione as duas pessoas da dupla.', 'error'); return; }
    if (p1 === p2) { showToast('A dupla precisa ser de duas pessoas diferentes.', 'error'); return; }
    const dupId = carnePlayerUsedElsewhere(view, p1, idx) ? p1 : (carnePlayerUsedElsewhere(view, p2, idx) ? p2 : null);
    if (dupId) {
      const nm = snapshot.players.find((pl) => String(pl.id) === String(dupId))?.name || 'Esse jogador';
      showToast(`${nm} já está em outra dupla do rodízio.`, 'error');
      return;
    }
    view.pairs[idx] = { player1_id: p1, player2_id: p2 };
    editingCarnePairIndex = -1;
    commitCarneRotation(view);
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

    const date = displayToIso(document.getElementById('championship-result-date')?.value?.trim() || '');
    if (!date) {
      showToast("Informe a data do jogo", "error");
      return;
    }

    const outcome = document.getElementById('championship-team-outcome')?.value;
    const drawId = document.getElementById('championship-draw-id')?.value || null;
    const lineupMap = (championshipLineup && String(championshipLineup.drawId) === String(drawId))
      ? championshipLineup.map
      : null;
    const builtResult = buildTeamResultStatuses(snapshot, outcome, drawId, lineupMap);

    if (!builtResult.ok) {
      showToast(builtResult.message || "Resultado inválido", "error");
      return;
    }

    // A data é digitável e o sorteio é escolhido à parte: dá para lançar o
    // sorteio de um dia sob a data de outro. Avisa antes em vez de deixar passar.
    if (builtResult.game_date && builtResult.game_date !== date) {
      const seguir = await showConfirmModal({
        title: 'Data diferente do sorteio',
        message: `O sorteio escolhido é do dia ${formatDate(builtResult.game_date)}, mas você digitou ${formatDate(date)}. Lançar assim?`,
        confirmText: 'Lançar mesmo assim',
        cancelText: 'Rever',
      });
      if (!seguir) return;
    }

    // Gravar substitui qualquer resultado da MESMA rodada. Isso já acontecia,
    // mas em silêncio: um lançamento apagava outro e ninguém ficava sabendo.
    const substituido = findReplacedChampionshipResult(snapshot, { date, game_key: builtResult.game_key });
    if (substituido) {
      const seguir = await showConfirmModal({
        title: 'Já existe resultado nesta rodada',
        message: `O resultado de ${formatDate(substituido.date)} já foi lançado e será SUBSTITUÍDO por este. A classificação vai ser recalculada.`,
        confirmText: 'Substituir',
        cancelText: 'Cancelar',
      });
      if (!seguir) return;
    }

    uiActionInFlight = true;
    setActionBusy(trigger, 'Salvando...');

    // RELÊ o estado. O `snapshot` foi capturado antes dos modais acima, e
    // enquanto o admin lia a pergunta o poll pode ter trocado o estado por
    // baixo. Gravar o snapshot velho aqui carimba dado obsoleto por cima.
    const snapshotFresco = getState();
    snapshotFresco.session = snapshot.session;   // sessão é local, não vem do poll

    persistChampionshipResult(snapshotFresco, {
      id: globalThis.crypto?.randomUUID ? `championship_result_${globalThis.crypto.randomUUID()}` : `championship_result_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      date,
      outcome: builtResult.outcome,
      draw_id: builtResult.draw_id,
      game_key: builtResult.game_key,
      team_a: builtResult.team_a,
      team_b: builtResult.team_b,
      statuses: builtResult.statuses,
      lineup_adjusted: builtResult.lineup_adjusted,
    });

    // Solta a seleção: lançado um resultado, o formulário volta ao sorteio mais
    // recente em vez de ficar preso no que acabou de ser lançado.
    championshipDrawId = null;
    championshipLineup = null;

    const safeSnapshot = repairManualSnapshot(snapshotFresco);
    const gravacao = await Promise.resolve(savePersistedState(safeSnapshot));
    render(safeSnapshot);
    uiActionInFlight = false;

    // Não afirmar sucesso sem ter certeza: se a gravação remota falhou, o
    // resultado vive só neste aparelho e some no próximo sync.
    if (gravacao && gravacao.ok !== true) {
      showToast('Resultado NÃO foi salvo no servidor. Verifique a conexão e lance de novo.', 'error');
    } else {
      showToast("Resultado lançado e classificação recalculada", "success");
      // Dispara votação de desempenho imediatamente após o resultado ser salvo,
      // em vez de depender do cron que só roda 1h após o início do jogo.
      // Fire-and-forget: não bloqueia nem mostra erro ao admin se falhar.
      if (builtResult.game_key && SUPABASE_CONFIG?.url) {
        try {
          const token = JSON.parse(localStorage.getItem('harmonia_auth_session') || 'null')?.access_token || null;
          if (token) {
            fetch(`${SUPABASE_CONFIG.url}/functions/v1/send-push`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ action: 'trigger_voting', kind: 'desempenho', game_key: builtResult.game_key }),
            }).catch(() => {});
          }
        } catch (_) { /* fire-and-forget */ }
      }
    }
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
  const birthDateRaw = document.getElementById("new-birthdate")?.value?.trim();
  const birthDate = displayToIso(birthDateRaw || '');
  const role = document.getElementById("new-role")?.value;
  const position = document.getElementById("new-position")?.value;
  const is_admin = document.getElementById("new-admin")?.checked;
  const mens_ok = document.getElementById("new-mens")?.checked;
  const gk_pays = document.getElementById("new-gk-pays")?.checked; // só relevante p/ goleiro
  // Só é FOTO NOVA se for um data: URL (arquivo recém-selecionado). O form
  // pré-preenche o dataset com a foto atual (agora URL assinada) — que NÃO deve
  // virar upload. base64 legado (data:) ainda migra normalmente.
  const rawNewPhoto = document.getElementById("new-photo")?.dataset?.photoDataUrl || "";
  const photoDataUrl = rawNewPhoto.startsWith("data:") ? rawNewPhoto : "";

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
      gk_pays: role === "player" ? !!gk_pays : false,
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
    playerToEdit.gk_pays = role === "player" ? !!gk_pays : false;
    playerToEdit.is_admin = !!is_admin;
    if (photoDataUrl) {
      const up = await uploadPlayerPhoto(photoDataUrl, playerToEdit.id);
      if (up.ok) { playerToEdit.photo_url = up.url; delete playerToEdit.photoDataUrl; invalidateSignedPhoto(playerToEdit.id); }
      else { playerToEdit.photoDataUrl = photoDataUrl; invalidateSignedPhoto(playerToEdit.id); showToast(`Não consegui enviar a foto${up.status ? ` (erro ${up.status})` : ''}. Salvei o resto.`, 'error'); } // fallback: mantém base64
    }
  } else {
    const newId = "p_" + Date.now();
    let photoFields = {};
    if (photoDataUrl) {
      const up = await uploadPlayerPhoto(photoDataUrl, newId);
      photoFields = up.ok ? { photo_url: up.url } : { photoDataUrl }; // fallback base64
      if (up.ok) invalidateSignedPhoto(newId);
      else showToast(`Não consegui enviar a foto${up.status ? ` (erro ${up.status})` : ''}. Salvei o resto.`, 'error');
    }
    snapshot.players.push({
      id: newId,
      name,
      phone,
      birthDate,
      plays_football: role === "player",
      in_carne_group: true,
      position: role === "player" ? position : null,
      mens_ok: role === "player" ? !!mens_ok : false,
      gk_pays: role === "player" ? !!gk_pays : false,
      is_admin: !!is_admin,
      ...photoFields,
      active: true,
      deleted: false
    });
  }

  const safeSnapshot = repairManualSnapshot(snapshot);
  replaceState(safeSnapshot);
  // ESPERA a gravação antes de comemorar. Anunciar "Jogador atualizado com
  // sucesso" sem confirmação do servidor foi o que escondeu o gate de
  // multi-admin do plano Free: o admin promovia todo mundo, o banco recusava
  // uma a uma (trigger free_single_admin) e a tela dizia que tinha dado certo —
  // só pegando o celular do outro é que dava pra ver que não virou admin.
  const gravacao = await Promise.resolve(savePersistedState(safeSnapshot));
  editingPlayerId = null;
  setPlayerFormMode(false);
  resetPlayerForm();
  uiActionInFlight = false;

  if (gravacao && gravacao.ok !== true) {
    showToast(
      gravacao.conflict
        ? 'Outro aparelho salvou antes. Abra o cadastro de novo e refaça a alteração.'
        : mensagemDeFalhaRemota(Number(gravacao.status) || 0, gravacao.serverMessage),
      'error'
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (!isEditing) logPlayerAdded(currentPlayer, { name });
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
  const birthDateRaw = document.getElementById("self-birthdate")?.value?.trim();
  const birthDate = displayToIso(birthDateRaw || '');
  const positionInput = document.getElementById("self-position");
  // A memória de módulo vem PRIMEIRO: o dataset do input se perde em qualquer
  // re-render (poll, sync, outra edição) e o Salvar acabava gravando o cadastro
  // sem a foto, avisando "sucesso".
  const rawSelfPhoto = selfPhotoPending || document.getElementById("self-photo")?.dataset?.photoDataUrl || "";
  const selfPhotoDataUrl = rawSelfPhoto.startsWith("data:") ? rawSelfPhoto : ""; // só data: = foto nova
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

  // Só mexe na foto se houver uma nova selecionada. Sobe pro Storage; em falha,
  // mantém base64 como fallback. Sem foto nova, preserva o que já existe.
  let selfPhotoFields = null;
  if (selfPhotoDataUrl) {
    const up = await uploadPlayerPhoto(selfPhotoDataUrl, currentPlayer.id);
    selfPhotoFields = up.ok ? { photo_url: up.url, photoDataUrl: '' } : { photoDataUrl: selfPhotoDataUrl };
    if (up.ok) invalidateSignedPhoto(currentPlayer.id);
    else { invalidateSignedPhoto(currentPlayer.id); showToast(`Não consegui enviar a foto${up.status ? ` (erro ${up.status})` : ''}. Salvei o resto.`, 'error'); }
  }

  snapshot.players = snapshot.players.map((player) => {
    if (player.id !== currentPlayer.id) return player;
    return {
      ...player,
      name,
      phone,
      birthDate,
      position: player.plays_football === false ? player.position : position,
      ...(selfPhotoFields || {}),
    };
  });

  const safeSnapshot = repairManualSnapshot(snapshot);
  replaceState(safeSnapshot);
  savePersistedState(safeSnapshot);
  selfProfileEditOpen = false;
  selfPhotoPending = '';
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


if (action === "approve-player") {
  if (!requireAdmin(snapshot, 'Apenas administrador pode aprovar cadastros')) return;
  const currentSnapshot = structuredClone(getState());
  if (Array.isArray(currentSnapshot.players)) currentSnapshot.players = currentSnapshot.players.map(normalizePlayer);
  const player = currentSnapshot.players.find((p) => String(p.id) === String(id));
  if (!player) return;

  uiActionInFlight = true;
  setActionBusy(trigger, 'Aprovando...');

  player.pending = false; // vira membro (o trigger permite admin mudar pending)
  const safeSnapshot = repairManualSnapshot(currentSnapshot);
  replaceState(safeSnapshot);

  uiActionInFlight = false;
  clearActionBusy(trigger);
  showToast(`${player.name || 'Jogador'} aprovado! Já pode entrar no grupo.`, 'success');
  return;
}


if (action === "reject-player") {
  if (!requireAdmin(snapshot, 'Apenas administrador pode recusar cadastros')) return;
  if (!requireCriticalOperationAllowed('recusar cadastro', trigger)) return;

  const player = snapshot.players.find((p) => String(p.id) === String(id));
  if (!player) return;
  const currentPlayerId = snapshot.session?.playerId;

  const ok = await showConfirmModal({
    title: 'Recusar cadastro',
    message: `Recusar o cadastro de ${player.name}? A conta será removida e a pessoa não entrará no grupo.`,
    confirmText: 'Recusar',
    cancelText: 'Cancelar',
  });
  if (!ok) return;

  uiActionInFlight = true;
  setActionBusy(trigger, 'Recusando...');

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
      showToast(result.message || 'Não foi possível recusar o cadastro.', 'error');
      return;
    }

    await reloadRemoteStateAfterCriticalOperation(snapshot);
    showToast('Cadastro recusado.', 'success');
  } catch (error) {
    clearActionBusy(trigger);
    uiActionInFlight = false;
    showToast(error?.message || 'Erro ao recusar cadastro.', 'error');
  }

  return;
}


if (action === "leave-team-player") {
  if (!requireAdmin(snapshot, 'Apenas administrador pode mover jogadores para ex-membros')) return;

  const player = snapshot.players.find((p) => String(p.id) === String(id));
  if (!player) return;

  const ok = await showConfirmModal({
    title: 'Saiu do time',
    message: `Marcar ${player.name} como ex-membro? O nome ficará visível no histórico de campeonatos e a operação pode ser desfeita.`,
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
  });
  if (!ok) return;

  uiActionInFlight = true;
  setActionBusy(trigger, 'Salvando...');

  try {
    const result = await leaveTeamOperation({
      player,
      currentPlayerId: snapshot.session?.playerId,
      allPlayers: snapshot.players,
    });

    clearActionBusy(trigger);
    uiActionInFlight = false;

    if (!result.ok) {
      showToast(result.message || 'Não foi possível salvar.', 'error');
      return;
    }

    await reloadRemoteStateAfterCriticalOperation(snapshot);
    showToast(result.message || 'Jogador movido para ex-membros.', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    clearActionBusy(trigger);
    uiActionInFlight = false;
    showToast(error?.message || 'Erro inesperado.', 'error');
  }

  return;
}


if (action === "reactivate-left-player") {
  if (!requireAdmin(snapshot, 'Apenas administrador pode reativar jogadores')) return;

  const player = snapshot.players.find((p) => String(p.id) === String(id));
  if (!player) return;

  const ok = await showConfirmModal({
    title: 'Reativar jogador',
    message: `Reativar ${player.name} no time?`,
    confirmText: 'Reativar',
    cancelText: 'Cancelar',
  });
  if (!ok) return;

  uiActionInFlight = true;
  setActionBusy(trigger, 'Reativando...');

  try {
    const result = await reactivateLeftPlayerOperation({ player });

    clearActionBusy(trigger);
    uiActionInFlight = false;

    if (!result.ok) {
      showToast(result.message || 'Não foi possível reativar.', 'error');
      return;
    }

    await reloadRemoteStateAfterCriticalOperation(snapshot);
    showToast(result.message || 'Jogador reativado.', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    clearActionBusy(trigger);
    uiActionInFlight = false;
    showToast(error?.message || 'Erro inesperado ao reativar.', 'error');
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
    && snapshot.confirmations.some((entry) => String(entry.player_id) === String(id) && isConfirmedEntry(entry));

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
    && snapshot.confirmations.some((entry) => String(entry.player_id) === String(id) && isConfirmedEntry(entry));

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



  if (action === "open-strength-info") {
    await showInfoModal({
      title: '⚡ Força do time',
      html: `
        <p>É um <strong>índice de força</strong> (de 1 a 10) que combina duas coisas de cada jogador:</p>
        <p>• a <strong>nota de desempenho</strong> da votação;<br>• a <strong>pontuação no campeonato</strong> (anual).</p>
        <p>O sorteio usa esse índice para deixar os times o mais <strong>equilibrados</strong> possível — respeitando as posições (goleiro, zaga, meio e ataque divididos entre os times). Misturar o campeonato evita que quem está disparando na frente caia sempre no time mais forte.</p>
        <p style="opacity:.75;font-size:13px;">Peso atual: metade nota, metade campeonato. Convidados e goleiros de aluguel não entram na média do selo.</p>
      `,
    });
    return;
  }

  if (action === "open-pix-info") {
    if (!requireAdmin(snapshot, 'Apenas administrador')) return;
    const payPlayer = (snapshot.players || []).find((p) => String(p.id) === String(id));
    const pay = payPlayer?.mens_payment;
    if (!payPlayer || !pay) return;
    const amountLabel = pay.amount ? `R$ ${Number(pay.amount).toFixed(2).replace('.', ',')}` : '—';
    const dateLabel = pay.date ? formatDate(pay.date) : '—';
    const atLabel = pay.at ? new Date(pay.at).toLocaleString('pt-BR') : '—';
    const rows = [
      ['Forma', pay.reviewed ? 'PIX (confirmado na revisão)' : 'PIX (comprovante automático)'],
      ['Valor', amountLabel],
      ['Data do pagamento', dateLabel],
      pay.beneficiary ? ['Beneficiário', escapeHtml(pay.beneficiary)] : null,
      pay.bank ? ['Banco', escapeHtml(pay.bank)] : null,
      pay.e2e_tail ? ['ID transação', `…${escapeHtml(pay.e2e_tail)}`] : null,
      ['Recebido em', atLabel],
    ].filter(Boolean);
    await showInfoModal({
      title: `Pagamento de ${escapeHtml(payPlayer.name || '')}`,
      html: rows.map(([k, v]) => `<div class="pix-info-row"><span>${k}</span><strong>${v}</strong></div>`).join(''),
    });
    return;
  }

  if (action === "open-pix-review") {
    if (!requireAdmin(snapshot, 'Apenas administrador pode revisar comprovantes')) return;
    const reviewPlayer = (snapshot.players || []).find((p) => String(p.id) === String(id));
    const review = reviewPlayer?.mens_review;
    if (!reviewPlayer || !review) return;
    const amountLabel = review.amount ? `R$ ${Number(review.amount).toFixed(2).replace('.', ',')}` : '—';
    const dateLabel = review.date ? formatDate(review.date) : '—';
    const confirmedReview = await showConfirmModal({
      title: `Comprovante de ${reviewPlayer.name}`,
      message: `Beneficiário lido: ${review.beneficiary || '—'}\nValor: ${amountLabel}\nData: ${dateLabel}${review.bank ? `\nBanco: ${review.bank}` : ''}\n\nO identificador da transação (E2E) não foi lido no print, então não deu para confirmar automaticamente. Marcar a mensalidade como paga?`,
      confirmText: 'Marcar pago',
      cancelText: 'Fechar',
    });
    if (!confirmedReview) return;
    const reviewSnapshot = structuredClone(getState());
    if (Array.isArray(reviewSnapshot.players)) reviewSnapshot.players = reviewSnapshot.players.map(normalizePlayer);
    const target = reviewSnapshot.players.find((p) => String(p.id) === String(id));
    if (!target) return;
    target.mens_ok = true;
    if (target.mens_review) {
      target.mens_payment = {
        method: 'pix',
        amount: target.mens_review.amount,
        date: target.mens_review.date,
        beneficiary: target.mens_review.beneficiary,
        bank: target.mens_review.bank,
        at: new Date().toISOString(),
        reviewed: true,
      };
      delete target.mens_review;
    }
    const safeSnapshot = repairManualSnapshot(reviewSnapshot);
    replaceState(safeSnapshot);
    showToast(`Mensalidade de ${target.name} marcada como paga.`, 'success');
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
    // Toggle manual do admin: limpa avisos pendentes. O comprovante PIX (mens_payment)
    // só é removido ao marcar PAGO manualmente — preservar na inadimplência protege
    // a prova de que o jogador havia pago.
    if (player.mens_review) delete player.mens_review;
    if (action === "mark-paid" && player.mens_payment) delete player.mens_payment;

    const safeSnapshot = repairManualSnapshot(currentSnapshot);

    // Critical: update the canonical in-memory state. Calling render() directly here
    // would redraw the UI without changing core/state.js, so the next fast click
    // could be based on a stale snapshot and revert the previous mensalidade change.
    replaceState(safeSnapshot);

    uiActionInFlight = false;
    logPaymentToggled(currentPlayer, { paid: action === "mark-paid", target_id: id });
    showToast(action === "mark-paid" ? "Mensalidade marcada como paga" : "Jogador marcado como inadimplente", "success");
    return;
  }
});


// Mostra o checkbox "Goleiro paga mensalidade" só quando a posição é goleiro.
function syncGkPaysVisibility() {
  const group = document.getElementById("gk-pays-group");
  if (!group) return;
  const role = document.getElementById("new-role")?.value;
  const pos = document.getElementById("new-position")?.value;
  group.style.display = (role !== "carne" && pos === "gol") ? "" : "none";
}

document.addEventListener("change", (e) => {
  const target = e.target;
  if (!target) return;

  if (target.id === "new-role") {
    const position = document.getElementById("new-position");
    if (position) {
      if (target.value === "carne") { position.value = "meia"; position.disabled = true; }
      else { position.disabled = false; }
    }
  }

  if (target.id === "new-role" || target.id === "new-position") {
    syncGkPaysVisibility();
  }
});

import { buildGameView, buildPlayersView, getGames, getActiveGame, getGameKey } from "../domain/projection.js";
import { isConfirmedEntry, isGoalkeeperPlayer, belongsToGame } from "../domain/confirmations.js";
import { classifyGameConfirmations } from "../domain/confirmations.js";
import { validateAndRepairState } from "../domain/state.guard.js";
import { getMensalidadeMode, MENSALIDADE_MODES, isMensOkEffective } from "../domain/rules.engine.js";
import { APP_VERSION } from "./version.js";
import { getState, patchState, replaceState, subscribe } from './state.js';
import { getState as loadPersistedState, saveState as savePersistedState, getStorageMeta, hasPendingRemoteWrites } from '../domain/storage.adapter.js';
import { saveLocalState } from '../services/storage.local.js';
import { loadRemoteState, fetchRemoteHeartbeat, getLastRemoteUpdatedAt, uploadPlayerPhoto, signPlayerPhotos, getClubInfo, getCurrentClubId, fetchConfirmationsForGame } from '../services/storage.supabase.js';
import { createPlayerAccessOperation, deletePlayerOperation, leaveTeamOperation, reactivateLeftPlayerOperation, resetPlayerPasswordOperation, restoreDeletedPlayerByPhoneOperation } from '../modules/players/player-operations.service.js';
import { getCurrentPlayer, login, logout, register, restoreSession, prepareStoredSession, refreshSession, updateOwnPassword, loginWithPasskeySession, deleteOwnAccount } from '../services/auth.service.js';
import { signInWithPasskey, registerPasskeyForCurrentUser, passkeySupported, conditionalMediationAvailable } from '../services/passkey.service.js';
import { renderAuthScreen } from '../modules/auth/auth.view.js';
import { renderPlayersScreen, renderCarneScreen } from '../modules/players/players.view.js';
import { renderFinanceScreen, renderPublicFinanceScreen } from '../modules/finance/finance.ledger.view.js';
import { loadLedgerCache, addLedgerEntry, deleteLedgerEntry, chargeMember, publishSummary, loadPublicSummary, getPublicSummary, ledgerSummary, getCachedLedger } from '../modules/finance/finance.ledger.service.js';
import { renderChampionshipScreen } from '../modules/championship/championship.view.js';
import { isPro, renderProLock, renderProLockInline, showProUpsellModal } from '../domain/gating.js';
import { idDaEntrada, rotuloDoTime, timesDoSorteio } from '../domain/draw-teams.js';
import { campeonatoDisponivel, FORMATOS, getClubProfile, horarioPadraoDeJogo, isModuleOn, limiteSugeridoDeJogo, perfilDoFormulario, proximaDataDeJogo } from '../domain/club-profile.js';
import { buildTeamResultStatuses, deleteChampionshipResult, findReplacedChampionshipResult, persistChampionshipResult } from '../modules/championship/championship.service.js';
import { canManagePresence, isConfirmed, toggleConfirmation, drawTeams, clearTeamDraw, moveDrawnPlayer, adminRemovePlayerFromGame, getWaitlistView, addRentalGoalkeeper, removeRentalGoalkeeper, addGuestPlayer, removeGuestPlayer, getActiveGuestPlayers, addConfirmedPlayerToDraw } from '../modules/game/game.service.js';
import { hasCapacity, buildStrengthResolver } from '../modules/game/game.service.js';
import { canConfirm } from '../modules/finance/finance.service.js';
import { canAccessConfig, canManageCarne, canManageChampionship, canManageFinance, canManagePlayers, canManagePresence as canManagePresenceAuthz, exposeAuthz, getPlayerRole, isAdmin as authzIsAdmin, isCarneOnly as authzIsCarneOnly } from '../domain/authz.js';
import { SUPABASE_CONFIG } from "../config/supabase.config.js";
import { assertCriticalOperationAllowed, isLocalhostWithProdSupabase, getRuntimeSupabaseConfig } from '../services/environment.guard.js';
import { registerServiceWorker, getPushState, enablePush, disablePush, triggerServerPush, triggerOverdueReminders, triggerWaitlistPromotion, syncExistingPushSubscription } from '../services/push.service.js';
// TEMPORÁRIO (piloto): log de movimentação dos testers. Remover antes do go-live.
import { logAppOpen, logTab, logPresenceConfirmed, logPresenceCancelled, logTeamDraw, logPlayerAdded, logPaymentToggled } from '../services/activity-log.js';
import { submitPixReceipt } from '../services/pix.service.js';
import { submitRatings, fetchRatings, loadRatingsCache, getTopRatedPlayerId, getCachedRatings, playerRatingAverages, deleteGameRatings, checkHasVoted } from '../services/ratings.service.js';
import { isVotingEnabled, isPasskeyEnabled } from './flags.js';

// Carrega as notas (uma vez por sessão) para os rankings da aba Campeonato e
// re-renderiza quando chegarem.
let _ratingsLoadStarted = false;
function ensureRatingsLoaded() {
  if (!isVotingEnabled()) return;
  if (_ratingsLoadStarted) return;
  _ratingsLoadStarted = true;
  // Se a carga falhar (rede), libera nova tentativa numa próxima render — senão
  // o cache fica vazio para sempre e o sorteio por nota degrada em silêncio.
  loadRatingsCache()
    .then((cache) => { if (!cache?.loaded) _ratingsLoadStarted = false; render(getState()); })
    .catch(() => { _ratingsLoadStarted = false; });
}

// Livro-caixa (aba Financeiro, Pro): carrega uma vez e re-renderiza quando chega.
let _ledgerLoadStarted = false;
function ensureLedgerLoaded() {
  if (_ledgerLoadStarted) return;
  _ledgerLoadStarted = true;
  loadLedgerCache()
    .then((res) => {
      // `loadLedgerCache` nunca rejeita, então o .catch abaixo era código morto:
      // uma falha passageira deixava `_ledgerLoadStarted` travado em true e a aba
      // inutilizável pelo resto da sessão. Libera a flag para nova tentativa.
      if (!res?.ok) _ledgerLoadStarted = false;
      render(getState());
    })
    .catch(() => { _ledgerLoadStarted = false; });
}

// Resumo financeiro publicado ao grupo (finance_public): carrega uma vez.
let _pubLoadStarted = false;
function ensureFinancePublicLoaded() {
  if (_pubLoadStarted) return;
  const clubId = getCurrentClubId();
  if (!clubId) return;
  _pubLoadStarted = true;
  loadPublicSummary(clubId).then(() => render(getState())).catch(() => { _pubLoadStarted = false; });
}

// Avisa por push quem foi promovido da fila. Best-effort, fora do fluxo de UI;
// o servidor deduplica por (jogo + jogador), então é seguro chamar de qualquer
// cliente que tenha detectado a promoção.
function notifyWaitlistPromotion(result) {
  const promotedId = result?.promotedPlayerId;
  if (!promotedId) return;
  if (!isNotifEnabled(getState(), 'fila_promovido')) return; // central de notificações
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

const REMOTE_SYNC_INTERVAL_MS = 6000;
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

// Conditional UI (autofill) de passkey na tela de login: inicia uma requisição
// "conditional" que NÃO mostra modal — fica pendente até o usuário tocar no
// campo de telefone e escolher a passkey no autofill (Face ID/digital) → loga.
// Sem botão e sem gesto de boot (que o navegador bloqueia). Só uma vez por boot.
let _passkeyConditionalStarted = false;
async function startPasskeyAutofill() {
  try {
    if (_passkeyConditionalStarted) return;
    if (getCurrentPlayer()) return;
    if (!isPasskeyEnabled() || !passkeySupported()) return;
    if (!(await conditionalMediationAvailable())) return;
    _passkeyConditionalStarted = true;
    const res = await signInWithPasskey({ conditional: true });
    if (res.ok) await loginWithPasskeySession(res.session); // replaceState -> re-render
    else _passkeyConditionalStarted = false; // libera nova tentativa se falhou
  } catch (_) { _passkeyConditionalStarted = false; }
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
  // 1. Validate Supabase Auth first (restoreSession valida o token; se logado,
  //    ele já faz loadRemoteState AUTENTICADO + vincula o jogador à sessão).
  // 2. Se o token guardado for inválido, restoreSession() o limpa.
  // 3. Deslogado: NÃO lemos nada do servidor. A tela de login não precisa de
  //    dados, e o cadastro agora é server-side (Edge Function register-player),
  //    então o cliente anônimo não faz mais nenhuma leitura REST. Isso permite
  //    dropar as policies de SELECT anônimo (players/app_meta/game/presence).
  await restoreSession();

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

  // Passkey "embutida": prepara o autofill (Conditional UI). A passkey aparece
  // ao tocar no campo de telefone — sem botão. Não bloqueia o boot.
  startPasskeyAutofill();

  // PWA / Web Push: registra o service worker em segundo plano (não bloqueia o
  // boot) e re-salva a inscrição existente no servidor (cura "inscrito no
  // navegador mas não salvo no banco").
  registerServiceWorker().then(() => {
    const current = getCurrentPlayer();
    if (current) syncExistingPushSubscription(current.id);
  });
}

// Recusas dos triggers de guarda do banco. A mensagem crua ('free_single_admin')
// não diz nada a quem está com o celular na mão — e, pior, dizer "confira a
// internet" faz caçar um problema que não existe. Cada regra do servidor tem
// aqui a sua tradução.
const RECUSAS_DO_SERVIDOR = {
  free_single_admin: 'O plano Free permite 1 administrador por clube. Para vários admins é preciso o plano Pro.',
  player_update_not_allowed: 'Você só pode alterar o seu próprio cadastro.',
  mens_ok_is_admin_only: 'Só o administrador altera a mensalidade.',
  role_is_admin_only: 'Só o administrador altera o tipo de participante.',
  plays_football_is_admin_only: 'Só o administrador altera se a pessoa joga.',
  in_carne_group_is_admin_only: 'Só o administrador altera o grupo do churrasco.',
  pending_is_admin_only: 'Só o administrador aprova um cadastro pendente.',
};

function mensagemDeFalhaRemota(status, serverMessage) {
  const bruta = String(serverMessage || '');
  const conhecida = Object.keys(RECUSAS_DO_SERVIDOR).find((chave) => bruta.includes(chave));
  if (conhecida) return `${RECUSAS_DO_SERVIDOR[conhecida]} A alteração não foi salva.`;
  if (status === 401) return 'Sua sessão expirou: a alteração ficou só neste aparelho. Entre de novo e refaça.';
  if (status >= 400 && status < 500) {
    return `O servidor não aceitou esta alteração (erro ${status}). Ela ficou só neste aparelho — avise o administrador.`;
  }
  return 'Não consegui salvar no servidor: sua alteração ficou só neste aparelho. Confira a internet e refaça.';
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

  // Escrita remota falhou: o local JÁ salvou (a tela mostra o resultado), mas o
  // servidor não recebeu. Sem avisar, a pessoa confia numa confirmação que vai
  // sumir no próximo sync. Throttle de 30s para não virar spam em rede instável.
  //
  // UM listener só. Havia dois ouvindo este mesmo evento, com textos
  // diferentes, e o guard de conflito de a6c477d cobria apenas um deles — todo
  // conflito de concorrência continuava exibindo o toast do outro.
  //
  // O texto acompanha a causa: mandar "confira a internet" quando o servidor
  // RECUSOU a gravação (4xx) manda o usuário caçar um problema que não existe.
  let lastRemoteSaveFailAt = 0;
  window.addEventListener('harmonia:remote-save-failed', (event) => {
    if (event.detail?.conflict) return; // conflito já tratado silenciosamente pelo remote-conflict
    const now = Date.now();
    if (now - lastRemoteSaveFailAt < 30000) return;
    lastRemoteSaveFailAt = now;
    const status = Number(event.detail?.status) || 0;
    console.warn('[app] alteração não salva no servidor:', event.detail?.reason, status || '', event.detail?.serverMessage || '');
    showToast(mensagemDeFalhaRemota(status, event.detail?.serverMessage), 'error');
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
    // Sem os campos abaixo, uma alteração que só tocasse config/jogos/exclusões
    // era lida como "nada mudou": o poll DESCARTAVA o estado remoto, o outro
    // admin nunca recebia o valor novo — e, na gravação seguinte dele, o valor
    // velho que ele ainda tinha REVERTIA o do primeiro. É a explicação do
    // "a configuração voltou sozinha".
    settings: snapshot.settings || null,
    games: snapshot.games || [],
    active_game_id: snapshot.active_game_id || null,
    deleted_player_ids: snapshot.deleted_player_ids || [],
    deleted_player_phones: snapshot.deleted_player_phones || [],
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

// Sonda de mudança barata + recuperação de sessão. Em 401/403, tenta renovar a
// sessão UMA vez antes de declarar morta (evita logout por blip transitório).
async function probeRemoteHeartbeat(activeGameKey) {
  let hb = await fetchRemoteHeartbeat(activeGameKey);
  if (!hb.ok && (hb.status === 401 || hb.status === 403)) {
    const recovered = await refreshSession();
    if (recovered) hb = await fetchRemoteHeartbeat(activeGameKey);
  }
  return hb;
}

let syncInFlight = false;
let authFailureStreak = 0;
const AUTH_FAILURE_LOGOUT_THRESHOLD = 3;

// Só desloga em 401/403 quando, ESTANDO online, a falha de auth persiste por
// ciclos consecutivos. Blip de rede (offline / troca wifi<->4G no campo) NÃO
// desloga — era a causa real de "sessão caindo" no pico de confirmação.
function shouldLogoutOnAuthFailure() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  authFailureStreak += 1;
  if (authFailureStreak >= AUTH_FAILURE_LOGOUT_THRESHOLD) {
    authFailureStreak = 0;
    return true;
  }
  return false;
}

async function syncRemoteOnce() {
  // Guardas baratas ANTES de marcar "em andamento".
  if (syncInFlight) return; // evita ciclos sobrepostos (e corrida de refresh de token)
  // Nunca consulta a REST sem usuário autenticado (RLS fechada -> 401 no login).
  if (!getCurrentPlayer()) return;
  // Não sincroniza com a aba em segundo plano: corta requisições inúteis e
  // alivia o banco no pico. Ao voltar ao foco, um sync imediato é disparado.
  if (typeof document !== 'undefined' && document.hidden) return;
  // Há escrita local ainda não confirmada no servidor: aplicar o remoto agora
  // reverteria a edição do usuário (lost update). Pula este ciclo.
  if (hasPendingRemoteWrites()) return;
  // Ação do usuário EM ANDAMENTO. Vários handlers capturam o estado, esperam
  // algo demorado (upload de foto, modal de confirmação) e só então gravam.
  // Se o poll trocar o estado nesse intervalo, o handler grava o snapshot
  // velho por cima do que acabou de chegar — inclusive revertendo a edição de
  // outra pessoa. `hasPendingRemoteWrites` só cobre DEPOIS do save; esta guarda
  // cobre o intervalo ANTES dele. Ver INCIDENTE 24/07 (resultado do campeonato
  // relançado voltava sozinho).
  //
  // Com TETO: se a flag vazar ligada (um handler que sai por um caminho sem
  // resetá-la), o app deixaria de sincronizar para sempre e ninguém saberia.
  // Depois de SYNC_SKIP_MAX ciclos consecutivos preferimos sincronizar mesmo
  // assim — ficar defasado é pior do que a corrida que a guarda evita.
  if (uiActionInFlight && syncSkipStreak < SYNC_SKIP_MAX) {
    syncSkipStreak += 1;
    return;
  }
  if (syncSkipStreak >= SYNC_SKIP_MAX) {
    console.warn('[remote-sync] uiActionInFlight preso por muitos ciclos — sincronizando assim mesmo.');
  }
  syncSkipStreak = 0;

  syncInFlight = true;
  try {
    // Renova o token ANTES de expirar (só vai à rede perto do vencimento), para
    // que a 1ª chamada após o vencimento não volte 401 e force logout.
    await prepareStoredSession();

    // Heartbeat barato: só faz a leitura completa quando algo realmente mudou.
    // Passa o jogo ativo para o filtro de presença casar com o baseline do load.
    const activeGameKey = getState()?.game?.game_key || getState()?.active_game_id || null;
    const hb = await probeRemoteHeartbeat(activeGameKey);
    if (!hb.ok) {
      if ((hb.status === 401 || hb.status === 403) && shouldLogoutOnAuthFailure()) await handleExpiredSession();
      return; // rede/5xx/timeout ou blip transitório: ignora o ciclo, sem deslogar.
    }
    authFailureStreak = 0; // heartbeat OK -> sessão viva; zera o contador de falhas.
    const lastKnown = getLastRemoteUpdatedAt();
    const changed = !lastKnown || !hb.updatedAt
      || new Date(hb.updatedAt).getTime() > new Date(lastKnown).getTime();
    if (!changed) return; // nada mudou no servidor — ciclo barato, sem full read.

    // Algo mudou: aí sim faz a leitura completa.
    const localSnapshot = getState();
    const remote = await loadRemoteState();

    if (!remote.ok || !isValidRemoteDomainSnapshot(remote.state)) {
      if ((remote.status === 401 || remote.status === 403) && shouldLogoutOnAuthFailure()) {
        await handleExpiredSession();
      }
      return;
    }
    authFailureStreak = 0; // leitura completa OK -> sessão viva.

    {
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
    }
  } catch (error) {
    isApplyingRemoteState = false;
    console.warn('[remote-sync] failed to sync remote state', error);
  } finally {
    syncInFlight = false;
  }
}

function startRemoteSync() {
  window.setInterval(syncRemoteOnce, REMOTE_SYNC_INTERVAL_MS);
  // Ao voltar o foco à aba, sincroniza na hora (o poll pausa em segundo plano)
  // e checa se saiu uma versão nova do app (PWA aberto por dias não recarrega).
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      // Voltar o foco = nova chance para a votação: uma falha transitória da Edge
      // Function não pode deixar `ratingsUnavailable` travado a sessão inteira.
      if (!document.hidden) { ratingsUnavailable = false; syncRemoteOnce(); checkForNewVersion(); }
    });
  }
}

// Sessão de PWA aberta por muito tempo pode estar rodando código velho. Ao voltar
// o foco, compara a versão servida com a carregada; se mudou, oferece recarregar.
async function checkForNewVersion() {
  // Guarda por presença no DOM, não por flag permanente: se o banner some (ou
  // uma versão MAIS nova é servida depois), ele reaparece. Antes, uma flag global
  // travava o aviso após a 1ª vez — PWA podia rodar código velho por dias.
  if (document.getElementById('__update-banner')) return;
  try {
    const resp = await fetch(`./js/core/version.js?cb=${Date.now()}`, { cache: 'no-store' });
    if (!resp.ok) return;
    const m = (await resp.text()).match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    const served = m && m[1];
    if (served && served !== APP_VERSION) {
      const b = document.createElement('button');
      b.id = '__update-banner';
      b.type = 'button';
      b.className = 'update-banner';
      b.textContent = '🔄 Nova versão disponível — tocar para atualizar';
      b.addEventListener('click', () => window.location.reload());
      document.body.appendChild(b);
    }
  } catch (_) { /* sem rede / offline: ignora */ }
}

function persist(snapshot) {
  savePersistedState(snapshot);
}

function render(snapshot) {
  // Garante URLs assinadas das fotos (bucket privado) — async, re-renderiza
  // quando chegam. Guardado internamente para não martelar.
  ensureSignedPhotos(snapshot);
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
// Abre quando o ADMIN lança o resultado do jogo e dura settings.ratings_perf_window_hours.
// Só para quem esteve dentro do jogo e ainda não votou. Cada votante dá nota 1–10 em cada
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
  const gameDate = String(game?.game_date || '').slice(0, 10);
  if (!gameDate) return null;
  // A votação SÓ abre depois que o admin LANÇA O RESULTADO deste jogo — dá tempo
  // de reorganizar times / tirar quem não apareceu antes de liberar as notas.
  // Casado por DATA (o game_key do resultado é inconsistente: às vezes null, às
  // vezes com ':' no horário). Dura ratings_perf_window_hours a partir do lançamento.
  const results = snapshot?.championship?.active?.results || [];
  const markedMs = results
    .filter((r) => String(r?.date || '').slice(0, 10) === gameDate)
    .map((r) => Date.parse(r?.created_at || ''))
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => b - a)[0];
  if (!markedMs) return null; // sem resultado lançado → votação fechada
  return { openMs: markedMs, closeMs: markedMs + hours * 60 * 60 * 1000 };
}

// Jogo cuja janela de votação está ABERTA agora, do mais recente para o mais
// antigo. Antes as votações usavam o jogo ATIVO: abrir o próximo jogo (manual
// OU pelo cron `auto-open-games`, 2 dias antes) trocava a referência e a
// votação do jogo recém-terminado sumia da tela mesmo com a janela dele aberta.
// Neste app a janela de desempenho abre no lançamento do resultado — então
// deixar de conseguir lançar (bug do getChampionshipDrawOptions, corrigido
// junto) tirava a votação inteira daquele jogo. `windowFn` recebe o jogo e
// devolve a janela pela regra de cada votação. Sem janela aberta, devolve null
// e o chamador cai no jogo ativo (comportamento anterior preservado).
function getGameWithOpenVoteWindow(snapshot, windowFn) {
  const now = Date.now();
  return getCurrentGames(snapshot)
    .slice()
    .sort((a, b) => String(b?.game_date || '').localeCompare(String(a?.game_date || '')))
    .find((game) => {
      const win = windowFn(game);
      return !!win && now >= win.openMs && now <= win.closeMs;
    }) || null;
}

function getInGamePlayers(snapshot, game, confirmations = null) {
  const key = getGameKey(game);
  // Quem "jogou" = quem está CONFIRMADO neste jogo, pela regra CANÔNICA
  // (isConfirmedEntry respeita o status: um 'cancelled'/'removed' NÃO conta,
  // mesmo com confirmed cru stale-true). Dedup por jogador: a ÚLTIMA entrada
  // (maior timestamp) vence, pra uma remoção recente não ser atropelada por
  // uma confirmação antiga/duplicada residual. Endurece a votação contra o bug
  // "removido antes do voto ainda aparece pra receber nota".
  const latestByPlayer = new Map();
  for (const e of (confirmations || snapshot.confirmations || [])) {
    if (!belongsToGame(e, key)) continue;
    const pid = String(e?.player_id || '');
    if (!pid) continue;
    const t = String(e?.timestamp || e?.confirmed_at || e?.cancelled_at || '');
    const prev = latestByPlayer.get(pid);
    if (!prev || t >= prev.t) latestByPlayer.set(pid, { t, entry: e });
  }
  const ids = new Set();
  for (const [pid, { entry }] of latestByPlayer) if (isConfirmedEntry(entry)) ids.add(pid);
  return (snapshot.players || []).filter((p) => ids.has(String(p.id)));
}

// Confirmações que valem para a VOTAÇÃO. Quando o jogo com janela aberta ainda é
// o ativo, usa o que já está carregado; quando não é mais (o próximo jogo foi
// criado), busca as daquele jogo e cacheia — uma leitura por jogo, não uma por
// render. Devolve null enquanto a leitura está em voo, para o chamador decidir no
// próximo render em vez de esconder a votação por engano.
let votingConfirmations = { gameKey: null, rows: null, loading: false };

async function confirmationsForVotingGame(snapshot, game) {
  const key = getGameKey(game);
  const activeKey = getGameKey(getActiveGameFromSnapshot(snapshot));
  if (!key || key === activeKey) return snapshot.confirmations || [];
  if (votingConfirmations.gameKey === key && votingConfirmations.rows) return votingConfirmations.rows;
  if (votingConfirmations.loading) return null;
  votingConfirmations = { gameKey: key, rows: null, loading: true };
  const res = await fetchConfirmationsForGame(key);
  // Leitura falhou: cai no que está carregado em vez de travar a votação. Pior
  // caso volta ao comportamento antigo, nunca a um estado novo e pior.
  votingConfirmations = { gameKey: key, rows: res.ok ? res.rows : null, loading: false };
  return votingConfirmations.rows || snapshot.confirmations || [];
}

async function maybeShowPerfVote(snapshot, currentPlayer) {
  if (!isVotingEnabled()) { unmountPerfVote(); return; }
  // Clube que não vota não recebe o modal bloqueante.
  if (!isModuleOn(snapshot, 'votacao_desempenho')) { unmountPerfVote(); return; }
  if (!currentPlayer) { unmountPerfVote(); return; }
  // Desacoplado do jogo ativo: vale o jogo cuja janela está aberta.
  const game = getGameWithOpenVoteWindow(snapshot, (g) => getPerfWindow(snapshot, g))
    || getActiveGameFromSnapshot(snapshot);
  const key = getGameKey(game);
  const win = getPerfWindow(snapshot, game);
  const now = Date.now();
  const active = !!win && now >= win.openMs && now <= win.closeMs;

  if (perfVoteGameKey !== key) { perfVoteGameKey = key; perfVoteStatus = 'idle'; }
  if (!active || ratingsUnavailable) { unmountPerfVote(); return; }

  const confirmacoes = await confirmationsForVotingGame(snapshot, game);
  if (confirmacoes === null) return; // leitura em voo: decide no próximo render
  const elegiveis = getInGamePlayers(snapshot, game, confirmacoes);
  if (!elegiveis.some((p) => String(p.id) === String(currentPlayer.id))) { unmountPerfVote(); return; }
  if (perfVoteStatus === 'voted' || perfVoteStatus === 'active' || perfVoteStatus === 'checking') return;

  perfVoteStatus = 'checking';
  const res = await checkHasVoted('desempenho', key);
  if (!res.ok) {
    // Votação indisponível (ex.: migração/função ainda não aplicada). NUNCA
    // bloquear o app por uma votação que não tem onde gravar.
    ratingsUnavailable = true;
    perfVoteStatus = 'idle';
    return;
  }
  if (res.voted) {
    perfVoteStatus = 'voted';
    return;
  }
  const targets = elegiveis.filter((p) => String(p.id) !== String(currentPlayer.id));
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

// Dupla responsável pelo churrasco do jogo.
// Delega ao domínio puro (domain/carne.js); aqui apenas resolve os dados do snapshot.
function getChurrascoDuo(snapshot, game) {
  return calcChurrascoDuo(
    getCarneScheduleEntriesForApp(snapshot),
    getCarneRotation(snapshot),
    snapshot.players || [],
    String(game?.game_date || '').slice(0, 10),
  );
}

async function maybeShowCarneVote(snapshot, currentPlayer) {
  if (!isVotingEnabled()) { unmountCarneVote(); return; }
  if (!currentPlayer) { unmountCarneVote(); return; }
  // Desempenho tem prioridade: se o modal dele está aberto, espera.
  if (document.getElementById('perf-vote-overlay')) return;

  // Desacoplado do jogo ativo: vale o jogo cuja janela está aberta.
  const game = getGameWithOpenVoteWindow(snapshot, getCarneWindow)
    || getActiveGameFromSnapshot(snapshot);
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
  const res = await checkHasVoted('churrasco', key);
  if (!res.ok) { ratingsUnavailable = true; carneVoteStatus = 'idle'; return; }
  if (res.voted) { carneVoteStatus = 'voted'; return; }

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
  loadRatingsCache(true).then(() => render(getState())).catch(() => {});
}
// =================== fim votação do churrasco ===================

// Tela de espera do auto-cadastro (pending). Ver portão em renderInner.
function renderPendingScreen(currentPlayer) {
  return `
    <div class="login-screen">
      <img class="login-crest" src="./img/convocados-crest.png" alt="Escudo" style="width:140px;height:140px;object-fit:contain;background:transparent;border:none;box-shadow:none;">
      <section class="auth-card" style="text-align:center;">
        <h2 style="margin:0 0 8px;font-size:20px;color:var(--hfc-text,#e7eefb);">Cadastro enviado! 🎉</h2>
        <p class="footer-note" style="margin:0;">Olá, ${escapeHtml(currentPlayer?.name || '')}. Sua conta foi criada e está <strong>aguardando a aprovação do administrador</strong> do grupo. Assim que ele liberar, você entra automaticamente — pode fechar e voltar depois.</p>
        <div class="actions" style="margin-top:16px;">
          <button class="btn btn-secondary" type="button" id="pending-logout">Sair</button>
        </div>
      </section>
      <p class="login-legal">
        <a href="./privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>
        · <a href="./termos.html" target="_blank" rel="noopener">Termos de Uso</a>
      </p>
    </div>
  `;
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

  // Portão de aprovação: auto-cadastro entra pendente e NÃO acessa o grupo até
  // um admin aprovar. Vê só a tela de espera (com Sair), não o roster/jogos.
  if (currentPlayer.pending === true) {
    appElement.innerHTML = renderPendingScreen(currentPlayer);
    appElement.querySelector('#pending-logout')?.addEventListener('click', async () => { await logout(); });
    return;
  }

  const requestedTab = snapshot.ui.currentTab || 'home';
  const blockedTab = (requestedTab === 'config' && !canAccessConfig(currentPlayer))
    || (requestedTab === 'finance' && !canManageFinance(currentPlayer) && !isPro())
    // Módulo desligado no perfil do clube: a aba some da navegação, mas o
    // estado pode ter ficado apontando para ela (o admin desligou o módulo com
    // a aba aberta, ou o link veio de outro lugar).
    || (requestedTab === 'carne' && !isModuleOn(snapshot, 'churrasco'))
    || (requestedTab === 'championship' && !campeonatoDisponivel(snapshot).ok);
  const activeTab = blockedTab ? 'home' : requestedTab;
  ensureRatingsLoaded(); // carrega as notas (uma vez) p/ rankings + áurea em todo lugar
  if (activeTab === 'finance') {
    ensureFinancePublicLoaded(); // resumo publicado (admin vê status; membro vê o resumo)
    if (canManageFinance(currentPlayer)) ensureLedgerLoaded(); // livro-caixa (só admin lê)
  }
  if (activeTab !== requestedTab) {
    patchState({ ui: { currentTab: activeTab } });
    return;
  }

  appElement.innerHTML = `
    <div class="header">
      <div class="header-row">
        <div class="brand-lockup">
          <img class="brand-crest" src="./img/convocados-crest.png" alt="Escudo Convocados">
          <div>
            <div class="header-title">CONVOCADOS <span style='font-size:12px;opacity:0.7;'>${getDisplayVersion()}</span></div>
            <div class="header-subtitle">${authzIsAdmin(currentPlayer) ? 'Administrador' : getPlayerRole(currentPlayer) === 'carne' ? 'Grupo do churrasco' : 'Jogador'}</div>
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
      ${activeTab === 'finance' ? '' : `<div style="padding:10px;font-weight:bold;">
${confirmedCount} / ${maxPlayers} jogadores de linha confirmados
</div>`}
${renderTab(snapshot, activeTab, currentPlayer)}
    </main>

    ${renderBottomNav(activeTab, currentPlayer, snapshot)}
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

    const birthInput = registerForm.querySelector('#register-birthdate');
    birthInput?.addEventListener('input', syncRegisterMinorBlock);
    birthInput?.addEventListener('change', syncRegisterMinorBlock);
    syncRegisterMinorBlock();

    // Onboarding multi-tenant: alterna entre "Criar um clube" e "Entrar com código".
    const clubModeInput = registerForm.querySelector('#register-club-mode');
    const clubNameInput = registerForm.querySelector('#register-club-name');
    const inviteInput = registerForm.querySelector('#register-invite-code');
    const clubHint = registerForm.querySelector('#register-club-hint');
    const clubTabs = registerForm.querySelectorAll('[data-club-mode]');
    const setClubMode = (mode) => {
      const isCreate = mode !== 'join';
      if (clubModeInput) clubModeInput.value = isCreate ? 'create' : 'join';
      clubTabs.forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-club-mode') === (isCreate ? 'create' : 'join')));
      if (clubNameInput) clubNameInput.style.display = isCreate ? '' : 'none';
      if (inviteInput) inviteInput.style.display = isCreate ? 'none' : '';
      if (clubHint) clubHint.textContent = isCreate
        ? 'Você vira o administrador do clube.'
        : 'Peça o código ao administrador. Você entra como pendente até ele aprovar.';
    };
    clubTabs.forEach((b) => b.addEventListener('click', () => setClubMode(b.getAttribute('data-club-mode'))));
    setClubMode('join');   // entrar por código é o caso comum; criar clube é do admin

    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      if (!registerForm.querySelector('#register-consent')?.checked) {
        showToast('Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.', 'error');
        return;
      }
      // Menor de 18: exige consentimento do responsável legal (LGPD art. 14 / ECA).
      const idade = ageFromBirthDate(displayToIso(String(formData.get('birthDate') || '')));
      if (idade !== null && idade < 18) {
        const gName = String(formData.get('guardianName') || '').trim();
        const gPhone = String(formData.get('guardianPhone') || '').replace(/\D/g, '');
        if (!registerForm.querySelector('#register-guardian-consent')?.checked || !gName || gPhone.length < 10) {
          showToast('Cadastro de menor: informe o responsável legal (nome + telefone) e marque a autorização.', 'error');
          return;
        }
      }
      // Escolha do clube (criar vs entrar por código).
      const clubMode = String(formData.get('clubMode') || 'create') === 'join' ? 'join' : 'create';
      const clubName = String(formData.get('clubName') || '').trim();
      const inviteCode = String(formData.get('inviteCode') || '').trim().toUpperCase();
      if (clubMode === 'create' && clubName.length < 2) {
        showToast('Dê um nome ao seu clube.', 'error');
        return;
      }
      if (clubMode === 'join' && inviteCode.length < 4) {
        showToast('Informe o código do clube que você recebeu.', 'error');
        return;
      }
      const submitButton = registerForm.querySelector('button[type="submit"]');
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Criando...'; }
      const result = await register({
        name: formData.get('name'),
        phone: String(formData.get('phone') || '').replace(/\D/g, ''),
        birthDate: displayToIso(String(formData.get('birthDate') || '')),
        role: formData.get('role'),
        position: formData.get('position'),
        password: formData.get('password'),
        passwordConfirm: formData.get('passwordConfirm'),
        guardianName: formData.get('guardianName'),
        guardianPhone: formData.get('guardianPhone'),
        clubMode,
        clubName,
        inviteCode,
      });

      if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Criar cadastro'; }

      if (!result.ok) {
        patchState({
          ui: {
            authMode: 'register',
            authMessage: { type: 'error', text: result.message },
          },
        });
      } else if (result.inviteCode) {
        // Dono de clube recém-criado: mostra o código pra ele compartilhar.
        showToast(`Clube criado! Código de convite: ${result.inviteCode} — compartilhe com o pessoal.`, 'success');
      }
    });
  }
}


function ageFromBirthDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const md = now.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

// Mostra o bloco do responsável legal quando a data de nascimento indica <18.
function syncRegisterMinorBlock() {
  const block = document.getElementById('register-minor-block');
  if (!block) return;
  const age = ageFromBirthDate(displayToIso(document.getElementById('register-birthdate')?.value || ''));
  block.style.display = (age !== null && age < 18) ? '' : 'none';
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
      return 'Somente churrasco';
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
        ? 'Você está vinculado ao grupo do churrasco e não pode confirmar presença agora.'
        : currentPlayer?.role === 'carne'
          ? 'Perfis somente churrasco não participam da confirmação do jogo.'
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
      showHint('Você receberá os avisos do Convocados neste aparelho. Pode desativar aqui quando quiser.');
    } else {
      statusLine.textContent = 'Desativado';
      showButton('Ativar');
      // Admin recebe o motivo que mais lhe importa (aprovar quem pede para
      // entrar); os demais, o aviso de inscrições.
      const offHint = authzIsAdmin(currentPlayer)
        ? 'Receba um aviso quando alguém pedir para entrar no grupo e quando as inscrições abrirem.'
        : 'Receba um aviso quando as inscrições abrirem.';
      showHint(state.iosNeedsInstall ? 'No iPhone, ative com o app aberto pela Tela de Início.' : offHint);
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
  appElement.querySelector('#logout-button')?.addEventListener('click', async () => { selfProfileOpen = false; selfProfileEditOpen = false; selfDeleteOpen = false; selfPhotoPending = ''; resetCarneRotationDraft(); await logout(); });

  appElement.querySelector('#self-delete-confirm')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const password = document.getElementById('self-delete-password')?.value || '';
    setActionBusy(button, 'Excluindo...');
    const result = await deleteOwnAccount(password);
    clearActionBusy(button);
    if (!result.ok) {
      showToast(result.message || 'Não foi possível excluir a conta.', 'error');
      return;
    }
    // Sucesso: deleteOwnAccount já limpou a sessão e mudou p/ login; força o reset local.
    selfProfileOpen = false; selfProfileEditOpen = false; selfDeleteOpen = false; selfPhotoPending = '';
    showToast('Conta excluída.', 'success');
  });
  bindPushOptin(currentPlayer);
  bindCarneRotationDrag();
  appElement.querySelector('#carne-rotation-start')?.addEventListener('change', (event) => {
    const view = carneEditingView();
    view.start_date = displayToIso(event.target.value) || view.start_date;
    commitCarneRotation(view);
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


  // Máscara de moeda (baseada em centavos): digita só números, formata "1.234,56".
  appElement.querySelectorAll('input[data-mask="currency"]').forEach((el) => {
    el.addEventListener('input', () => {
      const digits = el.value.replace(/\D/g, '').slice(0, 12);
      el.value = digits ? (parseInt(digits, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    });
  });

  // TEMPORÁRIO (piloto): registra que o app foi aberto (throttle interno de 5min).
  logAppOpen(currentPlayer, APP_VERSION);

  const buttons = appElement.querySelectorAll('[data-tab]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const previousTab = getState().ui?.currentTab;
      const nextTab = button.dataset.tab;
      patchState({ ui: { currentTab: nextTab } });
      // Ao trocar de aba, volta ao topo (padrão de navegação web/SPA).
      if (previousTab !== nextTab) {
        window.scrollTo({ top: 0 });
        logTab(currentPlayer, nextTab); // TEMPORÁRIO (piloto)
      }
    });
  });

  appElement.querySelector('#confirm-btn')?.addEventListener('click', () => {
    const result = toggleConfirmation(currentPlayer.id);
    if (result?.ok) {
      if (result.message?.includes('cancelad')) logPresenceCancelled(currentPlayer);
      else if (result.message?.includes('confirmad')) logPresenceConfirmed(currentPlayer);
    }
    if (result?.message) showToast(result.message, result.ok ? 'success' : 'error');
    notifyWaitlistPromotion(result);
  });

  appElement.querySelector('#draw-teams-btn')?.addEventListener('click', async () => {
    // Garante que as notas estejam carregadas antes de sortear (senão o
    // balanceamento por nota cai no fallback neutro sem o admin perceber).
    if (isVotingEnabled()) { try { await loadRatingsCache(); } catch (_) { /* segue só por posição */ } }
    const result = drawTeams();
    if (result?.ok) logTeamDraw(currentPlayer, { players: result.sortResult?.total_players || null });
    showToast(result.message, result.ok ? 'success' : 'error');
  });

  appElement.querySelector('#clear-draw-btn')?.addEventListener('click', () => {
    const result = clearTeamDraw();
    showToast(result.message, result.ok ? 'success' : 'error');
  });

  appElement.querySelector('#share-draw-btn')?.addEventListener('click', () => {
    shareTeamDrawImage();
  });

  appElement.querySelector('#copy-payments-btn')?.addEventListener('click', () => {
    copyPaymentsToClipboard();
  });

  // Trocar o sorteio re-renderiza a tela, para que a DATA e as ESCALAÇÕES
  // acompanhem a escolha. Sem isto o admin podia escolher o sorteio de um jogo
  // e ver/lançar os dados de outro.
  appElement.querySelector('#championship-draw-id')?.addEventListener('change', (event) => {
    championshipDrawId = event.target.value || null;
    championshipLineup = null;   // sorteio novo, escalação recomeça do sorteio
    championshipResultCardOpen = true;
    render(getState());
  });

  // Abrir/fechar na mão manda no estado; sem isto o card reabriria sozinho no
  // próximo render depois de o admin tê-lo fechado.
  appElement.querySelector('.championship-result-card')?.addEventListener('toggle', (event) => {
    championshipResultCardOpen = !!event.target.open;
  });

  // Ajuste de quem jogou. Lê o estado ATUAL da tela inteira (todos os selects)
  // em vez de aplicar um delta: assim o estado nunca fica dessincronizado do
  // que o admin está vendo, mesmo com o re-render do poll no meio da edição.
  const capturarEscalacao = () => {
    const map = {};
    appElement.querySelectorAll('[data-lineup-player]').forEach((sel) => {
      map[sel.dataset.lineupPlayer] = sel.value;
    });
    return map;
  };
  appElement.querySelectorAll('[data-lineup-player]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const drawId = appElement.querySelector('#championship-draw-id')?.value || championshipDrawId;
      championshipLineup = { drawId, map: capturarEscalacao() };
      championshipResultCardOpen = true;
      render(getState());
    });
  });

  // Substituto: entra já no Time A (o caso comum é repor quem desistiu); o
  // admin troca para o Time B no próprio seletor da linha se for o caso.
  appElement.querySelector('#championship-add-to-lineup')?.addEventListener('change', (event) => {
    const playerId = event.target.value;
    if (!playerId) return;
    const drawId = appElement.querySelector('#championship-draw-id')?.value || championshipDrawId;
    championshipLineup = { drawId, map: { ...capturarEscalacao(), [playerId]: 'a' } };
    championshipResultCardOpen = true;
    render(getState());
  });

  wireSelfPixReceipt(appElement);

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

  appElement.querySelector('#add-guest-player-btn')?.addEventListener('click', () => {
    const input = document.getElementById('guest-player-name');
    const positionSel = document.getElementById('guest-player-position');
    const result = addGuestPlayer(input?.value || '', positionSel?.value || 'meia');
    if (result.ok && input) input.value = '';
    const safeSnapshot = repairManualSnapshot(getState());
    savePersistedState(safeSnapshot);
    render(safeSnapshot);
    showToast(result.message, result.ok ? 'success' : 'error');
  });

  appElement.querySelectorAll('[data-action="remove-guest-player"]').forEach((button) => {
    button.addEventListener('click', () => {
      const result = removeGuestPlayer(button.dataset.id);
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
      if (!existingGame.open && updatedGame.open && isNotifEnabled(getState(), 'inscricoes_abertas')) {
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

  const clubProfileForm = appElement.querySelector('#club-profile-form');
  if (clubProfileForm) {
    // Escolher um formato preenche os números na hora. Sem isto o seletor seria
    // decorativo: o admin escolheria "Futsal" e continuaria vendo 11 por time.
    clubProfileForm.querySelector('[name="format"]')?.addEventListener('change', (event) => {
      const preset = FORMATOS[event.target.value];
      if (!preset || preset.players_per_team == null) return;   // 'custom' não mexe
      const ppt = clubProfileForm.querySelector('[name="players_per_team"]');
      const gk = clubProfileForm.querySelector('[name="goalkeepers_per_game"]');
      if (ppt) ppt.value = preset.players_per_team;
      if (gk) gk.value = preset.goalkeepers_per_game;
    });

    clubProfileForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!requireAdmin(getState(), 'Apenas administrador pode configurar o clube')) return;
      // A montagem do perfil é pura e testada (perfilDoFormulario); aqui só
      // lemos o formulário e gravamos.
      const next = structuredClone(getState());
      next.profile = perfilDoFormulario(new FormData(clubProfileForm), getClubProfile(next));

      const safeSnapshot = repairManualSnapshot(next);
      replaceState(safeSnapshot);
      savePersistedState(safeSnapshot);
      render(safeSnapshot);
      showToast('Configuração do clube salva.');
    });
  }

  const mensalidadeForm = appElement.querySelector('#mensalidade-config-form');
  if (mensalidadeForm) {
    mensalidadeForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!requireAdmin(getState(), 'Apenas administrador pode alterar a mensalidade')) return;
      const formData = new FormData(mensalidadeForm);
      const mensExpireDate = displayToIso(String(formData.get('mens_expire_date') || ''));
      const rawMode = String(formData.get('mens_enforcement_mode') || '');
      const mensMode = [MENSALIDADE_MODES.PARTIAL, MENSALIDADE_MODES.TOTAL].includes(rawMode) ? rawMode : MENSALIDADE_MODES.NONE;
      const mensAmount = Math.max(0, Number(formData.get('mens_amount')) || 0);
      const mensBeneficiary = String(formData.get('mens_beneficiary') || '').trim();
      const goalkeepersPay = formData.get('goalkeepers_pay') === 'on';
      const next = structuredClone(getState());
      const oldExpireDate = String(next.settings?.mens_expire_date || '').slice(0, 10);
      next.settings = { ...(next.settings || {}), mens_expire_date: mensExpireDate, mens_enforcement_mode: mensMode, mens_amount: mensAmount, mens_beneficiary: mensBeneficiary, goalkeepers_pay: goalkeepersPay };
      // Nova data de vencimento = novo período de cobrança: zera mens_ok de todos.
      if (mensExpireDate && mensExpireDate !== oldExpireDate) {
        (next.players || []).forEach((p) => { p.mens_ok = false; });
      }
      // Aplica em massa: liga/desliga a cobrança em TODOS os goleiros atuais
      // (exceção individual continua possível pelo checkbox na edição do jogador).
      (next.players || []).forEach((p) => {
        const pos = String(p?.position || '').trim().toLowerCase();
        if (pos === 'gol' || pos === 'goleiro') p.gk_pays = goalkeepersPay;
      });
      // Aplica imediatamente a regra (no "total" pode remover inadimplentes e
      // promover a fila) e persiste/renderiza no padrão das demais ações admin.
      const safeSnapshot = repairManualSnapshot(next);
      replaceState(safeSnapshot);
      savePersistedState(safeSnapshot);
      render(safeSnapshot);
      const modeLabel = mensMode === MENSALIDADE_MODES.TOTAL ? 'Bloqueio total' : mensMode === MENSALIDADE_MODES.PARTIAL ? 'Bloqueio parcial' : 'Sem bloqueio';
      const resetMsg = (mensExpireDate && mensExpireDate !== oldExpireDate) ? ' Todos ficaram pendentes para o novo período.' : '';
      showToast(`Mensalidade salva. Regra: ${modeLabel}.${resetMsg}`);
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

  // Central de notificações: cada toggle auto-salva (replaceState = persiste no remoto).
  appElement.querySelectorAll('.notif-center-toggle').forEach((toggle) => {
    toggle.addEventListener('change', () => {
      if (!requireAdmin(getState(), 'Apenas administrador pode mudar notificações')) return;
      const key = toggle.dataset.notifKey;
      const next = structuredClone(getState());
      const notifications = { ...((next.settings && next.settings.notifications) || {}) };
      notifications[key] = toggle.checked;
      next.settings = { ...(next.settings || {}), notifications };
      replaceState(repairManualSnapshot(next));
      const label = (NOTIF_TYPES.find((t) => t.key === key) || {}).label || 'Aviso';
      showToast(`${label}: ${toggle.checked ? 'ligado' : 'desligado'}.`, 'success');
    });
  });

  // Biblioteca de uniformes: o botão dispara o file input; ao escolher a foto,
  // comprime (mesmo padrão do avatar) e grava em settings.uniforms.
  const uniformAddBtn = appElement.querySelector('#uniform-add-btn');
  const uniformFileInput = appElement.querySelector('#uniform-file');
  if (uniformAddBtn && uniformFileInput) {
    uniformAddBtn.addEventListener('click', () => {
      const name = (appElement.querySelector('#uniform-name')?.value || '').trim();
      if (!name) { showToast('Dê um nome ao uniforme antes de escolher a foto.', 'error'); return; }
      uniformFileInput.click();
    });
    uniformFileInput.addEventListener('change', async () => {
      const file = uniformFileInput.files && uniformFileInput.files[0];
      if (!file) return;
      if (!requireAdmin(getState(), 'Apenas administrador pode cadastrar uniforme')) return;
      const name = (appElement.querySelector('#uniform-name')?.value || '').trim() || 'Uniforme';
      uniformAddBtn.disabled = true;
      try {
        const dataUrl = await readAndResizePlayerPhoto(file, 420, 0.8);
        // Vai pro Storage (bucket público player-photos, como as fotos de
        // jogador) — guardamos só a URL, NÃO o base64 no blob (evita inchaço).
        const unifId = `unif_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const up = await uploadPlayerPhoto(dataUrl, unifId);
        if (!up.ok) { showToast('Não consegui subir a imagem do uniforme. Tente de novo.', 'error'); return; }
        const next = structuredClone(getState());
        const uniforms = Array.isArray(next.settings && next.settings.uniforms) ? next.settings.uniforms : [];
        uniforms.push({ id: unifId, name, photo: up.url });
        next.settings = { ...(next.settings || {}), uniforms };
        replaceState(repairManualSnapshot(next));
        showToast('Uniforme adicionado. 👕', 'success');
        render(getState());
      } catch (err) {
        showToast('Não consegui processar a imagem. Tente outra.', 'error');
      } finally {
        uniformAddBtn.disabled = false;
        uniformFileInput.value = '';
      }
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
  carne: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g transform="translate(6.9 0.4) scale(0.42)"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></g><path d="M16.5 21.5 8 11"/><path d="M8 11 5.4 9.8M8 11 6.4 9M8 11 7.4 8.2"/><path d="M7.5 21.5 16 11"/><path d="M16 11 18.2 8.4 16.7 12 Z"/></svg>',
  championship: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11"/><path d="M17 6h3v1.5A3.5 3.5 0 0 1 16.5 11"/><path d="M9 21h6"/><path d="M12 14v7"/></svg>',
  finance: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M21 12h-5a2 2 0 0 0 0 4h5a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z"/></svg>',
  config: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

function renderBottomNav(activeTab, currentPlayer, snapshot) {
  // Nem todo clube faz churrasco toda semana nem roda campeonato. O que o clube
  // não usa some da navegação em vez de virar uma aba vazia que ele precisa
  // aprender a ignorar. Clube sem perfil = tudo ligado, como sempre foi.
  const items = [
    ['home', 'Home'],
    ['weekly_game', 'Jogo da semana'],
    ['players', 'Jogadores'],
  ];
  if (isModuleOn(snapshot, 'churrasco')) items.push(['carne', 'Churrasco']);
  if (campeonatoDisponivel(snapshot).ok) items.push(['championship', 'Campeonato']);
  if (canManageFinance(currentPlayer) || isPro()) items.push(['finance', 'Financeiro']);
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
        // Carnê/rodízio é recurso Pro — clube Free vê o cadeado + upsell.
        if (!isPro()) return renderProLock({ title: 'Churrasco & rodízio de duplas', benefit: 'Organize o churrasco com rodízio automático de duplas, datado e sem confusão. Disponível no Pro.' });
        const carneRotation = carneEditingView();
        const carneDates = (carneRotation.pairs || []).map((_, i) => (carneRotation.start_date ? carneAddDays(carneRotation.start_date, i * 7) : ''));
        return renderCarneScreen(snapshot, currentPlayer, buildPlayersView(snapshot), editingPlayerId, carneRotation, carneDates, false, editingCarnePairIndex);
      }
    case 'championship':
      // Campeonato completo (Rei da Quadra + histórico) é Pro — Free vê o cadeado.
      if (!isPro()) return renderProLock({ title: 'Campeonato & Rei da Quadra', benefit: 'Lance resultados, acompanhe a classificação do Rei da Quadra e o histórico de campeões do grupo. Disponível no Pro.' });
      return renderChampionshipScreen(snapshot, currentPlayer, championshipDrawId, championshipLineup, championshipResultCardOpen);
    case 'finance':
      if (!isPro()) return renderProLock({ title: 'Controle financeiro', benefit: 'Livro-caixa do clube: mensalidade, despesas e demonstrativo — tudo num lugar só. Disponível no Pro.' });
      if (!canManageFinance(currentPlayer)) return renderPublicFinanceScreen(snapshot);
      return renderFinanceScreen(snapshot, currentPlayer, financeEffectiveYm());
    case 'config':
      return renderConfig(snapshot, currentPlayer);
    case 'home':
    default:
      return renderHome(snapshot, currentPlayer);
  }
}

// Card da Home: avisa o admin, sem depender de push, que há gente pedindo para
// entrar. Se o push ainda não foi ligado, empurra o admin a ligá-lo (o toggle
// "Avisos no celular" está logo abaixo nesta mesma tela).
function renderPendingApprovalsHomeCard(pendingApprovals) {
  const n = pendingApprovals.length;
  if (!n) return '';
  const names = pendingApprovals.slice(0, 3).map((p) => escapeHtml(p.name || 'Sem nome')).join(', ');
  const extra = n > 3 ? ` +${n - 3}` : '';
  return `
    <section class="home-v2-card home-v2-pending-card">
      <div class="home-v2-card-head">
        <div>
          <strong>Cadastros aguardando</strong>
          <span>${n === 1 ? 'Uma pessoa pediu' : `${n} pessoas pediram`} para entrar no grupo</span>
        </div>
        <span class="home-v2-pending-badge">${n}</span>
      </div>
      <p class="home-v2-pending-names">${names}${extra}</p>
      <button class="home-v2-primary home-v2-pending-cta" type="button" data-tab="players">Ver e aprovar</button>
      ${isPushOnboarded() ? '' : `
      <p class="home-v2-pending-nudge">🔔 Ligue os <strong>Avisos no celular</strong> nesta tela para ser avisado na hora que alguém pedir para entrar.</p>`}
    </section>
  `;
}

function renderHome(snapshot, currentPlayer) {
  const workingSnapshot = snapshot;
  const activePlayer = workingSnapshot.players.find((player) => String(player.id) === String(currentPlayer.id)) || currentPlayer;

  // Cadastros aguardando aprovação (auto-cadastro por código). Só o admin vê, e
  // só quando há alguém pendente — vira um card na Home para o pedido não ficar
  // escondido na aba Jogadores. Complementa o push disparado no register-player.
  const pendingApprovals = authzIsAdmin(activePlayer)
    ? workingSnapshot.players.filter((player) => player && player.pending === true)
    : [];

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
        message: `Dupla do churrasco (${formatDate(nextCarneEntry.date)}): ${playersByIdForCarneNotification.get(String(nextCarneEntry.player1_id))?.name || '-'}, ${playersByIdForCarneNotification.get(String(nextCarneEntry.player2_id))?.name || '-'}`,
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
  const homeGuestPlayers = Array.isArray(game && game.guest_players) ? game.guest_players : [];
  // Convidados ocupam vaga de linha → entram na contagem e nas vagas restantes.
  const homeLinePlayers = [...gameView.confirmed, ...homeGuestPlayers].sort(sortByName);
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
  const homeLineAvatars = homeLinePlayers.map((player) => renderAvatarForApp(player, 'home-v2-avatar')).join('');
  const homeGoalkeeperAvatars = [
    ...homeGoalkeepers.map((player) => renderAvatarForApp(player, 'home-v2-avatar')),
    ...homeRentalGoalkeepers.map((entry) => '<span class="home-v2-avatar home-v2-rental-goalie-avatar">🧤</span>')
  ].join('');
  const homeGoalkeeperNames = [
    ...homeGoalkeepers.map((player) => escapeHtml(player.name || '')),
    ...homeRentalGoalkeepers.map((entry) => escapeHtml(String(entry.name || '')) + ' (aluguel)')
  ].filter(Boolean).join(', ') || 'Nenhum goleiro confirmado';
  const homeNoticeItems = [
    carneNotification ? {
      icon: '🥩',
      title: 'Dupla do churrasco',
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
            <div class="home-v2-kicker">Hoje no Convocados</div>
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
            <strong>Convocados</strong>
            <span>${homeRemainingLine} vaga${homeRemainingLine === 1 ? '' : 's'} de linha</span>
          </div>
          <button class="home-v2-link" type="button" data-tab="weekly_game">Lista</button>
        </div>

        <div class="home-v2-confirmed-group">
          <div class="home-v2-confirmed-group-title">Linha (${homeLinePlayers.length})</div>
          <div class="home-v2-avatar-row">
            ${homeLineAvatars || '<span class="home-v2-empty">Nenhum jogador de linha confirmado.</span>'}
          </div>
        </div>

        <div class="home-v2-confirmed-group home-v2-confirmed-goalkeepers">
          <div class="home-v2-confirmed-group-title">🧤 Goleiros (${homeGoalkeeperCount}/2)</div>
          <div class="home-v2-avatar-row">
            ${homeGoalkeeperAvatars || '<span class="home-v2-empty">Nenhum goleiro confirmado.</span>'}
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

      ${renderPendingApprovalsHomeCard(pendingApprovals)}

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

      ${renderProfilePanel(activePlayer, game)}
    </section>
  `;
}

// Painel de perfil (abre pelo avatar do header). Modo VER por padrão; o botão
// "Editar cadastro" abre o formulário (renderSelfProfileEditCardForHome).
function renderProfilePanel(activePlayer, game) {
  if (!selfProfileOpen) return '';
  if (selfProfileEditOpen) return renderSelfProfileEditCardForHome(activePlayer);

  const carneOnly = activePlayer.plays_football === false;
  const roleLabel = authzIsAdmin(activePlayer)
    ? 'Administrador · ' + getPositionLabel(activePlayer.position)
    : (getPlayerRole(activePlayer) === 'carne' ? 'Somente churrasco' : getPositionLabel(activePlayer.position));

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
        ${carneOnly ? '' : `<div class="profile-view-row"><span>Mensalidade</span><strong class="tag ${isMensOkEffective(activePlayer, game) ? 'is-ok' : 'is-warn'}">${isMensOkEffective(activePlayer, game) ? 'Em dia' : 'Pendente'}</strong></div>`}
      </div>

      ${(!carneOnly && !isMensOkEffective(activePlayer, game)) ? `
        <div class="self-pix-block">
          ${activePlayer.mens_review ? `
            <p class="footer-note">📨 Comprovante enviado — aguardando o administrador confirmar.</p>
          ` : isPro() ? `
            <p class="footer-note">Pague o PIX e envie o comprovante: a confirmação é automática.</p>
            <button class="btn btn-primary self-pix-submit-btn" type="button" id="self-pix-btn">📷 Enviar comprovante PIX</button>
            <input id="self-pix-file" type="file" accept="image/*" hidden />
            <div id="self-pix-result" class="self-pix-result" hidden></div>
          ` : `
            <p class="footer-note">Pague o PIX e avise o administrador — ele confirma seu pagamento.</p>
          `}
        </div>
      ` : ''}

      <div class="profile-view-actions">
        <button class="btn btn-primary" type="button" data-action="toggle-self-profile-edit">Editar cadastro</button>
        ${isPasskeyEnabled() && passkeySupported() ? `<button class="btn btn-secondary" type="button" data-action="register-passkey">🔑 Ativar passkey neste aparelho</button>` : ''}
        <button class="btn btn-secondary" type="button" id="logout-button">Sair</button>
        <button class="btn btn-danger" type="button" data-action="toggle-self-delete">Excluir minha conta</button>
      </div>

      ${selfDeleteOpen ? `
        <div class="self-delete-zone" id="self-delete-zone">
          <p class="footer-note"><strong>Atenção: esta ação é permanente.</strong> Sua conta e seus dados pessoais (nome, telefone, foto) serão removidos e você não poderá mais entrar. Registros históricos do grupo (escalações, ranking) ficam anônimos.</p>
          <label class="form-label" for="self-delete-password">Confirme com sua senha</label>
          <input class="input" id="self-delete-password" type="password" autocomplete="current-password" placeholder="Sua senha" />
          <div class="self-delete-actions">
            <button class="btn btn-secondary" type="button" data-action="toggle-self-delete">Cancelar</button>
            <button class="btn btn-danger" type="button" id="self-delete-confirm">Excluir definitivamente</button>
          </div>
        </div>
      ` : ''}

      <p class="footer-note profile-legal">
        <a href="./privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>
        · <a href="./termos.html" target="_blank" rel="noopener">Termos de Uso</a>
      </p>
    </section>
  `;
}
function renderWeeklyGame(snapshot, currentPlayer) {
  const view = buildGameView(snapshot, currentPlayer?.id || null);
  const confirmed = isConfirmed(currentPlayer?.id);
  const activeGame = view.game || getActiveGameFromSnapshot(snapshot);
  const capacity = activeGame?.max_players || 8;
  // Convidados ocupam vaga de linha → entram na contagem e nas vagas restantes,
  // igual à lista de presença e à home.
  const guestCount = (Array.isArray(activeGame?.guest_players) ? activeGame.guest_players : []).length;
  const confirmedWithGuests = view.confirmedCount + guestCount;
  const remaining = Math.max(capacity - confirmedWithGuests, 0);
  const canAct = currentPlayer && currentPlayer.plays_football !== false;

  return `
    <section class="section-stack weekly-game-screen">
      <section class="weekly-summary-grid">
        <div class="weekly-game-card">
          <div class="hero-label">Próximo jogo</div>
          <div class="hero-date">${formatDate(activeGame?.game_date)}</div>
          <div class="hero-meta">${activeGame?.game_time || '--:--'} · ${activeGame?.open ? 'Inscrições abertas' : 'Inscrições fechadas'}</div>
          <div class="weekly-progress"><div style="width:${Math.min((confirmedWithGuests / capacity) * 100, 100)}%"></div></div>
          <div class="weekly-game-stats">
            <strong>${confirmedWithGuests} / ${capacity}</strong> confirmados
            <span>${remaining} vaga${remaining === 1 ? '' : 's'} restante${remaining === 1 ? '' : 's'}</span>
          </div>
        </div>
      </section>

      ${renderTeamDraw(snapshot, currentPlayer)}
      ${renderPresenceList(snapshot, currentPlayer)}
    </section>
  `;
}

function renderChampionship(snapshot, currentPlayer) {
  return renderChampionshipScreen(snapshot, currentPlayer, championshipDrawId, championshipLineup, championshipResultCardOpen);
}

function buildTeamDrawShareText(snapshot) {
  const sortResult = snapshot.game?.sort_result;
  if (!sortResult) return '';

  const playerById = new Map((snapshot.players || []).map((player) => [player.id, player]));
  const game = getActiveGameFromSnapshot(snapshot);
  // Mesma força combinada do selo (nota + campeonato), normalizada no conjunto sorteado.
  const drawnPlayers = timesDoSorteio(sortResult).flat()
    .map((entry) => (entry && typeof entry === 'object') ? entry : playerById.get(String(idDaEntrada(entry))))
    .filter(Boolean);
  const { strengthOf } = buildStrengthResolver(drawnPlayers, snapshot);
  const isTempEntry = (p) => !!(p && (p.temporary || p.guest || p.rental_goalkeeper));
  const teamStrengthText = (ids = []) => {
    const vals = ids
      .map((entry) => (entry && typeof entry === 'object') ? entry : playerById.get(entry))
      .filter((p) => p && !isTempEntry(p))
      .map((p) => strengthOf(p));
    if (!vals.length) return '';
    return ` (força ${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)})`;
  };
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

    return [`${label}${teamStrengthText(ids)}:`, ...lines].join('\n');
  };

  return [
    '⚽ Times do Convocados',
    `Jogo: ${formatDate(game.game_date)} às ${game.game_time || '--:--'}`,
    '',
    ...timesDoSorteio(sortResult).flatMap((time, i) => [formatTeam(`Time ${rotuloDoTime(i)}`, time), '']),
    '— via Convocados · convocados.app.br',
  ].join('\n');
}

// Mostra a imagem gerada e devolve `true` se o admin confirmou o envio.
// Vive fora do #app (como os outros modais), então o re-render do poll não a
// apaga no meio da conferência.
function mostrarPreviaEscalacao(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal-overlay escalacao-previa-overlay';
    overlay.innerHTML = `
      <div class="confirm-modal escalacao-previa" role="dialog" aria-modal="true" aria-label="Prévia da escalação">
        <div class="confirm-modal-title">Confira antes de enviar</div>
        <img class="escalacao-previa-img" src="${url}" alt="Prévia da escalação" />
        <div class="confirm-modal-actions">
          <button type="button" class="btn btn-secondary" data-previa="cancelar">Voltar e ajustar</button>
          <button type="button" class="btn btn-primary" data-previa="enviar">Compartilhar</button>
        </div>
      </div>`;

    const fechar = (enviou) => {
      document.removeEventListener('keydown', aoTeclar);
      URL.revokeObjectURL(url);   // sem isto o PNG fica preso na memória a cada prévia
      overlay.remove();
      resolve(enviou);
    };
    const aoTeclar = (e) => { if (e.key === 'Escape') fechar(false); };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) return fechar(false);
      const botao = e.target.closest('[data-previa]');
      if (botao) fechar(botao.dataset.previa === 'enviar');
    });

    document.addEventListener('keydown', aoTeclar);
    document.body.appendChild(overlay);
  });
}

async function shareTeamDrawImage() {
  const snapshot = getState();
  if (!snapshot?.game?.sort_result) {
    showToast('Nenhum sorteio disponível para compartilhar.', 'error');
    return;
  }

  showToast('Gerando a imagem…');
  let blob = null;
  try {
    const { gerarImagemEscalacao } = await import('../modules/game/lineup-image.js');
    blob = await gerarImagemEscalacao(snapshot, { titulo: 'ESCALAÇÃO' });
  } catch (error) {
    console.error('[escalacao] falha ao gerar imagem', error);
  }
  if (!blob) {
    showToast('Não consegui gerar a imagem da escalação.', 'error');
    return;
  }

  const nomeArquivo = `times-${String(snapshot?.game?.game_date || 'jogo')}.png`;
  const file = new File([blob], nomeArquivo, { type: 'image/png' });

  // PREVIEW ANTES DE ENVIAR. A imagem é o que vai para o grupo e não dá para
  // "editar depois" — se saiu com alguém no time errado, o estrago já está no
  // WhatsApp. Ver antes é barato e evita o reenvio constrangedor.
  const enviar = await mostrarPreviaEscalacao(blob);
  if (!enviar) return;

  // Celular: abre a folha de compartilhamento (WhatsApp direto).
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;   // cancelar também cai aqui: nada a avisar
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;   // usuário cancelou
    console.warn('[escalacao] share indisponível, baixando', error);
  }

  // Desktop / navegador sem Web Share de arquivo: baixa o PNG.
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Imagem da escalação baixada.');
  } catch (error) {
    console.error(error);
    showToast('Não foi possível compartilhar a imagem.', 'error');
  }
}
function buildPaymentsShareText(snapshot) {
  const players = (snapshot.players || [])
    .filter((player) => player && player.plays_football !== false && player.role !== 'carne')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  const due = String(snapshot.settings?.mens_expire_date || '').slice(0, 10);
  const sharePeriodGame = { mens_expire_date: due };
  const unpaid = players.filter((player) => !isMensOkEffective(player, sharePeriodGame));
  const paid = players.filter((player) => isMensOkEffective(player, sharePeriodGame));
  const list = (arr) => (arr.length ? arr.map((player, index) => `${index + 1}. ${player.name}`).join('\n') : '—');

  return [
    '💰 Mensalidade Convocados',
    due ? `Vencimento: ${formatDate(due)}` : 'Vencimento: não definido',
    '',
    `❌ Pendentes (${unpaid.length}):`,
    list(unpaid),
    '',
    `✅ Pagos (${paid.length}):`,
    list(paid),
    '',
    '— via Convocados · convocados.app.br',
  ].join('\n');
}

async function copyPaymentsToClipboard() {
  // Lista de adimplentes/inadimplentes é dado financeiro: só admin copia.
  if (!authzIsAdmin(getCurrentPlayer())) {
    showToast('Apenas administrador pode copiar a lista de pagamentos.', 'error');
    return;
  }
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

// Teto de resolução do comprovante enviado à leitura por IA. 1568 é o mesmo
// limite que a Anthropic aplica internamente: acima disso a imagem é reduzida
// do lado dela, então enviar maior só gasta banda e tempo.
const PIX_RECEIPT_MAX_SIZE = 1568;
const PIX_RECEIPT_QUALITY = 0.85;   // comprovante é texto: qualidade acima da foto de avatar

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const PIX_ERROR_MESSAGES = {
  not_configured: 'Pagamento por PIX indisponível neste ambiente.',
  not_logged_in: 'Faça login novamente para enviar o comprovante.',
  bad_image: 'Não consegui ler o arquivo de imagem.',
  api_key_not_configured: 'A leitura por IA ainda não está ativada (falta configuração no servidor).',
  service_role_not_configured: 'Recurso ainda não configurado no servidor.',
  unauthorized: 'Sessão inválida — faça login novamente.',
  unsupported_media_type: 'Formato não suportado. Envie um print em JPG ou PNG.',
  image_too_large: 'Imagem muito grande. Tente um print menor.',
  config_missing: 'O administrador ainda não configurou o valor e o beneficiário da mensalidade.',
  player_not_found: 'Seu cadastro não foi encontrado. Avise o administrador.',
  vision_failed: 'Não consegui ler o comprovante. Tente um print mais nítido.',
  vision_unavailable: 'O leitor de comprovantes está instável no momento. Tente de novo em instantes.',
  too_many_attempts: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.',
  persist_failed: 'Falha ao salvar. Tente de novo em instantes.',
  network: 'Falha de rede ao enviar o comprovante.',
};

// Motivos de recusa (result:'rejected') — mensagens para o jogador.
const PIX_REJECT_MESSAGES = {
  not_receipt: 'A imagem não parece um comprovante de pagamento. Envie o print do PIX.',
  beneficiary_mismatch: 'O beneficiário do comprovante não confere com o do clube. Confira para quem você pagou.',
  amount_mismatch: 'O valor do comprovante não bate com o valor da mensalidade.',
  date_not_current_month: 'O comprovante não é deste mês. Envie o pagamento do mês corrente.',
  duplicate_e2e: 'Este comprovante já foi usado antes.',
};

function renderPixSubmitResult(container, res) {
  let html;
  if (!res.ok) {
    const msg = PIX_ERROR_MESSAGES[res.reason] || 'Não foi possível enviar o comprovante.';
    html = `<p class="footer-note">${escapeHtml(msg)}</p>`;
  } else if (res.result === 'marked') {
    html = `<p class="pix-ok">✅ Pagamento confirmado! Sua mensalidade está em dia.</p>`;
  } else if (res.result === 'review') {
    html = `<p class="footer-note">📨 Recebido! Não consegui ler o identificador da transação no print, então o administrador vai revisar e confirmar. Você não precisa fazer mais nada.</p>`;
  } else {
    const msg = PIX_REJECT_MESSAGES[res.reason] || 'Não consegui validar o comprovante.';
    html = `<p class="footer-note">⚠️ ${escapeHtml(msg)}</p>`;
  }
  container.innerHTML = `<div class="pix-receipt-card">${html}</div>`;
  container.hidden = false;
}

// Jogador envia o próprio comprovante. Servidor valida e grava (ou marca p/ revisão).
function wireSelfPixReceipt(appElement) {
  const btn = appElement.querySelector('#self-pix-btn');
  const fileInput = appElement.querySelector('#self-pix-file');
  const result = appElement.querySelector('#self-pix-result');
  if (!btn || !fileInput || !result) return;

  btn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;

    btn.disabled = true;
    result.hidden = false;
    result.innerHTML = '<div class="pix-receipt-card"><p class="footer-note">Enviando e lendo o comprovante…</p></div>';

    let dataUrl;
    try {
      // Comprime ANTES de enviar. A foto vinha crua do celular (3–8 MB, +33% em
      // base64) e era reenviada inteira à API de visão — a Anthropic reduz
      // qualquer imagem para no máximo 1568px de lado antes de ler, então tudo
      // acima disso era tráfego jogado fora, sem ganho de precisão.
      // Best-effort: se a compressão falhar (formato exótico, canvas indisponível),
      // manda a original. Este é o caminho pelo qual as pessoas PAGAM — ele não
      // pode quebrar por causa de uma otimização.
      try {
        dataUrl = await readAndResizePlayerPhoto(file, PIX_RECEIPT_MAX_SIZE, PIX_RECEIPT_QUALITY);
      } catch (_erroCompressao) {
        dataUrl = null;
      }
      if (!dataUrl) dataUrl = await readFileAsDataUrl(file);
    } catch (_) {
      result.innerHTML = '<div class="pix-receipt-card"><p class="footer-note">Não consegui abrir a imagem.</p></div>';
      btn.disabled = false;
      return;
    }

    const res = await submitPixReceipt(dataUrl);
    renderPixSubmitResult(result, res);
    btn.disabled = false;

    // Marcou pago ou caiu p/ revisão → recarrega do servidor (re-renderiza e
    // some o painel inline); o toast garante o feedback após o re-render.
    if (res.ok && res.result === 'marked') {
      showToast('Pagamento confirmado! Mensalidade em dia.', 'success');
      await reloadRemoteStateAfterCriticalOperation(getState());
    } else if (res.ok && res.result === 'review') {
      showToast('Comprovante recebido. O administrador vai revisar.', 'success');
      await reloadRemoteStateAfterCriticalOperation(getState());
    } else if (!res.ok) {
      // Falha (leitor instável, rede, config…): antes ficava só na nota inline,
      // fácil de não ver. Toast garante o feedback (motivo acionável).
      showToast(PIX_ERROR_MESSAGES[res.reason] || 'Não foi possível enviar o comprovante.', 'error');
    } else if (res.result === 'rejected') {
      showToast(PIX_REJECT_MESSAGES[res.reason] || 'Não consegui validar o comprovante.', 'error');
    }
  });
}

function renderPresenceList(snapshot, currentPlayer) {
  const adminMode = canManagePresenceAuthz(currentPlayer);
  const game = getActiveGameFromSnapshot(snapshot);
  const gameKey = getGameKey(game);
  const confirmedIds = new Set(
    (snapshot.confirmations || [])
      .filter((entry) => isConfirmedEntry(entry))
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
  const goalkeeperPlayers = confirmedFootballPlayers.filter(isGoalkeeperPlayer).slice(0, 2);
  const confirmedPlayers = confirmedFootballPlayers.filter((player) => !isGoalkeeperPlayer(player));
  const rentalGoalkeepers = getActiveRentalGoalkeepersForApp(snapshot);
  const totalGoalkeepers = goalkeeperPlayers.length + rentalGoalkeepers.length;
  const guestPlayers = getActiveGuestPlayersForApp(snapshot);
  const lineMax = Number(game?.max_players || 0);
  const lineUsed = confirmedPlayers.length + guestPlayers.length;
  const lineFull = lineMax > 0 && lineUsed >= lineMax;
  const waitlistPlayers = waitlistEntries.map((entry) => entry.player).filter(Boolean);
  const pendingPlayers = footballPlayers.filter((player) => !confirmedIds.has(String(player.id)) && !waitlistedIds.has(String(player.id)));
  const pendingGoalkeepers = pendingPlayers.filter(isGoalkeeperPlayer);
  const pendingLinePlayers = pendingPlayers.filter((player) => !isGoalkeeperPlayer(player));

  const renderWeeklyRow = (player, confirmed = false) => `
    <div class="weekly-player-row">
      <div class="players-switch-player">
        ${renderAvatarForApp(player)}
        <div>
          <div class="row-title">${escapeHtml(player.name)}</div>
          <div class="row-subtitle">${getPositionLabel(player.position)} · ${formatPhone(player.phone)}</div>
        </div>
      </div>
      <div class="weekly-player-meta">
        <span class="tag ${isMensOkEffective(player, game) ? 'is-ok' : 'is-warn'}">${isMensOkEffective(player, game) ? 'Pago' : 'Pendente'}</span>
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
          <div class="row-title">🧤 ${escapeHtml(player.name)}</div>
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

  const renderPendingGoalkeeperRow = (player) => `
    <div class="weekly-player-row goalkeeper-player-row">
      <div class="players-switch-player">
        ${renderAvatarForApp(player)}
        <div>
          <div class="row-title">${escapeHtml(player.name)}</div>
          <div class="row-subtitle">Goleiro · ${formatPhone(player.phone)}</div>
        </div>
      </div>
      <div class="weekly-player-meta">
        ${adminMode ? `
          <button
            class="switch-control switch-control-inline is-off"
            type="button"
            data-action="admin-add-to-game"
            data-id="${player.id}"
            aria-pressed="false"
            title="Incluir goleiro no jogo"
          >
            <span class="switch-track"><span class="switch-thumb"></span></span>
            <span class="switch-label is-neutral">Fora</span>
          </button>
        ` : '<span class="tag is-neutral">Fora</span>'}
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

  const renderGuestRow = (entry) => `
    <div class="weekly-player-row guest-player-row">
      <div class="players-switch-player">
        <div class="avatar guest-avatar">👤</div>
        <div>
          <div class="row-title">${escapeHtml(entry.name)}</div>
          <div class="row-subtitle">Convidado${entry.position ? ' · ' + escapeHtml(getPositionLabel(entry.position)) : ''} · temporário deste jogo</div>
        </div>
      </div>
      <div class="weekly-player-meta">
        <span class="tag is-warn">Convidado</span>
        ${adminMode ? `<button class="btn btn-secondary btn-sm" type="button" data-action="remove-guest-player" data-id="${escapeHtml(entry.id)}">Remover</button>` : ''}
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
            ${pendingGoalkeepers.map(renderPendingGoalkeeperRow).join('')}
          </div>
        ` : ''}
      </div>

      <div class="weekly-presence-section">
        <div class="weekly-presence-title">Convocados na linha (${confirmedPlayers.length})</div>
        <div class="weekly-presence-stack">
          ${confirmedPlayers.length
            ? confirmedPlayers.map((player) => renderWeeklyRow(player, true)).join('')
            : '<div class="empty-inline">Nenhum jogador de linha confirmado ainda.</div>'}
        </div>
        <div class="weekly-copy-presence-actions">
          <button class="btn btn-secondary btn-sm" type="button" id="copy-confirmed-btn">Copiar presença para WhatsApp</button>
        </div>
      </div>

      <div class="weekly-presence-section guest-section">
        <div class="weekly-presence-title">👤 Convidados (${guestPlayers.length})${lineMax ? ` · linha ${lineUsed}/${lineMax}` : ''}</div>
        <div class="weekly-presence-stack">
          ${guestPlayers.length
            ? guestPlayers.map(renderGuestRow).join('')
            : '<div class="empty-inline">Nenhum convidado adicionado.</div>'}
        </div>
        ${adminMode ? (lineFull
          ? `<p class="footer-note">Linha completa (${lineUsed}/${lineMax}). ${guestPlayers.length ? 'O(s) convidado(s) acima já está(ão) dentro. ' : ''}Para adicionar outro, remova um jogador ou convidado.</p>`
          : `<div class="rental-goalkeeper-form">
              <input id="guest-player-name" class="input" type="text" placeholder="Nome do convidado" />
              <select id="guest-player-position" class="input" aria-label="Posição do convidado">
                <option value="meia">Meia</option>
                <option value="zag">Zagueiro</option>
                <option value="atk">Atacante</option>
                <option value="gol">Goleiro</option>
              </select>
              <button id="add-guest-player-btn" class="btn btn-secondary" type="button">Adicionar convidado</button>
            </div>`) : ''}
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
                    <div class="row-title">#${index + 1} · ${escapeHtml(player.name)}</div>
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

  // Uniformes: biblioteca do clube (settings) + o que cada time usa neste sorteio.
  const uniformLib = Array.isArray(snapshot.settings?.uniforms) ? snapshot.settings.uniforms : [];
  const assignedUniforms = Array.isArray(sortResult?.uniforms) ? sortResult.uniforms : [];

  const getEntryId = (entry) => (entry && typeof entry === 'object') ? entry.id : entry;
  const sortEntryIds = sortResult
    ? new Set(timesDoSorteio(sortResult).flat().map((entry) => String(getEntryId(entry))))
    : new Set();

  const confirmedIds = new Set(
    (snapshot.confirmations || [])
      .filter((entry) => isConfirmedEntry(entry))
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

  const guestPlayersOutsideDraw = (Array.isArray(game?.guest_players) ? game.guest_players : [])
    .filter((entry) => !sortEntryIds.has(String(entry.id)))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      position: 'meia',
      guest: true,
    }));

  const outsideDraw = [...confirmedPlayersOutsideDraw, ...rentalGoalkeepersOutsideDraw, ...guestPlayersOutsideDraw];

  if (!sortResult) {
    return `
      <section class="card">
        <div class="card-title">Sorteio de times</div>
        <div class="info-block">
          <div class="info-line">• Confirmados disponíveis: ${confirmedCount}</div>
          <div class="info-line">• Equilibra os times pelas notas de desempenho, mantendo as posições divididas.</div>
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

  // Força do time = índice combinado (nota de desempenho + pontuação no
  // campeonato), na MESMA base usada no sorteio (normalizado dentro do conjunto
  // sorteado). Convidados/goleiros de aluguel ficam de fora da média do selo.
  const drawnPlayers = timesDoSorteio(sortResult).flat()
    .map((entry) => (entry && typeof entry === 'object') ? entry : playerById.get(String(getEntryId(entry))))
    .filter(Boolean);
  const { strengthOf } = buildStrengthResolver(drawnPlayers, snapshot);
  const isTempEntry = (p) => !!(p && (p.temporary || p.guest || p.rental_goalkeeper));
  const teamStrength = (entries = []) => {
    const vals = (entries || [])
      .map((entry) => (entry && typeof entry === 'object') ? entry : playerById.get(String(getEntryId(entry))))
      .filter((p) => p && !isTempEntry(p))
      .map((p) => strengthOf(p));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const totalTimes = timesDoSorteio(sortResult).length;
  // Com 2 times, mover = "mandar para o outro". Com 3+, o botão manda para o
  // PRÓXIMO e dá a volta — por isso o rótulo é calculado, não fixo.
  const renderTeam = (title, entries, teamKey) => `
    <div class="team-draw-box">
      <div class="team-draw-title">${title}${(() => { const s = teamStrength(entries); return s !== null ? `<button type="button" class="team-strength-badge" data-action="open-strength-info" aria-label="O que é a força do time?">⚡ ${s.toFixed(1)} <span class="team-strength-info">ⓘ</span></button>` : ''; })()}</div>
      ${isAdmin && uniformLib.length ? (() => {
        const idx = typeof teamKey === 'number' ? teamKey : (teamKey === 'team_b' ? 1 : 0);
        const atual = String(assignedUniforms[idx] || '');
        return `<select class="input team-uniform-select" data-action="set-team-uniform" data-team="${idx}" aria-label="Uniforme do ${escapeHtml(title)}">
          <option value="">👕 Uniforme…</option>
          ${uniformLib.map((u) => `<option value="${escapeHtml(String(u.id))}" ${atual === String(u.id) ? 'selected' : ''}>${escapeHtml(u.name || 'Uniforme')}</option>`).join('')}
        </select>`;
      })() : ''}
      <div class="placeholder-list">
        ${sortDrawEntriesForDisplay(entries || [], playerById).map((entry) => {
          const { id, player } = resolveDrawEntry(entry);
          const indiceAtual = typeof teamKey === 'number' ? teamKey : (teamKey === 'team_b' ? 1 : 0);
          const targetLabel = `Time ${rotuloDoTime((indiceAtual + 1) % Math.max(2, totalTimes))}`;
          return `
            <div class="placeholder-row team-draw-player-row">
              <div class="placeholder-main team-draw-player-main">
                ${renderAvatarForApp(player)}
                <div class="team-draw-player-text">
                  <div class="row-title">${player?.guest ? '👤 ' : ((player?.rental_goalkeeper || ['gol','goleiro'].includes(String(player?.position || '').toLowerCase())) ? '🧤 ' : '')}${escapeHtml(player?.name || 'Jogador removido')}</div>
                  <div class="row-subtitle">${player?.guest ? 'Convidado' : getPositionLabel(player?.position)}</div>
                </div>
              </div>
              ${isAdmin && id && player ? `
                <button
                  class="team-inline-move-button"
                  type="button"
                  data-action="move-drawn-player"
                  data-player-id="${id}"
                  data-from-team="${teamKey}"
                  aria-label="Mover ${escapeHtml(player.name || 'jogador')} para ${targetLabel}"
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
      </div>
      <div class="team-draw-grid">
        ${timesDoSorteio(sortResult).map((time, i) => renderTeam(`Time ${rotuloDoTime(i)}`, time, i)).join('')}
      </div>

      ${isAdmin && outsideDraw.length ? `
        <div class="draw-outside-panel">
          <div class="weekly-presence-title">Confirmados fora do sorteio</div>
          <div class="weekly-presence-stack">
            ${outsideDraw.map((player) => `
              <div class="weekly-player-row draw-outside-row">
                <div class="players-switch-player">
                  ${player.rental_goalkeeper ? `<div class="avatar rental-goalkeeper-avatar">🧤</div>` : (player.guest ? `<div class="avatar guest-avatar">👤</div>` : renderAvatarForApp(player))}
                  <div>
                    <div class="row-title">${escapeHtml(player.name)}</div>
                    <div class="row-subtitle">${player.rental_goalkeeper ? 'Goleiro de aluguel' : (player.guest ? 'Convidado' : getPositionLabel(player.position))}</div>
                  </div>
                </div>
                <div class="weekly-player-meta draw-add-actions">
                  ${timesDoSorteio(sortResult).map((_t, i) => `<button class="btn btn-secondary btn-sm" type="button" data-action="add-player-to-draw" data-player-id="${player.id}" data-team="${i}">Time ${rotuloDoTime(i)}</button>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${canManagePresenceAuthz(currentPlayer) ? `
        <div class="actions" style="margin-top:12px;">
          <button class="btn btn-secondary" type="button" id="share-draw-btn">📸 Compartilhar escalação</button>
          <button class="btn btn-secondary" type="button" id="clear-draw-btn">Limpar sorteio</button>
          <button class="btn btn-primary" type="button" id="draw-teams-btn">Sortear novamente</button>
        </div>
      ` : ''}
    </section>
  `;
}

// Central de notificações: tipos controláveis e leitura do flag (default LIGADO).
const NOTIF_TYPES = [
  { key: 'inscricoes_abertas', label: 'Inscrições abertas', desc: 'Quando um jogo abre para confirmação (manual ou automático). Para todos.' },
  { key: 'mensalidade_atrasada', label: 'Mensalidade atrasada', desc: 'Aviso diário (7h) para quem está em atraso.' },
  { key: 'fila_promovido', label: 'Entrou pela fila', desc: 'Quando alguém sai da fila de espera e é confirmado. Só para ele.' },
  { key: 'votacao_desempenho', label: 'Votação de desempenho', desc: 'Quando abre a votação das notas (1h após o jogo). Para quem jogou.' },
  { key: 'votacao_churrasco', label: 'Votação do churrasco', desc: 'Quando abre a votação da dupla do churrasco (23h do dia do jogo). Para todos.' },
];
function isNotifEnabled(snapshot, key) {
  const n = snapshot?.settings?.notifications;
  if (!n || typeof n !== 'object' || !(key in n)) return true; // ausente = ligado
  return n[key] !== false;
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
  const perfil = getClubProfile(snapshot);   // costumes deste clube (ver domain/club-profile.js)
  // Data já preenchida a partir da cadência: o clube que joga toda quarta não
  // precisa digitar a data toda semana. Vazio se o clube é 'avulso' — quem marca
  // jogo sem regra fixa digita mesmo.
  const proximaDataSugerida = proximaDataDeJogo(snapshot, new Date());
  const games = getCurrentGames(snapshot);
  // Lista enxuta: mostra futuros + o ativo + o último passado; os passados mais
  // antigos vão para um expander "Ver jogos anteriores". É SÓ exibição — nada é
  // apagado (cada jogo mantém game_key p/ presenças, notas e churrasco).
  const activeKeyForList = String(getGameKey(game));
  const isOldPast = (g) => String(g.game_date || '') < carneTodayIso() && String(getGameKey(g)) !== activeKeyForList;
  const byGameDate = (a, b) => String(a.game_date || '').localeCompare(String(b.game_date || '')) || String(a.game_time || '').localeCompare(String(b.game_time || ''));
  const pastGamesForList = games.filter(isOldPast).sort(byGameDate);
  const lastPastGame = pastGamesForList.length ? pastGamesForList[pastGamesForList.length - 1] : null;
  const olderPastGames = lastPastGame ? pastGamesForList.slice(0, -1) : [];
  const shownGames = [...games.filter((g) => !isOldPast(g)), ...(lastPastGame ? [lastPastGame] : [])].sort(byGameDate);
  const maxPlayers = Number(game.max_players || game.maxPlayers || 10);
  // Fallback vem do PERFIL (jogadores por time x nº de times), não de um 10
  // fixo: clube de futsal não deveria ver 10 sugerido.
  const defaultNewGameMaxPlayers = maxPlayers || limiteSugeridoDeJogo(snapshot);
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
            <button class="btn btn-danger" type="button" data-action="delete-game" data-id="${key}">Excluir jogo</button>
          </div>
        </form>
      </details>
    `;
  };

  const clubInfo = getClubInfo();
  const inviteCard = clubInfo?.inviteCode ? `
      <section class="card">
        <div class="card-title">Convite do clube</div>
        <p class="footer-note">Compartilhe este código com quem for entrar${clubInfo.name ? ` no <strong>${escapeHtml(clubInfo.name)}</strong>` : ''}. Novos membros entram pendentes até você aprovar.</p>
        <div class="invite-code-row">
          <code class="invite-code">${escapeHtml(clubInfo.inviteCode)}</code>
          <button class="btn btn-secondary btn-sm" type="button" data-action="copy-invite-code" data-code="${escapeHtml(clubInfo.inviteCode)}">Copiar</button>
        </div>
      </section>
  ` : '';

  return `
    <section class="section-stack">
      ${inviteCard}
      <section class="card games-config-card">
        <div class="card-title">Jogos</div>

        ${olderPastGames.length ? `
          <details class="champ-collapse game-old-list">
            <summary class="champ-collapse-summary">
              <span class="card-subtitle">Ver jogos anteriores · ${olderPastGames.length}</span>
              <span class="champ-collapse-chevron" aria-hidden="true"></span>
            </summary>
            <div class="champ-collapse-body games-list-config">
              ${olderPastGames.map(renderGameEditForm).join('')}
            </div>
          </details>
        ` : ''}

        <div class="games-list-config">
          ${shownGames.map(renderGameEditForm).join('')}
        </div>

        <details class="create-game-details games-create-inline">
          <summary class="create-game-summary">
            <span><strong>Novo jogo</strong></span>
            <span class="btn btn-secondary btn-sm create-game-open-indicator">Criar novo jogo</span>
          </summary>

          <form id="create-game-form" class="player-admin-form game-config-form create-game-form">
            <label class="field-label">
              Data do novo jogo
              <input class="input" type="date" name="game_date" value="${proximaDataSugerida}" />
            </label>

            <label class="field-label">
              Hora do novo jogo
              <input class="input" type="time" name="game_time" value="${game.game_time || horarioPadraoDeJogo(snapshot)}" />
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

      <section class="card uniforms-config-card">
        <div class="card-title">👕 Uniformes do clube</div>
        <p class="footer-note">Cadastre as fotos dos uniformes (pode ser o kit inteiro — recorto a camisa). No sorteio você escolhe qual time usa qual, e o selo aparece na imagem da escalação pro WhatsApp.</p>
        <div class="uniforms-list">
          ${(Array.isArray(snapshot.settings?.uniforms) ? snapshot.settings.uniforms : []).map((u) => `
            <div class="uniform-item">
              <img class="uniform-thumb" src="${escapeHtml(u.photo || '')}" alt="${escapeHtml(u.name || '')}" />
              <span class="uniform-name">${escapeHtml(u.name || 'Uniforme')}</span>
              <button class="btn btn-secondary btn-sm" type="button" data-action="remove-uniform" data-id="${escapeHtml(String(u.id))}">Remover</button>
            </div>
          `).join('') || '<div class="empty-inline">Nenhum uniforme cadastrado ainda.</div>'}
        </div>
        <div class="uniform-add-form">
          <input id="uniform-name" class="input" type="text" placeholder="Nome (ex: Preto, Listrado)" maxlength="24" />
          <input id="uniform-file" type="file" accept="image/*" hidden />
          <button class="btn btn-secondary" type="button" id="uniform-add-btn">📷 Foto + adicionar</button>
        </div>
      </section>

      <section class="card club-profile-card">
        <div class="card-title">Como o clube joga</div>
        <p class="footer-note">O app nasceu com os costumes de um clube só. Aqui você diz os do seu: o que não usar some da navegação, e a pontuação do campeonato deixa de ser fixa.</p>
        <form id="club-profile-form" class="player-admin-form game-config-form">
          <label class="form-group">
            <span class="form-label">Formato do jogo</span>
            <select name="format" class="input">
              ${Object.entries(FORMATOS)
                .map(([v, f]) => `<option value="${v}" ${perfil.game.format === v ? 'selected' : ''}>${f.label}</option>`).join('')}
            </select>
            <small class="footer-note">Escolher um formato preenche os números abaixo. "Outro" mantém o que você digitar.</small>
          </label>

          <div class="form-group">
            <span class="form-label">Tamanho do jogo</span>
            <div class="club-profile-points">
              <label><small>Times no sorteio</small><input type="number" name="teams" class="input" min="2" max="6" value="${perfil.game.teams}" /></label>
              <label><small>Jogadores por time</small><input type="number" name="players_per_team" class="input" min="1" max="30" value="${perfil.game.players_per_team}" /></label>
              <label><small>Goleiros no jogo</small><input type="number" name="goalkeepers_per_game" class="input" min="0" max="4" value="${perfil.game.goalkeepers_per_game}" /></label>
            </div>
            ${Number(perfil.game.teams) > 2
              ? `<p class="footer-note club-profile-alerta">⚠️ Com mais de 2 times o jogo vira <strong>rodízio</strong>: a noite tem várias partidas em vez de um resultado. Por isso o <strong>campeonato fica indisponível</strong> e a aba some. Os resultados já lançados não são apagados — voltam se você retornar para 2 times.</p>`
              : '<small class="footer-note">Mais de 2 times = rodízio, e nesse formato o campeonato fica indisponível.</small>'}
            <small class="footer-note">Goleiros = 0 para clube que não usa goleiro fixo. Jogadores por time sugere o limite ao criar um jogo.</small>
          </div>

          <label class="form-group">
            <span class="form-label">Com que frequência vocês jogam</span>
            <select name="cadence" class="input">
              ${[['semanal', 'Toda semana'], ['quinzenal', 'A cada 15 dias'], ['mensal', 'Uma vez por mês'], ['avulso', 'Sem periodicidade']]
                .map(([v, l]) => `<option value="${v}" ${perfil.game.cadence === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>

          <label class="form-group">
            <span class="form-label">Dia da semana</span>
            <select name="day_of_week" class="input">
              ${['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
                .map((l, i) => `<option value="${i}" ${Number(perfil.game.day_of_week) === i ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>

          <div class="form-group">
            <span class="form-label">O que o clube usa</span>
            <label class="checkbox-row"><input type="checkbox" name="mod_churrasco" ${perfil.modules.churrasco ? 'checked' : ''} /> <span>Churrasco e rodízio de duplas</span></label>
            <label class="checkbox-row"><input type="checkbox" name="mod_campeonato" ${perfil.modules.campeonato ? 'checked' : ''} /> <span>Campeonato e classificação</span></label>
            <label class="checkbox-row"><input type="checkbox" name="mod_votacao" ${perfil.modules.votacao_desempenho ? 'checked' : ''} /> <span>Votação de desempenho</span></label>
            <label class="checkbox-row"><input type="checkbox" name="usa_posicoes" ${perfil.positions.enabled !== false ? 'checked' : ''} /> <span>Posição em campo (goleiro, zagueiro…)</span></label>
          </div>


          <div class="form-group">
            <span class="form-label">Pontuação do campeonato</span>
            <div class="club-profile-points">
              <label><small>Vitória</small><input type="number" name="pts_win" class="input" min="0" max="99" value="${perfil.championship.points.win}" /></label>
              <label><small>Empate</small><input type="number" name="pts_draw" class="input" min="0" max="99" value="${perfil.championship.points.draw}" /></label>
              <label><small>Derrota</small><input type="number" name="pts_loss" class="input" min="0" max="99" value="${perfil.championship.points.loss}" /></label>
              <label><small>Não jogou</small><input type="number" name="pts_no_play" class="input" min="0" max="99" value="${perfil.championship.points.no_play}" /></label>
            </div>
            <p class="footer-note">Mudar a pontuação recalcula a classificação inteira, inclusive as rodadas já lançadas.</p>
          </div>

          <button class="btn-primary" type="submit">Salvar</button>
        </form>
      </section>

      <section class="card mensalidade-config-card">
        <div class="card-title">Mensalidade</div>
        <p class="footer-note">Vencimento único, válido para todos os jogos do clube. A regra abaixo só passa a valer depois do vencimento.</p>
        <form id="mensalidade-config-form" class="player-admin-form game-config-form">
          <label class="field-label">
            Data de vencimento
            <input class="input" type="tel" inputmode="numeric" placeholder="DD/MM/AAAA" maxlength="10" data-date-mask name="mens_expire_date" value="${isoToDisplay(snapshot.settings?.mens_expire_date || '')}" />
          </label>

          <label class="field-label">
            Valor da mensalidade (R$)
            <input class="input" type="number" min="0" step="0.01" name="mens_amount" value="${Number(snapshot.settings?.mens_amount) || ''}" placeholder="Ex.: 50.00" />
          </label>

          <label class="field-label">
            Nome do beneficiário (PIX)
            <input class="input" type="text" name="mens_beneficiary" value="${escapeHtml(snapshot.settings?.mens_beneficiary || '')}" placeholder="Como aparece no comprovante (quem recebe)" />
            <small class="footer-note">Usado para validar o comprovante PIX que o jogador envia. Valor e beneficiário precisam bater exatamente.</small>
          </label>

          <div class="field-label" style="gap:6px;">
            <label style="display:flex;flex-direction:row;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" name="goalkeepers_pay" style="width:18px;height:18px;flex:none;margin:0;" ${snapshot.settings?.goalkeepers_pay ? 'checked' : ''} />
              <span style="font-weight:600;">🧤 Goleiros pagam mensalidade</span>
            </label>
            <small class="footer-note">Desligado (padrão): goleiros ficam isentos. Ligado: cobra de todos os goleiros. Aplica em todos os goleiros ao salvar — dá pra abrir exceção por goleiro na edição do jogador.</small>
          </div>

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

        ${isPro() ? `
        <div class="mens-reminder-block">
          <div class="card-subtitle">Lembrete de atraso (push)</div>
          <p class="footer-note">Todo dia às 7h, quem estiver em atraso (a partir do 1º dia após o vencimento) recebe um aviso amigável por push, automaticamente.</p>
        </div>
        ` : renderProLockInline({ title: 'Lembrete automático de atraso', benefit: 'Todo dia às 7h, quem está em atraso recebe um push amigável — sem você precisar cobrar na mão.' })}
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

      <section class="card notif-center-card">
        <div class="card-title">Central de notificações</div>

        <div class="card-subtitle">Avisos por push (celular)</div>
        <p class="footer-note">Ligue ou desligue cada aviso. Salva sozinho.</p>
        <div class="notif-center-list">
          ${NOTIF_TYPES.map((t) => `
            <label class="notif-center-row">
              <span class="notif-center-text">
                <strong>${t.label}</strong>
                <small>${t.desc}</small>
              </span>
              <input type="checkbox" class="notif-center-toggle" data-notif-key="${t.key}" ${isNotifEnabled(snapshot, t.key) ? 'checked' : ''} />
            </label>
          `).join('')}
        </div>

        <div class="notif-center-recado">
          <div class="card-subtitle">Recado para todos</div>
          <p class="footer-note">Mensagem fixa que aparece na home de todos (não é push).</p>
          <form id="notifications-config-form" class="player-admin-form notifications-config-form">
            <label class="field-label config-notifications-field">
              <textarea class="input notification-textarea" name="admin_notification" rows="4" placeholder="Ex.: recado sobre churrasco, pagamento, uniforme ou qualquer aviso geral.">${escapeHtml(adminNotification)}</textarea>
            </label>
            <div class="player-admin-actions game-config-actions">
              <button class="btn btn-primary" type="submit">Salvar recado</button>
            </div>
          </form>
        </div>
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

  if (!isMensOkEffective(currentPlayer, game)) {
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
