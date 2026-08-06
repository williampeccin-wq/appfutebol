import { SUPABASE_CONFIG } from '../../config/supabase.config.js';
import {
  savePlayerAccessLink,
  savePlayerLogicalDelete,
  savePlayerLeftTeam,
  savePlayerReactivate,
  restoreDeletedPlayerByPhone,
} from '../../services/storage.supabase.js';
import { assertCriticalOperationAllowed } from '../../services/environment.guard.js';

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function getStoredAccessToken() {
  try {
    const session = JSON.parse(localStorage.getItem('harmonia_auth_session') || '{}');
    return session.access_token || '';
  } catch (_) {
    return '';
  }
}

function ensureAllowed(operation) {
  const guard = assertCriticalOperationAllowed(operation);
  if (!guard?.ok) {
    return guard;
  }
  return { ok: true };
}

async function callAdminPasswordFunction(payload) {
  const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/admin-reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getStoredAccessToken()}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      reason: `admin_password_function_failed_${response.status}`,
      status: response.status,
      message: data?.error || 'Falha na operação de acesso.',
      data,
    };
  }

  return { ok: true, data };
}

export async function createPlayerAccessOperation({ player, newPassword, adminSecret }) {
  const allowed = ensureAllowed('criar acesso de jogador');
  if (!allowed.ok) return allowed;

  if (!player?.id) return { ok: false, reason: 'missing_player' };

  if (player.auth_user_id) {
    return { ok: false, reason: 'player_already_has_access', message: 'Este jogador já tem acesso criado.' };
  }

  const phone = normalizePhone(player.phone);
  if (phone.length < 10 || phone.length > 11) {
    return { ok: false, reason: 'invalid_player_phone', message: 'Este jogador precisa ter telefone válido antes de criar acesso.' };
  }

  if (!newPassword || String(newPassword).length < 6) {
    return { ok: false, reason: 'invalid_password', message: 'Senha deve ter pelo menos 6 caracteres.' };
  }

  if (!adminSecret) {
    return { ok: false, reason: 'missing_admin_secret', message: 'Segredo admin não informado.' };
  }

  const authResult = await callAdminPasswordFunction({
    mode: 'create_access',
    admin_secret: adminSecret,
    player_id: player.id,
    name: player.name,
    phone,
    birth_date: player.birthDate || '',
    new_password: newPassword,
  });

  if (!authResult.ok) return authResult;

  const data = authResult.data || {};
  if (!data?.user_id) {
    return { ok: false, reason: 'auth_user_id_not_returned', message: 'Acesso criado sem retorno de usuário Auth.' };
  }

  const linkResult = await savePlayerAccessLink({
    playerId: player.id,
    authUserId: data.user_id,
    email: data.email || `${phone}@harmonia.app`,
    phone,
  });

  if (!linkResult.ok) {
    return {
      ok: false,
      reason: 'player_access_link_failed',
      message: 'Acesso criado no Auth, mas falhou ao vincular o jogador. Recarregue e valide o cadastro.',
      linkResult,
    };
  }

  return {
    ok: true,
    reason: data.reused_existing_user ? 'existing_access_relinked' : 'access_created_and_linked',
    message: data.reused_existing_user ? 'Acesso existente atualizado e vinculado.' : 'Acesso criado com sucesso.',
    data,
    linkResult,
  };
}

export async function resetPlayerPasswordOperation({ player, newPassword, adminSecret }) {
  const allowed = ensureAllowed('resetar senha de jogador');
  if (!allowed.ok) return allowed;

  if (!player?.id) return { ok: false, reason: 'missing_player' };

  if (!player.auth_user_id) {
    return { ok: false, reason: 'player_without_access', message: 'Este jogador ainda não tem acesso criado.' };
  }

  if (!newPassword || String(newPassword).length < 6) {
    return { ok: false, reason: 'invalid_password', message: 'Senha deve ter pelo menos 6 caracteres.' };
  }

  if (!adminSecret) {
    return { ok: false, reason: 'missing_admin_secret', message: 'Segredo admin não informado.' };
  }

  const result = await callAdminPasswordFunction({
    mode: 'reset_password',
    admin_secret: adminSecret,
    user_id: player.auth_user_id,
    new_password: newPassword,
  });

  if (!result.ok) return result;

  return { ok: true, reason: 'password_reset', message: 'Senha resetada com sucesso.', data: result.data };
}

export async function deletePlayerOperation({ player, currentPlayerId, allPlayers = [], confirmationText = '' }) {
  const allowed = ensureAllowed('excluir jogador');
  if (!allowed.ok) return allowed;

  if (!player?.id) return { ok: false, reason: 'missing_player' };

  if (String(player.id) === String(currentPlayerId)) {
    return { ok: false, reason: 'cannot_delete_self', message: 'Você não pode excluir seu próprio usuário.' };
  }

  const admins = Array.isArray(allPlayers) ? allPlayers.filter((candidate) => candidate?.is_admin) : [];
  if (player.is_admin && admins.length <= 1) {
    return { ok: false, reason: 'cannot_delete_last_admin', message: 'Não é possível remover o último administrador.' };
  }

  const expected = String(player.name || '').trim();
  if (!expected || String(confirmationText || '').trim() !== expected) {
    return { ok: false, reason: 'delete_confirmation_mismatch', message: 'Confirmação inválida. A exclusão não foi realizada.' };
  }

  const result = await savePlayerLogicalDelete(player.id);
  if (!result.ok) {
    return { ok: false, reason: 'logical_delete_failed', message: 'Não foi possível salvar a exclusão. Tente novamente.', result };
  }

  return { ok: true, reason: 'player_logically_deleted', message: 'Jogador removido.', result };
}

export async function leaveTeamOperation({ player, currentPlayerId, allPlayers = [] }) {
  if (!player?.id) return { ok: false, reason: 'missing_player' };

  if (String(player.id) === String(currentPlayerId)) {
    return { ok: false, reason: 'cannot_leave_self', message: 'Você não pode marcar a si mesmo como saiu do time.' };
  }

  const admins = Array.isArray(allPlayers) ? allPlayers.filter((p) => p?.is_admin && !p?.left_team) : [];
  if (player.is_admin && admins.length <= 1) {
    return { ok: false, reason: 'cannot_leave_last_admin', message: 'Não é possível remover o último administrador.' };
  }

  const result = await savePlayerLeftTeam(player.id);
  if (!result.ok) return { ok: false, reason: 'left_team_save_failed', message: 'Não foi possível salvar. Tente novamente.', result };

  return { ok: true, reason: 'player_left_team', message: `${player.name || 'Jogador'} marcado como saiu do time.`, result };
}

export async function reactivateLeftPlayerOperation({ player }) {
  if (!player?.id) return { ok: false, reason: 'missing_player' };

  const result = await savePlayerReactivate(player.id);
  if (!result.ok) return { ok: false, reason: 'reactivate_save_failed', message: 'Não foi possível reativar. Tente novamente.', result };

  return { ok: true, reason: 'player_reactivated', message: `${player.name || 'Jogador'} reativado no time.`, result };
}

export async function restoreDeletedPlayerByPhoneOperation(phone, updates = {}) {
  const allowed = ensureAllowed('restaurar jogador excluído');
  if (!allowed.ok) return allowed;
  return restoreDeletedPlayerByPhone(phone, updates);
}
