
import { LAUNCH_CITY } from '../utils/orduData';
import { KALECI_HAKEM_KIRALAMA_ACIK } from '../shared/featureFlags';
import { districtsOfCity } from '../data/turkeyRegions';
import { getHaversineDistance } from '../utils/geo';
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
    ChevronLeft, ChevronRight, X, Search, SlidersHorizontal, Star, MapPin, Clock,
    Share2, BadgeCheck, ShieldCheck, Zap, CheckCircle2, Check, Info, MessageSquare,
    CalendarX, Hourglass, Wallet, Award
} from 'lucide-react';
import { Spinner } from '../components/ui/Spinner';
import { motion, AnimatePresence } from 'framer-motion';
import { Referee, Goalkeeper } from '../types';
import type { MatchListing } from '../types';
import { useAppStore } from '../store';
import { MarketplaceCard, ROLE_THEME } from '../components/Marketplace/MarketplaceCard';
import { EmptyState } from '../components/common/StatusState';
import SkeletonList from '../components/ui/SkeletonList';
import BottomSheet from '../components/ui/BottomSheet';
import Chip from '../components/ui/Chip';
import { getInitials } from '../components/ui/Avatar';
import { UserAvatar } from '../components/common/UserAvatar';
import { providerStyles } from '../shared/providerStyles';
import { hakemSeviyeRozeti, HAKEM_SEVIYE_NOTU } from '../shared/hakemSeviyesi';
import { auth } from '../supabaseAuth';
import { trCapitalize } from '../utils/trUpper';
import { formatTRYShort } from '../utils/formatTRY';

const getNormalizedDifficulty = (diff?: string): string => {
  if (!diff) return 'Rahat';
  const d = diff.trim().toLowerCase();
  if (d === 'ciddi' || d === 'pro') return 'Ciddi';
  if (d === 'taktiksel' || d === 'yarı-pro' || d === 'yari-pro' || d === 'yarı pro' || d === 'yari pro') return 'Taktiksel';
  if (d === 'rahat' || d === 'amatör' || d === 'amator' || d === 'eğlence' || d === 'eglence') return 'Rahat';
  return trCapitalize(diff);
};

// "18:00 - 23:00" gibi bir aralıkta seçilen saatin kalıp kalmadığını kontrol eder.
// Eski `includes('21:00')` yaklaşımı aralık içindeki saatleri kaçırıyordu (Plan §1.2/8).
const hourInRange = (activeHours: string, hour: string): boolean => {
  const m = activeHours.match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/);
  if (!m) return activeHours.includes(hour);
  const start = Number(m[1]) * 60 + Number(m[2]);
  let end = Number(m[3]) * 60 + Number(m[4]);
  if (end <= start) end += 24 * 60; // gece yarısını aşan aralık (ör. 22:00 - 02:00)
  const [hh, mm] = hour.split(':').map(Number);
  let t = hh * 60 + (mm || 0);
  if (t < start) t += 24 * 60;
  return t >= start && t <= end;
};

const DAY_OPTIONS = [
  { id: 'Pzt', label: 'Pazartesi' },
  { id: 'Sal', label: 'Salı' },
  { id: 'Çar', label: 'Çarşamba' },
  { id: 'Per', label: 'Perşembe' },
  { id: 'Cum', label: 'Cuma' },
  { id: 'Cmt', label: 'Cumartesi' },
  { id: 'Paz', label: 'Pazar' },
];
const HOUR_OPTIONS = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00'];

type SortKey = 'RECOMMENDED' | 'RATING' | 'FEE' | 'DISTANCE';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'RECOMMENDED', label: 'Önerilen' },
  { key: 'RATING', label: 'En Yüksek Puan' },
  { key: 'FEE', label: 'En Uygun Ücret' },
  { key: 'DISTANCE', label: 'En Yakın' },
];

interface FilterState {
  district: string;
  day: string;
  time: string;
}
const EMPTY_FILTERS: FilterState = { district: 'Tümü', day: 'Tümü', time: 'Tümü' };

interface MarketplaceProps {
    type: 'REF' | 'GK';
    onBack: () => void;
    onSelect?: (item: Goalkeeper | Referee) => void;
    /** Boş "maçın yok" durumundan doğrudan maç oluşturmaya geçiş (çıkmaz sokak bırakma). */
    onCreateMatch?: () => void;
}

// Bugünün kısa gün adı (workingHours.activeDays ile aynı sözlük: Pzt..Paz)
const TODAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'][new Date().getDay()];

// ─── Küçük yapı taşları ───────────────────────────────────────────────────────

const SectionTitle: React.FC<{ icon: React.ReactNode; title: string; right?: React.ReactNode }> = ({ icon, title, right }) => (
    <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
            <span className="text-ink-4">{icon}</span>
            <h3 className="text-[0.8125rem] font-extrabold text-white uppercase tracking-widest">{title}</h3>
        </div>
        {right}
    </div>
);

const SkillBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
    <div className="space-y-1.5">
        <div className="flex justify-between items-center">
            <span className="text-[0.6875rem] font-bold text-white/50">{label}</span>
            <span className="text-[0.6875rem] font-extrabold text-white font-numeric">{value}</span>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
            />
        </div>
    </div>
);

// Küçük avatar — foto yoksa/yüklenemezse baş harfler (kırık görsel karesi
// görünmesin). Görünüm dili TEK bileşenden (components/common/UserAvatar);
// burada yalnız kutu ölçüsü ve çerçeve söyleniyor.
const SafeAvatar: React.FC<{ src?: string | null; name: string; className?: string }> = ({ src, name, className = 'w-10 h-10 rounded-xl' }) => (
    <UserAvatar
        name={name}
        avatarUrl={src}
        className={className}
        textClassName="text-[0.6875rem]"
    />
);

const StatTile: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({ label, value, sub }) => (
    <div className="flex-1 min-w-0 bg-[#11161F] border border-white/[0.06] rounded-2xl px-3 py-3.5 text-center">
        <div className="text-lg font-extrabold text-white font-numeric leading-[1.2] truncate">{value}</div>
        <div className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-widest mt-1.5">{label}</div>
        {sub && <div className="text-[0.6875rem] font-bold text-ink-4 mt-0.5 truncate">{sub}</div>}
    </div>
);

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

const Marketplace: React.FC<MarketplaceProps> = ({ type, onBack, onSelect, onCreateMatch }) => {
    const theme = ROLE_THEME[type];
    const roleLabel = theme.label; // "Kaleci" | "Hakem"
    const RoleIcon = theme.icon;

    const [selectedProfile, setSelectedProfile] = useState<Goalkeeper | Referee | null>(null);
    const [isHiring, setIsHiring] = useState(false);
    // FAZ 8A — gerçek talep sonucu (ücret/komisyon backend'den döner; pazarlık yok)
    const [hireResult, setHireResult] = useState<{ fee: number; providerAmount: number } | null>(null);
    const [hireError, setHireError] = useState<string | null>(null);
    const [showMatchSelection, setShowMatchSelection] = useState(false);
    // Onay adımı (Plan 8A.1): maça dokunmak talebi HEMEN göndermez; ücret dökümüyle
    // açık onay istenir. Tek aktif maç varsa liste adımı tamamen atlanır.
    const [matchPendingConfirm, setMatchPendingConfirm] = useState<any>(null);
    const [selectedMatchForHire, setSelectedMatchForHire] = useState<any>(null);
    const [showSuccessScreen, setShowSuccessScreen] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);
    // Paylaşım/pano çalışmazsa kullanıcıya söylenecek metin (sessiz vazgeçme yok).
    const [paylasHatasi, setPaylasHatasi] = useState<string | null>(null);
    const [heroBroken, setHeroBroken] = useState(false);
    const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (successTimerRef.current) clearTimeout(successTimerRef.current); }, []);

    const {
        adminGoalkeepers, adminReferees, adminMatches, myMatches: benimMaclarim,
        activeRegion, selectedRegions, userLocation, initialLoadComplete,
    } = useAppStore();
    const profiles: (Goalkeeper | Referee)[] = type === 'GK' ? adminGoalkeepers : adminReferees;

    // ─── Arama / filtre / sıralama durumu ────────────────────────────────────
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
    const [sortKey, setSortKey] = useState<SortKey>('RECOMMENDED');
    const [showFilterSheet, setShowFilterSheet] = useState(false);
    const [draftFilters, setDraftFilters] = useState<FilterState>(EMPTY_FILTERS);

    // İlçe seçenekleri birincil (aktif) ile göre (sabit değil).
    const zoneCity = activeRegion?.city ?? LAUNCH_CITY;

    // Çoklu bölge kapsamı: kapsanan (isCovered) seçili şehirlerin birleşimi.
    const scopeCities = useMemo(() => {
        const regions = selectedRegions.length > 0 ? selectedRegions : (activeRegion ? [activeRegion] : []);
        return Array.from(new Set(regions.filter(r => r.isCovered).map(r => r.city)));
    }, [selectedRegions, activeRegion]);

    // Kapsanan tüm şehirlerin ilçeleri (yumuşak ilçe eşleşmesi için birleşim).
    const cityDistricts = useMemo(
        () => Array.from(new Set((scopeCities.length ? scopeCities : [zoneCity]).flatMap(c => districtsOfCity(c)))),
        [scopeCities, zoneCity],
    );

    // Gerçek mesafe: kullanıcı konumu + sağlayıcı koordinatı; yoksa null (sahte fallback yok).
    const distanceOf = useCallback((p: Goalkeeper | Referee): number | null => {
        if (userLocation && p.coordinates?.lat && p.coordinates?.lng) {
            return getHaversineDistance(userLocation.lat, userLocation.lng, p.coordinates.lat, p.coordinates.lng);
        }
        const parsed = parseFloat(p.distance ?? '');
        return Number.isFinite(parsed) ? parsed : null;
    }, [userLocation]);

    const applyFilters = useCallback((list: (Goalkeeper | Referee)[], f: FilterState, q: string) => {
        const query = q.trim().toLocaleLowerCase('tr-TR');
        // Bölge adları BİREBİR karşılaştırılmaz (26 Ağu 2026'da öğrenildi):
        // canlıda sağlayıcı bölgeleri "altinordu" (küçük, aksansız) yazılmıştı,
        // süzgeç "Altınordu" arıyordu ve vitrin başlığı "3 onaylı kaleci"
        // derken liste 1 sonuç basıyordu. Ad karşılaştırması Türkçe harfe ve
        // aksana duyarsız yapılır: NFD ayrıştırıp aksan imlerini at, 'ı/I'
        // tuzağı için Türkçe yerel ayarla küçült. Veri düzeltilse bile kural
        // kalır — bölge adı kullanıcı girdisidir, aynı özensizlik yine gelir.
        const bolgeAnahtari = (x: string) =>
            x.trim().toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
        const kapsamIller = scopeCities.map(bolgeAnahtari);
        const kapsamIlceler = cityDistricts.map(bolgeAnahtari);
        return list.filter(p => {
            // Seçili bölge kapsamı: sağlayıcının hizmet bölgeleri seçili illerden
            // biriyle ilgili mi? (bölgesizler hariç tutulmaz)
            const matchesRegion = scopeCities.length === 0 || !p.preferredZones || p.preferredZones.length === 0 ||
                p.preferredZones.some(z => {
                    const parts = z.split('/').map(s => bolgeAnahtari(s));
                    return kapsamIller.includes(parts[0]) || kapsamIller.includes(bolgeAnahtari(z)) || kapsamIlceler.includes(parts[parts.length - 1]);
                });
            // "İl / İlçe" ve düz "İlçe" formatlarının ikisini de yakala.
            const matchesDistrict = f.district === 'Tümü' || (!!p.preferredZones && p.preferredZones.some(z =>
                bolgeAnahtari(z) === bolgeAnahtari(f.district) ||
                bolgeAnahtari(z.split('/').pop() ?? '') === bolgeAnahtari(f.district)));
            // Gün/saat bilgisi girmemiş sağlayıcı "bilinmiyor" sayılır ve listede kalır
            // (bilinmiyor ≠ müsait değil; likidite ilkesi — Plan §0).
            const matchesDay = f.day === 'Tümü' || !p.workingHours?.activeDays?.length || p.workingHours.activeDays.includes(f.day);
            const matchesTime = f.time === 'Tümü' || !p.workingHours?.activeHours || hourInRange(p.workingHours.activeHours, f.time);
            const matchesSearch = !query || [
                p.name,
                typeof p.style === 'string' ? p.style : '',
                ...(p.preferredZones || []),
            ].some(t => (t || '').toLocaleLowerCase('tr-TR').includes(query));
            return matchesRegion && matchesDistrict && matchesDay && matchesTime && matchesSearch;
        });
    }, [scopeCities, cityDistricts]);

    const filteredProfiles = useMemo(
        () => applyFilters(profiles, filters, search),
        [profiles, filters, search, applyFilters],
    );

    // Plan 8A.6 — kullanıcı seçimli sıralama: Önerilen / Puan / Ücret / Yakınlık.
    const sortedProfiles = useMemo(() => {
        const arr = [...filteredProfiles];
        switch (sortKey) {
            case 'RATING':
                return arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
            case 'FEE':
                return arr.sort((a, b) => (a.fee || 0) - (b.fee || 0));
            case 'DISTANCE':
                return arr.sort((a, b) => {
                    const dA = distanceOf(a); const dB = distanceOf(b);
                    if (dA == null && dB == null) return 0;
                    if (dA == null) return 1;
                    if (dB == null) return -1;
                    return dA - dB;
                });
            default: // RECOMMENDED — müsait > elite > puan > deneyim
                return arr.sort((a, b) =>
                    Number(b.isAvailable !== false) - Number(a.isAvailable !== false) ||
                    Number(!!b.isElite) - Number(!!a.isElite) ||
                    (b.rating || 0) - (a.rating || 0) ||
                    ((b as any).matchCount || 0) - ((a as any).matchCount || 0));
        }
    }, [filteredProfiles, sortKey, distanceOf]);

    const activeFilterCount = (['district', 'day', 'time'] as const).filter(k => filters[k] !== 'Tümü').length;
    const isLoading = !initialLoadComplete && profiles.length === 0;

    const clearAll = () => { setFilters(EMPTY_FILTERS); setSearch(''); };

    const openFilterSheet = () => { setDraftFilters(filters); setShowFilterSheet(true); };
    const applyDraftFilters = () => { setFilters(draftFilters); setShowFilterSheet(false); };
    const draftResultCount = useMemo(
        () => (showFilterSheet ? applyFilters(profiles, draftFilters, search).length : 0),
        [showFilterSheet, profiles, draftFilters, search, applyFilters],
    );

    // ─── Kiralama akışı (FAZ 8A — tek yol: create_service_request) ───────────
    // Yalnız KULLANICININ KENDİ maçları. Sahiplik süzgeci olmadan kaptan
    // başkasının maçını seçip create_service_request'ten FORBIDDEN alıyordu.
    //
    // [YUK-2] KAYNAK GENİŞLETİLDİ — adminMatches artık BÖLGEYE DARALTILMIŞ bir
    // listedir. Tek başına kullanılsaydı kaptanın başka ilçedeki kendi maçı bu
    // seçicide kaybolurdu. Bu yüzden store'daki myMatches ile BİRLEŞİM alınır:
    // o liste get_my_matches() RPC'sinden gelir, bölgeden bağımsızdır ve
    // kurucu/kaptan maçlarını kapsar. İki kaynak da aynı sahiplik süzgecinden
    // geçtiği için birleşim YANLIŞ maç ekleyemez, yalnız eksiği tamamlar.
    const myMatches = useMemo(() => {
        const uid = auth.currentUser?.uid;
        if (!uid) return [];
        const birlesim = new Map<string, MatchListing>();
        [...adminMatches, ...benimMaclarim].forEach(m => { if (m?.id) birlesim.set(m.id, m); });
        return Array.from(birlesim.values()).filter(m =>
            (m.creatorId === uid || (m as any).captainId === uid) &&
            (m.status === 'DRAFT' || m.status === 'ACTIVE' || !m.status));
    }, [adminMatches, benimMaclarim]);

    const matchNeedsRole = useCallback((m: any) => (
        type === 'GK'
            ? m.missingPositions?.some((pos: any) => pos.role === 'GK' && pos.count > 0)
            : !m.refereeId
    ), [type]);

    // Rolü eksik olan maçlar önce gelsin — kaptan çoğu zaman onlar için burada.
    const sortedMatches = useMemo(
        () => [...myMatches].sort((a, b) => Number(matchNeedsRole(b)) - Number(matchNeedsRole(a))),
        [myMatches, matchNeedsRole],
    );

    const handleSelect = (p: Goalkeeper | Referee) => {
        setSelectedProfile(p);
        setShowMatchSelection(false);
        setMatchPendingConfirm(null);
        setShowSuccessScreen(false);
        setHireError(null);
        setShareCopied(false);
        setHeroBroken(false);
    };

    // Detay CTA'sı: tek aktif maç varsa liste adımını atla, doğrudan onaya git (Plan 8A.1).
    const openHireFlow = () => {
        setHireError(null);
        setMatchPendingConfirm(sortedMatches.length === 1 ? sortedMatches[0] : null);
        setShowMatchSelection(true);
    };

    // Başarıyı kapat (Tamam butonu veya otomatik zamanlayıcı — hangisi önce gelirse).
    const finishSuccess = () => {
        if (successTimerRef.current) { clearTimeout(successTimerRef.current); successTimerRef.current = null; }
        const chosen = selectedProfile;
        setShowSuccessScreen(false);
        setSelectedProfile(null);
        setShowMatchSelection(false);
        setMatchPendingConfirm(null);
        setHireResult(null);
        if (onSelect && chosen) onSelect(chosen);
    };

    // Katmanın "bir adım geri" mantığı (Escape ve arka plan için tek kaynak).
    const stepBackOverlay = useCallback(() => {
        if (isHiring) return; // ödeme sürerken kapatma
        if (showSuccessScreen) { finishSuccess(); return; }
        if (showMatchSelection && matchPendingConfirm) { setMatchPendingConfirm(null); return; }
        if (showMatchSelection) { setShowMatchSelection(false); return; }
        setSelectedProfile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHiring, showSuccessScreen, showMatchSelection, matchPendingConfirm]);

    // Erişilebilirlik: tam ekran katman açıkken Escape ile kapatma (a11y denetim bulgusu).
    useEffect(() => {
        if (!selectedProfile) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stepBackOverlay(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedProfile, stepBackOverlay]);

    const handleShare = async (p: Goalkeeper | Referee) => {
        const text = `${p.name} — OYNA'da ${roleLabel}. Maç başı ücret: ${formatTRYShort(p.fee)}${p.rating > 0 ? `, puan: ${p.rating.toFixed(1)}` : ''}.`;
        // Sessiz vazgeçme YOK: pano da paylaşım da yoksa kullanıcıya söylenir.
        // (Pakette `navigator.share`/`clipboard` bulunmayabilir — utils/dosyaKaydet.ts
        // başındaki açıklama.) Vazgeçmek hata değildir, sessizce çıkılır.
        try {
            if (navigator.share) {
                await navigator.share({ title: `OYNA · ${p.name}`, text });
                return;
            }
            if (!navigator.clipboard?.writeText) throw new Error('pano yok');
            await navigator.clipboard.writeText(text);
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 1800);
        } catch (e: any) {
            if (e?.name === 'AbortError') return; // kullanıcı vazgeçti
            // Hata KENDİLİĞİNDEN KAYBOLMAZ: kullanıcı X ile kapatana kadar durur
            // (bkz. PaymentScreen inlineError deseni — 4 sn'de kaybolan hata okunamıyordu).
            setPaylasHatasi('Bu cihazda paylaşılamadı — bilgileri ekrandan okuyabilirsin.');
        }
    };

    // KİRALAMA AÇIK MI? Arayüz bu bayrağı okur; ikisi ayrı yerlerden
    // karar verirse ekran "talep gönder" der, tıklayınca hata çıkar.
    // Kart altyapısı canlıya alınınca burası true olur (ve handleConfirmMatch
    // gerçek akışa döner) — iki satır, tek yerde.
    // Tek kaynak: shared/featureFlags.ts. Eskiden burada yerel bir `false`
    // duruyordu ve ana ekrandaki giriş kartları bundan habersizdi — ekran
    // kapalıyken kapı açık kalıyordu.
    const KIRALAMA_ACIK = KALECI_HAKEM_KIRALAMA_ACIK;

    // FAZ 8A kiralama LANSMANDA KAPALI (MatchJoin ile parite): eski akış
    // emaneti cüzdandan fonluyordu, cüzdan artık yok (shared/featureFlags.ts).
    // Kartlı emanet, iyzico canlıya alınınca v1.1'de yazılacak; o güne dek
    // sağlayıcıya karşılıksız kazanç yazılmaz, talep de askıda bırakılmaz.
    const handleConfirmMatch = async (match: any) => {
        if (!selectedProfile || isHiring) return;
        setSelectedMatchForHire(match);
        setHireError('Kaleci/hakem kiralama şu anda kapalı.');
    };

    // ─── Detay için türetilmiş veriler ────────────────────────────────────────
    const detail = selectedProfile;
    const detailStats: any = (detail as any)?.stats || {};
    const detailDistance = detail ? distanceOf(detail) : null;
    const detailUnavailable = detail?.isAvailable === false;
    const detailReviews = detail?.reviews || [];
    // B11 — hakem seviyesi ekranda ham basılmaz; ortak yardımcı "BEYAN: …"
    // etiketini üretir. Seviye girilmemişse null döner (rozet/karo "—" gösterir
    // ve altına dürüstlük notu düşmez — ortada bir iddia yoktur).
    const detailSeviyeRozeti = hakemSeviyeRozeti((detail as Referee | null)?.level);
    // Çalışma günlerinden türetilmiş dürüst sinyal: bugün çalışıyor mu?
    const detailAvailableToday = !detailUnavailable && !!detail?.workingHours?.activeDays?.includes(TODAY_SHORT);

    /**
     * TARZLAR — "Refleksler 87 / Uçuş 84" çubuklarının yerine geçti.
     *
     * Kurucu kararı (2026-08-06): o çubukların arkasında ÖLÇÜM YOKTU. Kaleci
     * kendi ekranından giremiyordu, oyuncu oyu onları beslemiyordu; tek kaynak
     * yönetim panelinde elle yazılmış tohum veriydi. Oyuncuya "bu kaleci 87
     * refleks" demek, ölçmediğimiz bir şeyi ölçtüğümüzü iddia etmekti.
     *
     * Yerine sağlayıcının KENDİ beyan ettiği, kapalı listeden seçilmiş en
     * fazla iki tarz geliyor (shared/providerStyles.ts + veritabanı kısıtı).
     */
    const detailStyles: string[] = useMemo(
        () => (detail ? providerStyles(type === 'GK' ? 'GK' : 'REF', detail) : []),
        [detail, type],
    );

    const factRows: { label: string; value: string }[] = useMemo(() => {
        if (!detail) return [];
        const present = (v: any) => v !== undefined && v !== null && v !== '';
        // Çıplak sayı gelirse birimini ekle ("80" → "%80", "9.5" → "9.5 km") — kayıt formatı serbest.
        const asPercent = (v: any) => (/^\d+([.,]\d+)?$/.test(String(v).trim()) ? `%${v}` : String(v));
        const asKm = (v: any) => (/^\d+([.,]\d+)?$/.test(String(v).trim()) ? `${v} km` : String(v));
        if (type === 'GK') {
            return [
                present(detailStats.savePercentage) && { label: 'Kurtarış', value: asPercent(detailStats.savePercentage) },
                present(detailStats.penaltySaveRate) && { label: 'Penaltı Kurtarma', value: asPercent(detailStats.penaltySaveRate) },
            ].filter(Boolean) as { label: string; value: string }[];
        }
        return [
            present(detailStats.avgCards) && { label: 'Maç Başı Kart', value: String(detailStats.avgCards) },
            present(detailStats.avgDistance) && { label: 'Maç Başı Koşu', value: asKm(detailStats.avgDistance) },
            present(detailStats.varCallAccuracy) && { label: 'Karar İsabeti', value: asPercent(detailStats.varCallAccuracy) },
        ].filter(Boolean) as { label: string; value: string }[];
    }, [detail, detailStats, type]);

    return (
        <div className="h-full bg-[#0A0E14] relative flex flex-col font-sans overflow-hidden">

            {/* 1. Başlık */}
            <header className="px-5 pt-safe-baslik pb-4 flex items-center gap-3 bg-[#0A0E14]/90 backdrop-blur-xl sticky top-0 z-30 border-b border-white/5">
                <button
                    onClick={onBack}
                    aria-label="Geri"
                    className="w-11 h-11 shrink-0 flex items-center justify-center bg-[#161B22] rounded-full text-white border border-white/5 hover:bg-white/10 active:scale-95 transition-all"
                >
                    <ChevronLeft size={20} />
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-base font-extrabold tracking-tight text-white uppercase leading-tight">
                        {type === 'GK' ? 'Kaleci Bul' : 'Hakem Kirala'}
                    </h1>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: theme.accent, boxShadow: `0 0 8px ${theme.accent}80` }} />
                        <span className="text-[0.6875rem] font-bold text-ink-4">
                            {isLoading ? 'Profiller yükleniyor…' : `${zoneCity} bölgesinde ${profiles.length} onaylı ${roleLabel.toLocaleLowerCase('tr-TR')}`}
                        </span>
                    </div>
                </div>
                <div
                    className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center border"
                    style={{ backgroundColor: theme.soft, borderColor: theme.border, color: theme.accent }}
                >
                    <RoleIcon size={18} />
                </div>
            </header>

            {/* 2. Arama + Filtre */}
            <div className="px-5 pt-4 pb-2 flex gap-2">
                <div className="flex-1 relative">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="İsim, stil veya bölge ara"
                        className="w-full h-11 bg-[#11161F] border border-white/[0.07] focus:border-white/20 rounded-2xl pl-10 pr-9 text-[0.8125rem] font-semibold text-white placeholder:text-ink-4 outline-none transition-colors"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            aria-label="Aramayı temizle"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-white/50 hover:text-white"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
                <button
                    onClick={openFilterSheet}
                    aria-label="Filtreler"
                    className="relative w-11 h-11 shrink-0 rounded-2xl border flex items-center justify-center transition-all active:scale-95"
                    style={activeFilterCount > 0
                        ? { backgroundColor: theme.soft, borderColor: theme.border, color: theme.accent }
                        : { backgroundColor: '#11161F', borderColor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}
                >
                    <SlidersHorizontal size={16} />
                    {activeFilterCount > 0 && (
                        <span
                            className="absolute -top-1 -right-1 w-4.5 h-4.5 min-w-[18px] px-0.5 rounded-full text-[0.6875rem] font-extrabold flex items-center justify-center text-black"
                            style={{ backgroundColor: theme.accent }}
                        >
                            {activeFilterCount}
                        </span>
                    )}
                </button>
            </div>

            {/* 3. Sıralama çipleri */}
            <div className="pl-5 pr-2 pb-1 flex gap-2 overflow-x-auto no-scrollbar">
                {SORT_OPTIONS.map(o => (
                    <Chip
                        key={o.key}
                        label={o.label}
                        selected={sortKey === o.key}
                        onClick={() => setSortKey(o.key)}
                    />
                ))}
            </div>

            {/* 4. Sonuç sayacı */}
            <div className="px-5 pt-2 pb-1 flex items-center justify-between">
                <span className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-widest">
                    {isLoading ? ' ' : `${sortedProfiles.length} sonuç`}
                </span>
                {(activeFilterCount > 0 || search) && (
                    <button
                        onClick={clearAll}
                        className="text-[0.625rem] font-extrabold uppercase tracking-widest transition-colors"
                        style={{ color: theme.accent }}
                    >
                        Filtreleri Temizle
                    </button>
                )}
            </div>

            {/* 5. Liste */}
            <div className="flex-1 relative overflow-hidden">
                <div className="h-full px-5 pb-24 overflow-y-auto custom-scrollbar">
                    {isLoading ? (
                        <SkeletonList rows={5} className="pt-2" />
                    ) : sortedProfiles.length === 0 ? (
                        <div className="pt-6">
                            <EmptyState
                                icon={<RoleIcon size={44} strokeWidth={1.2} />}
                                title={`${roleLabel} Bulunamadı`}
                                message={activeFilterCount > 0 || search
                                    ? 'Bu kriterlere uyan profil yok. Filtreleri gevşetmeyi dene.'
                                    : `Bölgende henüz onaylı ${roleLabel.toLocaleLowerCase('tr-TR')} yok. Yakında burada olacaklar.`}
                            />
                            {(activeFilterCount > 0 || search) && (
                                <div className="flex justify-center">
                                    <button
                                        onClick={clearAll}
                                        className="px-5 h-10 rounded-full text-[0.6875rem] font-extrabold uppercase tracking-wider text-black active:scale-95 transition-transform"
                                        style={{ backgroundColor: theme.accent }}
                                    >
                                        Filtreleri Temizle
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3 pt-2">
                            {sortedProfiles.map(p => (
                                <MarketplaceCard
                                    key={p.id}
                                    item={p}
                                    type={type}
                                    distanceKm={distanceOf(p)}
                                    onClick={() => handleSelect(p)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* 6. Filtre paneli */}
            <BottomSheet open={showFilterSheet} onClose={() => setShowFilterSheet(false)} ariaLabel="Filtreler">
                <div className="pb-2">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-extrabold text-white uppercase tracking-tight">Filtreler</h2>
                        <button
                            onClick={() => setDraftFilters(EMPTY_FILTERS)}
                            className="text-[0.625rem] font-extrabold text-ink-4 hover:text-white uppercase tracking-widest transition-colors"
                        >
                            Sıfırla
                        </button>
                    </div>

                    <div className="space-y-5">
                        <div>
                            <p className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-widest mb-2">Hizmet Bölgesi</p>
                            <div className="flex flex-wrap gap-2">
                                <Chip label="Tümü" selected={draftFilters.district === 'Tümü'} onClick={() => setDraftFilters(f => ({ ...f, district: 'Tümü' }))} />
                                {cityDistricts.map(d => (
                                    <Chip key={d} label={d} selected={draftFilters.district === d} onClick={() => setDraftFilters(f => ({ ...f, district: d }))} />
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-widest mb-2">Gün</p>
                            <div className="flex flex-wrap gap-2">
                                <Chip label="Tümü" selected={draftFilters.day === 'Tümü'} onClick={() => setDraftFilters(f => ({ ...f, day: 'Tümü' }))} />
                                {DAY_OPTIONS.map(d => (
                                    <Chip key={d.id} label={d.label} selected={draftFilters.day === d.id} onClick={() => setDraftFilters(f => ({ ...f, day: d.id }))} />
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-widest mb-2">Maç Saati</p>
                            <div className="flex flex-wrap gap-2">
                                <Chip label="Tümü" selected={draftFilters.time === 'Tümü'} onClick={() => setDraftFilters(f => ({ ...f, time: 'Tümü' }))} />
                                {HOUR_OPTIONS.map(h => (
                                    <Chip key={h} label={h} selected={draftFilters.time === h} onClick={() => setDraftFilters(f => ({ ...f, time: h }))} />
                                ))}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={applyDraftFilters}
                        className="w-full h-13 min-h-[52px] rounded-2xl mt-6 text-xs font-extrabold uppercase tracking-widest text-black active:scale-[0.98] transition-transform"
                        style={{ backgroundColor: theme.accent }}
                    >
                        {draftResultCount} Sonucu Göster
                    </button>
                </div>
            </BottomSheet>

            {/* 7. Detay / kiralama akışı */}
            <AnimatePresence>
                {detail && (
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label={`${detail.name} — ${roleLabel} profili`}
                        initial={{ opacity: 0, y: 100 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 100 }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="fixed inset-0 z-50 bg-[#0A0E14] flex flex-col overflow-hidden"
                    >
                        {showSuccessScreen ? (
                            /* ── Başarı ekranı — "talep gönderildi", "kiralandı" değil (sağlayıcı onayı gerçek) ── */
                            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center relative overflow-y-auto">
                                <motion.div
                                    initial={{ scale: 0.85, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: 'spring', delay: 0.1 }}
                                    className="flex flex-col items-center gap-6 w-full max-w-sm mx-auto"
                                >
                                    <div
                                        className="w-20 h-20 rounded-full border-2 flex items-center justify-center"
                                        style={{ backgroundColor: theme.soft, borderColor: theme.accent, color: theme.accent, boxShadow: `0 0 32px ${theme.accent}40` }}
                                    >
                                        <CheckCircle2 size={38} />
                                    </div>

                                    <div className="space-y-1">
                                        <h3 className="text-2xl font-extrabold uppercase tracking-tight text-white">Talep Gönderildi</h3>
                                        <p className="text-[0.6875rem] font-bold text-ink-4">
                                            {detail.name} onaylayınca bildirim alacaksın
                                        </p>
                                    </div>

                                    <div className="w-full bg-[#11161F] border border-white/[0.06] rounded-3xl p-5 space-y-4 text-left">
                                        <div className="flex items-center gap-3">
                                            <SafeAvatar src={detail.avatar} name={detail.name} className="w-11 h-11 rounded-xl" />
                                            <div className="min-w-0">
                                                <p className="text-sm font-extrabold text-white truncate">{detail.name}</p>
                                                <p className="text-[0.625rem] font-bold uppercase tracking-widest" style={{ color: theme.accent }}>{roleLabel}</p>
                                            </div>
                                        </div>

                                        <div className="h-px bg-white/[0.06]" />

                                        <div className="space-y-1">
                                            <p className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-widest">Maç</p>
                                            <p className="text-[0.8125rem] font-bold text-white">{selectedMatchForHire?.location}</p>
                                            <p className="text-[0.6875rem] font-semibold text-ink-4">{selectedMatchForHire?.date} · {selectedMatchForHire?.time}</p>
                                        </div>

                                        <div className="h-px bg-white/[0.06]" />

                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-widest">Emanete Alınan Ücret</span>
                                                <span className="text-base font-extrabold font-numeric" style={{ color: theme.accent }}>
                                                    {formatTRYShort(hireResult?.fee ?? detail.fee)}
                                                </span>
                                            </div>
                                            {hireResult && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-widest">{roleLabel} Net Kazancı</span>
                                                    <span className="text-xs font-bold text-white/60 font-numeric">{formatTRYShort(hireResult.providerAmount)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Süreç adımları */}
                                    <div className="w-full flex items-center gap-2 px-1">
                                        {[
                                            { icon: <Check size={11} />, label: 'Ödeme emanette', done: true },
                                            { icon: <Hourglass size={11} />, label: `${roleLabel} onayı`, done: false },
                                            { icon: <Wallet size={11} />, label: 'Maç sonrası aktarım', done: false },
                                        ].map((s, i) => (
                                            <React.Fragment key={s.label}>
                                                {i > 0 && <div className="flex-1 h-px bg-white/10" />}
                                                <div className="flex flex-col items-center gap-1.5 shrink-0">
                                                    <span
                                                        className="w-6 h-6 rounded-full flex items-center justify-center border"
                                                        style={s.done
                                                            ? { backgroundColor: theme.accent, borderColor: theme.accent, color: '#0A0E14' }
                                                            : { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}
                                                    >
                                                        {s.icon}
                                                    </span>
                                                    <span className={`text-[0.625rem] font-bold uppercase tracking-wide ${s.done ? 'text-white' : 'text-ink-4'}`}>{s.label}</span>
                                                </div>
                                            </React.Fragment>
                                        ))}
                                    </div>

                                    <p className="text-[0.6875rem] text-ink-4 font-semibold">
                                        Ödemen emanete alındı; {roleLabel.toLocaleLowerCase('tr-TR')} onaylayıp maç kesinleşince aktarılır, gelmezse iade edilir.
                                    </p>

                                    <button
                                        onClick={finishSuccess}
                                        className="w-full h-13 min-h-[52px] rounded-2xl text-xs font-extrabold uppercase tracking-widest text-black active:scale-[0.98] transition-transform"
                                        style={{ backgroundColor: theme.accent }}
                                    >
                                        Tamam
                                    </button>
                                </motion.div>
                            </div>
                        ) : showMatchSelection ? (
                            matchPendingConfirm ? (
                                /* ── Onay adımı — ücret dökümüyle açık onay (Plan 8A.1) ── */
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    <div className="px-5 pt-6 pb-4 flex items-start justify-between gap-3 border-b border-white/5">
                                        <div className="min-w-0">
                                            <h2 className="text-lg font-extrabold uppercase tracking-tight text-white">Talebi Onayla</h2>
                                            <p className="text-[0.6875rem] font-bold text-ink-4 mt-0.5">
                                                Göndermeden önce son kontrol
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => { setShowMatchSelection(false); setMatchPendingConfirm(null); }}
                                            aria-label="Kapat"
                                            className="w-10 h-10 shrink-0 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-90"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-3">
                                        {/* Sağlayıcı */}
                                        <div className="p-3.5 rounded-2xl bg-[#11161F] border border-white/[0.06] flex items-center gap-3">
                                            <SafeAvatar src={detail.avatar} name={detail.name} className="w-11 h-11 rounded-xl" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[0.8125rem] font-extrabold text-white truncate">{detail.name}</p>
                                                <p className="text-[0.625rem] font-bold uppercase tracking-widest" style={{ color: theme.accent }}>{roleLabel}</p>
                                            </div>
                                            {detail.rating > 0 && (
                                                <span className="inline-flex items-center gap-1 text-[0.75rem] font-extrabold text-amber-400 shrink-0">
                                                    <Star size={12} className="fill-amber-400" /> {detail.rating.toFixed(1)}
                                                </span>
                                            )}
                                        </div>

                                        {/* Maç */}
                                        <div className="p-3.5 rounded-2xl bg-[#11161F] border border-white/[0.06]">
                                            <p className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-widest mb-1.5">Maç</p>
                                            <p className="text-[0.8125rem] font-extrabold text-white">{matchPendingConfirm.location}</p>
                                            <p className="text-[0.6875rem] font-semibold text-ink-4 mt-0.5">
                                                {matchPendingConfirm.date} · {matchPendingConfirm.time}
                                            </p>
                                            <div className="flex gap-1.5 mt-2">
                                                {matchPendingConfirm.format && (
                                                    <span className="text-[0.6875rem] font-extrabold bg-white/[0.05] border border-white/10 px-1.5 py-0.5 rounded text-white/55">
                                                        {matchPendingConfirm.format}
                                                    </span>
                                                )}
                                                <span className="text-[0.6875rem] font-extrabold bg-white/[0.05] border border-white/10 px-1.5 py-0.5 rounded text-white/55">
                                                    {getNormalizedDifficulty(matchPendingConfirm.difficulty)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Ücret dökümü */}
                                        <div className="p-4 rounded-2xl border" style={{ backgroundColor: theme.soft, borderColor: theme.border }}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[0.625rem] font-extrabold text-white/60 uppercase tracking-widest">Hizmet Bedeli</span>
                                                <span className="text-xl font-extrabold font-numeric text-white">{formatTRYShort(detail.fee)}</span>
                                            </div>
                                            <p className="text-[0.6875rem] font-semibold text-ink-4 mt-2 leading-relaxed">
                                                Onayladığın bedel <span className="text-white font-bold">emanete alınır</span> — {roleLabel.toLocaleLowerCase('tr-TR')} kabul edip
                                                maç kesinleşince sağlayıcıya aktarılır, gelmezse iade edilir. Sabit ücret; %10 platform komisyonu bedele dahildir.
                                            </p>
                                        </div>

                                        {hireError && (
                                            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30">
                                                <p className="text-[0.6875rem] font-bold text-red-400">{hireError}</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="px-5 pt-3 pb-safe border-t border-white/5 space-y-2.5">
                                        <button
                                            onClick={() => handleConfirmMatch(matchPendingConfirm)}
                                            disabled={isHiring}
                                            className="w-full h-14 rounded-2xl text-xs font-extrabold uppercase tracking-widest text-black flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
                                            style={{ backgroundColor: theme.accent, boxShadow: `0 8px 24px ${theme.accent}30` }}
                                        >
                                            {isHiring ? (
                                                <><Spinner size={16} color="#0A0E14" /> Gönderiliyor…</>
                                            ) : (
                                                <><Zap size={14} /> Onayla ve Talep Gönder</>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => setMatchPendingConfirm(null)}
                                            disabled={isHiring}
                                            className="w-full h-11 rounded-2xl text-[0.6875rem] font-extrabold uppercase tracking-widest text-white/50 bg-white/[0.04] border border-white/10 active:scale-[0.98] transition-transform disabled:opacity-40"
                                        >
                                            Farklı Maç Seç
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* ── Maç seçim listesi ── */
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    <div className="px-5 pt-6 pb-4 flex items-start justify-between gap-3 border-b border-white/5">
                                        <div className="min-w-0">
                                            <h2 className="text-lg font-extrabold uppercase tracking-tight text-white">Maçını Seç</h2>
                                            <p className="text-[0.6875rem] font-bold text-ink-4 mt-0.5">
                                                Talep hangi maç için gönderilsin?
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setShowMatchSelection(false)}
                                            aria-label="Kapat"
                                            className="w-10 h-10 shrink-0 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-90"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>

                                    {/* Seçilen sağlayıcı özeti */}
                                    <div className="mx-5 mt-4 p-3.5 rounded-2xl bg-[#11161F] border border-white/[0.06] flex items-center gap-3">
                                        <SafeAvatar src={detail.avatar} name={detail.name} className="w-10 h-10 rounded-xl" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[0.8125rem] font-extrabold text-white truncate">{detail.name}</p>
                                            <p className="text-[0.625rem] font-bold uppercase tracking-widest" style={{ color: theme.accent }}>{roleLabel}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-base font-extrabold text-white font-numeric">{formatTRYShort(detail.fee)}</p>
                                            <p className="text-[0.6875rem] font-bold text-ink-4 uppercase">maç başı</p>
                                        </div>
                                    </div>

                                    {hireError && (
                                        <div className="mx-5 mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
                                            <p className="text-[0.6875rem] font-bold text-red-400">{hireError}</p>
                                        </div>
                                    )}

                                    <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-2.5 pb-safe">
                                        {sortedMatches.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
                                                <CalendarX size={40} strokeWidth={1.2} className="text-ink-4" />
                                                <p className="text-sm font-extrabold text-white/70">Planlanmış maçın yok</p>
                                                <p className="text-[0.6875rem] font-semibold text-ink-4 max-w-[240px] leading-relaxed">
                                                    {roleLabel} kiralamak için önce bir maç oluşturmalısın.
                                                </p>
                                                {onCreateMatch && (
                                                    <button
                                                        onClick={onCreateMatch}
                                                        className="mt-2 px-6 h-11 rounded-full text-[0.6875rem] font-extrabold uppercase tracking-wider text-black active:scale-95 transition-transform"
                                                        style={{ backgroundColor: theme.accent }}
                                                    >
                                                        Maç Oluştur
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            sortedMatches.map(m => {
                                                const needsThisRole = matchNeedsRole(m);
                                                return (
                                                    <motion.button
                                                        key={m.id}
                                                        type="button"
                                                        whileTap={{ scale: 0.985 }}
                                                        onClick={() => { setHireError(null); setMatchPendingConfirm(m); }}
                                                        className="w-full text-left p-4 rounded-2xl border transition-colors relative overflow-hidden"
                                                        style={needsThisRole
                                                            ? { backgroundColor: theme.soft, borderColor: theme.border }
                                                            : { backgroundColor: '#11161F', borderColor: 'rgba(255,255,255,0.06)' }}
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="min-w-0 flex-1">
                                                                {needsThisRole && (
                                                                    <span
                                                                        className="inline-block mb-1.5 px-2 py-0.5 rounded-md text-[0.625rem] font-extrabold uppercase tracking-widest text-black"
                                                                        style={{ backgroundColor: theme.accent }}
                                                                    >
                                                                        {type === 'GK' ? 'Kaleci Aranıyor' : 'Hakem Eksik'}
                                                                    </span>
                                                                )}
                                                                <p className="text-[0.8125rem] font-extrabold text-white truncate">{m.location}</p>
                                                                <p className="text-[0.6875rem] font-semibold text-ink-4 mt-0.5">{m.date} · {m.time}</p>
                                                                <div className="flex gap-1.5 mt-2">
                                                                    {m.format && (
                                                                        <span className="text-[0.6875rem] font-extrabold bg-white/[0.05] border border-white/10 px-1.5 py-0.5 rounded text-white/55">
                                                                            {m.format}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-[0.6875rem] font-extrabold bg-white/[0.05] border border-white/10 px-1.5 py-0.5 rounded text-white/55">
                                                                        {getNormalizedDifficulty(m.difficulty)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <ChevronRight size={18} className="shrink-0 text-ink-4" />
                                                        </div>
                                                    </motion.button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )
                        ) : (
                            /* ── Profil detayı ── */
                            <>
                                {/* Üst bar */}
                                <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center z-20">
                                    <button
                                        onClick={() => setSelectedProfile(null)}
                                        aria-label="Geri"
                                        className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10 hover:bg-black/60 transition-colors"
                                    >
                                        <ChevronLeft size={22} />
                                    </button>
                                    <button
                                        onClick={() => handleShare(detail)}
                                        aria-label="Paylaş"
                                        className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10 hover:bg-black/60 transition-colors"
                                    >
                                        {shareCopied ? <Check size={16} style={{ color: theme.accent }} /> : <Share2 size={16} />}
                                    </button>
                                </div>

                                {/* Paylaşım/pano çalışmadıysa kullanıcı bunu GÖRÜR.
                                    Eskiden hata sessizce yutuluyordu: düğmeye basılıyor,
                                    hiçbir şey olmuyor, hiçbir şey söylenmiyordu. */}
                                {paylasHatasi && (
                                    <div role="status"
                                        className="absolute top-16 left-4 right-4 z-30 px-3 py-2 rounded-xl bg-red-950/90 border border-red-500/40 text-red-300 text-[0.6875rem] font-bold backdrop-blur-md flex items-center gap-2">
                                        <span className="flex-1 text-center">{paylasHatasi}</span>
                                        <button
                                            onClick={() => setPaylasHatasi(null)}
                                            aria-label="Hata mesajını kapat"
                                            className="shrink-0 -m-1 p-1 text-red-300 hover:text-white"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                )}

                                {/* Kaydırılabilir içerik */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar pb-36">
                                    {/* Kapak görseli / fallback */}
                                    <div className="relative w-full h-[38vh] min-h-[260px]">
                                        {detail.avatar && !heroBroken ? (
                                            <img src={detail.avatar} className="w-full h-full object-cover" alt={detail.name} referrerPolicy="no-referrer" onError={() => setHeroBroken(true)} />
                                        ) : (
                                            <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-br from-[#131A24] to-[#0A0E14] overflow-hidden">
                                                {/* Rol filigranı + yumuşak parıltı — boş kapak ucuz görünmesin */}
                                                <RoleIcon
                                                    size={280}
                                                    strokeWidth={0.6}
                                                    className="absolute -right-14 -bottom-10 pointer-events-none"
                                                    style={{ color: theme.accent, opacity: 0.05 }}
                                                />
                                                <div
                                                    className="absolute -top-16 -left-16 w-56 h-56 rounded-full blur-[80px] pointer-events-none"
                                                    style={{ backgroundColor: theme.accent, opacity: 0.07 }}
                                                />
                                                <div
                                                    className="w-28 h-28 rounded-3xl flex items-center justify-center border text-3xl font-extrabold relative"
                                                    style={{ backgroundColor: theme.soft, borderColor: theme.border, color: theme.accent }}
                                                >
                                                    {getInitials(detail.name)}
                                                </div>
                                            </div>
                                        )}
                                        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/75 to-transparent" />
                                    </div>

                                    {/* Kimlik bloğu */}
                                    <div className="px-5 -mt-16 relative z-10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[0.625rem] font-extrabold uppercase tracking-widest"
                                                style={detailUnavailable
                                                    ? { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }
                                                    : { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.35)', color: '#4ADE80' }}
                                            >
                                                <span className={`w-1.5 h-1.5 rounded-full ${detailUnavailable ? 'bg-white/30' : 'bg-[#4ADE80] animate-pulse'}`} />
                                                {detailUnavailable ? 'Müsait Değil' : (detailAvailableToday ? 'Bugün Müsait' : 'Müsait')}
                                            </span>
                                            {detail.isElite && (
                                                <span
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[0.625rem] font-extrabold uppercase tracking-widest"
                                                    style={{ backgroundColor: theme.soft, borderColor: theme.border, color: theme.accent }}
                                                >
                                                    <BadgeCheck size={11} /> Elite
                                                </span>
                                            )}
                                        </div>

                                        <h1 className="text-[1.75rem] font-extrabold text-white leading-tight tracking-tight">{detail.name}</h1>
                                        <p className="text-sm font-bold mt-0.5">
                                            <span style={{ color: theme.accent }}>{roleLabel}</span>
                                            {typeof detail.style === 'string' && detail.style && (
                                                <span className="text-ink-4"> · {detail.style}</span>
                                            )}
                                            {type === 'GK' && (detail as Goalkeeper).height && (
                                                <span className="text-ink-4"> · {(detail as Goalkeeper).height}</span>
                                            )}
                                        </p>

                                        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 mt-2.5 text-[0.8125rem] text-white/60 font-semibold">
                                            <span className="inline-flex items-center gap-1 text-white">
                                                <Star size={13} className={detail.rating > 0 ? 'fill-amber-400 text-amber-400' : 'text-ink-4'} />
                                                {detail.rating > 0 ? detail.rating.toFixed(1) : 'Yeni'}
                                            </span>
                                            {detailReviews.length > 0 && <span className="text-ink-4">({detailReviews.length} değerlendirme)</span>}
                                            <span className="text-ink-4">·</span>
                                            <span className="inline-flex items-center gap-1 capitalize">
                                                <MapPin size={12} className="text-ink-4" />
                                                {detail.preferredZones?.[0] || zoneCity}
                                            </span>
                                            <span className="text-ink-4">·</span>
                                            <span>{detailDistance != null ? `${detailDistance.toFixed(1)} km yakında` : 'Konumunu aç'}</span>
                                        </div>
                                    </div>

                                    {/* Özet karolar */}
                                    <div className="px-5 mt-6 flex gap-2.5">
                                        <StatTile
                                            label="Puan"
                                            value={detail.rating > 0
                                                ? detail.rating.toFixed(1)
                                                : <span className="text-sm leading-tight">Yeni</span>}
                                            sub={detailReviews.length > 0
                                                ? `${detailReviews.length} değerlendirme`
                                                : (detail.rating > 0 ? 'genel ortalama' : 'ilk maçlarını bekliyor')}
                                        />
                                        <StatTile
                                            label="Maç"
                                            value={(detail as any).matchCount ?? 0}
                                            sub="tamamlanan"
                                        />
                                        {type === 'GK' ? (
                                            <StatTile
                                                label="Yaş"
                                                value={(detail as Goalkeeper).age ?? '—'}
                                                sub={(detail as Goalkeeper).height || undefined}
                                            />
                                        ) : (
                                            /* B11 — burada eskiden ham `level` ("FIFA Kokart")
                                               basılıyordu ve altındaki "klasman" yazısı bunu
                                               resmî bir sınıflandırma gibi gösteriyordu. Değer
                                               hakemin başvuruda KENDİ seçtiği satırdır; OYNA
                                               doğrulamıyor. Metin artık ortak yardımcıdan
                                               "BEYAN: …" biçiminde geliyor.
                                               Karo dar (üçte bir genişlik): metin `text-sm` ile
                                               tek satıra sığmaz, StatTile'ın `truncate`ı da onu
                                               "BEYAN: FIF…" diye keserdi. Bu yüzden bu karoda
                                               metin küçültülüp SARMASINA izin verildi — karonun
                                               rengi, çerçevesi ve satırdaki yeri aynı. */
                                            <StatTile
                                                label="Seviye"
                                                value={
                                                    <span className="block text-[0.6875rem] leading-tight whitespace-normal break-words">
                                                        {detailSeviyeRozeti || '—'}
                                                    </span>
                                                }
                                                sub={detailSeviyeRozeti ? HAKEM_SEVIYE_NOTU : undefined}
                                            />
                                        )}
                                    </div>

                                    {/* Hakkında */}
                                    {detail.bio && (
                                        <div className="px-5 mt-8">
                                            <SectionTitle icon={<Info size={14} />} title="Hakkında" />
                                            <p className="text-[0.8125rem] text-white/60 font-medium leading-relaxed">{detail.bio}</p>
                                        </div>
                                    )}

                                    {/* Tarz — sağlayıcının kendi beyanı (en fazla 2) */}
                                    {detailStyles.length > 0 && (
                                        <div className="px-5 mt-8">
                                            <SectionTitle icon={<Award size={14} />} title={type === 'GK' ? 'Kaleci Tarzı' : 'Yönetim Tarzı'} />
                                            <div className="flex flex-wrap gap-2">
                                                {detailStyles.map(t => (
                                                    <span
                                                        key={t}
                                                        className="px-3.5 py-2 rounded-2xl text-[0.75rem] font-extrabold border"
                                                        style={{ background: theme.soft, borderColor: theme.border, color: theme.accent }}
                                                    >
                                                        {t}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Performans — yalnız gerçek kayıtlı veriler */}
                                    {factRows.length > 0 && (
                                        <div className="px-5 mt-8">
                                            <SectionTitle icon={<Award size={14} />} title="Performans" />
                                            <div className="flex gap-2.5">
                                                {factRows.map(f => (
                                                    <div key={f.label} className="flex-1 min-w-0 bg-[#11161F] border border-white/[0.06] rounded-2xl px-2 py-3 text-center">
                                                        <div className="text-[0.8125rem] font-extrabold text-white font-numeric truncate">{f.value}</div>
                                                        <div className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-wider mt-1">{f.label}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Hizmet bölgeleri */}
                                    {detail.preferredZones && detail.preferredZones.length > 0 && (
                                        <div className="px-5 mt-8">
                                            <SectionTitle icon={<MapPin size={14} />} title="Hizmet Bölgeleri" />
                                            <div className="flex flex-wrap gap-2">
                                                {detail.preferredZones.map(z => (
                                                    <span key={z} className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[0.6875rem] font-bold text-white/65 capitalize">
                                                        {z}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Müsaitlik */}
                                    {detail.workingHours && (detail.workingHours.activeDays?.length > 0 || detail.workingHours.activeHours) && (
                                        <div className="px-5 mt-8">
                                            <SectionTitle icon={<Clock size={14} />} title="Müsaitlik" />
                                            {detail.workingHours.activeDays?.length > 0 && (
                                                <div className="flex gap-1.5 mb-2.5">
                                                    {DAY_OPTIONS.map(d => {
                                                        const active = detail.workingHours!.activeDays.includes(d.id);
                                                        return (
                                                            <span
                                                                key={d.id}
                                                                className="flex-1 py-2 rounded-xl text-center text-[0.6875rem] font-extrabold border"
                                                                style={active
                                                                    ? { backgroundColor: theme.soft, borderColor: theme.border, color: theme.accent }
                                                                    : { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.25)' }}
                                                            >
                                                                {d.id}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {detail.workingHours.activeHours && (
                                                <p className="text-[0.75rem] font-bold text-white/50 inline-flex items-center gap-1.5">
                                                    <Clock size={12} className="text-ink-4" /> {detail.workingHours.activeHours} saatleri arası
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Değerlendirmeler */}
                                    {detailReviews.length > 0 && (
                                        <div className="px-5 mt-8">
                                            <SectionTitle
                                                icon={<MessageSquare size={14} />}
                                                title="Değerlendirmeler"
                                                right={<span className="text-[0.6875rem] font-extrabold text-ink-4">{detailReviews.length}</span>}
                                            />
                                            <div className="space-y-2.5">
                                                {detailReviews.map(r => (
                                                    <div key={r.id} className="bg-[#11161F] border border-white/[0.06] rounded-2xl p-4">
                                                        <div className="flex items-center justify-between gap-2 mb-1.5">
                                                            <span className="text-[0.75rem] font-extrabold text-white truncate">{r.author}</span>
                                                            <span className="inline-flex items-center gap-1 text-[0.6875rem] font-extrabold text-amber-400 shrink-0">
                                                                <Star size={11} className="fill-amber-400" /> {r.rating}
                                                            </span>
                                                        </div>
                                                        {r.comment && <p className="text-[0.75rem] text-white/55 font-medium leading-relaxed">{r.comment}</p>}
                                                        {r.date && <p className="text-[0.6875rem] font-semibold text-ink-4 mt-2">{r.date}</p>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Güvenli kiralama */}
                                    <div className="px-5 mt-8">
                                        <div className="rounded-3xl border border-white/[0.07] bg-[#11161F] p-5">
                                            <div className="flex items-center gap-2 mb-3.5">
                                                <ShieldCheck size={16} style={{ color: theme.accent }} />
                                                <h3 className="text-[0.8125rem] font-extrabold text-white uppercase tracking-widest">Kiralama Nasıl Çalışacak</h3>
                                            </div>
                                            {/* DİKKAT: kiralama henüz AÇIK DEĞİL (handleConfirmMatch).
                                                Bu blok eskiden "Güvenli Kiralama" başlığıyla ŞİMDİKİ zamanda
                                                yazılmıştı: var olmayan bir kart-bloke/emanet mekanizması
                                                anlatıyordu. Özelliğin kapalı olması sorun değil, olmayan
                                                bir şeyi varmış gibi anlatmak sorundur. */}
                                            <div className="space-y-3">
                                                {[
                                                    { icon: <Wallet size={13} />, text: 'Ücret önce kartında bloke edilecek — anında tahsil edilmeyecek.' },
                                                    { icon: <Hourglass size={13} />, text: `${roleLabel} talebini görecek ve onaylayacak; onaysız işlem yapılmayacak.` },
                                                    { icon: <CheckCircle2 size={13} />, text: 'Ödeme maç kesinleşince tahsil edilecek; gelmezse ücretin iade edilecek.' },
                                                ].map((s, i) => (
                                                    <div key={i} className="flex items-start gap-2.5">
                                                        <span className="mt-0.5 shrink-0 text-ink-4">{s.icon}</span>
                                                        <p className="text-[0.75rem] font-semibold text-white/55 leading-relaxed">{s.text}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            <p className="text-[0.6875rem] font-bold text-ink-4 mt-4 pt-3 border-t border-white/[0.06]">
                                                Sabit ücret · Pazarlık yok · %10 platform komisyonu bedele dahildir
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Alt aksiyon çubuğu — tek yol: sabit ücretle talep gönder (Prensipler §4.3) */}
                                <div className="absolute bottom-0 left-0 w-full px-5 pt-4 pb-safe bg-[#0A0E14]/95 backdrop-blur-md border-t border-white/5 flex gap-3 items-center z-20">
                                    <div className="flex flex-col items-start pr-1 shrink-0">
                                        <span className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-widest">Hizmet Bedeli</span>
                                        <span className="text-xl font-extrabold text-white font-numeric leading-tight">{formatTRYShort(detail.fee)}</span>
                                        <span className="text-[0.6875rem] font-bold text-ink-4">maç başı</span>
                                    </div>
                                    {/* Kiralama kapalıyken tuş HİÇ ÇİZİLMEZ (kurucu, 26 Ağu 2026).
                                        Eski hâli gri bir "yakında" tuşuydu — tam da bayrağın kapatılma
                                        gerekçesi olan Apple 2.1 vaadi. Tuşsuz vitrinde vaat yok: ücret
                                        bilgi olarak durur, işlem sözü verilmez. (Bekçi: magazaKapilari
                                        testi bu dosyada o vaat metnini birebir arar; yorumda bile
                                        geçmemeli.) */}
                                    {KIRALAMA_ACIK && (
                                    <button
                                        onClick={openHireFlow}
                                        disabled={detailUnavailable}
                                        className="flex-1 h-14 rounded-2xl font-extrabold text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] disabled:active:scale-100"
                                        style={detailUnavailable
                                            ? { backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }
                                            : { backgroundColor: theme.accent, color: '#0A0E14', boxShadow: `0 8px 24px ${theme.accent}30` }}
                                    >
                                        {detailUnavailable ? (
                                            'Şu An Müsait Değil'
                                        ) : (
                                            <><Zap size={14} /> Maç Seç ve Talep Gönder</>
                                        )}
                                    </button>
                                    )}
                                </div>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
};

export default Marketplace;
