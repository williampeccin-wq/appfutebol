// Registra/atualiza a inscrição de Web Push do usuário logado, com autoridade
// no servidor (service_role). Resolve o DONO (auth_user_id) e o player_id pelo
// JWT — então um upsert por endpoint sempre recarimba o dono correto. Isso
// conserta o caso de troca de usuário no mesmo aparelho/endpoint (com as
// policies por dono, o PATCH do cliente falhava em silêncio).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { return json({ ok: false, error: "bad_request" }, 400); }
  const endpoint = String(body.endpoint || "").trim();
  const p256dh = String(body.p256dh || "").trim();
  const auth = String(body.auth || "").trim();
  const userAgent = String(body.user_agent || "").slice(0, 300);
  if (!endpoint || !p256dh || !auth) return json({ ok: false, error: "missing_fields" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // player_id e club_id autoritativos: do jogador dono do JWT (não confia no corpo).
  const { data: player } = await admin
    .from("players").select("id, club_id").eq("auth_user_id", userId).maybeSingle();
  const playerId = player?.id ? String(player.id) : null;

  // O club_id é o que isola o push entre clubes. Sem gravá-lo, a coluna assume o
  // DEFAULT (clube-semente) e a inscrição passa a receber push de outro clube —
  // e o envio escopado do clube real não a encontra (notificação morta).
  const subscription: Record<string, unknown> = {
    endpoint,
    player_id: playerId,
    auth_user_id: userId,
    p256dh,
    auth,
    user_agent: userAgent,
    updated_at: new Date().toISOString(),
  };
  if (player?.club_id) subscription.club_id = player.club_id;

  const { error } = await admin.from("push_subscriptions").upsert(subscription, { onConflict: "endpoint" });
  if (error) { console.error("[register-push] upsert:", error.message); return json({ ok: false, error: "save_failed" }, 500); }
  return json({ ok: true });
});
