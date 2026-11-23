import { cookies } from 'next/headers';
import { getSupabase } from '@/lib/supabase';

export async function getEffectivePassword() {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('app_settings')
      .select('admin_password')
      .eq('id', 1)
      .single();

    if (data?.admin_password && data.admin_password.trim() !== '') {
      return data.admin_password.trim();
    }
  } catch {}
  return process.env.ADMIN_PASSWORD;
}

export async function isAuthorized() {
  const cookieStore = await cookies();
  const token = cookieStore.get('sp_admin')?.value;
  const effective = await getEffectivePassword();
  return Boolean(token && effective && token === effective);
}
