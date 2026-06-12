// Abertura automática de inscrições (Web Push).
//
// Disparada pelo cron do Supabase a cada poucos minutos. Para cada jogo marcado
// com `auto_open_at` (data/hora de Brasília) cujo horário já chegou e que ainda
// está fechado, abre as inscrições (open=true em app_meta.data.games — a fonte
// autoritativa do flag) e avisa todos por push. Idempotente: depois de aberto,
// não reabre nem reavisa; o índice único uq_push_log_open garante 1 push por jogo.

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

const KIND = "inscricoes_abertas";

// Agora em Brasília (UTC-3), no formato "YYYY-MM-DDTHH:mm" para comparar com o
// datetime-local gravado pelo app (que também é horário local/BRT).
function nowBrtMinute(): string {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 16);
}

function formatGameDate(raw: string): string {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@harmonia.app";
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

  // Só o cron (segredo compartilhado) pode disparar.
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: "vapid_not_configured" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1) Lê os jogos e decide quais abrir.
  const { data: metaRow, error: metaErr } = await admin
    .from("app_meta").select("data").eq("key", "default").maybeSingle();
  if (metaErr) return json({ error: "meta_query_failed", detail: metaErr.message }, 500);

  const data = (metaRow?.data || {}) as Record<string, unknown>;
  const games = Array.isArray(data.games) ? (data.games as Array<Record<string, unknown>>) : [];
  const nowBrt = nowBrtMinute();

  const toOpen: Array<Record<string, unknown>> = [];
  const nextGames = games.map((g) => {
    const at = String(g?.auto_open_at || "").slice(0, 16);
    if (at && g?.open !== true && nowBrt >= at) {
      toOpen.push(g);
      return { ...g, open: true };
    }
    return g;
  });

  if (!toOpen.length) return json({ ok: true, now: nowBrt, opened: 0 });

  // 2) Persiste a abertura (read-modify-write curto; janela mínima).
  const { error: upErr } = await admin
    .from("app_meta")
    .update({ data: { ...data, games: nextGames }, updated_at: new Date().toISOString() })
    .eq("key", "default");
  if (upErr) return json({ error: "meta_update_failed", detail: upErr.message }, 500);

  // 3) Push para todos, com dedup por jogo.
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth");

  let pushedGames = 0, sent = 0, removed = 0, skippedDuplicate = 0;
  for (const g of toOpen) {
    const gameKey = String(g.game_key || g.id || "");
    const title = "Inscrições abertas ⚽";
    const body = `Já dá para confirmar presença no jogo${g.game_date ? ` de ${formatGameDate(String(g.game_date))}` : ""}.`;

    // Dedup: 1 linha por (kind, game_key).
    const { error: insErr } = await admin
      .from("push_log")
      .insert({ kind: KIND, game_key: gameKey, title, body, status: "sent" });
    if (insErr) {
      if ((insErr as { code?: string }).code === "23505") { skippedDuplicate += 1; continue; }
      continue;
    }
    pushedGames += 1;

    const notification = JSON.stringify({ title, body, url: "./" });
    for (const sub of subs || []) {
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
          removed += 1;
        }
      }
    }
  }

  return json({ ok: true, now: nowBrt, opened: toOpen.length, pushedGames, sent, removed, skippedDuplicate });
});
