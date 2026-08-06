import React from 'react';
import { motion } from 'framer-motion';
import { Home, User } from 'lucide-react';
import { AppView } from '../types';
// Onaylı ana sayfa tasarımıyla gelen özel amblemler. Üç sekmenin ikonu
// lucide muadilinden bunlara geçti: Top Oyna (Calendar → top+oynat işareti),
// Sahalar (MapPin → saha pini), Maçlarım (Ticket → marka amblemi).
// Ana Sayfa (Home) ve Profil (User) lucide'de kaldı — tasarımda da öyleler.
import { OynaMark, PlayBallMark } from './dashboard/OynaMarks';
// IP-08: Gezinti etiketleri 12px'ti ve gerçek Inter metrikleriyle 360px'lik
// ekranda "Ana Sayfa" İKİ SATIRA kırılıyordu (görsel testler yedek fontla
// çalıştığı için bunu hiç yakalamamıştı — canlıda kırılıyor). Etiket ölçeğin
// caption basamağına (11px) indi ve `whitespace-nowrap` ile kırılma yasaklandı:
// birincil gezinti çubuğu asla iki satıra taşmaz.
import { type_ } from '../ui/type';
// IP-13: sekme etiketi ile ekran başlığı AYNI kaynaktan gelir.
import { TAB } from '../ui/labels';

/** Alt menünün BEŞ yuvası — TEK KAYNAK.
 *  App.tsx `showBottomNav`'ı bu listeden türetir; ikisi ayrı yazıldığında
 *  senkron kaçıyordu (STUDIO listede vardı ama sekmesi yoktu → çubuk çiziliyor
 *  ama hiçbir sekme yanmıyordu; MY_MATCHES ikisinde de yoktu → çubuk kayboluyordu).
 *
 *  Kullanıcı kararı: MAÇLARIM ortadaki büyük tuş olur (bilet, kapora ve maç
 *  değerlendirmesi oradan geçiyor — en kolay erişilen yuvayı hak ediyor).
 *  SOSYAL sekmeden çıktı; girişi PROFİL ekranındadır. */
export const TAB_IDS = ['DASHBOARD', 'MATCH_DISCOVERY', 'MY_MATCHES', 'PITCH_DISCOVERY', 'PROFILE'] as const;
export type TabId = typeof TAB_IDS[number];

/** Sekme ikonlarının ortak arayüzü — lucide bileşenleriyle birebir uyumlu,
 *  böylece lucide ikonu ile özel amblem aynı listede yan yana durabilir. */
type NavIconProps = { size?: number; className?: string; strokeWidth?: number };
type NavIcon = React.FC<NavIconProps>;

/** "Top Oyna" — top + oynat işareti (dolgu; rengi `currentColor`den alır). */
const PlayTabIcon: NavIcon = ({ size = 20, className }) => (
  <PlayBallMark width={size} height={size} className={className} />
);

/** "Sahalar" — saha pini. Tasarımda çizgi (stroke) ikonudur; bu yüzden
 *  OynaMarks'taki dolgu amblemlerine değil, buraya yazıldı. */
const PitchTabIcon: NavIcon = ({ size = 20, className, strokeWidth = 2 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
    focusable={false}
    style={{ flex: 'none' }}
  >
    <path d="M12 21c4.8-4.2 7.4-7.5 7.4-11a7.4 7.4 0 0 0-14.8 0c0 3.5 2.6 6.8 7.4 11z" />
    <circle cx="12" cy="10" r="2.9" strokeWidth={1.4} />
  </svg>
);

/** "Maçlarım" — ortadaki büyük tuşun içindeki marka amblemi.
 *  viewBox 100×98.7 olduğu için yükseklik genişliğin 0.987 katıdır; kare
 *  verilirse amblem hafifçe ezilir. */
const MyMatchesTabIcon: NavIcon = ({ size = 29, className }) => (
  <OynaMark width={size} height={size * 0.987} className={className} />
);

interface BottomNavProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  /** Aşağı kaydırırken bar yolu açar; yukarı kaydırınca geri gelir. */
  hidden?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, onNavigate, hidden = false }) => {
  const navItems: { id: TabId; icon: NavIcon; label: string; isCenter?: boolean }[] = [
    { id: 'DASHBOARD', icon: Home, label: TAB.dashboard },
    { id: 'MATCH_DISCOVERY', icon: PlayTabIcon, label: TAB.matchDiscovery },
    { id: 'MY_MATCHES', icon: MyMatchesTabIcon, label: TAB.myMatches, isCenter: true },
    { id: 'PITCH_DISCOVERY', icon: PitchTabIcon, label: TAB.pitchDiscovery },
    { id: 'PROFILE', icon: User, label: TAB.profile },
  ];

  return (
    <motion.nav
      aria-label="Ana Gezinti"
      role="navigation"
      initial={{ y: '130%' }}
      animate={{ y: hidden ? '130%' : 0 }}
      exit={{ y: '130%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pt-2 pb-safe max-w-lg mx-auto"
    >
      <div
        className="bg-[#161B22]/80 backdrop-blur-xl border border-white/10 rounded-[32px] px-2 py-2 flex items-center justify-between shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
      >
        {navItems.map((item) => {
          // Artık beş sekmenin beşi de gerçek bir görünüme karşılık geliyor;
          // "hangi sekmedeyim" sorusu her zaman cevaplı.
          const isActive = currentView === item.id;
          const Icon = item.icon;

          if (item.isCenter) {
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id as AppView)}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className="flex-1 relative -top-6 flex flex-col items-center justify-center group outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14] focus-visible:ring-offset-2 focus-visible:ring-offset-[#161B22] rounded-full min-h-[48px]"
              >
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  /* Amblem `fill="currentColor"` çizildiği için rengi buradaki
                     metin renginden alır. Pasif hâl tasarımdan: sarı (#F1CA1D)
                     amblem, koyu zemin, neon yeşil kenar. Aktif hâl mevcut
                     kuralda kalır: dolu yeşil zemin, siyah amblem. */
                  className={`w-14 h-14 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(57,255,20,0.3)] transition-colors ${
                    isActive ? 'bg-[#39FF14] text-black' : 'bg-[#0A0E14] border-2 border-[#39FF14] text-[#F1CA1D]'
                  }`}
                >
                  <Icon size={29} strokeWidth={isActive ? 3 : 2} />
                </motion.div>
                <span className={`${type_.caption} font-extrabold tracking-wide mt-1 whitespace-nowrap transition-colors ${isActive ? 'text-[#39FF14]' : 'text-ink-4'}`}>
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as AppView)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 relative group min-h-[48px] rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              {isActive && (
                <motion.div 
                  layoutId="bottomNavIndicator"
                  className="absolute inset-1 bg-gradient-to-b from-white/10 to-transparent rounded-xl border-t border-white/20"
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                />
              )}
              <div className="relative z-10 flex flex-col items-center gap-1">
                <Icon 
                  size={20} 
                  className={`transition-colors duration-300 ${isActive ? 'text-white' : 'text-ink-4 group-hover:text-gray-300'}`} 
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span className={`${type_.caption} font-bold tracking-wide whitespace-nowrap transition-colors duration-300 ${isActive ? 'text-white' : 'text-ink-4 group-hover:text-gray-300'}`}>
                  {item.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </motion.nav>
  );
};
