// Serviço de votação/notas (tabela public.ratings).
// kind: 'desempenho' (jogador avalia jogador) | 'churrasco' (avalia a dupla).
// A média é calculada no cliente; a UI nunca mostra quem votou.

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

function headers() {
  const { anonKey } = getSupabase();
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    apikey: anonKey,
    Authorization: `Bearer ${token || anonKey}`,
  };
}

// Grava (upsert) os votos de um votante. Cada linha:
// { kind, game_key, voter_id, target_id, score }.
// on_conflict pela chave única → permite corrigir o voto antes da janela fechar.
export async function submitRatings(rows) {
  const { url, anonKey } = getSupabase();
  if (!url || !anonKey) return { ok: false, reason: 'not_configured' };
  const clean = (Array.isArray(rows) ? rows : []).filter((r) =>
    r && r.kind && r.game_key && r.voter_id && r.target_id
    && Number.isFinite(Number(r.score)) && Number(r.score) >= 1 && Number(r.score) <= 10);
  if (!clean.length) return { ok: false, reason: 'no_rows' };
  const payload = clean.map((r) => ({
    kind: String(r.kind),
    game_key: String(r.game_key),
    voter_id: String(r.voter_id),
    target_id: String(r.target_id),
    score: Math.round(Number(r.score)),
    updated_at: new Date().toISOString(),
  }));
  try {
    const resp = await fetch(`${url}/rest/v1/ratings?on_conflict=kind,game_key,voter_id,target_id`, {
      method: 'POST',
      headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) return { ok: false, reason: `save_${resp.status}`, body: await resp.text().catch(() => '') };
    return { ok: true, count: payload.length };
  } catch (error) {
    console.warn('[ratings] falha ao salvar votos:', error);
    return { ok: false, reason: 'network' };
  }
}

// ---- Cache em memória (para os rankings na aba Campeonato) ----
const _cache = { rows: [], loaded: false, loading: false };

export function getCachedRatings() { return _cache.rows; }

export async function loadRatingsCache(force = false) {
  if (_cache.loading) return _cache;
  if (_cache.loaded && !force) return _cache;
  _cache.loading = true;
  const res = await fetchRatings({});
  _cache.loading = false;
  if (res.ok) { _cache.rows = res.rows; _cache.loaded = true; }
  return _cache;
}

// Média/qtde por ALVO de um tipo, restrito (opcionalmente) a um conjunto de jogos.
function aggregateByTarget(rows, kind, gameKeys) {
  const set = gameKeys && gameKeys.length ? new Set(gameKeys.map(String)) : null;
  const agg = {};
  for (const r of (rows || [])) {
    if (r.kind !== kind) continue;
    if (set && !set.has(String(r.game_key))) continue;
    const id = String(r.target_id);
    if (!agg[id]) agg[id] = { sum: 0, n: 0 };
    agg[id].sum += Number(r.score) || 0;
    agg[id].n += 1;
  }
  const out = {};
  for (const id in agg) out[id] = { avg: agg[id].sum / agg[id].n, votes: agg[id].n };
  return out;
}

// Média por jogador (desempenho). gameKeys = jogos do campeonato (ou vazio = tudo).
export function playerRatingAverages(rows, gameKeys = null) {
  return aggregateByTarget(rows, 'desempenho', gameKeys);
}

// Média por dupla (churrasco). gameKeys = jogos do ciclo (ou vazio = tudo).
export function duoRatingAverages(rows, gameKeys = null) {
  return aggregateByTarget(rows, 'churrasco', gameKeys);
}

// Lê votos (filtra por kind e/ou game_key). Sem filtro, traz tudo.
export async function fetchRatings({ kind = null, gameKey = null } = {}) {
  const { url, anonKey } = getSupabase();
  if (!url || !anonKey) return { ok: false, reason: 'not_configured', rows: [] };
  const params = ['select=kind,game_key,voter_id,target_id,score,created_at'];
  if (kind) params.push(`kind=eq.${encodeURIComponent(kind)}`);
  if (gameKey) params.push(`game_key=eq.${encodeURIComponent(gameKey)}`);
  try {
    const resp = await fetch(`${url}/rest/v1/ratings?${params.join('&')}`, { method: 'GET', headers: headers() });
    if (!resp.ok) return { ok: false, reason: `load_${resp.status}`, rows: [] };
    const rows = await resp.json().catch(() => []);
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    console.warn('[ratings] falha ao ler votos:', error);
    return { ok: false, reason: 'network', rows: [] };
  }
}
