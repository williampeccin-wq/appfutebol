// Gravação de votos (notas) com autoridade no SERVIDOR.
//
// Por que existe: a tabela public.ratings tinha RLS using(true), então qualquer
// um com a anon key (pública) podia inserir voto com voter_id arbitrário, fora
// da janela, em qualquer alvo — e, como o sorteio usa as médias, dava p/ enviesar
// os times. Agora o cliente NÃO grava direto: chama esta função, que resolve o
// voter_id pelo JWT, valida a janela/participação e grava via service_role.
//
// Ações:
//   (padrão)            -> registra voto(s): { kind, game_key, votes:[{target_id,score}] }
//   action:"delete_game"-> admin apaga os votos de um jogo: { action, game_key }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS restrito às origens do app (Cloudflare Pages do projeto + domínio próprio
// futuro + localhost). Origem não reconhecida não recebe Allow-Origin → o
// navegador bloqueia. Cron/servidor não manda Origin e ignora CORS.
const ALLOWED_ORIGIN = (o: string): boolean =>
  /^https?:\/\/localhost(:\d+)?$/i.test(o)
  || /^https:\/\/([a-z0-9-]+\.)*harmoniafc-prod\.pages\.dev$/i.test(o)
  || /^https:\/\/([a-z0-9-]+\.)*convocados-44x\.pages\.dev$/i.test(o)
  || /^https:\/\/([a-z0-9-]+\.)*convocados\.app\.br$/i.test(o);
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGIN(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function churrascoOpenMs(date: string): number {
  const d = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return NaN;
  return Date.parse(`${d}T23:00:00-03:00`);
}

// Coluna ausente (42703 no Postgres, PGRST204 no schema cache do PostgREST). O
// harmonia-fc nunca recebeu as migrations do multi-tenant: lá nenhuma tabela tem
// club_id. Sem esta tolerância, a versão club-scoped derruba a votação inteira —
// e era o que impedia de levar para lá a regra nova da janela de desempenho.
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);
function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code && MISSING_COLUMN_CODES.has(err.code)) return true;
  return /column .* does not exist|could not find the .* column/i.test(String(err.message || ""));
}


// ---- Dupla do churrasco: espelho de getChurrascoDuo (domain/carne.js) ----
//
// O alvo do voto de churrasco NAO era validado: qualquer string virava uma dupla
// avaliada, poluindo o ranking da carne (ACHADO da auditoria de 20/08). Aqui o
// servidor recalcula qual dupla era a responsavel pelo jogo e compara.
//
// A chave e o MESMO formato do cliente: os dois ids ordenados, unidos por "|".
// O meio-dia no calculo de dias existe para nao virar a data por fuso — e como a
// diferenca e entre duas datas ao meio-dia, o fuso se cancela e o resultado bate
// com o do navegador.
//
// Prioridade, igual ao cliente: escala datada (carne_schedule) > rodizio.
const MAX_VOTES = 100;

function diffDays(aIso: string, bIso: string): number {
  const noon = (iso: string) => Date.parse(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return Math.round((noon(aIso) - noon(bIso)) / 86400000);
}
function duoKeyOf(a: unknown, b: unknown): string {
  return [String(a), String(b)].sort().join("|");
}
function churrascoDuoKey(data: Record<string, unknown>, gameDate: string): string | null {
  const iso = String(gameDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const carne = Array.isArray(data.carne) ? data.carne as Array<Record<string, unknown>> : [];

  const escala = carne.find((e) =>
    e?.type === "carne_schedule" && String(e?.date || "").slice(0, 10) === iso);
  if (escala) return duoKeyOf(escala.player1_id, escala.player2_id);

  const rodizio = carne.find((e) => e?.type === "carne_rotation") as Record<string, unknown> | undefined;
  const pares = Array.isArray(rodizio?.pairs) ? rodizio!.pairs as Array<Record<string, unknown>> : [];
  const inicio = String(rodizio?.start_date || "").slice(0, 10);
  if (!pares.length || !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return null;

  const semana = Math.round(diffDays(iso, inicio) / 7);
  const idx = ((semana % pares.length) + pares.length) % pares.length;
  const par = pares[idx];
  return par ? duoKeyOf(par.player1_id, par.player2_id) : null;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!SERVICE_ROLE) return json({ ok: false, error: "service_role_not_configured" }, 500);

  // Identifica o votante pelo token (exige login; bloqueia anônimo/anon key).
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt || jwt === ANON) return json({ ok: false, error: "unauthorized" }, 401);

  let userId = "";
  try {
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data?.user) return json({ ok: false, error: "unauthorized" }, 401);
    userId = data.user.id;
  } catch (_) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // Espelha isCarneOnly() do domain/authz.js: sócio que não joga, só participa
  // do churrasco. Ele NÃO confirma presença (não há o que confirmar), mas come o
  // churrasco e avalia a dupla — por isso é a única exceção à regra de "só quem
  // esteve no jogo vota".
  type Voter = { id?: string; is_admin?: boolean; club_id?: string; data?: Record<string, unknown> | null };
  const ehSocioDeCarne = (p: Voter | null) => {
    const d = (p?.data || {}) as Record<string, unknown>;
    return d.role === "carne" || d.plays_football === false;
  };

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let singleTenant = false;
  const voterRead = await admin
    .from("players").select("id, is_admin, club_id, data").eq("auth_user_id", userId).maybeSingle();
  let voter = voterRead.data as Voter | null;
  if (voterRead.error && isMissingColumn(voterRead.error)) {
    singleTenant = true;
    const fallback = await admin
      .from("players").select("id, is_admin, data").eq("auth_user_id", userId).maybeSingle();
    voter = fallback.data as Voter | null;
  }
  if (!voter) return json({ ok: false, error: "player_not_found" }, 403);
  const voterId = String(voter.id);
  const clubId = String(voter.club_id || "");        // multi-tenant: clube do votante
  if (!clubId && !singleTenant) return json({ ok: false, error: "player_not_found" }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* corpo inválido */ }

  // ----- Admin: apaga votos de um jogo (limpeza ao excluir o jogo) -----
  if (body.action === "delete_game") {
    if (!voter.is_admin) return json({ ok: false, error: "forbidden" }, 403);
    const gameKey = String(body.game_key || "").trim();
    if (!gameKey) return json({ ok: false, error: "missing_game_key" }, 400);
    const delQuery = admin.from("ratings").delete().eq("game_key", gameKey);
    const { error } = await (singleTenant ? delQuery : delQuery.eq("club_id", clubId));
    if (error) { console.error("[submit-rating] delete:", error.message); return json({ ok: false, error: "delete_failed" }, 500); }
    return json({ ok: true, deleted_game: gameKey });
  }

  // ----- "Já votei?" (sem expor voter_id no cliente) -----
  if (body.action === "has_voted") {
    const k = String(body.kind || "");
    const gk = String(body.game_key || "").trim();
    if (!gk || (k !== "desempenho" && k !== "churrasco")) return json({ ok: false, error: "bad_request" }, 400);
    const mineQuery = admin.from("ratings").select("id")
      .eq("kind", k).eq("game_key", gk).eq("voter_id", voterId);
    const { data: mine } = await (singleTenant ? mineQuery : mineQuery.eq("club_id", clubId))
      .limit(1).maybeSingle();
    return json({ ok: true, voted: !!mine });
  }

  // ----- Voto -----
  const kind = String(body.kind || "");
  const gameKey = String(body.game_key || "").trim();
  const votes = Array.isArray(body.votes) ? body.votes as Array<Record<string, unknown>> : [];
  if (kind !== "desempenho" && kind !== "churrasco") return json({ ok: false, error: "invalid_kind" }, 400);
  if (!gameKey) return json({ ok: false, error: "missing_game_key" }, 400);
  if (!votes.length) return json({ ok: false, error: "no_votes" }, 400);
  // Sem teto, uma requisicao podia criar centenas de linhas de uma vez.
  if (votes.length > MAX_VOTES) return json({ ok: false, error: "too_many_votes" }, 400);

  // Estado: settings (janela) + o jogo — blob por club_id (não mais 'default'). No
  // projeto single-tenant a chave não é conhecida: cai para 'default' e, não achando,
  // para o blob único. Com mais de um blob não adivinha nada.
  let metaRow = (await admin.from("app_meta").select("data").eq("key", clubId || "default").maybeSingle()).data;
  if (!metaRow && singleTenant) {
    const { data: metaRows } = await admin.from("app_meta").select("data").limit(2);
    if (metaRows && metaRows.length === 1) metaRow = metaRows[0];
  }
  const data = (metaRow?.data || {}) as Record<string, unknown>;
  const settings = (data.settings || {}) as Record<string, unknown>;
  const games = Array.isArray(data.games) ? data.games as Array<Record<string, unknown>> : [];
  const game = games.find((g) => String(g.game_key || g.id || "") === gameKey);
  if (!game) return json({ ok: false, error: "game_not_found" }, 404);

  const nowMs = Date.now();

  // Quem esteve no jogo (confirmado). Aceita os dois formatos de confirmação do
  // sistema (status='confirmed' OU data.confirmed===true), igual à
  // notify-waitlist-promotion. Vale para os dois tipos de voto — no churrasco
  // com a exceção do sócio de carnê (ver ehSocioDeCarne). O churrasco era aberto
  // a qualquer jogador autenticado do clube: no jogo de 26/08, 3 dos 9 votos
  // vieram de quem não estava lá, e só 1 dos 3 era sócio de carnê.
  async function quemEstavaNoJogo(): Promise<Set<string>> {
    const { data: confs } = await admin
      .from("presence_confirmations").select("player_id, status, data").eq("game_key", gameKey);
    return new Set((confs || [])
      .filter((c) => c.status === "confirmed" || (c?.data as Record<string, unknown> | null)?.confirmed === true)
      .map((c) => String(c.player_id)));
  }

  let confirmedIds: Set<string> | null = null;
  let duoEsperado: string | null = null;
  if (kind === "desempenho") {
    const perfHours = Number(settings.ratings_perf_window_hours) || 0;
    if (perfHours <= 0) return json({ ok: false, error: "voting_closed" }, 403);
    const gameDate = String(game.game_date || "").slice(0, 10);
    if (!gameDate) return json({ ok: false, error: "voting_closed" }, 403);
    // Janela abre quando o admin LANÇA o resultado — espelha getPerfWindow() no cliente.
    const active = ((data.championship || {}) as Record<string, unknown>).active as Record<string, unknown> | null;
    const results = Array.isArray(active?.results) ? active!.results as Array<Record<string, unknown>> : [];
    const resultMs = results
      .filter((r) => String(r?.date || "").slice(0, 10) === gameDate)
      .map((r) => Date.parse(String(r?.created_at || "")))
      .filter((ms) => Number.isFinite(ms))
      .sort((a, b) => b - a)[0];
    if (!resultMs) return json({ ok: false, error: "voting_closed" }, 403);
    const open = resultMs;
    const close = open + perfHours * 3600_000;
    if (nowMs < open || nowMs > close) return json({ ok: false, error: "voting_closed" }, 403);
    // Serve para validar o votante E os alvos.
    confirmedIds = await quemEstavaNoJogo();
    if (!confirmedIds.has(voterId)) return json({ ok: false, error: "voter_not_in_game" }, 403);
  } else {
    const openMs = churrascoOpenMs(String(game.game_date || ""));
    if (!openMs) return json({ ok: false, error: "voting_closed" }, 403);
    const closeMs = openMs + 13 * 3600_000; // 23h -> 12h do dia seguinte
    if (nowMs < openMs || nowMs > closeMs) return json({ ok: false, error: "voting_closed" }, 403);
    // Quem nao esteve no jogo nao avalia o churrasco do jogo. Mesma regra do
    // desempenho, mesma fonte de verdade. CONSEQUENCIA CONHECIDA: perfil so de
    // churrasco (plays_football: false) nao confirma presenca e deixa de votar.
    const presentes = await quemEstavaNoJogo();
    if (!presentes.has(voterId) && !ehSocioDeCarne(voter)) {
      return json({ ok: false, error: "voter_not_in_game" }, 403);
    }
    // Alvo tem de ser a dupla REAL do jogo. Quando o servidor nao consegue
    // determinar a dupla (sem escala e sem rodizio no blob), aceita: recusar um
    // voto legitimo por divergencia de calculo e pior do que deixar passar um
    // alvo que ninguem consegue forjar sem ser jogador autenticado do clube.
    duoEsperado = churrascoDuoKey(data, String(game.game_date || ""));
  }

  const rows: Array<Record<string, unknown>> = [];
  const nowIso = new Date().toISOString();
  for (const v of votes) {
    const target = String(v?.target_id || "").trim();
    const score = Math.round(Number(v?.score));
    if (!target) continue;
    if (!Number.isFinite(score) || score < 1 || score > 10) return json({ ok: false, error: "invalid_score" }, 400);
    if (kind === "desempenho") {
      if (target === voterId) continue;                    // não vota em si mesmo
      if (confirmedIds && !confirmedIds.has(target)) continue; // só avalia quem jogou
    }
    if (kind === "churrasco" && duoEsperado && target !== duoEsperado) {
      // Erro explicito em vez de descartar em silencio: um alvo que nao bate com
      // a dupla do jogo e bug de cliente ou tentativa de poluir o ranking, e nos
      // dois casos e melhor aparecer.
      return json({ ok: false, error: "invalid_target" }, 400);
    }
    const row: Record<string, unknown> = { kind, game_key: gameKey, voter_id: voterId, target_id: target, score, updated_at: nowIso };
    if (!singleTenant) row.club_id = clubId; // coluna inexistente no projeto single-tenant
    rows.push(row);
  }
  if (!rows.length) return json({ ok: false, error: "no_votes" }, 400);

  // Upsert (service_role ignora RLS). on_conflict permite corrigir o voto na janela.
  const { error } = await admin.from("ratings").upsert(rows, { onConflict: "kind,game_key,voter_id,target_id" });
  if (error) { console.error("[submit-rating] upsert:", error.message); return json({ ok: false, error: "save_failed" }, 500); }
  return json({ ok: true, count: rows.length });
});
