import { SUPABASE_CONFIG } from '../config/supabase.config.js';

const PROD_SUPABASE_URLS = new Set([
  'https://kpgghcrmbkrwpvtegcjh.supabase.co', // Harmonia FC (branch production)
  'https://nwsnakzttmvuyejbfzom.supabase.co', // Convocados (branch main / convocados.app.br)
]);

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

export function getRuntimeSupabaseConfig() {
  const runtimeConfig = typeof window !== 'undefined' && window.HARMONIA_SUPABASE
    ? window.HARMONIA_SUPABASE
    : {};

  return {
    ...SUPABASE_CONFIG,
    ...runtimeConfig,
  };
}

export function isLocalRuntime() {
  if (typeof window === 'undefined') return false;
  const hostname = String(window.location?.hostname || '').toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function isProdSupabaseRuntime() {
  const config = getRuntimeSupabaseConfig();
  const environment = String(config.environment || '').toLowerCase();
  const url = trimTrailingSlash(config.url || '');

  return environment.includes('prod') || PROD_SUPABASE_URLS.has(url);
}

export function isLocalhostWithProdSupabase() {
  return isLocalRuntime() && isProdSupabaseRuntime();
}

export function assertCriticalOperationAllowed(operation = 'operação crítica') {
  if (!isLocalhostWithProdSupabase()) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: 'localhost_prod_supabase_write_blocked',
    operation,
    message: `Bloqueado por segurança: ${operation} não pode rodar em localhost conectado ao PROD. Use DEV ou publique a correção em production.`,
  };
}
