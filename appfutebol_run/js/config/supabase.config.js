// Supabase configuration for Harmonia FC DEV.
// Project URL must be the base URL only, without /rest/v1.
// Never use service_role keys in frontend code.
// DEV must point to the harmonia-dev Supabase project only.
// Production publishing must restore appfutebol_run/js/config/supabase.config.prod.backup.js.

export const SUPABASE_CONFIG = {
  enabled: true,
  url: 'https://fjnelycvneutmyzjrozs.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqbmVseWN2bmV1dG15empyb3pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDc3OTUsImV4cCI6MjA5MzQ4Mzc5NX0.cqg4EpCFVW4FWIytKrZIsmqi24_F1pKOQe7c8DJR0sc',
  stateTable: 'app_state',
  stateKey: 'default',
  environment: 'dev-supabase',
};
