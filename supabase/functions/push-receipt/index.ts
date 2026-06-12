// Recibo de notificação push, chamado pelo service worker.
//   { logId, type: 'delivered' }  -> marca push_log.delivered_at (push recebido no aparelho)
//   { logId, type: 'opened' }     -> marca push_log.opened_at    (usuário tocou na notificação)
//
// Sem autenticação de usuário: o logId é um UUID aleatório (difícil de adivinhar)
// e o pior caso é marcar uma própria mensagem como entregue/aberta. Implante esta
// função com "Verify JWT" DESLIGADO. Só a service role escreve no push_log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: { logId?: string; type?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const logId = String(payload.logId || "");
  const type = String(payload.type || "");
  if (!logId) return json({ error: "missing_logId" }, 400);

  const column = type === "opened" ? "opened_at" : type === "delivered" ? "delivered_at" : null;
  if (!column) return json({ error: "invalid_type" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Só grava o recibo se ainda não houver (mantém o primeiro carimbo).
  const { error } = await admin
    .from("push_log")
    .update({ [column]: new Date().toISOString() })
    .eq("id", logId)
    .is(column, null);
  if (error) return json({ error: "update_failed", detail: error.message }, 500);

  return json({ ok: true });
});
