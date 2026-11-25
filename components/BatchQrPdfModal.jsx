'use client';

import { useState } from 'react';
import QRCode from 'qrcode';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Validación estricta: solo lotes ya creados donde el 100% de tarjetas sean "Reseñas Google"
export function validarLoteResenasGoogle(lote, tarjetasDelLote) {
  if (!lote || !lote.id || !Array.isArray(tarjetasDelLote) || tarjetasDelLote.length === 0) {
    return {
      permitido: false,
      motivo: 'Disponible únicamente dentro de un lote ya creado con tarjetas.',
    };
  }

  const noGoogle = tarjetasDelLote.filter((t) => {
    const cat = String(t.category ?? t.categoria ?? '').trim().toLowerCase();
    return cat !== 'reseñas google';
  });

  if (noGoogle.length > 0) {
    return {
      permitido: false,
      motivo: `Bloqueado: ${noGoogle.length} tarjeta(s) de este lote no están marcadas como "Reseñas Google".`,
    };
  }

  return { permitido: true, motivo: '' };
}

// Coordenadas exactas en puntos PDF (hoja 595.5 x 842.25 pt) para los 4 espacios de Reseñas google (1).pdf
const SLOTS_PLANTILLA = [
  // 1. Superior Izquierda
  { qrX: 192.5, qrY: 516.5, qrSize: 65.25, markX: 289.5, markY: 430.0 },
  // 2. Superior Derecha
  { qrX: 491.9, qrY: 516.5, qrSize: 65.25, markX: 587.5, markY: 430.0 },
  // 3. Inferior Izquierda
  { qrX: 192.5, qrY: 93.8,  qrSize: 65.25, markX: 289.5, markY: 9.0 },
  // 4. Inferior Derecha
  { qrX: 491.9, qrY: 93.8,  qrSize: 65.25, markX: 587.5, markY: 9.0 },
];

export default function BatchQrPdfModal({
  isOpen,
  onClose,
  lote,
  tarjetas,
  baseUrl,
}) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [markOpacity, setMarkOpacity] = useState(0.15); // 15% visibilidad por defecto
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
          'No se encontró /public/templates/resenas-google.pdf en el proyecto.'
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
          const slot = SLOTS_PLANTILLA[slotIdx];
          const cardId = String(card.id ?? card.numero ?? '').padStart(3, '0');
          const qrTarget = `${baseUrl}/c/${cardId}?m=qr`;

          // Generar QR PNG de alta resolución (600px) para impresión nítida
          const qrDataUrl = await QRCode.toDataURL(qrTarget, {
            width: 600,
            margin: 0,
            errorCorrectionLevel: 'M',
            color: { dark: '#000000', light: '#ffffff' },
          });

          const qrImage = await outDoc.embedPng(qrDataUrl);

          // Estampar QR dentro del marco redondeado
          copiedPage.drawImage(qrImage, {
            x: slot.qrX,
            y: slot.qrY,
            width: slot.qrSize,
            height: slot.qrSize,
          });

          // Estampar marca numérica poco visible (#001, #002...) en esquina inferior derecha
          const label = `#${cardId}`;
          const fontSize = 6.5;
          const textWidth = font.widthOfTextAtSize(label, fontSize);

          copiedPage.drawText(label, {
            x: slot.markX - textWidth,
            y: slot.markY,
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
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
                • <strong>Identificador interno:</strong> marca sutil <code>#001</code> en la esquina inferior derecha de cada tarjeta para emparejar tu chip NTAG213.
              </p>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Visibilidad de la marca numérica</span>
                <span className="text-amber-400 font-semibold">
                  {Math.round(markOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.06"
                max="0.35"
                step="0.01"
                value={markOpacity}
                onChange={(e) => setMarkOpacity(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
              <p className="text-[11px] text-zinc-500">
                Recomendado entre 12 % y 18 %: legible al armar el lote pero discreto para el cliente final.
              </p>
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
