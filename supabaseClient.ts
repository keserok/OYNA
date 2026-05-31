import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase env variables are missing! Check your .env file.');
}

export const supabase = createClient(
  SUPABASE_URL || 'https://LUTFEN_KENDI_URL_ADRESINIZI_GIRIN.supabase.co',
  SUPABASE_ANON_KEY || 'dummy_key',
  {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
