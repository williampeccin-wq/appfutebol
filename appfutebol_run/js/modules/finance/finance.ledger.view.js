// Tela do LIVRO-CAIXA (aba Financeiro, Pro). Render síncrono a partir do cache
// (finance.ledger.service). Ver docs/finance-design.md e o mock aprovado.

import { getCachedLedger, ledgerSummary, collectionThisMonth } from './finance.ledger.service.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function brl(v) { return BRL.format(Number(v) || 0); }
function brlShort(v) { return 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR'); }

const CAT_LABEL = { mensalidade: 'Mensalidade', diaria: 'Diária', quadra: 'Quadra', material: 'Material', outro: 'Outro' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function fmtDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1] || ''}` : esc(iso);
}
function mesAtualLabel() {
  const d = new Date();
  return (MESES[d.getMonth()] || '').replace(/^./, (c) => c.toUpperCase());
}

function entryRow(r, nameById) {
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
      <div class="player-compact-right">
        <strong style="color:${color};white-space:nowrap;">${val}</strong>
      </div>
    </div>`;
}

export function renderFinanceScreen(snapshot, _currentPlayer) {
  const rows = getCachedLedger();
  const { saldo, entMes, saiMes } = ledgerSummary(rows);
  const netMes = entMes - saiMes;
  const col = collectionThisMonth(snapshot, rows);
  const pct = col.expected > 0 ? Math.min(100, Math.round((col.collected / col.expected) * 100)) : 0;
  const nameById = new Map((Array.isArray(snapshot?.players) ? snapshot.players : []).map((p) => [String(p.id), p.name || '']));
  const mes = mesAtualLabel();

  const listHtml = rows.length
    ? rows.slice(0, 40).map((r) => entryRow(r, nameById)).join('')
    : '<div class="empty-inline">Nenhum lançamento ainda. Adicione uma despesa ou registre uma entrada.</div>';

  return `
    <section class="section-stack">

      <section class="card">
        <div class="card-subtitle" style="text-transform:uppercase;letter-spacing:.04em;">Saldo em caixa</div>
        <div style="font-size:30px;font-weight:700;letter-spacing:-.01em;">${brl(saldo)}</div>
        ${netMes !== 0 ? `<div class="footer-note" style="color:${netMes >= 0 ? '#5dcaa5' : '#f0997b'};margin-top:2px;">${netMes >= 0 ? '+' : '−'}${brlShort(Math.abs(netMes))} este mês</div>` : ''}
      </section>

      <section class="card">
        <div class="kpi-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div><div class="kpi-label">Entradas · ${esc(mes.toLowerCase().slice(0, 3))}</div><div class="kpi-value" style="color:#5dcaa5;">${brlShort(entMes)}</div></div>
          <div><div class="kpi-label">Saídas · ${esc(mes.toLowerCase().slice(0, 3))}</div><div class="kpi-value" style="color:#f0997b;">${brlShort(saiMes)}</div></div>
        </div>
      </section>

      <section class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
          <span class="card-title" style="margin:0;">${esc(mes)}</span>
          <span class="footer-note">${col.paidCount} de ${col.totalMembers} membros</span>
        </div>
        <div style="height:8px;background:rgba(255,255,255,.08);border-radius:6px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:#f0c040;"></div>
        </div>
        <div class="footer-note" style="margin-top:6px;">${brlShort(col.collected)} de ${brlShort(col.expected)}${col.missing ? ` · faltam ${col.missing}` : ''}</div>
      </section>

      <section class="card">
        <div class="card-title">Lançamentos</div>
        <div class="player-compact-list" role="table" aria-label="Lançamentos do caixa">
          ${listHtml}
        </div>
        <div class="carne-edit-actions" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
          <button class="btn btn-primary btn-sm" type="button" data-action="finance-add-expense">＋ Despesa</button>
          <button class="btn btn-secondary btn-sm" type="button" data-action="finance-add-income">＋ Entrada</button>
        </div>
        <p class="footer-note" style="text-align:center;margin-top:12px;">Publicar resumo ao grupo · em breve</p>
      </section>

    </section>`;
}
