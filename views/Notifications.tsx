import React, { useEffect, useState, useCallback } from 'react';
import { X, Bell, Shield, Clock, Star, CheckCircle, AlertTriangle, Zap, DollarSign, Calendar, Award, TrendingUp, ChevronRight, ArrowLeft, MapPin, CreditCard, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserRole, AppView } from '../types';
import { useAppStore } from '../store';
import { PITCHES } from '../constants';

interface NotificationsProps {
  onBack: () => void;
  role?: UserRole | null;
}

// ─── Goalkeeper-specific notifications ────────────────────────────────────────
const GK_NOTIFICATIONS = [
  {
    id: 'gk1', time: '2 dk', read: false,
    icon: DollarSign, color: '#22c55e',
    title: 'Yeni Teklif Aldın! 💰',
    desc: 'Kadıköy Kaptan Kerem seni bu Perşembe 20:00 maçına 250₺ ücretle davet etti. Kalan süre: 3 saat.',
    cta: 'Teklifi İncele',
  },
  {
    id: 'gk2', time: '14 dk', read: false,
    icon: Star, color: '#f59e0b',
    title: 'Yeni Değerlendirme ⭐',
    desc: 'Ahmet Y., dünkü maç için 5 yıldız verdi: "Muhteşem refleksler, gerçek bir panter!"',
    cta: 'Görüntüle',
  },
  {
    id: 'gk3', time: '1 sa', read: false,
    icon: Calendar, color: '#3b82f6',
    title: 'Maç Hatırlatması 🧤',
    desc: 'Yarın saat 19:00\'da Beşiktaş Spor Kompleksi\'ndeki maçın için hazır ol. Soyunma odası 18:30\'da açılacak.',
    cta: 'Detaylar',
  },
  {
    id: 'gk4', time: '3 sa', read: true,
    icon: TrendingUp, color: '#8b5cf6',
    title: 'Performans Raporu 📊',
    desc: 'Bu haftaki 3 maçta kurtarış oranın %91\'e çıktı. Bölge sıralamasında 3. oldun!',
    cta: 'Rapora Git',
  },
  {
    id: 'gk5', time: '1 gün', read: true,
    icon: Award, color: '#22c55e',
    title: 'Rozet Kazandın! 🏆',
    desc: '"Demir Kale" rozetini kazandın — arka arkaya 5 maçta gol yemeden çıktın.',
    cta: undefined,
  },
  {
    id: 'gk6', time: '2 gün', read: true,
    icon: AlertTriangle, color: '#ef4444',
    title: 'Müsaitlik Güncelleme',
    desc: 'Cumartesi için müsaitliğin "Kapalı" olarak görünüyor. 2 kaptan bu slotu sordu. Güncelle!',
    cta: 'Güncelle',
  },
  {
    id: 'gk7', time: '3 gün', read: true,
    icon: Zap, color: '#f59e0b',
    title: 'Teklif Süresi Doldu',
    desc: 'Üsküdar Spor Kompleksi teklifinin süresi doldu. Toplam 3 teklif kaçırdın bu hafta.',
    cta: undefined,
  },
];

// ─── Referee-specific notifications ───────────────────────────────────────────
const REF_NOTIFICATIONS = [
  {
    id: 'ref1', time: '5 dk', read: false,
    icon: DollarSign, color: '#ef4444',
    title: 'Yeni Hakem Talebi! 💰',
    desc: 'Beşiktaş Arena\'da Cuma 21:00 maçı için 350₺ ücretli hakem aranıyor. Hızlı kabul et!',
    cta: 'Kabul Et',
  },
  {
    id: 'ref2', time: '22 dk', read: false,
    icon: Star, color: '#f59e0b',
    title: 'Değerlendirme 5★',
    desc: 'Murat K.: "Kararları net ve hızlıydı, oyuncular çok memnun. Kesinlikle tekrar çağırırım."',
    cta: 'Görüntüle',
  },
  {
    id: 'ref3', time: '2 sa', read: false,
    icon: Calendar, color: '#3b82f6',
    title: 'Maç Ataması Onaylandı ✅',
    desc: 'Cumartesi 19:30 Kadıköy Spor Tesisi maçına atandın. Soyunma odasını 19:00\'da talep edebilirsin.',
    cta: 'Detaylar',
  },
  {
    id: 'ref4', time: '1 gün', read: true,
    icon: Award, color: '#ef4444',
    title: '"UEFA Standardı" Rozeti 🏅',
    desc: 'Bu ay yönettiğin 10 maçın tamamında oyuncu şikayeti sıfır. Elit hakem sınıfına terfi ettin!',
    cta: undefined,
  },
  {
    id: 'ref5', time: '2 gün', read: true,
    icon: AlertTriangle, color: '#f59e0b',
    title: 'Ücret Güncellemesi',
    desc: 'Standart ücretin 350₺ olarak güncellendi. 4 aktif kaptan profilini görüntülüyor.',
    cta: 'Fiyat Ayarla',
  },
];

// ─── General fallback notifications ──────────────────────────────────────────
const GENERAL_NOTIFICATIONS = [
  {
    id: 'g1', time: '5 dk', read: false,
    icon: Bell, color: '#f59e0b',
    title: 'Hoş Geldin!',
    desc: 'OYNA\'ya katıldığın için teşekkürler. Hadi ilk maçını oluştur!',
    cta: 'Keşfet',
  },
  {
    id: 'g2', time: '1 sa', read: false,
    icon: Star, color: '#3b82f6',
    title: 'Profil Tamamlama',
    desc: 'Profilini tamamla, maçlarda daha fazla görünürlük kazan.',
    cta: 'Tamamla',
  },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};
const item = {
  hidden: { opacity: 0, x: -24, scale: 0.96 },
  show: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 340, damping: 26 } },
  exit: { opacity: 0, x: 50, scale: 0.94, transition: { duration: 0.22 } },
};

const Notifications: React.FC<NotificationsProps> = ({ onBack, role }) => {
  const isGK = role === UserRole.GOALKEEPER;
  const isRef = role === UserRole.REFEREE;
  const isService = isGK || isRef;

  const accentColor = isRef ? '#ef4444' : isGK ? '#22c55e' : '#f59e0b';
  const badgeLabel = isRef ? 'HAKEM' : isGK ? 'KALECİ' : 'OYUNCU';

  const rawNotifs = isGK ? GK_NOTIFICATIONS : isRef ? REF_NOTIFICATIONS : GENERAL_NOTIFICATIONS;
  
  const { userNotifications, acceptMatchInvite, rejectMatchInvite, removeUserNotification, adminMatches, setSelectedMatch, navigateTo, clearUnreadNotifications, markAllNotificationsAsRead } = useAppStore();
  
  const storeNotifs = userNotifications.map(n => ({
    id: n.id,
    time: n.time || 'Az önce',
    read: n.read || false,
    icon: Bell,
    color: n.color || '#FFFF00',
    title: n.title,
    desc: n.desc || '',
    type: n.type,
    payload: n.payload,
    cta: undefined,
  }));

  const [localNotifications, setLocalNotifications] = useState(rawNotifs);
  const notifications: any[] = [...storeNotifs, ...localNotifications];
  
  const [allRead, setAllRead] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState<any>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);

  const unread = notifications.filter(n => !n.read && !allRead).length;

  const handleDismiss = useCallback((id: string | number) => {
    if (typeof id === 'string' && id.startsWith('inv_')) {
      removeUserNotification(id as string);
    } else {
      setLocalNotifications(prev => prev.filter(n => n.id !== id));
    }
  }, [removeUserNotification]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        onClick={onBack}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Sheet */}
      <motion.div 
        initial={{ y: '100%' }} 
        animate={{ y: 0 }} 
        exit={{ y: '100%' }} 
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full h-[85vh] bg-[#0A0E14] rounded-t-3xl overflow-hidden flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t border-white/10"
      >
        {/* Notch */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/20 rounded-full z-30 pointer-events-none" />

        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute rounded-full blur-[120px]"
          style={{ width: 320, height: 320, top: '-10%', right: '-10%', background: accentColor, opacity: 0.08 }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Header */}
      <div
        className="sticky top-0 z-20 px-5 pt-8 pb-4 flex items-center gap-3 border-b border-white/5"
        style={{ background: 'rgba(10,14,20,0.95)', backdropFilter: 'blur(24px)' }}
      >
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center border border-white/10 text-white"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        >
          <ArrowLeft size={18} />
        </motion.button>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-white tracking-tight">Bildirimler</h1>
            {unread > 0 && (
              <motion.span
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="w-5 h-5 rounded-full text-[10px] font-black text-black flex items-center justify-center"
                style={{ background: accentColor }}
              >
                {unread}
              </motion.span>
            )}
          </div>
          <div
            className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest"
            style={{ background: accentColor + '15', color: accentColor }}
          >
            <div className="w-1 h-1 rounded-full animate-pulse" style={{ background: accentColor }} />
            {badgeLabel} BİLDİRİMLERİ
          </div>
        </div>

        {unread > 0 && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setAllRead(true);
              setLocalNotifications(prev => prev.map(n => ({ ...n, read: true })));
              if (markAllNotificationsAsRead) markAllNotificationsAsRead();
              if (clearUnreadNotifications) clearUnreadNotifications();
            }}
            className="px-3 py-2 rounded-xl text-[10px] font-black border border-white/10 text-gray-400"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            Tümünü Oku
          </motion.button>
        )}
      </div>

      {/* Notification list */}
      <div className="flex-1 px-4 py-4 pb-28">
        <AnimatePresence mode="popLayout">
          {notifications.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-28 text-center"
            >
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4"
                style={{ background: accentColor + '15', border: `1px solid ${accentColor}30` }}
              >
                <Bell size={32} style={{ color: accentColor }} />
              </div>
              <h3 className="text-lg font-black text-white mb-1">Temiz!</h3>
              <p className="text-sm text-gray-500">Tüm bildirimler okundu.</p>
            </motion.div>
          ) : (
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
              {notifications.map((n, idx) => {
                const Icon = n.icon;
                const isUnread = !n.read && !allRead;
                return (
                  <motion.div
                    key={n.id}
                    variants={item}
                    exit="exit"
                    layout
                    onClick={() => {
                      if (n.type === 'invite') {
                        setSelectedInvite(n);
                      } else if (n.payload?.matchId) {
                        const m = adminMatches.find(x => x.id === n.payload?.matchId);
                        if (m) {
                          setSelectedMatch(m);
                          navigateTo('MATCH_JOIN' as AppView);
                        }
                      }
                    }}
                    className="relative rounded-[22px] overflow-hidden cursor-pointer group"
                    style={{
                      background: isUnread
                        ? `linear-gradient(135deg, rgba(10,14,22,0.98) 0%, ${n.color}08 100%)`
                        : 'rgba(13,20,32,0.95)',
                      border: `1px solid ${isUnread ? n.color + '30' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    {/* Top accent line for unread */}
                    {isUnread && (
                      <div
                        className="absolute top-0 left-0 right-0 h-0.5"
                        style={{ background: `linear-gradient(90deg, transparent, ${n.color}, transparent)` }}
                      />
                    )}

                    <div className="p-4 flex items-start gap-3">
                      {/* Icon */}
                      <motion.div
                        whileHover={{ scale: 1.1, rotate: 8 }}
                        className="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center"
                        style={{ background: n.color + '18', border: `1px solid ${n.color}30` }}
                      >
                        <Icon size={20} style={{ color: n.color }} />
                      </motion.div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1 pr-6">
                          <h4 className="font-black text-white text-sm leading-snug">{n.title}</h4>
                          <div className="flex items-center gap-2 shrink-0 mt-0.5">
                            {isUnread && (
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}` }}
                              />
                            )}
                            <span className="text-[10px] text-gray-500 font-medium">{n.time}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-gray-400 leading-relaxed">{n.desc}</p>

                        {n.type === 'invite' ? (
                          <div className="mt-3 flex items-center gap-1 text-[11px] font-black uppercase text-[#39FF14] bg-[#39FF14]/10 w-max px-3 py-1.5 rounded-xl border border-[#39FF14]/20">
                            Daveti İncele <ChevronRight size={14} />
                          </div>
                        ) : n.cta && (
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            className="mt-2 flex items-center gap-1 text-[11px] font-black"
                            style={{ color: n.color }}
                          >
                            {n.cta} <ChevronRight size={12} />
                          </motion.button>
                        )}
                      </div>



                      {/* Dismiss on hover */}
                      <motion.button
                        initial={{ opacity: 0, scale: 0.7 }}
                        whileHover={{ opacity: 1, scale: 1 }}
                        onClick={e => { e.stopPropagation(); handleDismiss(n.id); }}
                        className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <X size={11} />
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </motion.div>

      {/* Invite Modal */}
      <AnimatePresence>
        {selectedInvite && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex flex-col"
          >
            {(() => {
              const match = adminMatches.find(m => m.id === selectedInvite.payload?.matchId) as any;
              const pitch = PITCHES.find(p => p.id === match?.pitchId);
              const cost = match?.costPerPerson || match?.price || 150;
              
              return (
                <div className="flex-1 overflow-y-auto flex flex-col relative pb-32">
                  <div className="w-full h-64 relative shrink-0">
                    <img src={pitch?.image || 'https://images.unsplash.com/photo-1518605368461-1ee12522c070?auto=format&fit=crop&q=80'} className="w-full h-full object-cover opacity-50" />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#0A0E14]/60 to-[#0A0E14]" />
                    <button onClick={() => setSelectedInvite(null)} className="absolute top-12 right-5 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20"><X size={20} /></button>
                    
                    <div className="absolute bottom-6 left-6 right-6">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#39FF14]/20 border border-[#39FF14]/30 text-[#39FF14] text-[10px] font-black uppercase tracking-widest mb-3">
                        <CheckCircle size={12} /> Davet Edildin
                      </div>
                      <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase drop-shadow-lg">{match?.title || 'Dostluk Maçı'}</h2>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="flex items-center gap-1.5 text-xs text-white/70 font-medium"><Calendar size={14} className="text-[#39FF14]" /> {match?.date || 'Belirtilmedi'}</span>
                        <span className="flex items-center gap-1.5 text-xs text-white/70 font-medium"><Clock size={14} className="text-[#39FF14]" /> {match?.time || '20:00'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-6 flex-1 flex flex-col gap-6">
                    <div className="bg-[#161B22] border border-white/5 rounded-3xl p-5 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-[#39FF14]/10 flex items-center justify-center text-[#39FF14]"><MapPin size={24} /></div>
                      <div>
                        <h4 className="text-sm font-black text-white">{pitch?.name || 'Saha Seçilmemiş'}</h4>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{pitch?.location || 'İstanbul'}</p>
                      </div>
                    </div>

                    <div className="bg-[#161B22] border border-white/5 rounded-3xl p-5">
                      <h3 className="text-xs font-black uppercase tracking-widest text-white/50 mb-4">Ödeme Detayları</h3>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-white/80">Kişi Başı Ücret</span>
                        <span className="text-sm font-black text-white">{cost}₺</span>
                      </div>
                      <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/5">
                        <span className="text-sm text-white/80">Hizmet Bedeli</span>
                        <span className="text-sm font-black text-white">0₺</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-base font-black text-white uppercase">Toplam</span>
                        <span className="text-xl font-black text-[#39FF14]">{cost}₺</span>
                      </div>
                    </div>
                    
                    <p className="text-[11px] text-gray-500 text-center px-4 leading-relaxed mt-auto">
                      Bu daveti kabul ederek OYNA kurallarını ve iade politikalarını onaylamış olursunuz.
                    </p>
                  </div>

                  <div className="fixed bottom-0 left-0 right-0 px-6 pt-6 pb-safe bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/95 to-transparent z-20">
                    <div className="flex gap-3">
                      <button 
                        disabled={isPaying || paySuccess}
                        onClick={() => {
                          rejectMatchInvite(selectedInvite.id as string);
                          setSelectedInvite(null);
                        }}
                        className="w-16 h-[64px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:bg-red-500/10 hover:text-red-400 transition-all shrink-0"
                      >
                        <X size={24} />
                      </button>
                      <button 
                        disabled={isPaying || paySuccess}
                        onClick={() => {
                          setIsPaying(true);
                          setTimeout(() => {
                            setPaySuccess(true);
                            setTimeout(() => {
                              acceptMatchInvite(selectedInvite.id as string);
                              setSelectedInvite(null);
                              setIsPaying(false);
                              setPaySuccess(false);
                              onBack();
                              navigateTo('UPCOMING_MATCHES' as AppView);
                            }, 1500);
                          }, 1500);
                        }}
                        className={`flex-1 h-[64px] rounded-2xl font-black italic uppercase tracking-tighter transition-all flex items-center justify-center gap-2 overflow-hidden relative ${paySuccess ? 'bg-[#39FF14] text-black' : isPaying ? 'bg-[#FFFF00] text-black' : 'bg-[#39FF14] text-black shadow-[0_0_30px_rgba(57,255,20,0.3)] hover:shadow-[0_0_40px_rgba(57,255,20,0.5)]'}`}
                      >
                        {paySuccess ? (
                          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2">
                            <CheckCircle2 size={24} strokeWidth={3} /> ÖDEME ALINDI
                          </motion.div>
                        ) : isPaying ? (
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" /> İŞLENİYOR...
                          </div>
                        ) : (
                          <>
                            <CreditCard size={20} /> KABUL ET VE {cost}₺ ÖDE
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Notifications;
