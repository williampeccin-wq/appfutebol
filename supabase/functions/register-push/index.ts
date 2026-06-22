// Registra/atualiza a inscrição de Web Push do usuário logado, com autoridade
// no servidor (service_role). Resolve o DONO (auth_user_id) e o player_id pelo
// JWT — então um upsert por endpoint sempre recarimba o dono correto. Isso
// conserta o caso de troca de usuário no mesmo aparelho/endpoint (com as
// policies por dono, o PATCH do cliente falhava em silêncio).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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

  // player_id autoritativo: o jogador dono do JWT (não confia no corpo).
  const { data: player } = await admin
    .from("players").select("id").eq("auth_user_id", userId).maybeSingle();
  const playerId = player?.id ? String(player.id) : null;

  const { error } = await admin.from("push_subscriptions").upsert({
    endpoint,
    player_id: playerId,
    auth_user_id: userId,
    p256dh,
    auth,
    user_agent: userAgent,
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) { console.error("[register-push] upsert:", error.message); return json({ ok: false, error: "save_failed" }, 500); }
  return json({ ok: true });
});
