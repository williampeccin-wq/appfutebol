// Lembrete diário de mensalidade em atraso (Web Push).
//
// Quem dispara: o cron do Supabase (pg_cron + pg_net), 1x/dia às 10:00 UTC
// (= 07:00 de Brasília). Também aceita disparo manual de um admin (botão de
// teste no app), para validar sem esperar o horário.
//
// Regra do atrasado (espelha rules.engine do app):
//   - joga futebol (data.plays_football !== false) e não é "só carne"
//   - data.mens_ok === false  (explicitamente inadimplente)
//   - hoje (BRT) já passou do vencimento global (app_meta.data.settings.mens_expire_date)
//   - E já passou do prazo DESTE mês (mesmo dia, projetado no mês corrente) —
//     trava contra vencimento parado no passado, que fazia o lembrete disparar
//     desde o dia 1º da virada. Ver dueDateThisMonth.
//
// Auditoria: cada envio vira uma linha em push_log (status sent/failed/expired).
// A entrega no aparelho e a abertura chegam depois, via push-receipt.

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

// Data de hoje em Brasília (UTC-3, sem horário de verão desde 2019), formato YYYY-MM-DD.
function todayBrtIso(): string {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

// Prazo do MÊS CORRENTE: o dia configurado (10, 15, ...) projetado no mês de
// hoje. O vencimento guardado é do ciclo, e quem o empurra para o mês novo é o
// app (rules.engine/rollMensDueDateToMonth) — mas ele só roda quando um ADMIN
// abre o app. Enquanto isso não acontece, `mens_expire_date` fica no passado e o
// `today > dueDate` sozinho diz "venceu" desde o dia 1º.
//
// Foi assim que o clube levou 19 pushes/dia a partir de 01/09/2026, com a data
// parada num 10/09/2020 digitado errado: a virada zerou todo mundo e o prazo
// velho já estava vencido havia anos. Exigir as DUAS condições (venceu a data
// guardada E venceu o prazo deste mês) é estritamente mais conservador que a
// regra antiga — nunca manda um push que antes não seria mandado.
//
// Efeito de borda conhecido: vencimento no ÚLTIMO dia do mês não gera lembrete
// nesse mês (o "1º dia após o vencimento" já é do ciclo seguinte, onde o app
// zerou todo mundo). Vale para dia 30/31 e para fevereiro.
function dueDateThisMonth(dueDate: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return dueDate;
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(Math.max(Number(dueDate.slice(8, 10)) || 1, 1), lastDay);
  return `${today.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

// 2026-09-10 -> "10/09"
function ddmm(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "";
}

const KIND = "mensalidade_atrasada";

// "Tabela/coluna não existe": o PostgREST resolve pelo schema cache e devolve
// PGRST205/PGRST204 ANTES de chegar ao Postgres, então olhar só o SQLSTATE não basta.
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205", "PGRST202", "PGRST200"]);
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code && MISSING_TABLE_CODES.has(err.code)) return true;
  return /does not exist|schema cache/i.test(String(err.message || ""));
}
function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code && MISSING_COLUMN_CODES.has(err.code)) return true;
  return /column .* does not exist|could not find the .* column/i.test(String(err.message || ""));
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@harmonia.app";
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: "vapid_not_configured" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Lê o corpo uma vez (cron manda vazio; teste do admin manda {force}; o service
  // worker manda {receipt:{logId,type}}).
  let payload: { force?: boolean; receipt?: { logId?: string; type?: string } } = {};
  try { payload = await req.json(); } catch (_) { /* corpo vazio = cron */ }

  // --- Recibo de auditoria do service worker (entregue/aberta) ---
  // Chega com o anon key (que o gateway desta função aceita) e NÃO exige admin:
  // apenas carimba delivered_at/opened_at no push_log. Tratado ANTES da
  // autorização. logId é um UUID aleatório, então o risco de forja é baixo.
  if (payload.receipt && payload.receipt.logId && payload.receipt.type) {
    const logId = String(payload.receipt.logId);
    const column = payload.receipt.type === "opened" ? "opened_at"
      : payload.receipt.type === "delivered" ? "delivered_at" : null;
    if (!column) return json({ error: "invalid_type" }, 400);
    const { error: rErr } = await admin.from("push_log")
      .update({ [column]: new Date().toISOString() }).eq("id", logId).is(column, null);
    if (rErr) { console.error("[overdue] receipt:", rErr.message); return json({ error: "receipt_failed" }, 500); }
    return json({ ok: true, receipt: payload.receipt.type });
  }

  // --- Autorização: cron (x-cron-secret) OU admin logado (JWT -> players.is_admin) ---
  const cronSecret = req.headers.get("x-cron-secret") || "";
  let isCron = false;
  let adminUserId: string | null = null;
  if (CRON_SECRET && cronSecret && cronSecret === CRON_SECRET) {
    isCron = true;
  } else {
    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader && authHeader !== `Bearer ${ANON}`) {
      const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
      const { data: userData } = await userClient.auth.getUser();
      const user = userData?.user;
      if (user) {
        const { data: player } = await admin.from("players").select("is_admin").eq("auth_user_id", user.id).maybeSingle();
        if (player?.is_admin) adminUserId = user.id;
      }
    }
  }
  if (!isCron && !adminUserId) return json({ error: "unauthorized" }, 401);

  // `force`: ignora a deduplicação do dia (usado no teste manual do admin).
  const force = payload.force === true;

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  // Os recibos voltam para ESTA própria função (cujo gateway aceita o anon key).
  const receiptUrl = `${SUPABASE_URL}/functions/v1/send-overdue-reminders`;

  // Projeto sem as migrations multi-tenant (harmonia-fc): não existe a tabela
  // `clubs` nem coluna club_id em tabela nenhuma. Sem esta tolerância, a busca de
  // clubes não acha ninguém e o cron passa a responder "ok" SEM MANDAR NADA — pior
  // que falhar, porque some sem ruído. Resolvido uma vez, antes do primeiro uso.
  let singleTenant = false;

  // Chave do blob quando não há clubes: 'default' na instalação original, ou o
  // blob único do projeto. Com mais de um blob não há o que adivinhar.
  async function singleTenantKey(): Promise<string> {
    const { data } = await admin.from("app_meta").select("key").limit(2);
    if (data && data.length === 1) return String(data[0].key);
    return "default";
  }

  // Processa UM clube (lembrete de atraso = recurso PRO). Blob por club_id;
  // vencimento, jogadores, dedup e push todos escopados ao clube — exceto no
  // projeto single-tenant, onde há um clube só e "todos" já é o escopo certo.
  async function processClub(clubId: string): Promise<Record<string, unknown>> {
    const { data: metaRow } = await admin.from("app_meta").select("data").eq("key", clubId).maybeSingle();
    if (!metaRow) return { skipped: "sem_blob" };
    const settings = (metaRow.data as Record<string, unknown> | null)?.settings as Record<string, unknown> | undefined;
    if ((settings?.notifications as Record<string, boolean> | undefined)?.mensalidade_atrasada === false) {
      return { skipped: "notificacao_desligada" };
    }
    const dueDate = String(settings?.mens_expire_date || "").slice(0, 10);
    const today = todayBrtIso();
    if (!dueDate) return { skipped: "sem_vencimento" };
    if (today <= dueDate) return { skipped: "ainda_nao_venceu", dueDate, today };
    const dueThisMonth = dueDateThisMonth(dueDate, today);
    if (today <= dueThisMonth) return { skipped: "prazo_do_mes_nao_venceu", dueDate, dueThisMonth, today };

    const playersQuery = admin.from("players").select("id, data");
    const { data: players } = await (singleTenant ? playersQuery : playersQuery.eq("club_id", clubId));
    const overdue = (players || []).filter((row) => {
      const d = (row.data || {}) as Record<string, unknown>;
      const carneOnly = d.role === "carne" || d.plays_football === false;
      const playsFootball = d.plays_football !== false && !carneOnly;
      return playsFootball && d.mens_ok === false;
    });
    if (!overdue.length) return { dueDate, dueThisMonth, today, overdue: 0, sent: 0 };

    let alreadyToday = new Set<string>();
    if (!force) {
      const todaysQuery = admin
        .from("push_log").select("player_id")
        .eq("kind", KIND).gte("sent_at", `${today}T00:00:00Z`);
      const { data: todays } = await (singleTenant ? todaysQuery : todaysQuery.eq("club_id", clubId));
      alreadyToday = new Set((todays || []).map((r) => String(r.player_id)));
    }

    let sent = 0, failed = 0, removed = 0, targets = 0;
    for (const row of overdue) {
      const playerId = String(row.id);
      if (alreadyToday.has(playerId)) continue;
      const d = (row.data || {}) as Record<string, unknown>;
      const firstName = String(d.name || "").split(" ")[0] || "jogador";

      const subsQuery = admin
        .from("push_subscriptions").select("endpoint, p256dh, auth").eq("player_id", playerId);
      const { data: subs } = await (singleTenant ? subsQuery : subsQuery.eq("club_id", clubId));
      if (!subs || !subs.length) continue;

      const title = "Convocados — mensalidade";
      // A data do prazo no corpo é pedido do clube: sem ela o aviso parece
      // "cobrança do nada" para quem não lembra o vencimento.
      const prazo = ddmm(dueThisMonth);
      const body = prazo
        ? `Oi, ${firstName}! Sua mensalidade venceu em ${prazo} e está em atraso. Fala com o ADM do grupo pra acertar e evitar bloqueios. 💛⚽`
        : `Oi, ${firstName}! Sua mensalidade está em atraso. Fala com o ADM do grupo pra acertar e evitar bloqueios. 💛⚽`;

      for (const sub of subs) {
        targets += 1;
        const logInsert: Record<string, unknown> = { kind: KIND, player_id: playerId, endpoint: sub.endpoint, title, body, status: "sent" };
        if (!singleTenant) logInsert.club_id = clubId; // coluna inexistente no single-tenant
        const { data: logRow } = await admin
          .from("push_log").insert(logInsert).select("id").single();
        const logId = logRow?.id || null;

        const notification = JSON.stringify({ title, body, url: "./", logId, receiptUrl, anonKey: ANON });
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, notification);
          sent += 1;
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            if (logId) await admin.from("push_log").update({ status: "expired" }).eq("id", logId);
            removed += 1;
          } else {
            if (logId) await admin.from("push_log").update({ status: "failed", error: String((err as Error)?.message || statusCode) }).eq("id", logId);
            failed += 1;
          }
        }
      }
    }
    return { dueDate, dueThisMonth, today, overdue: overdue.length, targets, sent, failed, removed };
  }

  // Cron → todos os clubes PRO. Admin manual → só o clube dele (com gate Pro).
  if (isCron) {
    const clubsRead = await admin.from("clubs").select("id").eq("plan", "pro");
    let proClubs = clubsRead.data as Array<{ id: string }> | null;
    if (clubsRead.error && isMissingTable(clubsRead.error)) {
      // Sem tabela de planos não há o que gatear: o clube único vale como pro.
      singleTenant = true;
      proClubs = [{ id: await singleTenantKey() }];
    } else if (clubsRead.error) {
      console.error("[overdue] clubs read:", clubsRead.error.message);
      return json({ error: "clubs_query_failed", code: clubsRead.error.code || null }, 500);
    }
    const results: Record<string, unknown>[] = [];
    let totalSent = 0;
    for (const c of (proClubs || [])) {
      // Falha de UM clube não pode cancelar o lembrete dos outros: processClub
      // toca dado de clube (blob + jogadores) e uma exceção aqui mataria a rodada.
      try {
        const r = await processClub(String(c.id));
        totalSent += Number(r.sent || 0);
        results.push({ club: c.id, ...r });
      } catch (err) {
        const message = String((err as Error)?.message || err).slice(0, 200);
        console.error("[overdue] clube falhou", String(c.id), message);
        results.push({ club: c.id, error: message });
      }
    }
    return json({ ok: true, mode: "cron", clubs: (proClubs || []).length, sent: totalSent, results });
  }

  // Admin manual: resolve o clube + plano; gate Pro (lembrete é recurso Pro).
  const meRead = await admin.from("players").select("club_id").eq("auth_user_id", adminUserId).maybeSingle();
  if (meRead.error && isMissingColumn(meRead.error)) singleTenant = true;
  const clubId = singleTenant ? await singleTenantKey() : String(meRead.data?.club_id || "");
  if (!clubId) return json({ error: "player_not_found" }, 403);
  if (!singleTenant) {
    const { data: club } = await admin.from("clubs").select("plan").eq("id", clubId).maybeSingle();
    if (String(club?.plan || "free") !== "pro") {
      return json({ ok: false, error: "pro_required", message: "O lembrete automático de atraso é um recurso Pro." }, 402);
    }
  }
  const r = await processClub(clubId);
  return json({ ok: true, mode: "admin", ...r });
});
