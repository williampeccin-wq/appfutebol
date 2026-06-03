// Supabase configuration for Harmonia FC.
// Runtime env.js has priority via window.HARMONIA_SUPABASE.
// Fallback below is DEV to keep local development safe by default.
// Never use service_role keys in frontend code.

const FALLBACK_SUPABASE_CONFIG = {
  enabled: true,
  url: 'https://fjnelycvneutmyzjrozs.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqbmVseWN2bmV1dG15empyb3pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDc3OTUsImV4cCI6MjA5MzQ4Mzc5NX0.cqg4EpCFVW4FWIytKrZIsmqi24_F1pKOQe7c8DJR0sc',
  stateTable: 'app_state',
  stateKey: 'default',
  environment: 'dev-supabase'
};

const runtimeConfig = typeof window !== 'undefined' && window.HARMONIA_SUPABASE
  ? window.HARMONIA_SUPABASE
  : {};

export const SUPABASE_CONFIG = {
  ...FALLBACK_SUPABASE_CONFIG,
  ...runtimeConfig,
};
