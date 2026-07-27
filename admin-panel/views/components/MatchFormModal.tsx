import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, UploadCloud, Loader2 } from 'lucide-react';
import { useImageUpload } from '../../../hooks/useImageUpload';
import { useAppStore } from '../../../store';
import { supabase } from '../../../supabaseClient';
import { allowedSquadSizesForCourts, formatCapacityRangeForCourts } from '../../../shared/pitchShowcaseMapper';
import type { MatchListing } from '../../../types';

const DIFFICULTIES = ['Rahat', 'Taktiksel', 'Ciddi'] as const;
const STATUSES = ['DRAFT', 'ACTIVE', 'LIVE', 'COMPLETED', 'CANCELLED'] as const;
// Saha seçilmemişken sunulan varsayılan liste; saha seçilince kortların
// gerçek aralığından türetilen tam liste kullanılır.
const BASE_FORMATS = ['5v5', '7v7', '8v8', '11v11'];

interface CourtRangeRow { capacity: number | null; min_capacity: number | null; max_capacity: number | null }

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  match?: MatchListing | null;
  onClose: () => void;
  onSave: (data: Partial<MatchListing> & { rawDate: string }) => Promise<void>;
}

export const MatchFormModal: React.FC<Props> = ({ open, mode, match, onClose, onSave }) => {
  const adminPitches = useAppStore((s) => s.adminPitches);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    title: '',
    location: '',
    rawDate: new Date().toISOString().slice(0, 10),
    time: '20:00',
    price: '200',
    difficulty: 'Rahat' as MatchListing['difficulty'],
    minRating: '3.0',
    status: 'ACTIVE' as NonNullable<MatchListing['status']>,
    format: '7v7',
    image: '',
    pitchId: '',
  });
  const { uploadImage, uploading, progress } = useImageUpload('matches');

  // Seçili sahanın kortları → format aralığı kısıtı (admin store'daki
  // adminPitches kort verisi taşımaz; tembel çekim gerekir).
  const [pitchCourts, setPitchCourts] = useState<CourtRangeRow[]>([]);
  useEffect(() => {
    if (!open || !f.pitchId) { setPitchCourts([]); return; }
    let alive = true;
    void supabase
      .from('courts')
      .select('capacity, min_capacity, max_capacity')
      .eq('pitch_id', f.pitchId)
      .eq('is_active', true)
      .then(({ data }) => { if (alive) setPitchCourts((data ?? []) as CourtRangeRow[]); });
    return () => { alive = false; };
  }, [open, f.pitchId]);

  const courtRanges = useMemo(
    () => pitchCourts.map((c) => ({ minCapacity: c.min_capacity, maxCapacity: c.max_capacity, capacity: c.capacity })),
    [pitchCourts],
  );
  // Saha seçiliyse: en az bir kortun aralığına giren formatlar; değilse varsayılan 4'lü.
  const formatOptions = useMemo(() => {
    if (!f.pitchId || courtRanges.length === 0) return BASE_FORMATS;
    return allowedSquadSizesForCourts(courtRanges).filter((s) => s !== '2v2');
  }, [f.pitchId, courtRanges]);
  const pitchRangeLabel = useMemo(
    () => (courtRanges.length ? formatCapacityRangeForCourts(courtRanges) : null),
    [courtRanges],
  );

  // Mevcut format kısıt dışında kaldıysa en yakın izinliye çek.
  useEffect(() => {
    if (!formatOptions.length || formatOptions.includes(f.format)) return;
    const side = (v: string) => parseInt(v.split('v')[0], 10) || 7;
    const nearest = [...formatOptions].sort((a, b) => Math.abs(side(a) - side(f.format)) - Math.abs(side(b) - side(f.format)))[0];
    setF((prev) => ({ ...prev, format: nearest }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatOptions]);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && match) {
      setF({
        title: match.title,
        location: match.location,
        // Maçın GERÇEK tarihi (mapper rawDate taşır) — eskiden bugüne
        // sıfırlanıyordu ve başlık düzeltmek maçın tarihini kaydırıyordu.
        rawDate: match.rawDate || new Date().toISOString().slice(0, 10),
        time: match.time,
        price: String(match.price),
        difficulty: match.difficulty,
        minRating: String(match.minRating),
        status: match.status || 'ACTIVE',
        format: match.format || '7v7',
        image: match.image,
        pitchId: match.pitchId || '',
      });
    } else {
      setF({
        title: '',
        location: '',
        rawDate: new Date().toISOString().slice(0, 10),
        time: '20:00',
        price: '200',
        difficulty: 'Rahat',
        minRating: '3.0',
        status: 'ACTIVE',
        format: '7v7',
        image: '',
        pitchId: '',
      });
    }
  }, [open, mode, match]);

  const submit = async () => {
    if (!f.title.trim() || !f.location.trim()) return;
    setSaving(true);
    try {
      await onSave({
        ...(mode === 'edit' && match ? { id: match.id, slots: match.slots, awaySlots: match.awaySlots, missingPositions: match.missingPositions } : {}),
        title: f.title.trim(),
        location: f.location.trim(),
        rawDate: f.rawDate,
        time: f.time,
        price: Number(f.price) || 0,
        difficulty: f.difficulty,
        minRating: Number(f.minRating) || 3,
        status: f.status,
        format: f.format,
        // Boş → sunucu tetikleyicisi maçın sahasının fotoğrafını otomatik yazar.
        image: f.image.trim(),
        badges: [f.difficulty],
        pitchId: f.pitchId || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-lg bg-[#161B22] border border-white/10 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">
              {mode === 'create' ? 'Yeni Maç' : 'Maç Düzenle'}
            </h3>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center">
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3">
            <Field label="Başlık">
              <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder="Akşam Maçı..." />
            </Field>
            <Field label="Saha (opsiyonel)">
              <select
                value={f.pitchId}
                onChange={(e) => {
                  const pid = e.target.value;
                  const p = adminPitches.find((x) => x.id === pid);
                  // Saha seçilince serbest metin konumu saha adıyla otomatik doldur.
                  setF((prev) => ({ ...prev, pitchId: pid, location: p ? p.name : prev.location }));
                }}
                className={inputCls}
              >
                <option value="">Saha seçilmedi</option>
                {adminPitches.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Konum / Saha">
              <input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className={inputCls} placeholder="Altınordu Arena" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tarih">
                <input type="date" value={f.rawDate} onChange={(e) => setF({ ...f, rawDate: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Saat">
                <input value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className={inputCls} placeholder="20:00" />
              </Field>
              <Field label="Katılım (₺)">
                <input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Min. Rating">
                <input type="number" step="0.1" value={f.minRating} onChange={(e) => setF({ ...f, minRating: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Zorluk">
                <select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value as MatchListing['difficulty'] })} className={inputCls}>
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label={`Format${pitchRangeLabel ? ` (saha: ${pitchRangeLabel})` : ''}`}>
                <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })} className={inputCls}>
                  {formatOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </Field>
            </div>
            {mode === 'edit' && (
              <Field label="Durum">
                <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as typeof f.status })} className={inputCls}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            )}
            <Field label="Kapak Görseli">
              <label className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-xl cursor-pointer ${uploading ? 'border-red-500/40' : 'border-white/10 hover:border-white/20'}`}>
                {uploading ? (
                  <span className="text-xs text-red-400 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> %{progress.toFixed(0)}</span>
                ) : f.image ? (
                  <img src={f.image} alt="" className="w-full h-full object-cover rounded-lg p-1" />
                ) : (
                  <span className="text-xs text-gray-500 flex items-center gap-1.5 text-center px-2"><UploadCloud size={18} /> Özel görsel yükle — boş bırakılırsa sahanın fotoğrafı otomatik gösterilir</span>
                )}
                <input type="file" className="hidden" accept="image/*" disabled={uploading} onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = await uploadImage(file);
                    if (url) setF((prev) => ({ ...prev, image: url }));
                  }
                }} />
              </label>
              {f.image && !uploading && (
                <button
                  type="button"
                  onClick={() => setF((prev) => ({ ...prev, image: '' }))}
                  className="mt-1.5 text-[10px] font-bold text-gray-400 hover:text-white uppercase tracking-wider"
                >
                  ↺ Otomatiğe döndür (saha fotoğrafı)
                </button>
              )}
            </Field>
          </div>

          <button
            type="button"
            disabled={saving || uploading}
            onClick={() => void submit()}
            className="w-full h-12 mt-4 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Check size={16} /> {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

const inputCls = 'w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-sm text-white focus:outline-none focus:border-red-500/40';
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">{label}</label>
    {children}
  </div>
);
