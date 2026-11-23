import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAuthorized, getEffectivePassword } from '@/lib/auth';

export async function PATCH(request) {
  try {
    if (!(await isAuthorized())) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const supabase = getSupabase();
    const body = await request.json();
    const updates = { updated_at: new Date().toISOString() };

    if (typeof body.whatsapp_template === 'string') {
      updates.whatsapp_template = body.whatsapp_template;
    }

    if (Array.isArray(body.categories)) {
      const cleaned = body.categories.map((c) => String(c || '').trim()).filter(Boolean);
      if (cleaned.length > 0) updates.categories = cleaned;
    }

    let updatedPassword = null;
    if (body.new_password && body.new_password.trim() !== '') {
      const currentEffective = await getEffectivePassword();
      if (body.current_password !== currentEffective) {
        return NextResponse.json({ error: 'La contraseña actual no es correcta' }, { status: 400 });
      }
      if (body.new_password.trim().length < 4) {
        return NextResponse.json({ error: 'Mínimo 4 caracteres' }, { status: 400 });
      }
      updatedPassword = body.new_password.trim();
      updates.admin_password = updatedPassword;
    }

    const { error } = await supabase
      .from('app_settings')
      .upsert({ id: 1, ...updates }, { onConflict: 'id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const response = NextResponse.json({ ok: true });
    if (updatedPassword) {
      response.cookies.set('sp_admin', updatedPassword, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
