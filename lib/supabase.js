import { createClient } from '@supabase/supabase-js';

export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !url.startsWith('http') || url.includes('TU-PROYECTO')) {
    throw new Error('Falta configurar NEXT_PUBLIC_SUPABASE_URL en .env.local');
  }
  if (!key || key.includes('tu-llave')) {
    throw new Error('Falta configurar SUPABASE_SERVICE_ROLE_KEY en .env.local');
  }

  return createClient(url, key, {
    global: {
      fetch: (u, options = {}) => fetch(u, { ...options, cache: 'no-store' }),
    },
  });
}
