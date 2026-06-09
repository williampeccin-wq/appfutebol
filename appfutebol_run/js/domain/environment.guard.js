const PROD_ENVIRONMENT_NAMES = new Set([
  'prod',
  'production',
  'prod-supabase',
  'production-supabase',
]);

const DEV_ENVIRONMENT_NAMES = new Set([
  'dev',
  'development',
  'dev-supabase',
  'development-supabase',
]);

const PROD_SUPABASE_URLS = new Set([
  'https://kpgghcrmbkrwpvtegcjh.supabase.co',
]);

const LOCAL_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
]);

function normalizeUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

export function getRuntimeEnvironment() {
  const config =
    window.HARMONIA_SUPABASE ||
    window.HARMONIA_ENV ||
    window.__HARMONIA_ENV__ ||
    {};

  const environment = String(config.environment || config.name || '').trim();
  const supabaseUrl = normalizeUrl(config.supabaseUrl || config.url || '');
  const hostname = String(window.location.hostname || '').trim();

  const lowerEnvironment = environment.toLowerCase();

  return {
    environment,
    supabaseUrl,
    hostname,
    isLocalhost: LOCAL_HOSTNAMES.has(hostname),
    isDevEnvironment: DEV_ENVIRONMENT_NAMES.has(lowerEnvironment),
    isProdEnvironment:
      PROD_ENVIRONMENT_NAMES.has(lowerEnvironment) ||
      PROD_SUPABASE_URLS.has(supabaseUrl),
  };
}

export function isLocalhostConnectedToProd() {
  const runtime = getRuntimeEnvironment();
  return runtime.isLocalhost && runtime.isProdEnvironment;
}

export function isLocalhostAllowedDev() {
  const runtime = getRuntimeEnvironment();
  return runtime.isLocalhost && runtime.isDevEnvironment && !runtime.isProdEnvironment;
}

export function renderFatalEnvironmentBlock(reason = 'localhost_prod') {
  const runtime = getRuntimeEnvironment();
  const title = reason === 'localhost_not_dev'
    ? 'Localhost sem ambiente DEV'
    : 'Localhost conectado ao PROD';

  const description = reason === 'localhost_not_dev'
    ? 'Este app só pode inicializar localmente usando Supabase DEV.'
    : 'Este app não pode inicializar localmente usando o banco de produção.';

  document.body.innerHTML = `
    <main class="fatal-env-block">
      <section class="fatal-env-card">
        <div class="fatal-env-kicker">Ambiente bloqueado</div>
        <h1>${title}</h1>
        <p>
          ${description}
          Isso evita alterações acidentais em jogadores, acessos, presença e configurações reais.
        </p>
        <dl>
          <div>
            <dt>Host</dt>
            <dd>${escapeHtml(runtime.hostname || '-')}</dd>
          </div>
          <div>
            <dt>Ambiente</dt>
            <dd>${escapeHtml(runtime.environment || '-')}</dd>
          </div>
          <div>
            <dt>Supabase</dt>
            <dd>${escapeHtml(runtime.supabaseUrl || '-')}</dd>
          </div>
        </dl>
        <p class="fatal-env-action">
          Corrija o arquivo env.js para usar env.dev.js em localhost.
        </p>
      </section>
    </main>
  `;
}

export function assertRuntimeEnvironmentAllowed() {
  const runtime = getRuntimeEnvironment();

  if (!runtime.isLocalhost) return true;

  if (runtime.isProdEnvironment) {
    renderFatalEnvironmentBlock('localhost_prod');
    throw new Error('blocked_localhost_prod_environment');
  }

  if (!runtime.isDevEnvironment) {
    renderFatalEnvironmentBlock('localhost_not_dev');
    throw new Error('blocked_localhost_non_dev_environment');
  }

  return true;
}

export function assertCriticalWriteAllowed(operationName = 'critical-write') {
  return assertRuntimeEnvironmentAllowed();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
