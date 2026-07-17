// Convocados PROD runtime configuration (projeto Supabase convocados-prod).
// Servido pelo branch main via Cloudflare Pages → convocados.app.br.
// NÃO confundir com env.prod.js (Harmonia FC, branch production).
window.HARMONIA_SUPABASE = {
  enabled: true,
  url: 'https://nwsnakzttmvuyejbfzom.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53c25ha3p0dG12dXllamJmem9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNDMyNzEsImV4cCI6MjA5OTgxOTI3MX0.MUpCziTHw0kJ4RrKFzMZTA1RDhYMAr3oLGfo3Yi0j3o',
  stateTable: 'app_state',
  stateKey: 'default',
  environment: 'prod-supabase',
  votingEnabled: true,
  passkeyEnabled: false
};
