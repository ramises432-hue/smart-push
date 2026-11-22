import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const method = searchParams.get('m') === 'nfc' ? 'nfc' : 'qr';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;

  const noCacheHeaders = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };

  try {
    const supabase = getSupabase();
    const { data: card, error } = await supabase
      .from('cards')
      .select('target_url, is_active')
      .eq('id', id)
      .single();

    if (error || !card || !card.is_active || !(card.target_url || '').trim()) {
      return NextResponse.redirect(`${baseUrl}/inactiva`, {
        status: 302,
        headers: noCacheHeaders,
      });
    }

    await supabase.from('scans').insert({
      card_id: id,
      method,
    });

    const destination = /^https?:\/\//i.test(card.target_url.trim())
      ? card.target_url.trim()
      : `https://${card.target_url.trim()}`;

    return NextResponse.redirect(destination, {
      status: 302,
      headers: noCacheHeaders,
    });
  } catch {
    return NextResponse.redirect(`${baseUrl}/inactiva`, {
      status: 302,
      headers: noCacheHeaders,
    });
  }
}

