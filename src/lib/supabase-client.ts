import { createClient } from '@supabase/supabase-js';

// Remove BOM (﻿) that can appear when env vars are pasted from certain editors
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^﻿/, '');
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.replace(/^﻿/, '');

// null quando as env vars não estão configuradas — páginas degradam para polling
export const supabase = url && key
  ? createClient(url, key, { realtime: { params: { eventsPerSecond: 10 } } })
  : null;
