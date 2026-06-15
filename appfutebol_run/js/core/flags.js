// Feature flags por ambiente (lidas do env.js / window.HARMONIA_SUPABASE).
// A votação (notas de desempenho + churrasco) fica LIGADA por padrão (DEV/local)
// e é desligada explicitamente no PROD via `votingEnabled: false` no env.js de
// produção, até a migração `ratings` estar aplicada e a feature liberada.

export function isVotingEnabled() {
  const cfg = (typeof window !== 'undefined' && window.HARMONIA_SUPABASE) || {};
  return cfg.votingEnabled !== false;
}
