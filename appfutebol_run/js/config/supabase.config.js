// Supabase configuration for Harmonia FC DEV.
// Project URL must be the base URL only, without /rest/v1.
// Keep anon key only. Never place service_role keys in frontend code.
export const SUPABASE_CONFIG = {
  enabled: true,
  url: 'https://fjnelycvneutmyzjrozs.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqbmVseWN2bmV1dG15empyb3pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDc3OTUsImV4cCI6MjA5MzQ4Mzc5NX0.cqg4EpCFVW4FWIytKrZIsmqi24_F1pKOQe7c8DJR0sc',
  stateTable: 'app_state',
  stateKey: 'default',
};

export const SUPABASE_URL = SUPABASE_CONFIG.url;
export const SUPABASE_KEY = SUPABASE_CONFIG.anonKey;
