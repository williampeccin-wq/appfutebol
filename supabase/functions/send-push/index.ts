import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@harmonia.app";

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return json({ error: "vapid_not_configured" }, 500);
  }

  // 1) Autoriza: o chamador precisa ser admin. Verifica o JWT do usuário e
  //    consulta players.is_admin com a service role.
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: player } = await admin
    .from("players")
    .select("is_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!player?.is_admin) return json({ error: "forbidden" }, 403);

  // 2) Payload
  let payload: { target?: string; title?: string; body?: string; url?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const target = payload.target || "all";
  const notification = JSON.stringify({
    title: payload.title || "Harmonia FC",
    body: payload.body || "",
    url: payload.url || "./",
  });

  // 3) Busca inscrições
  let query = admin.from("push_subscriptions").select("endpoint, p256dh, auth, player_id");
  if (target && target !== "all") query = query.eq("player_id", target);
  const { data: subscriptions, error } = await query;
  if (error) return json({ error: "subscriptions_query_failed", detail: error.message }, 500);

  // 4) Envia
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  let sent = 0;
  let removed = 0;
  for (const sub of subscriptions || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        notification,
      );
      sent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      // 404/410 = inscrição morta -> remove
      if (statusCode === 404 || statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        removed += 1;
      } else {
        console.warn("[send-push] falha ao enviar:", statusCode, (err as Error)?.message);
      }
    }
  }

  return json({ ok: true, sent, removed, total: (subscriptions || []).length });
});
