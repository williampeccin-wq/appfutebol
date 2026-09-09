// Aviso ao ADMIN: alguém que estava escalado cancelou a presença (Web Push).
//
// POR QUE EXISTE: o sorteio é uma foto. Quando um jogador cancela depois dele, o
// time fica desfalcado e o admin não fica sabendo — no Harmonia (09/09/2026)
// dois saíram e o admin só descobriu na hora de montar o time em campo. A tela
// já esconde quem saiu (domain/draw-teams.js, semQuemCancelou), mas esconder não
// avisa: quem precisa decidir se re-sorteia ou remaneja é o admin.
//
// Chamado pelo app logo depois do cancelamento, por quem cancelou (jogador
// comum). Por isso o servidor não confia no cliente e verifica tudo de novo:
//   1) o chamador tem sessão válida e pertence a um clube;
//   2) o jogador está mesmo NÃO confirmado neste jogo (anti-forja);
//   3) ele estava mesmo no sorteio vigente — sem sorteio, não há desfalque;
//   4) deduplica por (kind, player_id, game_key): um aviso por saída, por jogo,
//      mesmo que vários clientes detectem a mesma saída;
//   5) envia para os administradores do clube (menos quem saiu, se for admin).

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

const KIND = "escalacao_desfalque";
const ROTULOS = ["A", "B", "C", "D", "E", "F"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Mesma leitura do domain/draw-teams.js: `teams` quando existe, senão o par
// legado team_a/team_b. Entrada pode ser id (string) ou objeto (convidado).
function timesDoSorteio(draw: Record<string, unknown> | null): unknown[][] {
  if (!draw || typeof draw !== "object") return [];
  if (Array.isArray(draw.teams)) return (draw.teams as unknown[][]).map((t) => (Array.isArray(t) ? t : []));
  const times: unknown[][] = [Array.isArray(draw.team_a) ? (draw.team_a as unknown[]) : []];
  if (Array.isArray(draw.team_b)) times.push(draw.team_b as unknown[]);
  return times;
}

function idDaEntrada(entrada: unknown): string {
  if (entrada && typeof entrada === "object") return String((entrada as { id?: unknown }).id || "");
  return String(entrada || "");
}

function formatGameDate(raw: string): string {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}`;
  return s;
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

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: "vapid_not_configured" }, 500);

  let payload: { game_key?: string; player_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const gameKey = String(payload.game_key || "").trim();
  const playerId = String(payload.player_id || "").trim();
  if (!gameKey || !playerId) return json({ error: "missing_game_or_player" }, 400);

  // Sessão válida obrigatória: só o anon key não basta. Fecha o uso anônimo como
  // oráculo de presença/spam.
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader || authHeader === `Bearer ${ANON}`) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Clube do chamador (multi-tenant): tudo abaixo opera dentro deste clube.
  const { data: caller } = await admin
    .from("players").select("club_id").eq("auth_user_id", userData.user.id).maybeSingle();
  const clubId = String(caller?.club_id || "");
  if (!clubId) return json({ error: "unauthorized" }, 401);

  // 1) Anti-forja: precisa estar NÃO confirmado neste jogo. A gravação do
  //    cliente é assíncrona (debounce), então tentamos algumas vezes — o
  //    cancelamento recém-feito precisa de tempo para assentar no banco.
  let aindaConfirmado = true;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: conf } = await admin
      .from("presence_confirmations")
      .select("status, data")
      .eq("game_key", gameKey).eq("player_id", playerId).eq("club_id", clubId).maybeSingle();
    aindaConfirmado = conf?.status === "confirmed"
      || (conf?.data as Record<string, unknown> | null)?.confirmed === true;
    if (!aindaConfirmado) break;
    if (attempt < 4) await sleep(1000);
  }
  if (aindaConfirmado) return json({ ok: true, skipped: "ainda_confirmado" });

  // 2) Estava no sorteio? Sem sorteio (ou fora dele) não há desfalque a avisar.
  const { data: metaRow } = await admin.from("app_meta").select("data").eq("key", clubId).maybeSingle();
  const meta = (metaRow?.data as Record<string, unknown> | null) || {};
  const games = (meta.games as Array<Record<string, unknown>> | undefined) || [];
  const game = games.find((g) => String(g?.game_key || g?.id || "") === gameKey) || null;
  const draw = (game?.sort_result as Record<string, unknown> | null) || null;
  const times = timesDoSorteio(draw);
  const indiceDoTime = times.findIndex((time) => time.some((e) => idDaEntrada(e) === playerId));
  if (indiceDoTime < 0) return json({ ok: true, skipped: "fora_do_sorteio" });

  const { data: pRow } = await admin.from("players").select("data").eq("id", playerId).maybeSingle();
  const nome = String((pRow?.data as Record<string, unknown> | null)?.name || "Um jogador").split(" ")[0] || "Um jogador";
  const rotulo = ROTULOS[indiceDoTime] || String(indiceDoTime + 1);
  const restantes = Math.max(0, (times[indiceDoTime]?.length || 1) - 1);
  const dataDoJogo = formatGameDate(String(game?.game_date || game?.date || ""));

  const title = "Time desfalcado ⚠️";
  const body = `${nome} cancelou a presença e saiu do Time ${rotulo}`
    + `${dataDoJogo ? ` (jogo de ${dataDoJogo})` : ""}. `
    + `O time ficou com ${restantes}. Abra o app para remanejar ou sortear de novo.`;

  // 3) Dedup: um aviso por (jogador que saiu + jogo). O SELECT resolve o caso
  //    comum e o índice único (uq_push_log_dropout) fecha a corrida entre dois
  //    clientes. `player_id` aqui é QUEM SAIU, não quem recebe — é o que dá a
  //    chave de deduplicação; os destinatários são os admins.
  const { data: jaAvisado } = await admin
    .from("push_log").select("id")
    .eq("kind", KIND).eq("player_id", playerId).eq("game_key", gameKey).limit(1);
  if (jaAvisado && jaAvisado.length) return json({ ok: true, skipped: "ja_avisado" });

  const { data: logRow, error: insErr } = await admin
    .from("push_log")
    .insert({ kind: KIND, player_id: playerId, game_key: gameKey, club_id: clubId, title, body, status: "sent" })
    .select("id").single();
  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") return json({ ok: true, skipped: "ja_avisado" });
    return json({ ok: false, error: "log_failed" }, 500);
  }
  const logId = logRow?.id || null;

  // 4) Destinatários: administradores do clube, menos quem saiu.
  const { data: admins } = await admin
    .from("players").select("id").eq("club_id", clubId).eq("is_admin", true);
  const adminIds = (admins || []).map((a) => String(a.id)).filter((id) => id && id !== playerId);
  if (!adminIds.length) return json({ ok: true, notified: 0, skipped: "sem_admin" });

  const { data: subs } = await admin
    .from("push_subscriptions").select("endpoint, p256dh, auth, player_id").in("player_id", adminIds);
  if (!subs || !subs.length) return json({ ok: true, notified: 0, skipped: "sem_inscricao" });

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const receiptUrl = `${SUPABASE_URL}/functions/v1/send-overdue-reminders`;
  const notification = JSON.stringify({ title, body, url: "./", logId, receiptUrl, anonKey: ANON });

  let sent = 0, failed = 0, removed = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        notification,
      );
      sent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      const mensagem = String((err as Error)?.message || statusCode || "");
      // 404/410 = inscrição morta. VapidPkHashMismatch = inscrição presa a uma
      // chave VAPID antiga: nunca mais entrega, some do banco também.
      if (statusCode === 404 || statusCode === 410
        || /VapidPkHashMismatch|do not correspond to the credentials/i.test(mensagem)) {
        await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        removed += 1;
      } else {
        failed += 1;
      }
    }
  }

  if (!sent && logId) {
    await admin.from("push_log").update({ status: failed ? "failed" : "expired" }).eq("id", logId);
  }

  return json({ ok: true, notified: adminIds.length, sent, failed, removed, time: rotulo });
});
