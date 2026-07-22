// Auto-exclusão de conta (LGPD art. 18 / requisito de loja Apple 5.1.1(v) + Google).
// service_role. VERIFICA O JWT DO PRÓPRIO CHAMADOR e deriva o auth_user_id do
// TOKEN — nunca do corpo do request → é impossível A excluir a conta de B.
//
// O que faz (linha "só o cadastro", decidida com o usuário 07/07):
//   1. Autentica o chamador pelo Bearer token (getUser).
//   2. Bloqueia o ÚLTIMO admin (senão o clube fica sem administrador).
//   3. Apaga foto (bucket), push_subscriptions, pix_receipts e os votos DELE
//      (ratings.voter_id) — dados pessoais / do dispositivo do titular.
//   4. Anonimiza a linha em players: vira LÁPIDE {name:"Jogador removido",
//      deleted:true, PII zerada}, mantendo o id p/ referências históricas
//      (escalações por id resolvem "Jogador removido" sem quebrar o histórico).
//   5. Apaga o usuário do Auth (por último).
// Nomes CONGELADOS como texto no ranking/matriz e campeões antigos NÃO são
// varridos (decisão "mínimo": registro esportivo histórico).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Extrai o path do objeto dentro do bucket a partir de photo_url (URL pública
// completa OU path nu). Retorna null se não der pra determinar.
function photoStoragePath(photoUrl: unknown): string | null {
  const raw = String(photoUrl || "").trim();
  if (!raw) return null;
  const marker = "player-photos/";
  const idx = raw.indexOf(marker);
  const path = idx >= 0 ? raw.slice(idx + marker.length) : raw;
  return path.split("?")[0].replace(/^\/+/, "") || null;
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

  // --- 1) Autentica o chamador pelo token (nunca confia no corpo) ---
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, error: "unauthorized" }, 401);

  const anon = createClient(SUPABASE_URL, ANON);
  const { data: userData, error: userErr } = await anon.auth.getUser(token);
  const authUserId = userData?.user?.id;
  if (userErr || !authUserId) return json({ ok: false, error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // --- 2) Acha o player e bloqueia o último admin ---
  const { data: player, error: pErr } = await admin
    .from("players").select("id, is_admin, data, club_id").eq("auth_user_id", authUserId).maybeSingle();
  if (pErr) { console.error("[delete] lookup player:", pErr.message); return json({ ok: false, error: "lookup_failed" }, 500); }

  const playerId = player?.id ? String(player.id) : null;

  if (player?.is_admin) {
    // A contagem PRECISA ser por clube: global, o único admin do clube B passa
    // porque o clube A tem admins — e o clube B fica sem administrador para
    // sempre (ninguém aprova cadastro, ninguém abre jogo, e promover exige admin).
    const { count, error: cErr } = await admin
      .from("players").select("id", { count: "exact", head: true })
      .eq("is_admin", true)
      .eq("club_id", player.club_id);
    if (cErr) { console.error("[delete] admin count:", cErr.message); return json({ ok: false, error: "count_failed" }, 500); }
    if ((count || 0) <= 1) {
      return json({ ok: false, error: "last_admin", message: "Você é o único administrador. Promova outro admin antes de excluir sua conta." });
    }
  }

  // --- 3) Limpezas de dados pessoais / do dispositivo (best-effort, loga erros) ---
  const photoPath = photoStoragePath(player?.data?.photo_url);
  if (photoPath) {
    const { error } = await admin.storage.from("player-photos").remove([photoPath]);
    if (error) console.warn("[delete] remove photo:", error.message);
  }
  if (playerId) {
    const r1 = await admin.from("push_subscriptions").delete().eq("player_id", playerId);
    if (r1.error) console.warn("[delete] push_subscriptions:", r1.error.message);
    const r2 = await admin.from("ratings").delete().eq("voter_id", playerId); // votos DELE
    if (r2.error) console.warn("[delete] ratings voter:", r2.error.message);
  }
  const r3 = await admin.from("pix_receipts").delete().eq("auth_user_id", authUserId);
  if (r3.error) console.warn("[delete] pix_receipts:", r3.error.message);

  // --- 4) Anonimiza a linha em players (lápide) — mantém o id p/ histórico ---
  if (playerId) {
    const tombstone = {
      name: "Jogador removido",
      deleted: true,
      deleted_at: new Date().toISOString(),
      role: player?.data?.role || "player", // preserva classificação p/ listas históricas
      // PII zerada: sem phone/birthDate/photo_url/email/login_phone
      position: null,
      plays_football: false,
      in_carne_group: false,
      mens_ok: false,
    };
    const upd = await admin.from("players")
      .update({ auth_user_id: null, is_admin: false, data: tombstone, updated_at: new Date().toISOString() })
      .eq("id", playerId);
    if (upd.error) { console.error("[delete] anonymize player:", upd.error.message); return json({ ok: false, error: "anonymize_failed" }, 500); }
  }

  // --- 5) Apaga o usuário do Auth (por último) ---
  const del = await admin.auth.admin.deleteUser(authUserId);
  if (del.error) { console.error("[delete] deleteUser:", del.error.message); return json({ ok: false, error: "auth_delete_failed" }, 500); }

  return json({ ok: true });
});
