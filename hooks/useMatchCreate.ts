import { useState, useEffect, useMemo } from 'react';
import { Pitch, AppView, PositionSlot, Player } from '../types';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';

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
  const [activeSheet, setActiveSheet] = useState<'RULES' | 'PITCH' | 'PLAYER_PICKER' | 'SUPPORT' | 'NONE'>('NONE');
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

  const [myPlayers, setMyPlayers] = useState<Record<string, { id: string; name: string; avatar: string; status?: 'PENDING' | 'CONFIRMED' }>>({});
  const [selectedPitch, setSelectedPitch] = useState<Pitch | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<{ date: string; time: string } | null>(null);
  
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [customPositions, setCustomPositions] = useState<Record<string, {x: number, y: number, role: string}>>({});

  const { incrementUnreadNotifications, addUserNotification, addMatch, adminMatches, activeDraftId, updateMatch, setActiveDraftId } = useAppStore();

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

  // Symmetrical Defaults
  const getSymmetricPositions = (pt: number, orient: 'vertical' | 'horizontal') => {
    const verticalDefaults: Record<number, {x:number, y:number, role:string}[]> = {
      3: [
        { x: 50, y: 90, role: 'KL' }, { x: 30, y: 55, role: 'SAV' }, { x: 70, y: 55, role: 'SAV' }
      ],
      5: [
        { x: 50, y: 90, role: 'KL' }, { x: 30, y: 75, role: 'SAV' }, { x: 70, y: 75, role: 'SAV' },
        { x: 50, y: 50, role: 'ORT' }, { x: 50, y: 25, role: 'HÜC' }
      ],
      7: [
        { x: 50, y: 90, role: 'KL' }, { x: 25, y: 75, role: 'SAV' }, { x: 75, y: 75, role: 'SAV' },
        { x: 20, y: 50, role: 'ORT' }, { x: 50, y: 50, role: 'ORT' }, { x: 80, y: 50, role: 'ORT' },
        { x: 50, y: 25, role: 'HÜC' }
      ],
      11: [
        { x: 50, y: 90, role: 'KL' }, { x: 20, y: 75, role: 'SAV' }, { x: 40, y: 75, role: 'SAV' }, { x: 60, y: 75, role: 'SAV' }, { x: 80, y: 75, role: 'SAV' },
        { x: 20, y: 50, role: 'ORT' }, { x: 40, y: 50, role: 'ORT' }, { x: 60, y: 50, role: 'ORT' }, { x: 80, y: 50, role: 'ORT' },
        { x: 35, y: 25, role: 'HÜC' }, { x: 65, y: 25, role: 'HÜC' }
      ]
    };
    
    let base = verticalDefaults[pt] || verticalDefaults[11];
    
    if (orient === 'horizontal') {
        return base.map(p => ({
            role: p.role,
            x: 100 - p.y,
            y: p.x
        }));
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

  const calculatedBudget = useMemo(() => {
    return selectedPitch ? Math.round(selectedPitch.totalPrice / (perTeam * 2)) : 0;
  }, [selectedPitch, perTeam]);

  const costPerPerson = (manualBudget !== null && manualBudget >= 0) ? manualBudget : calculatedBudget;

  const publishMatch = async () => {
    if (!isReady) {
      setActiveSheet('PITCH');
      return;
    }

    const matchData = {
        id: 'm_' + Math.random().toString(36).substr(2, 9),
        creatorId: auth.currentUser?.uid,
        title: matchTitle.trim() || `${selectedPitch?.name || 'Saha'} Maçı`,
        homeTeamName: homeTeamName.trim() || undefined,
        awayTeamName: awayTeamName.trim() || undefined,
        location: selectedPitch?.district || 'Belirtilmedi',
        time: selectedTimeSlot?.time || '',
        date: selectedTimeSlot?.date || '',
        price: costPerPerson,
        difficulty: (dna.mentality === 'ciddi' ? 'Ciddi' : dna.mentality === 'taktiksel' ? 'Taktiksel' : 'Rahat') as 'Ciddi' | 'Taktiksel' | 'Rahat',
        format: format.v,
        duration: dna.duration,
        gender: dna.gender,
        ageGroup: Array.isArray(dna.age) ? dna.age.join(', ') : dna.age,
        minRating: 4.0,
        image: selectedPitch?.image || 'https://images.unsplash.com/photo-1575361204480-aadea2559ee2?q=80&w=600',
        badges: ['Fair Play Vurgulu', `${format.label}`],
        communityId: 'c1',
        missingPositions: [
            { role: 'STP', count: 1 },
            { role: 'ORT', count: 1 }
        ],
        slots: pitchSlots.map((slot): PositionSlot => {
            const baseSlot: PositionSlot = {
                id: slot.id,
                role: slot.role,
                x: slot.x,
                y: slot.y,
                status: slot.player ? 'TAKEN' : 'OPEN',
            };
            if (slot.player) {
                baseSlot.player = {
                    id: slot.player.id,
                    name: slot.player.name,
                    avatar: slot.player.avatar,
                    style: 'Bitirici',
                    rating: 4.8,
                    position: slot.role,
                    x: slot.x,
                    y: slot.y,
                    paymentStatus: slot.player.status === 'CONFIRMED' ? 'PAID' : 'PENDING'
                };
            }
            return baseSlot;
        })
    };

    try {
        setIsPublishing(true);
        if (isDraftMode && draftMatch) {
            await updateMatch({ ...draftMatch, status: 'ACTIVE', slots: matchData.slots, format: format.v, duration: dna.duration, gender: dna.gender, ageGroup: Array.isArray(dna.age) ? dna.age.join(', ') : dna.age });
            setActiveDraftId(null);
        } else {
            await addMatch(matchData);
        }
        
        // Add user notifications for pending players
        pitchSlots.forEach(slot => {
            if (slot.player && slot.player.status === 'PENDING') {
                addUserNotification({
                    id: Math.random().toString(),
                    type: 'INVITE',
                    title: 'Maç Daveti ⚽',
                    desc: `${selectedPitch?.name || 'Saha'} maçı için kadroya davet edildin!`,
                    time: 'Az önce',
                    iconName: 'Trophy',
                    color: 'bg-yellow-500',
                    textColor: 'text-yellow-500'
                });
                incrementUnreadNotifications();
            }
        });
        
        onNavigate('MATCH_DISCOVERY');
    } catch(err) {
        console.error("Maç yayınlanamadı:", err);
        alert("Maç yayınlanırken bir hata oluştu!");
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
    myPlayers, setMyPlayers,
    selectedPitch, setSelectedPitch,
    selectedTimeSlot, setSelectedTimeSlot,
    orientation, setOrientation,
    customPositions, setCustomPositions,
    draftMatch, isDraftMode,
    perTeam, isReady,
    handleSlotMove, pitchSlots,
    toggleOrientation, calculatedBudget, costPerPerson,
    publishMatch
  };
};
