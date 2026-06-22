// Aviso "entrou pela fila" (Web Push).
//
// Chamado pelo app quando alguém é promovido da fila de espera (cancelamento ou
// remoção pelo admin liberou vaga). Como a promoção pode ser detectada por mais
// de um cliente, este endpoint é idempotente:
//   1) VERIFICA no banco que o jogador está mesmo confirmado no jogo (anti-forja);
//   2) DEDUPLICA com INSERT no push_log protegido por índice único
//      (kind='fila_promovido', player_id, game_key) — só o 1º envia;
//   3) envia o push e registra (enviada/entregue/aberta via send-overdue-reminders).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const ALLOWED_ORIGIN = (o: string): boolean =>
  /^https?:\/\/localhost(:\d+)?$/i.test(o)
  || /^https:\/\/([a-z0-9-]+\.)*harmoniafc-prod\.pages\.dev$/i.test(o)
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

const KIND = "fila_promovido";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function formatGameDate(raw: string): string {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}`;
  return s; // já é string de exibição (ex.: "13/06/2026")
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@harmonia.app";

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: "vapid_not_configured" }, 500);

  let payload: { game_key?: string; player_ids?: string[] };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const gameKey = String(payload.game_key || "").trim();
  const playerIds = Array.isArray(payload.player_ids)
    ? [...new Set(payload.player_ids.map((id) => String(id || "")).filter(Boolean))].slice(0, 10)
    : [];
  if (!gameKey || !playerIds.length) return json({ error: "missing_game_or_players" }, 400);

  // Autorização: precisa ser um usuário logado (JWT válido) — só o anon key não
  // basta. Fecha o uso anônimo como oráculo de presença/spam. Qualquer membro
  // serve (a promoção é disparada por quem cancela, que pode não ser admin); a
  // verificação "está confirmado" abaixo + a dedup por índice único protegem.
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader || authHeader === `Bearer ${ANON}`) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Data do jogo (para a mensagem) — do app_meta.data.games.
  let gameDate = "";
  try {
    const { data: metaRow } = await admin.from("app_meta").select("data").eq("key", "default").maybeSingle();
    const games = ((metaRow?.data as Record<string, unknown> | null)?.games as Array<Record<string, unknown>> | undefined) || [];
    const g = games.find((x) => String(x?.game_key || x?.id || "") === gameKey);
    gameDate = formatGameDate(String(g?.date || ""));
  } catch (_) { /* mensagem sem data se falhar */ }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const receiptUrl = `${SUPABASE_URL}/functions/v1/send-overdue-reminders`;

  let notified = 0, skippedNotConfirmed = 0, skippedDuplicate = 0, sent = 0, failed = 0, removed = 0;

  for (const playerId of playerIds) {
    // 1) Anti-forja: precisa estar CONFIRMADO neste jogo. A gravação remota do
    //    cliente é assíncrona (debounce), então tentamos algumas vezes antes de
    //    desistir — assim a promoção recém-feita tem tempo de assentar no banco.
    let confirmed = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data: conf } = await admin
        .from("presence_confirmations")
        .select("status, data")
        .eq("game_key", gameKey).eq("player_id", playerId).maybeSingle();
      confirmed = conf?.status === "confirmed"
        || (conf?.data as Record<string, unknown> | null)?.confirmed === true;
      if (confirmed) break;
      if (attempt < 4) await sleep(1000);
    }
    if (!confirmed) { skippedNotConfirmed += 1; continue; }

    // Nome (para personalizar).
    const { data: pRow } = await admin.from("players").select("data").eq("id", playerId).maybeSingle();
    const firstName = String((pRow?.data as Record<string, unknown> | null)?.name || "").split(" ")[0] || "jogador";

    const title = "Você está dentro! ⚽";
    const body = `${firstName}, abriu uma vaga e você saiu da fila! Você está confirmado no jogo${gameDate ? ` de ${gameDate}` : ""}. Te esperamos em campo! 💛`;

    // 2) Dedup: o índice único (kind, player_id, game_key) garante 1 só envio.
    const { data: logRow, error: insErr } = await admin
      .from("push_log")
      .insert({ kind: KIND, player_id: playerId, game_key: gameKey, title, body, status: "sent" })
      .select("id").single();
    if (insErr) {
      // 23505 = unique_violation -> já foi notificado.
      if ((insErr as { code?: string }).code === "23505") { skippedDuplicate += 1; continue; }
      failed += 1; continue;
    }
    const logId = logRow?.id || null;
    notified += 1;

    // 3) Envia para todas as inscrições do jogador.
    const { data: subs } = await admin
      .from("push_subscriptions").select("endpoint, p256dh, auth").eq("player_id", playerId);
    if (!subs || !subs.length) continue;

    const notification = JSON.stringify({ title, body, url: "./", logId, receiptUrl, anonKey: ANON });
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notification,
        );
        sent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          if (logId) await admin.from("push_log").update({ status: "expired" }).eq("id", logId);
          removed += 1;
        } else {
          if (logId) await admin.from("push_log").update({ status: "failed", error: String((err as Error)?.message || statusCode) }).eq("id", logId);
          failed += 1;
        }
      }
    }
  }

  return json({ ok: true, notified, sent, failed, removed, skippedNotConfirmed, skippedDuplicate });
});
