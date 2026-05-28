import { createClient } from '@supabase/supabase-js';

// Supabase projenizin anahtarları
// URL adresini lütfen Supabase Dashboard'unuzdan alıp BURAYA YAPIŞTIRIN:
const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || 'https://LUTFEN_KENDI_URL_ADRESINIZI_GIRIN.supabase.co';

// Bize gönderdiğiniz Publishable Key:
const SUPABASE_ANON_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Rs7IntoRhi0Nl9VCr53xiQ_PDLQ-va6';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
