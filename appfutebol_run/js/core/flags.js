// Feature flags por ambiente (lidas do env.js / window.HARMONIA_SUPABASE).
// A votação (notas de desempenho + churrasco) fica LIGADA por padrão (DEV/local)
// e é desligada explicitamente no PROD via `votingEnabled: false` no env.js de
// produção, até a migração `ratings` estar aplicada e a feature liberada.

export function isVotingEnabled() {
  const cfg = (typeof window !== 'undefined' && window.HARMONIA_SUPABASE) || {};
  return cfg.votingEnabled !== false;
}

// Login por passkey (WebAuthn). DESLIGADO por padrão; só liga onde
// `passkeyEnabled: true` no env.js. Passkey é preso ao domínio (RP), então só
// funciona no PROD configurado — por isso fica off no DEV/local.
export function isPasskeyEnabled() {
  const cfg = (typeof window !== 'undefined' && window.HARMONIA_SUPABASE) || {};
  return cfg.passkeyEnabled === true;
}
