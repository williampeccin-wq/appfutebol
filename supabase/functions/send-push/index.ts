import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

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

// Coluna ausente (42703 no Postgres, PGRST204 no schema cache do PostgREST). O
// harmonia-fc nunca recebeu as migrations do multi-tenant: lá NENHUMA tabela tem
// club_id, e desde o deploy de 29/07 a leitura de players quebrava e todo admin
// virava "forbidden" — nenhum push manual nem o de votação de desempenho saía.
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);
function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code && MISSING_COLUMN_CODES.has(err.code)) return true;
  return /column .* does not exist|could not find the .* column/i.test(String(err.message || ""));
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
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
  let singleTenant = false;
  const playerRead = await admin
    .from("players")
    .select("is_admin, club_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  let player = playerRead.data as { is_admin?: boolean; club_id?: string } | null;
  if (playerRead.error && isMissingColumn(playerRead.error)) {
    singleTenant = true;
    const fallback = await admin
      .from("players").select("is_admin").eq("auth_user_id", user.id).maybeSingle();
    player = fallback.data as { is_admin?: boolean } | null;
  }

  if (!player?.is_admin) return json({ error: "forbidden" }, 403);

  // Ser admin de ALGUM clube não pode virar permissão de disparar para TODOS.
  // Esta função roda com service_role (ignora RLS), então o escopo por clube
  // precisa ser explícito na query — é a única barreira que resta. No projeto
  // single-tenant não há o que escopar: existe UM clube, e "todos" já é ele.
  const callerClubId = player.club_id;
  if (!callerClubId && !singleTenant) return json({ error: "club_not_resolved" }, 403);

  // 2) Payload
  let payload: { action?: string; target?: string; title?: string; body?: string; url?: string; game_key?: string; kind?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  // Função auxiliar de envio com remoção de inscrições mortas.
  async function pushTo(subs: Array<{ endpoint: string; p256dh: string; auth: string }>, notif: string) {
    let sent = 0, removed = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, notif);
        sent++;
      } catch (err) {
        const sc = (err as { statusCode?: number })?.statusCode;
        if (sc === 404 || sc === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          removed++;
        } else {
          console.warn("[send-push] falha ao enviar:", sc, (err as Error)?.message);
        }
      }
    }
    return { sent, removed };
  }

  // 2b) Ação especial: disparo da votação de desempenho/churrasco pelo admin.
  // Chamado por save-championship-result para garantir que o push sai SÓ depois
  // que o resultado é lançado (ao invés de depender do cron de 1h após o jogo).
  if (payload.action === "trigger_voting") {
    const kind = String(payload.kind || "desempenho");
    const gameKey = String(payload.game_key || "").trim();
    if (!gameKey) return json({ error: "missing_game_key" }, 400);
    if (kind !== "desempenho" && kind !== "churrasco") return json({ error: "invalid_kind" }, 400);

    const pushKind = kind === "desempenho" ? "votacao_desempenho" : "votacao_churrasco";
    const title = kind === "desempenho" ? "Hora de votar ⭐" : "Vote no churrasco 🥩🔥";
    const body = kind === "desempenho"
      ? "Dê as notas de desempenho do jogo de hoje."
      : "Dê a nota da dupla da carne do jogo de hoje.";

    // Dedup: insere linha no push_log; se já existe (23505) → já enviado, pula.
    const logRow = { kind: pushKind, game_key: gameKey, title, body, status: "sent" };
    let claimErr = (await admin.from("push_log").insert({ ...logRow, club_id: callerClubId })).error;
    if (claimErr && isMissingColumn(claimErr)) {
      claimErr = (await admin.from("push_log").insert(logRow)).error;
    }
    if (claimErr) return json({ ok: true, skipped: true, reason: "already_sent" });

    // Destinatários: desempenho → só quem jogou; churrasco → todos do clube.
    let subs: Array<{ endpoint: string; p256dh: string; auth: string }> = [];
    if (kind === "desempenho") {
      const confsQuery = admin
        .from("presence_confirmations")
        .select("player_id")
        .eq("game_key", gameKey)
        .eq("status", "confirmed");
      const { data: confs } = await (singleTenant ? confsQuery : confsQuery.eq("club_id", callerClubId));
      const ids = [...new Set((confs || []).map((c) => String(c.player_id)).filter(Boolean))];
      if (ids.length) {
        const subsQuery = admin
          .from("push_subscriptions")
          .select("endpoint, p256dh, auth")
          .in("player_id", ids);
        const { data: s } = await (singleTenant ? subsQuery : subsQuery.eq("club_id", callerClubId));
        subs = s || [];
      }
    } else {
      const allQuery = admin.from("push_subscriptions").select("endpoint, p256dh, auth");
      const { data: s } = await (singleTenant ? allQuery : allQuery.eq("club_id", callerClubId));
      subs = s || [];
    }

    const notif = JSON.stringify({ title, body, url: "./" });
    const r = await pushTo(subs, notif);
    return json({ ok: true, ...r, total: subs.length });
  }

  // 3) Busca inscrições para envio manual (aviso genérico do admin).
  // Escopo por clube ANTES do alvo: um `target` de outro clube simplesmente não
  // casa, então isto também fecha o IDOR por player_id enumerado.
  const target = payload.target || "all";
  const notification = JSON.stringify({
    title: payload.title || "Convocados",
    body: payload.body || "",
    url: payload.url || "./",
  });

  let query = admin.from("push_subscriptions").select("endpoint, p256dh, auth, player_id");
  if (!singleTenant) query = query.eq("club_id", callerClubId);
  if (target && target !== "all") query = query.eq("player_id", target);
  const { data: subscriptions, error } = await query;
  if (error) return json({ error: "subscriptions_query_failed", detail: error.message }, 500);

  const r = await pushTo(subscriptions || [], notification);
  return json({ ok: true, ...r, total: (subscriptions || []).length });
});
