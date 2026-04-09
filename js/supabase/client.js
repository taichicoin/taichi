// js/supabase/client.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js'

const SUPABASE_URL = "https://sznjaotjoljaiawbvfro.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_iN3D88OfHeUre4ddCaDH7g_rlsQ8LGN";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefresh: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
