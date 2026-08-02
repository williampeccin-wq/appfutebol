// Painel de Superadmin — gestão manual de planos de clubes.
// Acessível apenas a usuários na tabela public.superadmins.

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('pt-BR');
}

function proUntilInput(isoStr) {
  // Supabase retorna timestamptz; input[type=date] espera YYYY-MM-DD
  return isoStr ? isoStr.substring(0, 10) : '';
}

function planBadge(plan) {
  const cls = plan === 'pro' ? 'superadmin-badge--pro' : 'superadmin-badge--free';
  return `<span class="superadmin-badge ${cls}">${plan === 'pro' ? 'PRO' : 'FREE'}</span>`;
}

function renderClubCard(club, editingClubId) {
  const editing = club.id === editingClubId;
  const playerCount = Array.isArray(club.players) ? (club.players[0]?.count ?? '?') : '?';

  if (editing) {
    return `
      <div class="card superadmin-club-card" data-club-id="${esc(club.id)}">
        <div class="superadmin-club-header">
          <strong class="superadmin-club-name">${esc(club.name)}</strong>
          ${planBadge(club.plan)}
        </div>
        <form class="superadmin-edit-form" data-superadmin-save="${esc(club.id)}">
          <div class="form-group">
            <label class="label">Plano</label>
            <select name="plan" class="input">
              <option value="free" ${club.plan === 'free' ? 'selected' : ''}>Free</option>
              <option value="pro"  ${club.plan === 'pro'  ? 'selected' : ''}>Pro</option>
            </select>
          </div>
          <div class="form-group">
            <label class="label">Pro válido até <small class="footer-note">(deixe em branco = sem prazo)</small></label>
            <input type="date" name="pro_until" class="input" value="${proUntilInput(club.pro_until)}" />
          </div>
          <div class="form-group">
            <label class="label">Notas internas</label>
            <textarea name="notes" class="input" rows="2" placeholder="Ex: pagou PIX em 31/07">${esc(club.notes || '')}</textarea>
          </div>
          <div class="superadmin-form-actions">
            <button type="submit" class="btn btn-primary btn-sm">Salvar</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="superadmin-cancel-edit">Cancelar</button>
          </div>
        </form>
      </div>
    `;
  }

  return `
    <div class="card superadmin-club-card" data-club-id="${esc(club.id)}">
      <div class="superadmin-club-header">
        <div class="superadmin-club-info">
          <strong class="superadmin-club-name">${esc(club.name)}</strong>
          <span class="superadmin-club-meta">
            <span>${playerCount} jogadores</span>
            <span>·</span>
            <span>Código: <code>${esc(club.invite_code || '—')}</code></span>
            <span>·</span>
            <span>Criado: ${fmtDate(club.created_at)}</span>
          </span>
          ${club.plan === 'pro' ? `<span class="superadmin-club-meta">Pro até: ${fmtDate(club.pro_until)}</span>` : ''}
          ${club.notes ? `<p class="superadmin-notes">${esc(club.notes)}</p>` : ''}
        </div>
        ${planBadge(club.plan)}
      </div>
      <button class="btn btn-secondary btn-sm superadmin-edit-btn"
              type="button"
              data-action="superadmin-edit-club"
              data-club-id="${esc(club.id)}">Editar plano</button>
    </div>
  `;
}

export function renderSuperAdminScreen(clubs = [], editingClubId = null, loading = false) {
  if (loading) {
    return `
      <section class="section-stack">
        <header class="section-header">
          <h2 class="section-title">Painel Superadmin</h2>
        </header>
        <p class="footer-note" style="padding:16px">Carregando clubes…</p>
      </section>
    `;
  }

  const proCount  = clubs.filter(c => c.plan === 'pro').length;
  const freeCount = clubs.filter(c => c.plan !== 'pro').length;

  return `
    <section class="section-stack">
      <header class="section-header">
        <h2 class="section-title">Painel Superadmin</h2>
        <p class="section-subtitle">
          ${clubs.length} clube(s) · <span class="superadmin-badge superadmin-badge--pro" style="font-size:11px">${proCount} Pro</span> · ${freeCount} Free
        </p>
      </header>

      <div class="superadmin-refresh-row">
        <button class="btn btn-secondary btn-sm" type="button" data-action="superadmin-reload">Atualizar lista</button>
      </div>

      <div class="superadmin-clubs-list">
        ${clubs.length === 0
          ? '<p class="footer-note" style="padding:16px">Nenhum clube cadastrado ainda.</p>'
          : clubs.map(c => renderClubCard(c, editingClubId)).join('')}
      </div>
    </section>
  `;
}
