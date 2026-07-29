import { ORDU_DISTRICT_NAMES } from '../utils/orduData';
import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft, MapPin, Clock, Circle,
  ChevronRight, ShieldAlert, KeyRound, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchListing } from '../types';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import { supabase } from '../supabaseClient';
import { subscribeToOpenMatches, fetchNearbyMatches, resolvePrivateMatch, toPrivateMatchErrorMessage, getMatchDetails } from '../services/matchService';
import { EmptyState } from '../components/common/StatusState';
import { FilterDropdown } from '../components/ui/FilterDropdown';
import { deriveDiscoveryFilterOptions, roleHasOpenSlot, ROLE_LABEL_MAP } from '../utils/discoveryFilterOptions';
import { formatMatchDuration, realMatchMinutes } from '../shared/matchTiming';

interface MatchDiscoveryProps {
  onBack: () => void;
  onSelect: (match: MatchListing) => void;
}

// ── OYUN DNA'SI SEÇENEKLERİ ──
// Format/Mentalite/Pozisyon seçenekleri sabit liste DEĞİLDİR: yalnız listelenen
// açık maçlarda fiilen bulunan değerlerden türetilir (utils/discoveryFilterOptions).
const BUDGET_OPTIONS = ['Ücretsiz', '150₺ ve Altı', '150-250₺', '250-350₺', '350₺ ve Üzeri'];
const GENDER_OPTIONS = ['Karma', 'Erkek', 'Kadın'];
const AGE_OPTIONS = ['10-14', '14-16', '16-18', '18-22', '23-27', '28-35', '35+', 'Tümü'];

const MatchDiscovery: React.FC<MatchDiscoveryProps> = ({ onBack, onSelect }) => {
  const {
    adminMatches,
    adminUsers,
    navigateTo,
    userLocation,
    selectedRegions,
    searchRadius,
    setSearchRadius
  } = useAppStore();
  const currentUserUid = auth.currentUser?.uid || 'u1';
  const currentUser = adminUsers.find(u => u.id === currentUserUid) || adminUsers[0];
  const trustScore = currentUser?.rating || 4.2;

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
  // Hızlı filtre çipleri (Q14): nearby (mesafeye göre sırala) / today / open / cheap
  const [quick, setQuick] = useState<string[]>([]);
  const [dna, setDna] = useState({
    format: '',
    budget: '',
    duration: '',
    age: '',
    gender: '',
    role: '',
    mentality: '',
    district: ''
  });

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
    return () => { cancelled = true; };
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
      const MENTALITY_DISPLAY: Record<'Ciddi' | 'Taktiksel' | 'Rahat', { title: string; color: string }> = {
        Ciddi: { title: 'CİDDİ', color: '#FACC15' },
        Taktiksel: { title: 'TAKTİKSEL', color: '#3b82f6' },
        Rahat: { title: 'RAHAT', color: '#10b981' },
      };
      const matchMentality = MENTALITY_DISPLAY[normalizedMentality].title;
      const mentalityColor = MENTALITY_DISPLAY[normalizedMentality].color;

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
        missingPositions: [],
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

  const isFilterActive = useMemo(() => {
    return !!(dna.format || dna.budget || dna.duration || (dna.age && dna.age !== 'Tümü') || dna.gender || dna.role || dna.mentality || dna.district);
  }, [dna]);

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
      return changed ? next : prev;
    });
    setOpenDropdown(prev => {
      if (!prev) return prev;
      const list = prev === 'format' ? filterOptions.formats : prev === 'mentality' ? filterOptions.mentalities : filterOptions.roles;
      return list.length === 0 ? null : prev;
    });
  }, [filterOptions]);

  const checkMatchFilters = (match: any) => {
    if (dna.format && match.format && match.format.toLowerCase() !== dna.format.toLowerCase()) {
      return false;
    }
    if (dna.budget) {
      const price = match.price || 0;
      if (dna.budget === 'Ücretsiz' && price !== 0) {
        return false;
      }
      if (dna.budget === '150₺ ve Altı' && (price === 0 || price > 150)) {
        return false;
      }
      if (dna.budget === '150-250₺' && (price < 150 || price > 250)) {
        return false;
      }
      if (dna.budget === '250-350₺' && (price < 250 || price > 350)) {
        return false;
      }
      if (dna.budget === '350₺ ve Üzeri' && price < 350) {
        return false;
      }
    }
    // Süre filtresi de TEK KAYNAKTAN okur: matches.duration_minutes. Eskiden
    // serbest metin `duration` ile harf harf karşılaştırılıyordu — '90 dakika'
    // ile '90 Dakika' ayrışabiliyor, metni boş olan maç ise filtreyi sessizce
    // GEÇİYORDU (kullanıcı 60 seçip 90'lık maç görebiliyordu).
    if (dna.duration) {
      const istenenDk = parseInt(dna.duration, 10);
      const gercekDk = realMatchMinutes(match);
      if (!Number.isFinite(istenenDk) || gercekDk === null || gercekDk !== istenenDk) {
        return false;
      }
    }
    if (dna.age && dna.age !== 'Tümü' && match.ageGroup && match.ageGroup.toLowerCase() !== dna.age.toLowerCase()) {
      return false;
    }
    if (dna.gender && match.gender && match.gender.toLowerCase() !== dna.gender.toLowerCase()) {
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
    if (dna.district && match.location && !match.location.toLowerCase().includes(dna.district.toLowerCase())) {
      return false;
    }
    return true;
  };

  const { matchingMatches, otherMatches } = useMemo(() => {
    // Hızlı filtre çipleri (Q14) — listeye son aşamada uygulanır.
    const aq = (list: any[]) => {
      let r = list;
      if (quick.includes('open')) r = r.filter((m: any) => [...(m.slots || []), ...(m.awaySlots || [])].some((s: any) => s?.status === 'OPEN'));
      if (quick.includes('today')) {
        const n = new Date();
        r = r.filter((m: any) => {
          const d = getMatchTargetDate(m.date, m.time);
          return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
        });
      }
      if (quick.includes('cheap')) r = r.filter((m: any) => (Number(m.price) || 0) <= 200);
      if (quick.includes('nearby')) r = [...r].sort((a: any, b: any) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
      return r;
    };
    if (!isFilterActive) {
      return { matchingMatches: [], otherMatches: aq(enhancedMatches) };
    }
    const matching = aq(enhancedMatches.filter(checkMatchFilters));
    const other = aq(enhancedMatches.filter(m => !checkMatchFilters(m)));
    return { matchingMatches: matching, otherMatches: other };
  }, [enhancedMatches, isFilterActive, dna, quick]);

  const handleClearFilters = () => {
    setDna({
      format: '',
      budget: '',
      duration: '',
      age: '',
      gender: '',
      role: '',
      mentality: '',
      district: ''
    });
  };

  const wizardCount = isFilterActive ? matchingMatches.length : enhancedMatches.length;
  const wizardLabel = wizardCount > 0 ? `${wizardCount} MAÇI GÖSTER` : 'EŞLEŞEN MAÇ YOK';

  return (
    <div className="min-h-screen max-h-screen bg-[#0A0E14] flex flex-col relative overflow-hidden font-sans selection:bg-[#FACC15] selection:text-black">
      
      {/* ── ARKA PLAN ── */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 mix-blend-overlay pointer-events-none" />

      {/* ═══════════════════════════════════════════════════════════════════════
          TEK SAYFALIK OYUN DNA PANELİ
      ═══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showWizard && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50, filter: 'blur(10px)' }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="absolute inset-0 z-50 flex flex-col h-full bg-[#0A0E14]"
          >
            {/* 1. ÜST BAR */}
            <div className="px-5 pt-safe pb-4 flex items-center justify-between shrink-0 border-b border-white/5 bg-black/20 backdrop-blur-lg">
              <button onClick={() => setShowWizard(false)} className="w-10 h-10 rounded-full bg-white/[0.03] backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-white/20 transition-all shadow-[0_0_15px_rgba(255,255,255,0.05)]">
                <ArrowLeft size={18} className="text-white drop-shadow-md" />
              </button>
              <h1 className="text-[17px] font-black italic uppercase tracking-tighter text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                Oynamak istediğin maçı bul
              </h1>
              <button onClick={() => setShowWizard(false)} className="w-10 text-right text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">
                Geç
              </button>
            </div>

            {/* ANA İÇERİK */}
            <div className="flex-1 flex flex-col px-5 py-2 gap-4 justify-between relative z-10 overflow-y-auto no-scrollbar">
              <div className="space-y-3">
              
                {/* Yarıçap (Radius) Slider */}
                {userLocation && (
                  <div className="space-y-3 mb-2 p-4 bg-[#161B22] border border-[#39FF14]/30 rounded-2xl shadow-[0_0_15px_rgba(57,255,20,0.1)]">
                    <div className="flex justify-between items-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#39FF14]">Arama Çapı (Mesafe)</p>
                        <span className="text-[#39FF14] text-xs font-black drop-shadow-md">{searchRadius} KM</span>
                    </div>
                    <input
                        type="range"
                        min="5" max="50" step="5"
                        value={searchRadius}
                        onChange={(e) => setSearchRadius(Number(e.target.value))}
                        className="w-full h-2 bg-black rounded-lg appearance-none cursor-pointer border border-white/10"
                        style={{
                          background: `linear-gradient(to right, #39FF14 0%, #39FF14 ${((searchRadius - 5) / 45) * 100}%, #161B22 ${((searchRadius - 5) / 45) * 100}%, #161B22 100%)`
                        }}
                    />
                    <p className="text-[9px] text-white/50 italic">Mevcut konumuna göre <span className="text-white font-bold">{searchRadius} KM</span> çapındaki sahalarda olan maçlar listelenir.</p>
                  </div>
                )}

                {/* Bölge (İlçe) Seçimi - Konum Yoksa Alternatif */}
                {!userLocation && (
                  <div className="space-y-2 mb-2 p-4 bg-[#161B22] border border-white/5 rounded-2xl">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Arama Bölgesi (İlçe)</p>
                    <div className="flex flex-wrap gap-2">
                      {['Tümü', ...ORDU_DISTRICT_NAMES].map(dist => (
                        <button
                          key={dist}
                          type="button"
                          onClick={() => setDna({ ...dna, district: dist === 'Tümü' ? '' : dist })}
                          className={`px-3 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all backdrop-blur-md border ${
                            (dist === 'Tümü' && !dna.district) || dna.district === dist
                              ? 'bg-[#39FF14]/10 border-[#39FF14]/50 text-[#39FF14] shadow-[0_0_20px_rgba(57,255,20,0.2)]'
                              : 'bg-white/[0.02] border-white/10 text-white hover:bg-white/[0.05]'
                          }`}
                        >
                          {dist.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-white/50 italic">Cihaz konumu bulunamadığı için maçları bölge bazlı filtreleyebilirsiniz.</p>
                  </div>
                )}

                {/* Takım Formatı / Pozisyon / Mentalite bu panelde YOK: her filtrenin
                    tek evi var — liste üstündeki üç dropdown (FilterDropdown). */}

                {/* Bütçe */}
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Kişi Başı Ücret</p>
                  <div className="flex flex-wrap gap-2">
                    {BUDGET_OPTIONS.map(b => (
                      <button
                        key={b}
                        onClick={() => setDna({ ...dna, budget: dna.budget === b ? '' : b })}
                        className={`px-4 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all backdrop-blur-md border ${
                          dna.budget === b 
                            ? 'bg-[#FACC15]/10 border-[#FACC15]/50 text-[#FACC15] shadow-[0_0_20px_rgba(250,204,21,0.2)] drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]' 
                            : 'bg-white/[0.02] border-white/10 text-white hover:bg-white/[0.05]'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Maç Süresi */}
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Maç Süresi</p>
                  <div className="flex gap-2">
                    {['60 Dakika', '90 Dakika', '120 Dakika'].map(d => (
                      <button
                        key={d}
                        onClick={() => setDna({ ...dna, duration: dna.duration === d ? '' : d })}
                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all backdrop-blur-md border ${
                          dna.duration === d 
                            ? 'bg-[#39FF14]/10 border-[#39FF14]/50 text-[#39FF14] shadow-[0_0_20px_rgba(57,255,20,0.2)]' 
                            : 'bg-white/[0.02] border-white/10 text-white hover:bg-white/[0.05]'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Yaş & Cinsiyet */}
                <div className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Cinsiyet</p>
                    <div className="flex bg-white/[0.02] p-1 rounded-xl border border-white/10 backdrop-blur-md">
                      {GENDER_OPTIONS.map(g => (
                        <button
                          key={g}
                          onClick={() => setDna({ ...dna, gender: dna.gender === g ? '' : g })}
                          className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                            dna.gender === g ? 'bg-white/20 text-white shadow-md drop-shadow-[0_0_5px_rgba(255,255,255,0.5)] border border-white/30' : 'text-white'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-[1.5] space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Yaş</p>
                    <div className="flex overflow-x-auto no-scrollbar gap-1.5 pb-1">
                      {AGE_OPTIONS.map(a => (
                        <button
                          key={a}
                          onClick={() => setDna({ ...dna, age: dna.age === a ? '' : a })}
                          className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-black transition-all backdrop-blur-md border ${
                            dna.age === a ? 'bg-[#FACC15]/10 border-[#FACC15]/50 text-[#FACC15] shadow-[0_0_15px_rgba(250,204,21,0.2)]' : 'bg-white/[0.02] border-white/10 text-white'
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* ANA BUTON (SABİT ALT) */}
            <div className="px-5 pb-8 pt-2 shrink-0 relative z-10 bg-gradient-to-t from-black via-black/80 to-transparent">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowWizard(false)}
                className="relative overflow-hidden w-full py-4 rounded-2xl text-black font-black uppercase tracking-[0.2em] text-xs transition-all border border-[#FACC15]/50"
                style={{ 
                  background: 'linear-gradient(135deg, #FACC15, #39FF14)',
                  boxShadow: '0 0 30px rgba(57,255,20,0.3), 0 8px 30px rgba(250,204,21,0.2)'
                }}
              >
                {/* Shimmer Efekti */}
                <motion.div
                  className="absolute inset-0 skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
                />
                <span className="relative z-10 drop-shadow-sm">{wizardLabel}</span>
              </motion.button>
            </div>
          </motion.div>
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
          {/* HEADER */}
          <header className="sticky top-0 z-50 bg-black/40 backdrop-blur-2xl border-b border-white/5 px-5 pt-safe pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={onBack} className="w-10 h-10 rounded-full bg-white/[0.03] backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-90 transition-all hover:bg-white/10">
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <h1 className="text-xl font-black text-white italic uppercase tracking-tight leading-none drop-shadow-lg">Top Oyna</h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isFilterActive && (
                  <button 
                    onClick={handleClearFilters} 
                    className="px-3.5 py-2 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 transition-all text-[10px] font-black uppercase tracking-widest"
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
                  <span className="text-[10px] font-black uppercase tracking-widest drop-shadow-md">Kodla Katıl</span>
                </button>
                <button onClick={() => { setOpenDropdown(null); setShowWizard(true); }} className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/[0.03] backdrop-blur-md border border-white/10 text-white hover:bg-white/10 transition-all">
                  <span className="text-[10px] font-black uppercase tracking-widest drop-shadow-md">Filtre</span>
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
                <button onClick={() => setDna({ ...dna, format: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.format} <span className="text-white/40 text-[11px] leading-none">✕</span>
                </button>
              )}
              {dna.mentality && (
                <button onClick={() => setDna({ ...dna, mentality: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.mentality.toLocaleUpperCase('tr-TR')} <span className="text-white/40 text-[11px] leading-none">✕</span>
                </button>
              )}
              {dna.role && (
                <button onClick={() => setDna({ ...dna, role: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {ROLE_LABEL_MAP[dna.role] || dna.role} <span className="text-white/40 text-[11px] leading-none">✕</span>
                </button>
              )}
              {dna.budget && (
                <button onClick={() => setDna({ ...dna, budget: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.budget} <span className="text-white/40 text-[11px] leading-none">✕</span>
                </button>
              )}
              {dna.duration && (
                <button onClick={() => setDna({ ...dna, duration: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.duration} <span className="text-white/40 text-[11px] leading-none">✕</span>
                </button>
              )}
              {dna.gender && (
                <button onClick={() => setDna({ ...dna, gender: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.gender.toLocaleUpperCase('tr-TR')} <span className="text-white/40 text-[11px] leading-none">✕</span>
                </button>
              )}
              {dna.age && dna.age !== 'Tümü' && (
                <button onClick={() => setDna({ ...dna, age: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.age} YAŞ <span className="text-white/40 text-[11px] leading-none">✕</span>
                </button>
              )}
              {dna.district && (
                <button onClick={() => setDna({ ...dna, district: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.district.toLocaleUpperCase('tr-TR')} <span className="text-white/40 text-[11px] leading-none">✕</span>
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
              overflow-* YOK: paneller satırın altına doğru (yukarıdan aşağıya) açılır. */}
          <div className="relative shrink-0 z-30 border-b border-white/5 bg-[#0D121F]/40 backdrop-blur-md">
            <div className="flex gap-2 px-5 py-3">
              <FilterDropdown
                label="FORMAT"
                value={dna.format}
                options={filterOptions.formats.map(f => ({ value: f, label: f }))}
                onChange={(v) => setDna({ ...dna, format: v })}
                open={openDropdown === 'format'}
                onOpenChange={(o) => setOpenDropdown(o ? 'format' : null)}
                disabled={filterOptions.formats.length === 0}
                accent="#39FF14"
              />
              <FilterDropdown
                label="MENTALİTE"
                value={dna.mentality}
                options={filterOptions.mentalities.map(v => ({ value: v, label: v.toLocaleUpperCase('tr-TR') }))}
                onChange={(v) => setDna({ ...dna, mentality: v })}
                open={openDropdown === 'mentality'}
                onOpenChange={(o) => setOpenDropdown(o ? 'mentality' : null)}
                disabled={filterOptions.mentalities.length === 0}
                accent="#FACC15"
              />
              <FilterDropdown
                label="POZİSYON"
                value={dna.role}
                options={filterOptions.roles.map(r => ({ value: r, label: r, panelLabel: `${r} — ${ROLE_LABEL_MAP[r]}` }))}
                onChange={(v) => setDna({ ...dna, role: v })}
                open={openDropdown === 'role'}
                onOpenChange={(o) => setOpenDropdown(o ? 'role' : null)}
                disabled={filterOptions.roles.length === 0}
                accent="#39FF14"
              />
            </div>
            {enhancedMatches.length === 0 && (
              <p className="px-5 pb-2.5 -mt-1 text-[9px] font-bold uppercase tracking-widest text-white/35">
                Şu an açık maç yok — filtreler maç geldiğinde aktifleşir.
              </p>
            )}
          </div>

          {/* MATCH CARDS (POSTERS) */}
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 relative z-10 custom-scrollbar">
            <>
                {/* Hızlı filtre çipleri (Q14) */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {[
                    { k: 'nearby', label: 'Yakınımda' },
                    { k: 'today', label: 'Bugün' },
                    { k: 'open', label: 'Boş Kontenjan' },
                    { k: 'cheap', label: 'Uygun Fiyat' },
                  ].map((c) => {
                    const active = quick.includes(c.k);
                    return (
                      <button
                        key={c.k}
                        onClick={() => setQuick((prev) => prev.includes(c.k) ? prev.filter((x) => x !== c.k) : [...prev, c.k])}
                        className="shrink-0 px-3.5 py-2 rounded-full text-[11px] font-black tracking-wide whitespace-nowrap transition-all border"
                        style={{
                          background: active ? '#39FF14' : 'rgba(255,255,255,0.04)',
                          color: active ? '#000' : 'rgba(255,255,255,0.6)',
                          borderColor: active ? '#39FF14' : 'rgba(255,255,255,0.08)',
                        }}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                {isFilterActive && (
                  <>
                    {/* Filtreye Uygun Maçlar Section */}
                    <div>
                      <h2 className="text-sm font-black italic uppercase tracking-widest text-[#39FF14] mb-4 flex items-center gap-2 drop-shadow-[0_0_8px_rgba(57,255,20,0.4)]">
                        <span className="inline-block w-1.5 h-3 bg-[#39FF14] rounded-sm" />
                        Filtreye Uygun Maçlar
                      </h2>
                      
                      {matchingMatches.length === 0 ? (
                        <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 backdrop-blur-md rounded-[24px] p-6 flex flex-col items-center justify-center text-center gap-3 shadow-[0_0_15px_rgba(239,68,68,0.1)] mb-8">
                          <p className="text-white font-black italic uppercase tracking-tighter text-base">Filtrelere Uygun Maç Bulunamadı</p>
                          <p className="text-white/60 text-[10px] font-bold uppercase tracking-wider max-w-sm">
                            Seçtiğin kriterlere uyan aktif bir maç bulunmuyor. Diğer maçları inceleyebilir ya da filtrelerini sıfırlayabilirsin.
                          </p>
                          <div className="flex gap-2 flex-wrap justify-center">
                            <button
                              onClick={handleClearFilters}
                              className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-[10px] font-black uppercase tracking-widest text-white transition-all active:scale-95"
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
                              className="px-5 py-2.5 rounded-full bg-[#39FF14]/10 hover:bg-[#39FF14]/20 border border-[#39FF14]/40 text-[10px] font-black uppercase tracking-widest text-[#39FF14] transition-all active:scale-95"
                            >
                              Çapı Genişlet
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-6 mb-8">
                          {matchingMatches.map((match, index) => (
                            <MatchCard key={match.id} match={match} index={index} onSelect={onSelect} dna={dna} trustScore={trustScore} />
                          ))}
                        </div>
                      )}
                    </div>
     
                    {/* Tüm Diğer Maçlar Section */}
                    {otherMatches.length > 0 && (
                      <div>
                        <h2 className="text-sm font-black italic uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2">
                          <span className="inline-block w-1.5 h-3 bg-white/20 rounded-sm" />
                          {userLocation ? `${searchRadius} KM ÇAPINDAKİ DİĞER MAÇLAR` : 'Tüm Maçlar'}
                        </h2>
                        <div className="space-y-6">
                          {otherMatches.map((match, index) => (
                            <MatchCard key={match.id} match={match} index={index + matchingMatches.length} onSelect={onSelect} dna={dna} trustScore={trustScore} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
     
                {!isFilterActive && (
                  <div className="space-y-6">
                    {userLocation && (
                        <h2 className="text-sm font-black italic uppercase tracking-widest text-[#39FF14] mb-4 flex items-center gap-2 drop-shadow-[0_0_8px_rgba(57,255,20,0.4)]">
                          <MapPin size={16} />
                          {searchRadius} KM ÇAPINDAKİ MAÇLAR
                        </h2>
                    )}
                    {otherMatches.length === 0 ? (
                      <EmptyState title="Aktif Maç Bulunamadı" message="Bu bölgede şu an açık bir maç yok." />
                    ) : (
                      otherMatches.map((match, index) => (
                        <MatchCard key={match.id} match={match} index={index} onSelect={onSelect} dna={dna} trustScore={trustScore} />
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
              <h2 className="text-xl font-black text-white mb-2 italic uppercase tracking-tight">Özel Maça Katıl</h2>
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
                className="w-full bg-black/40 border border-white/15 rounded-2xl px-4 py-4 text-center text-2xl font-black tracking-[0.4em] text-white placeholder:text-white/20 placeholder:tracking-widest placeholder:text-base focus:border-[#FACC15]/50 focus:outline-none transition-all uppercase"
              />

              {privateError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-500/20 rounded-xl px-3 py-2 mt-4">{privateError}</p>
              )}

              <div className="flex flex-col gap-3 mt-6">
                <button
                  onClick={handleJoinPrivate}
                  disabled={privateLoading || privateCode.trim().length < 4}
                  className={`w-full py-3.5 bg-[#FACC15] text-black font-black rounded-2xl text-sm uppercase tracking-wide transition-transform flex items-center justify-center gap-2 ${privateLoading || privateCode.trim().length < 4 ? 'opacity-50 cursor-not-allowed' : 'active:scale-95 hover:bg-yellow-300'}`}
                >
                  {privateLoading ? <><Loader2 size={16} className="animate-spin" /> Aranıyor...</> : 'Maça Git'}
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

const getMatchTargetDate = (dateStr: string, timeStr: string): Date => {
  const now = new Date();
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  let targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
  
  const cleanDateStr = dateStr.toLowerCase().trim();
  if (cleanDateStr === 'yarın') {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (cleanDateStr !== 'bugün') {
    const daysOfWeek: Record<string, number> = {
      'pazartesi': 1,
      'salı': 2,
      'çarşamba': 3,
      'perşembe': 4,
      'cuma': 5,
      'cumartesi': 6,
      'pazar': 0
    };
    const targetDayNum = daysOfWeek[cleanDateStr];
    if (targetDayNum !== undefined) {
      const currentDayNum = now.getDay();
      let diff = targetDayNum - currentDayNum;
      if (diff <= 0) diff += 7; // Next occurrence
      targetDate.setDate(targetDate.getDate() + diff);
    }
  }
  return targetDate;
};

const MatchCard: React.FC<{
  match: any;
  index: number;
  onSelect: (match: MatchListing) => void;
  dna: any;
  trustScore: number;
}> = ({ match, index, onSelect, dna, trustScore }) => {
  const roleMap: Record<string, string> = { 'HÜC': 'HÜCUM', 'ORT': 'ORTA SAHA', 'SAV': 'SAVUNMA', 'KL': 'KALECİ' };
  const myRole = roleMap[dna.role];
  const glowColor = match.mentalityColor;

  // Poster: normalde maçın sahasının fotoğrafı otomatik dolar. Görsel yoksa
  // ya da URL kırıksa boş kare yerine sahanın rengiyle şık bir zemin göster.
  const [imgBroken, setImgBroken] = useState(false);
  useEffect(() => { setImgBroken(false); }, [match.image]);
  const hasPoster = !!match.image && !imgBroken;
  
  // Güven skoru 3.0'ın altındakiler veya minRating'i karşılayamayanlar için kilitli premium kart mantığı
  const isLocked = match.minRating && match.minRating > trustScore;

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
    const target = getMatchTargetDate(match.date, match.time);
    
    const updateTimer = () => {
      const now = new Date().getTime();
      const diff = target.getTime() - now;
      
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
      onClick={() => {
        if (isLocked) return; // Kilitliyse tıklanamaz
        onSelect(match);
      }}
      className="relative w-full min-h-[400px] flex flex-col rounded-[32px] overflow-hidden cursor-pointer group shadow-2xl border border-white/5"
    >
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
          <span className="text-xs font-black text-white tracking-[0.1em] drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">{match.time}</span>
        </div>
 
        {/* Maça Kalan Süre Ticking Geri Sayım (Sağ Üst) */}
        <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-black/70 backdrop-blur-md border border-[#39FF14]/30 rounded-xl shadow-[0_0_15px_rgba(57,255,20,0.1)]">
          <span className="w-1.5 h-1.5 bg-[#39FF14] rounded-full animate-ping shrink-0" />
          <span className="text-[10px] font-black tracking-widest text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]">
            {timeLeft}
          </span>
        </div>
      </div>

      {/* ── ACİLİYET ROZETİ ── */}
      {urgencyType && (
        <div className="flex justify-center">
          <div className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-[9px] font-black tracking-[0.18em] uppercase border"
            style={{
              borderColor: urgencyType === 'son1kisi' ? '#ef4444' : '#FACC15',
              color: urgencyType === 'son1kisi' ? '#ef4444' : '#FACC15',
              boxShadow: `0 0 10px ${urgencyType === 'son1kisi' ? 'rgba(239,68,68,0.35)' : 'rgba(250,204,21,0.35)'}`
            }}>
            {urgencyType === 'son1kisi' ? 'SON 1 KİŞİ' : 'SON DAKİKA'}
          </div>
        </div>
      )}

      {/* ── ARANAN OYUNCU — tek dil: iki tarafın açık slot toplamı ── */}
      <div className="flex flex-col gap-2.5 items-start">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-xl border bg-black/60 border-white/10"
          style={{ borderLeft: `4px solid ${Number(match.openCount) > 0 ? '#39FF14' : '#FACC15'}` }}
        >
          <Circle size={12} className={Number(match.openCount) > 0 ? 'text-[#39FF14]' : 'text-[#FACC15]'} />
          <span className="text-[10px] font-black uppercase tracking-widest text-white/85">
            {Number(match.openCount) > 0 ? `${match.openCount} OYUNCU ARANIYOR` : 'KADRO TAMAM'}
          </span>
        </div>
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
                <span className="text-[9px] font-black uppercase tracking-wider text-white/60 drop-shadow-sm">
                  {slotFilled}/{totalSlots} OYUNCU
                </span>
              </div>
            )}

            {/* Tesis ve Lokasyon İsmi Devasa (Üst Karakter) */}
            <h3 className="text-xl font-black text-white italic uppercase leading-tight tracking-tighter drop-shadow-[0_4px_15px_rgba(0,0,0,1)] mb-2 break-words">
              {match.location.toUpperCase()}
            </h3>

            {/* Tarih ve Saat (Üst Karakter) */}
            <div className="text-[10px] font-black text-[#FACC15] italic uppercase tracking-widest mb-3 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              {match.date.toUpperCase()} • {match.time.toUpperCase()}
            </div>
            
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest backdrop-blur-sm"
                style={{
                  border: `1px solid ${match.mentalityColor}66`,
                  backgroundColor: `${match.mentalityColor}22`,
                  color: match.mentalityColor,
                  textShadow: `0 0 6px ${match.mentalityColor}55`
                }}>
                {match.matchMentality}
              </span>
              <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[9px] font-black text-white/80 uppercase tracking-widest backdrop-blur-sm">
                {match.format}
              </span>
              {/* MAÇ SÜRESİ — gerçek veri (duration_minutes). Yoksa hiç çizilmez. */}
              {match.durationLabel && (
                <span className="px-2 py-0.5 rounded border border-[#39FF14]/25 bg-[#39FF14]/10 text-[9px] font-black text-[#39FF14] uppercase tracking-widest backdrop-blur-sm">
                  {match.durationLabel}
                </span>
              )}
              <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[9px] font-black text-white/80 uppercase tracking-widest backdrop-blur-sm">
                {match.gender}
              </span>
              {match.ageGroup && match.ageGroup !== 'Tümü' && (
                <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[9px] font-black text-white/80 uppercase tracking-widest backdrop-blur-sm">
                  {match.ageGroup} Yaş
                </span>
              )}
            </div>
          </div>
 
          {/* Fiyat (Sağ Altta) & Katıl Aksiyon Butonu */}
          <div className="flex flex-col items-end gap-2.5 shrink-0">
            {match.price === 0 ? (
              <div className="px-3.5 py-1.5 bg-gradient-to-br from-[#39FF14]/20 to-[#10b981]/10 backdrop-blur-xl border border-[#39FF14]/50 rounded-xl shadow-[0_0_20px_rgba(57,255,20,0.25)]">
                <span className="text-[10px] font-black italic uppercase tracking-widest text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.6)]">ÜCRETSİZ</span>
              </div>
            ) : (
              <div className="px-3 py-1.5 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl shadow-lg flex flex-col items-center gap-0.5">
                <span className="text-[7px] font-black uppercase tracking-wider text-white/45">KİŞİ BAŞI</span>
                <span className="text-[13px] font-black text-[#FACC15] tracking-wider drop-shadow-md">{match.price} ₺</span>
              </div>
            )}

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={isLocked}
              className="w-14 h-14 rounded-2xl flex items-center justify-center backdrop-blur-xl border border-white/20 transition-all bg-white/[0.05] hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(0,0,0,0.5)]"
              style={{ boxShadow: `0 0 35px ${glowColor}25` }}
            >
              <ChevronRight size={24} className="text-white drop-shadow-lg group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </div>
        </div>
      </div>
      </div>{/* /İÇERİK (esnek dikey akış) */}

      {/* ── PREMIUM DİNAMİK KİLİT & BLUR KAPLAMASI ── */}
      {isLocked && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-md z-30 flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-300">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-600/20 to-amber-600/10 border-2 border-red-500/50 flex items-center justify-center shadow-[0_0_25px_rgba(239,68,68,0.4)]">
              <ShieldAlert size={32} className="text-red-500 animate-pulse" />
            </div>
            
            <div className="space-y-2">
              <h4 className="text-lg font-black italic uppercase tracking-widest text-[#FACC15] drop-shadow-[0_0_10px_rgba(250,204,21,0.4)]">
                KİLİTLİ PREMİUM MAÇ
              </h4>
              <p className="text-[10px] text-white/80 font-black uppercase tracking-widest leading-relaxed max-w-[240px] mx-auto">
                Bu maça katılabilmek için minimum <span className="text-[#39FF14]">★ {match.minRating}</span> yetenek puanı gerekmektedir.
              </p>
              <div className="w-24 h-px bg-white/10 mx-auto my-3" />
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                Senin Yetenek Puanın: <span className="text-red-400">★ {trustScore}</span>
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};

export default MatchDiscovery;

