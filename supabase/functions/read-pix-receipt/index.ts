// Conciliação de mensalidade por PIX — o JOGADOR envia o próprio comprovante.
//
// Como o próprio jogador dispara, a validação NÃO pode ficar no cliente (ele
// poderia forjar). Esta função é a autoridade: lê o comprovante por visão,
// valida contra a config do clube e grava o resultado com service_role.
//
// Regra (todas precisam passar p/ marcar pago automático):
//   - beneficiário do comprovante == nome configurado (settings.mens_beneficiary)
//   - valor == valor configurado (settings.mens_amount), exato em centavos
//   - data dentro do mês corrente (BRT)
//   - E2E ID presente e INÉDITO (tabela pix_receipts, anti-reuso)
// Se beneficiário+valor+mês batem mas faltou o E2E → NÃO marca; sinaliza
// players.data.mens_review p/ o admin revisar. Demais falhas → rejeita.
//
// A chave da API e a service_role ficam só aqui. A imagem não é armazenada.

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

const MODEL = "claude-haiku-4-5";
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function normName(value: string): string {
  return String(value || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ").trim().toUpperCase();
}

// Mês corrente em Brasília (UTC-3), formato YYYY-MM.
function currentMonthBrt(): string {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 7);
}

const PROMPT = [
  "Esta imagem é um comprovante de pagamento PIX brasileiro (print de app de banco).",
  "Extraia com precisão:",
  "- beneficiary_name: nome de quem RECEBEU o PIX (recebedor/beneficiário/para/destino/creditado). NÃO o pagador/origem.",
  "- amount: valor transferido em reais como número (ex.: 50.00). 0 se ilegível.",
  "- date: data do pagamento no formato YYYY-MM-DD. \"\" se ilegível.",
  "- e2e_id: o identificador único da transação PIX. Procure por rótulos como",
  "  \"ID da transação\", \"Identificador\", \"Código de autenticação\", \"Identificação\",",
  "  \"Controle\" ou \"E2E\" — costuma ter ~32 caracteres começando com E. \"\" se não aparecer.",
  "- bank: instituição de origem (ex.: Nubank, Itaú). \"\" se não aparecer.",
  "Se a imagem NÃO for um comprovante de pagamento, is_receipt=false e o resto vazio/0.",
  "",
  "Responda APENAS com um objeto JSON válido, sem texto antes ou depois, sem markdown,",
  "com EXATAMENTE estas chaves: is_receipt (boolean), beneficiary_name (string),",
  "amount (number), date (string), e2e_id (string), bank (string).",
].join("\n");

// Extrai o primeiro objeto JSON de um texto (tolera cercas ``` ou texto extra).
function parseJsonObject(text: string): Record<string, unknown> {
  const cleaned = String(text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no_json");
  return JSON.parse(cleaned.slice(start, end + 1));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!ANTHROPIC_KEY) return json({ ok: false, error: "api_key_not_configured" }, 500);
  if (!SERVICE_ROLE) return json({ ok: false, error: "service_role_not_configured" }, 500);

  // Identifica o jogador pelo token (exige login; bloqueia anônimo).
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt || jwt === ANON) return json({ ok: false, error: "unauthorized" }, 401);

  let userId = "";
  try {
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data?.user) return json({ ok: false, error: "unauthorized" }, 401);
    userId = data.user.id;
  } catch (_) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let payload: { imageBase64?: string; mediaType?: string } = {};
  try { payload = await req.json(); } catch (_) { return json({ ok: false, error: "bad_request" }, 400); }
  const imageBase64 = String(payload.imageBase64 || "");
  const mediaType = String(payload.mediaType || "");
  if (!imageBase64) return json({ ok: false, error: "missing_image" }, 400);
  if (!ALLOWED_MEDIA.has(mediaType)) return json({ ok: false, error: "unsupported_media_type" }, 400);
  if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) return json({ ok: false, error: "image_too_large" }, 413);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Config do clube + jogador.
  const { data: metaRow } = await admin.from("app_meta").select("data").eq("key", "default").maybeSingle();
  const settings = metaRow?.data?.settings || {};
  const cfgAmount = Number(settings.mens_amount) || 0;
  const cfgBeneficiary = normName(String(settings.mens_beneficiary || ""));
  if (!cfgAmount || !cfgBeneficiary) return json({ ok: false, error: "config_missing" });

  const { data: playerRow } = await admin
    .from("players").select("id,data").eq("auth_user_id", userId).maybeSingle();
  if (!playerRow?.id) return json({ ok: false, error: "player_not_found" });

  // Leitura por visão.
  let extracted: { is_receipt: boolean; beneficiary_name: string; amount: number; date: string; e2e_id: string; bank: string };
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: PROMPT },
          ],
        }],
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.warn("[pix] Anthropic erro:", resp.status, detail.slice(0, 300));
      return json({ ok: false, error: "vision_failed", status: resp.status }, 502);
    }
    const data = await resp.json();
    const text = (data?.content || []).find((b: { type?: string }) => b?.type === "text")?.text || "";
    const parsed = parseJsonObject(text);
    extracted = {
      is_receipt: !!parsed.is_receipt,
      beneficiary_name: String(parsed.beneficiary_name || ""),
      amount: Number(parsed.amount) || 0,
      date: String(parsed.date || ""),
      e2e_id: String(parsed.e2e_id || "").replace(/\s+/g, "").toUpperCase(),
      bank: String(parsed.bank || ""),
    };
  } catch (error) {
    console.warn("[pix] Falha visão/parse:", error);
    return json({ ok: false, error: "vision_failed" }, 502);
  }

  // Dados que o cliente pode mostrar (E2E só o final, por privacidade).
  const view = {
    beneficiary_name: extracted.beneficiary_name,
    amount: extracted.amount,
    date: extracted.date,
    bank: extracted.bank,
    e2e_tail: extracted.e2e_id ? extracted.e2e_id.slice(-6) : "",
  };
  const reject = (reason: string) => json({ ok: true, result: "rejected", reason, extracted: view });

  if (!extracted.is_receipt) return reject("not_receipt");

  // 1) Beneficiário: todos os tokens configurados precisam aparecer no comprovante.
  const benefTokens = normName(extracted.beneficiary_name).split(" ").filter(Boolean);
  const benefSet = new Set(benefTokens);
  const cfgTokens = cfgBeneficiary.split(" ").filter(Boolean);
  const beneficiaryOk = cfgTokens.length > 0 && cfgTokens.every((t) => benefSet.has(t));
  if (!beneficiaryOk) return reject("beneficiary_mismatch");

  // 2) Valor exato (em centavos).
  if (Math.round(extracted.amount * 100) !== Math.round(cfgAmount * 100)) return reject("amount_mismatch");

  // 3) Data no mês corrente.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(extracted.date) || extracted.date.slice(0, 7) !== currentMonthBrt()) {
    return reject("date_not_current_month");
  }

  // 4) E2E. Sem E2E legível → cai para revisão do admin (não marca automático).
  const e2e = extracted.e2e_id;
  if (!e2e || e2e.length < 20) {
    const newData = { ...(playerRow.data || {}) };
    newData.mens_review = {
      amount: extracted.amount,
      date: extracted.date,
      beneficiary: extracted.beneficiary_name,
      bank: extracted.bank,
      at: new Date().toISOString(),
    };
    await admin.from("players").update({ data: newData }).eq("id", playerRow.id);
    return json({ ok: true, result: "review", reason: "no_e2e", extracted: view });
  }

  // E2E inédito?
  const { data: dup } = await admin.from("pix_receipts").select("e2e_id").eq("e2e_id", e2e).maybeSingle();
  if (dup?.e2e_id) return reject("duplicate_e2e");

  // Tudo ok: registra o E2E e marca pago.
  const ins = await admin.from("pix_receipts").insert({
    e2e_id: e2e,
    player_id: String(playerRow.id),
    auth_user_id: userId,
    amount: extracted.amount,
    paid_date: extracted.date,
    beneficiary: extracted.beneficiary_name,
    bank: extracted.bank,
  });
  if (ins.error) {
    // 23505 = unique_violation (corrida): tratado como reuso.
    if (String(ins.error.code) === "23505") return reject("duplicate_e2e");
    console.warn("[pix] insert pix_receipts erro:", ins.error);
    return json({ ok: false, error: "persist_failed" }, 500);
  }

  const newData = { ...(playerRow.data || {}) };
  newData.mens_ok = true;
  delete newData.mens_review;
  const upd = await admin.from("players").update({ data: newData }).eq("id", playerRow.id);
  if (upd.error) {
    console.warn("[pix] update players erro:", upd.error);
    return json({ ok: false, error: "persist_failed" }, 500);
  }

  return json({ ok: true, result: "marked", extracted: view });
});
