import React, { useState } from 'react';
import {
  ArrowLeft, MapPin, Clock, Calendar, Zap, Hand, Scale,
  X, Loader2, ChevronRight, Diamond, Search, UserPlus,
  Plus, CheckCircle2, Users, Star, Wifi, WifiOff,
  Send, AlertCircle, Shield, Layers, Droplets, Award,
  DollarSign, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchListing, PositionSlot, UserRole, Player } from '../types';
import { useAppStore } from '../store';
import { auth } from '../firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatchJoinProps {
  match: MatchListing | null;
  onBack: () => void;
  onJoin: () => void;
}

type SlotInviteStatus = 'NONE' | 'INVITED' | 'ACCEPTED';

// ─── Studio FORMATIONS — Birebir Kopya (Simetri Garantisi) ───────────────────
// Bu koordinatlar Studio.tsx'in FORMATIONS sabitinden alınmıştır.
// Herhangi bir hesaplama yapılmaz — direkt atama ile %100 simetri sağlanır.

const FORMATIONS: Record<string, Record<string, { x: number; y: number; role: string }[]>> = {
  '5v5': {
    '1-2-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 50, y: 75, role: 'DEF' },
      { x: 25, y: 50, role: 'MID' },
      { x: 75, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
    '2-1-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 30, y: 75, role: 'DEF' },
      { x: 70, y: 75, role: 'DEF' },
      { x: 50, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
  },
  '6v6': {
    '2-2-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 30, y: 75, role: 'DEF' },
      { x: 70, y: 75, role: 'DEF' },
      { x: 30, y: 50, role: 'MID' },
      { x: 70, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
    '3-1-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 50, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 50, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
  },
  '7v7': {
    '2-3-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 25, y: 75, role: 'DEF' },
      { x: 75, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 50, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
    '3-2-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 50, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 35, y: 50, role: 'MID' },
      { x: 65, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
    '2-2-2': [
      { x: 50, y: 90, role: 'GK' },
      { x: 30, y: 75, role: 'DEF' },
      { x: 70, y: 75, role: 'DEF' },
      { x: 30, y: 50, role: 'MID' },
      { x: 70, y: 50, role: 'MID' },
      { x: 35, y: 25, role: 'FWD' },
      { x: 65, y: 25, role: 'FWD' },
    ],
  },
  '8v8': {
    '3-3-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 50, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 50, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
    '4-2-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 40, y: 75, role: 'DEF' },
      { x: 60, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 35, y: 50, role: 'MID' },
      { x: 65, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
  },
  '9v9': {
    '3-3-2': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 50, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 50, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 35, y: 25, role: 'FWD' },
      { x: 65, y: 25, role: 'FWD' },
    ],
    '4-3-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 40, y: 75, role: 'DEF' },
      { x: 60, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 50, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
  },
  '10v10': {
    '4-3-2': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 40, y: 75, role: 'DEF' },
      { x: 60, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 50, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 35, y: 25, role: 'FWD' },
      { x: 65, y: 25, role: 'FWD' },
    ],
    '4-4-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 40, y: 75, role: 'DEF' },
      { x: 60, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 40, y: 50, role: 'MID' },
      { x: 60, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
  },
  '11v11': {
    '4-4-2': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 40, y: 75, role: 'DEF' },
      { x: 60, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 40, y: 50, role: 'MID' },
      { x: 60, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 35, y: 25, role: 'FWD' },
      { x: 65, y: 25, role: 'FWD' },
    ],
    '4-3-3': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 40, y: 75, role: 'DEF' },
      { x: 60, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 50, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 20, y: 25, role: 'FWD' },
      { x: 50, y: 25, role: 'FWD' },
      { x: 80, y: 25, role: 'FWD' },
    ],
  },
};

// Slot sayısından format tahmini
const inferSquadSize = (slotCount: number): string => {
  if (slotCount <= 5) return '5v5';
  if (slotCount <= 6) return '6v6';
  if (slotCount <= 7) return '7v7';
  if (slotCount <= 8) return '8v8';
  if (slotCount <= 9) return '9v9';
  if (slotCount <= 10) return '10v10';
  return '11v11';
};

// Studio ile %100 Uyumlu Kanonik Koordinat Atayıcı (Rol ve Yatay Simetri Odaklı Eşleme)
const applyCanonicalCoords = (slots: PositionSlot[]): PositionSlot[] => {
  if (!slots || slots.length === 0) return [];
  const size = inferSquadSize(slots.length);
  const formationsForSize = FORMATIONS[size];
  if (!formationsForSize) return slots;
  // İlk mevcut formasyonu al (en yaygın format)
  const firstFormation = Object.values(formationsForSize)[0];
  if (!firstFormation) return slots;

  // Rol gruplarını normalize eden yardımcı fonksiyon
  const normalizeRole = (role: string): string => {
    const r = (role || '').toUpperCase();
    if (r === 'GK' || r === 'KL' || r === 'KALECİ' || r === 'K') return 'GK';
    if (r === 'DEF' || r === 'SAV' || r === 'STP' || r === 'STOPER' || r === 'S' || r === 'LB' || r === 'RB' || r === 'CB') return 'DEF';
    if (r === 'MID' || r === 'ORT' || r === 'OS' || r === 'ORTA SAHA' || r === 'M' || r === 'CM' || r === 'CDM' || r === 'CAM') return 'MID';
    if (r === 'FWD' || r === 'HÜC' || r === 'SNT' || r === 'HÜCUM' || r === 'F' || r === 'ST' || r === 'CF' || r === 'LW' || r === 'RW') return 'FWD';
    return 'MID';
  };

  // Kanonik koordinatları rollerine göre grupla
  const canonicalByRole: Record<string, { x: number; y: number; role: string }[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: []
  };
  firstFormation.forEach(coord => {
    const norm = normalizeRole(coord.role);
    if (canonicalByRole[norm]) {
      canonicalByRole[norm].push(coord);
    }
  });

  // Her rol grubunu kendi içinde X eksenine göre (soldan sağa) sırala
  Object.keys(canonicalByRole).forEach(key => {
    canonicalByRole[key].sort((a, b) => a.x - b.x);
  });

  // Gelen slotları rollerine göre grupla
  const slotsByRole: Record<string, PositionSlot[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: []
  };
  slots.forEach(slot => {
    const norm = normalizeRole(slot.role);
    if (slotsByRole[norm]) {
      slotsByRole[norm].push(slot);
    }
  });

  // Gelen slotları kendi içlerinde X koordinatlarına (varsa) göre sırala ki eşleşme yatayda tutarlı olsun
  Object.keys(slotsByRole).forEach(key => {
    slotsByRole[key].sort((a, b) => (a.x || 0) - (b.x || 0));
  });

  const result: PositionSlot[] = [];
  const usedCanonicalKeys = new Set<string>();

  // İlk Geçiş: Slotları kendi rol grubundaki kanonik koordinatlarla eşle
  Object.keys(slotsByRole).forEach(role => {
    const groupSlots = slotsByRole[role];
    const groupCoords = canonicalByRole[role];

    groupSlots.forEach((slot, index) => {
      const coord = groupCoords[index];
      if (coord) {
        result.push({
          ...slot,
          x: coord.x,
          y: coord.y
        });
        usedCanonicalKeys.add(`${coord.x},${coord.y}`);
      } else {
        // Rol grubunda kanonik koordinat kalmadıysa geçici olarak işaretle
        result.push({ ...slot, x: -1, y: -1 });
      }
    });
  });

  // İkinci Geçiş: Eşleşmeyen slotları (x=-1, y=-1) boşta kalan kanonik koordinatlara dağıt
  const unusedCoords = firstFormation.filter(c => !usedCanonicalKeys.has(`${c.x},${c.y}`));
  let unusedIdx = 0;

  const finalResult = result.map(slot => {
    if (slot.x === -1 && slot.y === -1) {
      const coord = unusedCoords[unusedIdx++];
      if (coord) {
        return { ...slot, x: coord.x, y: coord.y };
      } else {
        const original = slots.find(s => s.id === slot.id);
        return { ...slot, x: original?.x || 50, y: original?.y || 50 };
      }
    }
    return slot;
  });

  return finalResult;
};

// ─── Difficulty Badge Renk Sistemi ─────────────────────────────────────────

const difficultyConfig: Record<string, { color: string; glow: string; label: string }> = {
  'Ciddi':     { color: '#FF3B3B', glow: 'rgba(255,59,59,0.4)',   label: 'CİDDİ'      },
  'Taktiksel': { color: '#FFFF00', glow: 'rgba(255,255,0,0.4)',   label: 'TAKTİKSEL'  },
  'Rahat':     { color: '#39FF14', glow: 'rgba(57,255,20,0.4)',   label: 'RAHAT'      },
};

const getQualityGrade = (score: number): string => {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  return 'C';
};

const getGradeColorClass = (grade: string): string => {
  if (grade.startsWith('A')) return 'text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.4)]';
  if (grade.startsWith('B')) return 'text-[#FFFF00] drop-shadow-[0_0_8px_rgba(255,255,0,0.4)]';
  return 'text-orange-400';
};

const getCommunityName = (id?: string): string => {
  if (!id) return 'Genel Katılım';
  if (id === 'c1') return 'Boğaziçi Üniversitesi';
  if (id === 'c2') return 'Trendyol Tech';
  if (id === 'c3') return 'Kadıköy Ligi';
  return 'İTÜ Futbol';
};

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────

const MatchJoin: React.FC<MatchJoinProps> = ({ match, onBack, onJoin }) => {

  // ── State ────────────────────────────────────────────────────────────────
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hireModalType, setHireModalType] = useState<'GK' | 'REF' | null>(null);
  const [hiringState, setHiringState] = useState<{ gk: 'IDLE' | 'BROADCASTING'; ref: 'IDLE' | 'BROADCASTING' }>({ gk: 'IDLE', ref: 'IDLE' });
  const [budget, setBudget] = useState(150);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showCriteria, setShowCriteria] = useState(false);
  const [activeTab, setActiveTab] = useState<'pitch' | 'rules' | 'finance'>('pitch');

  // Dolu slot — VIP Diamond kart
  const [activePlayerSlotId, setActivePlayerSlotId] = useState<string | null>(null);

  // Arkadaş daveti
  const [inviteModalSlotId, setInviteModalSlotId] = useState<string | null>(null);
  const [friendSearch, setFriendSearch] = useState('');
  const [invitesSent, setInvitesSent] = useState<Record<string, SlotInviteStatus>>({}); // slotId → status
  const [invitedFriendNames, setInvitedFriendNames] = useState<Record<string, string>>({}); // slotId → name

  // Kaptan için hayali oyuncu
  const [customPlayerName, setCustomPlayerName] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Maçtan Ayrıl
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // ── Store ─────────────────────────────────────────────────────────────────
  const { adminUsers, friends, updateMatch, addUserNotification, adminPitches } = useAppStore();

  if (!match) return null;

  // Saha ve Detaylı Filtre Bilgilerini Çekme
  const matchPitch = (adminPitches || []).find(p =>
    p?.name && match.location &&
    (match.location.toLowerCase().includes(p.name.toLowerCase()) ||
     p.name.toLowerCase().includes(match.location.toLowerCase()))
  );

  const fallbackPitch = {
    name: match.location || 'Oyna Arena',
    rating: 4.5,
    googleRating: 4.4,
    googleReviews: 120,
    grassGrade: 'A' as const,
    lightingGrade: 'A' as const,
    lockerRoomGrade: 'B' as const,
    amenities: ['Duş', 'Otopark', 'Soyunma Odası', 'Su'],
    image: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=1000'
  };

  const activePitch = matchPitch || fallbackPitch;

  // Dinamik kurallar ve filtreler
  const ageLimit = match.badges?.find(b => b.includes('Yaş') || b.includes('Yaş Grubu'))
    || (match.difficulty === 'Ciddi' ? '20-35 Yaş' : 'Limit Yok (18+)');

  const footwearRule = match.difficulty === 'Ciddi'
    ? 'Halı Saha Dişli (AG/TF) / Krampon Yasak'
    : 'Halı Saha Dişli (AG/TF) veya Spor Ayakkabı';

  const genderRule = match.badges?.find(b => b === 'Erkek' || b === 'Kadın' || b === 'Karma')
    || 'Karma Katılım';

  const hasReferee = !!match.refereeId || match.badges?.some(b => b.toLowerCase().includes('hakem'));

  const durationRule = match.badges?.find(b => b.toLowerCase().includes('dk') || b.toLowerCase().includes('dakika') || b.toLowerCase().includes('süre'))
    || '60 Dakika';

  const communityName = getCommunityName(match.communityId);

  // ── Kullanıcı ─────────────────────────────────────────────────────────────
  const currentUserUid = auth.currentUser?.uid || 'u1';
  const currentUserProfile = (adminUsers || []).find(u => u?.id === currentUserUid)
    || (adminUsers && adminUsers[0])
    || { id: 'u1', name: 'Kerem Y.', avatar: 'https://i.pravatar.cc/150?u=u1', role: UserRole.CAPTAIN, rating: 4.9 };

  const isCaptain = currentUserProfile?.role === UserRole.CAPTAIN
    || match.creatorId === currentUserProfile?.id;

  // ── Kanonik Simetrik Slotlar (Studio ile aynı koordinatlar) ───────────────
  const canonicalSlots = applyCanonicalCoords(match.slots || []);

  // Profil fotoğrafını DB'den çek
  const enrichedSlots = canonicalSlots.map((slot, idx) => {
    if (!slot) return slot;
    if (slot.status !== 'TAKEN') return slot;
    const orig = slot.player;
    const dbUser = orig
      ? (adminUsers || []).find(u => u?.id === orig.id || (orig.name && u?.name && u.name.toLowerCase() === orig.name.toLowerCase()))
      : (adminUsers && adminUsers[idx % Math.max(adminUsers.length, 1)]);
    if (dbUser) {
      return {
        ...slot,
        player: {
          id: dbUser.id,
          name: dbUser.name || 'Oyuncu',
          avatar: dbUser.avatar || `https://i.pravatar.cc/150?u=${dbUser.id}`,
          rating: dbUser.rating || 4.5,
          position: slot.role || 'OYUNCU',
          x: slot.x,
          y: slot.y,
        } as Player,
      };
    }
    return slot;
  });

  // ── Derived State ─────────────────────────────────────────────────────────
  const isAlreadyJoined = (match.slots || []).some(
    s => s?.player?.id === currentUserProfile?.id
  );
  const mySlot = isAlreadyJoined
    ? enrichedSlots.find(s => s?.player?.id === currentUserProfile?.id)
    : null;

  const assignedIds = (match.slots || []).filter(s => s?.player).map(s => s.player!.id);
  const filteredFriends = (friends || []).filter(f =>
    f && f.id && f.name &&
    !assignedIds.includes(f.id) &&
    f.name.toLowerCase().includes((friendSearch || '').toLowerCase())
  );
  const onlineFriends = filteredFriends.filter(f => (f as any).online);
  const offlineFriends = filteredFriends.filter(f => !(f as any).online);

  const diffConf = difficultyConfig[match.difficulty] || difficultyConfig['Rahat'];
  const squadSize = inferSquadSize((match.slots || []).length);
  const totalSlots = (match.slots || []).length;
  const takenSlots = (match.slots || []).filter(s => s?.status === 'TAKEN').length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSlotClick = (slot: any) => {
    if (!slot) return;

    if (slot.status === 'TAKEN') {
      // Kendi slotum tıklandı
      if (slot.player?.id === currentUserProfile?.id) {
        setActivePlayerSlotId(slot.id);
        return;
      }
      // Başkasının slotu — VIP Diamond kart
      setActivePlayerSlotId(slot.id);
      return;
    }

    if (slot.status === 'OPEN') {
      if (isAlreadyJoined) {
        // Zaten kadrodayım: + tıklandı → arkadaş daveti
        setInviteModalSlotId(slot.id);
        setFriendSearch('');
        return;
      }
      // Henüz kadroda değilim
      if (selectedSlotId && selectedSlotId !== slot.id) {
        // Zaten kendim için bir slot seçtim, ikinci bir boş slota tıklarsam arkadaş davetini aç:
        setInviteModalSlotId(slot.id);
      } else {
        // Kendim için slot seçiyorum veya seçimi kaldırıyorum
        setSelectedSlotId(prev => prev === slot.id ? null : slot.id);
      }
    }
  };

  const handleJoin = async () => {
    if (!selectedSlotId || isAlreadyJoined) return;
    setIsProcessing(true);
    
    const targetSlot = (match.slots || []).find(s => s?.id === selectedSlotId);
    if (!targetSlot) { setIsProcessing(false); return; }

    const joinedPlayer: Player = {
      id: currentUserProfile.id || 'u1',
      name: currentUserProfile.name || 'Oyuncu',
      avatar: currentUserProfile.avatar || `https://i.pravatar.cc/150?u=${currentUserProfile.id}`,
      rating: (currentUserProfile as any).rating || 4.5,
      position: targetSlot.role || 'OYUNCU',
      x: targetSlot.x,
      y: targetSlot.y,
    };

    const updatedSlots = (match.slots || []).map(s =>
      s?.id === selectedSlotId
        ? { ...s, status: 'TAKEN' as const, player: joinedPlayer }
        : s
    );

    try {
      await updateMatch({ ...match, slots: updatedSlots });
      setSelectedSlotId(null);
      setIsProcessing(false);
      onJoin();
    } catch (e) {
      console.error('Join error:', e);
      setIsProcessing(false);
    }
  };

  const handleInviteFriend = (friend: any) => {
    if (!inviteModalSlotId || !friend) return;
    setInvitesSent(prev => ({ ...prev, [inviteModalSlotId]: 'INVITED' }));
    setInvitedFriendNames(prev => ({ ...prev, [inviteModalSlotId]: friend.name || 'Arkadaş' }));
    addUserNotification({
      id: `inv_${inviteModalSlotId}_${Date.now()}`,
      type: 'invite',
      title: '⚽ Maç Daveti',
      desc: `${currentUserProfile.name} sizi "${match.title || 'bir maça'}" davet etti!`,
      time: 'Az önce',
      iconName: 'Trophy',
      color: '#FFFF00',
      textColor: '#FFFF00',
      payload: { matchId: match.id, slotId: inviteModalSlotId },
      read: false,
    });
    setInviteModalSlotId(null);
    setFriendSearch('');
  };

  const handleAddCustomPlayer = async () => {
    if (!customPlayerName.trim() || !inviteModalSlotId) return;
    const rid = 'custom_' + Math.random().toString(36).substr(2, 9);
    const cp: Player = {
      id: rid, name: customPlayerName.trim(),
      avatar: `https://i.pravatar.cc/150?u=${rid}`,
      rating: 4.0, position: 'OYUNCU', x: 50, y: 50,
    };
    const updatedSlots = (match.slots || []).map(s =>
      s?.id === inviteModalSlotId ? { ...s, status: 'TAKEN' as const, player: cp } : s
    );
    try {
      await updateMatch({ ...match, slots: updatedSlots });
    } catch (e) { console.error(e); }
    setInviteModalSlotId(null);
    setCustomPlayerName('');
    setShowCustomInput(false);
  };

  const handleRemovePlayer = async (slotId: string) => {
    const updatedSlots = (match.slots || []).map(s => {
      if (s?.id === slotId) {
        const newSlot = { ...s, status: 'OPEN' as const };
        delete newSlot.player;
        return newSlot;
      }
      return s;
    });
    try {
      await updateMatch({ ...match, slots: updatedSlots });
      setActivePlayerSlotId(null);
    } catch (e) { console.error(e); }
  };

  const handleLeaveMatch = async () => {
    if (!isAlreadyJoined || !currentUserProfile?.id) return;
    setIsProcessing(true);
    
    const updatedSlots = (match.slots || []).map(s => {
      if (s?.player?.id === currentUserProfile.id) {
        const newSlot = { ...s, status: 'OPEN' as const };
        delete newSlot.player;
        return newSlot;
      }
      return s;
    });

    try {
      await updateMatch({ ...match, slots: updatedSlots });
      setIsProcessing(false);
      setShowLeaveConfirm(false);
      onBack();
    } catch (e) {
      console.error('Leave match error:', e);
      setIsProcessing(false);
    }
  };

  const getDiamondValue = (p: any) => {
    if (!p) return 0;
    const db = (adminUsers || []).find(u => u?.id === p.id || u?.name === p.name);
    if (db?.playerCard?.diamondValue) return db.playerCard.diamondValue;
    const rating = db?.rating || p.rating || 4.5;
    const mc = db?.matchCount || 24;
    return mc * 250 + Math.round(rating * 1000);
  };

  const getFP = (p: any) => {
    const friend = (friends || []).find(f => (f as any).id === p?.id);
    return (friend as any)?.fp || Math.floor(Math.random() * 15) + 85;
  };

  const activePlayerSlot = activePlayerSlotId ? enrichedSlots.find(s => s?.id === activePlayerSlotId) : null;
  const activePlayer = activePlayerSlot?.player || null;

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col relative overflow-hidden font-sans">

      {/* Ambiyans arka plan */}
      <div className="absolute top-0 left-[-15%] w-[500px] h-[500px] bg-[#39FF14]/4 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-[-10%] w-[400px] h-[400px] bg-[#00f2fe]/4 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.08] mix-blend-overlay pointer-events-none" />

      {/* ── Kaleci / Hakem Hire Modalı ─────────────────────────────────────── */}
      <AnimatePresence>
        {hireModalType && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-end justify-center">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="bg-[#161B22] border-t border-white/10 w-full max-w-lg rounded-t-[40px] p-8 pb-12 shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-8" />
              <div className="flex items-center gap-4 mb-8">
                <div className={`p-4 rounded-2xl border ${hireModalType === 'REF' ? 'bg-[#FFFF00]/10 border-[#FFFF00]/30 text-[#FFFF00]' : 'bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]'}`}>
                  {hireModalType === 'REF' ? <Scale size={26} /> : <Hand size={26} />}
                </div>
                <div>
                  <h3 className="text-xl font-black text-white italic uppercase tracking-tight">
                    {hireModalType === 'REF' ? 'Resmi Hakem' : 'Kiralık Kaleci'}
                  </h3>
                  <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold mt-0.5">Teklif Bütçeni Ayarla</p>
                </div>
                <button onClick={() => setHireModalType(null)} className="ml-auto w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:bg-white/10">
                  <X size={18} />
                </button>
              </div>
              <div className="bg-black/40 p-6 rounded-3xl border border-white/5 mb-6">
                <div className="flex justify-between items-end mb-5">
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Bütçe</span>
                  <span className={`text-4xl font-black ${hireModalType === 'REF' ? 'text-[#FFFF00]' : 'text-[#39FF14]'}`}>{budget} ₺</span>
                </div>
                <input type="range" min="50" max="500" step="10" value={budget}
                  onChange={e => setBudget(parseInt(e.target.value))}
                  className={`w-full h-2 rounded-full cursor-pointer appearance-none bg-white/10 ${hireModalType === 'REF' ? 'accent-[#FFFF00]' : 'accent-[#39FF14]'}`} />
                <div className="flex justify-between mt-3 text-[9px] text-white/30 font-black uppercase tracking-widest">
                  <span>50 ₺</span><span>500 ₺</span>
                </div>
              </div>
              <button onClick={() => { if (hireModalType === 'GK') setHiringState(p => ({ ...p, gk: 'BROADCASTING' })); else setHiringState(p => ({ ...p, ref: 'BROADCASTING' })); setHireModalType(null); }}
                className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 ${hireModalType === 'REF' ? 'bg-[#FFFF00] text-black shadow-[0_0_30px_rgba(255,255,0,0.4)]' : 'bg-[#39FF14] text-black shadow-[0_0_30px_rgba(57,255,20,0.4)]'}`}>
                Teklifi Yayınla
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── VIP Diamond Kart Modalı ────────────────────────────────────────── */}
      <AnimatePresence>
        {activePlayer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-2xl flex items-center justify-center p-6"
            onClick={() => setActivePlayerSlotId(null)}>
            <motion.div
              initial={{ scale: 0.75, y: 40, opacity: 0, rotateY: 20 }}
              animate={{ scale: 1, y: 0, opacity: 1, rotateY: 0 }}
              exit={{ scale: 0.75, y: 40, opacity: 0, rotateY: -20 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              onClick={e => e.stopPropagation()}
              className="relative w-80 rounded-[32px] overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.9)]"
              style={{ perspective: '1000px' }}>

              {(() => {
                const overall = Math.round(((activePlayer as any).rating || 4.5) * 20);
                const isGold = overall >= 90;
                const isSilver = overall >= 80 && overall < 90;
                const tier = isGold ? 'GOLD' : isSilver ? 'SILVER' : 'BRONZE';
                const accentColor = isGold ? '#FFE875' : isSilver ? '#E2E8F0' : '#C27E47';
                const glowColor = isGold ? 'rgba(255,232,117,0.35)' : isSilver ? 'rgba(226,232,240,0.25)' : 'rgba(194,126,71,0.25)';
                const gradFrom = isGold ? '#FFE875' : isSilver ? '#E2E8F0' : '#C27E47';
                const fp = getFP(activePlayer);
                const isMySlot = activePlayer.id === currentUserProfile?.id;

                return (
                  <div className="relative" style={{ background: `linear-gradient(160deg, #0d1117 0%, #161B22 100%)` }}>
                    {/* Doku */}
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 mix-blend-overlay" />
                    {/* Glow */}
                    <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full blur-[80px] opacity-40"
                      style={{ background: glowColor }} />

                    {/* Üst Şerit — Tier ve Renk */}
                    <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[32px]"
                      style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />

                    <div className="relative p-7 flex flex-col items-center">
                      {/* Overall Badge */}
                      <div className="absolute top-6 left-6 flex flex-col items-center">
                        <span className="text-4xl font-black italic leading-none" style={{ color: accentColor }}>{overall}</span>
                        <span className="text-[8px] font-black uppercase tracking-widest mt-0.5" style={{ color: accentColor + 'aa' }}>{tier}</span>
                      </div>

                      {/* Avatar */}
                      <div className="relative mt-4 mb-5">
                        <div className="absolute inset-0 rounded-full blur-2xl opacity-50" style={{ background: glowColor, transform: 'scale(1.3)' }} />
                        <img src={(activePlayer as any).avatar || `https://i.pravatar.cc/150?u=${(activePlayer as any).id}`}
                          alt={(activePlayer as any).name}
                          className="relative w-36 h-36 rounded-full object-cover bg-black border-[3px]"
                          style={{ borderColor: accentColor + '50' }} />
                        {isMySlot && (
                          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#39FF14] flex items-center justify-center shadow-[0_0_12px_rgba(57,255,20,0.8)]">
                            <Shield size={14} className="text-black" />
                          </div>
                        )}
                        {/* Pozisyon badge */}
                        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 font-black uppercase tracking-widest text-[9px] px-4 py-1.5 rounded-full border border-black/10"
                          style={{ background: `linear-gradient(90deg, ${gradFrom}, ${isGold ? '#D1A119' : isSilver ? '#64748B' : '#7C4318'})`, color: isGold || isSilver ? '#000' : '#fff' }}>
                          {(activePlayer as any).position || activePlayerSlot?.role || 'OYUNCU'}
                        </div>
                      </div>

                      {/* İsim */}
                      <h3 className="text-2xl font-black text-white uppercase tracking-tight italic text-center mt-3 mb-5 drop-shadow-lg">
                        {(activePlayer as any).name || 'Oyuncu'}
                      </h3>

                      {/* Diamond Serveti */}
                      <div className="w-full rounded-2xl border border-white/5 bg-black/60 backdrop-blur-md p-4 flex flex-col items-center gap-2 relative overflow-hidden mb-4">
                        <div className="absolute inset-0" style={{
                          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
                          animation: 'shimmer 2s infinite',
                        }} />
                        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Kariyer Serveti</span>
                        <div className="flex items-center gap-2.5">
                          <Diamond className="w-7 h-7 drop-shadow-[0_0_14px_rgba(0,242,254,0.9)] animate-pulse" style={{ color: '#00f2fe' }} />
                          <span className="text-3xl font-black text-white tabular-nums tracking-tighter">
                            {getDiamondValue(activePlayer).toLocaleString('tr-TR')}
                          </span>
                        </div>
                      </div>

                      {/* Mini İstatistikler */}
                      <div className="grid grid-cols-3 gap-2 w-full">
                        {[
                          { label: 'OVERALL', val: `${overall}` },
                          { label: 'FAIR PLAY', val: `%${fp}` },
                          { label: 'POZİSYON', val: activePlayerSlot?.role || 'OYUNCU' },
                        ].map(stat => (
                          <div key={stat.label} className="bg-white/[0.04] rounded-xl p-2.5 text-center border border-white/5">
                            <span className="block text-[7px] font-black text-white/30 uppercase tracking-widest mb-1">{stat.label}</span>
                            <span className="text-xs font-black text-white/90">{stat.val}</span>
                          </div>
                        ))}
                      </div>

                      {/* Kaptan Çıkarma */}
                      {isCaptain && !isMySlot && (
                        <button onClick={() => handleRemovePlayer(activePlayerSlot!.id)}
                          className="mt-5 w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest text-red-400 bg-red-950/30 border border-red-500/15 active:scale-95 transition-all">
                          KADRODAN ÇIKAR
                        </button>
                      )}

                      {/* Slottan Ayrıl */}
                      {isMySlot && (
                        <button onClick={() => {
                          setActivePlayerSlotId(null);
                          setShowLeaveConfirm(true);
                        }}
                          className="mt-5 w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest text-red-500 bg-red-500/10 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/20 active:scale-95 transition-all shadow-[0_0_15px_rgba(239,68,68,0.15)]">
                          SLOTTAN AYRIL
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              <button onClick={() => setActivePlayerSlotId(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors backdrop-blur-md z-10">
                <X size={16} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Maçtan Ayrıl Onay Modalı ────────────────────────────────────────── */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-[#161B22] border border-red-500/30 w-full max-w-sm rounded-[32px] p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center">
              
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2">
                Maçtan Ayrıl
              </h3>
              
              <p className="text-sm text-gray-400 mb-6">
                Maçtan ayrılmak istediğinize emin misiniz? Kadrodaki yeriniz boşaltılacaktır.
              </p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowLeaveConfirm(false)}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-2xl font-black text-sm uppercase tracking-widest text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  İPTAL
                </button>
                <button 
                  onClick={handleLeaveMatch}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-2xl font-black text-sm uppercase tracking-widest text-white bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:bg-red-500 transition-colors flex items-center justify-center">
                  {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'AYRIL'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Arkadaş Davet Modalı ──────────────────────────────────────────── */}
      <AnimatePresence>
        {inviteModalSlotId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-2xl flex flex-col">
            <div className="flex-1 overflow-y-auto">
              {/* Modal Header */}
              <div className="sticky top-0 bg-[#0A0E14]/95 backdrop-blur-xl border-b border-white/5 px-6 pt-14 pb-5 z-10">
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <h2 className="text-xl font-black text-white uppercase italic tracking-tight">ARKADAŞINI DAVET ET</h2>
                    <p className="text-[10px] text-[#39FF14] font-bold uppercase tracking-widest mt-1">Boş Pozisyona Çağır</p>
                  </div>
                  <button onClick={() => { setInviteModalSlotId(null); setFriendSearch(''); setShowCustomInput(false); }}
                    className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10">
                    <X size={18} />
                  </button>
                </div>
                {/* Arama */}
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                  <input type="text" value={friendSearch} onChange={e => setFriendSearch(e.target.value)}
                    placeholder="Arkadaş ara..."
                    className="w-full bg-[#161B22] border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#39FF14]/50 transition-colors" />
                </div>
              </div>

              <div className="px-6 py-4 max-w-lg mx-auto w-full">

                {/* Kaptan — Hayali Oyuncu */}
                {isCaptain && (
                  <div className="mb-6 bg-purple-950/20 border border-purple-500/15 rounded-3xl p-5">
                    <button onClick={() => setShowCustomInput(v => !v)}
                      className="flex items-center gap-2 w-full text-left mb-3">
                      <UserPlus size={14} className="text-purple-400" />
                      <span className="text-xs font-black text-purple-400 uppercase tracking-widest">Hayali Oyuncu Ekle</span>
                      <span className="ml-auto text-[9px] text-purple-400/60 uppercase tracking-widest font-bold">{showCustomInput ? '▲ KAPAT' : '▼ AÇ'}</span>
                    </button>
                    {showCustomInput && (
                      <div className="flex gap-2">
                        <input type="text" placeholder="Oyuncu Adı..." value={customPlayerName}
                          onChange={e => setCustomPlayerName(e.target.value)}
                          className="flex-1 bg-[#161B22] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors" />
                        <button onClick={handleAddCustomPlayer}
                          disabled={!customPlayerName.trim()}
                          className="bg-purple-600 hover:bg-purple-500 text-white px-5 rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-40 active:scale-95 transition-all">
                          EKLE
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Çevrimiçi Arkadaşlar */}
                {onlineFriends.length > 0 && (
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Wifi size={12} className="text-[#39FF14]" />
                      <span className="text-[9px] font-black text-[#39FF14] uppercase tracking-[0.2em]">ÇEVRİMİÇİ — {onlineFriends.length}</span>
                    </div>
                    <div className="space-y-2">
                      {onlineFriends.map(friend => (
                        <FriendInviteRow key={(friend as any).id} friend={friend} onInvite={() => handleInviteFriend(friend)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Çevrimdışı Arkadaşlar */}
                {offlineFriends.length > 0 && (
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <WifiOff size={12} className="text-white/30" />
                      <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">ÇEVRİMDIŞI — {offlineFriends.length}</span>
                    </div>
                    <div className="space-y-2">
                      {offlineFriends.map(friend => (
                        <FriendInviteRow key={(friend as any).id} friend={friend} onInvite={() => handleInviteFriend(friend)} />
                      ))}
                    </div>
                  </div>
                )}

                {filteredFriends.length === 0 && (
                  <div className="text-center py-12">
                    <Users size={28} className="text-white/20 mx-auto mb-3" />
                    <p className="text-xs text-white/30 font-bold uppercase tracking-widest">Arkadaş Bulunamadı</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-[#0A0E14]/90 backdrop-blur-2xl border-b border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
        {/* Navigasyon Satırı */}
        <div className="flex items-center gap-3 px-5 pt-safe pt-2 pb-3">
          <button onClick={onBack}
            className="w-9 h-9 flex items-center justify-center bg-white/5 rounded-full border border-white/10 text-white hover:bg-white/10 active:scale-90 transition-all">
            <ArrowLeft size={17} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-black text-white italic uppercase tracking-tighter leading-tight truncate">
              Maç Lobisi
            </h1>
            <p className="text-[9px] text-white/40 font-bold uppercase tracking-[0.2em] mt-0.5 truncate">
              {match.title || 'Maç Detayı'}
            </p>
          </div>
          {/* Sağ Aksiyon: Doluluk Göstergesi veya Maçtan Ayrıl Butonu */}
          {isAlreadyJoined ? (
            <button 
              onClick={() => setShowLeaveConfirm(true)}
              className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-colors">
              Maçtan Ayrıl
            </button>
          ) : (
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              <Users size={11} className="text-white/50" />
              <span className="text-[10px] font-black text-white/80">{takenSlots}/{totalSlots}</span>
            </div>
          )}
        </div>

        {/* Maç Bilgi Şeridi */}
        <div className="px-5 pb-4">
          <div className="bg-[#161B22]/80 backdrop-blur-md rounded-2xl border border-white/5 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <div className="flex items-start gap-3 mb-3">
              {/* Sol — Konum ve Zaman */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-[#39FF14] italic drop-shadow-[0_0_12px_rgba(57,255,20,0.8)] truncate">{match.location || 'Konum Belirtilmemiş'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-black text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]">{match.date || '—'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-black text-[#FFFF00] drop-shadow-[0_0_8px_rgba(255,255,0,0.6)]">{match.time || '—'}</span>
                  </div>
                </div>
              </div>
              {/* Sağ — Badgeler */}
              <div className="flex flex-col items-end gap-1.5">
                {/* Ciddiyet */}
                <div className="px-2.5 py-1 rounded-full font-black text-[9px] uppercase tracking-widest border"
                  style={{
                    color: diffConf.color,
                    borderColor: diffConf.color + '40',
                    background: diffConf.color + '15',
                    boxShadow: `0 0 10px ${diffConf.glow}`,
                  }}>
                  {diffConf.label}
                </div>
                {/* Format */}
                <div className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 font-black text-[9px] uppercase tracking-widest text-white/60">
                  {squadSize.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Geniş, Parlayan Maç Bilgileri Butonu */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowCriteria(prev => !prev)}
              className={`w-full flex items-center justify-center gap-2 transition-all py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer active:scale-95 mt-1 ${
                showCriteria
                  ? 'bg-[#FFFF00] text-black shadow-[0_0_20px_rgba(255,255,0,0.35)]'
                  : 'bg-[#FFFF00]/10 border border-[#FFFF00]/25 hover:border-[#FFFF00] text-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.1)]'
              }`}
            >
              <Info size={13} className={showCriteria ? '' : 'animate-pulse'} />
              <span>MAÇ BİLGİLERİ VE KRİTERLER</span>
              <motion.span
                animate={{ rotate: showCriteria ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="ml-1 text-[8px]"
              >
                ▼
              </motion.span>
            </motion.button>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ───────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 overflow-y-auto custom-scrollbar pb-36 pt-4">

        {/* Kadro Durumu Mesajı */}
        {isAlreadyJoined && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-center gap-3 bg-[#39FF14]/10 border border-[#39FF14]/20 rounded-2xl px-4 py-3">
            <CheckCircle2 size={16} className="text-[#39FF14] shrink-0" />
            <p className="text-xs font-bold text-[#39FF14]">
              Kadroya alındın! Boş pozisyonlara <span className="font-black">+</span> basarak arkadaşlarını davet edebilirsin.
            </p>
          </motion.div>
        )}

        {/* ── MAÇ KRİTERLERİ & KURALLAR ───────────────────────────────────── */}
        <AnimatePresence>
          {showCriteria && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginBottom: 0 }}
              animate={{ height: 'auto', opacity: 1, marginBottom: 20 }}
              exit={{ height: 0, opacity: 0, marginBottom: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="bg-[#161B22]/60 backdrop-blur-md rounded-3xl border border-white/5 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <Layers size={13} className="text-[#39FF14]" />
                    <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">
                      Maç Kriterleri & Taktik Kurallar
                    </p>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowInfoModal(true)}
                    className="text-[9px] font-black text-[#FFFF00] bg-[#FFFF00]/10 border border-[#FFFF00]/25 px-3 py-1 rounded-full uppercase tracking-widest cursor-pointer shadow-[0_0_10px_rgba(255,255,0,0.1)] hover:border-[#FFFF00]"
                  >
                    TÜM DETAYLAR
                  </motion.button>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  {/* Hakem Durumu */}
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-4 flex flex-col justify-center items-center text-center col-span-2 shadow-inner">
                    <span className="block text-[9px] font-bold text-white/50 uppercase tracking-[0.2em] mb-1">HAKEM</span>
                    <span className="text-base font-serif italic text-purple-300 drop-shadow-[0_0_12px_rgba(168,85,247,0.8)] block">
                      {hasReferee ? 'Lisanslı Hakem' : 'Kaptan Yönetimi'}
                    </span>
                  </div>

                  {/* Katılım Ücreti */}
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-4 flex flex-col justify-center items-center text-center shadow-inner">
                    <span className="block text-[9px] font-bold text-white/50 uppercase tracking-[0.2em] mb-1">ÜCRET</span>
                    <span className="text-base font-serif italic text-[#39FF14] drop-shadow-[0_0_12px_rgba(57,255,20,0.8)] block">
                      {match.price > 0 ? `${match.price} ₺` : 'Ücretsiz'}
                    </span>
                  </div>

                  {/* Süre */}
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-4 flex flex-col justify-center items-center text-center shadow-inner">
                    <span className="block text-[9px] font-bold text-white/50 uppercase tracking-[0.2em] mb-1">SÜRE</span>
                    <span className="text-base font-serif italic text-red-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.8)] block">{durationRule}</span>
                  </div>

                  {/* Yaş Sınırı */}
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-4 flex flex-col justify-center items-center text-center shadow-inner">
                    <span className="block text-[9px] font-bold text-white/50 uppercase tracking-[0.2em] mb-1">YAŞ GRUBU</span>
                    <span className="text-base font-serif italic text-orange-300 drop-shadow-[0_0_12px_rgba(253,186,116,0.8)] block">{ageLimit}</span>
                  </div>

                  {/* Cinsiyet */}
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-4 flex flex-col justify-center items-center text-center shadow-inner">
                    <span className="block text-[9px] font-bold text-white/50 uppercase tracking-[0.2em] mb-1">CİNSİYET</span>
                    <span className="text-base font-serif italic text-pink-300 drop-shadow-[0_0_12px_rgba(244,114,182,0.8)] block">{genderRule}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── TAKTİK SAHA ─────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] shadow-[0_0_8px_rgba(57,255,20,0.9)] animate-pulse" />
              <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">
                Maç Lobisi
              </p>
            </div>
            {selectedSlotId && (
              <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                className="text-[9px] font-black text-[#39FF14] uppercase tracking-widest bg-[#39FF14]/10 px-2.5 py-1 rounded-full border border-[#39FF14]/30 animate-pulse">
                Pozisyon Seçildi ✓
              </motion.span>
            )}
          </div>

          {/* Saha Kapsayıcısı */}
          <div className="relative w-full max-w-[380px] mx-auto rounded-[28px] overflow-hidden aspect-[3/4] border-4 border-[#161B22] shadow-[0_0_60px_rgba(0,0,0,0.8),inset_0_0_80px_rgba(0,0,0,0.6)]"
            style={{ background: '#0B2815' }}>

            {/* Çim desen (Studio.tsx stili dikey koyu çizgiler) */}
            <div className="absolute inset-0 opacity-15 pointer-events-none"
              style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 8%, rgba(0,0,0,0.25) 8%, rgba(0,0,0,0.25) 16%)' }} />
            {/* Radyal ışık */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(57,255,20,0.08) 0%, transparent 75%)' }} />

            {/* Studio ile Aynı SVG Saha Çizgileri (viewBox="0 0 600 1000") */}
            <div className="absolute inset-0 pointer-events-none opacity-30">
              <svg viewBox="0 0 600 1000" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <g stroke="rgba(255,255,255,0.8)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="10" y="10" width="580" height="980" />
                  <line x1="10" y1="500" x2="590" y2="500" />
                  <circle cx="300" cy="500" r="80" />
                  <circle cx="300" cy="500" r="5" fill="rgba(255,255,255,0.8)" />
                  {/* Üst Ceza Sahası */}
                  <rect x="150" y="10" width="300" height="160" />
                  <circle cx="300" cy="130" r="5" fill="rgba(255,255,255,0.8)" />
                  <path d="M 220 170 A 80 80 0 0 0 380 170" />
                  {/* Alt Ceza Sahası */}
                  <rect x="150" y="830" width="300" height="160" />
                  <circle cx="300" cy="870" r="5" fill="rgba(255,255,255,0.8)" />
                  <path d="M 220 830 A 80 80 0 0 1 380 830" />
                  {/* Köşe Yayları */}
                  <path d="M 10 40 A 30 30 0 0 0 40 10" />
                  <path d="M 560 10 A 30 30 0 0 0 590 40" />
                  <path d="M 10 960 A 30 30 0 0 1 40 990" />
                  <path d="M 590 960 A 30 30 0 0 0 560 990" />
                </g>
              </svg>
            </div>

            {/* SLOTLAR — Kanonik Koordinatlarla */}
            {enrichedSlots.map((slot) => {
              if (!slot) return null;
              const isSelected = selectedSlotId === slot.id;
              const isTaken = slot.status === 'TAKEN';
              const isOpen = slot.status === 'OPEN';
              const player = slot.player;
              const isMyOwnSlot = player?.id === currentUserProfile?.id;
              const inviteStatus = invitesSent[slot.id] || 'NONE';
              const invitedName = invitedFriendNames[slot.id];

              return (
                <div
                  key={slot.id}
                  className="absolute w-12 h-12 flex items-center justify-center z-10"
                  style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%, -50%)' }}
                >
                  {isTaken && player ? (
                    /* ── Dolu Slot ──────────────────────────────── */
                    <button
                      onClick={() => handleSlotClick(slot)}
                      className="w-full h-full rounded-full focus:outline-none cursor-pointer"
                    >
                      <motion.div whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.93 }}
                        className="relative w-full h-full flex flex-col items-center justify-center">
                        <div className={`relative w-12 h-12 rounded-full overflow-hidden border-2 shadow-lg transition-all ${
                          isMyOwnSlot
                            ? 'border-[#39FF14] shadow-[0_0_16px_rgba(57,255,20,0.7)]'
                            : slot.role === 'GK'
                              ? 'border-orange-400 hover:shadow-[0_0_14px_rgba(249,115,22,0.6)]'
                              : 'border-white/25 hover:border-[#00f2fe] hover:shadow-[0_0_14px_rgba(0,242,254,0.5)]'
                        }`}>
                          <img
                            src={player.avatar || `https://i.pravatar.cc/150?u=${player.id}`}
                            alt={player.name || 'Oyuncu'}
                            className="w-full h-full object-cover bg-[#0A0E14]"
                          />
                          {isMyOwnSlot && (
                            <div className="absolute inset-0 bg-[#39FF14]/10" />
                          )}
                        </div>
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1.5 bg-black/90 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/10 shadow-md max-w-[64px] z-20 pointer-events-none">
                          <span className="text-[8px] font-black text-white whitespace-nowrap uppercase truncate block">
                            {isMyOwnSlot ? 'SEN' : (player.name || 'Oyuncu').split(' ')[0]}
                          </span>
                        </div>
                      </motion.div>
                    </button>
                  ) : isOpen ? (
                    inviteStatus === 'INVITED' ? (
                      /* ── Davet Gönderildi Slotu ────────────────── */
                      <button
                        onClick={() => handleSlotClick(slot)}
                        className="w-full h-full rounded-full focus:outline-none cursor-pointer"
                      >
                        <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }}
                          className="relative w-full h-full flex flex-col items-center justify-center">
                          <div className="w-12 h-12 rounded-full border-2 border-orange-400/60 bg-orange-950/40 flex items-center justify-center shadow-[0_0_10px_rgba(251,146,60,0.3)]">
                            <Send size={14} className="text-orange-400" />
                          </div>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1.5 bg-black/90 px-1.5 py-0.5 rounded-full border border-orange-400/30 max-w-[64px] z-20 pointer-events-none">
                            <span className="text-[7px] font-black text-orange-400 whitespace-nowrap truncate block">
                              {(invitedName || 'Davet').split(' ')[0]}
                            </span>
                          </div>
                        </motion.div>
                      </button>
                    ) : (
                      /* ── Açık Slot ──────────────────────────────── */
                      <button
                        onClick={() => handleSlotClick(slot)}
                        className="w-full h-full rounded-full focus:outline-none cursor-pointer"
                      >
                        <motion.div
                          whileHover={{ scale: 1.18 }}
                          whileTap={{ scale: 0.88 }}
                          className="relative w-full h-full flex flex-col items-center justify-center"
                        >
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 shadow-lg transition-all duration-200 relative ${
                            isSelected
                              ? 'bg-[#39FF14] border-white text-black shadow-[0_0_28px_rgba(57,255,20,0.9)] scale-110'
                              : isAlreadyJoined
                                ? 'bg-black/50 border-white/20 text-white/40 hover:border-[#39FF14]/60 hover:bg-[#39FF14]/10 hover:text-[#39FF14] backdrop-blur-md'
                                : 'bg-black/50 border-white/25 text-white/60 hover:border-[#39FF14]/50 backdrop-blur-md'
                          }`}>
                            {isSelected ? (
                              <CheckCircle2 size={20} className="drop-shadow-md" />
                            ) : (
                              <>
                                <span className="text-[10px] font-black uppercase tracking-wider leading-none">
                                  {slot.role || '?'}
                                </span>
                                {isAlreadyJoined && (
                                  <div className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full bg-[#39FF14] text-black flex items-center justify-center border border-black shadow-[0_0_8px_rgba(57,255,20,0.6)] animate-pulse z-20">
                                    <Plus size={10} strokeWidth={3} />
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1.5 bg-black/70 px-1.5 py-0.5 rounded-full border border-white/10 max-w-[64px] z-20 pointer-events-none">
                            <span className={`text-[7px] font-black uppercase truncate block whitespace-nowrap ${
                              isSelected ? 'text-[#39FF14]' : 'text-white/40'
                            }`}>
                              {isSelected ? 'SEÇİLDİ' : (isAlreadyJoined ? 'DAVET' : 'BOŞ')}
                            </span>
                          </div>
                        </motion.div>
                      </button>
                    )
                  ) : (
                    /* ── Kilitli Slot ───────────────────────────── */
                    <div className="w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center">
                      <X size={12} className="text-white/20" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-center text-[9px] text-white/25 font-bold mt-3 uppercase tracking-[0.2em]">
            {isAlreadyJoined
              ? '+ butonuna basarak arkadaşlarını davet et'
              : 'Pozisyona dokun — ardından aşağıdan "Sahaya Çık"'}
          </p>
        </div>

        {/* ── EKSTRA DESTEK SERVİSLERİ ──────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] ml-1">Ekstra Destek</p>

          <button onClick={() => { setHiringState(p => ({ ...p, gk: 'IDLE' })); setHireModalType('GK'); }}
            disabled={hiringState.gk === 'BROADCASTING'}
            className="w-full p-4 rounded-[22px] bg-[#161B22] border border-white/5 flex items-center gap-4 transition-all hover:bg-white/[0.025] active:scale-[0.98] group">
            <div className={`p-3 rounded-2xl transition-colors ${hiringState.gk === 'BROADCASTING' ? 'bg-[#39FF14]/15 text-[#39FF14]' : 'bg-white/5 text-white/50 group-hover:bg-[#39FF14]/10 group-hover:text-[#39FF14]'}`}>
              {hiringState.gk === 'BROADCASTING' ? <Loader2 size={18} className="animate-spin" /> : <Hand size={18} />}
            </div>
            <div className="text-left flex-1">
              <h4 className={`font-black text-sm uppercase tracking-tight ${hiringState.gk === 'BROADCASTING' ? 'text-[#39FF14]' : 'text-white'}`}>
                {hiringState.gk === 'BROADCASTING' ? 'Teklif Yayında ⚡' : 'Kiralık Kaleci'}
              </h4>
              <p className="text-[10px] text-white/35 mt-0.5">
                {hiringState.gk === 'BROADCASTING' ? 'Bölgedeki kaleciler inceliyor...' : 'Kalede açık varsa profesyonel çağır'}
              </p>
            </div>
            <ChevronRight size={16} className="text-white/20 group-hover:text-white/40 transition-colors" />
          </button>

          <button onClick={() => hiringState.ref !== 'BROADCASTING' && setHireModalType('REF')}
            className="w-full p-4 rounded-[22px] bg-[#161B22] border border-white/5 flex items-center gap-4 transition-all hover:bg-white/[0.025] active:scale-[0.98] group">
            <div className={`p-3 rounded-2xl transition-colors ${hiringState.ref === 'BROADCASTING' ? 'bg-[#FFFF00]/15 text-[#FFFF00]' : 'bg-white/5 text-white/50 group-hover:bg-[#FFFF00]/10 group-hover:text-[#FFFF00]'}`}>
              {hiringState.ref === 'BROADCASTING' ? <Loader2 size={18} className="animate-spin" /> : <Scale size={18} />}
            </div>
            <div className="text-left flex-1">
              <h4 className={`font-black text-sm uppercase tracking-tight ${hiringState.ref === 'BROADCASTING' ? 'text-[#FFFF00]' : 'text-white'}`}>
                {hiringState.ref === 'BROADCASTING' ? 'Hakem Aranıyor ⚡' : 'Resmi Hakem'}
              </h4>
              <p className="text-[10px] text-white/35 mt-0.5">
                {hiringState.ref === 'BROADCASTING' ? 'Onaylı hakemlere iletildi' : 'Maçı otoriteye teslim et'}
              </p>
            </div>
            <ChevronRight size={16} className="text-white/20 group-hover:text-white/40 transition-colors" />
          </button>
        </div>
      </main>

      {/* ── DİNAMİK NEON AKSİYON BARI ─────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 w-full z-30 pointer-events-none">
        <div className="pointer-events-auto bg-gradient-to-t from-[#000] via-[#000]/96 to-transparent pt-14 pb-safe pb-4 px-5 border-t border-white/5">
          <div className="max-w-md mx-auto w-full">

            {isAlreadyJoined ? (
              /* ── Zaten Kadroya Girdim: Tamamlandı Görünümü ──────────── */
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-center gap-3 h-16 rounded-[24px] border border-[#39FF14]/20 bg-[#39FF14]/5">
                <CheckCircle2 size={20} className="text-[#39FF14]" />
                <span className="font-black text-sm text-[#39FF14] uppercase tracking-widest">KADRODASIN</span>
              </motion.div>
            ) : isCaptain && selectedSlotId ? (
              /* ── Kaptan Split CTA ─────────────────────────────────────── */
              <div className="flex gap-3">
                {/* Sahaya Çık */}
                <motion.button
                  onClick={handleJoin}
                  disabled={isProcessing}
                  animate={{ scale: [1, 1.015, 1] }}
                  transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                  whileTap={{ scale: 0.95 }}
                  className="w-[60%] h-16 rounded-[22px] font-black text-sm uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all text-black cursor-pointer"
                  style={{
                    background: 'linear-gradient(135deg, #FFFF00 0%, #39FF14 100%)',
                    boxShadow: '0 0 35px rgba(57,255,20,0.6), 0 0 70px rgba(255,255,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)',
                  }}>
                  {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <><span>SAHAYA ÇIK</span><ChevronRight size={17} /></>}
                </motion.button>
                {/* Oyuncu Ekle */}
                <motion.button
                  onClick={() => {
                    const s = (match.slots || []).find(sl => sl?.id === selectedSlotId);
                    if (s) setInviteModalSlotId(selectedSlotId);
                  }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-[40%] h-16 rounded-[22px] font-black text-xs uppercase tracking-[0.1em] flex items-center justify-center gap-1.5 text-white transition-all cursor-pointer"
                  style={{
                    background: 'linear-gradient(135deg, rgba(0,242,254,0.15) 0%, rgba(79,172,254,0.10) 100%)',
                    border: '1px solid rgba(0,242,254,0.3)',
                    boxShadow: '0 0 20px rgba(0,242,254,0.25)',
                  }}>
                  <UserPlus size={15} />
                  <span>OYUNCU</span>
                </motion.button>
              </div>
            ) : (
              /* ── Standart CTA ─────────────────────────────────────────── */
              <motion.button
                disabled={!selectedSlotId || isProcessing}
                onClick={handleJoin}
                animate={selectedSlotId ? { scale: [1, 1.018, 1] } : { opacity: [0.75, 1, 0.75] }}
                transition={selectedSlotId ? { repeat: Infinity, duration: 2, ease: 'easeInOut' } : { repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                whileTap={{ scale: 0.95 }}
                className="w-full h-16 rounded-[24px] font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all duration-400 cursor-pointer"
                style={selectedSlotId ? {
                  background: 'linear-gradient(135deg, #FFFF00 0%, #39FF14 100%)',
                  boxShadow: '0 0 35px rgba(57,255,20,0.6), 0 0 70px rgba(255,255,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)',
                  color: '#000',
                  border: 'none',
                } : {
                  background: 'rgba(255, 255, 0, 0.03)',
                  border: '1.5px dashed rgba(255, 255, 0, 0.35)',
                  color: '#FFFF00',
                  boxShadow: '0 0 15px rgba(255, 255, 0, 0.1)',
                }}>
                {isProcessing ? (
                  <><Loader2 size={20} className="animate-spin" /><span>KAYIT EDİLİYOR...</span></>
                ) : selectedSlotId ? (
                  <><span>SAHAYA ÇIK</span><ChevronRight size={20} /></>
                ) : (
                  <>
                    <Zap size={14} className="animate-bounce" />
                    <span>ÖNCE POZİSYON SEÇ</span>
                  </>
                )}
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* ── Detaylı Maç Bilgileri Modalı ─────────────────────────────────── */}
      <AnimatePresence>
        {showInfoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-end justify-center"
            onClick={() => setShowInfoModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#0A0E14] border-t border-white/10 w-full max-w-lg rounded-t-[40px] overflow-hidden max-h-[85vh] flex flex-col shadow-[0_-20px_50px_rgba(0,0,0,0.8)] relative"
            >
              {/* Cover Resmi Banner */}
              <div className="relative w-full h-40 shrink-0">
                <img
                  src={activePitch.image}
                  alt={activePitch.name}
                  className="w-full h-full object-cover opacity-75"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/40 to-black/30" />
                
                {/* Kapatma Butonu */}
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="absolute top-5 right-5 w-9 h-9 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>

                {/* Başlık Grubu */}
                <div className="absolute bottom-4 left-6 right-6">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[8px] font-black text-black bg-[#39FF14] px-2 py-0.5 rounded-full uppercase tracking-widest">
                      {squadSize} FORMAT
                    </span>
                    <span className="text-[8px] font-black text-white bg-white/15 border border-white/10 px-2 py-0.5 rounded-full uppercase tracking-widest">
                      {communityName}
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-white uppercase italic tracking-tight leading-tight truncate">
                    {activePitch.name}
                  </h3>
                </div>
              </div>

              {/* Tab Seçimi */}
              <div className="flex px-6 pt-3 pb-1 border-b border-white/5 bg-black/20 gap-2 shrink-0">
                {[
                  { id: 'pitch' as const, label: 'SAHA & TESİS', icon: Layers },
                  { id: 'rules' as const, label: 'MAÇ KURALLARI', icon: Shield },
                  { id: 'finance' as const, label: 'GİRİŞ & BARAJ', icon: DollarSign }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className="flex-1 py-3 flex flex-col items-center justify-center gap-1.5 relative select-none cursor-pointer focus:outline-none"
                    >
                      <Icon size={14} className={isActive ? 'text-[#39FF14]' : 'text-white/40'} />
                      <span className={`text-[9px] font-black uppercase tracking-widest ${isActive ? 'text-white' : 'text-white/30'}`}>
                        {tab.label}
                      </span>
                      {isActive && (
                        <motion.div
                          layoutId="activeTabUnderline"
                          className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#39FF14] shadow-[0_0_10px_#39FF14]"
                          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tab İçerik Alanı */}
              <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide pb-12">
                <AnimatePresence mode="wait">
                  {activeTab === 'pitch' && (
                    <motion.div
                      key="pitch"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-5"
                    >
                      {/* Tesis & Zemin Standartları */}
                      <div className="space-y-3">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.25em] ml-1">Zemin & Tesis Kalitesi</p>
                        
                        {/* 3'lü Değerlendirme Grid */}
                        {(() => {
                          const getGradeBadgeStyles = (grade?: 'A' | 'B' | 'C' | string) => {
                            const g = grade || 'A';
                            if (g.startsWith('A')) return 'bg-[#39FF14]/10 border-[#39FF14]/25 text-[#39FF14] shadow-[0_0_12px_rgba(57,255,20,0.15)]';
                            if (g.startsWith('B')) return 'bg-[#FFFF00]/10 border-[#FFFF00]/25 text-[#FFFF00] shadow-[0_0_12px_rgba(255,255,0,0.15)]';
                            return 'bg-orange-500/10 border-orange-500/25 text-orange-400';
                          };
                          return (
                            <div className="grid grid-cols-3 gap-2.5">
                              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 text-center relative overflow-hidden group">
                                <Layers size={14} className="text-[#39FF14] mx-auto mb-1.5" />
                                <span className="block text-[8px] font-bold text-white/30 uppercase tracking-widest mb-0.5">ZEMİN</span>
                                <span className="text-xs font-black text-white">Suni Çim</span>
                                <div className={`mt-1.5 inline-block px-2.5 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-wider ${getGradeBadgeStyles(activePitch.grassGrade)}`}>
                                  GRADE {activePitch.grassGrade || 'A'}
                                </div>
                              </div>

                              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 text-center relative overflow-hidden group">
                                <Zap size={14} className="text-[#FFFF00] mx-auto mb-1.5" />
                                <span className="block text-[8px] font-bold text-white/30 uppercase tracking-widest mb-0.5">IŞIKLANDIRMA</span>
                                <span className="text-xs font-black text-white">LED Güçlü</span>
                                <div className={`mt-1.5 inline-block px-2.5 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-wider ${getGradeBadgeStyles(activePitch.lightingGrade)}`}>
                                  GRADE {activePitch.lightingGrade || 'A'}
                                </div>
                              </div>

                              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 text-center relative overflow-hidden group">
                                <Shield size={14} className="text-[#00f2fe] mx-auto mb-1.5" />
                                <span className="block text-[8px] font-bold text-white/30 uppercase tracking-widest mb-0.5">KONFOR</span>
                                <span className="text-xs font-black text-white">Soyunma Odası</span>
                                <div className={`mt-1.5 inline-block px-2.5 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-wider ${getGradeBadgeStyles(activePitch.lockerRoomGrade)}`}>
                                  GRADE {activePitch.lockerRoomGrade || 'B'}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Olanaklar Grid */}
                        <div className="bg-black/30 border border-white/5 rounded-2xl p-4">
                          <span className="block text-[8px] font-bold text-white/40 uppercase tracking-widest mb-3">TESİS OLANAKLARI</span>
                          <div className="grid grid-cols-2 gap-2">
                            {activePitch.amenities && activePitch.amenities.map((amenity, i) => (
                              <div key={i} className="flex items-center gap-2 text-white/70 text-[11px] font-medium bg-white/[0.02] border border-white/5 px-3 py-2.5 rounded-xl">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14]/80 shadow-[0_0_6px_rgba(57,255,20,0.5)]" />
                                <span>{amenity}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'rules' && (
                    <motion.div
                      key="rules"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-5"
                    >
                      {/* Maç Kuralları */}
                      <div className="space-y-3">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.25em] ml-1">Katılım & Oynanış Kuralları</p>
                        
                        <div className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-4">
                          <div className="flex items-center justify-between border-b border-white/5 pb-3">
                            <div className="flex items-center gap-2.5">
                              <Calendar size={14} className="text-white/40" />
                              <span className="text-[11px] text-white/50 font-bold uppercase tracking-wider">YAŞ GRUBU</span>
                            </div>
                            <span className="text-xs font-black text-white uppercase italic">{ageLimit}</span>
                          </div>

                          <div className="flex items-center justify-between border-b border-white/5 pb-3">
                            <div className="flex items-center gap-2.5">
                              <Award size={14} className="text-white/40" />
                              <span className="text-[11px] text-white/50 font-bold uppercase tracking-wider">AYAKKABI KURALI</span>
                            </div>
                            <span className="text-xs font-black text-[#FFFF00] uppercase italic text-right max-w-[200px] leading-tight">
                              {footwearRule}
                            </span>
                          </div>

                          <div className="flex items-center justify-between border-b border-white/5 pb-3">
                            <div className="flex items-center gap-2.5">
                              <Users size={14} className="text-white/40" />
                              <span className="text-[11px] text-white/50 font-bold uppercase tracking-wider">CİNSİYET</span>
                            </div>
                            <span className="text-xs font-black text-white uppercase italic">{genderRule}</span>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <Shield size={14} className="text-white/40" />
                              <span className="text-[11px] text-white/50 font-bold uppercase tracking-wider">HAKEM DURUMU</span>
                            </div>
                            <span className={`text-xs font-black uppercase italic ${hasReferee ? 'text-[#39FF14]' : 'text-white/50'}`}>
                              {hasReferee ? 'RESMİ LİSANSLI HAKEM' : 'HAKEMSİZ (KAPTAN KONTROLÜ)'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'finance' && (
                    <motion.div
                      key="finance"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-5"
                    >
                      {/* Katılım Şartları */}
                      <div className="space-y-3">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.25em] ml-1">Finansal Limitler & Barajlar</p>
                        
                        <div className="grid grid-cols-2 gap-3.5">
                          {/* Ücret Paneli */}
                          <div className="bg-[#39FF14]/5 border border-[#39FF14]/15 rounded-2xl p-4 flex flex-col justify-between h-24">
                            <div className="flex items-center gap-1.5 text-white/40">
                              <DollarSign size={12} className="text-[#39FF14]" />
                              <span className="text-[9px] font-black uppercase tracking-widest">KATILIM BEDELİ</span>
                            </div>
                            <div className="flex items-baseline gap-1 mt-2">
                              <span className="text-2xl font-black text-[#39FF14] tracking-tight">{match.price > 0 ? `${match.price}` : 'Ücretsiz'}</span>
                              {match.price > 0 && <span className="text-[10px] font-bold text-[#39FF14]/60">₺/Kişi</span>}
                            </div>
                          </div>

                          {/* Min Rating Barajı */}
                          <div className="bg-[#FFFF00]/5 border border-[#FFFF00]/15 rounded-2xl p-4 flex flex-col justify-between h-24">
                            <div className="flex items-center gap-1.5 text-white/40">
                              <Star size={12} className="text-[#FFFF00]" />
                              <span className="text-[9px] font-black uppercase tracking-widest">MİN. REYTİNG</span>
                            </div>
                            <div className="flex items-baseline gap-1 mt-2">
                              <span className="text-2xl font-black text-[#FFFF00] tracking-tight">{match.minRating || '4.0'}</span>
                              <span className="text-[10px] font-bold text-[#FFFF00]/60">Baraj</span>
                            </div>
                          </div>
                        </div>

                        {/* Reyting Barajı Visualizer */}
                        <div className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-3">
                          <span className="block text-[8px] font-bold text-white/40 uppercase tracking-widest">REYTİNG UYUMLULUĞU</span>
                          
                          <div className="relative h-2.5 bg-white/10 rounded-full overflow-hidden">
                            {/* Baraj Noktası İşaretçisi (Sarı) */}
                            <div 
                              className="absolute top-0 bottom-0 bg-[#FFFF00]/30 shadow-[0_0_8px_#FFFF00]"
                              style={{ left: 0, width: `${(match.minRating || 4.0) * 20}%` }}
                            />
                            {/* Kullanıcı Reyting Çubuğu (Neon Yeşil) */}
                            <div 
                              className="absolute top-0 bottom-0 bg-[#39FF14] shadow-[0_0_12px_#39FF14]"
                              style={{ left: 0, width: `${(currentUserProfile.rating || 4.5) * 20}%` }}
                            />
                            {/* Baraj Çizgisi (Kırmızı Vurgulu) */}
                            <div 
                              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                              style={{ left: `${(match.minRating || 4.0) * 20}%` }}
                            />
                          </div>
                          
                          <div className="flex justify-between text-[8px] text-white/40 font-black uppercase tracking-widest">
                            <span>REY: 0.0</span>
                            <span className="text-red-400">BARAJ: {match.minRating || '4.0'}</span>
                            <span className="text-[#39FF14]">SKORUNUZ: {(currentUserProfile.rating || 4.5).toFixed(1)}</span>
                            <span>5.0</span>
                          </div>
                        </div>

                        {/* Topluluk Sınırlaması */}
                        <div className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-3">
                          <span className="block text-[8px] font-bold text-white/40 uppercase tracking-widest">ERİŞİM KONTROLÜ</span>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white/60">Topluluk Sınırı</span>
                            <span className="text-xs font-black text-[#00f2fe] uppercase italic">
                              {communityName}
                            </span>
                          </div>
                          <p className="text-[10px] text-white/30 leading-relaxed">
                            Bu maç yalnızca belirtilen topluluk veya grup üyelerinin katılımına açıktır.
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Alt Buton */}
              <div className="p-5 border-t border-white/5 bg-[#06080A]/60 backdrop-blur-md shrink-0">
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 font-black text-xs uppercase tracking-widest text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95 text-center cursor-pointer"
                >
                  Geri Dön
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

// ─── Arkadaş Satır Bileşeni ───────────────────────────────────────────────────

const FriendInviteRow: React.FC<{ friend: any; onInvite: () => void }> = ({ friend, onInvite }) => (
  <motion.button
    whileHover={{ scale: 1.01, x: 2 }}
    whileTap={{ scale: 0.98 }}
    onClick={onInvite}
    className="w-full bg-[#161B22] border border-white/5 rounded-2xl p-3.5 flex items-center justify-between transition-all hover:border-[#39FF14]/20 hover:bg-white/[0.02] group"
  >
    <div className="flex items-center gap-3">
      <div className="relative">
        <img src={friend.avatar || `https://i.pravatar.cc/150?u=${friend.id}`}
          alt={friend.name} className="w-11 h-11 rounded-full object-cover bg-[#0A0E14] border border-white/10" />
        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#161B22] ${friend.online ? 'bg-[#39FF14]' : 'bg-white/20'}`} />
      </div>
      <div className="text-left">
        <p className="text-sm font-bold text-white leading-tight">{friend.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-white/5 text-white/40 uppercase tracking-widest">
            {friend.pos || friend.position || 'OYUNCU'}
          </span>
          {friend.fp && (
            <span className="text-[9px] font-bold text-yellow-400 flex items-center gap-0.5">
              <Star size={8} className="fill-current" /> {friend.fp}
            </span>
          )}
        </div>
      </div>
    </div>
    <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all bg-[#39FF14]/5 border border-[#39FF14]/15 text-[#39FF14] group-hover:bg-[#39FF14]/15 group-hover:border-[#39FF14]/40 group-hover:shadow-[0_0_12px_rgba(57,255,20,0.25)]">
      <Send size={11} />
      <span>Davet</span>
    </div>
  </motion.button>
);

export default MatchJoin;
