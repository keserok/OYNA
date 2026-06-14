
import React, { useState, useEffect, useMemo } from 'react';
import { UserRole, AppView, JobListing, GkStyle, DirectOffer, Equipment } from '../types';
import { ArrowLeft, MapPin, Navigation, Star, DollarSign, Calendar, Shield, Scale, Power, Bell, Wallet, List, User, Check, X, ChevronRight, Clock, Trophy, Search, MessageSquare, Send, ArrowRight, Hand, Briefcase, PlusCircle, Sparkles, Zap, Activity, Coins, Tag, Flame, RefreshCcw, Eye, Gauge, Flag, CreditCard, Banknote, Users, Settings, Award, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { UPCOMING_JOBS, WALLET_HISTORY, DIRECT_OFFERS_MOCK } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import ServiceProfile from './ServiceProfile';
import ServiceSettings from './ServiceSettings';
import { auth } from '../supabaseAuth';
import { supabase } from '../supabaseClient';
import { useAppStore } from '../store';
import { subscribeToOpenMatches, applyToMatch } from '../services/matchService';

interface ServiceDashboardProps {
  role: UserRole;
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

type Tab = 'HOME' | 'JOBS' | 'PRICING' | 'WALLET' | 'MENU' | 'PROFILE_VIEW' | 'SETTINGS_VIEW';

// Removed equipment mock data

const ServiceDashboard: React.FC<ServiceDashboardProps> = ({ role, onBack, onNavigate }) => {
  const isRef = role === UserRole.REFEREE;
  const {
    unreadNotificationsCount,
    setIsNotificationsOpen,
    updateGoalkeeper,
    updateReferee,
    adminMatches
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>('HOME');
  const [isAvailable, setIsAvailable] = useState(true);
  const [openMatches, setOpenMatches] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<DirectOffer | null>(null);
  const [selectedUpcomingJob, setSelectedUpcomingJob] = useState<JobListing | null>(null);
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [showBidSuccess, setShowBidSuccess] = useState(false);
  
  // New States
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [baseFee, setBaseFee] = useState(isRef ? 350 : 250);
  const [showOnlineSetupModal, setShowOnlineSetupModal] = useState(false);
  const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const ALL_HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,'0')}:00`);
  const [setupDays, setSetupDays] = useState<string[]>(['Pzt', 'Sal', 'Çar']);
  const [setupHours, setSetupHours] = useState<string[]>(['19:00', '20:00', '21:00']);
  const [activeDays, setActiveDays] = useState<string[]>(['Bugün']);
  const [activeHours, setActiveHours] = useState<string>('18:00 - 23:00');
  // Wallet card state
  const [showCardOptions, setShowCardOptions] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [showAddCard, setShowAddCard] = useState(false);
  const [newCardNo, setNewCardNo] = useState('');
  
  // UX Enhancements States
  const [matchLiveStatus, setMatchLiveStatus] = useState<Record<string, 'ON_THE_WAY' | 'ARRIVED' | 'FINISHED'>>({});
  const [showPostMatchReport, setShowPostMatchReport] = useState(false);
  const [postMatchRating, setPostMatchRating] = useState(5);
  const [newCardHolder, setNewCardHolder] = useState('');
  
  const [flipCard, setFlipCard] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);
  const [showCardSelect, setShowCardSelect] = useState(false);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [myOffers, setMyOffers] = useState<any[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);

  const [timeLeft, setTimeLeft] = useState('--:--:--');

  const myUpcomingMatches = useMemo(() => {
      if (!userProfile) return [];
      const upcoming = adminMatches.filter((m: any) => {
          const isMyMatch = isRef 
              ? m.refereeId === userProfile.id 
              : (m.gkId === userProfile.id || m.gk_id === userProfile.id);
          return isMyMatch && (m.status === 'CONFIRMED' || m.status === 'LIVE' || m.status === 'ACTIVE' || !m.status);
      }).sort((a: any, b: any) => new Date(`${a.date} ${a.time}`).getTime() - new Date(`${b.date} ${b.time}`).getTime());
      
      return upcoming.filter((m: any) => {
          const matchTime = new Date(`${m.date} ${m.time}`).getTime();
          return isNaN(matchTime) ? true : matchTime > new Date().getTime(); // If invalid date, keep it for now
      });
  }, [adminMatches, userProfile, isRef]);

  useEffect(() => {
      const timer = setInterval(() => {
          if (myUpcomingMatches.length > 0) {
              const match = myUpcomingMatches[0];
              const matchDate = new Date(`${match.date} ${match.time}`);
              const now = new Date();
              const diff = matchDate.getTime() - now.getTime();
              
              if (isNaN(diff) || diff <= 0) {
                  setTimeLeft("00:00:00");
              } else {
                  const hours = Math.floor(diff / (1000 * 60 * 60));
                  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                  const secs = Math.floor((diff % (1000 * 60)) / 1000);
                  setTimeLeft(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
              }
          } else {
              setTimeLeft('--:--:--');
          }
      }, 1000);
      return () => clearInterval(timer);
  }, [myUpcomingMatches]);

  const pendingApplications = useMemo(() => {
      if (!userProfile) return [];
      return adminMatches.filter((m: any) => {
          return m.applicants && Array.isArray(m.applicants) && m.applicants.some((a: any) => a.userId === userProfile.id || a.userId === userProfile.uid) && m.status !== 'CONFIRMED' && m.status !== 'COMPLETED';
      });
  }, [adminMatches, userProfile]);

  useEffect(() => {
    let active = true;
    
    const loadProfile = async () => {
        // Fetch from global store for now
        const { adminGoalkeepers, adminReferees } = useAppStore.getState();
        const me = (isRef ? adminReferees : adminGoalkeepers).find(x => x.id === (auth.currentUser?.uid || 'u1')) || (isRef ? adminReferees[0] : adminGoalkeepers[0]);
        
        if (active && me) {
            setUserProfile({
                id: me.id,
                uid: me.id,
                fullName: me.name,
                role: role,
                email: auth.currentUser?.email || 'test@example.com',
                isAvailable: me.isAvailable ?? true,
                rating: me.rating,
                matchesPlayed: me.matchCount || 42,
                walletBalance: 1250,
                createdAt: new Date(),
                stats: me.stats,
                workingHours: me.workingHours || { activeDays: ['Bugün'], activeHours: '18:00 - 23:00' }
            });
            setIsAvailable(me.isAvailable ?? true);
            setBaseFee(me.fee);
            if (me.workingHours) {
              setActiveDays(me.workingHours.activeDays || ['Bugün']);
              setActiveHours(me.workingHours.activeHours || '18:00 - 23:00');
            }
        }
    };

    loadProfile();



    const unsubscribe = subscribeToOpenMatches((matches) => {
      // Map matches from Supabase to JobListing format needed here
      const jobs = matches.map((m: any) => ({
        id: m.id,
        roleNeeded: role === UserRole.GOALKEEPER ? 'GK' : 'REF',
        date: m.date || 'Bugün',
        time: m.time || '21:00',
        location: m.pitch_id || 'Bilinmiyor',
        duration: '90 Dk',
        fee: m.budget ? parseInt(m.budget) : 350,
        teamName: 'Rakip Aranıyor',
        format: m.format || '7v7',
        difficulty: 'Ciddi',
        status: m.status || 'OPEN',
      }));
      setOpenMatches(jobs);
    });

    return () => {
        active = false;
        unsubscribe();
    };
  }, [role, isRef]);

  useEffect(() => {
    if (!userProfile?.id) return;
    const fetchOffers = async () => {
      try {
        const { data, error } = await supabase
          .from('service_offers')
          .select('*')
          .eq('provider_id', userProfile.id)
          .eq('status', 'PENDING');
        if (!error && data) {
          const mappedOffers = data.map((o: any) => {
            const match: any = adminMatches.find((m: any) => m.id === o.match_id);
            return {
              id: o.id,
              matchId: o.match_id,
              pitchName: match?.pitch_name || match?.location || 'Özel Maç Teklifi',
              teamName: match?.captain_name ? `${match.captain_name} Takımı` : 'Özel Grup',
              captainName: match?.captain_name || 'Kaptan',
              offerAmount: o.amount,
              time: match?.time || 'Belirsiz',
              date: match?.date || 'Belirsiz',
              message: o.message || 'Seni maçımızda görmek istiyoruz!',
              expiresIn: '24s'
            };
          });
          setMyOffers(mappedOffers);
        }
      } catch (err) {
        console.error("Error fetching offers", err);
      }
    };
    fetchOffers();

    const fetchWallet = async () => {
        const { data } = await supabase.from('profiles').select('wallet_balance').eq('id', userProfile.id).single();
        if (data) {
            setWalletBalance(data.wallet_balance || 0);
        }
    };
    fetchWallet();
  }, [userProfile]);

  const handleToggleClick = () => {
      if (isAvailable) {
          setOnlineStatus(false);
      } else {
          setShowOnlineSetupModal(true);
      }
  };

  const setOnlineStatus = async (status: boolean) => {
      setIsAvailable(status);
      if (userProfile && userProfile.uid) {
          const update = { id: userProfile.uid, isAvailable: status };
          if (isRef) updateReferee(update as any);
          else updateGoalkeeper(update as any);
      }
  };

  const handleUpdateFee = async (newFee: number) => {
      setBaseFee(newFee);
      if (userProfile && userProfile.id) {
          const update = { id: userProfile.id, fee: newFee };
          if (isRef) updateReferee(update as any);
          else updateGoalkeeper(update as any);
          console.log("Supabase: Fee updated to:", newFee);
      }
  };

  const handleSaveOnlineSetup = () => {
      setActiveDays(setupDays);
      const activeHoursStr = setupHours.length > 0 ? `${setupHours[0]} - ${setupHours[setupHours.length-1]}` : 'Belirsiz';
      setActiveHours(activeHoursStr);
      
      if (userProfile && userProfile.id) {
          const workingHours = { activeDays: setupDays, activeHours: activeHoursStr };
          const update = { id: userProfile.id, workingHours, isAvailable: true };
          if (isRef) updateReferee(update as any);
          else updateGoalkeeper(update as any);
      }
      setIsAvailable(true);
      setShowOnlineSetupModal(false);
  };

  useEffect(() => {
    if (activeTab === 'HOME') {
        const timer = setInterval(() => {
            // Simple mock countdown logic
            setTimeLeft(prev => {
                const parts = prev.split(':').map(Number);
                let [h, m, s] = parts;
                if (s > 0) s--;
                else if (m > 0) { m--; s = 59; }
                else if (h > 0) { h--; m = 59; s = 59; }
                return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
            });
        }, 1000);
        return () => clearInterval(timer);
    }
  }, [activeTab]);

  const handleTransfer = async () => {
      if (!userProfile?.id || walletBalance <= 0) return;
      setIsTransferring(true);
      try {
          const currentAmount = walletBalance;
          const { error } = await supabase
              .from('profiles')
              .update({ wallet_balance: 0 })
              .eq('id', userProfile.id);

          if (!error) {
              await supabase.from('wallet_transactions').insert({
                  user_id: userProfile.id,
                  amount: currentAmount,
                  type: 'WITHDRAWAL',
                  status: 'COMPLETED',
                  description: 'Banka Hesabına Çekim'
              });
              setWalletBalance(0);
              setTransferSuccess(true);
              setTimeout(() => setTransferSuccess(false), 3000);
          } else {
              console.error("Error withdrawing:", error);
          }
      } catch (err) {
          console.error("Transfer error:", err);
      } finally {
          setIsTransferring(false);
      }
  };

  // Theme configuration based on role
  const theme = isRef 
    ? { primary: 'text-red-500', bg: 'bg-red-500', border: 'border-red-500', gradient: 'from-red-900', shadow: 'shadow-red-900/20', secondaryBg: 'bg-red-900/20' }
    : { primary: 'text-green-500', bg: 'bg-green-500', border: 'border-green-500', gradient: 'from-[#064E3B]', shadow: 'shadow-green-900/20', secondaryBg: 'bg-green-900/20' };

  const handleOpenBid = (job: any) => {
      setSelectedJob(job);
      setBidAmount(0); // In real app, we might bid a custom amount
  };

  const handleOpenOffer = (offer: DirectOffer) => {
      setSelectedOffer(offer);
      setBidAmount(offer.offerAmount);
  };

  const acceptOffer = async () => {
      if (!selectedOffer) return;

      // Local double-booking/conflict check
      const match = adminMatches.find(m => m.id === selectedOffer.matchId);
      if (match) {
          const hasConflict = myUpcomingMatches.some(um => um.date === match.date && um.time === match.time);
          if (hasConflict) {
              alert('HATA: Bu tarih ve saatte zaten onaylanmış bir maçınız bulunmaktadır. Lütfen teklifi reddedin.');
              return;
          }
      }

      setIsTransferring(true);
      try {
          const { error } = await supabase
            .from('service_offers')
            .update({ status: 'ACCEPTED' })
            .eq('id', selectedOffer.id);
          
          if (!error) {
              setMyOffers(prev => prev.filter(o => o.id !== selectedOffer.id));
              console.log(`Accepted offer ${selectedOffer.id} for match ${selectedOffer.matchId}`);
              setShowBidSuccess(true);
              setTimeout(() => {
                  setShowBidSuccess(false);
                  setSelectedOffer(null);
              }, 2000);
          } else {
              console.error("Error from supabase:", error);
              if (error.message && error.message.includes('CONFLICT_DETECTED')) {
                  alert('HATA: Bu tarih ve saatte zaten onaylanmış bir maçınız bulunmaktadır. Lütfen teklifi reddedin.');
              } else {
                  alert('Bir hata oluştu. Lütfen tekrar deneyin.');
              }
          }
      } catch (error: any) {
          console.error("Error accepting offer:", error);
          if (error.message && error.message.includes('CONFLICT_DETECTED')) {
              alert('HATA: Bu tarih ve saatte zaten onaylanmış bir maçınız bulunmaktadır. Lütfen teklifi reddedin.');
          }
      } finally {
          setIsTransferring(false);
      }
  };

  const submitBid = async () => {
      const uid = auth.currentUser?.uid || 'mock-user-id';
      const displayName = userProfile?.fullName || 'İsimsiz Üye';
      const photoURL = auth.currentUser?.photoURL || '';

      if (selectedOffer) {
          return acceptOffer();
      }

      if (!uid || !selectedJob?.id) return;
      
      // Local double-booking/conflict check
      if (selectedJob) {
          const hasConflict = myUpcomingMatches.some(um => um.date === selectedJob.date && um.time === selectedJob.time);
          if (hasConflict) {
              alert('HATA: Bu tarih ve saatte zaten onaylanmış bir maçınız bulunmaktadır.');
              return;
          }
      }
      
      setIsTransferring(true);
      try {
          await applyToMatch(selectedJob.id, {
            uid,
            displayName,
            role: isRef ? 'REFEREE' : 'GOALKEEPER',
            photoURL
          });
          console.log("Applied to match:", selectedJob.id);
          
          setShowBidSuccess(true);
          setTimeout(() => {
              setShowBidSuccess(false);
              setSelectedJob(null);
          }, 2000);
      } catch (error) {
          console.error("Error submitting bid:", error);
          alert("Başvuru yapılırken bir hata oluştu.");
      } finally {
          setIsTransferring(false);
      }
  };

  // --- GOALKEEPER IDENTITY CARD (FLIPPING) ---
  const renderGoalkeeperIdentityCard = () => (
      <div 
        className="mx-6 mt-6 mb-6 h-56 relative perspective-1000 cursor-pointer group"
        onClick={() => setFlipCard(!flipCard)}
      >
          <div className={`relative w-full h-full transition-transform duration-700 transform-style-3d ${flipCard ? 'rotate-y-180' : ''}`}>
              
              {/* FRONT SIDE */}
              <div className="absolute inset-0 backface-hidden rounded-[32px] bg-[#161B22]/90 backdrop-blur-xl border border-green-500/30 shadow-2xl p-5 overflow-hidden">
                  {/* Background FX */}
                  <div className="absolute -right-10 -top-10 w-40 h-40 bg-green-500/20 blur-[50px] rounded-full pointer-events-none"></div>
                  <div className="absolute top-4 right-4 bg-black/40 px-2 py-1 rounded-lg border border-white/10 text-[10px] text-gray-400 flex items-center gap-1">
                      <RefreshCcw size={10} /> Çevir
                  </div>

                  <div className="flex gap-4 items-center h-full">
                      <div className="relative shrink-0">
                          <div className="w-24 h-32 bg-black/40 rounded-2xl overflow-hidden border-2 border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.3)]">
                              <img src={auth.currentUser?.photoURL || "https://images.unsplash.com/photo-1529516222410-a269c812ac8d?auto=format&fit=crop&q=80&w=400"} className="w-full h-full object-cover object-center" alt="Goalkeeper" referrerPolicy="no-referrer" />
                          </div>
                          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#FFFF00] text-black text-[10px] font-black px-3 py-1 rounded-full shadow-lg whitespace-nowrap border-2 border-[#161B22]">
                              LVL 8
                          </div>
                      </div>
                      <div className="flex-1">
                          <h2 className="text-3xl font-black text-white leading-none mb-1 truncate max-w-[150px]">{userProfile?.fullName?.split(' ')[0]?.toUpperCase() || 'VOLKAN'}</h2>
                          <div className="flex items-center gap-2 mb-3">
                              <span className="bg-green-500 text-black text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1">
                                  <Shield size={10} fill="black" /> PANTER
                              </span>
                              <span className="text-xs text-gray-400">Kadıköy</span>
                          </div>
                          
                          {/* Stats Grid */}
                          <div className="grid grid-cols-3 gap-2 mt-2">
                              <div className="bg-[#0A0E14] rounded-xl p-2 text-center border border-white/5">
                                  <p className="text-[9px] text-gray-500 font-bold">MAÇ</p>
                                  <p className="text-sm font-black text-white">{userProfile?.matchesPlayed || 42}</p>
                              </div>
                              <div className="bg-[#0A0E14] rounded-xl p-2 text-center border border-white/5">
                                  <p className="text-[9px] text-gray-500 font-bold">REAKSİYON</p>
                                  <p className="text-sm font-black text-white">{userProfile?.stats?.reflexes || 90}</p>
                              </div>
                              <div className="bg-[#0A0E14] rounded-xl p-2 text-center border border-white/5">
                                  <p className="text-[9px] text-gray-500 font-bold">PUAN</p>
                                  <p className="text-sm font-black text-green-400">{userProfile?.rating || 4.8}</p>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>

              {/* ── BACK SIDE ── SPECTACULAR */}
              <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-[32px] overflow-hidden border-2 border-green-400/60 shadow-[0_0_40px_rgba(34,197,94,0.35)]"
                style={{ background: 'linear-gradient(135deg, #022c16 0%, #061a10 50%, #0A0E14 100%)' }}>

                {/* Animated hex grid background */}
                <svg className="absolute inset-0 w-full h-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="hex" width="28" height="24" patternUnits="userSpaceOnUse">
                      <polygon points="14,2 24,8 24,16 14,22 4,16 4,8" fill="none" stroke="#22c55e" strokeWidth="0.8"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#hex)"/>
                </svg>

                {/* Top neon bar */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent" />

                {/* Glow orbs */}
                <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full blur-[50px]" style={{ background: 'rgba(34,197,94,0.4)' }} />
                <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full blur-[40px]" style={{ background: 'rgba(255,255,0,0.15)' }} />

                <div className="relative z-10 h-full flex flex-col p-4">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-green-500 flex items-center justify-center text-black">
                        <Shield size={12} fill="black" />
                      </div>
                      <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Kariyer Kartı</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-green-500/20 border border-green-400/40 px-2.5 py-1 rounded-lg">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-[10px] font-black text-green-300">A-CLASS</span>
                    </div>
                  </div>

                  {/* Main rating */}
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center relative">
                      <div className="absolute inset-0 blur-2xl rounded-full" style={{ background: 'rgba(34,197,94,0.3)' }} />
                      <div className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em] mb-0.5">Genel Reyting</div>
                      <div className="text-6xl font-black leading-none relative"
                        style={{ color: '#22c55e', textShadow: '0 0 30px rgba(34,197,94,0.8), 0 0 60px rgba(34,197,94,0.4)' }}>
                        {userProfile?.rating || 4.8}
                      </div>
                      <div className="flex items-center justify-center gap-0.5 mt-1">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className="w-5 h-1 rounded-full" style={{ background: i <= 4 ? '#22c55e' : 'rgba(255,255,255,0.1)' }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Uçuş', value: userProfile?.stats?.diving || 88, glow: '#22c55e' },
                      { label: 'Konum', value: userProfile?.stats?.positioning || 82, glow: '#facc15' },
                      { label: 'Bire Bir', value: userProfile?.stats?.oneOnOne || 88, glow: '#22c55e' },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl py-2 px-1 text-center border border-white/8"
                        style={{ background: 'rgba(0,0,0,0.5)' }}>
                        <div className="text-lg font-black" style={{ color: s.glow, textShadow: `0 0 12px ${s.glow}80` }}>{s.value}</div>
                        <div className="text-[8px] text-gray-500 font-bold uppercase">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

          </div>
      </div>
  );

  // --- REFEREE IDENTITY CARD (FLIPPING) ---
  const renderRefereeIdentityCard = () => (
      <div 
        className="mx-6 mt-6 mb-6 h-56 relative perspective-1000 cursor-pointer group"
        onClick={() => setFlipCard(!flipCard)}
      >
          <div className={`relative w-full h-full transition-transform duration-700 transform-style-3d ${flipCard ? 'rotate-y-180' : ''}`}>
              
              {/* FRONT SIDE */}
              <div className="absolute inset-0 backface-hidden rounded-[32px] bg-[#161B22]/90 backdrop-blur-xl border border-red-500/30 shadow-2xl p-5 overflow-hidden">
                  {/* Background FX */}
                  <div className="absolute -right-10 -top-10 w-40 h-40 bg-red-500/20 blur-[50px] rounded-full pointer-events-none"></div>
                  <div className="absolute top-4 right-4 bg-black/40 px-2 py-1 rounded-lg border border-white/10 text-[10px] text-gray-400 flex items-center gap-1">
                      <RefreshCcw size={10} /> Çevir
                  </div>

                  <div className="flex gap-4 items-center h-full">
                      <div className="relative shrink-0">
                          <div className="w-24 h-32 bg-black/40 rounded-2xl overflow-hidden border-2 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                              <img src={auth.currentUser?.photoURL || "https://images.unsplash.com/photo-1574629310576-6e84c60be5cb?auto=format&fit=crop&q=80&w=400"} className="w-full h-full object-cover object-top" alt="Referee" referrerPolicy="no-referrer" />
                          </div>
                          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#FFFF00] text-black text-[10px] font-black px-3 py-1 rounded-full shadow-lg whitespace-nowrap border-2 border-[#161B22]">
                              FIFA
                          </div>
                      </div>
                      <div className="flex-1">
                          <h2 className="text-3xl font-black text-white leading-none mb-1 truncate max-w-[150px]">{userProfile?.fullName?.split(' ')[0]?.toUpperCase() || 'CÜNEYT'}</h2>
                          <div className="flex items-center gap-2 mb-3">
                              <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1">
                                  <Scale size={10} /> OTORİTER
                              </span>
                              <span className="text-xs text-gray-400">İstanbul</span>
                          </div>
                          
                          {/* Stats Grid */}
                          <div className="grid grid-cols-3 gap-2 mt-2">
                              <div className="bg-[#0A0E14] rounded-xl p-2 text-center border border-white/5">
                                  <p className="text-[9px] text-gray-500 font-bold">YÖNETİM</p>
                                  <p className="text-sm font-black text-white">150</p>
                              </div>
                              <div className="bg-[#0A0E14] rounded-xl p-2 text-center border border-white/5">
                                  <p className="text-[9px] text-gray-500 font-bold">VAR</p>
                                  <p className="text-sm font-black text-white">%98</p>
                              </div>
                              <div className="bg-[#0A0E14] rounded-xl p-2 text-center border border-white/5">
                                  <p className="text-[9px] text-gray-500 font-bold">PUAN</p>
                                  <p className="text-sm font-black text-red-400">4.9</p>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>

              {/* BACK SIDE */}
              <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-[32px] bg-gradient-to-br from-[#7F1D1D] to-[#161B22] border-[3px] border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.2)] p-5 flex flex-col justify-between overflow-hidden">
                  {/* Glowing Effects */}
                  <div className="absolute -right-20 -top-20 w-64 h-64 bg-red-500/20 blur-[60px] rounded-full pointer-events-none animate-pulse-slow"></div>
                  <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-orange-500/10 blur-[60px] rounded-full pointer-events-none animate-float-y"></div>
                  
                  <div className="relative z-10 flex items-center justify-between border-b border-red-500/30 pb-3">
                      <h3 className="font-black text-orange-400 uppercase tracking-widest text-xs flex items-center gap-2">
                          <Activity size={14} /> KARİYER PERFORMANSI
                      </h3>
                      <div className="bg-red-500 text-white text-[10px] font-black px-2 py-1 rounded shadow-[0_0_10px_rgba(239,68,68,0.6)] animate-pulse">
                          ELİT
                      </div>
                  </div>

                  <div className="relative z-10 flex-1 flex flex-col justify-center items-center py-4">
                      <div className="text-center relative">
                          <div className="absolute inset-0 bg-red-500 blur-2xl opacity-20 rounded-full animate-breathe"></div>
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest absolute -top-5 w-full text-center">Genel Reyting</span>
                          <span className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]">
                              4.9
                          </span>
                      </div>
                  </div>

                  <div className="relative z-10 grid grid-cols-2 gap-3">
                      <div className="bg-black/40 backdrop-blur lg:hover:-translate-y-1 transition-transform border border-white/10 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden group">
                          <div className="absolute w-full h-1 top-0 left-0 bg-gradient-to-r from-transparent via-red-400 to-transparent translate-x-[-100%] group-hover:animate-shimmer"></div>
                          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1 text-center">Maç Puanı Ort.</span>
                          <span className="text-2xl font-black text-red-400 drop-shadow-[0_0_5px_rgba(239,68,68,0.6)] z-10 relative">4.7</span>
                      </div>
                      <div className="bg-black/40 backdrop-blur lg:hover:-translate-y-1 transition-transform border border-white/10 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden group">
                          <div className="absolute w-full h-1 top-0 left-0 bg-gradient-to-r from-transparent via-orange-400 to-transparent translate-x-[-100%] group-hover:animate-shimmer"></div>
                          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1 text-center text-balance leading-tight">Yönetim Değeri</span>
                          <span className="text-2xl font-black text-orange-400 drop-shadow-[0_0_5px_rgba(249,115,22,0.6)] z-10 relative">A+</span>
                      </div>
                  </div>
              </div>

          </div>
      </div>
  );

  // --- SUB-VIEWS ---

  const renderHomeView = () => (
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="space-y-6 pb-40"
      >
          {/* Online/Offline Toggle — Premium Neon Design */}
      <div className="px-6 pt-2">
          <motion.button
            onClick={handleToggleClick}
            whileTap={{ scale: 0.97 }}
            className="w-full relative overflow-hidden rounded-[24px] border transition-all duration-500"
            style={{
              background: isAvailable
                ? isRef
                  ? 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(10,14,20,0.95) 100%)'
                  : 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(10,14,20,0.95) 100%)'
                : 'rgba(22,27,34,0.9)',
              borderColor: isAvailable
                ? isRef ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)'
                : 'rgba(255,255,255,0.06)',
              boxShadow: isAvailable
                ? isRef ? '0 0 30px rgba(239,68,68,0.15)' : '0 0 30px rgba(34,197,94,0.15)'
                : 'none'
            }}
          >
            {/* Animated background pulse */}
            {isAvailable && (
              <motion.div
                className="absolute inset-0 rounded-[24px] opacity-30"
                animate={{ opacity: [0.1, 0.25, 0.1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  background: isRef
                    ? 'radial-gradient(ellipse at 20% 50%, rgba(239,68,68,0.4), transparent 70%)'
                    : 'radial-gradient(ellipse at 20% 50%, rgba(34,197,94,0.4), transparent 70%)'
                }}
              />
            )}

            <div className="relative flex items-center justify-between px-5 py-4 z-10">
              <div className="flex items-center gap-4">
                {/* Live dot */}
                <div className="relative flex items-center justify-center w-10 h-10">
                  {isAvailable && (
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                      style={{ background: isRef ? '#ef4444' : '#22c55e' }}
                    />
                  )}
                  <div
                    className="w-4 h-4 rounded-full relative z-10"
                    style={{ background: isAvailable ? (isRef ? '#ef4444' : '#22c55e') : '#4b5563' }}
                  />
                </div>

                <div className="text-left">
                  <p
                    className="font-black text-base tracking-wide"
                    style={{ color: isAvailable ? (isRef ? '#ef4444' : '#22c55e') : '#6b7280' }}
                  >
                    {isAvailable ? 'SİSTEMDE AKTİF' : 'ŞU AN MEŞGUL'}
                  </p>
                  <p className="text-[10px] font-bold mt-0.5" style={{ color: isAvailable ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.2)' }}>
                    {isAvailable ? 'Kaptanlar seni görüyor ve teklif gönderebilir' : 'Yeni tekliflere kapalısın'}
                  </p>
                </div>
              </div>

              {/* Premium Toggle Switch */}
              <div
                className="w-14 h-7 rounded-full p-1 flex items-center transition-all duration-400"
                style={{ background: isAvailable ? (isRef ? '#ef4444' : '#22c55e') : '#1f2937' }}
              >
                <motion.div
                  animate={{ x: isAvailable ? 28 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="w-5 h-5 rounded-full bg-white shadow-md"
                />
              </div>
            </div>
          </motion.button>
      </div>

          {/* Identity Card */}
          <div>
            {isRef ? renderRefereeIdentityCard() : renderGoalkeeperIdentityCard()}
          </div>
          
          <div className="px-6">
              <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6 relative overflow-hidden group">
                  <motion.div 
                    className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/10 blur-3xl rounded-full group-hover:bg-blue-500/20 transition-colors"
                  />
                  <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">GÜNLÜK ÖZET</h3>
                      <Activity size={16} className="text-blue-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <p className="text-[10px] text-gray-500 font-bold uppercase">Bugünkü Kazanç</p>
                          <p className="text-2xl font-black text-white">450₺</p>
                      </div>
                      <div className="text-right">
                          <p className="text-[10px] text-gray-500 font-bold uppercase">Sıradaki Maç</p>
                          <p className="text-lg font-black text-[#FFFF00]">21:00</p>
                      </div>
                  </div>
              </div>
          </div>

          {/* Sıradaki Maçlarım Section */}
          <div className="px-6">
              <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-green-500" />
                      <h3 className="font-black text-white text-sm tracking-wide uppercase">SIRADAKİ MAÇLARIM</h3>
                  </div>
              </div>
              
              {myUpcomingMatches.length > 0 ? (
                  <div className="bg-gradient-to-r from-green-900/40 to-[#161B22] border border-green-500/30 rounded-[24px] p-5 relative overflow-hidden">
                      <div className="flex justify-between items-start">
                          <div>
                              <h4 className="font-black text-white text-lg">{myUpcomingMatches[0].pitchName || myUpcomingMatches[0].location || 'Saha Bilinmiyor'}</h4>
                              <p className="text-xs text-gray-400 font-bold">{myUpcomingMatches[0].title || 'Rakip Aranıyor'} • {myUpcomingMatches[0].time}</p>
                          </div>
                          <div className="text-right">
                              <p className="text-[10px] text-gray-500 font-bold uppercase">KALAN SÜRE</p>
                              <p className="text-xl font-black text-[#FFFF00] font-mono">{timeLeft}</p>
                          </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-3">
                          <div className="flex justify-between items-center w-full">
                            <div className="flex items-center gap-2">
                                <MapPin size={12} className="text-gray-500" />
                                <span className="text-[10px] text-gray-400 font-bold">{myUpcomingMatches[0].location}</span>
                            </div>
                            <button 
                              onClick={() => setSelectedUpcomingJob(myUpcomingMatches[0] as any)}
                              className="text-[10px] font-black text-green-400 hover:text-white transition-colors"
                            >
                                DETAYLAR
                            </button>
                          </div>
                          
                          {/* Live Location / Arrived Logic */}
                          <div className="flex flex-col gap-2">
                            {matchLiveStatus[myUpcomingMatches[0].id] === 'ARRIVED' ? (
                                <div className="flex gap-2">
                                  <button disabled className="flex-1 py-2 rounded-xl bg-white/10 text-white/50 text-[10px] font-black uppercase flex items-center justify-center gap-1">
                                    <CheckCircle2 size={12} /> KAPTANA BİLDİRİLDİ
                                  </button>
                                  <button 
                                    onClick={() => setShowPostMatchReport(true)}
                                    className="flex-1 py-2 rounded-xl bg-blue-500 text-white text-[10px] font-black uppercase shadow-[0_0_15px_rgba(59,130,246,0.4)]"
                                  >
                                    MAÇI BİTİR
                                  </button>
                                </div>
                            ) : matchLiveStatus[myUpcomingMatches[0].id] === 'ON_THE_WAY' ? (
                                <button 
                                  onClick={() => setMatchLiveStatus(prev => ({ ...prev, [myUpcomingMatches[0].id]: 'ARRIVED' }))}
                                  className="w-full py-2.5 rounded-xl bg-green-500 text-white text-xs font-black uppercase shadow-[0_0_15px_rgba(34,197,94,0.3)] flex items-center justify-center gap-2 hover:bg-green-400 transition-colors"
                                >
                                  <MapPin size={14} /> TESİSE VARDIM
                                </button>
                            ) : (
                                <button 
                                  onClick={() => setMatchLiveStatus(prev => ({ ...prev, [myUpcomingMatches[0].id]: 'ON_THE_WAY' }))}
                                  className="w-full py-2.5 rounded-xl bg-blue-500 text-white text-xs font-black uppercase shadow-[0_0_15px_rgba(59,130,246,0.3)] flex items-center justify-center gap-2 hover:bg-blue-400 transition-colors"
                                >
                                  <Navigation size={14} /> YOLA ÇIKTIM
                                </button>
                            )}
                          </div>
                      </div>
                  </div>
              ) : (
                  <div className="bg-[#161B22] border border-dashed border-white/10 rounded-[24px] p-8 text-center">
                      <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Calendar size={24} className="text-gray-600" />
                      </div>
                      <p className="text-gray-400 text-sm font-bold mb-4">Henüz onaylanmış bir maçın yok.</p>
                      <motion.button 
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setActiveTab('JOBS')}
                        className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-xl text-xs font-black shadow-lg shadow-green-900/20 transition-all"
                      >
                          MAÇ BUL
                      </motion.button>
                  </div>
              )}
          </div>

          {/* Direct Offers Section */}
          <div className="px-6">
              <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={16} className="text-[#FFFF00]" />
                  <h3 className="font-black text-white text-sm tracking-wide uppercase">ÖZEL TEKLİFLER</h3>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar snap-x">
                  {myOffers.length > 0 ? myOffers.map(offer => (
                      <motion.div 
                        key={offer.id} 
                        whileHover={{ y: -5 }}
                        className="snap-center shrink-0 w-72 bg-gradient-to-br from-yellow-900/40 to-[#161B22] border border-[#FFFF00]/30 rounded-[24px] p-4 relative overflow-hidden"
                      >
                          <div className="absolute top-0 right-0 px-2 py-1 bg-[#FFFF00] text-black text-[9px] font-black rounded-bl-xl">
                              {offer.expiresIn} KALDI
                          </div>
                          
                          <div className="flex gap-3 mb-3">
                              <div className="w-10 h-10 bg-[#FFFF00]/10 rounded-full flex items-center justify-center text-[#FFFF00] font-black border border-[#FFFF00]/20">
                                  {offer.captainName.charAt(0)}
                              </div>
                              <div>
                                  <h4 className="font-bold text-white text-sm">{offer.pitchName}</h4>
                                  <p className="text-[10px] text-gray-400">{offer.teamName} • {offer.time}</p>
                                  
                                  {/* Team Reliability / Toxic Warning */}
                                  {offer.captainName === 'Ali Y.' ? (
                                      <div className="flex items-center gap-1 mt-1 text-[8px] font-black bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20 w-fit uppercase">
                                          <AlertTriangle size={8} /> Düşük Centilmenlik (2.1/5.0)
                                      </div>
                                  ) : (
                                      <div className="flex items-center gap-1 mt-1 text-[8px] font-black bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20 w-fit uppercase">
                                          <Shield size={8} /> Güvenilir Takım (4.9/5.0)
                                      </div>
                                  )}
                              </div>
                          </div>
                          
                          <p className="text-xs text-gray-300 italic mb-4 bg-black/20 p-2 rounded-lg border border-white/5">
                              "{offer.message}"
                          </p>

                          <div className="flex items-center justify-between">
                              <div className="flex flex-col">
                                  <span className="text-[10px] text-gray-500 uppercase font-bold">Teklif</span>
                                  <span className="text-xl font-black text-[#FFFF00]">{offer.offerAmount}₺</span>
                              </div>
                              <button 
                                onClick={() => handleOpenOffer(offer)}
                                className="bg-[#FFFF00] text-black px-4 py-2 rounded-xl text-xs font-black hover:scale-105 transition-transform"
                              >
                                  İNCELE
                              </button>
                          </div>
                      </motion.div>
                  )) : (
                    <div className="text-gray-500 text-[10px] uppercase font-bold italic w-full text-center py-4">Bekleyen özel teklifiniz yok</div>
                  )}
              </div>
          </div>
      </motion.div>
  );

  const renderJobFeedView = () => (
      <div className="space-y-6 pb-40 pt-4">

         {/* Header */}
         <div className="flex items-center justify-between px-6 mb-2 mt-4">
            <div>
              <h3 className="font-black text-white text-sm flex items-center gap-2">
                🧤 {isRef ? 'HAKEM' : 'KALECİ'} ARAYAN MAÇLAR
                <span className="bg-green-500/15 border border-green-500/30 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full">{openMatches.length}</span>
              </h3>
              <p className="text-[10px] text-gray-500 mt-0.5">Takımlar seni bekliyor — başvur, oyna, kazan</p>
            </div>
            <button
              onClick={() => { if(typeof window !== 'undefined' && (window as any).openLeafletMap) (window as any).openLeafletMap(); }}
              className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-black px-3 py-2 rounded-xl hover:bg-blue-500/20 transition-all"
            >
              <MapPin size={12} /> Harita
            </button>
         </div>

         {/* Pending Applications Section */}
         {pendingApplications.length > 0 && (
             <div className="px-6 space-y-3 mb-6">
                 <h3 className="font-black text-gray-400 text-xs flex items-center gap-2 uppercase tracking-widest">
                     <Activity size={12} className="text-yellow-500" /> BEKLEYEN BAŞVURULARIM
                 </h3>
                 {pendingApplications.map(job => (
                     <motion.div
                         key={job.id}
                         className="bg-[#161B22]/60 border border-yellow-500/30 rounded-[24px] overflow-hidden"
                     >
                         <div className="p-4 flex items-center justify-between opacity-70">
                             <div>
                                 <h4 className="font-black text-white text-sm">{job.pitchName || job.location || 'Saha Bilinmiyor'}</h4>
                                 <p className="text-[10px] text-gray-400">{job.date} • {job.time}</p>
                             </div>
                             <div className="bg-yellow-500/20 text-yellow-500 text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider">
                                 Kaptan Onayı Bekleniyor
                             </div>
                         </div>
                     </motion.div>
                 ))}
             </div>
         )}

         {/* GK Match Cards */}
         <div className="px-6 space-y-3">
            
            {/* SOS / Emergency Request Card */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-red-950/40 border-2 border-red-500/50 rounded-[24px] overflow-hidden relative shadow-[0_0_20px_rgba(239,68,68,0.2)]"
            >
                <div className="absolute top-0 left-0 w-full h-1 bg-red-500 animate-pulse" />
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 animate-pulse">
                        <AlertTriangle size={16} />
                      </div>
                      <div>
                        <h4 className="font-black text-white text-sm">ACİL GÖREV (SOS)</h4>
                        <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Son Dakika İptali • 1 Saat Kaldı</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black text-red-400">450₺</p>
                      <p className="text-[8px] text-red-500/80 font-black uppercase">ÇİFT ÜCRET</p>
                    </div>
                  </div>
                  
                  <div className="bg-black/40 rounded-xl p-2.5 border border-red-500/20 mb-3">
                    <p className="text-xs text-red-200">
                      <strong className="text-red-400">Moda Spor Tesisleri</strong>'nde acil {isRef ? 'hakem' : 'kaleci'} ihtiyacı. Eski {isRef ? 'hakem' : 'kaleci'} kaza yaptı, maç başlamak üzere!
                    </p>
                  </div>

                  <button className="w-full py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-black uppercase shadow-lg shadow-red-500/30 transition-colors">
                    Hemen Kabul Et (Sahaya Yakınım)
                  </button>
                </div>
            </motion.div>
            {openMatches.map(job => (
                <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#161B22] border border-white/6 rounded-[24px] overflow-hidden hover:border-green-500/30 transition-all"
                >
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          {/* Date box */}
                          <div className="w-12 shrink-0 bg-[#0A0E14] rounded-xl py-2 text-center border border-white/5">
                            <p className="text-[8px] text-gray-500 font-bold uppercase">{job.date.slice(5).replace('-','/')}</p>
                            <p className="text-xs font-black text-white">{job.time}</p>
                          </div>
                          <div>
                            <h4 className="font-black text-white text-sm">{job.pitchName}</h4>
                            <p className="text-[10px] text-gray-400 mt-0.5">Kpt: {job.captainName} • <span className="text-green-400">{job.players} oyuncu</span></p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-black text-white">{job.fee}₺</p>
                          <p className="text-[9px] text-gray-500">maç başı</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-green-500/10 border border-green-500/20 px-2 py-1 rounded-lg">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-[9px] font-black text-green-400">{job.missing} Aranıyor</span>
                          </div>
                          <div className="flex items-center gap-1 text-[9px] text-gray-500">
                            <MapPin size={9} /> {job.location}
                          </div>
                        </div>
                        <motion.button
                          whileTap={{ scale: 0.94 }}
                          onClick={() => handleOpenBid(job as any)}
                          className="px-4 py-1.5 rounded-xl text-[10px] font-black text-black bg-green-400 hover:bg-green-300 transition-colors shadow-[0_0_12px_rgba(34,197,94,0.4)]"
                        >
                          BAŞVUR
                        </motion.button>
                      </div>
                    </div>
                </motion.div>
            ))}
         </div>
         


      </div>
  );

   const renderWalletView = () => (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6 px-6 pt-6 pb-40"
      >
          <div className="bg-gradient-to-br from-gray-800 to-[#161B22] p-6 rounded-[32px] border border-white/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-5"><Wallet size={120} /></div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Toplam Kazanç</p>
              <h2 className="text-4xl font-black text-white mt-2">4.250₺</h2>
              
              <div className="mt-6 flex gap-4">
                  <div className="flex-1">
                      <p className="text-[10px] text-gray-500 uppercase font-bold">Çekilebilir</p>
                      <p className="text-xl font-bold text-green-400">{walletBalance}₺</p>
                  </div>
                  <div className="flex-1 border-l border-white/10 pl-4">
                      <p className="text-[10px] text-gray-500 uppercase font-bold">Bekleyen</p>
                      <p className="text-xl font-bold text-gray-300">800₺</p>
                  </div>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                  {selectedCard && (
                      <p className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          SEÇİLİ KART: <span className="text-white">{selectedCard}</span>
                      </p>
                  )}
                  <div className="flex gap-2">
                       <button
                           onClick={() => setShowCardOptions(true)}
                           className="flex-1 py-3 bg-[#161B22] border border-white/10 text-white rounded-2xl font-black text-sm shadow-lg hover:bg-white/5 transition-all active:scale-95 flex items-center justify-center gap-2"
                       >
                           <CreditCard size={18} /> {selectedCard ? selectedCard : 'KART SEÇ / EKLE'}
                       </button>
                       <button 
                         onClick={handleTransfer}
                         disabled={isTransferring || !selectedCard}
                         className={`flex-1 py-3 ${isTransferring || !selectedCard ? 'bg-gray-600 opacity-50 cursor-not-allowed' : 'bg-[#34C759] hover:bg-[#2dbb4f]'} text-white rounded-2xl font-black text-sm shadow-lg shadow-green-900/20 transition-all active:scale-95 flex items-center justify-center gap-2`}
                       >
                           {isTransferring ? (
                               <RefreshCcw size={18} className="animate-spin" />
                           ) : transferSuccess ? (
                               <Check size={18} />
                           ) : (
                               <Banknote size={18} />
                           )}
                           {isTransferring ? 'AKTARILIYOR...' : transferSuccess ? 'ONAYLANDI' : 'HEMEN AKTAR'}
                       </button>
                  </div>
              </div>
              
              <AnimatePresence>
                  {transferSuccess && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-center"
                      >
                          <p className="text-[10px] text-green-400 font-bold">Para banka hesabına gönderildi!</p>
                      </motion.div>
                  )}
              </AnimatePresence>
          </div>

          <section>
              <h3 className="font-bold text-white text-sm px-2 mb-3 uppercase tracking-wide">İŞLEM GEÇMİŞİ</h3>
              <div className="space-y-3">
                  {WALLET_HISTORY.map((tx) => (
                      <div key={tx.id} className="bg-[#161B22] border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                          <div>
                              <p className="font-bold text-sm text-white">{tx.description}</p>
                              <p className="text-[10px] text-gray-500">{tx.date} • Komisyon: -{tx.commission}₺</p>
                          </div>
                          <div className={`text-right ${tx.amount > 0 ? 'text-white' : 'text-red-400'}`}>
                              <p className="font-black text-sm">{tx.amount > 0 ? '+' : ''}{tx.amount}₺</p>
                              <p className={`text-[9px] font-bold ${tx.status === 'CLEARED' ? 'text-green-500' : 'text-yellow-500'}`}>
                                  {tx.status === 'CLEARED' ? 'Onaylandı' : 'Bekliyor'}
                              </p>
                          </div>
                      </div>
                  ))}
              </div>
          </section>
      </motion.div>
  );

   const renderPricingView = () => (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6 px-6 pt-6 pb-40"
      >
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="bg-gradient-to-br from-[#FFFF00]/20 to-transparent p-8 rounded-[32px] border border-[#FFFF00]/20 text-center relative overflow-hidden group"
          >
              <motion.div 
                animate={{ 
                    rotate: [0, 10, -10, 0],
                    scale: [1, 1.1, 1, 1.1, 1]
                }}
                transition={{ duration: 5, repeat: Infinity }}
                className="absolute -top-10 -left-10 w-32 h-32 bg-[#FFFF00]/10 blur-3xl rounded-full"
              />
              <Tag size={48} className="text-[#FFFF00] mx-auto mb-4 group-hover:scale-110 transition-transform" />
              <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-wide">STANDART FİYATIN</h2>
              <div className="flex items-center justify-center gap-2">
                  <motion.span 
                    key={baseFee}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-5xl font-black text-[#FFFF00]"
                  >
                    {baseFee}₺
                  </motion.span>
                  <button onClick={() => setShowPriceModal(true)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors">
                      <PlusCircle size={20} />
                  </button>
              </div>
              <p className="text-gray-400 text-xs mt-4">Kaptanlar seni bu fiyattan kiralamak için teklif gönderecek.</p>
          </motion.div>

          <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-8 text-center">
              <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles size={32} className="text-blue-400" />
              </div>
              <h3 className="text-xl font-black text-white mb-2">DAHA FAZLA KAZAN</h3>
              <p className="text-gray-400 text-sm mb-6">%0 komisyon avantajıyla kazancını katla.</p>
              <button 
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl transition-all shadow-lg shadow-blue-900/20"
              >
                  DETAYLARI GÖR
              </button>
          </div>
      </motion.div>
  );

  const renderMenuView = () => (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-3 px-6 pt-6 pb-40"
      >
          <button onClick={() => setActiveTab('PROFILE_VIEW')} className="w-full bg-[#161B22] border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-[#FFFF00]/30 transition-all">
              <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-gray-400 group-hover:text-[#FFFF00] transition-colors"><User size={20} /></div>
                  <div className="text-left">
                    <span className="font-bold text-white block">Profilim</span>
                    <span className="text-[10px] text-gray-500">Fotoğraf, açıklama ve tercihler</span>
                  </div>
              </div>
              <ChevronRight size={20} className="text-gray-600 group-hover:translate-x-1 transition-transform" />
          </button>
          <button onClick={() => setActiveTab('SETTINGS_VIEW')} className="w-full bg-[#161B22] border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-[#FFFF00]/30 transition-all">
              <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-gray-400 group-hover:text-[#FFFF00] transition-colors"><Settings size={20} /></div>
                  <div className="text-left">
                    <span className="font-bold text-white block">Ayarlar</span>
                    <span className="text-[10px] text-gray-500">Bildirim, gizlilik ve hesap</span>
                  </div>
              </div>
              <ChevronRight size={20} className="text-gray-600 group-hover:translate-x-1 transition-transform" />
          </button>
          <button onClick={() => alert('Destek ekibine bağlanılıyor...')} className="w-full bg-[#161B22] border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-[#FFFF00]/30 transition-all">
              <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-gray-400 group-hover:text-[#FFFF00] transition-colors"><MessageSquare size={20} /></div>
                  <span className="font-bold text-white">Destek</span>
              </div>
              <ChevronRight size={20} className="text-gray-600 group-hover:translate-x-1 transition-transform" />
          </button>
          <button onClick={() => onBack()} className="w-full bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center justify-between group hover:bg-red-500/20 transition-all mt-8">
              <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center text-red-500"><X size={20} /></div>
                  <span className="font-bold text-red-500">Çıkış Yap</span>
              </div>
              <ChevronRight size={20} className="text-red-500 group-hover:translate-x-1 transition-transform" />
          </button>
          <div className="pt-8 text-center">
              <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">OYNA v2.4.0</p>
          </div>
      </motion.div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0E14] relative overflow-hidden">
      
      {/* Profile sub-view */}
      {activeTab === 'PROFILE_VIEW' && (
        <ServiceProfile role={role} onBack={() => setActiveTab('MENU')} />
      )}

      {/* Settings sub-view */}
      {activeTab === 'SETTINGS_VIEW' && (
        <ServiceSettings role={role} onBack={() => setActiveTab('MENU')} onLogout={onBack} />
      )}

      {activeTab !== 'PROFILE_VIEW' && activeTab !== 'SETTINGS_VIEW' && (<>
      {/* Animated Background - Color shifts based on role */}
      <div className="fixed inset-0 pointer-events-none z-0">
          <div className={`absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full blur-[120px] animate-pulse-slow ${isRef ? 'bg-red-900/20' : 'bg-green-900/20'}`}></div>
          <div className={`absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full blur-[120px] animate-pulse-slow delay-700 ${isRef ? 'bg-orange-900/10' : 'bg-blue-900/10'}`}></div>
      </div>

      <header className="p-6 flex justify-between items-center bg-[#0A0E14]/80 backdrop-blur-md sticky top-0 z-20 border-b border-white/5">
         <div className="flex items-center gap-3">
             <button onClick={onBack} className="p-2 bg-[#161B22] rounded-full text-white hover:bg-gray-800 transition-colors border border-white/5">
                 <ArrowLeft size={20} />
             </button>
             <div>
                 <h1 className="font-black text-white text-lg leading-none">{isRef ? 'HAKEM' : 'KALECİ'}</h1>
                 <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase mt-1">
                    {activeTab === 'HOME' && 'Ana Sayfa'}
                    {activeTab === 'JOBS' && 'Maç Bul'}
                    
                    
                    {activeTab === 'MENU' && 'Menü'}
                 </p>
             </div>
         </div>
         <button 
            onClick={() => setIsNotificationsOpen(true)}
            className="p-2 bg-[#161B22] rounded-full text-gray-400 border border-white/5 relative hover:text-white transition-colors"
         >
             <Bell size={20} />
             <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#0A0E14]"></span>
         </button>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar relative z-10">
         {activeTab === 'HOME' && renderHomeView()}
         {activeTab === 'JOBS' && renderJobFeedView()}
         
         
         {activeTab === 'MENU' && renderMenuView()}
      </main>

      {/* Service Navigation */}
      <nav className="fixed bottom-0 left-0 w-full bg-[#0A0E14]/95 backdrop-blur-2xl border-t border-white/5 pb-8 pt-4 px-4 flex justify-between items-center z-30">
         <button 
            onClick={() => setActiveTab('HOME')}
            className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'HOME' ? 'text-[#FFFF00] scale-110' : 'text-gray-500 hover:text-gray-300'}`}
         >
            <div className={`p-1 rounded-lg ${activeTab === 'HOME' ? 'bg-[#FFFF00]/10' : ''}`}>
                <List size={20} />
            </div>
            <span className="text-[9px] font-black uppercase tracking-tighter">Ana Sayfa</span>
         </button>

         <button 
            onClick={() => setActiveTab('JOBS')}
            className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'JOBS' ? 'text-[#FFFF00] scale-110' : 'text-gray-500 hover:text-gray-300'}`}
         >
            <div className={`p-1 rounded-lg ${activeTab === 'JOBS' ? 'bg-[#FFFF00]/10' : ''}`}>
                <Search size={20} />
            </div>
            <span className="text-[9px] font-black uppercase tracking-tighter">Maç Bul</span>
         </button>

         

         

         <button 
            onClick={() => setActiveTab('MENU')}
            className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'MENU' ? 'text-[#FFFF00] scale-110' : 'text-gray-500 hover:text-gray-300'}`}
         >
            <div className={`p-1 rounded-lg ${activeTab === 'MENU' ? 'bg-[#FFFF00]/10' : ''}`}>
                <PlusCircle size={20} />
            </div>
            <span className="text-[9px] font-black uppercase tracking-tighter">Menü</span>
         </button>
      </nav>

      {/* BID / OFFER MODAL */}
      {(selectedJob || selectedOffer) && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-200">
              <div className="bg-[#161B22] w-full max-w-md rounded-t-[32px] sm:rounded-[32px] border-t sm:border border-white/10 p-6 shadow-2xl relative animate-in slide-in-from-bottom duration-300">
                   {showBidSuccess ? (
                       <div className="py-12 flex flex-col items-center text-center">
                           <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(34,197,94,0.4)]">
                               <Check size={40} className="text-white" />
                           </div>
                           <h3 className="text-2xl font-black text-white">TEKLİF GÖNDERİLDİ!</h3>
                           <p className="text-gray-400 mt-2">Kaptan onayladığında bildirim alacaksın.</p>
                       </div>
                   ) : (
                       <>
                           <button 
                            onClick={() => { setSelectedJob(null); setSelectedOffer(null); }}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white"
                           >
                               <X size={20} />
                           </button>

                           <div className="text-center mb-6">
                               <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">{selectedOffer ? 'ÖZEL DAVET' : (isRef ? 'HAKEMLİK FIRSATI' : 'KALECİLİK FIRSATI')}</p>
                               <h3 className="text-xl font-black text-white">{selectedOffer ? selectedOffer.pitchName : selectedJob?.pitchName}</h3>
                               <p className="text-gray-400 text-sm mt-1">{selectedOffer ? selectedOffer.time : selectedJob?.time}</p>
                           </div>

                           <div className="bg-[#0A0E14] border border-white/5 rounded-2xl p-4 mb-4">
                               <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Kaptana Gidecek Kartın</h4>
                               <div className="flex items-center gap-3">
                                   <img src={isRef ? "https://images.unsplash.com/photo-1574629310576-6e84c60be5cb?auto=format&fit=crop&q=80&w=100" : "https://images.unsplash.com/photo-1544966614-05a04dd69d0c?auto=format&fit=crop&q=80&w=100"} className={`w-10 h-10 rounded-full border object-cover object-top ${isRef ? 'border-red-500' : 'border-green-500'}`} alt="profile" />
                                   <div>
                                       <p className="text-sm font-bold text-white">{isRef ? 'Cüneyt (FIFA)' : 'Volkan (Panter)'}</p>
                                       <p className={`text-[10px] ${isRef ? 'text-red-400' : 'text-green-400'}`}>{isRef ? 'Puan: 4.9 • Maç: 150' : 'Refleks: 94 • Penaltı: 40%'}</p>
                                   </div>
                               </div>
                           </div>

                           <div className="space-y-4">
                               <div className="bg-[#0A0E14] p-4 rounded-2xl border border-white/5">
                                   <label className="text-xs text-gray-500 font-bold uppercase block mb-2">Karşı Teklifin (Opsiyonel)</label>
                                   <div className="flex items-center gap-2">
                                       <span className="text-2xl font-black text-[#FFFF00]">₺</span>
                                       <input 
                                        type="number" 
                                        value={bidAmount} 
                                        onChange={(e) => setBidAmount(parseInt(e.target.value) || 0)}
                                        className="bg-transparent text-3xl font-black text-white outline-none w-full" 
                                       />
                                   </div>
                               </div>

                               <button 
                                onClick={submitBid}
                                className="w-full py-4 bg-[#FFFF00] text-black font-black text-lg rounded-2xl hover:bg-yellow-300 transition-colors shadow-lg shadow-yellow-900/20"
                               >
                                   {selectedOffer ? 'DAVETİ KABUL ET' : 'TEKLİFİ GÖNDER'}
                               </button>
                           </div>
                       </>
                   )}
              </div>
          </div>
      )}

      {/* PRICE SETTING MODAL */}
      {showPriceModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-200">
              <div className="bg-[#161B22] w-full max-w-md rounded-t-[32px] sm:rounded-[32px] border-t sm:border border-white/10 p-6 shadow-2xl relative animate-in slide-in-from-bottom duration-300">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-black text-white uppercase tracking-wide">STANDART FİYAT</h3>
                      <button onClick={() => setShowPriceModal(false)} className="p-2 bg-white/5 rounded-full text-gray-400"><X size={20} /></button>
                  </div>

                  <div className="text-center py-8">
                      <p className="text-gray-400 text-xs font-bold uppercase mb-2">Ortalama Saatlik Ücretin</p>
                      <div className="flex items-center justify-center gap-1">
                          <span className="text-4xl font-black text-[#FFFF00]">₺</span>
                          <input 
                            type="number" 
                            value={baseFee}
                            onChange={(e) => setBaseFee(parseInt(e.target.value))}
                            className="bg-transparent text-6xl font-black text-white w-40 text-center outline-none border-b-2 border-white/10 focus:border-[#FFFF00] transition-colors"
                          />
                      </div>
                      <p className="text-gray-500 text-xs mt-4 max-w-xs mx-auto">
                          Bu fiyat, profilinde ve "Hemen Kirala" seçeneklerinde varsayılan olarak görünecektir.
                      </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-6">
                      <button onClick={() => handleUpdateFee(200)} className="py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs border border-white/5">200₺</button>
                      <button onClick={() => handleUpdateFee(300)} className="py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs border border-white/5">300₺</button>
                      <button onClick={() => handleUpdateFee(400)} className="py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs border border-white/5">400₺</button>
                  </div>

                  <button 
                    onClick={() => {
                        handleUpdateFee(baseFee);
                        setShowPriceModal(false);
                    }}
                    className={`w-full py-4 text-white font-black text-lg rounded-2xl transition-colors shadow-lg ${isRef ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20' : 'bg-green-600 hover:bg-green-500 shadow-green-900/20'}`}
                  >
                      GÜNCELLE
                  </button>
              </div>
          </div>
      )}

      {/* UPCOMING MATCH DETAIL MODAL */}
      {selectedUpcomingJob && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-200">
              <div className="bg-[#161B22] w-full max-w-md h-[85vh] sm:h-auto rounded-t-[32px] sm:rounded-[32px] border-t sm:border border-white/10 p-0 shadow-2xl relative flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
                  {/* Header */}
                  <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#0A0E14]">
                      <h3 className="text-lg font-black text-white uppercase tracking-wide">Maç Detayı</h3>
                      <button onClick={() => setSelectedUpcomingJob(null)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pb-10">
                      {/* Match Info */}
                      <div className="text-center">
                          <h2 className="text-2xl font-black text-white mb-1">{selectedUpcomingJob.pitchName}</h2>
                          <p className="text-gray-400 text-sm">{selectedUpcomingJob.date} • {selectedUpcomingJob.time}</p>
                          <p className="text-[#FFFF00] font-bold mt-2">{selectedUpcomingJob.teamName}</p>
                      </div>

                      {/* Location & Directions */}
                      <div className="bg-[#0A0E14] border border-white/5 rounded-2xl p-4">
                          <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-400">
                                  <MapPin size={20} />
                              </div>
                              <div>
                                  <p className="text-sm font-bold text-white">{selectedUpcomingJob.location}</p>
                                  <p className="text-[10px] text-gray-500">Mesafe: {selectedUpcomingJob.distance}</p>
                              </div>
                          </div>
                          <button onClick={() => alert('Harita uygulamasına yönlendiriliyor...')} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-colors">
                              <Navigation size={16} /> YOL TARİFİ AL
                          </button>
                      </div>

                      {/* Amenities */}
                      <div>
                          <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                              <Star size={14} className="text-[#FFFF00]" /> Tesis Özellikleri
                          </h4>
                          <div className="flex flex-wrap gap-2">
                              {['Ücretsiz Otopark', 'Sıcak Duş', 'Kafeterya', 'Kamera Kaydı', 'Yeni Zemin'].map(amenity => (
                                  <span key={amenity} className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-xs text-gray-300">
                                      {amenity}
                                  </span>
                              ))}
                          </div>
                      </div>

                      {/* Formation */}
                      <div>
                          <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                              <Users size={14} className="text-green-400" /> Takım Dizilişi (2-3-1)
                          </h4>
                          <div className="w-full aspect-[4/3] bg-[#1B4332] rounded-2xl border-2 border-white/10 relative overflow-hidden flex flex-col justify-between p-4">
                              {/* Pitch Lines */}
                              <div className="absolute top-1/2 left-0 w-full h-px bg-white/20"></div>
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 border-2 border-white/20 rounded-full"></div>
                              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-12 border-b-2 border-l-2 border-r-2 border-white/20"></div>
                              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-12 border-t-2 border-l-2 border-r-2 border-white/20"></div>

                              {/* Players */}
                              {/* FW */}
                              <div className="flex justify-center relative z-10"><div className="w-8 h-8 bg-white rounded-full border-2 border-[#161B22] flex items-center justify-center text-xs font-bold text-black">FV</div></div>
                              {/* MID */}
                              <div className="flex justify-around px-8 relative z-10">
                                  <div className="w-8 h-8 bg-white rounded-full border-2 border-[#161B22] flex items-center justify-center text-xs font-bold text-black">OS</div>
                                  <div className="w-8 h-8 bg-white rounded-full border-2 border-[#161B22] flex items-center justify-center text-xs font-bold text-black">OS</div>
                                  <div className="w-8 h-8 bg-white rounded-full border-2 border-[#161B22] flex items-center justify-center text-xs font-bold text-black">OS</div>
                              </div>
                              {/* DEF */}
                              <div className="flex justify-around px-16 relative z-10">
                                  <div className="w-8 h-8 bg-white rounded-full border-2 border-[#161B22] flex items-center justify-center text-xs font-bold text-black">DF</div>
                                  <div className="w-8 h-8 bg-white rounded-full border-2 border-[#161B22] flex items-center justify-center text-xs font-bold text-black">DF</div>
                              </div>
                              {/* GK */}
                              <div className="flex justify-center relative z-10">
                                  <div className="w-10 h-10 bg-[#FFFF00] rounded-full border-2 border-[#161B22] flex items-center justify-center text-xs font-black text-black shadow-[0_0_15px_rgba(255,255,0,0.5)]">SEN</div>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* HOURS SETTING MODAL */}
      {showOnlineSetupModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-200">
              <div className="bg-[#161B22] w-full max-w-md rounded-t-[32px] sm:rounded-[32px] border-t sm:border border-white/10 p-6 shadow-2xl relative animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-black text-white uppercase tracking-wide">AKTİFLİK AYARLARI</h3>
                      <button onClick={() => setShowOnlineSetupModal(false)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white"><X size={20} /></button>
                  </div>
                  
                  <div className="space-y-6 mb-8">
                      <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase mb-3">Hangi Günler Aktifsin?</p>
                          <div className="flex flex-wrap gap-2">
                              {DAYS.map(day => (
                                  <button 
                                      key={day}
                                      onClick={() => {
                                          if(setupDays.includes(day)) {
                                              setSetupDays(setupDays.filter(d => d !== day));
                                          } else {
                                              setSetupDays([...setupDays, day]);
                                          }
                                      }}
                                      className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${setupDays.includes(day) ? (isRef ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'bg-green-500/20 text-green-400 border-green-500/50') : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}
                                  >
                                      {day}
                                  </button>
                              ))}
                          </div>
                      </div>
                      <div>
                          <div className="flex items-center justify-between mb-3">
                              <p className="text-[10px] text-gray-400 font-bold uppercase">Hangi Saat Aralığı?</p>
                              <button
                                onClick={() => setSetupHours(setupHours.length === 24 ? [] : ALL_HOURS)}
                                className="text-[10px] font-black px-2 py-1 rounded-lg border transition-all bg-white/5 text-gray-400 border-white/10"
                              >
                                {setupHours.length === 24 ? 'Temizle' : 'Tümü'}
                              </button>
                          </div>
                          <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                              {ALL_HOURS.map(t => {
                                  const active = setupHours.includes(t);
                                  return (
                                      <button
                                          key={t}
                                          onClick={() => {
                                              if(setupHours.includes(t)) {
                                                  setSetupHours(setupHours.filter(h => h !== t));
                                              } else {
                                                  setSetupHours([...setupHours, t]);
                                              }
                                          }}
                                          className={`py-2 rounded-lg text-center text-xs font-bold border transition-colors ${active ? (isRef ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'bg-green-500/20 text-green-400 border-green-500/50') : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}
                                      >
                                          {t}
                                      </button>
                                  );
                              })}
                          </div>
                      </div>
                  </div>

                  <button 
                    onClick={handleSaveOnlineSetup}
                    className="w-full py-4 text-black font-black text-sm rounded-2xl transition-colors shadow-lg uppercase tracking-wider flex items-center justify-center gap-2"
                    style={{ background: isRef ? '#ef4444' : '#22c55e' }}
                  >
                      Sistemde Aktif Ol
                  </button>
              </div>
          </div>
      )}

      {/* Card Options: Ekle veya Seç */}
      {showCardOptions && (
          <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end">
              <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full bg-[#161B22] rounded-t-[32px] border-t border-white/10 p-6"
              >
                  <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />
                  <div className="flex justify-between items-center mb-5">
                      <div>
                          <h3 className="text-xl font-black text-white">Kart İşlemi</h3>
                          <p className="text-[10px] text-gray-500 mt-0.5">Mevcut kartı seç veya yeni kart ekle</p>
                      </div>
                      <button onClick={() => setShowCardOptions(false)} className="p-2 bg-white/5 rounded-xl text-gray-400"><X size={18} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-2">
                      <button
                          onClick={() => { setShowCardOptions(false); setShowCardSelect(true); }}
                          className="py-4 rounded-2xl border border-white/10 bg-white/5 text-white font-black text-sm flex flex-col items-center gap-2 hover:border-blue-500/30 transition-all"
                      >
                          <CreditCard size={22} className="text-blue-400" />
                          Kayıtlı Kartlar
                      </button>
                      <button
                          onClick={() => { setShowCardOptions(false); setShowAddCard(true); }}
                          className="py-4 rounded-2xl border border-green-500/30 bg-green-500/8 text-green-400 font-black text-sm flex flex-col items-center gap-2 hover:bg-green-500/15 transition-all"
                      >
                          <PlusCircle size={22} />
                          Yeni Kart Ekle
                      </button>
                  </div>
              </motion.div>
          </div>
      )}

      {/* Add New Card Modal */}
      {showAddCard && (
          <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end">
              <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full bg-[#161B22] rounded-t-[32px] border-t border-white/10 p-6 space-y-4"
              >
                  <div className="w-10 h-1 bg-white/20 rounded-full mx-auto" />
                  <div className="flex justify-between items-center">
                      <h3 className="text-xl font-black text-white">Yeni Kart</h3>
                      <button onClick={() => setShowAddCard(false)} className="p-2 bg-white/5 rounded-xl text-gray-400"><X size={18} /></button>
                  </div>
                  <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1.5">Kart Numarası</p>
                      <input
                          value={newCardNo}
                          onChange={e => setNewCardNo(e.target.value)}
                          placeholder="TR00 0000 0000 0000 0000 00"
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white font-mono text-sm outline-none focus:border-blue-500/50 transition-colors"
                      />
                  </div>
                  <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1.5">Kart Sahibi</p>
                      <input
                          value={newCardHolder}
                          onChange={e => setNewCardHolder(e.target.value)}
                          placeholder="AD SOYAD"
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white font-bold text-sm outline-none focus:border-blue-500/50 transition-colors"
                      />
                  </div>
                  <button
                      disabled={!newCardNo || !newCardHolder}
                      onClick={() => {
                          setSelectedCard(newCardNo);
                          setNewCardNo(''); setNewCardHolder('');
                          setShowAddCard(false);
                      }}
                      className="w-full py-4 rounded-2xl font-black text-white text-sm disabled:opacity-40 bg-blue-600 hover:bg-blue-500 transition-colors"
                  >
                      KARTI KAYDET VE SEÇ
                  </button>
              </motion.div>
          </div>
      )}

      {showCardSelect && (
          <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end justify-center p-4">
              <div className="bg-[#161B22] w-full max-w-md rounded-3xl border border-white/10 p-6 flex flex-col animate-in slide-in-from-bottom-10">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-black text-white italic tracking-tight">KAYITLI KARTLAR</h3>
                      <button onClick={() => setShowCardSelect(false)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white">
                          <X size={20} />
                      </button>
                  </div>
                  <div className="space-y-3">
                      {['TR00 0000 0000 0000 0000 00', 'TR11 1111 1111 1111 1111 11', 'Mastercard **** 4242'].map(card => (
                          <button
                              key={card}
                              onClick={() => {
                                  setSelectedCard(card);
                                  setShowCardSelect(false);
                              }}
                              className="w-full p-4 bg-[#0A0E14] border border-white/5 rounded-2xl flex items-center gap-3 hover:border-blue-500/50 transition-all text-left"
                          >
                              <CreditCard size={20} className="text-gray-400" />
                              <span className="font-mono text-sm text-white">{card}</span>
                          </button>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* Post Match Report Modal (Two-way Rating) */}
      <AnimatePresence>
        {showPostMatchReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#161B22] border border-white/10 rounded-3xl p-6 w-full max-w-sm relative z-10 overflow-hidden"
            >
              <div className={`absolute top-0 left-0 w-full h-1 ${theme.bg}`} />
              
              <div className="text-center mb-6">
                <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 ${theme.secondaryBg} ${theme.primary}`}>
                  <Award size={32} />
                </div>
                <h3 className="text-xl font-black text-white uppercase italic">MAÇ SONU RAPORU</h3>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">Takımı ve Ortamı Değerlendir</p>
              </div>

              <div className="space-y-4 mb-6">
                {isRef && (
                  <div className="bg-[#0A0E14] p-4 rounded-2xl border border-white/5">
                    <label className="text-xs text-gray-400 font-bold uppercase block mb-3 text-center">Maç Skoru</label>
                    <div className="flex items-center justify-center gap-4">
                      <input type="number" placeholder="0" className="w-16 h-16 bg-[#161B22] border border-white/10 rounded-xl text-center text-3xl font-black text-white outline-none focus:border-red-500/50 transition-colors" />
                      <span className="text-xl font-black text-gray-600">-</span>
                      <input type="number" placeholder="0" className="w-16 h-16 bg-[#161B22] border border-white/10 rounded-xl text-center text-3xl font-black text-white outline-none focus:border-red-500/50 transition-colors" />
                    </div>
                    <p className="text-[9px] text-gray-500 font-bold uppercase text-center mt-3">Kaptanlara skor onayı gönderilecektir</p>
                  </div>
                )}
                <div className="bg-[#0A0E14] p-4 rounded-2xl border border-white/5">
                  <label className="text-xs text-gray-400 font-bold uppercase block mb-3 text-center">Centilmenlik ve Misafirperverlik</label>
                  <div className="flex justify-between items-center px-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button 
                        key={star}
                        onClick={() => setPostMatchRating(star)}
                        className="transition-transform hover:scale-110 active:scale-95"
                      >
                        <Star size={32} className={star <= postMatchRating ? 'text-[#FFFF00] fill-[#FFFF00]' : 'text-gray-700'} />
                      </button>
                    ))}
                  </div>
                  <p className="text-center text-[10px] text-[#FFFF00] font-black mt-3 uppercase tracking-widest">
                    {postMatchRating === 5 ? "Mükemmel Takım" : postMatchRating >= 3 ? "İyi Takım" : "Toksik Takım"}
                  </p>
                </div>
              </div>

              <button 
                onClick={() => {
                  setShowPostMatchReport(false);
                  const updatedStatus = { ...matchLiveStatus };
                  if (myUpcomingMatches[0]?.id) {
                      updatedStatus[myUpcomingMatches[0].id] = 'FINISHED';
                  }
                  setMatchLiveStatus(updatedStatus);
                  if (isRef) {
                      alert('Raporunuz başarıyla gönderildi. Her iki kaptana skor onayı için bildirim iletildi.');
                  } else {
                      alert('Raporunuz başarıyla gönderildi. Kazancınız cüzdanınıza aktarıldı.');
                  }
                }}
                className={`w-full py-3.5 rounded-xl font-black text-white text-sm ${theme.bg} hover:brightness-110 transition-all uppercase shadow-lg`}
              >
                RAPORU GÖNDER VE BİTİR
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Styles for 3D Flip */}
      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
      </>)}
    </div>
  );
};

export default ServiceDashboard;
