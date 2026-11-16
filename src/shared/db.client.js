import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before starting.');
}

/**
 * Single instance Supabase client using Service Role Key for backend administrative operations.
 */
export const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export default db;
