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
  return player?.role === 'carne';
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

export function renderPlayersScreen(snapshot, currentPlayer, projectedPlayers = null) {
  const sourcePlayers = Array.isArray(projectedPlayers) && projectedPlayers.length ? projectedPlayers : listPlayers();
  const allPlayers = sourcePlayers;
  const jogadores = sourcePlayers.filter((player) => player.role !== 'carne');
  const carneOnly = sourcePlayers.filter((player) => player.role === 'carne');
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
            <span class="tag is-neutral">${currentPlayer.role === 'carne' ? 'Somente carne' : getPositionLabel(currentPlayer.position)}</span>
            <span class="tag ${isAdmin(currentPlayer) || currentPlayer.role === 'carne' || currentPlayer.mens_ok ? 'is-ok' : 'is-warn'}">${isAdmin(currentPlayer) || currentPlayer.role === 'carne' || currentPlayer.mens_ok ? 'Mensalidade ok' : 'Mensalidade pendente'}</span>
          </div>
        </div>
      </section>

      <section class="card">
        ${isAdmin(currentPlayer) ? `
<section class="card">
<div class="card-title">Gerenciar Jogadores</div>
<input id="new-name" placeholder="Nome"/>
<input id="new-phone" placeholder="Telefone"/>
<button data-action="add-player">Adicionar</button>
</section>` : ''}

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
            <div class="kpi-value">${allPlayers.filter((player) => player.role !== 'carne' && player.isConfirmed).length}</div>
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
          ${jogadores.map((player) => renderPlayerRow(player, snapshot, currentPlayer)).join('')}
        </div>
      </section>

      <section class="card">
        <div class="card-title">Grupo da carne</div>
        <div class="placeholder-list">
          ${carneOnly.length ? carneOnly.map((player) => renderPlayerRow(player, snapshot, currentPlayer)).join('') : '<div class="empty-inline">Nenhum perfil exclusivo da carne cadastrado.</div>'}
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

function renderPlayerRow(player, snapshot, currentPlayer) {
  const currentFlag = isCurrentPlayer(player, currentPlayer);
  const confirmed = player.role === 'carne' ? false : !!player.isConfirmed;
  const financePending = isFinancePending(player);

  return `
    <div class="placeholder-row ${currentFlag ? 'is-current' : ''}">
      <div class="placeholder-main">
        <div class="avatar">${getInitials(player.name)}</div>
        <div>
          <div class="row-title">${player.name}${currentFlag ? ' · você' : ''}</div>
          <div class="row-subtitle">
            ${player.role === 'carne' ? 'Somente carne' : getPositionLabel(player.position)} · ${formatPhone(player.phone)}
          </div>
          <div class="chip-row chip-row-sm">
            <span class="tag is-neutral">${getRoleLabel(player)}</span>
            ${player.role !== 'carne' ? `<span class="tag ${confirmed ? 'is-ok' : 'is-neutral'}">${confirmed ? 'Confirmado' : 'Não confirmado'}</span>` : ''}
          </div>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
        <div class="tag ${financePending ? 'is-warn' : 'is-ok'}">${financePending ? 'Pendente' : 'Em dia'}</div>
        ${renderFinanceControls(player, currentPlayer)}
      </div>
    </div>
  `;
}
