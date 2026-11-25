'use client';

import { useState } from 'react';
import QRCode from 'qrcode';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Validaci?n estricta: solo lotes ya creados donde el 100% de tarjetas sean "Rese?as Google"
export function validarLoteResenasGoogle(lote, tarjetasDelLote) {
  if (!lote || !lote.id || !Array.isArray(tarjetasDelLote) || tarjetasDelLote.length === 0) {
    return {
      permitido: false,
      motivo: 'Disponible ?nicamente dentro de un lote ya creado con tarjetas.',
    };
  }

  const noGoogle = tarjetasDelLote.filter((t) => {
    const cat = String(t.category ?? t.categoria ?? '').trim().toLowerCase();
    return cat !== 'rese?as google';
  });

  if (noGoogle.length > 0) {
    return {
      permitido: false,
      motivo: `Bloqueado: ${noGoogle.length} tarjeta(s) de este lote no est?n marcadas como "Rese?as Google".`,
    };
  }

  return { permitido: true, motivo: '' };
}

// Coordenadas base en puntos PDF para los 4 espacios de la hoja (ajustables con offsetX / offsetY)
const BASE_SLOTS = [
  // 1. Superior Izquierda
  { qrX: 205.0, qrY: 454.0, qrSize: 46.0, markX: 286.0, markY: 434.0 },
  // 2. Superior Derecha
  { qrX: 504.4, qrY: 454.0, qrSize: 46.0, markX: 585.4, markY: 434.0 },
  // 3. Inferior Izquierda
  { qrX: 205.0, qrY: 31.3,  qrSize: 46.0, markX: 286.0, markY: 11.3 },
  // 4. Inferior Derecha
  { qrX: 504.4, qrY: 31.3,  qrSize: 46.0, markX: 585.4, markY: 11.3 },
];

function getCardNumberLabel(card, fallbackIndex) {
  const rawId = String(card?.id ?? card?.numero ?? '').trim();
  if (rawId) {
    const numOnly = rawId.replace(/^#/, '');
    return /^d+$/.test(numOnly) ? numOnly.padStart(3, '0') : numOnly;
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
  const [markOpacity, setMarkOpacity] = useState(0.35);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

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
          'No se encontr? /public/templates/resenas-google.pdf en el proyecto.'
        );
      }

      const templateBytes = await templateRes.arrayBuffer();
      const srcDoc = await PDFDocument.load(templateBytes);
      const outDoc = await PDFDocument.create();
      const font = await outDoc.embedFont(StandardFonts.CourierBold);

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
          const qrTarget = `${baseUrl}/c/${cardCode}?m=qr`;

          // Generar QR PNG de alta resoluci?n (600px) para impresi?n n?tida
          const qrDataUrl = await QRCode.toDataURL(qrTarget, {
            width: 600,
            margin: 0,
            errorCorrectionLevel: 'M',
            color: { dark: '#000000', light: '#ffffff' },
          });

          const qrImage = await outDoc.embedPng(qrDataUrl);

          const finalQrX = slot.qrX + Number(offsetX || 0);
          const finalQrY = slot.qrY + Number(offsetY || 0);

          // Limpiar interior del cuadro de corchetes antes de estampar el QR
          copiedPage.drawRectangle({
            x: finalQrX - 1,
            y: finalQrY - 1,
            width: slot.qrSize + 2,
            height: slot.qrSize + 2,
            color: rgb(1, 1, 1),
          });

          // Estampar QR centrado dentro del marco de corchetes
          copiedPage.drawImage(qrImage, {
            x: finalQrX,
            y: finalQrY,
            width: slot.qrSize,
            height: slot.qrSize,
          });

          // Registrar y estampar n?mero de ficha (#001, #002...) en la esquina inferior derecha
          const label = `#${cardCode}`;
          const fontSize = 7.5;
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

      setProgress('Preparando descarga del PDF...');
      const pdfBytes = await outDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const loteSlug = String(lote.name ?? lote.nombre ?? 'Lote')
        .trim()
        .replace(/\s+/g, '-');
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
              Impresi?n A4 (4 tarjetas por hoja)
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
                ? <strong>Tarjetas en el lote:</strong> {sortedCards.length} (100 % Rese?as Google)
              </p>
              <p>
                ? <strong>Hojas A4 a generar:</strong> {totalHojas} p?gina(s)
              </p>
              <p>
                ? <strong>Registro de n?mero:</strong>{' '}
                <code>#{getCardNumberLabel(sortedCards[0], 0)}</code>
                {sortedCards.length > 1 && (
                  <>
                    {' '}a <code>#{getCardNumberLabel(sortedCards[sortedCards.length - 1], sortedCards.length - 1)}</code>
                  </>
                )}{' '}
                estampado en cada tarjeta.
              </p>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>Visibilidad del n?mero (#ID)</span>
                  <span className="text-amber-400 font-semibold">
                    {Math.round(markOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.85"
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
