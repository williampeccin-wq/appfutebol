// Tela do LIVRO-CAIXA (aba Financeiro, Pro). Render síncrono a partir do cache
// (finance.ledger.service). Ver docs/finance-design.md e o mock aprovado.

import { getCachedLedger, ledgerSummary, collectionThisMonth, pendingMembersThisMonth, getPublicSummary } from './finance.ledger.service.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function brl(v) { return BRL.format(Number(v) || 0); }
function brlShort(v) { return 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR'); }
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (((parts[0] || '')[0] || '') + (parts.length > 1 ? (parts[parts.length - 1][0] || '') : '')).toUpperCase() || '?';
}

const CAT_LABEL = { mensalidade: 'Mensalidade', diaria: 'Diária', quadra: 'Quadra', material: 'Material', outro: 'Outro' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
function fmtDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1] || ''}` : esc(iso);
}
function currentYmStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function monthIdx(ym) { return (Number(String(ym).split('-')[1]) || 1) - 1; }
function mesAbrevDe(ym) { return MESES[monthIdx(ym)] || ''; }
function mesNomeDe(ym) { return MESES_FULL[monthIdx(ym)] || ''; }
function anoDe(ym) { return String(ym).split('-')[0] || ''; }

// showDelete=false é a versão read-only usada na prestação de contas do membro.
function entryRow(r, nameById, showDelete = true) {
  const receita = r.kind === 'receita';
  const isMens = r.category === 'mensalidade';
  const who = r.player_id ? nameById.get(String(r.player_id)) : '';
  const title = isMens && who ? `Mensalidade · ${esc(who)}` : esc(r.description || CAT_LABEL[r.category] || 'Lançamento');
  const src = r.source === 'pix_ia' ? 'PIX-IA' : (r.source === 'ajuste' ? 'ajuste' : 'manual');
  const val = (receita ? '+' : '−') + brl(r.amount).replace('R$', 'R$');
  const color = receita ? '#5dcaa5' : '#f0997b';
  return `
    <div class="player-compact-row" role="row">
      <div class="player-compact-main">
        <div class="player-compact-text">
          <div class="row-title">${title}</div>
          <div class="row-subtitle">${fmtDate(r.date)} · ${src}</div>
        </div>
      </div>
      <div class="player-compact-right" style="display:flex;align-items:center;gap:10px;">
        <strong style="color:${color};white-space:nowrap;">${val}</strong>
        ${showDelete ? `<button class="icon-action-button" type="button" data-action="finance-delete-entry" data-id="${esc(r.id)}" title="Excluir" aria-label="Excluir lançamento"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/><path d="M10 11v6M14 11v6"/></svg></button>` : ''}
      </div>
    </div>`;
}

export function renderFinanceScreen(snapshot, _currentPlayer, refYm) {
  const rows = getCachedLedger();
  const pub = getPublicSummary();
  const ym = refYm || currentYmStr();
  const isCurrent = ym >= currentYmStr();
  const { saldo, entMes, saiMes } = ledgerSummary(rows, ym);
  const netMes = entMes - saiMes;
  const col = collectionThisMonth(snapshot, rows, ym);
  const pending = pendingMembersThisMonth(snapshot, rows, ym);
  const pct = col.expected > 0 ? Math.min(100, Math.round((col.collected / col.expected) * 100)) : 0;
  const nameById = new Map((Array.isArray(snapshot?.players) ? snapshot.players : []).map((p) => [String(p.id), p.name || '']));
  const mesNome = mesNomeDe(ym);
  const mesAbrev = mesAbrevDe(ym);
  const ano = anoDe(ym);

  const monthRows = rows.filter((r) => String(r.date || '').slice(0, 7) === ym);
  const listHtml = monthRows.length
    ? monthRows.slice(0, 60).map((r) => entryRow(r, nameById)).join('')
    : `<div class="empty-inline">Nenhum lançamento em ${esc(mesNome)}.</div>`;

  return `
    <section class="section-stack">

      <section class="card">
        <div class="card-subtitle" style="text-transform:uppercase;letter-spacing:.04em;">Saldo em caixa</div>
        <div style="font-size:30px;font-weight:700;letter-spacing:-.01em;">${brl(saldo)}</div>
        ${netMes !== 0 ? `<div class="footer-note" style="color:${netMes >= 0 ? '#5dcaa5' : '#f0997b'};margin-top:2px;">${netMes >= 0 ? '+' : '−'}${brlShort(Math.abs(netMes))} em ${esc(mesNome.toLowerCase())}</div>` : ''}
      </section>

      <div style="display:flex;align-items:center;justify-content:center;gap:18px;margin:2px 0;">
        <button class="icon-action-button" type="button" data-action="finance-month-prev" aria-label="Mês anterior"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
        <span style="font-size:15px;font-weight:600;min-width:132px;text-align:center;">${esc(mesNome)} ${esc(ano)}</span>
        <button class="icon-action-button" type="button" data-action="finance-month-next" aria-label="Próximo mês"${isCurrent ? ' disabled style="opacity:.35;"' : ''}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>

      <section class="card">
        <div class="kpi-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div><div class="kpi-label">Entradas · ${esc(mesAbrev)}</div><div class="kpi-value" style="color:#5dcaa5;">${brlShort(entMes)}</div></div>
          <div><div class="kpi-label">Saídas · ${esc(mesAbrev)}</div><div class="kpi-value" style="color:#f0997b;">${brlShort(saiMes)}</div></div>
        </div>
      </section>

      <section class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
          <span style="font-size:15px;font-weight:600;">${esc(mesNome)}</span>
          <span class="footer-note">${col.paidCount} de ${col.totalMembers} membros</span>
        </div>
        <div style="height:8px;background:rgba(130,140,160,.32);border-radius:6px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:#f0c040;"></div>
        </div>
        <div class="footer-note" style="margin-top:6px;">${brlShort(col.collected)} de ${brlShort(col.expected)}${col.missing ? ` · faltam ${col.missing}` : ''}</div>
      </section>

      ${(col.expected > 0 && pending.length) ? `
      <section class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
          <span class="card-title" style="margin:0;">Em atraso</span>
          <span class="footer-note">${pending.length} de ${col.totalMembers}</span>
        </div>
        <div class="player-compact-list">
          ${pending.map((p) => `
            <div class="player-compact-row" role="row">
              <div class="player-compact-main" style="display:flex;align-items:center;gap:11px;">
                <span style="width:32px;height:32px;border-radius:50%;background:rgba(240,137,123,.16);color:#f0897b;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;">${initials(p.name)}</span>
                <div class="player-compact-text"><div class="row-title">${esc(p.name)}</div></div>
              </div>
              <button class="btn btn-secondary btn-sm" type="button" data-action="finance-charge" data-id="${esc(p.id)}" data-name="${esc(p.name)}" style="white-space:nowrap;">Cobrar</button>
            </div>`).join('')}
        </div>
      </section>
      ` : ''}

      <section class="card">
        <div class="card-title">Lançamentos</div>
        <div class="player-compact-list" role="table" aria-label="Lançamentos do caixa">
          ${listHtml}
        </div>
      </section>

      <section class="card">
        <div class="card-title">Novo lançamento</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
          <select id="fin-kind" class="input" aria-label="Tipo">
            <option value="despesa">Despesa</option>
            <option value="receita">Entrada</option>
          </select>
          <select id="fin-category" class="input" aria-label="Categoria">
            <option value="quadra">Quadra</option>
            <option value="material">Material</option>
            <option value="mensalidade">Mensalidade</option>
            <option value="diaria">Diária</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
          <input id="fin-amount" class="input" type="text" inputmode="numeric" data-mask="currency" placeholder="Valor · 0,00" autocomplete="off" />
          <input id="fin-date" class="input" type="date" value="${new Date().toISOString().slice(0, 10)}" aria-label="Data" />
        </div>
        <input id="fin-desc" class="input" type="text" placeholder="Descrição (ex.: aluguel da quadra)" style="margin-top:10px;" />
        <button class="btn btn-primary" type="button" data-action="finance-submit" style="width:100%;margin-top:12px;">Adicionar lançamento</button>
        <div style="text-align:center;margin-top:14px;">
          <button class="btn btn-secondary btn-sm" type="button" data-action="finance-publish">Publicar resumo ao grupo</button>
          <p class="footer-note" style="margin-top:6px;">${pub && pub.updatedAt ? `Publicado · o grupo vê saldo e entradas/saídas do mês.` : `O grupo verá saldo e entradas/saídas do mês (sem quem está devendo).`}</p>
        </div>
      </section>

    </section>`;
}

// Tela read-only do resumo publicado (membro comum, clube Pro).
export function renderPublicFinanceScreen(snapshot) {
  const p = getPublicSummary();
  if (!p) {
    return `
      <section class="section-stack">
        <section class="card">
          <div class="card-title">Financeiro do grupo</div>
          <div class="empty-inline">O administrador ainda não publicou o resumo financeiro.</div>
        </section>
      </section>`;
  }
  const mes = p.ym ? `${mesNomeDe(p.ym)} ${anoDe(p.ym)}` : '';
  const ab = p.ym ? mesAbrevDe(p.ym) : '';
  // Lançamentos do mês publicado (read-only). Os nomes são resolvidos aqui, no
  // cliente do membro, para não engordar o payload publicado nem congelá-los.
  const entries = Array.isArray(p.entries) ? p.entries : [];
  const nameById = new Map((Array.isArray(snapshot?.players) ? snapshot.players : []).map((pl) => [String(pl.id), pl.name || '']));
  const entriesHtml = entries.length
    ? entries.map((r) => entryRow(r, nameById, false)).join('')
    : `<div class="empty-inline">Nenhum lançamento em ${esc(mesNomeDe(p.ym || ''))}.</div>`;
  return `
    <section class="section-stack">
      <section class="card">
        <div class="card-subtitle" style="text-transform:uppercase;letter-spacing:.04em;">Saldo em caixa</div>
        <div style="font-size:30px;font-weight:700;letter-spacing:-.01em;">${brl(p.saldo)}</div>
        ${mes ? `<div class="footer-note" style="margin-top:2px;">Prestação de contas · ${esc(mes)}</div>` : ''}
      </section>
      <section class="card">
        <div class="kpi-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div><div class="kpi-label">Entradas${ab ? ' · ' + esc(ab) : ''}</div><div class="kpi-value" style="color:#5dcaa5;">${brlShort(p.entMes)}</div></div>
          <div><div class="kpi-label">Saídas${ab ? ' · ' + esc(ab) : ''}</div><div class="kpi-value" style="color:#f0997b;">${brlShort(p.saiMes)}</div></div>
        </div>
      </section>
      <section class="card">
        <div class="card-title">Lançamentos${mes ? ` · ${esc(mes)}` : ''}</div>
        ${entriesHtml}
      </section>
      <p class="footer-note" style="text-align:center;">Resumo publicado pelo administrador do clube.</p>
    </section>`;
}
