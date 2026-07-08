// Cadastro de jogador com AUTORIDADE no servidor (service_role).
//
// Motivo: antes o cliente ANÔNIMO lia a tabela players inteira (checar telefone
// duplicado + "1º jogador = admin") e decidia is_admin no cliente. Isso obrigava
// policies de SELECT anônimo → qualquer um com a anon key (pública) lia o PII de
// todos SEM login. Aqui a validação e a criação ocorrem no servidor; o cliente
// anônimo só chama esta função. Depois disso as policies anon podem ser dropadas.
//
// Fluxo: valida input → checa telefone duplicado → decide isFirstPlayer (count) →
// cria o usuário no Auth (email_confirm) → insere a linha em players → loga com a
// senha e DEVOLVE a sessão (o cliente adota via loginWithPasskeySession).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const TECHNICAL_EMAIL_DOMAIN = "harmonia.app";

// Avisa os admins (push) que caiu um auto-cadastro aguardando aprovação.
// Best-effort: qualquer falha aqui NÃO quebra o cadastro. Reusa os secrets VAPID
// já configurados para a função send-push.
// deno-lint-ignore no-explicit-any
async function notifyAdminsOfRegistration(admin: any, playerName: string): Promise<void> {
  try {
    const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@harmonia.app";
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

    const { data: admins } = await admin.from("players").select("id").eq("is_admin", true);
    const adminIds = (admins || []).map((a: { id: string }) => String(a.id));
    if (!adminIds.length) return;

    const { data: subs } = await admin
      .from("push_subscriptions").select("endpoint, p256dh, auth").in("player_id", adminIds);
    if (!subs?.length) return;

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    const notification = JSON.stringify({
      title: "Novo cadastro 📝",
      body: `${playerName} quer entrar no grupo. Toque para aprovar.`,
      url: "./",
    });
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, notification);
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }
  } catch (err) {
    console.warn("[register] notifyAdmins:", String(err));
  }
}

const ALLOWED_ORIGIN = (o: string): boolean =>
  /^https?:\/\/localhost(:\d+)?$/i.test(o)
  || /^https:\/\/([a-z0-9-]+\.)*harmoniafc-prod\.pages\.dev$/i.test(o)
  || /^https:\/\/([a-z0-9-]+\.)*convocados\.app\.br$/i.test(o);
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGIN(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}
function normalizePosition(value: unknown): string | null {
  const v = String(value || "");
  return ["gol", "zag", "meia", "atk"].includes(v) ? v : null;
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

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch (_) { return json({ ok: false, error: "bad_request" }, 400); }

  // --- Validação (espelha o cliente) ---
  const name = String(payload.name || "").trim();
  const phone = normalizePhone(payload.phone);
  const birthDate = String(payload.birthDate || "").trim();
  const role = payload.role === "carne" ? "carne" : "player";
  const position = role === "player" ? normalizePosition(payload.position) : null;
  const password = String(payload.password || "").trim();

  if (!name) return json({ ok: false, error: "missing_name", message: "Informe o nome." });
  if (phone.length < 10 || phone.length > 11) return json({ ok: false, error: "bad_phone", message: "Informe um telefone válido." });
  if (!birthDate) return json({ ok: false, error: "missing_birthdate", message: "Informe a data de nascimento." });
  if (role === "player" && !position) return json({ ok: false, error: "missing_position", message: "Selecione a posição em campo." });
  if (password.length < 6) return json({ ok: false, error: "weak_password", message: "A senha precisa ter pelo menos 6 caracteres." });

  const technicalEmail = `${phone}@${TECHNICAL_EMAIL_DOMAIN}`;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // --- 1) Telefone duplicado? (checagem no servidor, ANTES de criar a conta) ---
  const { data: dup, error: dupErr } = await admin
    .from("players").select("id").eq("data->>phone", phone).limit(1).maybeSingle();
  if (dupErr) { console.error("[register] dup check:", dupErr.message); return json({ ok: false, error: "lookup_failed" }, 500); }
  if (dup?.id) return json({ ok: false, error: "duplicate_phone", message: "Esse telefone já está cadastrado." });

  // --- 2) Primeiro jogador vira admin (decidido no SERVIDOR) ---
  const { count, error: countErr } = await admin
    .from("players").select("id", { count: "exact", head: true });
  if (countErr) { console.error("[register] count:", countErr.message); return json({ ok: false, error: "count_failed" }, 500); }
  const isFirstPlayer = (count || 0) === 0;

  // --- 3) Cria o usuário no Auth (já confirmado) ---
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: technicalEmail,
    password,
    email_confirm: true,
    user_metadata: { name, phone, birthDate, login_type: "phone_password" },
  });
  if (createErr || !created?.user?.id) {
    // Corrida/duplicado no Auth (email único) → trata como telefone já usado.
    const msg = String(createErr?.message || "");
    if (/already|exists|registered|duplicate/i.test(msg)) {
      return json({ ok: false, error: "duplicate_phone", message: "Esse telefone já está cadastrado." });
    }
    console.error("[register] createUser:", msg);
    return json({ ok: false, error: "create_user_failed" }, 500);
  }
  const authUserId = created.user.id;

  // --- 4) Insere a linha em players (mesma forma do upsert do cliente) ---
  const playerId = `p${Date.now()}`;
  const playerData = {
    id: playerId,
    auth_user_id: authUserId,
    email: technicalEmail,
    login_phone: phone,
    name,
    phone,
    birthDate,
    role,
    plays_football: role === "player",
    in_carne_group: true,
    position,
    mens_ok: false,
    is_admin: isFirstPlayer,
    // Auto-cadastro NÃO dá acesso ao grupo: entra pendente de aprovação do admin.
    // O 1º usuário (que vira admin) é a exceção — já entra aprovado.
    pending: !isFirstPlayer,
  };
  const { error: insErr } = await admin.from("players").insert({
    id: playerId,
    auth_user_id: authUserId,
    is_admin: isFirstPlayer,
    data: playerData,
    updated_at: new Date().toISOString(),
  });
  if (insErr) {
    // Não deixa usuário do Auth órfão sem player: desfaz a criação.
    console.error("[register] insert player:", insErr.message);
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    return json({ ok: false, error: "insert_player_failed" }, 500);
  }

  // Auto-cadastro pendente: avisa os admins por push (best-effort, não bloqueia).
  if (!isFirstPlayer) await notifyAdminsOfRegistration(admin, name);

  // --- 5) Loga com a senha e devolve a sessão (cliente adota) ---
  try {
    const anonClient = createClient(SUPABASE_URL, ANON);
    const { data: signIn, error: signErr } = await anonClient.auth.signInWithPassword({ email: technicalEmail, password });
    if (signErr || !signIn?.session) {
      // Cadastro OK, mas login automático falhou → cliente cai no login manual.
      return json({ ok: true, session: null, message: "Cadastro realizado. Faça login." });
    }
    const s = signIn.session;
    return json({
      ok: true,
      session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, user: s.user },
    });
  } catch (error) {
    console.error("[register] signIn:", String(error));
    return json({ ok: true, session: null, message: "Cadastro realizado. Faça login." });
  }
});
