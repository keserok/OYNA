/**
 * Paylaşılan fotoğraf yöneticisi (Karar #6-9, #19).
 * Owner (Tesis Ayarları) ve Admin/Owner (PitchManager kort editörü) aynı bileşeni kullanır.
 * Kaynak: pitch_media tablosu — sıralama, kapak, etiket, silme; DB trigger'ı
 * pitches.image/images ve courts.images'ı otomatik senkron tutar.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Star, Tag, Trash2 } from 'lucide-react';
import {
  PitchMediaItem,
  PitchMediaLabel,
  MEDIA_LABELS,
  MAX_COURT_PHOTOS,
  MAX_FACILITY_PHOTOS,
  deletePitchMedia,
  fetchPitchMedia,
  reorderPitchMedia,
  setPitchMediaLabel,
  uploadPitchMedia,
} from '../../services/pitchMediaService';
import { ImageValidationError } from '../../utils/imageCompression';
import { transformedImageUrl } from '../../utils/imageTransform';

interface Props {
  pitchId: string;
  /** null → tesis fotoğrafları; string → o kortun fotoğrafları */
  courtId?: string | null;
  readOnly?: boolean;
  onError?: (msg: string) => void;
  /** Güncel aktif URL listesi değişince bildirir (skor kartı vb. için) */
  onChanged?: (urls: string[]) => void;
}

export const PhotoManager: React.FC<Props> = ({ pitchId, courtId = null, readOnly, onError, onChanged }) => {
  const [items, setItems] = useState<PitchMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [labelPickerFor, setLabelPickerFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxPhotos = courtId ? MAX_COURT_PHOTOS : MAX_FACILITY_PHOTOS;

  const report = (e: unknown, fallback: string) => {
    const msg = e instanceof ImageValidationError ? e.message
      : e instanceof Error && e.message ? e.message : fallback;
    onError?.(msg);
  };

  const refresh = async () => {
    try {
      const data = await fetchPitchMedia(pitchId, courtId);
      setItems(data);
      onChanged?.(data.map((d) => d.url));
    } catch (e) {
      report(e, 'Fotoğraflar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitchId, courtId]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (items.length + files.length > maxPhotos) {
      onError?.(`En fazla ${maxPhotos} fotoğraf yükleyebilirsiniz.`);
      return;
    }
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        await uploadPitchMedia(file, pitchId, { courtId, sortOrder: items.length + 100 });
      }
      await refresh();
    } catch (e) {
      report(e, 'Fotoğraf yüklenemedi. Lütfen tekrar deneyin.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    setItems(reordered);
    try {
      await reorderPitchMedia(pitchId, reordered.map((i) => i.id));
      onChanged?.(reordered.map((d) => d.url));
    } catch (e) {
      report(e, 'Sıralama kaydedilemedi.');
      void refresh();
    }
  };

  const makeCover = async (index: number) => {
    if (index === 0) return;
    const reordered = [items[index], ...items.filter((_, i) => i !== index)];
    setItems(reordered);
    try {
      await reorderPitchMedia(pitchId, reordered.map((i) => i.id));
      onChanged?.(reordered.map((d) => d.url));
    } catch (e) {
      report(e, 'Kapak ayarlanamadı.');
      void refresh();
    }
  };

  const remove = async (item: PitchMediaItem) => {
    setBusy(true);
    try {
      await deletePitchMedia(item);
      await refresh();
    } catch (e) {
      report(e, 'Fotoğraf silinemedi.');
    } finally {
      setBusy(false);
    }
  };

  const applyLabel = async (item: PitchMediaItem, label: PitchMediaLabel | null) => {
    setLabelPickerFor(null);
    try {
      await setPitchMediaLabel(item, label);
      setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, label } : p)));
    } catch (e) {
      report(e, 'Etiket kaydedilemedi.');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-gray-500 uppercase">
          Fotoğraflar <span className="text-gray-600">({items.length}/{maxPhotos})</span>
        </label>
        {busy && <span className="text-[10px] font-bold text-[#39FF14] animate-pulse">YÜKLENİYOR…</span>}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
        {!readOnly && items.length < maxPhotos && (
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 w-28 h-36 bg-[#161B22] border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-white hover:border-white/30 disabled:opacity-50"
          >
            <ImagePlus size={22} />
            <span className="text-[10px] font-bold">EKLE</span>
          </button>
        )}

        {loading ? (
          <div className="h-36 flex items-center text-xs text-gray-500 px-4">Yükleniyor…</div>
        ) : items.map((item, idx) => (
          <div key={item.id} className="relative shrink-0 w-28 h-36 rounded-2xl overflow-hidden border border-white/10 group">
            <img src={transformedImageUrl(item.url, 'thumb')} alt="" className="w-full h-full object-cover" />

            {idx === 0 && (
              <span className="absolute bottom-2 left-2 text-[9px] font-bold bg-[#FFFF00] text-black px-2 py-0.5 rounded">
                KAPAK
              </span>
            )}
            {item.label && (
              <span className="absolute top-2 left-2 text-[8px] font-bold bg-black/70 text-white px-1.5 py-0.5 rounded">
                {MEDIA_LABELS.find((l) => l.value === item.label)?.label}
              </span>
            )}

            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={() => void remove(item)}
                  className="absolute top-2 right-2 p-1.5 bg-red-500/90 text-white rounded-lg"
                  title="Sil"
                >
                  <Trash2 size={13} />
                </button>
                <div className="absolute bottom-2 right-2 flex gap-1">
                  {idx !== 0 && (
                    <button
                      type="button"
                      onClick={() => void makeCover(idx)}
                      className="p-1.5 bg-black/70 text-[#FFFF00] rounded-lg"
                      title="Kapak yap"
                    >
                      <Star size={12} className="fill-current" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setLabelPickerFor(labelPickerFor === item.id ? null : item.id)}
                    className="p-1.5 bg-black/70 text-white rounded-lg"
                    title="Etiketle"
                  >
                    <Tag size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void move(idx, -1)}
                    className="p-1.5 bg-black/70 text-white rounded-lg disabled:opacity-30"
                    disabled={idx === 0}
                    title="Sola taşı"
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void move(idx, 1)}
                    className="p-1.5 bg-black/70 text-white rounded-lg disabled:opacity-30"
                    disabled={idx === items.length - 1}
                    title="Sağa taşı"
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>

                {labelPickerFor === item.id && (
                  <div className="absolute inset-0 bg-black/85 flex flex-col items-stretch justify-center gap-1 p-2 z-10">
                    {MEDIA_LABELS.map((l) => (
                      <button
                        key={l.value}
                        type="button"
                        onClick={() => void applyLabel(item, l.value)}
                        className={`text-[10px] font-bold py-1 rounded ${item.label === l.value ? 'bg-[#39FF14] text-black' : 'bg-white/10 text-white'}`}
                      >
                        {l.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => void applyLabel(item, null)}
                      className="text-[10px] font-bold py-1 rounded bg-white/5 text-gray-400"
                    >
                      Etiketsiz
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {!loading && items.length === 0 && readOnly && (
          <div className="h-36 flex items-center text-xs text-gray-500 px-4">Henüz fotoğraf yok.</div>
        )}
      </div>

      {!readOnly && (
        <p className="text-[10px] text-gray-600 leading-relaxed">
          İlk fotoğraf vitrindeki kapak görselidir. Fotoğraflar otomatik sıkıştırılır (max 10MB, min 800px).
          En az 1 “Saha İçi” etiketli fotoğraf önerilir.
        </p>
      )}
    </div>
  );
};

export default PhotoManager;
