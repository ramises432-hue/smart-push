import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabase } from '@/lib/supabase';

async function isAuthorized() {
  const cookieStore = await cookies();
  const token = cookieStore.get('sp_admin')?.value;
  return Boolean(token && token === process.env.ADMIN_PASSWORD);
}

export async function GET() {
  try {
    if (!(await isAuthorized())) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const supabase = getSupabase();
    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .select('*')
      .order('id', { ascending: true });

    if (cardsError) {
      return NextResponse.json({ error: cardsError.message }, { status: 500 });
    }

    const now = new Date();
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    ).toISOString();

    const { data: monthScans } = await supabase
      .from('scans')
      .select('card_id, method')
      .gte('scanned_at', startOfMonth);

    const statsMap = {};
    for (const scan of monthScans || []) {
      if (!statsMap[scan.card_id]) {
        statsMap[scan.card_id] = { total: 0, qr: 0, nfc: 0 };
      }
      statsMap[scan.card_id].total += 1;
      if (scan.method === 'nfc') statsMap[scan.card_id].nfc += 1;
      else statsMap[scan.card_id].qr += 1;
    }

    const enriched = (cards || []).map((card) => ({
      ...card,
      stats: statsMap[card.id] || { total: 0, qr: 0, nfc: 0 },
    }));

    return NextResponse.json({ cards: enriched });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!(await isAuthorized())) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const supabase = getSupabase();
    const body = await request.json();

    if (body.action === 'batch') {
      const start = Math.max(1, Number(body.start) || 1);
      const end = Math.min(500, Number(body.end) || 50);
      const rows = [];

      for (let i = start; i <= end; i++) {
        rows.push({
          id: String(i).padStart(3, '0'),
          client_name: 'Disponible (Sin asignar)',
          category: 'Reseñas Google',
          target_url: '',
          is_active: true,
        });
      }

      const { error } = await supabase
        .from('cards')
        .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, count: rows.length });
    }

    const cleanId = String(body.id || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '');

    if (!cleanId) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const { error } = await supabase.from('cards').insert({
      id: cleanId,
      client_name: body.client_name?.trim() || 'Sin asignar',
      category: body.category || 'Reseñas Google',
      target_url: body.target_url?.trim() || '',
      is_active: true,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    if (!(await isAuthorized())) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const supabase = getSupabase();
    const { id, client_name, category, target_url, is_active } =
      await request.json();

    const { error } = await supabase
      .from('cards')
      .update({
        client_name,
        category,
        target_url,
        is_active,
      })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
