
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, MapPin, Users, User, Scale, Shield,
  Clock, Check, Wallet, Sparkles, ArrowLeft,
  Target, MousePointer2, X, Trophy, Activity, Calendar, Star, TrendingUp, Flame, Zap
} from 'lucide-react';
import { AppView, Goalkeeper, Referee } from '../types';
import { AnimatedButton } from '../components/AnimatedButton';
import { useAppStore } from '../store';

interface DashboardProps {
  onNavigate: (view: AppView) => void;
  onBack: () => void;
  onRoleSelect?: (role: any) => void;
  selectedGk: Goalkeeper | null;
  selectedRef: Referee | null;
}

const DashboardSkeleton = () => (
  <div className="p-6 space-y-4 min-h-screen bg-[#0A0E14] animate-pulse">
    <div className="flex justify-between items-center mb-8">
      <div className="h-10 w-40 bg-gray-800 rounded-xl"></div>
      <div className="h-10 w-10 bg-gray-800 rounded-full"></div>
    </div>
    <div className="h-48 w-full bg-gray-800 rounded-[32px] relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_1.5s_infinite]"></div>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div className="h-40 bg-gray-800 rounded-[32px]"></div>
      <div className="h-40 bg-gray-800 rounded-[32px]"></div>
    </div>
    <div className="h-24 w-full bg-gray-800 rounded-[32px]"></div>
    <div className="flex justify-center items-center gap-2 mt-10">
      <div className="w-2 h-2 bg-[#FFFF00] rounded-full animate-bounce"></div>
      <p className="text-[#FFFF00] text-xs font-bold uppercase tracking-widest">Sistem Sahayı Hazırlıyor...</p>
    </div>
  </div>
);

const MatchCountdown: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const targetDate = new Date();
    targetDate.setHours(targetDate.getHours() + 2);
    targetDate.setMinutes(targetDate.getMinutes() + 30);

    const timer = setInterval(() => {
      const now = new Date();
      const difference = targetDate.getTime() - now.getTime();

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const format = (num: number) => num.toString().padStart(2, '0');

  const hasDays = timeLeft.days > 0;
  const themeColor = hasDays ? 'text-green-400' : 'text-red-500';
  const themeBg = hasDays ? 'bg-green-500' : 'bg-red-500';
  const themeBorder = hasDays ? 'border-green-500/30' : 'border-red-500/30';
  const themeGlow = hasDays ? 'bg-green-500/20' : 'bg-red-500/20';

  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: 1,
        y: 0,
        borderColor: !hasDays ? ['rgba(239,68,68,0.3)', 'rgba(239,68,68,0.8)', 'rgba(239,68,68,0.3)'] : 'rgba(34,197,94,0.3)'
      }}
      transition={{ borderColor: { duration: 1.5, repeat: Infinity, ease: "easeInOut" } }}
      whileHover={{ scale: 1.02 }}
      className={`w-full h-full backdrop-blur-xl border rounded-[28px] p-3 sm:p-4 relative overflow-hidden group cursor-pointer transition-all duration-500 flex flex-col justify-between shadow-[0_8px_30px_rgba(37,99,235,0.2)] ${themeBorder}`}
    >
      {/* Calm Flowing Blue Gradient Background */}
      <motion.div
        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
        transition={{ duration: 12, ease: "linear", repeat: Infinity }}
        className="absolute inset-0 bg-gradient-to-r from-blue-900/60 via-blue-500/20 to-blue-900/60 bg-[length:200%_200%] pointer-events-none z-0"
      />
      <motion.div
        animate={{ opacity: [0.1, 0.3, 0.1], scale: [1, 1.2, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
        className={`absolute -right-8 -bottom-8 w-32 h-32 blur-[40px] rounded-full pointer-events-none z-0 ${themeGlow}`}
      />

      {/* Top Bar: Status */}
      <div className="flex items-center justify-between relative z-10 w-full mb-2">
        <div className="flex items-center gap-1.5">
          <motion.div
            animate={{
              boxShadow: hasDays
                ? ["0 0 0px rgba(34,197,94,0)", "0 0 10px rgba(34,197,94,0.5)", "0 0 0px rgba(34,197,94,0)"]
                : ["0 0 0px rgba(239,68,68,0)", "0 0 10px rgba(239,68,68,0.5)", "0 0 0px rgba(239,68,68,0)"]
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className={`${themeBg} w-5 h-5 rounded-full flex items-center justify-center shrink-0`}
          >
            <Clock size={10} className="text-black" />
          </motion.div>
          <p className={`text-[8px] sm:text-[9px] font-black uppercase tracking-widest ${themeColor}`}>
            {hasDays ? 'Sıradaki' : 'BAŞLIYOR'}
          </p>
        </div>
        <div className="bg-white/10 px-1.5 py-0.5 rounded shadow-inner flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[#FFC107] animate-pulse"></div>
          <span className="text-white text-[8px] sm:text-[9px] font-black tracking-widest">21:30</span>
        </div>
      </div>

      {/* Main Content Split: Stacked */}
      <div className="flex flex-col items-center justify-center relative z-10 w-full flex-1">
        
        {/* Timers */}
        <div className="flex items-center justify-center gap-1 sm:gap-1.5 shrink-0 mb-2 w-full">
          <div className="w-[32px] sm:w-[36px] h-[36px] sm:h-[40px] bg-[#0A0E14] border border-white/10 rounded-xl flex flex-col items-center justify-center shadow-inner">
            <span className={`${!hasDays ? 'text-white/50' : 'text-white'} font-black text-base sm:text-lg leading-none tabular-nums`}>{format(timeLeft.days)}</span>
            <span className="text-[5px] sm:text-[6px] text-gray-500 font-bold uppercase mt-0.5">Gün</span>
          </div>
          <span className="text-white/20 font-black mb-1.5 text-[10px]">:</span>

          <div className="w-[32px] sm:w-[36px] h-[36px] sm:h-[40px] bg-[#0A0E14] border border-white/10 rounded-xl flex flex-col items-center justify-center shadow-inner">
            <span className={`${!hasDays ? 'text-red-500 animate-pulse' : 'text-white'} font-black text-base sm:text-lg leading-none tabular-nums`}>{format(timeLeft.hours)}</span>
            <span className="text-[5px] sm:text-[6px] text-gray-500 font-bold uppercase mt-0.5">Saat</span>
          </div>
          
          <span className="text-white/20 font-black mb-1.5 text-[10px]">:</span>

          <div className="w-[32px] sm:w-[36px] h-[36px] sm:h-[40px] bg-[#0A0E14] border border-white/10 rounded-xl flex flex-col items-center justify-center shadow-inner">
            <span className={`${!hasDays ? 'text-red-500 animate-pulse' : 'text-white'} font-black text-base sm:text-lg leading-none tabular-nums`}>{format(timeLeft.minutes)}</span>
            <span className="text-[5px] sm:text-[6px] text-gray-500 font-bold uppercase mt-0.5">Dak</span>
          </div>
        </div>

        {/* Location Details */}
        <div className="w-full text-center bg-white/5 py-1 px-1 sm:px-2 rounded-lg border border-white/5">
          <p className="text-white font-black text-[9px] sm:text-[11px] leading-tight truncate">Arena Sport</p>
          <p className="text-gray-400 font-bold text-[7px] sm:text-[8px] truncate mt-px">Fulya • Halı Saha</p>
        </div>
      </div>
    </motion.div>
  );
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } }
};


const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onBack, selectedGk, selectedRef }) => {
  const [isLoading, setIsLoading] = useState(true);
  const { globalTexts, unreadNotificationsCount } = useAppStore();

  const COMMUNITIES = [
    { id: 'c1', name: 'Boğaziçi Üni', short: 'BOUN' },
    { id: 'c2', name: 'İTÜ', short: 'ITU' },
    { id: 'c3', name: 'ODTÜ', short: 'ODTU' },
  ];
  const [activeCommunity, setActiveCommunity] = useState(COMMUNITIES[0]);
  const [isCommunityDropdownOpen, setIsCommunityDropdownOpen] = useState(false);

  useEffect(() => {
    // Simulate Loading
    setTimeout(() => setIsLoading(false), 2000);
  }, []);

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="flex flex-col min-h-screen pb-6 bg-[#0A0E14] text-white font-sans selection:bg-[#FFFF00] selection:text-black">

      {/* Header */}
      <header className="px-6 pt-8 pb-4 flex justify-between items-center bg-transparent z-30">
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-[#161B22] to-[#0A0E14] border border-white/10 p-0.5 overflow-hidden shadow-[0_0_20px_rgba(57,255,20,0.15)] transition-colors"
            onClick={() => onNavigate('PROFILE')}
          >
            <img src="https://i.pravatar.cc/150?u=kaptan" alt="Profile" className="w-full h-full object-cover rounded-full" />
          </motion.button>
          <div>
            <h1 className="text-xl font-black text-white italic tracking-tighter leading-none uppercase">{globalTexts?.dashboardTitle || 'ANA SAYFA'}</h1>

          </div>
        </div>
        <div className="flex gap-3 relative">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate('WALLET')}
            className="h-12 px-4 flex items-center gap-2 bg-[#161B22]/80 backdrop-blur-md border border-white/5 rounded-full hover:bg-white/10 hover:border-green-500/50 transition-colors group shadow-lg"
          >
            <Wallet size={18} className="text-green-400 group-hover:text-green-300" />
            <span className="text-sm font-black text-white tracking-tight">450₺</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate('NOTIFICATIONS')}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-[#161B22]/80 backdrop-blur-md border border-white/5 text-gray-300 relative hover:bg-white/10 transition-colors shadow-lg"
          >
            <Bell size={20} />
            {unreadNotificationsCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 bg-red-500 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.6)] border-[3px] border-[#0A0E14] flex items-center justify-center text-[10px] font-black text-white">
                +{unreadNotificationsCount}
              </span>
            ) : (
              <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-[#39FF14] rounded-full shadow-[0_0_10px_rgba(57,255,20,0.8)] animate-pulse border-2 border-[#161B22]"></span>
            )}
          </motion.button>
        </div>
      </header>

      {/* 2. Top Banner Grid (Symmetrical Matches & Stats) */}
      <div className="px-6 mb-6">
        <MatchCountdown onClick={() => onNavigate('MATCH_CALENDAR')} />
      </div>

      {/* BENTO GRID LAYOUT */}
      <motion.main
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="px-6 grid grid-cols-2 gap-4 auto-rows-min"
      >

        {/* Active Hires Section (Conditional) */}
        {(selectedGk || selectedRef) && (
          <motion.div variants={itemVariants} className="col-span-2 space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Sparkles size={14} className="text-[#FFFF00]" />
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Aktif Kiralamalar</h3>
            </div>
            <div className="flex gap-3">
              {selectedGk && (
                <div className="flex-1 bg-[#161B22] border border-green-500/30 rounded-2xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-green-500/50">
                    <img src={selectedGk.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-white uppercase truncate max-w-[80px]">{selectedGk.name}</p>
                    <p className="text-[8px] text-green-500 font-bold uppercase">KALECİ • AKTİF</p>
                  </div>
                </div>
              )}
              {selectedRef && (
                <div className="flex-1 bg-[#161B22] border border-yellow-500/30 rounded-2xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-yellow-500/50">
                    <img src={selectedRef.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-white uppercase truncate max-w-[80px]">{selectedRef.name}</p>
                    <p className="text-[8px] text-yellow-500 font-bold uppercase">HAKEM • AKTİF</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Countdown Box removed from here and moved to the horizontal top slider */}


        {/* 2.5. MAÇ OLUŞTUR (New Center Button) */}
        <AnimatedButton
          as="div"
          variants={itemVariants}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('MATCH_CREATE')}
          className="col-span-2 h-40 bg-[#0A0E14] rounded-[32px] relative overflow-hidden group cursor-pointer border-2 border-[#FFFF00]/60 shadow-[0_0_30px_rgba(255,255,0,0.18)]"
        >
          {/* Base Pattern */}
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-80 mix-blend-overlay pointer-events-none"></div>

          {/* Smooth Rotating Gradient Background */}
          <motion.div
            animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 bg-gradient-to-r from-[#FFFF00]/10 via-[#FFFF00]/30 to-[#FFFF00]/10 bg-[length:200%_200%] pointer-events-none mix-blend-screen"
          />

          {/* Animated border glow */}
          <motion.div
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-[32px] border-2 border-[#FFFF00]/40 pointer-events-none"
          />

          {/* Deep Details (Football Energy Theme) */}
          <motion.div animate={{ opacity: [0, 1, 0], scale: [0.8, 1.2, 0.8] }} transition={{ duration: 3, repeat: Infinity, delay: 0.5, ease: "easeInOut" }} className="absolute top-4 left-1/4 pointer-events-none">
            <Zap size={12} className="text-[#FFFF00] fill-current drop-shadow-[0_0_8px_rgba(255,255,0,0.8)]" />
          </motion.div>
          <motion.div animate={{ opacity: [0, 1, 0], scale: [0.8, 1.2, 0.8] }} transition={{ duration: 4, repeat: Infinity, delay: 1.2, ease: "easeInOut" }} className="absolute bottom-6 left-1/3 pointer-events-none">
            <Zap size={14} className="text-[#FFFF00] fill-current drop-shadow-[0_0_8px_rgba(255,255,0,0.8)]" />
          </motion.div>
          <motion.div animate={{ opacity: [0, 1, 0], scale: [0.8, 1.2, 0.8] }} transition={{ duration: 3.5, repeat: Infinity, delay: 0.2, ease: "easeInOut" }} className="absolute top-1/3 right-1/4 pointer-events-none">
            {/* Using a tiny Flame or Hexagon? Let's stick with Zap for raw speed/energy */}
            <Zap size={10} className="text-[#FFFF00] fill-current drop-shadow-[0_0_8px_rgba(255,255,0,0.8)]" />
          </motion.div>

          {/* Content */}
          <div className="absolute inset-0 p-6 flex flex-row items-center justify-between">
            <div className="relative z-10 flex flex-col justify-center h-full">
              <h2 className="text-4xl font-black text-white italic uppercase leading-none drop-shadow-md mb-2">Maç<br />Oluştur</h2>
              <p className="text-xs text-[#FFFF00] font-bold tracking-widest drop-shadow-[0_0_10px_rgba(255,255,0,0.5)]">Takımını kur, sahayı seç, oyna.</p>
            </div>
            
            {/* Visual Right Side: Animated Pitch & Players */}
            <div className="w-32 h-24 relative overflow-hidden rounded-[20px] border border-[#FFFF00]/30 bg-black/40 backdrop-blur-sm -skew-x-[12deg] group-hover:skew-x-0 transition-transform duration-500 shadow-[0_0_20px_rgba(255,255,0,0.2)]">
              {/* Pitch Lines */}
              <div className="absolute inset-0 flex items-center justify-center -skew-x-[10deg] scale-125 pointer-events-none">
                <div className="w-full h-[2px] bg-[#FFFF00]/30 absolute"></div>
                <div className="w-12 h-12 rounded-full border-2 border-[#FFFF00]/30 absolute"></div>
              </div>
              
              {/* Animated Player Dots (Yellow) */}
              <motion.div animate={{ x: [0, 20, 0], y: [0, -10, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="absolute left-3 top-3 w-2.5 h-2.5 bg-[#FFFF00] rounded-full shadow-[0_0_10px_rgba(255,255,0,1)]" />
              <motion.div animate={{ x: [0, -15, 0], y: [0, 20, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="absolute left-8 bottom-3 w-2.5 h-2.5 bg-[#FFFF00] rounded-full shadow-[0_0_10px_rgba(255,255,0,1)]" />
              
              {/* Animated Player Dots (White/Opponent) */}
              <motion.div animate={{ x: [0, -20, 0], y: [0, 15, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }} className="absolute right-3 top-6 w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,1)]" />
              <motion.div animate={{ x: [0, 15, 0], y: [0, -15, 0] }} transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }} className="absolute right-10 bottom-4 w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,1)]" />
            </div>
          </div>
        </AnimatedButton>

        {/* 3. Pitch Booking (FULL WIDTH) */}
        <AnimatedButton
          as="div"
          variants={itemVariants}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('PITCH_DISCOVERY')}
          className="col-span-2 h-32 bg-[#16a34a] rounded-[32px] relative overflow-hidden group cursor-pointer shadow-[0_0_30px_rgba(22,163,74,0.3)] breathing-glow"
        >
          {/* Vektörel Futbol Sahası Deseni */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Grass Stripes */}
            <div className="absolute inset-0 opacity-15" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,0,0,0.15) 40px, rgba(0,0,0,0.15) 80px)' }}></div>

            {/* Pitch SVG */}
            <div className="absolute inset-0 w-full h-full opacity-40">
              <svg viewBox="0 0 1050 680" preserveAspectRatio="xMidYMid slice" className="w-full h-full drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" xmlns="http://www.w3.org/2000/svg">
                <g stroke="white" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  {/* Outer Boundary */}
                  <rect x="25" y="25" width="1000" height="630" />
                  {/* Halfway Line */}
                  <line x1="525" y1="25" x2="525" y2="655" />
                  {/* Center Circle */}
                  <circle cx="525" cy="340" r="90" />
                  {/* Center Spot */}
                  <circle cx="525" cy="340" r="4" fill="white" />

                  {/* Left Penalty Area */}
                  <rect x="25" y="140" width="165" height="400" />
                  {/* Left Goal Area */}
                  <rect x="25" y="240" width="55" height="200" />
                  {/* Left Penalty Spot */}
                  <circle cx="120" cy="340" r="4" fill="white" />
                  {/* Left Penalty Arc */}
                  <path d="M 190 260 A 90 90 0 0 1 190 420" />

                  {/* Right Penalty Area */}
                  <rect x="860" y="140" width="165" height="400" />
                  {/* Right Goal Area */}
                  <rect x="970" y="240" width="55" height="200" />
                  {/* Right Penalty Spot */}
                  <circle cx="930" cy="340" r="4" fill="white" />
                  {/* Right Penalty Arc */}
                  <path d="M 860 260 A 90 90 0 0 0 860 420" />

                  {/* Corner Arcs */}
                  <path d="M 65 25 A 40 40 0 0 0 25 65" />
                  <path d="M 25 615 A 40 40 0 0 0 65 655" />
                  <path d="M 985 25 A 40 40 0 0 1 1025 65" />
                  <path d="M 1025 615 A 40 40 0 0 1 985 655" />
                </g>
              </svg>
            </div>

            {/* Gradient Fade to protect text */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#16a34a]/90 via-[#16a34a]/40 to-transparent"></div>
          </div>
          <div className="absolute inset-0 p-5 flex items-center justify-between">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <MapPin size={18} className="text-white" />
                <span className="text-white text-xs font-bold uppercase tracking-widest">Rezervasyon</span>
              </div>
              <h2 className="text-3xl font-black text-white italic uppercase leading-none drop-shadow-md">Saha<br />Vitrini</h2>
              <p className="text-[10px] text-lime-100 mt-1 font-bold">Uygun sahaları gör.</p>
            </div>
            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border-4 border-white/20 group-hover:scale-110 transition-transform">
              <MapPin size={40} className="text-white" />
            </div>
          </div>
        </AnimatedButton>

        <AnimatedButton
          as="div"
          variants={itemVariants}
          onClick={() => onNavigate('MARKETPLACE_GK')}
          whileHover={{ scale: 1.05, y: -5 }}
          whileTap={{ scale: 0.95 }}
          className="h-40 bg-gradient-to-br from-[#161B22] to-[#0A0E14] border border-white/5 rounded-[32px] p-5 relative overflow-hidden group cursor-pointer shadow-lg"
        >
          {/* Animated Background Glow */}
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.1, 0.2, 0.1]
            }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute inset-0 bg-green-500/10 blur-3xl rounded-full"
          />

          <div className="relative z-10 h-full flex flex-col justify-between">
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="w-12 h-12 rounded-2xl bg-green-500/10 text-green-400 flex items-center justify-center border border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]"
            >
              <Shield size={24} />
            </motion.div>
            <div>
              <h3 className="text-xl font-black text-white italic tracking-tighter leading-none mb-1">KALECİLER</h3>
              <div className="flex items-center gap-1 mt-1">
                <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-[8px] font-bold text-green-500 uppercase tracking-widest">12 Aktif Panter</span>
              </div>
            </div>
          </div>
          <Shield size={100} className="absolute right-[-15px] bottom-[-15px] text-white/5 -rotate-12 group-hover:text-green-500/10 transition-all duration-500" />
        </AnimatedButton>

        <AnimatedButton
          as="div"
          variants={itemVariants}
          onClick={() => onNavigate('MARKETPLACE_REF')}
          whileHover={{ scale: 1.05, y: -5 }}
          whileTap={{ scale: 0.95 }}
          className="h-40 bg-gradient-to-br from-[#161B22] to-[#0A0E14] border border-white/5 rounded-[32px] p-5 relative overflow-hidden group cursor-pointer shadow-lg"
        >
          {/* Animated Background Glow */}
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.1, 0.2, 0.1]
            }}
            transition={{ duration: 4, repeat: Infinity, delay: 1 }}
            className="absolute inset-0 bg-blue-500/10 blur-3xl rounded-full"
          />

          <div className="relative z-10 h-full flex flex-col justify-between">
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
            >
              <Scale size={24} />
            </motion.div>
            <div>
              <h3 className="text-xl font-black text-white italic tracking-tighter leading-none mb-1">HAKEMLER</h3>
              <div className="flex items-center gap-1 mt-1">
                <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-[8px] font-bold text-blue-500 uppercase tracking-widest">FIFA Kokartlı</span>
              </div>
            </div>
          </div>
          <Scale size={100} className="absolute right-[-15px] bottom-[-15px] text-white/5 -rotate-12 group-hover:text-blue-500/10 transition-all duration-500" />
        </AnimatedButton>

        {/* 5. Individual Match Join (FULL WIDTH) */}
        <AnimatedButton
          as="div"
          variants={itemVariants}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('MATCH_DISCOVERY')}
          className="col-span-2 h-32 bg-[#4f46e5] rounded-[32px] relative overflow-hidden group cursor-pointer shadow-[0_0_30px_rgba(79,70,229,0.3)] breathing-glow"
        >
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagonal-noise.png')] opacity-80 mix-blend-overlay"></div>
          <div className="absolute inset-0 p-5 flex items-center justify-between">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <Users size={18} className="text-white" />
                <span className="text-white text-xs font-bold uppercase tracking-widest">Bireysel</span>
              </div>
              <h2 className="text-3xl font-black text-white italic uppercase leading-none drop-shadow-md">Maça<br />Katıl</h2>
              <p className="text-[10px] text-blue-200 mt-1 font-bold">Destek ol.</p>
            </div>
            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border-4 border-white/20 group-hover:scale-110 transition-transform">
              <User size={40} className="text-white" />
            </div>
          </div>
        </AnimatedButton>

        {/* 2. RAKİP BUL (NEW VERSUS TILE) - Prominent Red */}
        <AnimatedButton
          as="div"
          variants={itemVariants}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('OPPONENT_FINDER')}
          className="col-span-2 h-32 bg-red-600 rounded-[32px] relative overflow-hidden group cursor-pointer shadow-[0_0_30px_rgba(220,38,38,0.3)] breathing-glow"
        >
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-60"></div>
          <div className="absolute inset-0 p-5 flex items-center justify-between">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <Users size={18} className="text-white" />
                <span className="text-white text-xs font-bold uppercase tracking-widest">Kaptan Modu</span>
              </div>
              <h2 className="text-3xl font-black text-white italic uppercase leading-none drop-shadow-md">Rakip<br />Bul</h2>
              <p className="text-[10px] text-red-200 mt-1 font-bold">Takımını al, meydan oku.</p>
            </div>
            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border-4 border-white/20 group-hover:scale-110 transition-transform relative overflow-hidden">
              {/* VS Text Background */}
              <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                <span className="text-5xl font-black italic text-white -rotate-12">VS</span>
              </div>
              {/* Facing Users */}
              <div className="flex items-center justify-center gap-1 relative z-10">
                <User size={32} className="text-white drop-shadow-md" />
                <User size={32} className="text-white drop-shadow-md" style={{ transform: 'scaleX(-1)' }} />
              </div>
            </div>
          </div>
        </AnimatedButton>

        {/* Community Button (FULL WIDTH) */}
        <AnimatedButton
          as="div"
          variants={itemVariants}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('COMMUNITY_VIEW')}
          className="col-span-2 h-32 bg-[#d946ef] rounded-[32px] relative overflow-hidden group cursor-pointer shadow-[0_0_30px_rgba(217,70,239,0.3)] breathing-glow"
        >
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-70 mix-blend-overlay"></div>
          <div className="absolute inset-0 p-5 flex items-center justify-between">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <Users size={18} className="text-white" />
                <span className="text-white text-xs font-bold uppercase tracking-widest">Sosyal</span>
              </div>
              <h2 className="text-3xl font-black text-white italic uppercase leading-none drop-shadow-md">Topluluk<br />Keşfet</h2>
              <p className="text-[10px] text-fuchsia-200 mt-1 font-bold">Üniversite ve şirket ligleri.</p>
            </div>
            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border-4 border-white/20 group-hover:scale-110 transition-transform">
              <Users size={40} className="text-white" />
            </div>
          </div>
        </AnimatedButton>

        {/* 6. Studio Box (FULL WIDTH) */}
        <AnimatedButton
          as="div"
          variants={itemVariants}
          onClick={() => onNavigate('STUDIO')}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          className="col-span-2 h-44 bg-[#050812] rounded-[32px] relative overflow-hidden group cursor-pointer border border-[#39FF14]/30 shadow-[0_0_30px_rgba(57,255,20,0.05)] flex flex-col justify-between p-6 breathing-glow"
        >
          {/* Soccer Pitch Background Pattern */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
              <rect x="0" y="0" width="100" height="100" fill="none" stroke="#39FF14" strokeWidth="0.5" />
              <line x1="50" y1="0" x2="50" y2="100" stroke="#39FF14" strokeWidth="0.5" />
              <circle cx="50" cy="50" r="15" fill="none" stroke="#39FF14" strokeWidth="0.5" />
              <rect x="0" y="30" width="15" height="40" fill="none" stroke="#39FF14" strokeWidth="0.5" />
              <rect x="85" y="30" width="15" height="40" fill="none" stroke="#39FF14" strokeWidth="0.5" />
            </svg>
          </div>

          <div className="flex justify-between items-start relative z-10">
            <motion.div
              animate={{
                rotate: [0, 10, -10, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ duration: 5, repeat: Infinity }}
              className="w-14 h-14 bg-[#39FF14]/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-[#39FF14] border border-[#39FF14]/20"
            >
              <Target size={28} />
            </motion.div>
            <div className="flex -space-x-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-[#050812] bg-[#161B22] flex items-center justify-center overflow-hidden">
                  <img src={`https://i.pravatar.cc/100?u=player${i}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              ))}
              <div className="w-8 h-8 rounded-full border-2 border-[#050812] bg-[#39FF14] flex items-center justify-center text-[10px] font-black text-black">
                +8
              </div>
            </div>
          </div>

          <div className="relative z-10 flex justify-between items-end">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={14} className="text-[#39FF14]" />
                <p className="text-[10px] text-[#39FF14] font-black uppercase tracking-[0.2em]">Strateji & Analiz</p>
              </div>
              <h2 className="text-3xl font-black text-white italic leading-none">TAKTIK STUDIO</h2>
            </div>
            <motion.div
              animate={{ x: [0, 5, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="bg-[#39FF14] text-black p-3 rounded-2xl shadow-[0_0_20px_rgba(57,255,20,0.4)]"
            >
              <MousePointer2 size={20} />
            </motion.div>
          </div>
        </AnimatedButton>
      </motion.main>

      
    </div>
  );
};

export default Dashboard;
