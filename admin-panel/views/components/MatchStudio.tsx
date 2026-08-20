/**
 * MAÇ STÜDYOSU (20 Ağu 2026 — kurucu isteği): "Yeni maç oluştur ekranı daha
 * büyük, daha düzenli ve basit olmalı; maçların nasıl göründüğü kapsamlı yer
 * almalı. Bu ekrandan ana uygulamadan ödeme yapılacak maçları oluşturacağız."
 *
 * Eski dar modal (MatchFormModal) yerine TAM EKRAN stüdyo:
 *   · Solda bölümlü form (Temel · Saha&Kort · Zaman · Format · Ücret ·
 *     Görünürlük · Görsel) — her bölüm tek işi yapar, sıra maç kurma akışıdır.
 *   · Sağda CANLI ÖNİZLEME — uygulamanın Keşfet kartının (MatchJoinCard)
 *     BİREBİR render'ı: admin kaydetmeden "oyuncu ne görecek?"i görür.
 *     Aynılık garantisi: önizleme ayrı bir kopya değil, uygulamanın kendi
 *     bileşenidir (drift imkânsız).
 *
 * Sunucu sözleşmesi değişmedi: kadro formata göre admin_create_match içinde
 * otomatik kurulur; süre `duration` metninden trigger ile duration_minutes'a
 * türetilir; kapak boşsa sahanın fotoğrafı otomatik yazılır.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Check, UploadCloud, Loader2, Swords, MapPin, CalendarDays, Timer,
  Users, Wallet, EyeOff, Image as ImageIcon, Smartphone, AlertCircle,
  CalendarCheck2, CalendarX2,
} from 'lucide-react';
import {
  checkCourtSlotAdmin, type CourtSlotCheck,
} from '../../services/adminService';
import { useImageUpload } from '../../../hooks/useImageUpload';
import { useAppStore } from '../../../store';
import { supabase } from '../../../supabaseClient';
import { formatDateLabel, type MatchPayloadSource } from '../../../shared/matchMapper';
import {
  allowedSquadSizesForCourt,
  allowedSquadSizesForCourts,
  formatCapacityRange,
  formatCapacityRangeForCourts,
} from '../../../shared/pitchShowcaseMapper';
import { FORMATIONS, type SquadSize } from '../../../utils/formations';
import { playStyleMetaForDifficulty } from '../../../views/onboarding/onboardingShared';
import { MatchJoinCard } from '../../../components/MatchJoinCard';
import type { MatchListing, PositionSlot } from '../../../types';

const DIFFICULTIES = ['Rahat', 'Taktiksel', 'Ciddi'] as const;
const STATUSES = ['DRAFT', 'ACTIVE', 'LIVE', 'COMPLETED', 'CANCELLED'] as const;
// Lobi ile aynı tam format yelpazesi (3v3..11v11).
const FORMATS: string[] = ['3v3', '4v4', '5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11'];
const DURATIONS = ['60 Dakika', '90 Dakika', '120 Dakika'] as const;
const GENDERS = ['Karma', 'Erkek', 'Kadın'] as const;
const AGE_GROUPS = ['10-14', '14-16', '16-18', '18-22', '23-27', '28-35', '35+', 'Tümü'] as const;
const TIME_PRESETS = ['19:00', '20:00', '21:00', '22:00'] as const;

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

/** Önizleme kadrosu: sunucunun kuracağı varsayılan dizilişin istemci ikizi. */
function buildPreviewSlots(format: string, prefix: string): PositionSlot[] {
  const size: SquadSize = (Object.prototype.hasOwnProperty.call(FORMATIONS, format) ? format : '7v7') as SquadSize;
  const formation = Object.values(FORMATIONS[size] || {})[0] || [];
  return formation.map((c, i) => ({
    id: `${prefix}-${i}`,
    role: c.role,
    status: 'OPEN' as const,
    x: c.x,
    y: c.y,
  }));
}

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  match?: MatchListing | null;
  onClose: () => void;
  onSave: (data: MatchPayloadSource & { rawDate: string }) => Promise<void>;
}

export const MatchStudio: React.FC<Props> = ({ open, mode, match, onClose, onSave }) => {
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
    duration: '60 Dakika',
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
        // yoksa startsAt / ISO / TR etiket çözümüne düşülür.
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
        duration: '60 Dakika',
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

  // ── Kort müsaitlik kontrolü (kurucu isteği, 20 Ağu 2026) ──────────────────
  // Kort + tarih + saat seçildikçe çakışan rezervasyon/maç sunucudan sorulur.
  // Yalnız UYARIDIR: admin bilerek üstüne maç koyabilir (kayıt engellenmez).
  const [slotCheck, setSlotCheck] = useState<CourtSlotCheck | null>(null);
  const [slotChecking, setSlotChecking] = useState(false);
  const studioDurationMin = useMemo(() => {
    const n = parseInt((f.duration.match(/\d+/) || ['60'])[0], 10);
    return Number.isFinite(n) ? n : 60;
  }, [f.duration]);

  useEffect(() => {
    if (!open || !f.courtId || !/^\d{4}-\d{2}-\d{2}$/.test(f.rawDate) || !/\d{1,2}[:.]\d{2}/.test(f.time)) {
      setSlotCheck(null);
      return;
    }
    let cancelled = false;
    setSlotChecking(true);
    const t = setTimeout(() => {
      checkCourtSlotAdmin({
        courtId: f.courtId,
        date: f.rawDate,
        time: f.time,
        durationMinutes: studioDurationMin,
        excludeMatchId: mode === 'edit' ? match?.id : undefined,
      })
        .then((res) => { if (!cancelled) setSlotCheck(res); })
        .catch(() => { if (!cancelled) setSlotCheck(null); })
        .finally(() => { if (!cancelled) setSlotChecking(false); });
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, f.courtId, f.rawDate, f.time, studioDurationMin, mode, match?.id]);

  const fmtConflictRange = (starts: string | null, ends: string | null): string => {
    const fmt = (s: string | null) => {
      if (!s) return '?';
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? '?' : d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    };
    return `${fmt(starts)}–${fmt(ends)}`;
  };

  // ── Doğrulama: kaydet tuşunun yanındaki canlı eksik listesi ───────────────
  const eksikler = useMemo(() => {
    const list: string[] = [];
    if (!f.title.trim()) list.push('Başlık');
    if (!f.location.trim()) list.push('Konum/Saha');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.rawDate)) list.push('Tarih');
    if (!/\d{1,2}[:.]\d{2}/.test(f.time)) list.push('Saat (örn. 20:00)');
    if (f.price !== '' && Number(f.price) < 0) list.push('Ücret negatif olamaz');
    return list;
  }, [f.title, f.location, f.rawDate, f.time, f.price]);

  const submit = async () => {
    if (eksikler.length > 0) return;
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

  // ── Canlı önizleme verisi: uygulamanın kendi kartını besler ───────────────
  const previewSlots = useMemo<PositionSlot[]>(() => {
    if (mode === 'edit' && match?.slots?.length) return match.slots;
    return buildPreviewSlots(f.format, 'pv');
  }, [mode, match, f.format]);

  const previewAwaySlots = useMemo<PositionSlot[]>(() => {
    if (mode === 'edit' && match?.awaySlots?.length) return match.awaySlots;
    return buildPreviewSlots(f.format, 'pva');
  }, [mode, match, f.format]);

  const durationMinutes = useMemo(() => {
    const n = parseInt((f.duration.match(/\d+/) || ['60'])[0], 10);
    return Number.isFinite(n) ? n : 60;
  }, [f.duration]);

  const previewMatch = useMemo<MatchListing>(() => ({
    id: match?.id ?? 'studio-preview',
    title: f.title.trim() || 'Maç Başlığı',
    location: f.location.trim() || 'Saha',
    time: (f.time.replace('.', ':').match(/\d{1,2}:\d{2}/) || ['20:00'])[0],
    date: formatDateLabel(f.rawDate),
    rawDate: f.rawDate,
    price: Number(f.price) || 0,
    difficulty: f.difficulty,
    image: f.image,
    badges: [f.difficulty],
    missingPositions: [],
    slots: previewSlots,
    awaySlots: previewAwaySlots,
    status: mode === 'edit' ? f.status : 'ACTIVE',
    format: f.format,
    duration: f.duration || undefined,
    durationMinutes,
    gender: f.gender || undefined,
    ageGroup: f.ageGroup || undefined,
    visibility: f.visibility,
  }), [match, f, previewSlots, previewAwaySlots, durationMinutes, mode]);

  const perTeam = previewSlots.length;
  const totalSlots = perTeam + previewAwaySlots.length;
  const doluluk = previewSlots.filter((s) => s.status === 'TAKEN').length
    + previewAwaySlots.filter((s) => s.status === 'TAKEN').length;
  const potansiyel = (Number(f.price) || 0) * totalSlots;

  const baslangicLabel = useMemo(() => {
    const t = (f.time.replace('.', ':').match(/\d{1,2}:\d{2}/) || ['20:00'])[0];
    const d = new Date(`${f.rawDate}T${t.padStart(5, '0')}:00`);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  }, [f.rawDate, f.time]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[210] bg-[#0B0F14] flex flex-col"
      >
        {/* ── Üst bar: başlık + doğrulama + kaydet ── */}
        <header className="shrink-0 h-16 border-b border-white/10 bg-[#0D1117]/95 backdrop-blur flex items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button type="button" onClick={onClose} aria-label="Kapat" className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white flex items-center justify-center shrink-0">
              <X size={16} />
            </button>
            <div className="min-w-0">
              <p className="text-[9px] font-extrabold text-red-400 uppercase tracking-[0.2em]">Maç Stüdyosu</p>
              <h2 className="text-sm font-extrabold text-white truncate">
                {mode === 'create' ? 'Yeni Maç Oluştur' : `Maçı Düzenle — ${match?.title ?? ''}`}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {eksikler.length > 0 && (
              <span className="hidden md:flex items-center gap-1.5 text-[10px] font-bold text-amber-300">
                <AlertCircle size={12} /> Eksik: {eksikler.join(' · ')}
              </span>
            )}
            <button
              type="button"
              disabled={saving || uploading || eksikler.length > 0}
              onClick={() => void submit()}
              className="h-10 px-5 bg-gradient-to-r from-red-600 to-purple-700 rounded-xl text-white font-extrabold text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {saving ? 'Kaydediliyor…' : mode === 'create' ? 'Maçı Yayınla' : 'Kaydet'}
            </button>
          </div>
        </header>

        {/* ── Gövde: solda form, sağda canlı uygulama önizlemesi ── */}
        <div className="flex-1 flex overflow-hidden">
          {/* FORM */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 space-y-5">

              <Bolum no="1" icon={<Swords size={14} />} title="Temel Bilgiler" desc="Maçın adı ve oyun havası — kartta en önce bunlar görünür.">
                <Field label="Maç Başlığı *">
                  <input
                    value={f.title}
                    onChange={(e) => setF({ ...f, title: e.target.value })}
                    className={`${inputCls} h-12 text-base`}
                    placeholder="örn. Perşembe Akşam Klasiği"
                    autoFocus={mode === 'create'}
                  />
                </Field>
                <Field label="Oyun Havası (zorluk)">
                  <div className="grid grid-cols-3 gap-2">
                    {DIFFICULTIES.map((d) => {
                      const meta = playStyleMetaForDifficulty(d);
                      const active = f.difficulty === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setF({ ...f, difficulty: d })}
                          className={`h-11 rounded-xl border text-xs font-extrabold uppercase tracking-wide transition-all ${active ? 'text-black' : 'text-gray-400 bg-black/30 border-white/10 hover:border-white/25'}`}
                          style={active ? { background: meta?.color, borderColor: meta?.color } : undefined}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <ToggleKart
                    checked={f.isPlatform}
                    onChange={() => { setPlatformTouched(true); setF({ ...f, isPlatform: !f.isPlatform }); }}
                    title="OYNA Platform Maçı"
                    desc="OYNA'nın kurduğu maç — Keşfet'te platform rozetiyle çıkar"
                  />
                  <ToggleKart
                    checked={f.isDemo}
                    onChange={() => setF({ ...f, isDemo: !f.isDemo })}
                    title="Demo Maçı"
                    desc="Gerçek para akmaz; demo temizliğinde silinir"
                    danger
                  />
                </div>
                {mode === 'edit' && (
                  <Field label="Durum">
                    <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as typeof f.status })} className={inputCls}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                )}
              </Bolum>

              <Bolum no="2" icon={<MapPin size={14} />} title="Saha & Kort" desc="Saha seçersen kapak fotoğrafı ve format aralığı sahadan gelir.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <Field label="Kort">
                    <select
                      value={f.courtId}
                      onChange={(e) => setF({ ...f, courtId: e.target.value })}
                      disabled={!f.pitchId}
                      className={`${inputCls} disabled:opacity-40`}
                    >
                      <option value="">{f.pitchId ? 'Kort seçilmedi' : 'Önce saha seçin'}</option>
                      {courts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.size_label ? ` (${c.size_label})` : (c.min_capacity != null && c.max_capacity != null ? ` (${c.min_capacity}v${c.min_capacity}–${c.max_capacity}v${c.max_capacity})` : '')}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Konum / Saha Adı * (kartta görünen)">
                  <input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className={inputCls} placeholder="Altınordu Arena" />
                </Field>
              </Bolum>

              <Bolum no="3" icon={<CalendarDays size={14} />} title="Tarih & Saat" desc="Maç saati geldiğinde skor ve yaşam döngüsü bu bilgiden işler.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Tarih *">
                    <input type="date" value={f.rawDate} onChange={(e) => setF({ ...f, rawDate: e.target.value })} className={inputCls} />
                    <div className="flex gap-1.5 mt-1.5">
                      {([['Bugün', 0], ['Yarın', 1], ['+2 gün', 2]] as const).map(([label, plus]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            d.setDate(d.getDate() + plus);
                            setF((prev) => ({ ...prev, rawDate: localIsoDate(d) }));
                          }}
                          className="px-2 py-1 rounded-lg border border-white/10 bg-black/30 text-[10px] font-bold text-gray-400 hover:text-white hover:border-white/25"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Başlangıç Saati *">
                    <input value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className={inputCls} placeholder="20:00" />
                    <div className="flex gap-1.5 mt-1.5">
                      {TIME_PRESETS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setF((prev) => ({ ...prev, time: t }))}
                          className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${f.time === t ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-white/10 bg-black/30 text-gray-400 hover:text-white hover:border-white/25'}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
                <Field label="Maç Süresi">
                  <div className="grid grid-cols-3 gap-2">
                    {DURATIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setF({ ...f, duration: f.duration === d ? '' : d })}
                        className={`h-10 rounded-xl border text-[11px] font-extrabold flex items-center justify-center gap-1.5 ${f.duration === d ? 'border-[#39FF14]/50 bg-[#39FF14]/10 text-[#39FF14]' : 'border-white/10 bg-black/30 text-gray-400 hover:border-white/25 hover:text-white'}`}
                      >
                        <Timer size={12} /> {d}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-gray-600 mt-1.5">Skor giriş penceresi ve "maç bitti" anı bu süreden hesaplanır.</p>
                </Field>

                {/* Kort müsaitliği — kort seçiliyse canlı çakışma kontrolü */}
                {f.courtId ? (
                  <div className={`rounded-xl border px-3.5 py-3 ${
                    slotChecking ? 'border-white/10 bg-black/25'
                      : slotCheck?.available ? 'border-[#39FF14]/30 bg-[#39FF14]/[0.05]'
                      : slotCheck ? 'border-red-500/35 bg-red-500/[0.06]'
                      : 'border-white/10 bg-black/25'
                  }`}>
                    {slotChecking ? (
                      <p className="text-[11px] text-gray-500 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Kort müsaitliği kontrol ediliyor…</p>
                    ) : !slotCheck ? (
                      <p className="text-[11px] text-gray-600">Müsaitlik okunamadı — kayıt yine de yapılabilir.</p>
                    ) : slotCheck.available ? (
                      <p className="text-[11px] font-bold text-[#39FF14] flex items-center gap-2">
                        <CalendarCheck2 size={13} /> Kort bu saatte MÜSAİT ({f.time} · {studioDurationMin} dk)
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-extrabold text-red-300 flex items-center gap-2">
                          <CalendarX2 size={13} /> DİKKAT — kort bu saatte dolu ({slotCheck.conflicts.length} çakışma)
                        </p>
                        {slotCheck.conflicts.slice(0, 4).map((c) => (
                          <p key={`${c.kind}-${c.id}`} className="text-[10px] text-red-200/80 pl-5">
                            • {c.kind === 'BOOKING' ? 'Rezervasyon' : 'Maç'}: {c.title || '—'} · {fmtConflictRange(c.starts, c.ends)}
                            {c.status ? ` (${c.status})` : ''}
                          </p>
                        ))}
                        <p className="text-[9px] text-gray-500 pl-5">
                          Kayıt engellenmez — bilinçli olarak üstüne yazıyorsan saati/kortu değiştirmeden yayınlayabilirsin.
                        </p>
                      </div>
                    )}
                  </div>
                ) : f.pitchId ? (
                  <p className="text-[9px] text-gray-600">Müsaitlik kontrolü için yukarıdan bir <b className="text-gray-400">kort</b> seç.</p>
                ) : null}
              </Bolum>

              <Bolum no="4" icon={<Users size={14} />} title={`Format & Kadro${rangeLabel ? ` — ${selectedCourt ? 'kort' : 'saha'} aralığı: ${rangeLabel}` : ''}`} desc="Kadro seçilen formata göre otomatik kurulur; oyuncular uygulamadan yer satın alır.">
                <div className="flex flex-wrap gap-2">
                  {formatOptions.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setF({ ...f, format: v })}
                      className={`h-10 px-4 rounded-xl border text-xs font-extrabold ${f.format === v ? 'border-red-500/60 bg-red-500/15 text-white' : 'border-white/10 bg-black/30 text-gray-400 hover:border-white/25 hover:text-white'}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                </div>
                <p className="text-[10px] text-gray-500 bg-black/30 border border-white/[0.06] rounded-xl px-3 py-2">
                  {f.format} = takım başına {perTeam || '?'} oyuncu · toplam {totalSlots || '?'} yer.
                  Kadro dizilişi sunucuda otomatik kurulur; pozisyonları sonradan Maç Kokpiti'nden yönetebilirsin.
                </p>
              </Bolum>

              <Bolum no="5" icon={<Wallet size={14} />} title="Katılım Ücreti" desc="Oyuncu uygulamadan yer satın alırken bu tutarı kartından öder.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <Field label="Kişi Başı Ücret (₺)">
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        value={f.price}
                        onChange={(e) => setF({ ...f, price: e.target.value })}
                        className={`${inputCls} h-12 text-base pr-10 font-mono`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 font-extrabold">₺</span>
                    </div>
                  </Field>
                  <div className="bg-black/30 border border-white/[0.06] rounded-xl px-3 py-2.5">
                    <p className="text-[9px] text-gray-500 uppercase font-bold">Kadro dolarsa toplam</p>
                    <p className="text-sm font-extrabold font-mono text-[#39FF14]">
                      {potansiyel.toLocaleString('tr-TR')}₺
                      <span className="text-gray-600 font-normal text-[10px]"> ({totalSlots} yer × {(Number(f.price) || 0).toLocaleString('tr-TR')}₺)</span>
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  Para modeli: ödeme <span className="text-gray-300 font-bold">işlem başına karttan</span> alınır,
                  iptalde <span className="text-gray-300 font-bold">karta iade</span> edilir (cüzdan yok — 6493 kararı).
                  0₺ = ücretsiz maç; ödeme adımı hiç açılmaz.
                </p>
              </Bolum>

              <Bolum no="6" icon={<EyeOff size={14} />} title="Görünürlük" desc="Özel maç yalnız kodu bilenlere açılır; Keşfet'te listelenmez.">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setF({ ...f, visibility: 'OPEN' })}
                    className={`h-11 rounded-xl border text-xs font-extrabold uppercase ${f.visibility === 'OPEN' ? 'border-[#39FF14]/50 bg-[#39FF14]/10 text-[#39FF14]' : 'border-white/10 bg-black/30 text-gray-400 hover:border-white/25'}`}
                  >
                    Herkese Açık
                  </button>
                  <button
                    type="button"
                    onClick={() => setF({ ...f, visibility: 'PRIVATE' })}
                    className={`h-11 rounded-xl border text-xs font-extrabold uppercase ${f.visibility === 'PRIVATE' ? 'border-purple-500/50 bg-purple-500/10 text-purple-300' : 'border-white/10 bg-black/30 text-gray-400 hover:border-white/25'}`}
                  >
                    Kod ile Özel
                  </button>
                </div>
                {f.visibility === 'PRIVATE' && (
                  <Field label="Özel Kod (boş bırakılırsa otomatik üretilir)">
                    <input
                      value={f.privateCode}
                      maxLength={8}
                      onChange={(e) => setF({ ...f, privateCode: e.target.value.toUpperCase() })}
                      className={`${inputCls} font-mono tracking-widest`}
                      placeholder="örn. OYNA2026"
                    />
                  </Field>
                )}
              </Bolum>

              <Bolum no="7" icon={<ImageIcon size={14} />} title="Kapak Görseli" desc="Boş bırakılırsa seçilen sahanın fotoğrafı otomatik kullanılır.">
                <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer overflow-hidden ${uploading ? 'border-red-500/40' : 'border-white/10 hover:border-white/20'}`}>
                  {uploading ? (
                    <span className="text-xs text-red-400 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> %{progress.toFixed(0)}</span>
                  ) : f.image ? (
                    <img src={f.image} alt="" className="w-full h-full object-cover" />
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
                    className="text-[10px] font-bold text-gray-400 hover:text-white uppercase tracking-wider"
                  >
                    ↺ Otomatiğe döndür (saha fotoğrafı)
                  </button>
                )}
              </Bolum>

              {/* Alt kaydet — uzun formda yukarı dönmeden bitir */}
              <div className="pb-10">
                <button
                  type="button"
                  disabled={saving || uploading || eksikler.length > 0}
                  onClick={() => void submit()}
                  className="w-full h-13 py-4 bg-gradient-to-r from-red-600 to-purple-700 rounded-2xl text-white font-extrabold text-sm uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {saving ? 'Kaydediliyor…' : mode === 'create' ? 'Maçı Yayınla' : 'Değişiklikleri Kaydet'}
                </button>
                {eksikler.length > 0 && (
                  <p className="text-[10px] text-amber-300 text-center mt-2 flex items-center justify-center gap-1.5">
                    <AlertCircle size={11} /> Eksik: {eksikler.join(' · ')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* CANLI ÖNİZLEME — uygulamanın kendi kartı (MatchJoinCard), birebir */}
          <aside className="hidden lg:flex w-[420px] xl:w-[460px] shrink-0 border-l border-white/10 bg-black/25 flex-col overflow-y-auto custom-scrollbar">
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Smartphone size={14} className="text-[#39FF14]" />
                <div>
                  <p className="text-[10px] font-extrabold text-white uppercase tracking-widest">Canlı Önizleme</p>
                  <p className="text-[9px] text-gray-500">Oyuncu bu maçı Keşfet'te TAM OLARAK böyle görür — uygulamanın kendi kartıdır.</p>
                </div>
              </div>

              {/* Telefon çerçevesi hissi */}
              <div className="mx-auto w-full max-w-[360px] rounded-[26px] border border-white/10 bg-[#0A0E14] p-3 shadow-2xl">
                <MatchJoinCard match={previewMatch} currentUserUid="" onOpenLobby={() => undefined} />
              </div>

              {/* Yayın özeti */}
              <div className="bg-[#10151C] border border-white/[0.06] rounded-2xl p-4 space-y-2.5">
                <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Yayın Özeti</p>
                <OzetSatiri label="Başlangıç" value={baslangicLabel} />
                {f.courtId && slotCheck && !slotChecking && (
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-gray-500">Kort müsaitliği</span>
                    <span className={`font-extrabold ${slotCheck.available ? 'text-[#39FF14]' : 'text-red-400'}`}>
                      {slotCheck.available ? 'MÜSAİT ✓' : `DOLU — ${slotCheck.conflicts.length} çakışma`}
                    </span>
                  </div>
                )}
                <OzetSatiri label="Kadro" value={`${f.format} · ${totalSlots} yer (${doluluk} dolu)`} />
                <OzetSatiri label="Kişi başı ücret" value={`${(Number(f.price) || 0).toLocaleString('tr-TR')}₺`} strong />
                <OzetSatiri label="Kadro dolarsa toplam" value={`${potansiyel.toLocaleString('tr-TR')}₺`} />
                <OzetSatiri label="Görünürlük" value={f.visibility === 'PRIVATE' ? `Özel (kod${f.privateCode ? `: ${f.privateCode}` : ' otomatik'})` : 'Herkese açık'} />
                {f.duration && <OzetSatiri label="Süre" value={f.duration} />}
                {f.gender && <OzetSatiri label="Cinsiyet" value={f.gender} />}
                {f.ageGroup && <OzetSatiri label="Yaş grubu" value={f.ageGroup} />}
                <OzetSatiri label="Tür" value={`${f.isPlatform ? 'OYNA platform maçı' : 'Topluluk maçı'}${f.isDemo ? ' · DEMO' : ''}`} />
              </div>

              <p className="text-[9px] text-gray-600 leading-relaxed">
                Yayınlanınca maç uygulamada anında görünür (aynı veritabanı, gerçek zamanlı).
                Kadro, skor, ödeme ve iade müdahaleleri için maç satırındaki <span className="text-cyan-400 font-bold">LOBİ</span> kokpitini kullan.
              </p>
            </div>
          </aside>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// ── Küçük yapı taşları ───────────────────────────────────────────────────────
const inputCls = 'w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-sm text-white focus:outline-none focus:border-red-500/40';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">{label}</label>
    {children}
  </div>
);

const Bolum: React.FC<{ no: string; icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }> = ({ no, icon, title, desc, children }) => (
  <section className="bg-[#10151C] border border-white/[0.06] rounded-2xl p-5 space-y-4">
    <div className="flex items-start gap-3">
      <span className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 flex items-center justify-center text-[11px] font-extrabold shrink-0">{no}</span>
      <div className="min-w-0">
        <h3 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5">{icon} {title}</h3>
        {desc && <p className="text-[10px] text-gray-500 mt-0.5">{desc}</p>}
      </div>
    </div>
    <div className="space-y-3">{children}</div>
  </section>
);

const ToggleKart: React.FC<{ checked: boolean; onChange: () => void; title: string; desc: string; danger?: boolean }> = ({ checked, onChange, title, desc, danger }) => (
  <button
    type="button"
    onClick={onChange}
    className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${checked ? (danger ? 'border-amber-500/40 bg-amber-500/[0.06]' : 'border-red-500/40 bg-red-500/[0.06]') : 'border-white/10 bg-black/30 hover:border-white/20'}`}
  >
    <span className="min-w-0">
      <span className="block text-[11px] font-extrabold text-white">{title}</span>
      <span className="block text-[9px] text-gray-500 mt-0.5">{desc}</span>
    </span>
    <span className={`shrink-0 w-9 h-5 rounded-full border relative transition-colors ${checked ? (danger ? 'bg-amber-500/70 border-amber-400/60' : 'bg-red-500/70 border-red-400/60') : 'bg-white/10 border-white/15'}`}>
      <span className={`absolute top-[2px] w-3.5 h-3.5 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-[2px]'}`} />
    </span>
  </button>
);

const OzetSatiri: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className="flex items-center justify-between gap-2 text-[11px]">
    <span className="text-gray-500">{label}</span>
    <span className={`text-right font-mono ${strong ? 'text-[#39FF14] font-extrabold' : 'text-gray-200 font-bold'}`}>{value}</span>
  </div>
);
