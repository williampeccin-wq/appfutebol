// Cadastro de jogador com AUTORIDADE no servidor (service_role).
//
// Motivo: antes o cliente ANÔNIMO lia a tabela players inteira (checar telefone
// duplicado + "1º jogador = admin") e decidia is_admin no cliente. Isso obrigava
// policies de SELECT anônimo → qualquer um com a anon key (pública) lia o PII de
// todos SEM login. Aqui a validação e a criação ocorrem no servidor; o cliente
// anônimo só chama esta função. Depois disso as policies anon podem ser dropadas.
//
// Fluxo: valida input → checa telefone duplicado → decide isFirstPlayer (count) →
// cria o usuário no Auth (email_confirm) → insere a linha em players → loga com a
// senha e DEVOLVE a sessão (o cliente adota via loginWithPasskeySession).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const TECHNICAL_EMAIL_DOMAIN = "harmonia.app";
// Limite de membros do plano GRÁTIS (clube Pro é ilimitado). Server-side.
const FREE_MEMBER_LIMIT = 25;

// Rate-limit por IP: no máx RL_MAX cadastros por IP dentro de RL_WINDOW_MIN.
// Generoso o bastante para não pegar rajada legítima (rede/NAT compartilhado de
// carrier pega vários usuários no mesmo IP), apertado para matar criação em massa.
const RL_WINDOW_MIN = 60;
const RL_MAX = 30;

// IP do cliente. Edge Function atrás de proxy: o real vem no x-forwarded-for
// (primeiro da lista); cf-connecting-ip como reforço.
function clientIp(req: Request): string {
  const xff = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return xff || req.headers.get("cf-connecting-ip") || "unknown";
}

// TRUE quando o IP estourou o teto na janela → a chamada deve ser barrada (429).
// FAIL-OPEN: qualquer erro de infra (tabela ausente, leitura falha) NUNCA bloqueia
// um cadastro legítimo — só loga. Ordem de deploy (migration antes/depois) não
// quebra nada. Também mitiga o oráculo de telefone: sem sondar rápido, sem enumerar.
// deno-lint-ignore no-explicit-any
async function isRateLimited(admin: any, ip: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - RL_WINDOW_MIN * 60_000).toISOString();
    const { count, error } = await admin
      .from("register_rate_limit")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip).gte("created_at", since);
    if (error) { console.warn("[register] rate-limit read:", error.message); return false; }
    if ((count || 0) >= RL_MAX) return true;
    await admin.from("register_rate_limit").insert({ ip });
    // Limpeza oportunista (~5% das chamadas): remove tentativas com +1 dia.
    if (Math.random() < 0.05) {
      const old = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      await admin.from("register_rate_limit").delete().lt("created_at", old);
    }
    return false;
  } catch (err) {
    console.warn("[register] rate-limit:", String(err));
    return false;
  }
}

// Avisa os admins (push) que caiu um auto-cadastro aguardando aprovação.
// Best-effort: qualquer falha aqui NÃO quebra o cadastro. Reusa os secrets VAPID
// já configurados para a função send-push.
// deno-lint-ignore no-explicit-any
async function notifyAdminsOfRegistration(admin: any, playerName: string, clubId: string): Promise<void> {
  try {
    const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@harmonia.app";
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

    // Multi-tenant: só os admins DO MESMO CLUBE são avisados.
    const { data: admins } = await admin
      .from("players").select("id").eq("is_admin", true).eq("club_id", clubId);
    const adminIds = (admins || []).map((a: { id: string }) => String(a.id));
    if (!adminIds.length) return;

    const { data: subs } = await admin
      .from("push_subscriptions").select("endpoint, p256dh, auth").in("player_id", adminIds);
    if (!subs?.length) return;

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    const notification = JSON.stringify({
      title: "Novo cadastro 📝",
      body: `${playerName} quer entrar no grupo. Toque para aprovar.`,
      url: "./",
    });
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, notification);
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        const body = String((err as { body?: string })?.body || "");
        // Inscrição morta: endpoint sumiu (404/410) OU está presa numa chave VAPID
        // antiga (400 VapidPkHashMismatch, resquício de rotação de chave). Remove
        // para não tentar enviar para ela eternamente — ela se recria no próximo
        // "Ativar" do dono, já com a chave atual.
        if (statusCode === 404 || statusCode === 410 || (statusCode === 400 && /VapidPkHashMismatch/i.test(body))) {
          await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }
  } catch (err) {
    console.warn("[register] notifyAdmins:", String(err));
  }
}

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
function normalizePosition(value: unknown): string | null {
  const v = String(value || "");
  return ["gol", "zag", "meia", "atk"].includes(v) ? v : null;
}
// Código de convite: 6 chars, alfabeto sem ambíguos (0/O, 1/I/L). ~1e9 combos.
function genInviteCode(): string {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
function slugify(s: string): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "clube";
}
function ageFromBirthDate(iso: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const md = now.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
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

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch (_) { return json({ ok: false, error: "bad_request" }, 400); }

  // --- Validação (espelha o cliente) ---
  const name = String(payload.name || "").trim();
  const phone = normalizePhone(payload.phone);
  const birthDate = String(payload.birthDate || "").trim();
  const role = payload.role === "carne" ? "carne" : "player";
  const position = role === "player" ? normalizePosition(payload.position) : null;
  const password = String(payload.password || "").trim();

  if (!name) return json({ ok: false, error: "missing_name", message: "Informe o nome." });
  if (phone.length < 10 || phone.length > 11) return json({ ok: false, error: "bad_phone", message: "Informe um telefone válido." });
  if (!birthDate) return json({ ok: false, error: "missing_birthdate", message: "Informe a data de nascimento." });
  if (role === "player" && !position) return json({ ok: false, error: "missing_position", message: "Selecione a posição em campo." });
  if (password.length < 6) return json({ ok: false, error: "weak_password", message: "A senha precisa ter pelo menos 6 caracteres." });

  // Menor de 18: exige responsável legal (LGPD art. 14 / ECA). Revalida no servidor.
  const age = ageFromBirthDate(birthDate);
  const isMinor = age !== null && age < 18;
  const guardianName = String(payload.guardianName || "").trim();
  const guardianPhone = normalizePhone(payload.guardianPhone);
  if (isMinor && (!guardianName || guardianPhone.length < 10)) {
    return json({ ok: false, error: "guardian_required", message: "Cadastro de menor: informe o responsável legal (nome e telefone)." });
  }

  const technicalEmail = `${phone}@${TECHNICAL_EMAIL_DOMAIN}`;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // --- Onboarding multi-tenant: criar um clube OU entrar por código ---
  const clubMode = payload.clubMode === "create" ? "create"
    : payload.clubMode === "join" ? "join" : null;
  if (!clubMode) return json({ ok: false, error: "missing_club_choice", message: "Escolha criar um clube ou entrar com um código." });
  const clubName = String(payload.clubName || "").trim();
  const inviteCode = String(payload.inviteCode || "").trim().toUpperCase();
  if (clubMode === "create" && (clubName.length < 2 || clubName.length > 60)) {
    return json({ ok: false, error: "bad_club_name", message: "Dê um nome ao seu clube (2 a 60 caracteres)." });
  }
  if (clubMode === "join" && inviteCode.length < 4) {
    return json({ ok: false, error: "missing_invite_code", message: "Informe o código do clube." });
  }

  // --- Rate-limit por IP (antes de qualquer leitura/escrita real). Freia criação
  // em massa de contas/clubes e enumeração de telefones. Passa só depois da
  // validação de input, para erros de formulário não queimarem a cota. ---
  if (await isRateLimited(admin, clientIp(req))) {
    return json({ ok: false, error: "rate_limited", message: "Muitas tentativas deste dispositivo. Aguarde alguns minutos e tente de novo." }, 429);
  }

  // --- 1) Telefone duplicado? (MVP: telefone é GLOBAL = 1 conta = 1 clube) ---
  const { data: dup, error: dupErr } = await admin
    .from("players").select("id").eq("data->>phone", phone).limit(1).maybeSingle();
  if (dupErr) { console.error("[register] dup check:", dupErr.message); return json({ ok: false, error: "lookup_failed" }, 500); }
  if (dup?.id) return json({ ok: false, error: "duplicate_phone", message: "Esse telefone já está cadastrado." });

  // --- 2) Entrar por código: resolve o clube ANTES de criar a conta (fail fast) ---
  let joinClubId: string | null = null;
  if (clubMode === "join") {
    const { data: found, error: findErr } = await admin
      .from("clubs").select("id, plan").eq("invite_code", inviteCode).maybeSingle();
    if (findErr) { console.error("[register] find club:", findErr.message); return json({ ok: false, error: "lookup_failed" }, 500); }
    if (!found?.id) return json({ ok: false, error: "invalid_invite_code", message: "Código de clube inválido. Confira com o administrador." });
    joinClubId = found.id;
    // Limite do Free: teto de membros (Pro é ilimitado).
    if (String(found.plan || "free") !== "pro") {
      const { count } = await admin.from("players").select("id", { count: "exact", head: true }).eq("club_id", found.id);
      if ((count || 0) >= FREE_MEMBER_LIMIT) {
        return json({ ok: false, error: "club_full", message: `Este clube atingiu o limite de ${FREE_MEMBER_LIMIT} membros do plano gratuito. O administrador libera mais vagas assinando o Pro.` }, 403);
      }
    }
  }

  // --- 3) Cria o usuário no Auth (já confirmado) ---
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: technicalEmail,
    password,
    email_confirm: true,
    user_metadata: { name, phone, birthDate, login_type: "phone_password" },
  });
  if (createErr || !created?.user?.id) {
    // Corrida/duplicado no Auth (email único) → trata como telefone já usado.
    const msg = String(createErr?.message || "");
    if (/already|exists|registered|duplicate/i.test(msg)) {
      return json({ ok: false, error: "duplicate_phone", message: "Esse telefone já está cadastrado." });
    }
    console.error("[register] createUser:", msg);
    return json({ ok: false, error: "create_user_failed" }, 500);
  }
  const authUserId = created.user.id;

  // --- 4) Resolve o clube final: CRIA um novo OU usa o do código ---
  let clubId: string;
  let createdInviteCode: string | null = null;
  if (clubMode === "create") {
    let newClub: { id: string; invite_code: string } | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = genInviteCode();
      const { data, error } = await admin.from("clubs").insert({
        name: clubName,
        slug: `${slugify(clubName)}-${code.toLowerCase()}`,
        invite_code: code,
        plan: "free",
        owner_auth_user_id: authUserId,
      }).select("id, invite_code").single();
      if (!error && data) { newClub = data as { id: string; invite_code: string }; break; }
      if (error && error.code === "23505") continue; // colisão de code/slug → tenta outro
      console.error("[register] create club:", error?.message);
      await admin.auth.admin.deleteUser(authUserId).catch(() => {});
      return json({ ok: false, error: "create_club_failed" }, 500);
    }
    if (!newClub) {
      await admin.auth.admin.deleteUser(authUserId).catch(() => {});
      return json({ ok: false, error: "create_club_failed" }, 500);
    }
    clubId = newClub.id;
    createdInviteCode = newClub.invite_code;
  } else {
    clubId = joinClubId!;
  }

  // Quem CRIA o clube entra admin aprovado; quem ENTRA por código fica pendente.
  const isAdmin = clubMode === "create";
  const isPending = clubMode === "join";

  // --- 5) Insere a linha em players (club_id explícito p/ o clube resolvido) ---
  const playerId = `p${Date.now()}`;
  const playerData = {
    id: playerId,
    auth_user_id: authUserId,
    email: technicalEmail,
    login_phone: phone,
    name,
    phone,
    birthDate,
    role,
    plays_football: role === "player",
    in_carne_group: true,
    position,
    mens_ok: false,
    is_admin: isAdmin,
    // Entrar por código NÃO dá acesso ao grupo: entra pendente de aprovação do
    // admin do clube. Quem cria o clube (dono) já entra aprovado.
    pending: isPending,
    // Menor de idade + consentimento do responsável legal (LGPD art. 14 / ECA).
    ...(isMinor ? {
      minor: true,
      guardian_name: guardianName,
      guardian_phone: guardianPhone,
      parental_consent_at: new Date().toISOString(),
    } : {}),
  };
  const { error: insErr } = await admin.from("players").insert({
    id: playerId,
    auth_user_id: authUserId,
    is_admin: isAdmin,
    club_id: clubId,
    data: playerData,
    updated_at: new Date().toISOString(),
  });
  if (insErr) {
    // Não deixa órfãos: desfaz o usuário do Auth e, se criamos um clube só pra
    // este dono, remove o clube órfão também.
    console.error("[register] insert player:", insErr.message);
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    if (clubMode === "create") { try { await admin.from("clubs").delete().eq("id", clubId); } catch (_) { /* best-effort */ } }
    return json({ ok: false, error: "insert_player_failed" }, 500);
  }

  // Clube NOVO: semeia um blob vazio (app_meta/game_state com key=club_id). Sem
  // isso, a 1ª carga do dono cai no guard anti-degradação ("meta ausente com
  // players") — falso positivo, porque o clube legitimamente ainda não tem dados.
  // composeState fabrica os defaults a partir do {} (clube vazio, sem jogos/config).
  if (clubMode === "create") {
    const nowIso = new Date().toISOString();
    // Semeia um PERFIL explícito. Hoje o clube novo já não herda nada (o blob
    // dele tem key=club_id, e a ponte do dataset legado só vale para a key
    // 'default'), mas gravar o perfil torna isso determinístico em vez de
    // depender da forma da key — e marca o clube como já inicializado.
    // Só o schema_version: todo o resto vem dos defaults, e o admin ajusta em
    // Config > "Como o clube joga".
    const seedProfile = { schema_version: 1 };
    const seedMeta = await admin.from("app_meta").insert({ key: clubId, data: { profile: seedProfile }, updated_at: nowIso });
    if (seedMeta.error) console.error("[register] seed app_meta:", seedMeta.error.message);
    const seedGame = await admin.from("game_state").insert({ key: clubId, data: {}, updated_at: nowIso });
    if (seedGame.error) console.error("[register] seed game_state:", seedGame.error.message);
  }

  // Entrar por código = pendente: avisa os admins DAQUELE clube (best-effort).
  if (isPending) await notifyAdminsOfRegistration(admin, name, clubId);

  // --- 5) Loga com a senha e devolve a sessão (cliente adota) ---
  try {
    const anonClient = createClient(SUPABASE_URL, ANON);
    const { data: signIn, error: signErr } = await anonClient.auth.signInWithPassword({ email: technicalEmail, password });
    if (signErr || !signIn?.session) {
      // Cadastro OK, mas login automático falhou → cliente cai no login manual.
      return json({ ok: true, session: null, club: createdInviteCode ? { invite_code: createdInviteCode } : null, message: "Cadastro realizado. Faça login." });
    }
    const s = signIn.session;
    return json({
      ok: true,
      // Ao CRIAR um clube, devolve o invite_code p/ a UI mostrar e o dono compartilhar.
      club: createdInviteCode ? { invite_code: createdInviteCode } : null,
      session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, user: s.user },
    });
  } catch (error) {
    console.error("[register] signIn:", String(error));
    return json({ ok: true, session: null, message: "Cadastro realizado. Faça login." });
  }
});
