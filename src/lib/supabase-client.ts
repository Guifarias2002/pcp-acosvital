import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// null quando as env vars não estão configuradas — páginas degradam para polling
export const supabase = url && key
  ? createClient(url, key, { realtime: { params: { eventsPerSecond: 10 } } })
  : null;
