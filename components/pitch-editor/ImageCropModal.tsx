/**
 * 16:9 kırpma aracı (Faz 8 · Karar #7). Kullanıcı fotoğrafın hangi bandının
 * vitrinde kalacağını sürükleyerek seçer; sonuç bir odak noktası (0..1) olarak
 * compressImageForUpload'a geçer (gerçek kırpma orada yapılır). Merkez varsayılan.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Check, Move, X } from 'lucide-react';
import { SHOWCASE_ASPECT_RATIO } from '../../utils/imageCompression';

interface Props {
  file: File;
  index: number;
  total: number;
  onConfirm: (focus: { x: number; y: number }) => void;
  onCancel: () => void;
}

export const ImageCropModal: React.FC<Props> = ({ file, index, total, onConfirm, onCancel }) => {
  const [url, setUrl] = useState<string>('');
  const [focus, setFocus] = useState({ x: 0.5, y: 0.5 });
  const frameRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ startX: number; startY: number; fx: number; fy: number } | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    setFocus({ x: 0.5, y: 0.5 });
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, fx: focus.x, fy: focus.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const dx = (e.clientX - drag.current.startX) / rect.width;
    const dy = (e.clientY - drag.current.startY) / rect.height;
    // Görseli sürükledikçe görünen pencere kayar (odak ters yönde ilerler).
    setFocus({
      x: Math.min(1, Math.max(0, drag.current.fx - dx)),
      y: Math.min(1, Math.max(0, drag.current.fy - dy)),
    });
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <div className="fixed inset-0 z-[130] bg-black/90 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
      <div className="flex items-center justify-between p-4 safe-area-top">
        <button onClick={onCancel} className="p-2 rounded-full bg-white/10 text-white"><X size={20} /></button>
        <span className="text-sm font-bold text-white">
          Kırp {total > 1 ? `(${index + 1}/${total})` : ''}
        </span>
        <button
          onClick={() => onConfirm(focus)}
          className="px-4 py-2 rounded-xl bg-primary text-black font-extrabold text-xs flex items-center gap-1.5"
        >
          <Check size={16} /> KULLAN
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative w-full max-w-md rounded-2xl overflow-hidden border border-white/15 cursor-move touch-none select-none"
          style={{ aspectRatio: String(SHOWCASE_ASPECT_RATIO) }}
        >
          {url && (
            <img
              src={url}
              alt="Kırpma önizleme"
              draggable={false}
              className="w-full h-full object-cover pointer-events-none"
              style={{ objectPosition: `${focus.x * 100}% ${focus.y * 100}%` }}
            />
          )}
          {/* 16:9 kılavuz çizgileri */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
            <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
            <div className="absolute top-1/3 left-0 right-0 h-px bg-white/20" />
            <div className="absolute top-2/3 left-0 right-0 h-px bg-white/20" />
          </div>
        </div>
        <p className="text-[0.6875rem] text-gray-400 flex items-center gap-1.5">
          <Move size={13} /> Sürükleyerek konumlandır · vitrinde 16:9 görünür
        </p>
      </div>
    </div>
  );
};

export default ImageCropModal;
