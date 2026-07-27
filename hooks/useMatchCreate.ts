import { useState, useEffect, useMemo, useCallback } from 'react';
import { Pitch, AppView, PositionSlot, Player, MatchListing } from '../types';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import { getFullUserProfile } from '../services/userService';
import { getTeamSquad } from '../services/teamSocialService';
import { DeferredProvider } from '../services/matchLifecycleService';
import { getWalletSummary, WalletSummary } from '../services/walletService';
import { showToast } from '../components/common/GlobalToast';
import { FORMATIONS, defaultFormation, type SquadSize } from '../utils/formations';
import { deriveMissingPositions } from '../utils/matchPositions';
import { roleShort } from '../shared/lobbyEnrichment';

// ── Profil → maç seçeneği otomatik-işaretleme yardımcıları ──────────────────
// Kullanıcının profil verisinden (doğum tarihi, mevki) maç oluşturma
// varsayılanlarını türetir. Veri yoksa sessizce mevcut varsayılan korunur.
const ageBucketFromBirthdate = (birthdate?: string | null): string | null => {
  if (!birthdate) return null;
  const year = new Date(birthdate).getFullYear();
  if (!year || Number.isNaN(year)) return null;
  const age = new Date().getFullYear() - year;
  if (age <= 0 || age > 120) return null;
  if (age < 14) return '10-14';
  if (age < 16) return '14-16';
  if (age < 18) return '16-18';
  if (age < 23) return '18-22';
  if (age < 28) return '23-27';
  if (age <= 35) return '28-35';
  return '35+';
};

// Sahadaki mevki metnini (ör. "Kaleci", "Orta Saha") slot rol koduna eşler.
const roleFromPositionText = (pos?: string | null): 'KL' | 'SAV' | 'ORT' | 'HÜC' => {
  const p = (pos || '').toLocaleLowerCase('tr-TR');
  if (p.includes('kale')) return 'KL';
  if (p.includes('stop') || p.includes('defans') || p.includes('bek') || p.includes('savun') || p.includes('libero')) return 'SAV';
  if (p.includes('forvet') || p.includes('kanat') || p.includes('santr') || p.includes('hücum') || p.includes('huc')) return 'HÜC';
  return 'ORT';
};

export const FORMATS = [
  { v: '3v3', label: '3v3', players: 6,  popular: false },
  { v: '4v4', label: '4v4', players: 8,  popular: false },
  { v: '5v5', label: '5v5', players: 10, popular: false },
  { v: '6v6', label: '6v6', players: 12, popular: false },
  { v: '7v7', label: '7v7', players: 14, popular: true  },
  { v: '8v8', label: '8v8', players: 16, popular: true  },
  { v: '9v9', label: '9v9', players: 18, popular: false },
  { v: '10v10', label: '10v10', players: 20, popular: false },
  { v: '11v11', label: '11v11', players: 22, popular: false },
];

export const useMatchCreate = (onNavigate: (view: AppView) => void) => {
  // REFUND: Kapora & İade Kuralları sayfası · WALLET: cüzdan yükleme overlay'i
  // (WalletScreen sheet olarak açılır ki maç kurulum formu KAYBOLMASIN).
  const [activeSheet, setActiveSheet] = useState<'RULES' | 'PITCH' | 'PLAYER_PICKER' | 'SUPPORT' | 'REFUND' | 'WALLET' | 'NONE'>('NONE');
  const [isPublishing, setIsPublishing] = useState(false);
  const [pickerTab, setPickerTab] = useState<'FRIENDS' | 'TEAMS'>('FRIENDS');
  const [pickerCategory, setPickerCategory] = useState('Tümü');
  const [friendSearch, setFriendSearch] = useState('');
  const [selectedFriendsForPicker, setSelectedFriendsForPicker] = useState<string[]>([]);
  const [selectedSlotForPicker, setSelectedSlotForPicker] = useState<string | null>(null);
  
  const [format, setFormat] = useState<typeof FORMATS[number]>(FORMATS[4]);
  const [dna, setDna] = useState<{
      budget: string;
      duration: string;
      mentality: string;
      gender: string;
      age: string[];
      role: string;
  }>({
      budget: '',
      duration: '60 Dakika',
      mentality: 'ciddi',
      gender: 'Karma',
      age: ['Tümü'],
      role: ''
  });
  const [manualBudget, setManualBudget] = useState<number | null>(null);
  const [matchTitle, setMatchTitle] = useState('');
  const [homeTeamName, setHomeTeamName] = useState('');
  const [awayTeamName, setAwayTeamName] = useState('');
  const [visibility, setVisibility] = useState<'OPEN' | 'PRIVATE'>('OPEN'); // FAZ 3: özel maç (kodla davet)
  // S38: Takım Maçı — kendi takımını seç, rakip tarafı (away) kodla davet edilir
  const [isTeamMatch, setIsTeamMatch] = useState(false);
  const [homeTeamId, setHomeTeamId] = useState<string | null>(null);
  // Maç oluştururken seçilen kaleci/hakem — aktivasyonda talep gönderilir (escrow).
  const [deferredProviders, setDeferredProviders] = useState<DeferredProvider[]>([]);

  const [myPlayers, setMyPlayers] = useState<Record<string, { id: string; name: string; avatar: string; status?: 'PENDING' | 'CONFIRMED' }>>({});
  const [selectedPitch, setSelectedPitch] = useState<Pitch | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<{ date: string; time: string } | null>(null);
  
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [customPositions, setCustomPositions] = useState<Record<string, {x: number, y: number, role: string}>>({});

  const { incrementUnreadNotifications, addUserNotification, addMatch, adminMatches, activeDraftId, updateMatch, setActiveDraftId, matchCreateSeed, setMatchCreateSeed, setSelectedMatch, myTeams, adminUsers } = useAppStore();

  // Kullanıcı profilinden tek-seferlik otomatik ön-doldurma yapıldı mı?
  const [profilePrefilled, setProfilePrefilled] = useState(false);

  // FAZ 3: Rezervasyon → Maça Çevir tohumu (Maçlarım hub'ındaki rezervasyon kartından) — saha + saat ön-doldur
  useEffect(() => {
    if (!matchCreateSeed) return;
    setSelectedPitch({
      id: matchCreateSeed.pitchId || 'seed-pitch',
      name: matchCreateSeed.pitchName || 'Saha',
      district: matchCreateSeed.district || '',
      location: matchCreateSeed.district || '',
      image: '',
      price: matchCreateSeed.price ?? 0,
      type: 'OPEN', slots: [], features: [],
    } as any);
    if (matchCreateSeed.date && matchCreateSeed.time) {
      setSelectedTimeSlot({ date: matchCreateSeed.date, time: matchCreateSeed.time });
    }
    setMatchCreateSeed(null); // tek seferlik; tekrar tetiklenmesin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchCreateSeed]);

  const draftMatch = useMemo(() => adminMatches.find(m => m.id === activeDraftId), [activeDraftId, adminMatches]);
  const isDraftMode = !!draftMatch;

  useEffect(() => {
      if (draftMatch) {
          setSelectedPitch({
              id: 'draft-pitch',
              name: draftMatch.title.replace(' Maçı', ''),
              district: draftMatch.location,
              location: draftMatch.location,
              image: draftMatch.image,
              price: draftMatch.price,
              type: 'OPEN', slots: [], features: []
          } as any);
          setSelectedTimeSlot({ date: draftMatch.date, time: draftMatch.time });
          if (draftMatch.slots) {
              const playersRecord: Record<string, any> = {};
              draftMatch.slots.forEach(s => {
                  if (s.player) playersRecord[s.id] = { ...s.player, status: s.player.paymentStatus === 'PAID' ? 'CONFIRMED' : 'PENDING' };
              });
              setMyPlayers(playersRecord);
          }
      }
  }, [draftMatch]);

  const perTeam = useMemo(() => parseInt(format.v.split('v')[0]) || 7, [format.v]);
  const isReady = !!(selectedPitch && selectedTimeSlot);

  // Kanonik formasyon (utils/formations SSOT) — HER boyut kendi mantıklı temel
  // dizilişini alır (5v5 '1-2-1', 6v6 '2-2-1', 7v7 '2-3-1', 8v8 '3-3-1' ...).
  // Rol kodları (GK/DEF/MID/FWD) create'in TR kısaltmalarına (KL/SAV/ORT/HÜC)
  // eşlenir; lobi de aynı SSOT'u kullandığı için diziliş sahaya birebir yansır.
  const getSymmetricPositions = (pt: number, orient: 'vertical' | 'horizontal') => {
    const size = `${pt}v${pt}` as SquadSize;
    const preset = FORMATIONS[size]?.[defaultFormation(size)];
    const base = (preset && preset.length === pt)
      ? preset.map(s => ({ x: s.x, y: s.y, role: roleShort(s.role) }))
      : Array.from({ length: pt }).map((_, i) => ({
          x: 50,
          y: 90 - i * (65 / Math.max(pt - 1, 1)),
          role: i === 0 ? 'KL' : 'ORT',
        }));

    if (orient === 'horizontal') {
      return base.map(p => ({ role: p.role, x: 100 - p.y, y: p.x }));
    }
    return base;
  };

  const handleSlotMove = (slotId: string, x: number, y: number) => {
      setCustomPositions(prev => {
          const next = { ...prev };
          const role = calculateRole(x, y, orientation);
          next[slotId] = { x, y, role };
          return next;
      });
  };

  const calculateRole = (x: number, y: number, orient: 'vertical' | 'horizontal') => {
     if (orient === 'vertical') {
         if (y > 80) return 'KL';
         if (y > 55) return 'SAV';
         if (y > 35) return 'ORT';
         return 'HÜC';
     } else {
         if (x < 20) return 'KL';
         if (x < 45) return 'SAV';
         if (x < 65) return 'ORT';
         return 'HÜC';
     }
  };

  const pitchSlots = useMemo(() => {
    return Array.from({ length: perTeam }).map((_, i) => {
      const id = `slot_${i}`;
      const defaults = getSymmetricPositions(perTeam, orientation);
      const defPos = defaults[i % defaults.length];
      
      const pos = customPositions[id] || defPos;
      return {
          id,
          role: pos.role,
          x: pos.x,
          y: pos.y,
          player: myPlayers[id] || null
      };
    });
  }, [perTeam, orientation, customPositions, myPlayers]);

  const toggleOrientation = () => {
      const newOrient = orientation === 'vertical' ? 'horizontal' : 'vertical';
      
      setCustomPositions(prev => {
          const next = { ...prev };
          for (const k in next) {
              const p = next[k];
              next[k] = {
                  role: p.role,
                  x: 100 - p.y,
                  y: p.x
              };
          }
          return next;
      });
      
      setOrientation(newOrient);
  };

  // Kişi başı ücret KURUCU tarafından belirlenemez: sahanın toplam ücreti iki
  // takımdaki toplam oyuncuya (perTeam×2) bölünür. Maç-oluşturma arayüzünden
  // kurulan maçlarda kullanıcıya %5 fazla yansır (platform hizmet payı). Yukarı yuvarlanır.
  const MATCH_CREATE_SURCHARGE = 1.05;
  const calculatedBudget = useMemo(() => {
    // totalPrice yoksa (seed/taslak sahte Pitch'lerinde olmayabilir) NaN'a düşme.
    if (!selectedPitch || !selectedPitch.totalPrice) return 0;
    return Math.ceil((selectedPitch.totalPrice / (perTeam * 2)) * MATCH_CREATE_SURCHARGE);
  }, [selectedPitch, perTeam]);

  // Manuel override kaldırıldı — ücret her zaman otomatik hesaplanır.
  const costPerPerson = calculatedBudget;

  // ── Talep edilen kapora (owner'ın tarifesinden; yoksa toplam ücretin %20'si) ──
  // Maç "Yayınla" anında bu tutar kaptanın kartında BLOKE edilir (çekilmez);
  // maç kesinleşince (eşik) tahsil, dolmazsa serbest bırakılır.
  const matchDeposit = useMemo(() => {
    if (!selectedPitch) return 0;
    const tariffs = (selectedPitch as unknown as { tariffs?: { deposit_amount?: number }[] }).tariffs;
    const ownerDeposit = (tariffs || [])
      .map(t => Number(t?.deposit_amount) || 0)
      .find(d => d > 0);
    if (ownerDeposit && ownerDeposit > 0) return Math.ceil(ownerDeposit);
    return selectedPitch.totalPrice ? Math.ceil(selectedPitch.totalPrice * 0.2) : 0;
  }, [selectedPitch]);

  // ── Cüzdan bakiyesi (MOB-P1) ─────────────────────────────────────────────
  // Kapora cüzdandan bloke edildiği için yayın öncesi harcanabilir bakiye
  // bilinmeli: yetersizse maç HİÇ yaratılmaz (öksüz maç + ödeme ekranında
  // duvara toslama yerine yerinde uyarı + yükleme kısayolu). Bakiye
  // öğrenilemezse (ağ/misafir) ENGELLEME yok — son sözü sunucu söyler.
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const refreshWallet = useCallback(async () => {
    if (!auth.currentUser) { setWalletSummary(null); return; }
    try {
      setWalletSummary(await getWalletSummary());
    } catch {
      setWalletSummary(null); // bilinmiyor — publish akışı sunucu kontrolüne düşer
    }
  }, []);
  useEffect(() => { void refreshWallet(); }, [refreshWallet]);

  const spendableBalance = walletSummary?.spendableBalance ?? null;
  const missingBalance = useMemo(() => {
    if (matchDeposit <= 0 || spendableBalance == null) return 0;
    return Math.max(0, Math.ceil(matchDeposit - spendableBalance));
  }, [matchDeposit, spendableBalance]);

  // ── UX: Profile göre otomatik ön-doldurma (tek sefer) ────────────────────
  // Kurucu, maçı kurarken zaten oynayacak: onu kendi mevkisine göre sahaya
  // dizeriz ve yaş grubu varsayılanını doğum tarihinden işaretleriz.
  // Seed/taslak akışlarına dokunmaz (onlar zaten kendi verisini doldurur).
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || profilePrefilled) return;
    if (matchCreateSeed || draftMatch) { setProfilePrefilled(true); return; }
    let alive = true;
    (async () => {
      try {
        const profile = await getFullUserProfile(uid);
        if (!alive || !profile) return;
        // 1) Yaş grubu — doğum tarihinden (kullanıcı elle değiştirmediyse)
        const bucket = ageBucketFromBirthdate(profile.birthdate);
        if (bucket) {
          setDna(prev => (prev.age && prev.age.length && prev.age[0] !== 'Tümü') ? prev : { ...prev, age: [bucket] });
        }
        // 2) (Tek lobi P4) Kurucuyu ücretsiz sahaya dizme KALDIRILDI: kurucu
        // eşitliği — kurucu da yayın sonrası kendi lobisinden slot satın alır.
      } catch {
        /* prefill best-effort — profil çekilemezse sessizce varsayılan kalır */
      } finally {
        if (alive) setProfilePrefilled(true);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilePrefilled, matchCreateSeed, draftMatch]);

  // ── Takım kadrosunu sahaya diz (yeni sosyal sistem: get_team_squad) ──────
  // Legacy t.roster yeni takımlarda boş olduğu için kanonik get_team_squad
  // RPC'sinden çeker; homeTeamId/homeTeamName'i de kaydeder (publish'te yazılır).
  // (Tek lobi P4) Takım seçimi artık yalnız YAPI yazar (homeTeamId/homeTeamName):
  // kadro ücretsiz dizilmez — üyeler yayın sonrası slot satın alarak katılır
  // (kaptan isterse toplu alıp lobiden atar).
  const loadSquadFromTeam = useCallback(async (teamId: string, teamName?: string) => {
    try {
      const squad = await getTeamSquad(teamId);
      setHomeTeamId(teamId);
      if (teamName) setHomeTeamName(teamName);
      showToast(`${teamName || 'Takım'} seçildi — üyeler lobiden slot alarak katılır.`);
      return squad.length;
    } catch (e) {
      console.warn('[useMatchCreate] takım kadrosu yüklenemedi:', e);
      return 0;
    }
  }, []);

  // ── Yayınlanabilirlik durumu (canlı checklist + engel sebebi) ────────────
  // Kadro sayısı SAHADAKİ (görünür) oyunculardan türetilir — format küçültülünce
  // görünmeyen (yetim) myPlayers girdileri sayıma dahil olmaz.
  const squadCount = useMemo(() => pitchSlots.filter(s => s.player).length, [pitchSlots]);
  const readiness = useMemo(() => {
    const hasPitch = !!selectedPitch;
    const hasTime = !!selectedTimeSlot;
    const canPublish = hasPitch && hasTime;
    let blockReason = '';
    if (!hasPitch && !hasTime) blockReason = 'Önce saha ve saat seç';
    else if (!hasPitch) blockReason = 'Saha seç';
    else if (!hasTime) blockReason = 'Saat seç';
    else if (isTeamMatch && !homeTeamId && squadCount === 0) blockReason = 'Ev sahibi takımı belirle';
    return { hasPitch, hasTime, squadCount, perTeam, canPublish, blockReason };
  }, [selectedPitch, selectedTimeSlot, squadCount, perTeam, isTeamMatch, homeTeamId]);

  const publishMatch = async () => {
    if (!isReady) {
      setActiveSheet('PITCH');
      return;
    }

    // MOB-P1: yayın anında TAZE bakiye kontrolü — kapora karşılanamıyorsa maç
    // yaratılmaz; kullanıcı yükleme overlay'ine yönlendirilir (form korunur).
    if (matchDeposit > 0 && auth.currentUser) {
      let summary: WalletSummary | null = walletSummary;
      try {
        summary = await getWalletSummary();
        setWalletSummary(summary);
      } catch { /* bakiye öğrenilemedi — engelleme; RPC zaten yetersizde reddeder */ }
      if (summary && summary.spendableBalance < matchDeposit) {
        showToast(`Cüzdan bakiyen yetersiz — ${Math.ceil(matchDeposit - summary.spendableBalance)}₺ daha yüklemen gerekiyor.`);
        useAppStore.getState().setWalletInitialTab('TOPUP');
        setActiveSheet('WALLET');
        return;
      }
    }

    // S38: Takım Maçı — kendi takımın (ev sahibi) + rakip tarafı (away) kodla davet.
    // Ev sahibi takım kimliği state'ten doğrudan yazılır; store.myTeams (legacy)
    // yeni sosyal takımları içermeyebilir — bu yüzden homeTeamId'ye güvenilir.
    const teamObj = homeTeamId ? myTeams.find(t => t.id === homeTeamId) : null;
    const resolvedHomeTeamName = homeTeamName.trim() || teamObj?.name || '';
    const resolvedHomeTeamId = homeTeamId || teamObj?.id || undefined;
    // TEK LOBİ KURALI: oluşturma YAPI kurar (diziliş/rol/koordinat) — doluluk
    // YALNIZ satın almayla olur. Sunucu (player_create_match) zaten normalize
    // eder; burada da dürüst UI: hiçbir slot TAKEN/player ile yayınlanmaz.
    const homeSlots: PositionSlot[] = pitchSlots.map((slot): PositionSlot => ({
      id: slot.id,
      role: slot.role,
      x: slot.x,
      y: slot.y,
      status: 'OPEN',
      ...(isTeamMatch ? { side: 'HOME' as const } : {}),
    }));
    // Rakip tarafı (awaySlots) HER ZAMAN üretilir — maç iki takımdır; eşik (toplam−2)
    // ve kişi başı ücret (perTeam×2) bunun üzerinden hesaplanır. Takım maçında side:'AWAY'.
    const awaySlots: PositionSlot[] = pitchSlots.map((slot, i): PositionSlot => ({
      id: `away_${i}`,
      role: slot.role,
      x: slot.x,
      y: slot.y,
      status: 'OPEN',
      ...(isTeamMatch ? { side: 'AWAY' as const } : {}),
    }));
    // Takım maçı kodla davet edildiği için PRIVATE (paylaşılabilir kod üretilir).
    const effectiveVisibility = isTeamMatch ? 'PRIVATE' : visibility;

    // pitch_id yalnız GERÇEK uuid ise gönderilir: seed/taslak sahte id'leri
    // ('seed-pitch', 'draft-pitch') sunucudaki ::uuid cast'ini 400'e düşürüp
    // maçı sessizce "yayınlanamadı"ya çeviriyordu. Uuid değilse null bağla.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safePitchId = selectedPitch?.id && UUID_RE.test(selectedPitch.id) ? selectedPitch.id : undefined;

    const matchData = {
        id: 'm_' + Math.random().toString(36).substr(2, 9),
        creatorId: auth.currentUser?.uid,
        title: matchTitle.trim() || (resolvedHomeTeamName ? `${resolvedHomeTeamName} Takım Maçı` : `${selectedPitch?.name || 'Saha'} Maçı`),
        homeTeamName: resolvedHomeTeamName || undefined,
        homeTeamId: resolvedHomeTeamId,   // S38: ev sahibi gerçek takım (state otoritesi)
        awayTeamName: awayTeamName.trim() || undefined,
        location: selectedPitch?.district || 'Belirtilmedi',
        pitchId: safePitchId,            // FAZ 3: owner kredisi + iade için saha bağı (yalnız uuid)
        visibility: effectiveVisibility,       // FAZ 3: OPEN (vitrin) | PRIVATE (kodla davet)
        time: selectedTimeSlot?.time || '',
        date: selectedTimeSlot?.date || '',
        price: costPerPerson,
        difficulty: (dna.mentality === 'ciddi' ? 'Ciddi' : dna.mentality === 'taktiksel' ? 'Taktiksel' : 'Rahat') as 'Ciddi' | 'Taktiksel' | 'Rahat',
        format: format.v,
        duration: dna.duration,
        gender: dna.gender,
        ageGroup: Array.isArray(dna.age) ? dna.age.join(', ') : dna.age,
        // K2 kararı: varsayılan puan barajı YOK — maç herkese açık (0 = kilitsiz).
        // Yeni/rookie oyuncunun tüm vitrini kilitli görmesi (soğuk-başlangıç
        // çıkmazı) böylece kalkar. Kurucu-ayarlı baraj ayrı bir özellik olacak.
        minRating: 0,
        image: selectedPitch?.image || 'https://images.unsplash.com/photo-1575361204480-aadea2559ee2?q=80&w=600',
        badges: ['Fair Play Vurgulu', `${format.label}`],
        // B9: eksik pozisyonlar GERÇEK açık slotlardan türetilir — eski sabit
        // "1 STP + 1 ORT" dolu maçta bile sahte "ARANIYOR" rozeti üretiyordu.
        missingPositions: deriveMissingPositions([...homeSlots, ...awaySlots]),
        slots: homeSlots,
        awaySlots,
    };

    try {
        setIsPublishing(true);
        const isPrivate = effectiveVisibility === 'PRIVATE';
        let targetId: string | undefined;
        if (isDraftMode && draftMatch) {
            // FAZ 3: taslağı maça çevirirken görünürlüğü de gönder (PRIVATE'a geçişte DB kod üretir)
            await updateMatch({ ...draftMatch, status: 'ACTIVE', slots: matchData.slots, awaySlots, format: format.v, duration: dna.duration, gender: dna.gender, ageGroup: Array.isArray(dna.age) ? dna.age.join(', ') : dna.age, visibility: effectiveVisibility, ...(resolvedHomeTeamId ? { homeTeamName: resolvedHomeTeamName || undefined, homeTeamId: resolvedHomeTeamId } : {}) });
            setActiveDraftId(null);
            targetId = draftMatch.id;
        } else {
            targetId = await addMatch(matchData);
        }

        // Escrow (CÜZDAN-ÖNCELİKLİ): kapora birleşik ödeme ekranında CÜZDANDAN
        // güvenceye alınır — kart yok, PSP maliyeti yok. Maç dolmazsa/iptalde tutar
        // otomatik iade kredisine döner. deferredProviders blokajla gönderilir.
        const goesToPayment = !!targetId && matchDeposit > 0;
        if (goesToPayment && targetId) {
          const store = useAppStore.getState();
          const baseMatch = (isDraftMode && draftMatch ? draftMatch : matchData) as unknown as MatchListing;
          setSelectedMatch({ ...baseMatch, id: targetId, ...(isPrivate ? { visibility: 'PRIVATE' as const } : {}) });
          store.setPaymentContext({
            kind: 'MATCH_CREATE_DEPOSIT',
            badge: 'MAÇ OLUŞTUR',
            title: matchData.title,
            subtitle: `${selectedPitch?.name || 'Saha'} · ${selectedTimeSlot?.date || ''} ${selectedTimeSlot?.time || ''}`.trim(),
            details: [
              { icon: 'pin' as const, text: selectedPitch?.name || 'Saha' },
              ...(selectedTimeSlot?.date ? [{ icon: 'calendar' as const, text: selectedTimeSlot.date }] : []),
              ...(selectedTimeSlot?.time ? [{ icon: 'clock' as const, text: selectedTimeSlot.time }] : []),
            ],
            amount: matchDeposit,
            amountLabel: 'Ödenecek Kapora',
            amountHint: 'Kapora ile saha sana kilitlenir; oyuncular katıldıkça payını geri alırsın.',
            isDeposit: true,
            allowBalance: true,
            balanceOnly: true,
            successTitle: 'Kapora Onaylandı!',
            successSubtitle: 'Saha sana kilitlendi',
            infoNote: 'Kapora cüzdan bakiyenden güvenceye alınır. Maç dolunca kesinleşir; dolmazsa veya iptal olursa tutar anında iade kredisi olarak cüzdanına döner.',
            matchId: targetId,
            deferredProviders,
          });
        }

        // (Tek lobi P4) Yayında yerel "davet" bildirimi üretimi kaldırıldı —
        // gerçek davetler lobide player_assign_slot ile (sunucu bildirimli) yapılır.

        // Kapora gerekiyorsa ödeme ekranına. Kapora yoksa (ücretsiz saha) maç
        // ZATEN oluştu → kurucu HER ZAMAN lobiye gider (davet/kod paylaşımı orada).
        // Eskiden açık+kaporasız maç vitrine (MATCH_DISCOVERY) düşüyordu; kurucu
        // "davet edemedim" diyordu — artık açık maçta da lobiye götürüyoruz.
        if (goesToPayment) {
            onNavigate('PAYMENT');
        } else if (targetId) {
            const baseMatch = (isDraftMode && draftMatch ? draftMatch : matchData) as unknown as MatchListing;
            setSelectedMatch({ ...baseMatch, id: targetId, ...(isPrivate ? { visibility: 'PRIVATE' as const } : {}) });
            onNavigate('MATCH_JOIN');
        } else {
            onNavigate('MATCH_DISCOVERY');
        }
    } catch(err) {
        console.error("Maç yayınlanamadı:", err);
        // Görünür geri bildirim: bildirim zili gözden kaçabildiği için toast da göster.
        const reason = err instanceof Error ? err.message : '';
        showToast(reason ? `Maç yayınlanamadı: ${reason}` : 'Maç yayınlanamadı. Lütfen tekrar dene.');
        addUserNotification({
            id: `err-publish-${Date.now()}`,
            type: 'SYSTEM',
            title: 'Maç Yayınlanamadı',
            desc: reason || 'Lütfen tekrar dene.',
            time: 'Az önce',
            iconName: 'AlertCircle',
            color: 'bg-red-500',
            textColor: 'text-red-500',
        });
    } finally {
        setIsPublishing(false);
    }
  };

  return {
    activeSheet, setActiveSheet,
    isPublishing,
    pickerTab, setPickerTab,
    pickerCategory, setPickerCategory,
    friendSearch, setFriendSearch,
    selectedFriendsForPicker, setSelectedFriendsForPicker,
    selectedSlotForPicker, setSelectedSlotForPicker,
    format, setFormat,
    dna, setDna,
    manualBudget, setManualBudget,
    matchTitle, setMatchTitle,
    homeTeamName, setHomeTeamName,
    awayTeamName, setAwayTeamName,
    visibility, setVisibility,
    isTeamMatch, setIsTeamMatch,
    homeTeamId, setHomeTeamId,
    deferredProviders, setDeferredProviders,
    myPlayers, setMyPlayers,
    selectedPitch, setSelectedPitch,
    selectedTimeSlot, setSelectedTimeSlot,
    orientation, setOrientation,
    customPositions, setCustomPositions,
    draftMatch, isDraftMode,
    perTeam, isReady,
    handleSlotMove, pitchSlots,
    toggleOrientation, calculatedBudget, costPerPerson, matchDeposit,
    loadSquadFromTeam, readiness, squadCount,
    spendableBalance, missingBalance, refreshWallet,
    publishMatch
  };
};
