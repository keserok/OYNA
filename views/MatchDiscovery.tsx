import React, { useState, useMemo, useEffect } from 'react';
import {
  MapPin, Clock, Circle,
  ChevronRight, KeyRound, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchListing } from '../types';
import { useAppStore } from '../store';
import { supabase } from '../supabaseClient';
import { subscribeToOpenMatches, fetchNearbyMatches, resolvePrivateMatch, toPrivateMatchErrorMessage, getMatchDetails } from '../services/matchService';
import { EmptyState } from '../components/common/StatusState';
import { FilterDropdown } from '../components/ui/FilterDropdown';
import {
  deriveDiscoveryFilterOptions, roleHasOpenSlot, hasOpenSlot, matchInBudget,
  ROLE_LABEL_MAP, BUDGET_BUCKETS,
} from '../utils/discoveryFilterOptions';
import {
  buildDayStrip, matchOnDay, startOfDayMs, formatDayLabel, isGeceMaci,
} from '../utils/discoveryDays';
import { matchStartDayMs } from '../shared/matchTiming';
import DayStrip from '../components/discovery/DayStrip';
import DiscoveryFilterSheet, {
  EMPTY_FILTERS, countActiveFilters, type DiscoveryFilters,
} from '../components/discovery/DiscoveryFilterSheet';
import { PLAY_STYLE_META } from './onboarding/onboardingShared';
import { formatMatchDuration, realMatchMinutes, matchStartMs } from '../shared/matchTiming';
import { trUpper } from '../utils/trUpper';
import { formatTRYShort } from '../utils/formatTRY';

// Normalize mentalite ('Ciddi'|'Taktiksel'|'Rahat') → PLAY_STYLE_META anahtarı.
const MENTALITY_KEY = { Ciddi: 'ciddi', Taktiksel: 'taktiksel', Rahat: 'rahat' } as const;

interface MatchDiscoveryProps {
  onSelect: (match: MatchListing) => void;
}

const MatchDiscovery: React.FC<MatchDiscoveryProps> = ({ onSelect }) => {
  const {
    adminMatches,
    navigateTo,
    userLocation,
    selectedRegions,
    searchRadius,
    setSearchRadius
  } = useAppStore();

  // ── Özel maç (kodla katılım) ──
  const [showPrivateModal, setShowPrivateModal] = useState(false);
  const [privateCode, setPrivateCode] = useState('');
  const [privateLoading, setPrivateLoading] = useState(false);
  const [privateError, setPrivateError] = useState<string | null>(null);

  const handleJoinPrivate = async () => {
    const code = privateCode.trim().toUpperCase();
    if (code.length < 4) {
      setPrivateError('Kod en az 4 karakter olmalı.');
      return;
    }
    setPrivateLoading(true);
    setPrivateError(null);
    try {
      // 1) Önce özel MAÇ kodu dene
      try {
        const resolved = await resolvePrivateMatch(code);
        const match = await getMatchDetails(resolved.matchId);
        if (!match) throw new Error('NOT_FOUND');
        setShowPrivateModal(false);
        setPrivateCode('');
        onSelect(match);
        return;
      } catch (matchErr) {
        // 2) Özel maç değilse: SLOT devralma kodu dene (player_claim_slot_code)
        const { data, error } = await supabase.rpc('player_claim_slot_code', { p_code: code });
        if (error) throw matchErr; // ikisi de değilse özgün maç hatasını göster
        const matchId = (data as any)?.match_id;
        const claimed = matchId ? await getMatchDetails(matchId) : null;
        if (!claimed) throw new Error('NOT_FOUND');
        setShowPrivateModal(false);
        setPrivateCode('');
        onSelect(claimed);
      }
    } catch (err) {
      console.error('Kod çözülemedi:', err);
      setPrivateError(toPrivateMatchErrorMessage(err));
    } finally {
      setPrivateLoading(false);
    }
  };

  const [showWizard, setShowWizard] = useState(false);
  // Format/Mentalite/Pozisyon dropdown'ları: aynı anda en fazla biri açık.
  const [openDropdown, setOpenDropdown] = useState<'format' | 'mentality' | 'role' | null>(null);
  // Gün seçici: açılışta İÇİNDE BULUNULAN GÜN seçili. null = tüm günler.
  const [selectedDay, setSelectedDay] = useState<number | null>(() => startOfDayMs(new Date()));
  const [dna, setDna] = useState<DiscoveryFilters>(EMPTY_FILTERS);

  const [nearbyMatches, setNearbyMatches] = useState<any[]>([]);

  useEffect(() => {
    // Çoklu bölge: her seçili bölgenin merkezinden yakındaki maçları çek ve
    // id ile birleştir (kullanıcı seçtiği tüm bölgelerdeki maçları görsün).
    // Seçili bölge yoksa GPS konumuna göre tekil davranışa döner.
    const centers = (
      selectedRegions.length > 0
        ? selectedRegions.map((r) => r.coordinates).filter(Boolean)
        : userLocation ? [userLocation] : []
    ) as { lat: number; lng: number }[];

    if (centers.length === 0) {
      setNearbyMatches([]);
      return;
    }

    let cancelled = false;
    // [P-7 / M-20] Yarıçap kaydırıcısı her oynatıldığında bu efekt tetikleniyor
    // ve bölge başına 1 RPC atıyordu (3 bölge = 3 sorgu, her piksel hareketinde).
    // 300 ms gecikme ile kullanıcı kaydırmayı bitirene kadar bekleniyor.
    const timer = setTimeout(() => {
    Promise.all(centers.map((c) => fetchNearbyMatches(c.lat, c.lng, searchRadius))).then((perCenter) => {
      if (cancelled) return;
      // get_nearby_matches HAM matches satırı döndürür (SETOF matches); satırı
      // olduğu gibi yay ki kart tüm alanları bulsun. id ile tekilleştir.
      const byId = new Map<string, any>();
      perCenter.flat().forEach((m: any) => {
        if (!m) return;
        const id = m.id ?? `${m.location ?? ''}-${m.date ?? ''}-${m.time ?? ''}`;
        if (!byId.has(id)) {
          byId.set(id, { ...m, title: m.title || `${m.location || 'Maç'}`, distance: m.distance_meters ?? m.distance });
        }
      });
      setNearbyMatches(Array.from(byId.values()));
    });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [userLocation, selectedRegions, searchRadius]);

  const enhancedMatches = useMemo(() => {
    const hasScope = selectedRegions.length > 0 || !!userLocation;
    const sourceMatches = (hasScope && nearbyMatches.length > 0) ? nearbyMatches : adminMatches;
    // Sadece oynanabilir maçları göster — DRAFT/CANCELLED/COMPLETED gizle.
    // Özel maçlar (PRIVATE) vitrinde GÖRÜNMEZ; yalnız kodla erişilir.
    const activeMatches = sourceMatches.filter(
      m => (!m.status || m.status === 'OPEN' || m.status === 'ACTIVE' || m.status === 'LIVE') && m.visibility !== 'PRIVATE'
    );
    return activeMatches.map((m, i) => {
      // Demo price adjustment for index 2 if not set, else keep DB price
      const price = m.price !== undefined ? m.price : (i === 2 ? 0 : 200);
      // Difficulty DB'de Türkçe zorluk (Kolay/Orta/Zor) ya da mentalite
      // (Ciddi/Taktiksel/Rahat) olarak gelebilir. Tek bir mentalite uzayına
      // normalize et ki hem kartta görünen rozet hem de MENTALİTE filtresi
      // tutarlı ve doğru çalışsın.
      const diffStr = (m.difficulty || '').toLowerCase().trim();
      let normalizedMentality: 'Ciddi' | 'Taktiksel' | 'Rahat';
      if (diffStr.includes('ciddi') || diffStr.includes('zor') || diffStr === 'hard') {
        normalizedMentality = 'Ciddi';
      } else if (diffStr.includes('taktik') || diffStr.includes('orta') || diffStr === 'medium') {
        normalizedMentality = 'Taktiksel';
      } else if (diffStr.includes('rahat') || diffStr.includes('kolay') || diffStr === 'easy') {
        normalizedMentality = 'Rahat';
      } else {
        normalizedMentality = 'Taktiksel';
      }
      // Mentalite kimliği TEK KAYNAKTAN (PLAY_STYLE_META) — altı ayrı renk
      // kopyası vardı ve birbirinden sapmıştı (BULGU-006 sınıfı drift).
      const mentalityMeta = PLAY_STYLE_META[MENTALITY_KEY[normalizedMentality]];
      const matchMentality = mentalityMeta.label.toLocaleUpperCase('tr-TR');
      const mentalityColor = mentalityMeta.color;

      const format = m.format || '7v7';
      // MAÇ SÜRESİ — GERÇEK VERİ (matches.duration_minutes, tarifeden türetilir).
      // Eski kod burada serbest metin `duration`a düşüyor, o da yoksa '90 Dakika'
      // UYDURUYORDU: 60 dakikalık maçlar kartta 90 görünüyordu. Artık yedek YOK —
      // veri yoksa etiket hiç çizilmez (yanlış sayı göstermekten iyidir).
      const durationLabel = formatMatchDuration(m);
      const gender = m.gender || 'Karma';
      const ageGroup = m.ageGroup || 'Tümü';
      
      // TEK KART DİLİ: pozisyon/rol çorbası ("8P", "2 STP", "pozisyon pozisyon")
      // YOK — aranan oyuncu sayısı İKİ TARAFIN açık slotlarından hesaplanır.
      const openCount =
        ((m.slots || []).filter((sl: any) => sl?.status === 'OPEN').length) +
        ((m.awaySlots || []).filter((sl: any) => sl?.status === 'OPEN').length);

      return {
        ...m,
        date: m.date || '18.05.2026',
        time: m.time || '22:00 - 23:00',
        openCount,
        price,
        difficulty: normalizedMentality,
        matchMentality,
        mentalityColor,
        format,
        durationLabel,
        gender,
        ageGroup,
        distance: m.distance
      };
    });
  }, [adminMatches, nearbyMatches, userLocation, selectedRegions]);

  const activeFilterCount = useMemo(() => countActiveFilters(dna), [dna]);
  const isFilterActive = activeFilterCount > 0;

  // Dropdown seçenekleri: yalnız listelenen açık maçlarda fiilen bulunan değerler.
  // matchingMatches değil enhancedMatches üzerinden türetilir ki bir seçim diğer
  // dropdown'ların seçenek kümesini çökertmesin.
  const filterOptions = useMemo(() => deriveDiscoveryFilterOptions(enhancedMatches), [enhancedMatches]);

  // Realtime güncellemeyle seçili değer seçeneklerden düşerse sessizce Tümü'ye dön;
  // açık panelin listesi boşaldıysa paneli kapat.
  useEffect(() => {
    setDna(prev => {
      const next = { ...prev };
      let changed = false;
      if (prev.format && !filterOptions.formats.some(f => f.toLowerCase() === prev.format.toLowerCase())) {
        next.format = ''; changed = true;
      }
      if (prev.mentality && !filterOptions.mentalities.some(v => v.toLowerCase() === prev.mentality.toLowerCase())) {
        next.mentality = ''; changed = true;
      }
      if (prev.role && !filterOptions.roles.includes(prev.role)) {
        next.role = ''; changed = true;
      }
      if (prev.gender && !filterOptions.genders.some(g => g.toLowerCase() === prev.gender.toLowerCase())) {
        next.gender = ''; changed = true;
      }
      if (prev.age && !filterOptions.ageGroups.some(a => a.toLowerCase() === prev.age.toLowerCase())) {
        next.age = ''; changed = true;
      }
      if (prev.duration !== null && !filterOptions.durations.includes(prev.duration)) {
        next.duration = null; changed = true;
      }
      if (prev.budget && !filterOptions.budgets.some(b => b.id === prev.budget)) {
        next.budget = ''; changed = true;
      }
      // Rahat maç pozisyonsuzdur — mentalite Rahat'a dönerse rol filtresi anlamsızlaşır.
      if (prev.mentality === 'Rahat' && prev.role) {
        next.role = ''; changed = true;
      }
      return changed ? next : prev;
    });
    setOpenDropdown(prev => {
      if (!prev) return prev;
      const list = prev === 'format' ? filterOptions.formats : prev === 'mentality' ? filterOptions.mentalities : filterOptions.roles;
      return list.length === 0 ? null : prev;
    });
  }, [filterOptions]);

  // TEK FİLTRE KAPISI — panelde ve liste üstündeki dropdown'larda seçilen her
  // kısıt buradan geçer. Her kural GERÇEK veritabanı alanını okur.
  const checkMatchFilters = (match: any) => {
    if (dna.format && match.format && match.format.toLowerCase() !== dna.format.toLowerCase()) {
      return false;
    }
    if (dna.budget && !matchInBudget(match, dna.budget)) {
      return false;
    }
    // Süre TEK KAYNAKTAN okunur: matches.duration_minutes. Eskiden serbest metin
    // `duration` ile harf harf karşılaştırılıyordu — '90 dakika' ile '90 Dakika'
    // ayrışabiliyor, metni boş olan maç ise filtreyi sessizce GEÇİYORDU.
    if (dna.duration !== null && realMatchMinutes(match) !== dna.duration) {
      return false;
    }
    if (dna.age && (match.ageGroup ?? '').toLowerCase() !== dna.age.toLowerCase()) {
      return false;
    }
    if (dna.gender && (match.gender ?? '').toLowerCase() !== dna.gender.toLowerCase()) {
      return false;
    }
    if (dna.role && !roleHasOpenSlot(match, dna.role)) {
      return false;
    }
    if (dna.mentality) {
      if (!match.difficulty || match.difficulty.toLowerCase() !== dna.mentality.toLowerCase()) {
        return false;
      }
    }
    if (dna.onlyOpen && !hasOpenSlot(match)) {
      return false;
    }
    return true;
  };

  // Gün şeridi sayıları: gün DIŞINDAKİ tüm filtreler uygulanmış hâliyle sayılır —
  // "bu filtrelerle hangi günde maç var" sorusunun doğru cevabı budur.
  const dayStrip = useMemo(
    () => buildDayStrip(enhancedMatches.filter(checkMatchFilters)),
    [enhancedMatches, dna],
  );

  const { matchingMatches, otherMatches, dayScopedCount } = useMemo(() => {
    // Gün, yarıçap gibi bir KAPSAM kısıtıdır: hem eşleşen hem "diğer" listesi
    // seçili güne göre daraltılır, yoksa çipte 5 Ağustos yazarken listede
    // başka günün maçları görünürdü.
    const scoped = enhancedMatches.filter((m) => matchOnDay(m, selectedDay));
    // Gün içinde doğal sıra saat sırasıdır; saati çözülemeyen maç sona düşer.
    const byTime = (a: any, b: any) =>
      (matchStartMs(a) ?? Infinity) - (matchStartMs(b) ?? Infinity);
    const sorted = [...scoped].sort(byTime);

    if (!isFilterActive) {
      return { matchingMatches: [], otherMatches: sorted, dayScopedCount: sorted.length };
    }
    const matching = sorted.filter(checkMatchFilters);
    const other = sorted.filter((m) => !checkMatchFilters(m));
    return { matchingMatches: matching, otherMatches: other, dayScopedCount: sorted.length };
  }, [enhancedMatches, isFilterActive, dna, selectedDay]);

  const handleClearFilters = () => setDna(EMPTY_FILTERS);

  const wizardCount = isFilterActive ? matchingMatches.length : dayScopedCount;
  const dayLabel = selectedDay === null ? null : formatDayLabel(selectedDay);
  // Liste başlığı: hangi gün + hangi yarıçap içinde olduğumuzu tek satırda söyler.
  const scopeLabel = [dayLabel, userLocation || selectedRegions.length > 0 ? `${searchRadius} KM İÇİNDE` : null]
    .filter(Boolean).join(' · ') || 'TÜM MAÇLAR';

  return (
    <div className="min-h-screen max-h-screen bg-[#0A0E14] flex flex-col relative overflow-hidden font-sans selection:bg-primary selection:text-on-primary">
      
      {/* ── ARKA PLAN ── */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 mix-blend-overlay pointer-events-none" />

      {/* ═══════════════════════════════════════════════════════════════════════
          TEK SAYFALIK OYUN DNA PANELİ
      ═══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showWizard && (
          <DiscoveryFilterSheet
            filters={dna}
            setFilters={setDna}
            options={filterOptions}
            onClose={() => setShowWizard(false)}
            onClear={handleClearFilters}
            resultCount={wizardCount}
            activeCount={activeFilterCount}
            searchRadius={searchRadius}
            setSearchRadius={setSearchRadius}
            selectedRegions={selectedRegions}
            hasGps={!!userLocation}
          />
        )}
      </AnimatePresence>


      {/* ═══════════════════════════════════════════════════════════════════════
          MAÇ LİSTESİ (POSTER-CARD TASARIMI)
      ═══════════════════════════════════════════════════════════════════════ */}
      {!showWizard && (
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
          className="absolute inset-0 flex flex-col z-40 bg-[#0A0E14]"
        >
          {/* HEADER
              ZEMİN YOK (bilinçli): burada `bg-black/40 + backdrop-blur` vardı;
              %40 siyah, sayfanın #0A0E14 zeminini DAHA KOYU bir banda çeviriyordu
              ve ekranın üstü ayrı bir blok gibi duruyordu. Başlık, kayan listenin
              ÜSTÜNDE değil YANINDA duruyor (ikisi de aynı dikey yığının çocuğu),
              yani içerik altından geçmiyor — opak zemine ve blur'a ihtiyacı yok.
              Kaldırılınca filtre satırı, gün şeridi ve liste ile birebir aynı
              renge oturur. Alttaki ince ayraç çizgisi kaldı. */}
          <header className="relative z-50 border-b border-white/5 px-5 pt-safe pb-4">
            <div className="flex items-center justify-between">
              {/* IP-14: sekme kökü — geri oku kaldırıldı. */}
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-xl font-extrabold text-white italic uppercase tracking-tight leading-none drop-shadow-lg">Top Oyna</h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isFilterActive && (
                  <button 
                    onClick={handleClearFilters} 
                    className="px-3.5 py-2 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 transition-all text-[0.625rem] font-extrabold uppercase tracking-widest"
                  >
                    Temizle
                  </button>
                )}
                <button
                  onClick={() => { setShowPrivateModal(true); setPrivateError(null); setPrivateCode(''); }}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-[#FACC15]/[0.06] backdrop-blur-md border border-[#FACC15]/25 text-[#FACC15] hover:bg-[#FACC15]/10 transition-all"
                  title="Özel maça kodla katıl"
                >
                  <KeyRound size={13} />
                  <span className="text-[0.625rem] font-extrabold uppercase tracking-widest drop-shadow-md">Kodla Katıl</span>
                </button>
                <button onClick={() => { setOpenDropdown(null); setShowWizard(true); }} className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/[0.03] backdrop-blur-md border border-white/10 text-white hover:bg-white/10 transition-all">
                  <span className="text-[0.625rem] font-extrabold uppercase tracking-widest drop-shadow-md">Filtre</span>
                  {isFilterActive && (
                    <span className="w-2 h-2 bg-[#FACC15] rounded-full shadow-[0_0_10px_rgba(250,204,21,0.8)]" />
                  )}
                </button>
              </div>
            </div>
          </header>

          {/* ── KALDIRILABİLİR FİLTRE ÇİPLERİ ── */}
          {isFilterActive && (
            <div className="flex overflow-x-auto no-scrollbar gap-2 px-5 py-2.5 border-b border-white/5 bg-black/20 backdrop-blur-md shrink-0">
              {dna.format && (
                <button onClick={() => setDna({ ...dna, format: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[0.625rem] font-extrabold uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.format} <span className="text-ink-4 text-[0.6875rem] leading-none">✕</span>
                </button>
              )}
              {dna.mentality && (
                <button onClick={() => setDna({ ...dna, mentality: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[0.625rem] font-extrabold uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.mentality.toLocaleUpperCase('tr-TR')} <span className="text-ink-4 text-[0.6875rem] leading-none">✕</span>
                </button>
              )}
              {dna.role && (
                <button onClick={() => setDna({ ...dna, role: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[0.625rem] font-extrabold uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {ROLE_LABEL_MAP[dna.role] || dna.role} <span className="text-ink-4 text-[0.6875rem] leading-none">✕</span>
                </button>
              )}
              {dna.budget && (
                <button onClick={() => setDna({ ...dna, budget: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[0.625rem] font-extrabold uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {BUDGET_BUCKETS.find(b => b.id === dna.budget)?.label ?? dna.budget} <span className="text-ink-4 text-[0.6875rem] leading-none">✕</span>
                </button>
              )}
              {dna.duration !== null && (
                <button onClick={() => setDna({ ...dna, duration: null })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[0.625rem] font-extrabold uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.duration} DAKİKA <span className="text-ink-4 text-[0.6875rem] leading-none">✕</span>
                </button>
              )}
              {dna.gender && (
                <button onClick={() => setDna({ ...dna, gender: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[0.625rem] font-extrabold uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.gender.toLocaleUpperCase('tr-TR')} <span className="text-ink-4 text-[0.6875rem] leading-none">✕</span>
                </button>
              )}
              {dna.age && (
                <button onClick={() => setDna({ ...dna, age: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[0.625rem] font-extrabold uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.age} YAŞ <span className="text-ink-4 text-[0.6875rem] leading-none">✕</span>
                </button>
              )}
              {dna.onlyOpen && (
                <button onClick={() => setDna({ ...dna, onlyOpen: false })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[0.625rem] font-extrabold uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  YERİ BOŞ <span className="text-ink-4 text-[0.6875rem] leading-none">✕</span>
                </button>
              )}
            </div>
          )}

          {/* Dropdown açıkken dışarı-tıkla-kapat katmanı: liste (z-10) üstünde,
              dropdown satırı (z-30) ve sticky başlık (z-50) altında. */}
          {openDropdown && (
            <div className="absolute inset-0 z-20" onClick={() => setOpenDropdown(null)} aria-hidden="true" />
          )}

          {/* ── FORMAT · MENTALİTE · POZİSYON — üç simetrik dropdown, tek satır ──
              overflow-* YOK: paneller satırın altına doğru (yukarıdan aşağıya) açılır.

              ZEMİN YOK (bilinçli): bu satır sayfanın koyu lacivert bir tonuyla
              (#0D121F/40 + blur) boyanıyordu; ekranın geri kalanı düz #0A0E14
              olduğu için üst bölge gözle görülür biçimde AYRI bir blok gibi
              duruyordu. Satır sabit (sticky/fixed) değil, akışta duruyor —
              altındaki liste onun altından geçmez, dolayısıyla opak bir zemine
              hiç ihtiyacı yok. Zemin kaldırılınca sayfa rengiyle birebir aynı
              olur. Alttaki ince ayraç çizgisi KALDI: filtreleri listeden ayıran
              tek işaret odur. */}
          <div className="relative shrink-0 z-30 border-b border-white/5">
            <div className="flex gap-2 px-5 py-3">
              <FilterDropdown
                label="FORMAT"
                value={dna.format}
                options={filterOptions.formats.map(f => ({ value: f, label: f }))}
                onChange={(v) => setDna({ ...dna, format: v })}
                open={openDropdown === 'format'}
                onOpenChange={(o) => setOpenDropdown(o ? 'format' : null)}
                disabled={filterOptions.formats.length === 0}
              />
              <FilterDropdown
                label="MENTALİTE"
                value={dna.mentality}
                options={filterOptions.mentalities.map(v => ({ value: v, label: v.toLocaleUpperCase('tr-TR') }))}
                onChange={(v) => setDna({ ...dna, mentality: v })}
                open={openDropdown === 'mentality'}
                onOpenChange={(o) => setOpenDropdown(o ? 'mentality' : null)}
                disabled={filterOptions.mentalities.length === 0}
              />
              <FilterDropdown
                label="POZİSYON"
                value={dna.role}
                options={filterOptions.roles.map(r => ({ value: r, label: r, panelLabel: `${r} — ${ROLE_LABEL_MAP[r]}` }))}
                onChange={(v) => setDna({ ...dna, role: v })}
                open={openDropdown === 'role'}
                onOpenChange={(o) => setOpenDropdown(o ? 'role' : null)}
                disabled={filterOptions.roles.length === 0 || dna.mentality === 'Rahat'}
              />
            </div>
            {enhancedMatches.length === 0 && (
              <p className="px-5 pb-2.5 -mt-1 text-[0.625rem] font-bold uppercase tracking-widest text-ink-4">
                Şu an açık maç yok — filtreler maç geldiğinde aktifleşir.
              </p>
            )}
          </div>

          {/* ── GÜN ŞERİDİ — kaydırılabilir gün seçici (açılışta bugün seçili) ──
              Zemin, üstteki filtre satırıyla aynı gerekçeyle kaldırıldı. */}
          <div className="shrink-0 border-b border-white/5">
            <DayStrip
              days={dayStrip}
              value={selectedDay}
              onChange={setSelectedDay}
              totalCount={dayStrip.reduce((n, d) => n + d.count, 0)}
            />
          </div>

          {/* MATCH CARDS (POSTERS) — ekran kendi içinde kaydırır, dıştaki
              dolgu buraya işlemez; son kart alt menünün altında kalmasın diye
              bar payını liste kendisi ayırır (pb-safe-nav: index.css). */}
          <div className="flex-1 overflow-y-auto px-4 pt-6 pb-safe-nav space-y-6 relative z-10 custom-scrollbar">
            <>
                {isFilterActive && (
                  <>
                    {/* Filtreye Uygun Maçlar Section */}
                    <div>
                      <h2 className="text-sm font-extrabold italic uppercase tracking-widest text-[#39FF14] mb-4 flex items-center gap-2 drop-shadow-[0_0_8px_rgba(57,255,20,0.4)]">
                        <span className="inline-block w-1.5 h-3 bg-[#39FF14] rounded-sm" />
                        Filtreye Uygun Maçlar
                      </h2>
                      
                      {matchingMatches.length === 0 ? (
                        <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 backdrop-blur-md rounded-[24px] p-6 flex flex-col items-center justify-center text-center gap-3 shadow-[0_0_15px_rgba(239,68,68,0.1)] mb-8">
                          <p className="text-white font-extrabold italic uppercase tracking-tighter text-base">Filtrelere Uygun Maç Bulunamadı</p>
                          <p className="text-white/60 text-[0.625rem] font-bold uppercase tracking-wider max-w-sm">
                            {dayLabel
                              ? `${dayLabel} için seçtiğin kriterlere uyan maç yok. Başka bir gün seçebilir ya da filtrelerini gevşetebilirsin.`
                              : 'Seçtiğin kriterlere uyan aktif bir maç bulunmuyor. Diğer maçları inceleyebilir ya da filtrelerini sıfırlayabilirsin.'}
                          </p>
                          <div className="flex gap-2 flex-wrap justify-center">
                            {selectedDay !== null && (
                              <button
                                onClick={() => setSelectedDay(null)}
                                className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-[0.625rem] font-extrabold uppercase tracking-widest text-white transition-all active:scale-95"
                              >
                                Tüm Günler
                              </button>
                            )}
                            <button
                              onClick={handleClearFilters}
                              className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-[0.625rem] font-extrabold uppercase tracking-widest text-white transition-all active:scale-95"
                            >
                              Filtreleri Temizle
                            </button>
                            <button
                              onClick={() => {
                                if (userLocation) {
                                  setSearchRadius(Math.min(searchRadius + 5, 50));
                                } else {
                                  setShowWizard(true);
                                }
                              }}
                              className="px-5 py-2.5 rounded-full bg-[#39FF14]/10 hover:bg-[#39FF14]/20 border border-[#39FF14]/40 text-[0.625rem] font-extrabold uppercase tracking-widest text-[#39FF14] transition-all active:scale-95"
                            >
                              Çapı Genişlet
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-6 mb-8">
                          {matchingMatches.map((match, index) => (
                            <MatchCard key={match.id} match={match} index={index} onSelect={onSelect} dna={dna} geceIsareti={isGeceMaci(match, selectedDay)} />
                          ))}
                        </div>
                      )}
                    </div>
     
                    {/* Tüm Diğer Maçlar Section */}
                    {otherMatches.length > 0 && (
                      <div>
                        <h2 className="text-sm font-extrabold italic uppercase tracking-widest text-ink-4 mb-4 flex items-center gap-2">
                          <span className="inline-block w-1.5 h-3 bg-white/20 rounded-sm" />
                          {dayLabel ? `${dayLabel} · DİĞER MAÇLAR` : 'DİĞER MAÇLAR'}
                        </h2>
                        <div className="space-y-6">
                          {otherMatches.map((match, index) => (
                            <MatchCard key={match.id} match={match} index={index + matchingMatches.length} onSelect={onSelect} dna={dna} geceIsareti={isGeceMaci(match, selectedDay)} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
     
                {!isFilterActive && (
                  <div className="space-y-6">
                    <h2 className="text-sm font-extrabold italic uppercase tracking-widest text-[#39FF14] mb-4 flex items-center gap-2 drop-shadow-[0_0_8px_rgba(57,255,20,0.4)]">
                      <MapPin size={16} />
                      {scopeLabel}
                    </h2>
                    {otherMatches.length === 0 ? (
                      <EmptyState
                        title={dayLabel ? `${dayLabel} İçin Maç Yok` : 'Aktif Maç Bulunamadı'}
                        message={dayLabel
                          ? 'Bu güne açık maç yok. Şeritten başka bir gün seçebilir ya da kendi maçını kurabilirsin.'
                          : 'Bu bölgede şu an açık bir maç yok. Sen kurabilirsin.'}
                        actions={selectedDay !== null
                          ? [
                              { label: 'Tüm Günler', onClick: () => setSelectedDay(null) },
                              { label: 'Maç Kur', onClick: () => navigateTo('MATCH_CREATE') },
                            ]
                          : [
                              { label: 'Maç Kur', onClick: () => navigateTo('MATCH_CREATE') },
                              { label: 'Saha Kirala', onClick: () => navigateTo('PITCH_DISCOVERY') },
                            ]}
                      />
                    ) : (
                      otherMatches.map((match, index) => (
                        <MatchCard key={match.id} match={match} index={index} onSelect={onSelect} dna={dna} geceIsareti={isGeceMaci(match, selectedDay)} />
                      ))
                    )}
                  </div>
                )}
              </>
          </div>
        </motion.div>
      )}

      {/* ── ÖZEL MAÇ: KODLA KATILIM MODALI ── */}
      <AnimatePresence>
        {showPrivateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => { if (!privateLoading) { setShowPrivateModal(false); setPrivateError(null); setPrivateCode(''); } }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#161B22] w-full max-w-sm rounded-[32px] border border-[#FACC15]/20 p-7 text-center"
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-[#FACC15]/10 border-2 border-[#FACC15]/40 flex items-center justify-center mb-5">
                <KeyRound size={28} className="text-[#FACC15]" />
              </div>
              <h2 className="text-xl font-extrabold text-white mb-2 italic uppercase tracking-tight">Özel Maça Katıl</h2>
              <p className="text-xs text-gray-400 leading-relaxed mb-5">
                Sana iletilen <span className="text-[#FACC15] font-bold">özel maç kodunu</span> gir. Sadece davetlilerin görebildiği maçlara böyle katılırsın.
              </p>

              <input
                autoFocus
                value={privateCode}
                onChange={(e) => { setPrivateCode(e.target.value.toUpperCase().slice(0, 8)); setPrivateError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !privateLoading) handleJoinPrivate(); }}
                placeholder="ÖRN. A1B2C3"
                maxLength={8}
                className="w-full bg-black/40 border border-white/15 rounded-2xl px-4 py-4 text-center text-2xl font-extrabold tracking-[0.4em] text-white placeholder:text-ink-4 placeholder:tracking-widest placeholder:text-base focus:border-[#FACC15]/50 focus:outline-none transition-all uppercase"
              />

              {privateError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-500/20 rounded-xl px-3 py-2 mt-4">{privateError}</p>
              )}

              <div className="flex flex-col gap-3 mt-6">
                <button
                  onClick={handleJoinPrivate}
                  disabled={privateLoading || privateCode.trim().length < 4}
                  className={`w-full py-3.5 bg-primary text-on-primary font-extrabold rounded-2xl text-sm uppercase tracking-wide transition-transform flex items-center justify-center gap-2 ${privateLoading || privateCode.trim().length < 4 ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
                >
                  {privateLoading ? <><Loader2 size={16} className="animate-spin" /> Aranıyor…</> : 'Maça Git'}
                </button>
                <button
                  onClick={() => { if (!privateLoading) { setShowPrivateModal(false); setPrivateError(null); setPrivateCode(''); } }}
                  className="w-full py-3 text-gray-400 font-bold text-sm hover:text-white transition-colors"
                >
                  Vazgeç
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

const MatchCard: React.FC<{
  match: any;
  index: number;
  onSelect: (match: MatchListing) => void;
  dna: any;
  /** Seçili günün gecesine taşan maç (ör. Cuma seçili, maç 00:30). */
  geceIsareti?: boolean;
}> = ({ match, index, onSelect, dna, geceIsareti }) => {
  const roleMap: Record<string, string> = { 'HÜC': 'HÜCUM', 'ORT': 'ORTA SAHA', 'SAV': 'SAVUNMA', 'KL': 'KALECİ' };
  const myRole = roleMap[dna.role];
  const glowColor = match.mentalityColor;

  // Poster: normalde maçın sahasının fotoğrafı otomatik dolar. Görsel yoksa
  // ya da URL kırıksa boş kare yerine sahanın rengiyle şık bir zemin göster.
  const [imgBroken, setImgBroken] = useState(false);
  useEffect(() => { setImgBroken(false); }, [match.image]);
  const hasPoster = !!match.image && !imgBroken;
  
  // ── Kontenjan hesabı (gerçek slot verisi) ──
  const homeSlots: any[] = match.slots || [];
  const awaySlotData: any[] = match.awaySlots || [];
  const totalSlots = homeSlots.length + awaySlotData.length;
  const slotFilled =
    homeSlots.filter((s: any) => s.status === 'TAKEN').length +
    awaySlotData.filter((s: any) => s.status === 'TAKEN').length;
  const slotRemaining = totalSlots - slotFilled;
  const fillPct = totalSlots > 0 ? Math.round((slotFilled / totalSlots) * 100) : 0;

  // Maça kalan süre ticking timer state & effect
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isUrgentTime, setIsUrgentTime] = useState(false);

  useEffect(() => {
    // Geri sayım da gün filtresiyle AYNI tarihi çözer (shared/matchTiming).
    // Eskiden burada ayrı bir metin çözücü vardı ve veritabanının ISO tarihini
    // ('2026-08-01') tanımadığı için her maçı BUGÜN sanıyordu.
    const targetMs = matchStartMs(match);
    if (targetMs === null) {
      setTimeLeft('');
      setIsUrgentTime(false);
      return;
    }

    const updateTimer = () => {
      const now = new Date().getTime();
      const diff = targetMs - now;

      setIsUrgentTime(diff > 0 && diff < 2 * 60 * 60 * 1000);
      if (diff <= 0) {
        setTimeLeft('BAŞLADI');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      const pad = (n: number) => String(n).padStart(2, '0');
      
      if (hours > 24) {
        const days = Math.floor(hours / 24);
        setTimeLeft(`${days} GÜN KALDI`);
      } else {
        setTimeLeft(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
      }
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [match.date, match.time]);

  const urgencyType: 'son1kisi' | 'sonDakika' | null =
    (slotRemaining <= 1 && slotRemaining > 0) ? 'son1kisi' : (isUrgentTime ? 'sonDakika' : null);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: index * 0.05, type: 'spring', damping: 25 }}
      onClick={() => onSelect(match)}
      className="relative w-full min-h-[400px] flex flex-col rounded-[32px] overflow-hidden cursor-pointer group shadow-2xl border border-white/5"
    >
      {/* Mesafe çipi — YALNIZ gerçek veriyle (get_nearby_matches distance_meters).
          Koordinatsız/GPS'siz yolda hiç çizilmez; sahte '1.5 km' basılmaz. */}
      {match.difficulty === 'Rahat' && Number.isFinite(Number(match.distance)) && Number(match.distance) > 0 && (
        <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10">
          <MapPin size={11} className="text-[#39FF14]" />
          <span className="font-numeric text-[0.6875rem] font-semibold text-[#D1D5DB]">
            {(Number(match.distance) / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km
          </span>
        </div>
      )}
      {/* Arka Plan Posteri (saha fotoğrafı) — yoksa sahanın rengiyle zemin */}
      {hasPoster ? (
        <img src={match.image} onError={() => setImgBroken(true)} className="absolute inset-0 w-full h-full object-cover transition-transform duration-[2s] ease-out group-hover:scale-110" alt={match.location} referrerPolicy="no-referrer" />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${glowColor}55 0%, #0A0E14 60%)` }} />
      )}
      
      {/* Renk Tonu ve Güçlü Karartma (Gradient) */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-transparent" />
      <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ background: `radial-gradient(circle at center, transparent 0%, ${glowColor} 100%)` }} />
      
      {/* Karizma Sınır Çizgisi (İç Glow) */}
      <div className="absolute inset-0 border-[1.5px] rounded-[32px] pointer-events-none transition-all duration-500" style={{ borderColor: `${glowColor}30`, boxShadow: `inset 0 0 30px ${glowColor}15` }} />
 
      {/* ── İÇERİK (ESNEK DİKEY AKIŞ — mobilde bloklar üst üste binmez) ── */}
      <div className="relative z-10 flex flex-1 flex-col p-5 gap-3">

      {/* ── ÜST KISIM (SAAT & GERİ SAYIM) ── */}
      <div className="flex justify-between items-start gap-2 flex-wrap">
        {/* Dijital Saat (Sol Üst) */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 shadow-lg">
          <Clock size={12} className="text-[#39FF14]" />
          <span className="text-xs font-extrabold text-white tracking-[0.1em] drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">{match.time}</span>
        </div>
 
        {/* Maça Kalan Süre Ticking Geri Sayım (Sağ Üst) */}
        <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-black/70 backdrop-blur-md border border-[#39FF14]/30 rounded-xl shadow-[0_0_15px_rgba(57,255,20,0.1)]">
          <span className="w-1.5 h-1.5 bg-[#39FF14] rounded-full animate-ping shrink-0" />
          <span className="text-[0.6875rem] font-extrabold tracking-widest text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]">
            {timeLeft}
          </span>
        </div>
      </div>

      {/* ── ACİLİYET ROZETİ ── */}
      {urgencyType && (
        <div className="flex justify-center">
          <div className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-[0.625rem] font-extrabold tracking-[0.18em] uppercase border"
            style={{
              borderColor: urgencyType === 'son1kisi' ? '#ef4444' : '#FACC15',
              color: urgencyType === 'son1kisi' ? '#ef4444' : '#FACC15',
              boxShadow: `0 0 10px ${urgencyType === 'son1kisi' ? 'rgba(239,68,68,0.35)' : 'rgba(250,204,21,0.35)'}`
            }}>
            {urgencyType === 'son1kisi' ? 'SON 1 KİŞİ' : 'SON DAKİKA'}
          </div>
        </div>
      )}

      {/* ── ARANAN OYUNCU — tek dil: iki tarafın açık slot toplamı.
           Rahat maçta kalan ≤3 ise aciliyet dili: kırmızı 'N YER KALDI' (E1). ── */}
      <div className="flex flex-col gap-2.5 items-start">
        {(() => {
          const acik = Number(match.openCount);
          const rahatAz = match.difficulty === 'Rahat' && acik > 0 && acik <= 3;
          const cizgi = rahatAz ? '#F87171' : acik > 0 ? '#39FF14' : '#FACC15';
          const metin = acik > 0
            ? (rahatAz ? `${acik} YER KALDI` : `${acik} OYUNCU ARANIYOR`)
            : 'KADRO TAMAM';
          return (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-xl border bg-black/60 border-white/10"
              style={{ borderLeft: `4px solid ${cizgi}` }}
            >
              <Circle size={12} style={{ color: cizgi }} />
              <span className="text-[0.625rem] font-extrabold uppercase tracking-widest" style={{ color: rahatAz ? '#F87171' : 'rgba(255,255,255,0.85)' }}>
                {metin}
              </span>
            </div>
          );
        })()}
      </div>
 
      {/* ── ESNEK BOŞLUK: alt bloğu aşağı iter, çakışmayı önler ── */}
      <div className="flex-1 min-h-[12px]" />

      {/* ── ALT KISIM (TESİS, TARİH, SAAT & FİYAT + KATIL AKSİYONU) ── */}
      <div className="flex flex-col justify-end">
        <div className="flex items-end justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* ── KONTENJAN GÖSTERGESİ ── */}
            {totalSlots > 0 && (
              <div className="flex items-center gap-2 mb-2">
                <div className="w-[88px] h-[3px] rounded-full bg-white/10 overflow-hidden shrink-0">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${fillPct}%`,
                      backgroundColor: slotRemaining <= 1 ? '#FACC15' : '#39FF14',
                      boxShadow: `0 0 6px ${slotRemaining <= 1 ? 'rgba(250,204,21,0.6)' : 'rgba(57,255,20,0.6)'}`
                    }} />
                </div>
                <span className="text-[0.625rem] font-extrabold uppercase tracking-wider text-white/60 drop-shadow-sm">
                  {slotFilled}/{totalSlots} OYUNCU
                </span>
              </div>
            )}

            {/* TESİS ADI (büyük) + İLÇE (küçük).
                Önceden burada `match.location` basılıyordu; o alan tesis adını
                değil İLÇEYİ taşır, bu yüzden aynı ilçedeki bütün maçlar tek tip
                görünüyordu ("Altınordu", "Altınordu"...). Oyuncu hangi tesiste
                oynayacağını listeden anlayamıyordu.
                Saha adı sunucudan `pitch_name` ile gelir (bkz. migration
                20260801134817). Gelmediği durumlar için (eski satır, konumsuz
                liste yolu) eski davranışa düşülür — kart asla boş kalmaz. */}
            {(() => {
              const sahaAdi = (match as { pitch_name?: string }).pitch_name?.trim();
              const ilce = (match as { pitch_district?: string }).pitch_district?.trim();
              const baslik = sahaAdi || match.location;
              // İlçe yalnız başlıktan FARKLIYSA gösterilir; "VIP Arena / VIP Arena"
              // gibi kendini tekrar eden satır olmaz.
              const altSatir = ilce && ilce !== baslik ? ilce : null;
              return (
                <div className="mb-2">
                  <h3 className="text-xl font-extrabold text-white italic uppercase leading-tight tracking-tighter drop-shadow-[0_4px_15px_rgba(0,0,0,1)] break-words">
                    {trUpper(baslik)}
                  </h3>
                  {altSatir && (
                    <p className="mt-0.5 text-[0.6875rem] font-bold text-white/60 uppercase tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                      {trUpper(altSatir)}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Tarih ve Saat — gün şeridiyle AYNI dil ("BUGÜN" / "1 AĞU").
                Eskiden veritabanının ham biçimi basılıyordu ("2026-08-01"),
                üstteki şerit güzel tarih gösterirken kart uyumsuz kalıyordu. */}
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              <span className="text-[0.625rem] font-extrabold text-[#FACC15] italic uppercase tracking-widest drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                {(() => {
                  const gun = matchStartDayMs(match);
                  return gun === null ? trUpper(match.date) : formatDayLabel(gun);
                })()} • {trUpper(match.time)}
              </span>
              {/* Gece maçı seçili günün ertesine taşar — kullanıcı Cuma'da
                  gördüğü maçın gece yarısını geçtiğini burada anlar. */}
              {geceIsareti && (
                <span className="px-1.5 py-0.5 rounded border border-[#8b5cf6]/40 bg-[#8b5cf6]/15 text-[0.625rem] font-extrabold uppercase tracking-widest text-[#c4b5fd]">
                  Gece
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[0.625rem] font-extrabold uppercase tracking-widest backdrop-blur-sm"
                style={{
                  border: `1px solid ${match.mentalityColor}66`,
                  backgroundColor: `${match.mentalityColor}22`,
                  color: match.mentalityColor,
                  textShadow: `0 0 6px ${match.mentalityColor}55`
                }}>
                {match.matchMentality}
              </span>
              <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[0.625rem] font-extrabold text-white/80 uppercase tracking-widest backdrop-blur-sm">
                {match.format}
              </span>
              {/* MAÇ SÜRESİ — gerçek veri (duration_minutes). Yoksa hiç çizilmez. */}
              {match.durationLabel && (
                <span className="px-2 py-0.5 rounded border border-[#39FF14]/25 bg-[#39FF14]/10 text-[0.625rem] font-extrabold text-[#39FF14] uppercase tracking-widest backdrop-blur-sm">
                  {match.durationLabel}
                </span>
              )}
              <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[0.625rem] font-extrabold text-white/80 uppercase tracking-widest backdrop-blur-sm">
                {match.gender}
              </span>
              {match.ageGroup && match.ageGroup !== 'Tümü' && (
                <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[0.625rem] font-extrabold text-white/80 uppercase tracking-widest backdrop-blur-sm">
                  {match.ageGroup} Yaş
                </span>
              )}
            </div>
          </div>
 
          {/* Fiyat (Sağ Altta) & Katıl Aksiyon Butonu */}
          <div className="flex flex-col items-end gap-2.5 shrink-0">
            {match.price === 0 ? (
              <div className="px-3.5 py-1.5 bg-gradient-to-br from-[#39FF14]/20 to-[#10b981]/10 backdrop-blur-xl border border-[#39FF14]/50 rounded-xl shadow-[0_0_20px_rgba(57,255,20,0.25)]">
                <span className="text-[0.625rem] font-extrabold italic uppercase tracking-widest text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.6)]">ÜCRETSİZ</span>
              </div>
            ) : (
              <div className="px-3 py-1.5 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl shadow-lg flex flex-col items-center gap-0.5">
                <span className="text-[0.625rem] font-extrabold uppercase tracking-wider text-ink-4">KİŞİ BAŞI</span>
                <span className="text-[0.8125rem] font-extrabold text-[#FACC15] tracking-wider drop-shadow-md">{formatTRYShort(match.price)}</span>
              </div>
            )}

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-14 h-14 rounded-2xl flex items-center justify-center backdrop-blur-xl border border-white/20 transition-all bg-white/[0.05] hover:bg-white/10 shadow-[0_0_30px_rgba(0,0,0,0.5)]"
              style={{ boxShadow: `0 0 35px ${glowColor}25` }}
            >
              <ChevronRight size={24} className="text-white drop-shadow-lg group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </div>
        </div>
      </div>
      </div>{/* /İÇERİK (esnek dikey akış) */}

    </motion.div>
  );
};

export default MatchDiscovery;

