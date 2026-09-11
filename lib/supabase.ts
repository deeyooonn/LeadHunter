import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Browser client (for client components)
export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey);

// Server client with elevated privileges (for API routes)
// Uses service role key when available, falls back to anon key
export const supabaseServer = createClient(
  supabaseUrl,
  supabaseServiceKey ?? supabaseAnonKey
);
