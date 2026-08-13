// Cron de 5 min (Web Push). Faz duas coisas, todas idempotentes e controladas
// pela Central de Notificações (app_meta.data.settings.notifications):
//   1) Abre inscrições de jogos com auto_open_at vencido e avisa todos.
//   2) Avisa todos quando abre a votação do CHURRASCO (23h do dia do jogo).
// O push de votação de DESEMPENHO é disparado pelo admin ao lançar resultado
// (send-push trigger_voting via app.js), não mais por este cron.
// Cada aviso é único por jogo (índices uq_push_log_open / uq_push_log_voting).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// CORS por allowlist de Origin (consistente com as demais funções), em vez de
// wildcard "*". Na prática esta função é cron-only (exige x-cron-secret) e
// server-to-server nem usa CORS — mas restringir é higiene/defesa em profundidade.
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

const KIND_OPEN = "inscricoes_abertas";
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
  // Insere a linha de dedup (POR CLUBE); true se é a primeira vez (deve enviar).
  async function claim(kind: string, gameKey: string, title: string, body: string, clubId: string): Promise<boolean> {
    const { error } = await admin.from("push_log").insert({ kind, game_key: gameKey, club_id: clubId, title, body, status: "sent" });
    if (error) return false; // 23505 (já enviado) ou outro erro → não envia
    return true;
  }

  const out: Record<string, unknown> = { now: nowBrtMinute(), clubs: 0, opened: 0, churrasco: 0 };
  const nowMs = Date.now();
  const nowBrt = nowBrtMinute();

  // Multi-tenant: itera TODOS os clubes; cada um tem seu blob app_meta key=club_id.
  const { data: clubList, error: clubErr } = await admin.from("clubs").select("id, plan");
  if (clubErr) { console.error("[auto-open] clubs read:", clubErr.message); return json({ error: "clubs_query_failed" }, 500); }

  for (const club of (clubList || [])) {
    const clubId = String(club.id);
    const isPro = String(club.plan || "free") === "pro";

    const { data: metaRow, error: metaErr } = await admin
      .from("app_meta").select("data, updated_at").eq("key", clubId).maybeSingle();
    if (metaErr) { console.error("[auto-open] meta read", clubId, metaErr.message); continue; }
    if (!metaRow) continue;

    const data = (metaRow.data || {}) as Record<string, unknown>;
    const prevUpdatedAt = metaRow.updated_at;
    const settings = (data.settings || {}) as Record<string, unknown>;
    const notif = (settings.notifications || {}) as Record<string, boolean>;
    const enabled = (k: string) => notif[k] !== false; // ausente = ligado
    const games = Array.isArray(data.games) ? (data.games as Array<Record<string, unknown>>) : [];
    out.clubs = (out.clubs as number) + 1;

    // ---------- 1) Abertura automática de inscrições (recurso PRO) ----------
    if (isPro) {
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
          .eq("key", clubId).eq("updated_at", prevUpdatedAt).select("key");
        if (upErr) { console.error("[auto-open] meta write", clubId, upErr.message); }
        else if (upd && upd.length) {
          out.opened = (out.opened as number) + toOpen.length;
          if (enabled(KIND_OPEN)) {
            const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("club_id", clubId);
            for (const g of toOpen) {
              const gameKey = String(g.game_key || g.id || "");
              const title = "Inscrições abertas ⚽";
              const body = `Já dá para confirmar presença no jogo${g.game_date ? ` de ${formatGameDate(String(g.game_date))}` : ""}.`;
              if (await claim(KIND_OPEN, gameKey, title, body, clubId)) await pushTo(subs || [], title, body);
            }
          }
        }
      }
    }

    // ---------- 2) Votação do churrasco (23h do dia do jogo) → todos ----------
    if (enabled(KIND_CHURR)) {
      for (const g of games) {
        const openMs = churrascoOpenMs(String(g.game_date || ""));
        if (!openMs) continue;
        const closeMs = openMs + 13 * 3600_000; // 23h → 12h do dia seguinte
        if (nowMs < openMs || nowMs > closeMs) continue;
        const gameKey = String(g.game_key || g.id || "");
        const title = "Vote no churrasco 🥩🔥";
        const body = `Dê a nota da dupla da carne${g.game_date ? ` do jogo de ${formatGameDate(String(g.game_date))}` : ""}.`;
        if (!(await claim(KIND_CHURR, gameKey, title, body, clubId))) continue;
        const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("club_id", clubId);
        await pushTo(subs || [], title, body);
        out.churrasco = (out.churrasco as number) + 1;
      }
    }
  }

  return json({ ok: true, ...out });
});
