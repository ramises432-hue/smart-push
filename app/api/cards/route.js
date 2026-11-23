import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAuthorized } from '@/lib/auth';

const DEFAULT_TEMPLATE =
  '¡Hola {cliente}! Te comparto el resumen mensual de tu cartel Smart Push (#{id}): este mes recibió {total} interacciones ({qr} por código QR y {nfc} por toque NFC) directo hacia tu enlace.';

const DEFAULT_CATEGORIES = [
  'Reseñas Google',
  'Menú Digital',
  'Instagram',
  'WhatsApp',
  'Pagos / Transferencia',
];

export async function GET() {
  try {
    if (!(await isAuthorized())) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const supabase = getSupabase();
    const [cardsRes, foldersRes, settingsRes] = await Promise.all([
      supabase.from('cards').select('*').order('id', { ascending: true }),
      supabase.from('folders').select('*').order('created_at', { ascending: true }),
      supabase.from('app_settings').select('whatsapp_template, categories').eq('id', 1).single(),
    ]);

    if (cardsRes.error) {
      return NextResponse.json({ error: cardsRes.error.message }, { status: 500 });
    }

    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const startOfWeekDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday)
    );
    const startOfMonthDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    const startOfYearDate = new Date(
      Date.UTC(now.getUTCFullYear(), 0, 1)
    );

    const earliestDate = new Date(
      Math.min(
        startOfWeekDate.getTime(),
        startOfMonthDate.getTime(),
        startOfYearDate.getTime()
      )
    );

    const { data: periodScans } = await supabase
      .from('scans')
      .select('card_id, method, scanned_at')
      .gte('scanned_at', earliestDate.toISOString());

    const statsMap = {};
    const globalStats = {
      week: { total: 0, qr: 0, nfc: 0 },
      month: { total: 0, qr: 0, nfc: 0 },
      year: { total: 0, qr: 0, nfc: 0 },
    };

    for (const scan of periodScans || []) {
      const scanTime = new Date(scan.scanned_at).getTime();
      const isNfc = scan.method === 'nfc';

      if (scanTime >= startOfWeekDate.getTime()) {
        globalStats.week.total += 1;
        if (isNfc) globalStats.week.nfc += 1;
        else globalStats.week.qr += 1;
      }

      if (scanTime >= startOfMonthDate.getTime()) {
        globalStats.month.total += 1;
        if (isNfc) globalStats.month.nfc += 1;
        else globalStats.month.qr += 1;

        if (!statsMap[scan.card_id]) {
          statsMap[scan.card_id] = { total: 0, qr: 0, nfc: 0 };
        }
        statsMap[scan.card_id].total += 1;
        if (isNfc) statsMap[scan.card_id].nfc += 1;
        else statsMap[scan.card_id].qr += 1;
      }

      if (scanTime >= startOfYearDate.getTime()) {
        globalStats.year.total += 1;
        if (isNfc) globalStats.year.nfc += 1;
        else globalStats.year.qr += 1;
      }
    }

    const enrichedCards = (cardsRes.data || []).map((card) => ({
      ...card,
      stats: statsMap[card.id] || { total: 0, qr: 0, nfc: 0 },
    }));

    return NextResponse.json({
      cards: enrichedCards,
      folders: foldersRes.data || [],
      globalStats,
      settings: {
        whatsapp_template: settingsRes.data?.whatsapp_template || DEFAULT_TEMPLATE,
        categories: Array.isArray(settingsRes.data?.categories)
          ? settingsRes.data.categories
          : DEFAULT_CATEGORIES,
      },
    });
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
    const defaultCat = body.category || 'Reseñas Google';

    if (body.action === 'batch') {
      const quantity = Math.min(500, Math.max(1, Number(body.quantity) || 10));
      const batchName = String(body.batch_name || '').trim();

      const { data: existing } = await supabase.from('cards').select('id');
      let maxNum = 0;
      for (const item of existing || []) {
        const n = parseInt(item.id, 10);
        if (!Number.isNaN(n) && n > maxNum) maxNum = n;
      }

      const startNum = body.custom_start ? Math.max(1, Number(body.custom_start)) : maxNum + 1;
      const endNum = startNum + quantity - 1;

      let targetFolderId = body.folder_id || null;
      if (batchName) {
        const { data: newFolder, error: folderErr } = await supabase
          .from('folders')
          .insert({
            name: batchName,
            description: `${quantity} tarjetas (#${String(startNum).padStart(3, '0')} – #${String(endNum).padStart(3, '0')})`,
          })
          .select()
          .single();

        if (folderErr) {
          return NextResponse.json({ error: folderErr.message }, { status: 500 });
        }
        targetFolderId = newFolder.id;
      }

      const rows = [];
      for (let i = startNum; i <= endNum; i++) {
        rows.push({
          id: String(i).padStart(3, '0'),
          client_name: batchName || 'Disponible (Sin asignar)',
          category: defaultCat,
          target_url: '',
          is_active: true,
          folder_id: targetFolderId,
        });
      }

      const { error } = await supabase
        .from('cards')
        .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, start: startNum, end: endNum });
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
      category: defaultCat,
      target_url: body.target_url?.trim() || '',
      is_active: true,
      folder_id: body.folder_id || null,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
    const body = await request.json();

    if (body.action === 'set_counts') {
      const cardId = String(body.card_id || '');
      const targetQr = Math.max(0, Math.min(5000, Number(body.qr) || 0));
      const targetNfc = Math.max(0, Math.min(5000, Number(body.nfc) || 0));

      const now = new Date();
      const startOfMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
      ).toISOString();

      await supabase
        .from('scans')
        .delete()
        .eq('card_id', cardId)
        .gte('scanned_at', startOfMonth);

      const newRows = [];
      for (let i = 0; i < targetQr; i++) {
        newRows.push({ card_id: cardId, method: 'qr' });
      }
      for (let i = 0; i < targetNfc; i++) {
        newRows.push({ card_id: cardId, method: 'nfc' });
      }

      if (newRows.length > 0) {
        const { error } = await supabase.from('scans').insert(newRows);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    const { id } = body;
    const updates = {};
    if ('client_name' in body) updates.client_name = body.client_name;
    if ('category' in body) updates.category = body.category;
    if ('target_url' in body) updates.target_url = body.target_url;
    if ('is_active' in body) updates.is_active = body.is_active;
    if ('folder_id' in body) updates.folder_id = body.folder_id || null;

    const { error } = await supabase.from('cards').update(updates).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
