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

      if (normalizedPhone.length < 10 || normalizedPhone.length > 11) {
        return jsonResponse({ error: "invalid_phone" }, 400);
      }

      const email = technicalEmailFromPhone(normalizedPhone);

      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: String(new_password),
        email_confirm: true,
        user_metadata: {
          name: String(name || ""),
          phone: normalizedPhone,
          birthDate: String(birth_date || ""),
          player_id: String(player_id || ""),
          login_type: "phone_password",
          created_by: "harmonia_admin_edge_function",
        },
      });

      if (error) {
        return jsonResponse({ error: error.message }, 400);
      }

      return jsonResponse({
        ok: true,
        mode: "create_access",
        user_id: data.user?.id || null,
        email,
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
