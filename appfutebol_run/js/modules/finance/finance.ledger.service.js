// Serviço do LIVRO-CAIXA do clube (tabela public.finance_entries) — recurso Pro.
// Distinto de finance.service.js (que trata a lógica de mensalidade/confirmação).
// Leitura via REST (RLS: só admin do clube lê/escreve). Cache preenchido async,
// UI lê o cache síncrono (mesmo padrão de ratings.service). Ver docs/finance-design.md.

function getSupabase() {
  const cfg = window.HARMONIA_SUPABASE || {};
  return { url: String(cfg.url || '').replace(/\/+$/, ''), anonKey: cfg.anonKey || '' };
}

function getAccessToken() {
  try {
    return JSON.parse(localStorage.getItem('harmonia_auth_session') || 'null')?.access_token || null;
  } catch (_) {
    return null;
  }
}

function headers(extra = {}) {
  const { anonKey } = getSupabase();
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    apikey: anonKey,
    Authorization: `Bearer ${token || anonKey}`,
    ...extra,
  };
}

let _cache = { rows: [], loadedAt: 0 };

export function getCachedLedger() { return _cache.rows; }

// Carrega os lançamentos do clube (RLS já escopa por clube + admin). Cache 15s;
// force=true ignora o cache (após uma escrita).
export async function loadLedgerCache(force = false) {
  const { url, anonKey } = getSupabase();
  if (!url || !anonKey) return _cache.rows;
  if (!force && _cache.loadedAt && Date.now() - _cache.loadedAt < 15000) return _cache.rows;
  try {
    const sel = 'select=id,kind,category,amount,date,description,player_id,source,created_at';
    const resp = await fetch(`${url}/rest/v1/finance_entries?${sel}&order=date.desc,created_at.desc`, { headers: headers() });
    if (!resp.ok) return _cache.rows;
    const rows = await resp.json();
    _cache = { rows: Array.isArray(rows) ? rows : [], loadedAt: Date.now() };
  } catch (_) { /* mantém o cache anterior */ }
  return _cache.rows;
}

// Insere um lançamento manual (despesa ou entrada). RLS exige admin do clube.
export async function addLedgerEntry({ kind, category, amount, date, description, clubId, createdBy }) {
  const { url } = getSupabase();
  if (!url) return { ok: false, reason: 'not_configured' };
  const body = {
    kind: kind === 'receita' ? 'receita' : 'despesa',
    category: String(category || 'outro'),
    amount: Math.round(Number(amount) * 100) / 100,
    date: String(date || '').slice(0, 10),
    description: description ? String(description) : null,
    source: 'manual',
    club_id: clubId || null,
    created_by: createdBy || null,
  };
  if (!(body.amount >= 0) || !body.date) return { ok: false, reason: 'invalid' };
  try {
    const resp = await fetch(`${url}/rest/v1/finance_entries`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify(body),
    });
    if (!resp.ok) return { ok: false, reason: 'http_' + resp.status, detail: await resp.text().catch(() => '') };
    await loadLedgerCache(true);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'network', detail: String(e && e.message || e) };
  }
}

// Exclui um lançamento (RLS exige admin do clube).
export async function deleteLedgerEntry(id) {
  const { url } = getSupabase();
  if (!url || !id) return { ok: false, reason: 'invalid' };
  try {
    const resp = await fetch(`${url}/rest/v1/finance_entries?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: headers(),
    });
    if (!resp.ok) return { ok: false, reason: 'http_' + resp.status };
    await loadLedgerCache(true);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'network', detail: String(e && e.message || e) };
  }
}

// Membros pagantes SEM mensalidade lançada no mês (inadimplentes). Usa o roster
// + as receitas de mensalidade com player_id do mês de referência.
export function pendingMembersThisMonth(snapshot, rows = getCachedLedger(), refYm = currentYm()) {
  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const payers = players.filter((p) => p && !p.deleted && (p.plays_football !== false || p.in_carne_group));
  const paid = new Set();
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (r.kind === 'receita' && r.category === 'mensalidade' && ym(r.date) === refYm && r.player_id) paid.add(String(r.player_id));
  }
  return payers.filter((p) => !paid.has(String(p.id))).map((p) => ({ id: String(p.id), name: p.name || '' }));
}

function ym(date) { return String(date || '').slice(0, 7); }
function currentYm() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

// Saldo acumulado + entradas/saídas do mês de referência (default = mês atual).
export function ledgerSummary(rows = getCachedLedger(), refYm = currentYm()) {
  let saldo = 0, entMes = 0, saiMes = 0;
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const amt = Number(r.amount) || 0;
    saldo += (r.kind === 'receita' ? amt : -amt);
    if (ym(r.date) === refYm) {
      if (r.kind === 'receita') entMes += amt; else saiMes += amt;
    }
  }
  return { saldo, entMes, saiMes };
}

// Taxa de coleta da mensalidade do mês: quanto entrou de mensalidade vs. o
// esperado (nº de membros × valor). Precisa do snapshot (membros + valor).
export function collectionThisMonth(snapshot, rows = getCachedLedger(), refYm = currentYm()) {
  const amount = Number(snapshot?.settings?.mens_amount) || 0;
  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const payers = players.filter((p) => p && !p.deleted && (p.plays_football !== false || p.in_carne_group));
  const totalMembers = payers.length;
  const paidIds = new Set();
  let collected = 0;
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (r.kind !== 'receita' || r.category !== 'mensalidade' || ym(r.date) !== refYm) continue;
    collected += Number(r.amount) || 0;
    if (r.player_id) paidIds.add(String(r.player_id));
  }
  return {
    collected,
    expected: totalMembers * amount,
    totalMembers,
    paidCount: paidIds.size,
    missing: Math.max(0, totalMembers - paidIds.size),
  };
}
