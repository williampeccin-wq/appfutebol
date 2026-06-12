// Lembrete diário de mensalidade em atraso (Web Push).
//
// Quem dispara: o cron do Supabase (pg_cron + pg_net), 1x/dia às 10:00 UTC
// (= 07:00 de Brasília). Também aceita disparo manual de um admin (botão de
// teste no app), para validar sem esperar o horário.
//
// Regra do atrasado (espelha rules.engine do app):
//   - joga futebol (data.plays_football !== false) e não é "só carne"
//   - data.mens_ok === false  (explicitamente inadimplente)
//   - hoje (BRT) já passou do vencimento global (app_meta.data.settings.mens_expire_date)
//
// Auditoria: cada envio vira uma linha em push_log (status sent/failed/expired).
// A entrega no aparelho e a abertura chegam depois, via push-receipt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Data de hoje em Brasília (UTC-3, sem horário de verão desde 2019), formato YYYY-MM-DD.
function todayBrtIso(): string {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

const KIND = "mensalidade_atrasada";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@harmonia.app";
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: "vapid_not_configured" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // --- Autorização: cron (x-cron-secret) OU admin logado (JWT -> players.is_admin) ---
  const cronSecret = req.headers.get("x-cron-secret") || "";
  let authorized = false;
  if (CRON_SECRET && cronSecret && cronSecret === CRON_SECRET) {
    authorized = true;
  } else {
    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader && authHeader !== `Bearer ${ANON}`) {
      const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
      const { data: userData } = await userClient.auth.getUser();
      const user = userData?.user;
      if (user) {
        const { data: player } = await admin.from("players").select("is_admin").eq("auth_user_id", user.id).maybeSingle();
        if (player?.is_admin) authorized = true;
      }
    }
  }
  if (!authorized) return json({ error: "unauthorized" }, 401);

  // `force`: ignora a deduplicação do dia (usado no teste manual do admin).
  let force = false;
  try {
    const payload = await req.json();
    force = payload?.force === true;
  } catch (_) { /* corpo vazio = cron */ }

  // --- 1) Vencimento global ---
  const { data: metaRow, error: metaErr } = await admin
    .from("app_meta").select("data").eq("key", "default").maybeSingle();
  if (metaErr) return json({ error: "meta_query_failed", detail: metaErr.message }, 500);
  const settings = (metaRow?.data as Record<string, unknown> | null)?.settings as Record<string, unknown> | undefined;
  const dueDate = String(settings?.mens_expire_date || "").slice(0, 10);
  const today = todayBrtIso();

  if (!dueDate) return json({ ok: true, skipped: "sem_vencimento_definido", overdue: 0, sent: 0 });
  if (today <= dueDate) return json({ ok: true, skipped: "ainda_nao_venceu", dueDate, today, overdue: 0, sent: 0 });

  // --- 2) Jogadores em atraso ---
  const { data: players, error: playersErr } = await admin.from("players").select("id, data");
  if (playersErr) return json({ error: "players_query_failed", detail: playersErr.message }, 500);

  const overdue = (players || []).filter((row) => {
    const d = (row.data || {}) as Record<string, unknown>;
    const carneOnly = d.role === "carne" || d.plays_football === false;
    const playsFootball = d.plays_football !== false && !carneOnly;
    return playsFootball && d.mens_ok === false;
  });

  if (!overdue.length) return json({ ok: true, dueDate, today, overdue: 0, sent: 0 });

  // --- 3) Dedup do dia (a menos que force) ---
  let alreadyToday = new Set<string>();
  if (!force) {
    const { data: todays } = await admin
      .from("push_log").select("player_id")
      .eq("kind", KIND).gte("sent_at", `${today}T00:00:00Z`);
    alreadyToday = new Set((todays || []).map((r) => String(r.player_id)));
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const receiptUrl = `${SUPABASE_URL}/functions/v1/push-receipt`;

  let sent = 0, failed = 0, removed = 0, targets = 0;
  for (const row of overdue) {
    const playerId = String(row.id);
    if (alreadyToday.has(playerId)) continue;
    const d = (row.data || {}) as Record<string, unknown>;
    const firstName = String(d.name || "").split(" ")[0] || "jogador";

    const { data: subs } = await admin
      .from("push_subscriptions").select("endpoint, p256dh, auth").eq("player_id", playerId);
    if (!subs || !subs.length) continue;

    const title = "Harmonia FC — mensalidade";
    const body = `Oi, ${firstName}! Sua mensalidade está em atraso. Fala com o ADM do grupo pra acertar e evitar bloqueios. 💛⚽`;

    for (const sub of subs) {
      targets += 1;
      // Cria a linha de log antes do envio para ter o id (referência dos recibos).
      const { data: logRow } = await admin
        .from("push_log")
        .insert({ kind: KIND, player_id: playerId, endpoint: sub.endpoint, title, body, status: "sent" })
        .select("id").single();
      const logId = logRow?.id || null;

      const notification = JSON.stringify({ title, body, url: "./", logId, receiptUrl });
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

  return json({ ok: true, dueDate, today, overdue: overdue.length, targets, sent, failed, removed });
});
