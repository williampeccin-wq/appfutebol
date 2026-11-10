// Acesso de jogador: criar login e redefinir senha — pelo ADMIN DO CLUBE.
// service_role. VERIFICA O JWT DO CHAMADOR e deriva quem ele é do TOKEN,
// nunca do corpo do request.
//
// Por que existe: o app não tem recuperação de senha self-service, e não pode
// ter por e-mail — as contas são `<telefone>@harmonia.app`, domínio que não
// recebe mensagem. Quem esquece a senha só volta por aqui.
//
// MULTI-CLUBE. A versão do Harmonia (branch production) autorizava por um
// segredo global (ADMIN_RESET_SECRET) e não olhava club_id: num app de um
// clube só isso bastava, aqui seria uma chave-mestra abrindo todos. Aqui a
// regra é a mesma do resto do app:
//
//   1. Autentica o chamador pelo Bearer token (getUser).
//   2. O chamador tem de ser ADMIN e ter club_id.
//   3. O jogador-alvo tem de ser DO MESMO CLUBE. Alvo vem por player_id; o
//      auth_user_id é resolvido no servidor, nunca aceito do corpo.
//
// Modos:
//   reset_password  — troca a senha de quem já tem acesso.
//   create_access   — cria o usuário no Auth e vincula ao jogador.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CONGELADO. Toda conta do app foi criada com este domínio; trocar sem migrar
// o Auth desloga todo mundo. Espelha js/services/auth.service.js.
const TECHNICAL_EMAIL_DOMAIN = "harmonia.app";

const ALLOWED_ORIGIN = (o: string): boolean =>
  /^https?:\/\/localhost(:\d+)?$/i.test(o)
  || /^https:\/\/([a-z0-9-]+\.)*harmoniafc-prod\.pages\.dev$/i.test(o)
  || /^https:\/\/([a-z0-9-]+\.)*convocados-44x\.pages\.dev$/i.test(o)
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

function technicalEmail(phone: string): string {
  return `${phone}@${TECHNICAL_EMAIL_DOMAIN}`;
}

// Varre o Auth procurando o e-mail técnico. Só é usada quando o jogador ainda
// não tem auth_user_id mas o usuário pode já existir (acesso criado, vínculo
// perdido) — senão createUser devolveria "already registered" e travaria.
async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const perPage = 1000;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`list_users_failed:${error.message}`);
    const users = data?.users || [];
    const found = users.find((u) => String(u.email || "").toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (users.length < perPage) return null;
  }
  return null;
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_) {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  const mode = String(body.mode || "reset_password");
  const playerId = String(body.player_id || "").trim();
  const newPassword = String(body.new_password || "");

  if (!playerId) return json({ ok: false, error: "missing_player_id" }, 400);
  if (newPassword.length < 6) return json({ ok: false, error: "weak_password" }, 400);

  // --- 1) Autentica o chamador pelo token (nunca confia no corpo) ---
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, error: "unauthorized" }, 401);

  const anon = createClient(SUPABASE_URL, ANON);
  const { data: userData, error: userErr } = await anon.auth.getUser(token);
  const callerAuthId = userData?.user?.id;
  if (userErr || !callerAuthId) return json({ ok: false, error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- 2) O chamador é admin de um clube? ---
  const { data: caller, error: callerErr } = await admin
    .from("players").select("id, is_admin, club_id").eq("auth_user_id", callerAuthId).maybeSingle();
  if (callerErr) {
    console.error("[admin-reset-password] lookup caller:", callerErr.message);
    return json({ ok: false, error: "lookup_failed" }, 500);
  }
  if (!caller?.is_admin) return json({ ok: false, error: "not_admin" }, 403);
  if (!caller.club_id) return json({ ok: false, error: "caller_without_club" }, 403);

  // --- 3) O alvo é do MESMO clube? ---
  const { data: target, error: targetErr } = await admin
    .from("players").select("id, club_id, auth_user_id, phone, data").eq("id", playerId).maybeSingle();
  if (targetErr) {
    console.error("[admin-reset-password] lookup target:", targetErr.message);
    return json({ ok: false, error: "lookup_failed" }, 500);
  }
  if (!target) return json({ ok: false, error: "player_not_found" }, 404);
  if (String(target.club_id || "") !== String(caller.club_id)) {
    // Mesma resposta de "não existe": não confirma a existência de jogador de
    // outro clube para quem foi pescar id.
    return json({ ok: false, error: "player_not_found" }, 404);
  }

  // --- 4) Executa ---
  if (mode === "reset_password") {
    if (!target.auth_user_id) return json({ ok: false, error: "player_without_access" }, 400);

    const { error } = await admin.auth.admin.updateUserById(String(target.auth_user_id), {
      password: newPassword,
    });
    if (error) {
      console.error("[admin-reset-password] update password:", error.message);
      return json({ ok: false, error: "password_update_failed" }, 500);
    }
    return json({ ok: true, mode, user_id: target.auth_user_id });
  }

  if (mode === "create_access") {
    if (target.auth_user_id) return json({ ok: false, error: "player_already_has_access" }, 409);

    const phone = normalizePhone(body.phone || target.phone);
    if (phone.length < 10 || phone.length > 11) {
      return json({ ok: false, error: "invalid_player_phone" }, 400);
    }
    const email = technicalEmail(phone);

    let authUserId = "";
    let reusedExistingUser = false;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: newPassword,
      email_confirm: true,
    });

    if (created?.user?.id) {
      authUserId = created.user.id;
    } else {
      // Usuário já existia (acesso criado antes, vínculo perdido): acha,
      // troca a senha e revincula.
      let existing;
      try {
        existing = await findAuthUserByEmail(admin, email);
      } catch (err) {
        console.error("[admin-reset-password] find existing:", String(err));
        return json({ ok: false, error: "auth_create_failed" }, 500);
      }
      if (!existing?.id) {
        console.error("[admin-reset-password] create user:", createErr?.message);
        return json({ ok: false, error: "auth_create_failed" }, 500);
      }
      const { error: pwErr } = await admin.auth.admin.updateUserById(existing.id, { password: newPassword });
      if (pwErr) {
        console.error("[admin-reset-password] relink password:", pwErr.message);
        return json({ ok: false, error: "password_update_failed" }, 500);
      }
      authUserId = existing.id;
      reusedExistingUser = true;
    }

    // Vincula. MERGE no jsonb: a versão do Harmonia substituía `data` inteiro
    // por quatro campos, apagando o resto do cadastro do jogador.
    const mergedData = {
      ...(target.data && typeof target.data === "object" ? target.data : {}),
      auth_user_id: authUserId,
      email,
      login_phone: phone,
      phone,
    };

    const { error: linkErr } = await admin
      .from("players")
      .update({ auth_user_id: authUserId, data: mergedData, updated_at: new Date().toISOString() })
      .eq("id", target.id)
      .eq("club_id", caller.club_id);

    if (linkErr) {
      console.error("[admin-reset-password] link player:", linkErr.message);
      // O usuário existe no Auth mas o jogador não aponta para ele. O cliente
      // tem um caminho de vínculo próprio; avisa para ele tentar.
      return json({ ok: false, error: "player_link_failed", user_id: authUserId, email, linked: false }, 500);
    }

    return json({ ok: true, mode, user_id: authUserId, email, linked: true, reused_existing_user: reusedExistingUser });
  }

  return json({ ok: false, error: "unknown_mode" }, 400);
});
