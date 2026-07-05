// Cron de 5 min (Web Push). Faz três coisas, todas idempotentes e controladas
// pela Central de Notificações (app_meta.data.settings.notifications):
//   1) Abre inscrições de jogos com auto_open_at vencido e avisa todos.
//   2) Avisa quem jogou quando abre a votação de DESEMPENHO (1h após o jogo).
//   3) Avisa todos quando abre a votação do CHURRASCO (23h do dia do jogo).
// Cada aviso é único por jogo (índices uq_push_log_open / uq_push_log_voting).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// CORS por allowlist de Origin (consistente com as demais funções), em vez de
// wildcard "*". Na prática esta função é cron-only (exige x-cron-secret) e
// server-to-server nem usa CORS — mas restringir é higiene/defesa em profundidade.
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

const KIND_OPEN = "inscricoes_abertas";
const KIND_PERF = "votacao_desempenho";
const KIND_CHURR = "votacao_churrasco";

function nowBrtMinute(): string {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 16);
}
function formatGameDate(raw: string): string {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : s;
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
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@harmonia.app";
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: "vapid_not_configured" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const { data: metaRow, error: metaErr } = await admin
    .from("app_meta").select("data, updated_at").eq("key", "default").maybeSingle();
  if (metaErr) { console.error("[auto-open] meta read:", metaErr.message); return json({ error: "meta_query_failed" }, 500); }

  const data = (metaRow?.data || {}) as Record<string, unknown>;
  const prevUpdatedAt = metaRow?.updated_at;
  const settings = (data.settings || {}) as Record<string, unknown>;
  const notif = (settings.notifications || {}) as Record<string, boolean>;
  const enabled = (k: string) => notif[k] !== false; // ausente = ligado
  const games = Array.isArray(data.games) ? (data.games as Array<Record<string, unknown>>) : [];
  const nowMs = Date.now();

  // Envia uma notificação para uma lista de inscrições; remove as mortas.
  async function pushTo(subs: Array<{ endpoint: string; p256dh: string; auth: string }>, title: string, body: string) {
    const payload = JSON.stringify({ title, body, url: "./" });
    let sent = 0, removed = 0;
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        sent += 1;
      } catch (err) {
        const sc = (err as { statusCode?: number })?.statusCode;
        if (sc === 404 || sc === 410) { await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); removed += 1; }
      }
    }
    return { sent, removed };
  }
  // Insere a linha de dedup; true se é a primeira vez (deve enviar).
  async function claim(kind: string, gameKey: string, title: string, body: string): Promise<boolean> {
    const { error } = await admin.from("push_log").insert({ kind, game_key: gameKey, title, body, status: "sent" });
    if (error) return false; // 23505 (já enviado) ou outro erro → não envia
    return true;
  }

  const out: Record<string, unknown> = { now: nowBrtMinute(), opened: 0, perf: 0, churrasco: 0 };

  // ---------- 1) Abertura automática de inscrições ----------
  const nowBrt = nowBrtMinute();
  const toOpen: Array<Record<string, unknown>> = [];
  const nextGames = games.map((g) => {
    const at = String(g?.auto_open_at || "").slice(0, 16);
    if (at && g?.open !== true && nowBrt >= at) { toOpen.push(g); return { ...g, open: true }; }
    return g;
  });
  if (toOpen.length) {
    const { data: upd, error: upErr } = await admin
      .from("app_meta")
      .update({ data: { ...data, games: nextGames }, updated_at: new Date().toISOString() })
      .eq("key", "default").eq("updated_at", prevUpdatedAt).select("key");
    if (upErr) { console.error("[auto-open] meta write:", upErr.message); return json({ error: "meta_update_failed" }, 500); }
    if (upd && upd.length) {
      out.opened = toOpen.length;
      if (enabled(KIND_OPEN)) {
        const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth");
        for (const g of toOpen) {
          const gameKey = String(g.game_key || g.id || "");
          const title = "Inscrições abertas ⚽";
          const body = `Já dá para confirmar presença no jogo${g.game_date ? ` de ${formatGameDate(String(g.game_date))}` : ""}.`;
          if (await claim(KIND_OPEN, gameKey, title, body)) await pushTo(subs || [], title, body);
        }
      }
    } else {
      out.skipped = "concurrent_write";
    }
  }

  // ---------- 2) Votação de desempenho (1h após o jogo) → quem jogou ----------
  const perfHours = Number(settings.ratings_perf_window_hours) || 0;
  if (enabled(KIND_PERF) && perfHours > 0) {
    for (const g of games) {
      const start = gameStartMs(String(g.game_date || ""), String(g.game_time || ""));
      if (!start) continue;
      const open = start + 3600_000;
      const close = open + perfHours * 3600_000;
      if (nowMs < open || nowMs > close) continue;
      const gameKey = String(g.game_key || g.id || "");
      const title = "Hora de votar ⭐";
      const body = `Dê as notas de desempenho do jogo${g.game_date ? ` de ${formatGameDate(String(g.game_date))}` : ""}.`;
      if (!(await claim(KIND_PERF, gameKey, title, body))) continue;
      const { data: confs } = await admin
        .from("presence_confirmations").select("player_id").eq("game_key", gameKey).eq("status", "confirmed");
      const ids = [...new Set((confs || []).map((c) => String(c.player_id)).filter(Boolean))];
      if (!ids.length) continue;
      const { data: subs } = await admin
        .from("push_subscriptions").select("endpoint, p256dh, auth").in("player_id", ids);
      const r = await pushTo(subs || [], title, body);
      out.perf = (out.perf as number) + 1; out.perfSent = r.sent;
    }
  }

  // ---------- 3) Votação do churrasco (23h do dia do jogo) → todos ----------
  if (enabled(KIND_CHURR)) {
    for (const g of games) {
      const openMs = churrascoOpenMs(String(g.game_date || ""));
      if (!openMs) continue;
      const closeMs = openMs + 13 * 3600_000; // 23h → 12h do dia seguinte
      if (nowMs < openMs || nowMs > closeMs) continue;
      const gameKey = String(g.game_key || g.id || "");
      const title = "Vote no churrasco 🥩🔥";
      const body = `Dê a nota da dupla da carne${g.game_date ? ` do jogo de ${formatGameDate(String(g.game_date))}` : ""}.`;
      if (!(await claim(KIND_CHURR, gameKey, title, body))) continue;
      const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth");
      const r = await pushTo(subs || [], title, body);
      out.churrasco = (out.churrasco as number) + 1; out.churrSent = r.sent;
    }
  }

  return json({ ok: true, ...out });
});
