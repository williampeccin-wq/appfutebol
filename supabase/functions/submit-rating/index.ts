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
  || /^https:\/\/([a-z0-9-]+\.)*convocados-[a-z0-9]+\.pages\.dev$/i.test(o)
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

// Início do jogo em ms (UTC) a partir de data+hora locais (BRT, -03:00).
function gameStartMs(date: string, time: string): number {
  const d = String(date || "").slice(0, 10);
  const t = String(time || "").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return NaN;
  return Date.parse(`${d}T${t}:00-03:00`);
}
function churrascoOpenMs(date: string): number {
  const d = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return NaN;
  return Date.parse(`${d}T23:00:00-03:00`);
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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: voter } = await admin
    .from("players").select("id, is_admin, club_id").eq("auth_user_id", userId).maybeSingle();
  if (!voter) return json({ ok: false, error: "player_not_found" }, 403);
  const voterId = String(voter.id);
  const clubId = String(voter.club_id || "");        // multi-tenant: clube do votante
  if (!clubId) return json({ ok: false, error: "player_not_found" }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* corpo inválido */ }

  // ----- Admin: apaga votos de um jogo (limpeza ao excluir o jogo) -----
  if (body.action === "delete_game") {
    if (!voter.is_admin) return json({ ok: false, error: "forbidden" }, 403);
    const gameKey = String(body.game_key || "").trim();
    if (!gameKey) return json({ ok: false, error: "missing_game_key" }, 400);
    const { error } = await admin.from("ratings").delete().eq("game_key", gameKey).eq("club_id", clubId);
    if (error) { console.error("[submit-rating] delete:", error.message); return json({ ok: false, error: "delete_failed" }, 500); }
    return json({ ok: true, deleted_game: gameKey });
  }

  // ----- "Já votei?" (sem expor voter_id no cliente) -----
  if (body.action === "has_voted") {
    const k = String(body.kind || "");
    const gk = String(body.game_key || "").trim();
    if (!gk || (k !== "desempenho" && k !== "churrasco")) return json({ ok: false, error: "bad_request" }, 400);
    const { data: mine } = await admin.from("ratings").select("id")
      .eq("kind", k).eq("game_key", gk).eq("voter_id", voterId).eq("club_id", clubId).limit(1).maybeSingle();
    return json({ ok: true, voted: !!mine });
  }

  // ----- Voto -----
  const kind = String(body.kind || "");
  const gameKey = String(body.game_key || "").trim();
  const votes = Array.isArray(body.votes) ? body.votes as Array<Record<string, unknown>> : [];
  if (kind !== "desempenho" && kind !== "churrasco") return json({ ok: false, error: "invalid_kind" }, 400);
  if (!gameKey) return json({ ok: false, error: "missing_game_key" }, 400);
  if (!votes.length) return json({ ok: false, error: "no_votes" }, 400);

  // Estado: settings (janela) + o jogo — blob por club_id (não mais 'default')
  const { data: metaRow } = await admin.from("app_meta").select("data").eq("key", clubId).maybeSingle();
  const data = (metaRow?.data || {}) as Record<string, unknown>;
  const settings = (data.settings || {}) as Record<string, unknown>;
  const games = Array.isArray(data.games) ? data.games as Array<Record<string, unknown>> : [];
  const game = games.find((g) => String(g.game_key || g.id || "") === gameKey);
  if (!game) return json({ ok: false, error: "game_not_found" }, 404);

  const nowMs = Date.now();

  let confirmedIds: Set<string> | null = null;
  if (kind === "desempenho") {
    const perfHours = Number(settings.ratings_perf_window_hours) || 0;
    const start = gameStartMs(String(game.game_date || ""), String(game.game_time || ""));
    if (!start || perfHours <= 0) return json({ ok: false, error: "voting_closed" }, 403);
    const open = start + 3600_000;
    const close = open + perfHours * 3600_000;
    if (nowMs < open || nowMs > close) return json({ ok: false, error: "voting_closed" }, 403);
    // Quem jogou (confirmado neste jogo). Aceita os dois formatos de confirmação
    // do sistema (status='confirmed' OU data.confirmed===true), igual à
    // notify-waitlist-promotion. Serve para validar o votante E os alvos.
    const { data: confs } = await admin
      .from("presence_confirmations").select("player_id, status, data").eq("game_key", gameKey);
    confirmedIds = new Set((confs || [])
      .filter((c) => c.status === "confirmed" || (c?.data as Record<string, unknown> | null)?.confirmed === true)
      .map((c) => String(c.player_id)));
    if (!confirmedIds.has(voterId)) return json({ ok: false, error: "voter_not_in_game" }, 403);
  } else {
    const openMs = churrascoOpenMs(String(game.game_date || ""));
    if (!openMs) return json({ ok: false, error: "voting_closed" }, 403);
    const closeMs = openMs + 13 * 3600_000; // 23h -> 12h do dia seguinte
    if (nowMs < openMs || nowMs > closeMs) return json({ ok: false, error: "voting_closed" }, 403);
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
    rows.push({ kind, game_key: gameKey, voter_id: voterId, target_id: target, score, club_id: clubId, updated_at: nowIso });
  }
  if (!rows.length) return json({ ok: false, error: "no_votes" }, 400);

  // Upsert (service_role ignora RLS). on_conflict permite corrigir o voto na janela.
  const { error } = await admin.from("ratings").upsert(rows, { onConflict: "kind,game_key,voter_id,target_id" });
  if (error) { console.error("[submit-rating] upsert:", error.message); return json({ ok: false, error: "save_failed" }, 500); }
  return json({ ok: true, count: rows.length });
});
