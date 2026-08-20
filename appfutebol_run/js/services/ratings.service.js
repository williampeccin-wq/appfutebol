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

// Tamanho da página e teto de páginas. O teto existe só como rede: se o servidor
// ignorar o Range, o laço para em vez de repetir a primeira página para sempre.
const PAGINA = 1000;
const MAX_PAGINAS = 50;

// Lê votos (filtra por kind e/ou game_key). Sem filtro, traz tudo — PAGINANDO.
//
// Por que paginar: o PostgREST corta a resposta no teto de linhas do projeto
// (db-max-rows) SEM erro e SEM aviso — chega um pedaço e o cliente calcula a
// média como se fosse a tabela inteira. Essas médias alimentam o
// buildStrengthResolver, que equilibra os times no sorteio: truncar significa
// time desequilibrado e "melhor votado" errado, sem nada quebrar na tela.
// Medido em 20/08/2026: 992 linhas, oito abaixo do teto padrão de 1000.
export async function fetchRatings({ kind = null, gameKey = null } = {}) {
  const { url, anonKey } = getSupabase();
  if (!url || !anonKey) return { ok: false, reason: 'not_configured', rows: [] };
  // Lê da VIEW pública (sem voter_id) — o anonimato do voto deixa de ser só de UI.
  const params = ['select=kind,game_key,target_id,score,created_at'];
  if (kind) params.push(`kind=eq.${encodeURIComponent(kind)}`);
  if (gameKey) params.push(`game_key=eq.${encodeURIComponent(gameKey)}`);
  const alvo = `${url}/rest/v1/ratings_public?${params.join('&')}`;

  const rows = [];
  let primeiraDaPaginaAnterior = null;
  try {
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
      const de = pagina * PAGINA;
      const resp = await fetch(alvo, {
        method: 'GET',
        headers: { ...headers(), 'Range-Unit': 'items', Range: `${de}-${de + PAGINA - 1}` },
      });
      if (!resp.ok) return { ok: false, reason: `load_${resp.status}`, rows: [] };
      const lote = await resp.json().catch(() => []);
      if (!Array.isArray(lote) || !lote.length) break;

      // Servidor ignorando o Range devolve sempre o mesmo começo: para o laço em
      // vez de acumular a mesma página repetida.
      const primeira = JSON.stringify(lote[0]);
      if (primeiraDaPaginaAnterior !== null && primeira === primeiraDaPaginaAnterior) {
        console.warn('[ratings] o servidor ignorou o Range; leitura pode estar incompleta.');
        break;
      }
      primeiraDaPaginaAnterior = primeira;

      rows.push(...lote);
      if (lote.length < PAGINA) break; // última página
    }
    return { ok: true, rows };
  } catch (error) {
    console.warn('[ratings] falha ao ler votos:', error);
    return { ok: false, reason: 'network', rows: [] };
  }
}
