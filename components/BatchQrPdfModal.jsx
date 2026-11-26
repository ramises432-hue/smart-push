'use client';

import { useState } from 'react';
import QRCode from 'qrcode';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

function normalizeCategory(val) {
  return String(val ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isGoogleReviewCategory(val) {
  const norm = normalizeCategory(val);
  return norm.includes('google');
}

// Validación estricta: solo lotes ya creados donde el 100% de tarjetas sean de Reseñas Google
export function validarLoteResenasGoogle(lote, tarjetasDelLote) {
  if (!lote || !lote.id || !Array.isArray(tarjetasDelLote) || tarjetasDelLote.length === 0) {
    return {
      permitido: false,
      motivo: 'Disponible únicamente dentro de un lote ya creado con tarjetas.',
    };
  }

  const noGoogle = tarjetasDelLote.filter((t) => {
    const cat = t.category ?? t.categoria ?? '';
    return !isGoogleReviewCategory(cat);
  });

  if (noGoogle.length > 0) {
    return {
      permitido: false,
      motivo: `Bloqueado: ${noGoogle.length} tarjeta(s) de este lote no son de "Reseñas Google".`,
    };
  }

  return { permitido: true, motivo: '' };
}

// Coordenadas en puntos PDF (Y desde abajo) centradas dentro de los corchetes de la plantilla
const BASE_SLOTS = [
  // 1. Superior Izquierda
  { qrX: 201.5, qrY: 434.0, qrSize: 49.0, markX: 285.0, markY: 435.0 },
  // 2. Superior Derecha
  { qrX: 500.9, qrY: 434.0, qrSize: 49.0, markX: 584.4, markY: 435.0 },
  // 3. Inferior Izquierda
  { qrX: 201.5, qrY: 13.0,  qrSize: 49.0, markX: 285.0, markY: 14.0 },
  // 4. Inferior Derecha
  { qrX: 500.9, qrY: 13.0,  qrSize: 49.0, markX: 584.4, markY: 14.0 },
];

export function getCardNumberLabel(card, fallbackIndex = 0) {
  const rawId = String(card?.id ?? card?.numero ?? '').trim();
  if (rawId) {
    const numOnly = rawId.startsWith('#') ? rawId.slice(1) : rawId;
    const isAllDigits = numOnly.length > 0 && [...numOnly].every((ch) => ch >= '0' && ch <= '9');
    if (isAllDigits) {
      return numOnly.padStart(3, '0');
    }
    return numOnly;
  }
  return String(fallbackIndex + 1).padStart(3, '0');
}

export default function BatchQrPdfModal({
  isOpen,
  onClose,
  lote,
  tarjetas,
  baseUrl,
}) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [markOpacity, setMarkOpacity] = useState(0.65);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastRegisteredRange, setLastRegisteredRange] = useState('');

  if (!isOpen) return null;

  const sortedCards = [...(tarjetas || [])].sort((a, b) =>
    String(a.id ?? a.numero ?? '').localeCompare(
      String(b.id ?? b.numero ?? ''),
      undefined,
      { numeric: true }
    )
  );

  const validacion = validarLoteResenasGoogle(lote, sortedCards);
  const totalHojas = Math.ceil(sortedCards.length / 4);

  const handleGeneratePdf = async () => {
    if (!validacion.permitido) return;
    setGenerating(true);
    setErrorMsg('');

    try {
      setProgress('Cargando plantilla vectorial...');
      const templateRes = await fetch('/templates/resenas-google.pdf');
      if (!templateRes.ok) {
        throw new Error(
          'No se encontró /public/templates/resenas-google.pdf en el proyecto.'
        );
      }

      const templateBytes = await templateRes.arrayBuffer();
      const srcDoc = await PDFDocument.load(templateBytes);
      const outDoc = await PDFDocument.create();
      const font = await outDoc.embedFont(StandardFonts.CourierBold);

      const registeredNumbers = [];
      let cleanBase = String(baseUrl || '').trim();
      while (cleanBase.endsWith('/')) {
        cleanBase = cleanBase.slice(0, -1);
      }

      for (let pageIdx = 0; pageIdx < totalHojas; pageIdx++) {
        setProgress(`Procesando hoja ${pageIdx + 1} de ${totalHojas}...`);
        const [copiedPage] = await outDoc.copyPages(srcDoc, [0]);
        outDoc.addPage(copiedPage);

        const slice = sortedCards.slice(pageIdx * 4, pageIdx * 4 + 4);

        for (let slotIdx = 0; slotIdx < slice.length; slotIdx++) {
          const card = slice[slotIdx];
          const slot = BASE_SLOTS[slotIdx];
          const globalIdx = pageIdx * 4 + slotIdx;
          const cardCode = getCardNumberLabel(card, globalIdx);
          registeredNumbers.push(cardCode);

          const qrTarget = `${cleanBase}/c/${cardCode}?m=qr`;

          const qrDataUrl = await QRCode.toDataURL(qrTarget, {
            width: 600,
            margin: 0,
            errorCorrectionLevel: 'M',
            color: { dark: '#000000', light: '#ffffff' },
          });

          const qrImage = await outDoc.embedPng(qrDataUrl);

          const finalQrX = slot.qrX + Number(offsetX || 0);
          const finalQrY = slot.qrY + Number(offsetY || 0);

          // Fondo blanco interior sin tapar los corchetes exteriores
          copiedPage.drawRectangle({
            x: finalQrX + 1,
            y: finalQrY + 1,
            width: slot.qrSize - 2,
            height: slot.qrSize - 2,
            color: rgb(1, 1, 1),
          });

          // Estampar QR centrado dentro de los corchetes
          copiedPage.drawImage(qrImage, {
            x: finalQrX,
            y: finalQrY,
            width: slot.qrSize,
            height: slot.qrSize,
          });

          // Registrar y estampar número de ficha (#001, #002...)
          const label = `#${cardCode}`;
          const fontSize = 8;
          const textWidth = font.widthOfTextAtSize(label, fontSize);
          const markX = slot.markX + Number(offsetX || 0);
          const markY = slot.markY + Number(offsetY || 0);

          copiedPage.drawText(label, {
            x: markX - textWidth,
            y: markY,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
            opacity: markOpacity,
          });
        }
      }

      const firstCode = registeredNumbers[0] || '';
      const lastCode = registeredNumbers[registeredNumbers.length - 1] || '';
      setLastRegisteredRange(
        registeredNumbers.length > 1
          ? `#${firstCode} a #${lastCode} (${registeredNumbers.length} fichas registradas)`
          : `#${firstCode} (1 ficha registrada)`
      );

      setProgress('Preparando descarga del PDF...');
      const pdfBytes = await outDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const loteSlug = String(lote.name ?? lote.nombre ?? 'Lote')
        .trim()
        .split(' ')
        .filter(Boolean)
        .join('-');
      a.href = url;
      a.download = `SmartPush-${loteSlug}-ResenasGoogle.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(err.message || 'Error al generar el PDF.');
    } finally {
      setGenerating(false);
      setProgress('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
              Impresión A4 (4 tarjetas por hoja)
            </span>
            <h2 className="text-lg font-bold text-zinc-100 mt-0.5">
              {lote?.name ?? lote?.nombre}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800"
          >
            Cerrar
          </button>
        </div>

        {!validacion.permitido ? (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs leading-relaxed p-4 rounded-xl">
            {validacion.motivo}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-1.5 text-xs text-zinc-300">
              <p>
                • <strong>Tarjetas en el lote:</strong> {sortedCards.length} (100 % Reseñas Google)
              </p>
              <p>
                • <strong>Hojas A4 a generar:</strong> {totalHojas} página(s)
              </p>
              <p>
                • <strong>Registro de número:</strong>{' '}
                <code>#{getCardNumberLabel(sortedCards[0], 0)}</code>
                {sortedCards.length > 1 && (
                  <>
                    {' '}a <code>#{getCardNumberLabel(sortedCards[sortedCards.length - 1], sortedCards.length - 1)}</code>
                  </>
                )}{' '}
                estampado en cada tarjeta.
              </p>
              {lastRegisteredRange && (
                <p className="text-emerald-400 pt-1">
                  ✓ <strong>Último lote generado:</strong> {lastRegisteredRange}
                </p>
              )}
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>Visibilidad del número (#ID)</span>
                  <span className="text-amber-400 font-semibold">
                    {Math.round(markOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.15"
                  max="1.0"
                  step="0.05"
                  value={markOpacity}
                  onChange={(e) => setMarkOpacity(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Ajuste horizontal (pt)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={offsetX}
                    onChange={(e) => setOffsetX(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Ajuste vertical (pt)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={offsetY}
                    onChange={(e) => setOffsetY(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
                  />
                </div>
              </div>
            </div>

            {errorMsg && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 p-3 rounded-lg">
                {errorMsg}
              </p>
            )}

            {progress && (
              <p className="text-xs text-amber-400 text-center">{progress}</p>
            )}

            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={generating}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm py-2.5 rounded-xl transition"
            >
              {generating ? 'Generando PDF...' : 'Descargar PDF listo para imprimir'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}