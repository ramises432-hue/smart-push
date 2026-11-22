'use client';

import { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(null);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState('');

  const [newId, setNewId] = useState('');
  const [newClient, setNewClient] = useState('');
  const [creatingBatch, setCreatingBatch] = useState(false);

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const fetchCards = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/cards');
    if (res.status === 401) {
      setAuthenticated(false);
      setLoading(false);
      return;
    }
    const rawText = await res.text(); const data = rawText ? JSON.parse(rawText) : {}; if (!res.ok) { setAuthenticated(true); setLoading(false); showToast('Error: ' + (data.error || res.status)); return; }
    setCards(data.cards || []);
    setAuthenticated(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setPassword('');
      fetchCards();
    } else {
      setAuthError('Contraseña incorrecta');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    setAuthenticated(false);
  };

  const handleCreateBatch = async () => {
    setCreatingBatch(true);
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch', start: 1, end: 50 }),
      });
      if (res.ok) {
        showToast('Lote 001 al 050 generado correctamente');
        await fetchCards();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('Error: ' + (err.error || res.status));
      }
    } catch (e) {
      showToast('Error de red: Verifica que npm run dev este activo');
    } finally {
      setCreatingBatch(false);
    }
  };

  const handleCreateSingle = async (e) => {
    e.preventDefault();
    if (!newId.trim()) return;
    const res = await fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: newId, client_name: newClient }),
    });
    if (res.ok) {
      setNewId('');
      setNewClient('');
      showToast(`Tarjeta ${newId} creada`);
      fetchCards();
    } else {
      const err = await res.json();
      showToast(`Error: ${err.error}`);
    }
  };

  const updateLocalCard = (id, field, value) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const handleSaveCard = async (card) => {
    setSavingId(card.id);
    const res = await fetch('/api/cards', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: card.id,
        client_name: card.client_name,
        category: card.category,
        target_url: card.target_url,
        is_active: card.is_active,
      }),
    });
    setSavingId(null);
    if (res.ok) { showToast(`Tarjeta #${card.id} actualizada en vivo`); } else { const err = await res.json().catch(() => ({})); showToast('Error al guardar: ' + (err.error || res.status)); }
  };

  const handleDownloadSvg = async (id) => {
    const qrUrl = `${baseUrl}/c/${id}?m=qr`;
    const svgString = await QRCode.toString(qrUrl, {
      type: 'svg',
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `QR-SmartPush-${id}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`SVG descargado: QR-SmartPush-${id}.svg`);
  };

  const copyText = (text, label) => {
    navigator.clipboard.writeText(text);
    showToast(label);
  };

  if (authenticated === false) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-5 shadow-2xl"
        >
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              Smart Push Admin
            </span>
            <h1 className="text-2xl font-bold mt-1">Control de Tarjetas</h1>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              Contraseña de administrador
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-amber-500"
              required
            />
          </div>
          {authError && <p className="text-red-400 text-xs">{authError}</p>}
          <button
            type="submit"
            className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold py-2.5 rounded-lg text-sm transition"
          >
            Entrar al panel
          </button>
        </form>
      </main>
    );
  }

  const filteredCards = cards.filter(
    (c) =>
      c.id.toLowerCase().includes(search.toLowerCase()) ||
      c.client_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalMonth = cards.reduce((acc, c) => acc + c.stats.total, 0);
  const totalQr = cards.reduce((acc, c) => acc + c.stats.qr, 0);
  const totalNfc = cards.reduce((acc, c) => acc + c.stats.nfc, 0);
  const activeCount = cards.filter(
    (c) => c.is_active && (c.target_url || '').trim() !== ''
  ).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-16">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-500 text-zinc-950 font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-zinc-950 font-black flex items-center justify-center">
              SP
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none">Smart Push</h1>
              <p className="text-xs text-zinc-400 mt-1">
                Gestión dinámica QR + NFC
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCreateBatch}
              disabled={creatingBatch}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium px-3.5 py-2 rounded-lg border border-zinc-700 transition"
            >
              {creatingBatch ? 'Generando...' : '+ Generar Lote (001–050)'}
            </button>
            <button
              onClick={handleLogout}
              className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-2"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400">Tarjetas activas</p>
            <p className="text-2xl font-bold mt-1">
              {activeCount}{' '}
              <span className="text-sm font-normal text-zinc-500">
                / {cards.length}
              </span>
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400">Usos este mes (Total)</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">
              {totalMonth}
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400">Escaneos QR (Mes)</p>
            <p className="text-2xl font-bold mt-1">{totalQr}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400">Toques NFC (Mes)</p>
            <p className="text-2xl font-bold mt-1">{totalNfc}</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3 justify-between">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ID (ej. 001) o nombre de negocio..."
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm w-full md:w-96 focus:outline-none focus:border-amber-500"
          />

          <form onSubmit={handleCreateSingle} className="flex gap-2">
            <input
              type="text"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="ID (ej. 051)"
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm w-28 focus:outline-none focus:border-amber-500"
            />
            <input
              type="text"
              value={newClient}
              onChange={(e) => setNewClient(e.target.value)}
              placeholder="Nombre del negocio"
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm w-44 focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl transition"
            >
              + Crear
            </button>
          </form>
        </div>

        {loading ? (
          <p className="text-zinc-400 text-sm">Cargando inventario...</p>
        ) : filteredCards.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
            <p className="text-zinc-400 text-sm mb-4">
              Aún no tienes tarjetas registradas.
            </p>
            <button
              onClick={handleCreateBatch}
              className="bg-amber-500 text-zinc-950 font-semibold text-sm px-5 py-2.5 rounded-xl"
            >
              Crear primer lote (001 al 050)
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCards.map((card) => {
              const nfcLink = `${baseUrl}/c/${card.id}?m=nfc`;
              const whatsappReport = `¡Hola ${card.client_name}! Te comparto el resumen mensual de tu cartel Smart Push: este mes recibió ${card.stats.total} interacciones (${card.stats.qr} por código QR y ${card.stats.nfc} por toque NFC) directo hacia tu enlace.`;

              return (
                <div
                  key={card.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 md:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-sm font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2.5 py-0.5 rounded-md">
                        #{card.id}
                      </span>

                      <input
                        type="text"
                        value={card.client_name}
                        onChange={(e) =>
                          updateLocalCard(card.id, 'client_name', e.target.value)
                        }
                        className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1 text-sm font-medium focus:outline-none focus:border-amber-500"
                      />

                      <select
                        value={card.category}
                        onChange={(e) =>
                          updateLocalCard(card.id, 'category', e.target.value)
                        }
                        className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-300 focus:outline-none"
                      >
                        <option value="Reseñas Google">Reseñas Google</option>
                        <option value="Menú Digital">Menú Digital</option>
                        <option value="Instagram">Instagram</option>
                        <option value="WhatsApp">WhatsApp</option>
                      </select>

                      <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer ml-auto lg:ml-2">
                        <input
                          type="checkbox"
                          checked={card.is_active}
                          onChange={(e) =>
                            updateLocalCard(
                              card.id,
                              'is_active',
                              e.target.checked
                            )
                          }
                          className="accent-amber-500"
                        />
                        {card.is_active ? 'Activa' : 'Pausada'}
                      </label>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={card.target_url}
                        onChange={(e) =>
                          updateLocalCard(card.id, 'target_url', e.target.value)
                        }
                        placeholder="Pega aquí el link de Google Reviews, menú o red social..."
                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={() => handleSaveCard(card)}
                        disabled={savingId === card.id}
                        className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs px-4 py-2 rounded-lg transition shrink-0"
                      >
                        {savingId === card.id ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 border-t lg:border-t-0 border-zinc-800 pt-3 lg:pt-0">
                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-right">
                      <p className="text-xs text-zinc-400">
                        Este mes:{' '}
                        <span className="text-amber-400 font-bold text-sm">
                          {card.stats.total} usos
                        </span>
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {card.stats.qr} QR · {card.stats.nfc} NFC
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleDownloadSvg(card.id)}
                          className="bg-zinc-800 hover:bg-zinc-700 text-xs px-2.5 py-1.5 rounded-lg border border-zinc-700 transition"
                          title="Descargar QR vectorial para impresión"
                        >
                          QR (.svg)
                        </button>
                        <button
                          onClick={() =>
                            copyText(nfcLink, `URL NFC copiada: ${nfcLink}`)
                          }
                          className="bg-zinc-800 hover:bg-zinc-700 text-xs px-2.5 py-1.5 rounded-lg border border-zinc-700 transition"
                          title="Copiar enlace para grabar en chip NTAG213"
                        >
                          Link NFC
                        </button>
                      </div>
                      <button
                        onClick={() =>
                          copyText(
                            whatsappReport,
                            'Reporte mensual copiado para WhatsApp'
                          )
                        }
                        className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-[11px] font-medium px-2.5 py-1 rounded-lg transition"
                      >
                        Copiar reporte WhatsApp
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}




