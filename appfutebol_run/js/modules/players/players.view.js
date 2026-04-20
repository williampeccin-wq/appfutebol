import {
  formatPhone,
  getInitials,
  getPositionLabel,
  getRoleLabel,
  isAdmin,
  isConfirmed,
  isCurrentPlayer,
  listCarneOnly,
  listJogadores,
  listPlayers,
} from './players.service.js';

function isCarneOnly(player) {
  return player?.plays_football === false;
}

function isFinancePending(player) {
  return !isAdmin(player) && !isCarneOnly(player) && !player?.mens_ok;
}

function renderFinanceControls(player, currentPlayer) {
  if (!isAdmin(currentPlayer)) return '';
  if (isCarneOnly(player)) return '';
  if (isAdmin(player)) return '';

  if (isFinancePending(player)) {
    return `<button class="btn btn-secondary finance-action-button" type="button" data-action="mark-paid" data-id="${player.id}">Marcar pago</button>`;
  }

  return `<button class="btn btn-primary finance-action-button" type="button" data-action="mark-debt" data-id="${player.id}">Marcar inadimplente</button>`;
}


function renderPlayerManagementCard(currentPlayer) {
  if (!isAdmin(currentPlayer)) return '';

  return `
    <section class="card" id="player-management-card">
      <div class="card-title" id="player-management-title">Gerenciar jogadores</div>
      <div class="player-admin-form">
        <input id="new-name" class="input" type="text" placeholder="Nome" />
        <input id="new-phone" class="input" type="tel" placeholder="Telefone" />

        <select id="new-role" class="input">
          <option value="player">Jogador</option>
          <option value="carne">Carne</option>
        </select>

        <select id="new-position" class="input" data-role-dependent="position">
          <option value="meia">Meia</option>
          <option value="zag">Zagueiro</option>
          <option value="atk">Atacante</option>
        </select>

        <label><input id="new-admin" type="checkbox" /> Admin</label>
        <label><input id="new-mens" type="checkbox" checked /> Mensalidade OK</label>

        <div class="player-admin-actions"><button class="btn btn-primary" type="button" data-action="add-player">Adicionar</button><button class="btn btn-secondary" type="button" data-action="cancel-edit" id="cancel-edit-button" style="display:none;">Cancelar</button></div>
      </div>
    </section>
  `;
}


export function renderPlayersScreen(snapshot, currentPlayer, projectedPlayers = null, editingPlayerId = null) {
  const sourcePlayers = Array.isArray(projectedPlayers) && projectedPlayers.length ? projectedPlayers : listPlayers();
  const orderedPlayers = [...sourcePlayers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const allPlayers = orderedPlayers;
  const jogadores = orderedPlayers.filter((player) => player.plays_football !== false);
  const carneGroup = orderedPlayers.filter((player) => player.in_carne_group === true);
  const carneOnly = carneGroup.filter((player) => player.plays_football === false);
  const jogadoresFinanceiros = jogadores.filter((player) => !isAdmin(player));
  const emDia = jogadoresFinanceiros.filter((player) => !!player.mens_ok).length;
  const pendentes = jogadoresFinanceiros.filter((player) => !player.mens_ok).length;
  const adimplencia = jogadoresFinanceiros.length ? Math.round((emDia / jogadoresFinanceiros.length) * 100) : 100;

  return `
    <section class="section-stack">
      <section class="card">
        <div class="card-title">Sessão atual</div>
        <div class="session-card">
          <div class="session-main">
            <div class="avatar avatar-lg">${getInitials(currentPlayer.name)}</div>
            <div>
              <div class="row-title">${currentPlayer.name}</div>
              <div class="row-subtitle">${getRoleLabel(currentPlayer)} · ${formatPhone(currentPlayer.phone)}</div>
            </div>
          </div>
          <div class="chip-row">
            <span class="tag is-neutral">${currentPlayer.plays_football === false ? 'Somente carne' : getPositionLabel(currentPlayer.position)}</span>
            <span class="tag ${isAdmin(currentPlayer) || currentPlayer.plays_football === false || currentPlayer.mens_ok ? 'is-ok' : 'is-warn'}">${isAdmin(currentPlayer) || currentPlayer.plays_football === false || currentPlayer.mens_ok ? 'Mensalidade ok' : 'Mensalidade pendente'}</span>
          </div>
        </div>
      </section>

      ${renderPlayerManagementCard(currentPlayer)}

      <section class="card">
        <div class="card-title">Resumo do elenco</div>
        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-value">${allPlayers.length}</div>
            <div class="kpi-label">Perfis cadastrados</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-value">${jogadores.length}</div>
            <div class="kpi-label">Jogadores do futebol</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-value">${carneOnly.length}</div>
            <div class="kpi-label">Somente carne</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-value">${allPlayers.filter((player) => player.plays_football !== false && player.isConfirmed).length}</div>
            <div class="kpi-label">Confirmados no jogo</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-value">${emDia}</div>
            <div class="kpi-label">Financeiro em dia</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-value">${pendentes}</div>
            <div class="kpi-label">Financeiro pendente</div>
          </div>
          <div class="kpi-box kpi-box--highlight">
            <div class="kpi-value">${adimplencia}%</div>
            <div class="kpi-label">Adimplência</div>
          </div>
          <div class="kpi-box kpi-box--muted">
            <div class="kpi-value">${jogadoresFinanceiros.length}</div>
            <div class="kpi-label">Base financeira</div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-title">Jogadores do futebol</div>
        <div class="placeholder-list">
          ${jogadores.map((player) => renderPlayerRow(player, snapshot, currentPlayer, editingPlayerId)).join('')}
        </div>
      </section>

      <section class="card">
        <div class="card-title">Grupo da carne</div>
        <div class="placeholder-list">
          ${carneGroup.length ? carneGroup.map((player) => renderPlayerRow(player, snapshot, currentPlayer, editingPlayerId)).join('') : '<div class="empty-inline">Nenhum integrante do grupo da carne cadastrado.</div>'}
        </div>
      </section>

      <section class="card">
        <div class="card-title">Permissões</div>
        <p class="footer-note">
          ${isAdmin(currentPlayer)
            ? 'Você está logado como administrador. Na próxima fase, o CRUD de jogadores e a gestão do grupo da carne entram aqui.'
            : 'Você está logado como usuário comum. A aba Config fica restrita ao admin.'}
        </p>
      </section>
    </section>
  `;
}

function renderPlayerRow(player, snapshot, currentPlayer, editingPlayerId = null) {
  const isEditing = player.id === editingPlayerId;
  const currentFlag = isCurrentPlayer(player, currentPlayer);
  const confirmed = player.plays_football === false ? false : !!player.isConfirmed;
  const financePending = isFinancePending(player);

  return `
    <div class="placeholder-row ${currentFlag ? 'is-current' : ''} ${isEditing ? 'is-editing' : ''}">
      <div class="placeholder-main">
        <div class="avatar">${getInitials(player.name)}</div>
        <div>
          <div class="row-title">${player.name}${currentFlag ? ' · você' : ''}</div>
          <div class="row-subtitle">
            ${player.plays_football === false ? 'Somente carne' : getPositionLabel(player.position)} · ${formatPhone(player.phone)}
          </div>
          <div class="chip-row chip-row-sm">
            <span class="tag is-neutral">${getRoleLabel(player)}</span>
            ${player.plays_football !== false ? `<span class="tag ${confirmed ? 'is-ok' : 'is-neutral'}">${confirmed ? 'Confirmado' : 'Não confirmado'}</span>` : ''}
          </div>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
        ${player.plays_football === false ? '' : `<div class="tag ${financePending ? 'is-warn' : 'is-ok'}">${financePending ? 'Pendente' : 'Em dia'}</div>`}
        ${renderFinanceControls(player, currentPlayer)}
        ${isAdmin(currentPlayer) && !isCurrentPlayer(player, currentPlayer) ? `<button class="btn btn-secondary finance-action-button" type="button" data-action="edit-player" data-id="${player.id}">Editar</button>` : ''}
        ${isAdmin(currentPlayer) && !isCurrentPlayer(player, currentPlayer) ? `<button class="btn btn-secondary finance-action-button" type="button" data-action="delete-player" data-id="${player.id}">Excluir</button>` : ''}
      </div>
    </div>
  `;
}

