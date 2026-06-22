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

// Grava os votos de um votante via Edge Function submit-rating (autoridade no
// servidor: o voter_id vem do JWT, não do cliente; a janela/participação é
// validada lá). O cliente NÃO grava direto na tabela (RLS bloqueia a escrita).
// `rows`: [{ kind, game_key, target_id, score }] — todos do mesmo kind/jogo.
export async function submitRatings(rows) {
  const { url, anonKey } = getSupabase();
  if (!url || !anonKey) return { ok: false, reason: 'not_configured' };
  const clean = (Array.isArray(rows) ? rows : []).filter((r) =>
    r && r.kind && r.game_key && r.target_id
    && Number.isFinite(Number(r.score)) && Number(r.score) >= 1 && Number(r.score) <= 10);
  if (!clean.length) return { ok: false, reason: 'no_rows' };
  const kind = String(clean[0].kind);
  const gameKey = String(clean[0].game_key);
  const votes = clean.map((r) => ({ target_id: String(r.target_id), score: Math.round(Number(r.score)) }));
  try {
    const resp = await fetch(`${url}/functions/v1/submit-rating`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ kind, game_key: gameKey, votes }),
    });
    const out = await resp.json().catch(() => ({}));
    if (!resp.ok || !out.ok) return { ok: false, reason: out.error || `save_${resp.status}` };
    return { ok: true, count: out.count };
  } catch (error) {
    console.warn('[ratings] falha ao salvar votos:', error);
    return { ok: false, reason: 'network' };
  }
}

// "Já votei neste jogo?" — resolvido no servidor pelo JWT (não expõe voter_id).
export async function checkHasVoted(kind, gameKey) {
  const { url, anonKey } = getSupabase();
  if (!url || !anonKey) return { ok: false, reason: 'not_configured' };
  try {
    const resp = await fetch(`${url}/functions/v1/submit-rating`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ action: 'has_voted', kind, game_key: gameKey }),
    });
    const out = await resp.json().catch(() => ({}));
    if (!resp.ok || !out.ok) return { ok: false, reason: out.error || `chk_${resp.status}` };
    return { ok: true, voted: !!out.voted };
  } catch (_) {
    return { ok: false, reason: 'network' };
  }
}

// Admin: remove os votos de um jogo (usado ao EXCLUIR o jogo, p/ os votos não
// continuarem contando na média/sorteio). Best-effort; via a mesma Edge Function.
export async function deleteGameRatings(gameKey) {
  const { url, anonKey } = getSupabase();
  if (!url || !anonKey || !gameKey) return { ok: false, reason: 'not_configured' };
  try {
    const resp = await fetch(`${url}/functions/v1/submit-rating`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ action: 'delete_game', game_key: String(gameKey) }),
    });
    const out = await resp.json().catch(() => ({}));
    return (resp.ok && out.ok) ? { ok: true } : { ok: false, reason: out.error || `del_${resp.status}` };
  } catch (_) {
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
  if (res.ok) { _cache.rows = res.rows; _cache.loaded = true; recomputeTopRated(); }
  return _cache;
}

// Jogador melhor votado (maior média de desempenho com um mínimo de votos).
// Computado quando o cache carrega; lido barato por cada avatar (áurea).
const TOP_MIN_VOTES = 3;
let _topRatedId = null;
function recomputeTopRated() {
  const avgs = playerRatingAverages(_cache.rows);
  let bestId = null, bestAvg = -1, bestVotes = 0;
  for (const id in avgs) {
    const { avg, votes } = avgs[id];
    if (votes < TOP_MIN_VOTES) continue;
    if (avg > bestAvg || (avg === bestAvg && votes > bestVotes)) { bestId = id; bestAvg = avg; bestVotes = votes; }
  }
  _topRatedId = bestId;
}
export function getTopRatedPlayerId() { return _topRatedId; }

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
  // Lê da VIEW pública (sem voter_id) — o anonimato do voto deixa de ser só de UI.
  const params = ['select=kind,game_key,target_id,score,created_at'];
  if (kind) params.push(`kind=eq.${encodeURIComponent(kind)}`);
  if (gameKey) params.push(`game_key=eq.${encodeURIComponent(gameKey)}`);
  try {
    const resp = await fetch(`${url}/rest/v1/ratings_public?${params.join('&')}`, { method: 'GET', headers: headers() });
    if (!resp.ok) return { ok: false, reason: `load_${resp.status}`, rows: [] };
    const rows = await resp.json().catch(() => []);
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    console.warn('[ratings] falha ao ler votos:', error);
    return { ok: false, reason: 'network', rows: [] };
  }
}
