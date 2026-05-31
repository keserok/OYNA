import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  const tables = ['profiles', 'pitches', 'pitch_slots', 'matches', 'teams', 'notifications', 'settings', 'goalkeepers', 'referees'];
  for (const t of tables) {
    const { count, data, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`Table '${t}': Error: ${error.message}`);
    } else {
      console.log(`Table '${t}': ${count} rows`);
    }
  }
}

check();
