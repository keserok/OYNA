import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, UploadCloud, Loader2 } from 'lucide-react';
import { useImageUpload } from '../../../hooks/useImageUpload';
import { useAppStore } from '../../../store';
import { supabase } from '../../../supabaseClient';
import type { MatchPayloadSource } from '../../../shared/matchMapper';
import {
  allowedSquadSizesForCourt,
  allowedSquadSizesForCourts,
  formatCapacityRange,
  formatCapacityRangeForCourts,
} from '../../../shared/pitchShowcaseMapper';
import type { MatchListing } from '../../../types';

const DIFFICULTIES = ['Rahat', 'Taktiksel', 'Ciddi'] as const;
const STATUSES = ['DRAFT', 'ACTIVE', 'LIVE', 'COMPLETED', 'CANCELLED'] as const;
// Lobi ile aynı tam format yelpazesi (3v3..11v11).
const FORMATS: string[] = ['3v3', '4v4', '5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11'];
const DURATIONS = ['60 Dakika', '90 Dakika', '120 Dakika'] as const;
const GENDERS = ['Karma', 'Erkek', 'Kadın'] as const;
const AGE_GROUPS = ['10-14', '14-16', '16-18', '18-22', '23-27', '28-35', '35+', 'Tümü'] as const;

/** Kort seçici satırı — adminPitches.courts yoksa doğrudan 'courts' tablosundan çekilir. */
interface CourtOption {
  id: string;
  name: string;
  min_capacity?: number | null;
  max_capacity?: number | null;
  size_label?: string | null;
}

/** Yerel YYYY-MM-DD (toISOString'in UTC kaymasından kaçınır). */
function localIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// tr-TR kısa ay etiketleri ("27 Tem" gibi liste etiketlerini geri çevirmek için).
const TR_SHORT_MONTHS: Record<string, number> = {
  oca: 0, şub: 1, mar: 2, nis: 3, may: 4, haz: 5,
  tem: 6, ağu: 7, eyl: 8, eki: 9, kas: 10, ara: 11,
};

/** Edit modunda formu maçın GERÇEK tarihiyle aç: startsAt > ISO > etiket çözümü. */
function resolveMatchDate(match?: MatchListing | null): string {
  const today = new Date();
  if (!match) return localIsoDate(today);
  // En güvenilir kaynak: DB'nin ham başlangıç timestamp'i.
  if (match.startsAt && /^\d{4}-\d{2}-\d{2}/.test(match.startsAt)) return match.startsAt.slice(0, 10);
  const raw = (match.date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (raw === 'Bugün') return localIsoDate(today);
  if (raw === 'Yarın') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return localIsoDate(d);
  }
  const ddmmyyyy = raw.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/); // 27.06.2026
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  const trLabel = raw.match(/^(\d{1,2})\s+(\S+)/); // "27 Tem" (formatDateLabel çıktısı)
  if (trLabel) {
    const month = TR_SHORT_MONTHS[trLabel[2].toLocaleLowerCase('tr-TR').slice(0, 3)];
    if (month !== undefined) return localIsoDate(new Date(today.getFullYear(), month, Number(trLabel[1])));
  }
  return localIsoDate(today);
}

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  match?: MatchListing | null;
  onClose: () => void;
  onSave: (data: MatchPayloadSource & { rawDate: string }) => Promise<void>;
}

export const MatchFormModal: React.FC<Props> = ({ open, mode, match, onClose, onSave }) => {
  const adminPitches = useAppStore((s) => s.adminPitches);
  const [saving, setSaving] = useState(false);
  const [courts, setCourts] = useState<CourtOption[]>([]);
  const [f, setF] = useState({
    title: '',
    location: '',
    rawDate: localIsoDate(new Date()),
    time: '20:00',
    price: '200',
    difficulty: 'Rahat' as MatchListing['difficulty'],
    status: 'ACTIVE' as NonNullable<MatchListing['status']>,
    format: '7v7',
    duration: '',
    gender: '',
    ageGroup: '',
    visibility: 'OPEN' as NonNullable<MatchListing['visibility']>,
    privateCode: '',
    isDemo: false,
    isPlatform: true,
    image: '',
    pitchId: '',
    courtId: '',
  });
  const { uploadImage, uploading, progress } = useImageUpload('matches');
  // admin_fetch_matches is_platform döndürmediğinden edit'te gerçek değer bilinmez:
  // dokunulmadıysa payload'a HİÇ yazılmaz (sunucu mevcut değeri korur).
  const [platformTouched, setPlatformTouched] = useState(false);
  const initialPitchIdRef = useRef('');

  useEffect(() => {
    if (!open) return;
    setPlatformTouched(false);
    initialPitchIdRef.current = (mode === 'edit' && match ? match.pitchId : '') || '';
    if (mode === 'edit' && match) {
      setF({
        title: match.title,
        location: match.location,
        // Maçın GERÇEK tarihi: mapper'ın taşıdığı rawDate en güvenilir kaynak;
        // yoksa startsAt / ISO / TR etiket çözümüne düşülür (eskiden her açılışta
        // bugüne sıfırlanıyordu ve başlık düzeltmek maçın tarihini kaydırıyordu).
        rawDate: match.rawDate || resolveMatchDate(match),
        time: match.time,
        price: String(match.price),
        difficulty: match.difficulty,
        status: match.status || 'ACTIVE',
        format: match.format || '7v7',
        duration: match.duration || '',
        gender: match.gender || '',
        ageGroup: match.ageGroup || '',
        visibility: match.visibility || 'OPEN',
        privateCode: match.privateCode || '',
        isDemo: !!match.isDemo,
        // Listing'de alan yoksa platform maçı varsay (mevcut kayıtları bozmamak için).
        isPlatform: (match as MatchListing & { isPlatform?: boolean }).isPlatform ?? true,
        image: match.image,
        pitchId: match.pitchId || '',
        courtId: (match as MatchListing & { courtId?: string }).courtId || '',
      });
    } else {
      setF({
        title: '',
        location: '',
        rawDate: localIsoDate(new Date()),
        time: '20:00',
        price: '200',
        difficulty: 'Rahat',
        status: 'ACTIVE',
        format: '7v7',
        duration: '',
        gender: '',
        ageGroup: '',
        visibility: 'OPEN',
        privateCode: '',
        isDemo: false,
        isPlatform: true,
        image: '',
        pitchId: '',
        courtId: '',
      });
    }
  }, [open, mode, match]);

  // Saha seçilince kortları hazırla: store'da varsa oradan, yoksa 'courts' tablosundan.
  useEffect(() => {
    if (!open || !f.pitchId) {
      setCourts([]);
      return;
    }
    const preloaded = adminPitches.find((p) => p.id === f.pitchId)?.courts;
    if (preloaded && preloaded.length > 0) {
      setCourts(preloaded.map((c) => {
        const ext = c as typeof c & CourtOption;
        return { id: c.id, name: c.name, min_capacity: ext.min_capacity, max_capacity: ext.max_capacity, size_label: ext.size_label };
      }));
      return;
    }
    let cancelled = false;
    void supabase
      .from('courts')
      .select('id,name,min_capacity,max_capacity,size_label')
      .eq('pitch_id', f.pitchId)
      .eq('is_active', true)
      .then(({ data }) => {
        if (!cancelled) setCourts((data as CourtOption[]) ?? []);
      });
    return () => { cancelled = true; };
  }, [open, f.pitchId, adminPitches]);

  // Format listesi tek kaynaktan daralır (shared/pitchShowcaseMapper):
  //   kort seçili → o kortun aralığı; yalnız saha seçili → kortların birleşimi;
  //   hiçbiri → tam yelpaze. Aralık bilinmiyorsa kısıt uygulanmaz.
  const selectedCourt = courts.find((c) => c.id === f.courtId);
  const formatOptions = useMemo<string[]>(() => {
    const narrowed = selectedCourt
      ? allowedSquadSizesForCourt(selectedCourt.min_capacity, selectedCourt.max_capacity)
      : courts.length
        ? allowedSquadSizesForCourts(
            courts.map((c) => ({ minCapacity: c.min_capacity, maxCapacity: c.max_capacity })),
          )
        : FORMATS;
    const list = narrowed.filter((v) => v !== '2v2');
    return list.length ? list : [...FORMATS];
  }, [selectedCourt, courts]);

  // Format alanı etiketinde geçerli aralık rozeti (kort → kort aralığı, saha → birleşim).
  const rangeLabel = useMemo(() => {
    if (selectedCourt) return formatCapacityRange(selectedCourt.min_capacity, selectedCourt.max_capacity);
    if (!courts.length) return null;
    return formatCapacityRangeForCourts(
      courts.map((c) => ({ minCapacity: c.min_capacity, maxCapacity: c.max_capacity })),
    );
  }, [selectedCourt, courts]);

  // Aralık dışında kalan formatı ilk uygun değere çek.
  useEffect(() => {
    if (formatOptions.length && !formatOptions.includes(f.format)) {
      setF((prev) => ({ ...prev, format: formatOptions[0] }));
    }
  }, [formatOptions, f.format]);

  const submit = async () => {
    if (!f.title.trim() || !f.location.trim()) return;
    setSaving(true);
    try {
      const privateCode = f.visibility === 'PRIVATE' ? f.privateCode.trim().toUpperCase() : '';
      await onSave({
        ...(mode === 'edit' && match ? { id: match.id, slots: match.slots, awaySlots: match.awaySlots, missingPositions: match.missingPositions } : {}),
        title: f.title.trim(),
        location: f.location.trim(),
        rawDate: f.rawDate,
        time: f.time,
        price: Number(f.price) || 0,
        difficulty: f.difficulty,
        status: f.status,
        format: f.format,
        duration: f.duration || undefined,
        gender: f.gender || undefined,
        ageGroup: f.ageGroup || undefined,
        visibility: f.visibility,
        // Boş bırakılırsa anahtar hiç gitmez → sunucu otomatik kod üretir.
        ...(privateCode ? { privateCode } : {}),
        isDemo: f.isDemo,
        // Edit'te yalnız admin dokunduysa gönderilir — aksi hâlde sunucu değeri korunur
        // (fetch is_platform döndürmediği için form gerçeği bilemez).
        ...(mode !== 'edit' || platformTouched ? { isPlatform: f.isPlatform } : {}),
        // Boş → sunucu tetikleyicisi maçın sahasının fotoğrafını otomatik yazar.
        image: f.image.trim(),
        // Edit'te mevcut rozetleri KORU (zorlukla EZME); yalnız create'te zorluk yazılır.
        badges: mode === 'edit' && match ? match.badges : [f.difficulty],
        pitchId: f.pitchId || undefined,
        // Saha değiştiyse ve yeni kort seçilmediyse eski kort bağı temizlenir
        // (boş court_id sunucuda NULL'a çevrilir); aksi hâlde yalnız seçim gider.
        ...(f.courtId
          ? { courtId: f.courtId }
          : (mode === 'edit' && f.pitchId !== initialPitchIdRef.current ? { courtId: '' } : {})),
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
          className="w-full max-w-lg bg-surface-1 border border-white/10 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-extrabold text-white uppercase tracking-widest">
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
                  // Saha seçilince serbest metin konumu saha adıyla otomatik doldur; kort seçimini sıfırla.
                  setF((prev) => ({ ...prev, pitchId: pid, courtId: '', location: p ? p.name : prev.location }));
                }}
                className={inputCls}
              >
                <option value="">Saha seçilmedi</option>
                {adminPitches.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            {f.pitchId && (
              <Field label="Kort">
                <select
                  value={f.courtId}
                  onChange={(e) => setF({ ...f, courtId: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Kort seçilmedi</option>
                  {courts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.size_label ? ` (${c.size_label})` : (c.min_capacity != null && c.max_capacity != null ? ` (${c.min_capacity}v${c.min_capacity}–${c.max_capacity}v${c.max_capacity})` : '')}
                    </option>
                  ))}
                </select>
              </Field>
            )}
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
              {/* Min. Rating alanı söküldü — puan barajı sistemden kalktı (20260730135953). */}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Zorluk">
                <select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value as MatchListing['difficulty'] })} className={inputCls}>
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label={`Format${rangeLabel ? ` (${selectedCourt ? 'kort' : 'saha'}: ${rangeLabel})` : ''}`}>
                <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })} className={inputCls}>
                  {formatOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="Süre">
                <select value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} className={inputCls}>
                  <option value="">Belirtilmedi</option>
                  {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Cinsiyet">
                <select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })} className={inputCls}>
                  <option value="">Belirtilmedi</option>
                  {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="Yaş Grubu">
                <select value={f.ageGroup} onChange={(e) => setF({ ...f, ageGroup: e.target.value })} className={inputCls}>
                  <option value="">Belirtilmedi</option>
                  {AGE_GROUPS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
              <Field label="Görünürlük">
                <select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as NonNullable<MatchListing['visibility']> })} className={inputCls}>
                  <option value="OPEN">Herkese Açık</option>
                  <option value="PRIVATE">Kod ile Özel</option>
                </select>
              </Field>
            </div>
            {f.visibility === 'PRIVATE' && (
              <Field label="Özel Kod (boş = otomatik)">
                <input
                  value={f.privateCode}
                  maxLength={8}
                  onChange={(e) => setF({ ...f, privateCode: e.target.value.toUpperCase() })}
                  className={inputCls}
                  placeholder="ör. OYNA2024"
                />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2.5 h-10 px-3 bg-black/40 border border-white/10 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.isDemo}
                  onChange={(e) => setF({ ...f, isDemo: e.target.checked })}
                  className="w-4 h-4 accent-red-500"
                />
                <span className="text-xs font-bold text-gray-300">Demo maçı</span>
              </label>
              <label className="flex items-center gap-2.5 h-10 px-3 bg-black/40 border border-white/10 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.isPlatform}
                  onChange={(e) => { setPlatformTouched(true); setF({ ...f, isPlatform: e.target.checked }); }}
                  className="w-4 h-4 accent-red-500"
                />
                <span className="text-xs font-bold text-gray-300">OYNA platform maçı</span>
              </label>
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
            className="w-full h-12 mt-4 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-extrabold text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
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
