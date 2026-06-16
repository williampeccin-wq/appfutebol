// Login por passkey (WebAuthn). Usa o SDK do Supabase SÓ para a cerimônia,
// em modo NEUTRO de sessão (não persiste nem renova) — os tokens resultantes
// são entregues ao auth.service, que mantém a sessão no nosso modelo
// (harmonia_auth_session + poll/refresh próprios). O SDK é carregado sob
// demanda (lazy) via CDN ESM, então não pesa no boot de quem não usa passkey.
// Recurso BETA do Supabase: isolado aqui para reduzir o impacto se a API mudar.

const SDK_URL = 'https://esm.sh/@supabase/supabase-js@2';
let _clientPromise = null;

async function getPasskeyClient() {
  const cfg = (typeof window !== 'undefined' && window.HARMONIA_SUPABASE) || {};
  if (!cfg.url || !cfg.anonKey) throw new Error('Supabase não configurado.');
  if (!_clientPromise) {
    _clientPromise = import(SDK_URL).then(({ createClient }) =>
      createClient(cfg.url, cfg.anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          experimental: { passkey: true },
        },
      }));
  }
  return _clientPromise;
}

// O navegador/dispositivo suporta WebAuthn?
export function passkeySupported() {
  return typeof window !== 'undefined'
    && !!window.PublicKeyCredential
    && !!(navigator.credentials && navigator.credentials.create);
}

// Conditional UI (autofill) disponível? É o que permite a passkey aparecer no
// autofill do campo, sem botão e sem gesto — o navegador exige isto para o
// fluxo "abriu e a passkey aparece".
export async function conditionalMediationAvailable() {
  try {
    return passkeySupported()
      && typeof window.PublicKeyCredential.isConditionalMediationAvailable === 'function'
      && await window.PublicKeyCredential.isConditionalMediationAvailable();
  } catch (_) {
    return false;
  }
}

// Registra uma passkey para o usuário JÁ logado (associa ao usuário do Supabase
// Auth da sessão atual). Injeta a sessão atual no SDK antes da cerimônia.
export async function registerPasskeyForCurrentUser() {
  try {
    if (!passkeySupported()) return { ok: false, message: 'Este aparelho/navegador não suporta passkey.' };
    const stored = JSON.parse(localStorage.getItem('harmonia_auth_session') || 'null');
    if (!stored?.access_token || !stored?.refresh_token) {
      return { ok: false, message: 'Faça login primeiro para registrar a passkey.' };
    }
    const client = await getPasskeyClient();
    await client.auth.setSession({ access_token: stored.access_token, refresh_token: stored.refresh_token });
    const { data, error } = await client.auth.registerPasskey();
    if (error) return { ok: false, message: error.message || 'Falha ao registrar a passkey.' };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, message: e?.message || 'Erro ao registrar a passkey.' };
  }
}

// Login passwordless: a cerimônia de credencial descoberta deixa o usuário
// escolher a conta no próprio autenticador. Retorna a sessão (tokens) para o
// auth.service adotar.
export async function signInWithPasskey({ conditional = false } = {}) {
  try {
    if (!passkeySupported()) return { ok: false, message: 'Este aparelho/navegador não suporta passkey.' };
    const client = await getPasskeyClient();
    // mediation:'conditional' = autofill (espera o usuário tocar no campo).
    const opts = conditional ? { mediation: 'conditional' } : undefined;
    const { data, error } = await client.auth.signInWithPasskey(opts);
    if (error) return { ok: false, message: error.message || 'Falha ao entrar com passkey.' };
    const session = data?.session || data;
    if (!session?.access_token || !session?.user?.id) {
      return { ok: false, message: 'A passkey não retornou uma sessão válida.' };
    }
    return { ok: true, session };
  } catch (e) {
    return { ok: false, message: e?.message || 'Erro ao entrar com passkey.' };
  }
}
