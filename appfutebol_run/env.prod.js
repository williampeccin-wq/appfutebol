// Harmonia FC PROD runtime configuration.
// Must be used only by production branch / Cloudflare Pages.
window.HARMONIA_SUPABASE = {
  enabled: true,
  url: 'https://kpgghcrmbkrwpvtegcjh.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZ2doY3JtYmtyd3B2dGVnY2poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTAyMTAsImV4cCI6MjA5Mjg4NjIxMH0.zTrATNNby4WJEFL4S1L8d7b6DuprZy5U9rx2H2-rHTs',
  stateTable: 'app_state',
  stateKey: 'default',
  environment: 'prod-supabase'
};
