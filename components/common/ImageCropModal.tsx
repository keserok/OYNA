import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, ZoomIn, Loader2 } from 'lucide-react';

/**
 * Bağımlılıksız, canvas tabanlı görsel kırpma modalı.
 * Kare (1:1) varsayılan; zoom (merkez sabit) + sürükle-kaydır ile konumlanır,
 * onaylandığında outputSize×(outputSize/aspect) JPEG File döner. Avatar ve takım
 * logosu gibi tüm 1:1 yükleme noktaları aynı UX'i paylaşır.
 */
interface Props {
  /** Kırpılacak dosya. null → modal kapalı. */
  file: File | null;
  /** en/boy oranı (w/h). Varsayılan 1 (kare). */
  aspect?: number;
  /** çıktı genişliği px. Yükseklik = outputSize/aspect. Varsayılan 512. */
  outputSize?: number;
  title?: string;
  circle?: boolean;
  onCancel: () => void;
  onCropped: (file: File) => void;
}

const VP = 300; // viewport genişliği (css px)

export const ImageCropModal: React.FC<Props> = ({
  file, aspect = 1, outputSize = 512, title = 'Görseli Kırp', circle = true, onCancel, onCropped,
}) => {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const vpW = VP;
  const vpH = Math.round(VP / aspect);
  const baseScale = natural ? Math.max(vpW / natural.w, vpH / natural.h) : 1;
  const scale = baseScale * zoom;

  useEffect(() => {
    if (!file) { setImgUrl(null); setNatural(null); return; }
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clamp = useCallback((o: { x: number; y: number }, s: number) => {
    if (!natural) return o;
    const dispW = natural.w * s, dispH = natural.h * s;
    const minX = vpW - dispW, minY = vpH - dispH;
    return { x: Math.min(0, Math.max(minX, o.x)), y: Math.min(0, Math.max(minY, o.y)) };
  }, [natural, vpW, vpH]);

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const im = e.currentTarget;
    const nat = { w: im.naturalWidth, h: im.naturalHeight };
    setNatural(nat);
    const bs = Math.max(vpW / nat.w, vpH / nat.h);
    setOffset({ x: (vpW - nat.w * bs) / 2, y: (vpH - nat.h * bs) / 2 });
    setZoom(1);
  };

  /** Merkez-sabit zoom: viewport merkezindeki görsel noktası yerinde kalır. */
  const zoomTo = (nz: number) => {
    const clamped = Math.min(4, Math.max(1, nz));
    const oldScale = baseScale * zoom;
    const newScale = baseScale * clamped;
    const ix = (vpW / 2 - offset.x) / oldScale;
    const iy = (vpH / 2 - offset.y) / oldScale;
    setZoom(clamped);
    setOffset(clamp({ x: vpW / 2 - ix * newScale, y: vpH / 2 - iy * newScale }, newScale));
  };

  const pointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const pointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset(clamp({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) }, scale));
  };
  const pointerUp = () => { drag.current = null; };

  const confirm = async () => {
    if (!natural || !imgRef.current) return;
    setBusy(true);
    try {
      const outW = outputSize;
      const outH = Math.round(outputSize / aspect);
      const canvas = document.createElement('canvas');
      canvas.width = outW; canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no-2d-context');
      ctx.fillStyle = '#0b0f1a';
      ctx.fillRect(0, 0, outW, outH);
      // viewport'un görsel-doğal koordinatlarındaki kaynak karesi
      const sx = -offset.x / scale;
      const sy = -offset.y / scale;
      ctx.drawImage(imgRef.current, sx, sy, vpW / scale, vpH / scale, 0, 0, outW, outH);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
      if (!blob) throw new Error('toBlob-failed');
      const base = (file?.name || 'logo').replace(/\.[^.]+$/, '');
      onCropped(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }));
    } catch {
      if (file) onCropped(file); // kırpma başarısızsa orijinali ilet (yükleme yine de olsun)
    } finally {
      setBusy(false);
    }
  };

  if (!file) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[300] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm bg-[#161B22] border border-white/10 rounded-2xl p-5 shadow-2xl"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">{title}</h3>
            <button type="button" onClick={onCancel} className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center">
              <X size={16} />
            </button>
          </div>

          <div
            className="relative mx-auto overflow-hidden bg-black/60 border border-white/10 touch-none select-none cursor-grab active:cursor-grabbing"
            style={{ width: vpW, height: vpH, borderRadius: circle && aspect === 1 ? '9999px' : '16px' }}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerLeave={pointerUp}
            onWheel={(e) => { zoomTo(zoom + (e.deltaY < 0 ? 0.12 : -0.12)); }}
          >
            {imgUrl && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <img
                ref={imgRef}
                src={imgUrl}
                onLoad={onImgLoad}
                draggable={false}
                style={{
                  position: 'absolute',
                  left: offset.x,
                  top: offset.y,
                  width: natural ? natural.w * scale : 'auto',
                  height: natural ? natural.h * scale : 'auto',
                  maxWidth: 'none',
                  pointerEvents: 'none',
                }}
              />
            )}
            <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]" style={{ borderRadius: circle && aspect === 1 ? '9999px' : '16px' }} />
          </div>

          <div className="flex items-center gap-2 mt-4">
            <ZoomIn size={14} className="text-gray-500 shrink-0" />
            <input
              type="range" min={1} max={4} step={0.01} value={zoom}
              onChange={(e) => zoomTo(Number(e.target.value))}
              className="flex-1 accent-red-500"
            />
          </div>
          <p className="text-[10px] text-gray-500 text-center mt-2">Sürükleyerek konumlandır, kaydırarak yakınlaştır.</p>

          <div className="flex gap-2 mt-4">
            <button type="button" onClick={onCancel} className="flex-1 h-11 rounded-xl border border-white/10 text-gray-400 hover:text-white text-xs font-bold">İptal</button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy || !natural}
              className="flex-1 h-11 rounded-xl bg-gradient-to-r from-red-600 to-purple-700 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Uygula
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ImageCropModal;
