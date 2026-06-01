import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TECHNICAL_EMAIL_DOMAIN = "harmonia.app";

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function technicalEmailFromPhone(phone: string): string {
  return `${normalizePhone(phone)}@${TECHNICAL_EMAIL_DOMAIN}`;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function findAuthUserByEmail(supabase: ReturnType<typeof createClient>, email: string) {
  let page = 1;
  const perPage = 1000;

  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`list_users_failed:${error.message}`);
    }

    const users = data?.users || [];
    const found = users.find((user) => String(user.email || "").toLowerCase() === email.toLowerCase());

    if (found) return found;
    if (users.length < perPage) return null;

    page += 1;
  }

  return null;
}

async function linkPlayerAccess(
  supabase: ReturnType<typeof createClient>,
  playerId: string,
  authUserId: string,
  email: string,
  phone: string,
) {
  const { error: rpcError } = await supabase.rpc("harmonia_service_link_player_access", {
    p_player_id: playerId,
    p_auth_user_id: authUserId,
    p_email: email,
    p_phone: phone,
  });

  if (!rpcError) {
    return { ok: true, mode: "rpc" };
  }

  const { error: updateError } = await supabase
    .from("players")
    .update({
      auth_user_id: authUserId,
      data: {
        auth_user_id: authUserId,
        email,
        login_phone: phone,
        phone,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", playerId);

  if (updateError) {
    return {
      ok: false,
      error: `player_link_failed:${rpcError.message};fallback_failed:${updateError.message}`,
    };
  }

  return { ok: true, mode: "fallback_update" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const {
      admin_secret,
      mode = "reset_password",
      user_id,
      new_password,
      phone,
      name,
      birth_date,
      player_id,
    } = body || {};

    if (admin_secret !== Deno.env.get("ADMIN_RESET_SECRET")) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    if (!new_password || String(new_password).length < 6) {
      return jsonResponse({ error: "weak_password" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("HARMONIA_SERVICE_ROLE_KEY") || "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    if (mode === "create_access") {
      const normalizedPhone = normalizePhone(phone);
      const normalizedPlayerId = String(player_id || "").trim();

      if (!normalizedPlayerId) {
        return jsonResponse({ error: "missing_player_id" }, 400);
      }

      if (normalizedPhone.length < 10 || normalizedPhone.length > 11) {
        return jsonResponse({ error: "invalid_phone" }, 400);
      }

      const email = technicalEmailFromPhone(normalizedPhone);
      const existingUser = await findAuthUserByEmail(supabase, email);

      let authUser = existingUser;

      if (authUser?.id) {
        const { data: updatedUser, error: updateUserError } = await supabase.auth.admin.updateUserById(
          authUser.id,
          {
            password: String(new_password),
            email_confirm: true,
            user_metadata: {
              ...(authUser.user_metadata || {}),
              name: String(name || ""),
              phone: normalizedPhone,
              birthDate: String(birth_date || ""),
              player_id: normalizedPlayerId,
              login_type: "phone_password",
              updated_by: "harmonia_admin_edge_function",
            },
          },
        );

        if (updateUserError) {
          return jsonResponse({ error: updateUserError.message }, 400);
        }

        authUser = updatedUser.user || authUser;
      } else {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password: String(new_password),
          email_confirm: true,
          user_metadata: {
            name: String(name || ""),
            phone: normalizedPhone,
            birthDate: String(birth_date || ""),
            player_id: normalizedPlayerId,
            login_type: "phone_password",
            created_by: "harmonia_admin_edge_function",
          },
        });

        if (error) {
          return jsonResponse({ error: error.message }, 400);
        }

        authUser = data.user;
      }

      if (!authUser?.id) {
        return jsonResponse({ error: "auth_user_missing_after_create_or_update" }, 500);
      }

      const linkResult = await linkPlayerAccess(
        supabase,
        normalizedPlayerId,
        authUser.id,
        email,
        normalizedPhone,
      );

      if (!linkResult.ok) {
        return jsonResponse({ error: linkResult.error || "player_link_failed" }, 500);
      }

      return jsonResponse({
        ok: true,
        mode: "create_access",
        user_id: authUser.id,
        email,
        player_id: normalizedPlayerId,
        link_mode: linkResult.mode,
        reused_existing_user: !!existingUser,
      });
    }

    if (!user_id) {
      return jsonResponse({ error: "missing_user_id" }, 400);
    }

    const { error } = await supabase.auth.admin.updateUserById(
      String(user_id),
      {
        password: String(new_password),
      },
    );

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({
      ok: true,
      mode: "reset_password",
    });
  } catch (err) {
    return jsonResponse({
      error: err?.message || "unexpected_error",
    }, 500);
  }
});
