// Push de aniversário (Web Push).
//
// Quem dispara: o cron do Supabase (pg_cron + pg_net), 1x/dia às 11:00 UTC
// (= 08:00 de Brasília). Também aceita disparo manual de um admin, para
// validar sem esperar o horário.
//
// Regra: no dia do aniversário de alguém do clube, TODOS os integrantes recebem
// um push com o nome do(s) aniversariante(s) — joguem futebol ou sejam só do
// churrasco. O próprio aniversariante recebe os parabéns em vez do aviso.
// É recurso de diversão, então vale para todo clube (Free e Pro).
//
// Fica de fora quem foi excluído (data.deleted), saiu do time (data.left_team),
// está inativo (data.active === false) ou ainda aguarda aprovação (data.pending).
// Quem nasceu em 29/02 faz aniversário em 28/02 nos anos que não são bissextos.
//
// O admin desliga em Config → Notificações (settings.notifications.aniversario).
// Auditoria: cada envio vira uma linha em push_log (kind 'aniversario'), e a
// mesma linha é a trava contra mandar duas vezes no mesmo dia.
//
// Funciona nos dois bancos: no multi-tenant (Convocados) roda clube a clube; no
// single-tenant (harmonia-fc, sem tabela `clubs` nem coluna club_id) roda no
// blob único.

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

const KIND = "aniversario";

// Data de hoje em Brasília (UTC-3, sem horário de verão desde 2019), formato YYYY-MM-DD.
function todayBrtIso(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Aceita "AAAA-MM-DD" (o formato gravado) e "DD/MM[/AAAA]" (dado antigo).
function birthMonthDay(raw: unknown): { month: number; day: number } | null {
  const s = String(raw || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { month: Number(m[2]), day: Number(m[3]) };
  m = s.match(/^(\d{2})\/(\d{2})(?:\/\d{4})?$/);
  if (m) return { month: Number(m[2]), day: Number(m[1]) };
  return null;
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isBirthdayToday(raw: unknown, today: string): boolean {
  const md = birthMonthDay(raw);
  if (!md) return false;
  const [year, month, day] = today.split("-").map(Number);
  if (md.month === month && md.day === day) return true;
  return md.month === 2 && md.day === 29 && month === 2 && day === 28 && !isLeap(year);
}

// ["Ana"] -> "Ana"; ["Ana","Bia"] -> "Ana e Bia"; ["Ana","Bia","Cris"] -> "Ana, Bia e Cris"
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

function isMember(d: Record<string, unknown>): boolean {
  return d.deleted !== true && d.left_team !== true && d.active !== false && d.pending !== true;
}

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

  // cron manda vazio; o admin pode mandar {dry_run} (só conta, não envia);
  // o service worker manda {receipt:{logId,type}}.
  let payload: { dry_run?: boolean; receipt?: { logId?: string; type?: string } } = {};
  try { payload = await req.json(); } catch (_) { /* corpo vazio = cron */ }

  // --- Recibo de auditoria do service worker (entregue/aberta) ---
  if (payload.receipt && payload.receipt.logId && payload.receipt.type) {
    const logId = String(payload.receipt.logId);
    const column = payload.receipt.type === "opened" ? "opened_at"
      : payload.receipt.type === "delivered" ? "delivered_at" : null;
    if (!column) return json({ error: "invalid_type" }, 400);
    const { error: rErr } = await admin.from("push_log")
      .update({ [column]: new Date().toISOString() }).eq("id", logId).is(column, null);
    if (rErr) { console.error("[aniversario] receipt:", rErr.message); return json({ error: "receipt_failed" }, 500); }
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

  const dryRun = payload.dry_run === true;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const receiptUrl = `${SUPABASE_URL}/functions/v1/send-birthday-push`;

  let singleTenant = false;
  async function singleTenantKey(): Promise<string> {
    const { data } = await admin.from("app_meta").select("key").limit(2);
    if (data && data.length === 1) return String(data[0].key);
    return "default";
  }

  async function processClub(clubId: string): Promise<Record<string, unknown>> {
    const today = todayBrtIso();
    const { data: metaRow } = await admin.from("app_meta").select("data").eq("key", clubId).maybeSingle();
    const settings = (metaRow?.data as Record<string, unknown> | null)?.settings as Record<string, unknown> | undefined;
    if ((settings?.notifications as Record<string, boolean> | undefined)?.aniversario === false) {
      return { skipped: "notificacao_desligada" };
    }

    const playersQuery = admin.from("players").select("id, data");
    const { data: players, error: pErr } = await (singleTenant ? playersQuery : playersQuery.eq("club_id", clubId));
    if (pErr) throw new Error(`players: ${pErr.message}`);
    const members = (players || []).filter((row) => isMember((row.data || {}) as Record<string, unknown>));
    const birthdayRows = members.filter((row) => isBirthdayToday((row.data as Record<string, unknown>)?.birthDate, today));
    if (!birthdayRows.length) return { today, members: members.length, birthdays: 0, sent: 0 };

    const nameOf = (row: { data: unknown }) => String((row.data as Record<string, unknown>)?.name || "").trim();
    const birthdayIds = new Set(birthdayRows.map((r) => String(r.id)));
    const birthdayNames = birthdayRows.map(nameOf).filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (!birthdayNames.length) return { today, birthdays: birthdayRows.length, skipped: "sem_nome" };

    // Trava do dia: quem já recebeu hoje (BRT começa às 03:00Z) não recebe de novo.
    const sinceUtc = `${today}T03:00:00Z`;
    const todaysQuery = admin.from("push_log").select("player_id").eq("kind", KIND).gte("sent_at", sinceUtc);
    const { data: todays } = await (singleTenant ? todaysQuery : todaysQuery.eq("club_id", clubId));
    const alreadyToday = new Set((todays || []).map((r) => String(r.player_id)));

    const title = birthdayNames.length > 1 ? "🎂 Aniversariantes do dia" : "🎂 Aniversário no grupo";
    // Um aparelho pode estar assinado por mais de um jogador: manda uma vez só.
    const endpointsUsed = new Set<string>();
    let sent = 0, failed = 0, removed = 0, targets = 0, recipients = 0;

    // Aniversariantes primeiro: se o aparelho é compartilhado, ganha os parabéns.
    const ordered = [...members].sort((a, b) =>
      Number(birthdayIds.has(String(b.id))) - Number(birthdayIds.has(String(a.id))));

    for (const row of ordered) {
      const playerId = String(row.id);
      if (alreadyToday.has(playerId)) continue;
      const isBirthdayPerson = birthdayIds.has(playerId);
      const firstName = nameOf(row).split(" ")[0] || "";
      const others = birthdayNames.filter((n) => n !== nameOf(row));

      let body: string;
      if (isBirthdayPerson) {
        body = others.length
          ? `Parabéns, ${firstName}! 🎉 Hoje o grupo comemora você — e também ${joinNames(others)}. Feliz aniversário! 💛⚽`
          : `Parabéns, ${firstName}! 🎉 O grupo todo deseja um feliz aniversário pra você! 💛⚽`;
      } else {
        body = birthdayNames.length > 1
          ? `Hoje é aniversário de ${joinNames(birthdayNames)}! Manda os parabéns pra eles. 🎉`
          : `Hoje é aniversário de ${birthdayNames[0]}! Manda os parabéns. 🎉`;
      }

      const subsQuery = admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("player_id", playerId);
      const { data: subs } = await (singleTenant ? subsQuery : subsQuery.eq("club_id", clubId));
      const fresh = (subs || []).filter((s) => !endpointsUsed.has(String(s.endpoint)));
      if (!fresh.length) continue;
      recipients += 1;

      for (const sub of fresh) {
        endpointsUsed.add(String(sub.endpoint));
        targets += 1;
        if (dryRun) continue;
        const logInsert: Record<string, unknown> = { kind: KIND, player_id: playerId, endpoint: sub.endpoint, title, body, status: "sent" };
        if (!singleTenant) logInsert.club_id = clubId;
        const { data: logRow } = await admin.from("push_log").insert(logInsert).select("id").single();
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
    return { today, birthdays: birthdayNames, members: members.length, recipients, targets, sent, failed, removed, dryRun };
  }

  // Cron → todos os clubes. Admin manual → só o clube dele.
  if (isCron) {
    const clubsRead = await admin.from("clubs").select("id");
    let clubs = clubsRead.data as Array<{ id: string }> | null;
    if (clubsRead.error && isMissingTable(clubsRead.error)) {
      singleTenant = true;
      clubs = [{ id: await singleTenantKey() }];
    } else if (clubsRead.error) {
      console.error("[aniversario] clubs read:", clubsRead.error.message);
      return json({ error: "clubs_query_failed", code: clubsRead.error.code || null }, 500);
    }
    const results: Record<string, unknown>[] = [];
    let totalSent = 0;
    for (const c of (clubs || [])) {
      try {
        const r = await processClub(String(c.id));
        totalSent += Number(r.sent || 0);
        if (r.birthdays && r.birthdays !== 0) results.push({ club: c.id, ...r });
      } catch (err) {
        const message = String((err as Error)?.message || err).slice(0, 200);
        console.error("[aniversario] clube falhou", String(c.id), message);
        results.push({ club: c.id, error: message });
      }
    }
    return json({ ok: true, mode: "cron", clubs: (clubs || []).length, sent: totalSent, results });
  }

  const meRead = await admin.from("players").select("club_id").eq("auth_user_id", adminUserId).maybeSingle();
  if (meRead.error && isMissingColumn(meRead.error)) singleTenant = true;
  const clubId = singleTenant ? await singleTenantKey() : String(meRead.data?.club_id || "");
  if (!clubId) return json({ error: "player_not_found" }, 403);
  const r = await processClub(clubId);
  return json({ ok: true, mode: "admin", ...r });
});
