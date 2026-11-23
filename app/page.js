'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import QRCode from 'qrcode';

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(null);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [cards, setCards] = useState([]);
  const [folders, setFolders] = useState([]);
  const [globalStats, setGlobalStats] = useState({
    week: { total: 0, qr: 0, nfc: 0 },
    month: { total: 0, qr: 0, nfc: 0 },
    year: { total: 0, qr: 0, nfc: 0 },
  });
  const [metricPeriod, setMetricPeriod] = useState('month');

  const [settings, setSettings] = useState({
    whatsapp_template:
      '¡Hola {cliente}! Te comparto el resumen mensual de tu cartel Smart Push (#{id}): este mes recibió {total} interacciones ({qr} por código QR y {nfc} por toque NFC) directo hacia tu enlace.',
    categories: ['Reseñas Google', 'Menú Digital', 'Instagram', 'WhatsApp'],
  });

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState('');

  const [activeView, setActiveView] = useState('HOME');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [sortBy, setSortBy] = useState('id_asc');

  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingFolderName, setEditingFolderName] = useState('');

  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchQuantity, setBatchQuantity] = useState(10);
  const [batchName, setBatchName] = useState('');
  const [creatingBatch, setCreatingBatch] = useState(false);

  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [editingCountsCard, setEditingCountsCard] = useState(null);
  const [editQrValue, setEditQrValue] = useState(0);
  const [editNfcValue, setEditNfcValue] = useState(0);
  const [savingCounts, setSavingCounts] = useState(false);

  const [newId, setNewId] = useState('');
  const [newClient, setNewClient] = useState('');

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState('');
  const [editCategories, setEditCategories] = useState([]);
  const [newCatInput, setNewCatInput] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/cards');
    if (res.status === 401) {
      setAuthenticated(false);
      setLoading(false);
      return;
    }
    const rawText = await res.text();
    const data = rawText ? JSON.parse(rawText) : {};
    if (!res.ok) {
      setAuthenticated(true);
      setLoading(false);
      showToast('Error: ' + (data.error || res.status));
      return;
    }
    setCards(data.cards || []);
    setFolders(data.folders || []);
    if (data.globalStats) setGlobalStats(data.globalStats);
    if (data.settings) setSettings(data.settings);
    setAuthenticated(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

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
      fetchDashboard();
    } else {
      setAuthError('Contraseña incorrecta');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    setAuthenticated(false);
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName }),
    });
    const data = await res.json();
    if (res.ok) {
      setNewFolderName('');
      setShowNewFolderModal(false);
      showToast(`Carpeta "${data.folder.name}" creada`);
      fetchDashboard();
    } else {
      showToast(`Error: ${data.error}`);
    }
  };

  const handleRenameFolder = async (folderId) => {
    const clean = editingFolderName.trim();
    setEditingFolderId(null);
    if (!clean) return;
    const res = await fetch('/api/folders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: folderId, name: clean }),
    });
    if (res.ok) {
      setFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, name: clean } : f))
      );
      showToast('Nombre de carpeta actualizado');
    }
  };

  const handleToggleFolderActive = async (folder, nextActiveState) => {
    const res = await fetch('/api/folders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'toggle_all',
        folder_id: folder.id,
        is_active: nextActiveState,
      }),
    });
    if (res.ok) {
      setCards((prev) =>
        prev.map((c) =>
          c.folder_id === folder.id ? { ...c, is_active: nextActiveState } : c
        )
      );
      showToast(
        nextActiveState
          ? `Lote "${folder.name}" ACTIVADO`
          : `Lote "${folder.name}" DESACTIVADO`
      );
    }
  };

  const handleDeleteFolder = async (folder) => {
    if (
      !window.confirm(
        `¿Eliminar la carpeta "${folder.name}"? Tus fichas no se borran, quedarán en "Todas las Fichas".`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/folders?id=${folder.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      if (activeView === folder.id) setActiveView('HOME');
      showToast(`Carpeta "${folder.name}" eliminada`);
      fetchDashboard();
    }
  };

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    setCreatingBatch(true);
    const res = await fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'batch',
        quantity: batchQuantity,
        batch_name: batchName,
        category: settings.categories[0] || 'Reseñas Google',
      }),
    });
    const data = await res.json();
    setCreatingBatch(false);
    if (res.ok) {
      setShowBatchModal(false);
      setBatchName('');
      showToast(
        `Lote creado (#${String(data.start).padStart(3, '0')} – #${String(
          data.end
        ).padStart(3, '0')})`
      );
      fetchDashboard();
    } else {
      showToast(`Error: ${data.error}`);
    }
  };

  const handleCreateSingle = async (e) => {
    e.preventDefault();
    if (!newId.trim()) return;
    const targetFolder =
      activeView !== 'HOME' && activeView !== 'ALL' ? activeView : null;

    const res = await fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newId,
        client_name: newClient,
        folder_id: targetFolder,
        category: settings.categories[0] || 'Reseñas Google',
      }),
    });
    if (res.ok) {
      setNewId('');
      setNewClient('');
      showToast(`Ficha #${newId} creada`);
      fetchDashboard();
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

  const handleAssignOrRemoveFolder = async (cardId, nextFolderId) => {
    const normalized = nextFolderId || null;
    updateLocalCard(cardId, 'folder_id', normalized);
    const res = await fetch('/api/cards', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cardId, folder_id: normalized }),
    });
    if (res.ok) {
      if (!normalized) {
        showToast(`Ficha #${cardId} eliminada de la carpeta`);
      } else {
        const fname = folders.find((f) => f.id === normalized)?.name || 'carpeta';
        showToast(`Ficha #${cardId} agregada a "${fname}"`);
      }
    }
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
        folder_id: card.folder_id || null,
      }),
    });
    setSavingId(null);
    if (res.ok) {
      showToast(`Ficha #${card.id} guardada`);
    }
  };

  const openEditCounts = (card) => {
    setEditingCountsCard(card);
    setEditQrValue(card.stats?.qr || 0);
    setEditNfcValue(card.stats?.nfc || 0);
  };

  const handleSaveCounts = async (e) => {
    e.preventDefault();
    if (!editingCountsCard) return;
    setSavingCounts(true);
    const res = await fetch('/api/cards', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_counts',
        card_id: editingCountsCard.id,
        qr: Number(editQrValue),
        nfc: Number(editNfcValue),
      }),
    });
    setSavingCounts(false);
    if (res.ok) {
      setEditingCountsCard(null);
      showToast(`Conteos de #${editingCountsCard.id} actualizados`);
      fetchDashboard();
    }
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

  const openSettingsModal = () => {
    setEditTemplate(settings.whatsapp_template);
    setEditCategories([...settings.categories]);
    setNewCatInput('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      showToast('Las contraseñas nuevas no coinciden');
      return;
    }
    setSavingSettings(true);
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        whatsapp_template: editTemplate,
        categories: editCategories,
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
    const data = await res.json();
    setSavingSettings(false);

    if (!res.ok) {
      showToast(`Error: ${data.error}`);
      return;
    }

    setSettings({
      whatsapp_template: editTemplate,
      categories: editCategories,
    });
    setShowSettingsModal(false);
    showToast('Configuración guardada');
  };

  const formatWhatsappReport = (card) =>
    (settings.whatsapp_template || '')
      .replace(/\{cliente\}/gi, card.client_name || '')
      .replace(/\{id\}/gi, card.id || '')
      .replace(/\{categoria\}/gi, card.category || '')
      .replace(/\{total\}/gi, String(card.stats?.total ?? 0))
      .replace(/\{qr\}/gi, String(card.stats?.qr ?? 0))
      .replace(/\{nfc\}/gi, String(card.stats?.nfc ?? 0));

  const isSearchingFromHome = activeView === 'HOME' && search.trim() !== '';

  const visibleCards = useMemo(() => {
    const q = search.trim().toLowerCase();

    const filtered = cards.filter((c) => {
      if (!isSearchingFromHome && activeView !== 'ALL' && activeView !== 'HOME') {
        if (c.folder_id !== activeView) return false;
      }
      if (filterCategory !== 'ALL' && c.category !== filterCategory) {
        return false;
      }
      if (q) {
        const matchId = c.id.toLowerCase().includes(q);
        const matchClient = (c.client_name || '').toLowerCase().includes(q);
        const matchUrl = (c.target_url || '').toLowerCase().includes(q);
        if (!matchId && !matchClient && !matchUrl) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'id_desc':
          return b.id.localeCompare(a.id, undefined, { numeric: true });
        case 'date_desc':
          return new Date(b.created_at) - new Date(a.created_at);
        case 'date_asc':
          return new Date(a.created_at) - new Date(b.created_at);
        case 'client_asc':
          return (a.client_name || '').localeCompare(b.client_name || '');
        case 'category_asc':
          return (a.category || '').localeCompare(b.category || '');
        case 'usage_desc':
          return (b.stats?.total || 0) - (a.stats?.total || 0);
        case 'id_asc':
        default:
          return a.id.localeCompare(b.id, undefined, { numeric: true });
      }
    });
  }, [cards, activeView, isSearchingFromHome, filterCategory, search, sortBy]);

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

  const activeCount = cards.filter(
    (c) => c.is_active && c.target_url.trim() !== ''
  ).length;
  const inactiveCount = cards.length - activeCount;

  const currentMetrics = globalStats[metricPeriod] || globalStats.month;
  const periodLabel =
    metricPeriod === 'week'
      ? 'esta semana'
      : metricPeriod === 'year'
      ? 'este año'
      : 'este mes';

  const currentFolderObj = folders.find((f) => f.id === activeView);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-20">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-500 text-zinc-950 font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* BARRA SUPERIOR */}
      <header className="border-b border-zinc-800 bg-zinc-900/70 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => {
              setActiveView('HOME');
              setSearch('');
            }}
            className="flex items-center gap-3 text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-zinc-950 font-black flex items-center justify-center">
              SP
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none">Smart Push</h1>
              <p className="text-xs text-zinc-400 mt-1">
                Gestión dinámica QR + NFC
              </p>
            </div>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              onClick={openSettingsModal}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium px-3.5 py-2 rounded-lg border border-zinc-700 transition"
            >
              ⚙ Configuración
            </button>
            <button
              onClick={() => setShowBatchModal(true)}
              className="bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold px-3.5 py-2 rounded-lg transition"
            >
              + Generar Lote
            </button>
            <button
              onClick={handleLogout}
              className="text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-2"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
        {/* MÉTRICAS GLOBALES */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-end gap-2">
            <span className="text-[11px] text-zinc-400">
              Periodo de interacciones:
            </span>
            <div className="inline-flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
              {[
                { id: 'week', label: 'Semana' },
                { id: 'month', label: 'Mes' },
                { id: 'year', label: 'Año' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setMetricPeriod(item.id)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-md transition ${
                    metricPeriod === item.id
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-400">Tarjetas activas</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-2xl font-bold text-emerald-400">
                  {activeCount}
                </p>
                <span className="text-xs text-zinc-500">
                  / {cards.length} total
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                No activadas:{' '}
                <span className="text-amber-400 font-semibold">
                  {inactiveCount}
                </span>
              </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-400">
                Usos {periodLabel} (Total)
              </p>
              <p className="text-2xl font-bold text-amber-400 mt-1">
                {currentMetrics.total}
              </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start justify-between">
              <div>
                <p className="text-xs text-zinc-400">
                  Escaneos QR ({periodLabel})
                </p>
                <p className="text-2xl font-bold mt-1">{currentMetrics.qr}</p>
              </div>
              <button
                onClick={() => {
                  if (cards[0]) openEditCounts(cards[0]);
                }}
                title="Modificar conteos de escaneos QR"
                className="text-[11px] text-zinc-400 hover:text-amber-400 bg-zinc-950 border border-zinc-800 px-2 py-1 rounded-md transition"
              >
                ✏️
              </button>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start justify-between">
              <div>
                <p className="text-xs text-zinc-400">
                  Toques NFC ({periodLabel})
                </p>
                <p className="text-2xl font-bold mt-1">{currentMetrics.nfc}</p>
              </div>
              <button
                onClick={() => {
                  if (cards[0]) openEditCounts(cards[0]);
                }}
                title="Modificar conteos de toques NFC"
                className="text-[11px] text-zinc-400 hover:text-amber-400 bg-zinc-950 border border-zinc-800 px-2 py-1 rounded-md transition"
              >
                ✏️
              </button>
            </div>
          </div>
        </section>

        {/* BARRA DE BÚSQUEDA PERMANENTE */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Barra de búsqueda: escribe #ID, nombre de local o URL..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 shadow-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-4 top-3 text-xs text-zinc-400 hover:text-zinc-200"
            >
              Limpiar ✕
            </button>
          )}
        </div>

        {/* VISTA PORTADA: CUADRÍCULA DE CARPETAS */}
        {activeView === 'HOME' && !isSearchingFromHome ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Carpetas y Lotes
              </h2>
              <span className="text-xs text-zinc-500">
                Presiona una carpeta para ver y administrar sus fichas
              </span>
            </div>

            {loading ? (
              <p className="text-zinc-400 text-sm">Cargando carpetas...</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <button
                  onClick={() => setActiveView('ALL')}
                  className="bg-zinc-900 hover:bg-zinc-900/80 border border-zinc-800 hover:border-amber-500/60 rounded-2xl p-5 text-left transition flex flex-col justify-between min-h-[155px] group"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-2xl">🗂️</span>
                    <span className="text-xs font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                      {cards.length} fichas
                    </span>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-base font-bold group-hover:text-amber-400 transition">
                      Todas las Fichas
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      Ver inventario completo, asignar o quitar de carpetas
                    </p>
                  </div>
                </button>

                {folders.map((folder) => {
                  const folderCards = cards.filter(
                    (c) => c.folder_id === folder.id
                  );
                  const activeInFolder = folderCards.filter(
                    (c) => c.is_active
                  ).length;
                  const hasAnyActive = activeInFolder > 0;
                  const isEditingThis = editingFolderId === folder.id;

                  return (
                    <div
                      key={folder.id}
                      onClick={() => {
                        if (!isEditingThis) setActiveView(folder.id);
                      }}
                      className="cursor-pointer bg-zinc-900 hover:bg-zinc-900/80 border border-zinc-800 hover:border-amber-500/60 rounded-2xl p-5 transition flex flex-col justify-between min-h-[155px]"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-2xl">📁</span>
                          <span className="text-xs font-mono bg-zinc-800 text-zinc-200 px-2.5 py-0.5 rounded-full">
                            No. de fichas: {folderCards.length}
                          </span>
                        </div>

                        <div
                          className="mt-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isEditingThis ? (
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                autoFocus
                                value={editingFolderName}
                                onChange={(e) =>
                                  setEditingFolderName(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter')
                                    handleRenameFolder(folder.id);
                                  if (e.key === 'Escape')
                                    setEditingFolderId(null);
                                }}
                                className="flex-1 bg-zinc-950 border border-amber-500 rounded-lg px-2.5 py-1 text-sm font-bold focus:outline-none"
                              />
                              <button
                                onClick={() => handleRenameFolder(folder.id)}
                                className="bg-amber-500 text-zinc-950 text-xs font-semibold px-2.5 rounded-lg"
                              >
                                OK
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <h3
                                onClick={() => setActiveView(folder.id)}
                                className="text-base font-bold hover:text-amber-400 transition truncate"
                              >
                                {folder.name}
                              </h3>
                              <button
                                onClick={() => {
                                  setEditingFolderId(folder.id);
                                  setEditingFolderName(folder.name);
                                }}
                                title="Modificar nombre de la carpeta"
                                className="text-xs text-zinc-500 hover:text-amber-400 px-1"
                              >
                                ✏️
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div
                        className="flex items-center justify-between pt-3 mt-3 border-t border-zinc-800/80"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() =>
                            handleToggleFolderActive(folder, !hasAnyActive)
                          }
                          disabled={folderCards.length === 0}
                          className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition ${
                            folderCards.length === 0
                              ? 'border-zinc-800 text-zinc-600 cursor-not-allowed'
                              : hasAnyActive
                              ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30'
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          {hasAnyActive
                            ? `Desactivar lote (${activeInFolder}/${folderCards.length})`
                            : 'Activar lote'}
                        </button>

                        <button
                          onClick={() => handleDeleteFolder(folder)}
                          className="text-[11px] text-zinc-500 hover:text-red-400 px-1.5 py-1"
                        >
                          Borrar carpeta
                        </button>
                      </div>
                    </div>
                  );
                })}

                <button
                  onClick={() => setShowNewFolderModal(true)}
                  className="bg-zinc-900/40 hover:bg-zinc-900 border-2 border-dashed border-zinc-800 hover:border-amber-500/60 rounded-2xl p-5 transition flex flex-col items-center justify-center min-h-[155px] text-zinc-400 hover:text-amber-400 gap-2"
                >
                  <span className="w-11 h-11 rounded-full bg-zinc-800 flex items-center justify-center text-2xl font-light">
                    +
                  </span>
                  <span className="text-xs font-semibold">Agregar Carpeta</span>
                </button>
              </div>
            )}
          </section>
        ) : (
          /* VISTA INTERNA DE FICHAS */
          <section className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setActiveView('HOME');
                    setSearch('');
                  }}
                  className="bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold px-3 py-2 rounded-xl border border-zinc-700 transition"
                >
                  ← Carpetas
                </button>
                <h2 className="font-bold text-base">
                  {isSearchingFromHome
                    ? `Resultados de búsqueda (${visibleCards.length})`
                    : activeView === 'ALL'
                    ? `Todas las Fichas (${visibleCards.length})`
                    : `📁 ${currentFolderObj?.name || 'Carpeta'} (${
                        visibleCards.length
                      })`}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="ALL">Tipo: Todos</option>
                  {settings.categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-amber-400 font-medium focus:outline-none focus:border-amber-500"
                >
                  <option value="id_asc">Orden: # Número (001→999)</option>
                  <option value="id_desc">Orden: # Número (999→001)</option>
                  <option value="date_desc">Fecha/Hora: Más recientes</option>
                  <option value="date_asc">Fecha/Hora: Más antiguas</option>
                  <option value="client_asc">Local (A → Z)</option>
                  <option value="category_asc">Tipo de tarjeta</option>
                  <option value="usage_desc">Más usos (Mes)</option>
                </select>
              </div>
            </div>

            <form
              onSubmit={handleCreateSingle}
              className="flex flex-wrap items-center justify-end gap-2"
            >
              <input
                type="text"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="ID (ej. 051)"
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs w-28 focus:outline-none focus:border-amber-500"
              />
              <input
                type="text"
                value={newClient}
                onChange={(e) => setNewClient(e.target.value)}
                placeholder="Nombre del negocio"
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs w-44 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs px-3.5 py-2 rounded-xl transition"
              >
                + Crear
              </button>
            </form>

            {visibleCards.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
                <p className="text-zinc-400 text-sm">
                  No hay fichas en esta vista todavía.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleCards.map((card) => {
                  const nfcLink = `${baseUrl}/c/${card.id}?m=nfc`;
                  const whatsappReport = formatWhatsappReport(card);

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
                              updateLocalCard(
                                card.id,
                                'client_name',
                                e.target.value
                              )
                            }
                            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1 text-sm font-medium focus:outline-none focus:border-amber-500"
                          />

                          <select
                            value={card.category}
                            onChange={(e) =>
                              updateLocalCard(
                                card.id,
                                'category',
                                e.target.value
                              )
                            }
                            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-300 focus:outline-none"
                          >
                            {!settings.categories.includes(card.category) && (
                              <option value={card.category}>
                                {card.category}
                              </option>
                            )}
                            {settings.categories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
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
                              updateLocalCard(
                                card.id,
                                'target_url',
                                e.target.value
                              )
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

                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <select
                            value={card.folder_id || ''}
                            onChange={(e) =>
                              handleAssignOrRemoveFolder(
                                card.id,
                                e.target.value
                              )
                            }
                            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-[11px] text-amber-300 focus:outline-none focus:border-amber-500"
                          >
                            <option value="">+ Agregar a una carpeta...</option>
                            {folders.map((f) => (
                              <option key={f.id} value={f.id}>
                                📁 {f.name}
                              </option>
                            ))}
                          </select>

                          {card.folder_id && (
                            <button
                              onClick={() =>
                                handleAssignOrRemoveFolder(card.id, null)
                              }
                              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-[11px] px-2.5 py-1 rounded-lg transition"
                            >
                              Eliminar de la carpeta
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 border-t lg:border-t-0 border-zinc-800 pt-3 lg:pt-0">
                        <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <p className="text-xs text-zinc-400">
                              Este mes:{' '}
                              <span className="text-amber-400 font-bold text-sm">
                                {card.stats.total} usos
                              </span>
                            </p>
                            <button
                              onClick={() => openEditCounts(card)}
                              title="Modificar conteos QR / NFC"
                              className="text-[11px] text-zinc-400 hover:text-amber-400"
                            >
                              ✏️
                            </button>
                          </div>
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
          </section>
        )}
      </main>

      {/* MODAL 1: GENERAR LOTE */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateBatch}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Generar Lote</h2>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="text-zinc-400 hover:text-zinc-200 text-sm"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                No. de tarjetas que quieres generar
              </label>
              <input
                type="number"
                min="1"
                max="500"
                value={batchQuantity}
                onChange={(e) => setBatchQuantity(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Nombre del lote (se creará su carpeta automáticamente)
              </label>
              <input
                type="text"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="Ej. Cafetería San José o Lote Centro"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={creatingBatch}
              className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm py-2.5 rounded-xl transition"
            >
              {creatingBatch ? 'Generando...' : 'Generar lote'}
            </button>
          </form>
        </div>
      )}

      {/* MODAL 2: AGREGAR CARPETA */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateFolder}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Nueva Carpeta</h2>
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="text-zinc-400 hover:text-zinc-200 text-sm"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Nombre de la carpeta o cliente..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-amber-500"
              required
            />
            <button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm py-2.5 rounded-xl transition"
            >
              Crear carpeta
            </button>
          </form>
        </div>
      )}

      {/* MODAL 3: MODIFICAR CONTEOS DE ESCANEOS QR / TOQUES NFC */}
      {editingCountsCard && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveCounts}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">
                Modificar conteos — Ficha #{editingCountsCard.id}
              </h2>
              <button
                type="button"
                onClick={() => setEditingCountsCard(null)}
                className="text-zinc-400 hover:text-zinc-200 text-sm"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Seleccionar ficha
              </label>
              <select
                value={editingCountsCard.id}
                onChange={(e) => {
                  const found = cards.find((c) => c.id === e.target.value);
                  if (found) openEditCounts(found);
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs"
              >
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.id} — {c.client_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Escaneos QR
                </label>
                <input
                  type="number"
                  min="0"
                  value={editQrValue}
                  onChange={(e) => setEditQrValue(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Toques NFC
                </label>
                <input
                  type="number"
                  min="0"
                  value={editNfcValue}
                  onChange={(e) => setEditNfcValue(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditQrValue(0);
                  setEditNfcValue(0);
                }}
                className="bg-zinc-800 hover:bg-zinc-700 text-xs px-3 py-2 rounded-xl border border-zinc-700"
              >
                Poner en 0
              </button>
              <button
                type="submit"
                disabled={savingCounts}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs py-2 rounded-xl"
              >
                {savingCounts ? 'Guardando...' : 'Guardar conteos'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 4: CONFIGURACIÓN */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveSettings}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl my-8"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-lg font-bold">⚙ Configuración del Sistema</h2>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-zinc-400 hover:text-zinc-200 text-sm"
              >
                Cerrar ✕
              </button>
            </div>

            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                1. Tipos de tarjeta (Categorías)
              </h3>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {editCategories.map((cat, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={cat}
                      onChange={(e) => {
                        const copy = [...editCategories];
                        copy[idx] = e.target.value;
                        setEditCategories(copy);
                      }}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs"
                    />
                    {editCategories.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditCategories(
                            editCategories.filter((_, i) => i !== idx)
                          )
                        }
                        className="text-xs text-red-400 px-2"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newCatInput}
                  onChange={(e) => setNewCatInput(e.target.value)}
                  placeholder="Agregar nuevo tipo..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    const clean = newCatInput.trim();
                    if (clean && !editCategories.includes(clean)) {
                      setEditCategories([...editCategories, clean]);
                      setNewCatInput('');
                    }
                  }}
                  className="bg-zinc-800 hover:bg-zinc-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-700"
                >
                  + Agregar
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-zinc-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                2. Mensaje de reporte para WhatsApp
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {[
                  '{cliente}',
                  '{id}',
                  '{categoria}',
                  '{total}',
                  '{qr}',
                  '{nfc}',
                ].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setEditTemplate((prev) => `${prev} ${tag}`)}
                    className="bg-zinc-950 hover:bg-zinc-800 text-amber-400 border border-zinc-800 font-mono text-[11px] px-2 py-0.5 rounded"
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                value={editTemplate}
                onChange={(e) => setEditTemplate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200"
              />
            </div>

            <div className="space-y-2.5 pt-3 border-t border-zinc-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                3. Cambiar contraseña de acceso
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Contraseña actual"
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nueva contraseña"
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repetir nueva contraseña"
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 text-xs text-zinc-400"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingSettings}
                className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs px-5 py-2.5 rounded-xl"
              >
                {savingSettings ? 'Guardando...' : 'Guardar configuración'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
