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

const ALLOWED_ORIGIN = (o: string): boolean =>
  /^https?:\/\/localhost(:\d+)?$/i.test(o)
  || /^https:\/\/([a-z0-9-]+\.)*harmoniafc-prod\.pages\.dev$/i.test(o)
  || /^https:\/\/([a-z0-9-]+\.)*convocados-[a-z0-9]+\.pages\.dev$/i.test(o)
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
  const cors = corsHeaders(req);
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
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

  // Jogador + clube do chamador (multi-tenant).
  const { data: playerRow } = await admin
    .from("players").select("id,data,club_id").eq("auth_user_id", userId).maybeSingle();
  if (!playerRow?.id) return json({ ok: false, error: "player_not_found" });
  const clubId = String(playerRow.club_id || "");
  if (!clubId) return json({ ok: false, error: "player_not_found" });

  // GATE Pro: a leitura automática do comprovante (PIX-IA) é recurso do plano Pro.
  // Autoridade no servidor — o cliente pode esconder o botão, mas quem barra é aqui.
  const { data: clubRow } = await admin.from("clubs").select("plan").eq("id", clubId).maybeSingle();
  if ((clubRow?.plan || "free") !== "pro") {
    return json({ ok: false, error: "pro_required", message: "A leitura automática do comprovante é um recurso do plano Pro." });
  }

  // Config do clube (blob por club_id — não mais 'default').
  const { data: metaRow } = await admin.from("app_meta").select("data").eq("key", clubId).maybeSingle();
  const settings = metaRow?.data?.settings || {};
  const cfgAmount = Number(settings.mens_amount) || 0;
  const cfgBeneficiary = normName(String(settings.mens_beneficiary || ""));
  if (!cfgAmount || !cfgBeneficiary) return json({ ok: false, error: "config_missing" });

  // Curto-circuito: já pago neste ciclo → não gasta a chamada de visão (custo).
  const pdata0 = (playerRow.data || {}) as Record<string, unknown>;
  if (pdata0.mens_ok === true) return json({ ok: true, result: "already_paid" });

  // Rate-limit por jogador: a chamada de visão é PAGA (API Anthropic). Limita a
  // N leituras por hora para impedir abuso/loop que queime créditos.
  const RL_WINDOW_MS = 3600_000, RL_MAX = 6;
  const rlNow = Date.now();
  const prevAttempts = Array.isArray(pdata0.pix_attempts)
    ? (pdata0.pix_attempts as number[]).filter((t) => rlNow - Number(t) < RL_WINDOW_MS) : [];
  if (prevAttempts.length >= RL_MAX) return json({ ok: false, error: "too_many_attempts" }, 429);
  // Contabiliza a tentativa ANTES da visão (conta inclusive falhas/loops).
  playerRow.data = { ...pdata0, pix_attempts: [...prevAttempts, rlNow] };
  await admin.from("players").update({ data: playerRow.data }).eq("id", playerRow.id);

  // Leitura por visão.
  let extracted: { is_receipt: boolean; beneficiary_name: string; amount: number; date: string; e2e_id: string; bank: string };
  try {
    // Retry em erros TRANSITÓRIOS do upstream (502 Bad Gateway/503/529 overloaded/
    // 429). Já vimos 502 da Anthropic (via Cloudflare) derrubar leituras válidas —
    // uma tentativa só deixava o PIX "mudo". Backoff curto: 0 / 0.7s / 1.4s.
    const RETRIABLE = new Set([429, 500, 502, 503, 529]);
    const reqBody = JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: PROMPT },
        ],
      }],
    });
    let resp: Response | undefined;
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 700 * attempt));
      resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: reqBody,
      });
      if (resp.ok) break;
      lastStatus = resp.status;
      const detail = await resp.text().catch(() => "");
      console.warn(`[pix] Anthropic ${resp.status} (tentativa ${attempt + 1}/3):`, detail.slice(0, 200));
      if (!RETRIABLE.has(resp.status)) break; // erro não-transitório: não insiste
    }
    if (!resp || !resp.ok) {
      return json({ ok: false, error: "vision_unavailable", status: lastStatus || 502, retriable: true }, 503);
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

  // 1) Beneficiário. Todos os tokens configurados têm que aparecer (senão é
  // outra pessoa → rejeita). Se aparecem TODOS mas há tokens EXTRAS no nome do
  // comprovante (possível homônimo, ex.: config "João Silva" × "João Silva
  // Pereira"), NÃO marca automático — manda para revisão do admin.
  const benefTokens = normName(extracted.beneficiary_name).split(" ").filter(Boolean);
  const benefSet = new Set(benefTokens);
  const cfgTokens = cfgBeneficiary.split(" ").filter(Boolean);
  const cfgSet = new Set(cfgTokens);
  const allCfgPresent = cfgTokens.length > 0 && cfgTokens.every((t) => benefSet.has(t));
  if (!allCfgPresent) return reject("beneficiary_mismatch");
  const nameUncertain = !(benefTokens.length > 0 && benefTokens.every((t) => cfgSet.has(t)));

  // 2) Valor exato (em centavos).
  if (Math.round(extracted.amount * 100) !== Math.round(cfgAmount * 100)) return reject("amount_mismatch");

  // 3) Data no mês corrente.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(extracted.date) || extracted.date.slice(0, 7) !== currentMonthBrt()) {
    return reject("date_not_current_month");
  }

  // Nome com tokens extras (homônimo possível) → revisão do admin, não marca automático.
  if (nameUncertain) {
    const newData = { ...(playerRow.data || {}) };
    newData.mens_review = {
      amount: extracted.amount,
      date: extracted.date,
      beneficiary: extracted.beneficiary_name,
      bank: extracted.bank,
      at: new Date().toISOString(),
      reason: "beneficiary_uncertain",
    };
    await admin.from("players").update({ data: newData }).eq("id", playerRow.id);
    return json({ ok: true, result: "review", reason: "beneficiary_uncertain", extracted: view });
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

  // E2E inédito? (dedup dentro do clube; o E2E do PIX é globalmente único, mas
  // escopar por clube mantém o isolamento — service_role enxerga todos.)
  const { data: dup } = await admin.from("pix_receipts").select("e2e_id").eq("e2e_id", e2e).eq("club_id", clubId).maybeSingle();
  if (dup?.e2e_id) return reject("duplicate_e2e");

  // Tudo ok: registra o E2E e marca pago.
  const ins = await admin.from("pix_receipts").insert({
    e2e_id: e2e,
    club_id: clubId,
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
  // Carimbo para o admin ver que foi pago via PIX (sem guardar a imagem).
  newData.mens_payment = {
    method: "pix",
    amount: extracted.amount,
    date: extracted.date,
    beneficiary: extracted.beneficiary_name,
    bank: extracted.bank,
    e2e_tail: e2e.slice(-6),
    at: new Date().toISOString(),
  };
  const upd = await admin.from("players").update({ data: newData }).eq("id", playerRow.id);
  if (upd.error) {
    // Desfaz o E2E recém-inserido para não travar uma nova tentativa do jogador.
    await admin.from("pix_receipts").delete().eq("e2e_id", e2e);
    console.warn("[pix] update players erro:", upd.error);
    return json({ ok: false, error: "persist_failed" }, 500);
  }

  // Espelha a mensalidade no LIVRO-CAIXA (aba Financeiro / Pro). Idempotente por
  // pix_e2e_id (unique). NÃO-fatal: o pagamento já está confirmado; o caixa é
  // derivado — se falhar, loga e segue (backfill futuro cobre).
  const finDate = /^\d{4}-\d{2}-\d{2}$/.test(extracted.date) ? extracted.date : new Date().toISOString().slice(0, 10);
  const fin = await admin.from("finance_entries").insert({
    club_id: clubId,
    kind: "receita",
    category: "mensalidade",
    amount: extracted.amount,
    date: finDate,
    player_id: String(playerRow.id),
    source: "pix_ia",
    pix_e2e_id: e2e,
  });
  if (fin.error && String(fin.error.code) !== "23505") {
    console.warn("[pix] insert finance_entries erro:", fin.error);
  }

  return json({ ok: true, result: "marked", extracted: view });
});
