// ESLint no CI — UMA regra só: `no-undef`.
//
// Por que existe: em 24/08/2026 três chamadas de telemetria referenciavam uma
// variável (`currentPlayer`) que não existia naquele escopo. ReferenceError em
// produção, no celular do testador: o passo do roteiro não era gravado, o aviso
// de sucesso era engolido e a exclusão de jogador mostrava tarja vermelha com
// "currentPlayer is not defined" — com a exclusão já feita.
//
// A suíte não pega esta classe: os testes carregam services/domain, nunca o
// app.js, e o `node --check` do CI valida SINTAXE, não escopo. Esta é a peça
// que faltava. Deliberadamente sem estilo, sem formatação, sem opinião — só
// "essa variável existe?".
//
// Roda por npx, sem package.json e sem node_modules no repo, para manter o CI
// no espírito do resto: sem build, sem instalação versionada.
//   npx --yes eslint@9

// Globais de navegador usados pelo app. Lista explícita em vez do pacote
// `globals`: uma dependência a menos e fica visível o que o app de fato usa.
const navegador = [
  'window', 'document', 'navigator', 'location', 'history', 'screen', 'self',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches',
  'console', 'alert', 'confirm', 'prompt',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
  'fetch', 'Request', 'Response', 'Headers', 'FormData', 'AbortController',
  'XMLHttpRequest', 'WebSocket', 'EventSource',
  'Blob', 'File', 'FileReader', 'URL', 'URLSearchParams', 'DOMParser',
  'Image', 'Audio', 'Notification', 'PushManager', 'ServiceWorkerGlobalScope',
  'CustomEvent', 'Event', 'EventTarget', 'MessageChannel', 'BroadcastChannel',
  'HTMLElement', 'HTMLCanvasElement', 'HTMLImageElement', 'Node', 'NodeList',
  'IntersectionObserver', 'MutationObserver', 'ResizeObserver',
  'crypto', 'atob', 'btoa', 'TextEncoder', 'TextDecoder', 'structuredClone',
  'performance', 'matchMedia', 'getComputedStyle', 'scrollTo',
  'PublicKeyCredential', 'AuthenticatorAssertionResponse', 'clients',
  'importScripts', 'skipWaiting', 'registration', 'caches',
];

const globals = Object.fromEntries(navegador.map((nome) => [nome, 'readonly']));

export default [
  {
    // Cópias de trabalho de agentes dentro do repo não são código do app.
    ignores: ['.claude/**', 'appfutebol_run_backup_*/**'],
  },
  {
    files: ['appfutebol_run/js/**/*.js'],
    // Não é lint de estilo: diretiva `eslint-disable` sobrando não é problema.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals,
    },
    rules: {
      'no-undef': 'error',
    },
  },
];
