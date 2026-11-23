import { NextResponse } from 'next/server';
import { getEffectivePassword } from '@/lib/auth';

export async function POST(request) {
  const { password } = await request.json();
  const effectivePassword = await getEffectivePassword();

  if (!password || password !== effectivePassword) {
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('sp_admin', effectivePassword, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('sp_admin');
  return response;
}
