import React, { useState, useRef, useEffect } from 'react';
import { UserRole, AppView } from '../types';
import { Shield, Scale, Building2, User, Mail, Smartphone, ArrowLeft, ArrowRight, Target, Check, Activity, Fingerprint, Clock } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { auth } from '../supabaseAuth';
import { updateUserRoles } from '../services/userService';

// ─── Custom Football SVG Icon (Perfected Geometry)
const FootballIcon = ({ size = 24, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className}>
    <defs>
      <clipPath id="ball-clip">
        <circle cx="50" cy="50" r="45" />
      </clipPath>
    </defs>
    
    <g clipPath="url(#ball-clip)">
      {/* Center pentagon (Empty) */}
      <polygon points="50,26 71,42 63,66 37,66 29,42" fill="transparent" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
      
      {/* Connecting lines */}
      <line x1="50" y1="26" x2="50" y2="10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <line x1="71" y1="42" x2="86" y2="37" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <line x1="63" y1="66" x2="77" y2="79" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <line x1="37" y1="66" x2="23" y2="79" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <line x1="29" y1="42" x2="14" y2="37" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />

      {/* Edge partial pentagons (extended outward to be perfectly clipped) */}
      {/* Top - Empty */}
      <polygon points="50,10 70,-5 30,-5" fill="transparent" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      {/* Top-Right - Empty */}
      <polygon points="86,37 105,20 100,60" fill="transparent" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      {/* Bottom-Right - Filled */}
      <polygon points="77,79 100,95 65,105" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" opacity="0.95" />
      {/* Bottom-Left - Empty */}
      <polygon points="23,79 0,95 35,105" fill="transparent" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      {/* Top-Left - Filled */}
      <polygon points="14,37 -5,20 0,60" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" opacity="0.95" />
    </g>

    {/* Base outline (drawn last to smoothly cover clipped edges) */}
    <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="6" fill="transparent" />
  </svg>
);

interface RoleSelectionProps {
  onSelect: (role: UserRole, data?: any) => void;
  onBack: () => void;
  onPartnerInvite?: () => void;
  onNavigate?: (view: AppView) => void;
}

// ─── Animated Particle orb ───────────────────────────────────────────────────
const FloatingOrb = ({ color, size, x, y, duration }: { color: string; size: number; x: string; y: string; duration: number }) => (
  <motion.div
    className={`absolute rounded-full pointer-events-none`}
    style={{ width: size, height: size, left: x, top: y, background: color, filter: `blur(${size * 0.6}px)` }}
    animate={{ y: [0, -30, 0], opacity: [0.15, 0.35, 0.15], scale: [1, 1.2, 1] }}
    transition={{ duration, repeat: Infinity, ease: 'easeInOut' }}
  />
);

// --- HERO CARD COMPONENT ---
const RoleHeroCard: React.FC<{ 
  role: UserRole;
  title: string; 
  subtitle: string;
  icon: React.ReactNode; 
  glowColor: string;
  gradientFrom: string;
  gradientTo: string;
  borderActive: string;
  iconBg: string;
  onComplete: () => void;
  delayMs: number;
}> = ({ role, title, subtitle, icon, glowColor, gradientFrom, gradientTo, borderActive, iconBg, onComplete, delayMs }) => {
  const [isEntering, setIsEntering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const getRoleLabel = (r: UserRole) => {
    if (r === UserRole.PLAYER) return 'OYUNCU KİMLİĞİ';
    if (r === UserRole.GOALKEEPER) return 'KALECİ KİMLİĞİ';
    if (r === UserRole.REFEREE) return 'HAKEM KİMLİĞİ';
    if (r === UserRole.OWNER) return 'SAHİP PANELİ';
    return `${r} ID`;
  };

  const handleEntry = () => {
    if (isEntering) return;
    setIsEntering(true);
    if (navigator.vibrate) navigator.vibrate(15);
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 22 + 12;
      if (p >= 100) {
        p = 100; clearInterval(iv); setProgress(100);
        if (navigator.vibrate) navigator.vibrate([40, 80, 180]);
        setTimeout(onComplete, 280);
      } else { setProgress(p); }
    }, 35);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 32, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: isEntering ? 0.97 : 1 }}
      transition={{
        opacity: { duration: 0.5, delay: delayMs / 1000 },
        y: { type: 'spring', stiffness: 280, damping: 24, delay: delayMs / 1000 },
        scale: { type: 'spring', stiffness: 400, damping: 22 }
      }}
      onClick={handleEntry}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="group relative w-full rounded-[28px] overflow-hidden cursor-pointer select-none" style={{ minHeight: 112,
        boxShadow: isHovered || isEntering
          ? `0 0 0 1.5px ${glowColor}80, 0 8px 40px ${glowColor}30, inset 0 1px 0 rgba(255,255,255,0.06)`
          : '0 0 0 1px rgba(255,255,255,0.07), 0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        transition: 'box-shadow 0.35s ease'
      }}
    >
      {/* Glass base */}
      <div className="absolute inset-0" style={{
        background: `linear-gradient(135deg, ${gradientFrom} 0%, #0d1420 60%, ${gradientTo} 100%)`,
        opacity: isHovered ? 1 : 0.88,
        transition: 'opacity 0.35s ease'
      }} />

      {/* Progress fill */}
      <motion.div
        className="absolute inset-0 origin-left"
        style={{
          scaleX: progress / 100,
          background: `linear-gradient(90deg, ${glowColor}18, ${glowColor}40)`
        }}
        transition={{ duration: 0.05 }}
      />

      {/* Animated scan line on hover */}
      <AnimatePresence>
        {isHovered && !isEntering && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeInOut' }}
            className="absolute inset-y-0 w-1/3 pointer-events-none"
            style={{ background: `linear-gradient(90deg, transparent, ${glowColor}25, transparent)` }}
          />
        )}
      </AnimatePresence>

      {/* Giant watermark icon */}
      <motion.div
        className="absolute -right-3 -bottom-3 pointer-events-none"
        animate={{ rotate: isHovered ? 8 : 0, scale: isHovered ? 1.12 : 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        style={{ color: glowColor, opacity: isHovered ? 0.12 : 0.06 }}
      >
        {React.cloneElement(icon as React.ReactElement<any>, { size: 130 })}
      </motion.div>

      {/* Content row */}
      <div className="absolute inset-0 px-5 flex items-center gap-4 z-10">
        {/* Icon box */}
        <motion.div
          animate={{ scale: isEntering ? 0.9 : isHovered ? 1.08 : 1 }}
          transition={{ type: 'spring', stiffness: 350, damping: 22 }}
          className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{
            background: iconBg,
            boxShadow: isHovered ? `0 0 18px ${glowColor}50` : `0 0 0 1px ${glowColor}25`,
            color: glowColor
          }}
        >
          {React.cloneElement(icon as React.ReactElement<any>, { size: 24, strokeWidth: 2.2 })}
        </motion.div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-[8.5px] font-black uppercase tracking-[0.25em] mb-0.5" style={{ color: glowColor, opacity: 0.75 }}>{getRoleLabel(role)}</p>
          <motion.h2
            animate={{ x: isEntering ? 6 : 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="text-[22px] font-black text-white italic tracking-tight leading-none mb-1"
          >{title}</motion.h2>
          <p className="text-[10.5px] text-gray-300 font-medium leading-snug" style={{ maxWidth: 200 }}>{subtitle}</p>
        </div>

        {/* Right indicator */}
        <div className="shrink-0">
          {isEntering ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 rounded-full border-2 border-transparent"
              style={{ borderTopColor: glowColor }}
            />
          ) : (
            <motion.div
              animate={{ x: isHovered ? 3 : 0 }}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{
                background: isHovered ? `${glowColor}20` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isHovered ? glowColor + '60' : 'rgba(255,255,255,0.1)'}`,
                color: isHovered ? glowColor : 'rgba(255,255,255,0.3)',
                transition: 'all 0.25s ease'
              }}
            >
              <ArrowRight size={15} />
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ─── GK/Ref onay bekleniyor modal ─────────────────────────────────────────────
const PendingApprovalModal: React.FC<{ onConfirm: () => void }> = ({ onConfirm }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-6"
  >
    <motion.div
      initial={{ scale: 0.85, opacity: 0, y: 30 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.85, opacity: 0, y: 30 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className="w-full max-w-sm rounded-[28px] p-6 text-center"
      style={{
        background: 'linear-gradient(180deg, rgba(22,27,34,0.95) 0%, rgba(10,14,20,0.98) 100%)',
        border: '1px solid rgba(255,255,0,0.15)',
      }}
    >
      <motion.div
        animate={{ scale: [1, 1.1, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ background: 'rgba(255,255,0,0.1)', border: '2px solid rgba(255,255,0,0.25)' }}
      >
        <Clock size={32} className="text-[#FFFF00]" />
      </motion.div>
      <h3 className="text-xl font-black text-white italic mb-2">Profilin İncelemeye Alındı</h3>
      <p className="text-sm text-gray-300 leading-relaxed mb-6">
        Kaleci/Hakem profilleri güvenlik için admin onayı gerektirir.
        Profilin genellikle <span className="text-[#FFFF00] font-bold">24 saat</span> içinde incelenir.
        Onaylandığında sana bildirim göndereceğiz.
      </p>
      <button
        onClick={onConfirm}
        className="w-full h-12 rounded-2xl font-black text-sm bg-[#FFFF00] text-black"
      >
        Tamam, Anladım
      </button>
    </motion.div>
  </motion.div>
);

const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelect, onBack, onPartnerInvite, onNavigate }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Role, 2: Contact, 3: Physical
  const [isVerifying, setIsVerifying] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);

  // Data States
  const [formData, setFormData] = useState({
      fullName: '',
      phone: '',
      email: '',
      tcNumber: '', // Added for Ref/Owner
      age: '',
      height: '',
      weight: '',
      position: ''
  });

  const handleCardClick = (role: UserRole) => {
    setSelectedRole(role);
    if (role === UserRole.PLAYER) {
      // Oyuncu için kimlik bilgileri ve fiziksel künye adımları kaldırıldı.
      // Oyuncu doğrudan kayıt/giriş akışına yönlendirilir.
      onSelect(role);
      return;
    }
    setStep(2);
  };

  const handleBack = () => {
    if (step === 3) {
        setStep(2);
    } else if (step === 2) {
        setStep(1);
        setSelectedRole(null);
    } else {
        onBack();
    }
  };

  // Determine if this is a "Professional" role (Ref/Owner) that skips physical attributes
  const isProfessionalRole = selectedRole === UserRole.REFEREE || selectedRole === UserRole.OWNER;

  const handleNextAction = () => {
      if (isProfessionalRole) {
          // For Pros: Step 2 is the final step. Validate TC & Phone then complete.
          if (formData.tcNumber && formData.phone) {
              handleComplete();
          }
      } else {
          // For Players: Go to Step 3 (Physical Attributes)
          if (formData.fullName && formData.phone) {
              setStep(3);
          }
      }
  };

  const handleComplete = async () => {
    if (!selectedRole) return;
    setIsVerifying(true);
    try {
      const userId = auth.currentUser?.uid;
      if (userId) {
        await updateUserRoles(userId, selectedRole, [selectedRole]);
      }

      // GK veya Ref — admin onayı gerekir
      if (selectedRole === UserRole.GOALKEEPER || selectedRole === UserRole.REFEREE) {
        setIsVerifying(false);
        setShowPendingModal(true);
        return;
      }

      // Diğer roller — normal akış
      setTimeout(() => {
        onSelect(selectedRole, formData);
      }, 400);
    } catch (err) {
      console.error('[RoleSelection] Rol güncelleme hatası:', err);
      // Hata olsa bile devam et
      setTimeout(() => {
        onSelect(selectedRole, formData);
      }, 400);
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePendingConfirm = () => {
    setShowPendingModal(false);
    // PENDING_VERIFICATION ekranına yönlendir
    if (onNavigate) {
      onNavigate('PENDING_VERIFICATION');
    }
  };

  const getRoleTheme = () => {
      switch(selectedRole) {
          case UserRole.OWNER: return { color: 'text-blue-400', border: 'border-blue-500', bg: 'bg-blue-600' };
          case UserRole.REFEREE: return { color: 'text-red-500', border: 'border-red-500', bg: 'bg-red-600' };
          case UserRole.GOALKEEPER: return { color: 'text-green-400', border: 'border-green-500', bg: 'bg-green-600' };
          default: return { color: 'text-[#FFFF00]', border: 'border-[#FFFF00]', bg: 'bg-[#FFFF00]' };
      }
  };

  const positions = ['Forvet', 'Orta Saha', 'Defans', 'Kaleci', 'Libero'];
  const theme = getRoleTheme();

  // ─── GK/Ref pending modal'ı her step'te render edilmeli ──────────────────────
  const pendingModal = (
    <AnimatePresence>
      {showPendingModal && (
        <PendingApprovalModal onConfirm={handlePendingConfirm} />
      )}
    </AnimatePresence>
  );

  // --- STEP 2 & 3 CONTAINER ---
  if (step > 1) {
    return (
      <>
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0A0E14] relative overflow-hidden">
         {/* Background Grid */}
         <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
         
         {/* Dynamic Glow */}
         <div className={`absolute top-[-20%] right-[-20%] w-[500px] h-[500px] blur-[150px] rounded-full opacity-20 pointer-events-none ${theme.bg}`}></div>

         <div className="w-full max-w-md bg-[#161B22]/90 backdrop-blur-2xl rounded-[40px] border border-white/10 p-8 relative shadow-2xl z-10">
            
            {/* Header / Back */}
            <div className="flex justify-between items-center mb-8">
                <button onClick={handleBack} className="p-3 bg-[#0A0E14] rounded-full text-white border border-white/5 hover:border-white/20 transition-colors">
                   <ArrowLeft size={20} />
                </button>
                <div className="flex items-center gap-2">
                    {/* Progress Dots */}
                    <div className={`h-1.5 w-12 rounded-full transition-colors ${step === 2 ? theme.bg : 'bg-gray-800'}`}></div>
                    {!isProfessionalRole && (
                        <div className={`h-1.5 w-12 rounded-full transition-colors ${step === 3 ? theme.bg : 'bg-gray-800'}`}></div>
                    )}
                </div>
                <div className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-[#0A0E14] border ${theme.border} ${theme.color}`}>
                    {selectedRole}
                </div>
            </div>
            
            <div className="mb-8">
                <h2 className="text-3xl font-black text-white italic tracking-tight">
                    {step === 2 ? (isProfessionalRole ? 'HIZLI DOĞRULAMA' : 'KİMLİK BİLGİLERİ') : 'FİZİKSEL KÜNYE'}
                </h2>
                <p className="text-gray-400 text-xs mt-2 font-medium">
                    {step === 2 
                        ? (isProfessionalRole ? 'Ödeme ve güvenlik işlemleri için gereklidir.' : 'Seni tanımamız ve iletişime geçebilmemiz için gerekli.') 
                        : 'Saha profilini ve oyuncu kartını oluşturuyoruz.'}
                </p>
            </div>

            {/* --- STEP 2: CONTACT / IDENTITY INFO --- */}
            {step === 2 && (
                <div className="space-y-5">
                    
                    {isProfessionalRole ? (
                        <>
                            <div className="group">
                                <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block ml-1 group-focus-within:text-white transition-colors">TC Kimlik Numarası</label>
                                <div className="bg-[#0A0E14] border border-gray-800 p-4 rounded-2xl flex items-center gap-3 focus-within:border-white/40 transition-colors">
                                    <Fingerprint size={20} className="text-gray-500 group-focus-within:text-white transition-colors" />
                                    <input 
                                        type="tel" 
                                        maxLength={11}
                                        value={formData.tcNumber}
                                        onChange={(e) => setFormData({...formData, tcNumber: e.target.value.replace(/[^0-9]/g, '')})}
                                        className="bg-transparent w-full outline-none text-white text-base font-bold placeholder:text-gray-700 tracking-widest font-mono"
                                        placeholder="12345678901"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="group">
                                <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block ml-1 group-focus-within:text-white transition-colors">Telefon Numarası</label>
                                <div className="bg-[#0A0E14] border border-gray-800 p-4 rounded-2xl flex items-center gap-3 focus-within:border-white/40 transition-colors">
                                    <Smartphone size={20} className="text-gray-500 group-focus-within:text-white transition-colors" />
                                    <input 
                                        type="tel" 
                                        value={formData.phone}
                                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                        className="bg-transparent w-full outline-none text-white text-base font-bold placeholder:text-gray-700"
                                        placeholder="5XX XXX XX XX"
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="group">
                                <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block ml-1 group-focus-within:text-white transition-colors">Ad Soyad</label>
                                <div className="bg-[#0A0E14] border border-gray-800 p-4 rounded-2xl flex items-center gap-3 focus-within:border-white/40 transition-colors">
                                    <User size={20} className="text-gray-500 group-focus-within:text-white transition-colors" />
                                    <input 
                                        type="text" 
                                        value={formData.fullName}
                                        onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                                        className="bg-transparent w-full outline-none text-white text-base font-bold placeholder:text-gray-700"
                                        placeholder="Örn: Burak Yılmaz"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="group">
                                <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block ml-1 group-focus-within:text-white transition-colors">E-Posta Adresi</label>
                                <div className="bg-[#0A0E14] border border-gray-800 p-4 rounded-2xl flex items-center gap-3 focus-within:border-white/40 transition-colors">
                                    <Mail size={20} className="text-gray-500 group-focus-within:text-white transition-colors" />
                                    <input 
                                        type="email" 
                                        value={formData.email}
                                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                                        className="bg-transparent w-full outline-none text-white text-base font-bold placeholder:text-gray-700"
                                        placeholder="ornek@oyna.app"
                                    />
                                </div>
                            </div>

                            <div className="group">
                                <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block ml-1 group-focus-within:text-white transition-colors">Telefon Numarası</label>
                                <div className="bg-[#0A0E14] border border-gray-800 p-4 rounded-2xl flex items-center gap-3 focus-within:border-white/40 transition-colors">
                                    <Smartphone size={20} className="text-gray-500 group-focus-within:text-white transition-colors" />
                                    <input 
                                        type="tel" 
                                        value={formData.phone}
                                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                        className="bg-transparent w-full outline-none text-white text-base font-bold placeholder:text-gray-700"
                                        placeholder="5XX XXX XX XX"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    <button 
                       onClick={handleNextAction}
                       disabled={isProfessionalRole ? (!formData.tcNumber || !formData.phone || isVerifying) : (!formData.fullName || !formData.phone)}
                       className={`w-full h-16 mt-6 rounded-2xl font-black text-lg shadow-xl flex items-center justify-center gap-3 transition-all relative overflow-hidden
                       ${(isProfessionalRole ? (!formData.tcNumber || !formData.phone || isVerifying) : (!formData.fullName || !formData.phone))
                           ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                           : `${theme.bg} text-white hover:scale-[1.02] active:scale-95`
                       }`}
                    >
                        {isVerifying ? (
                           <>
                               <Activity size={20} className="animate-spin" /> DOĞRULANIYOR...
                           </>
                       ) : (
                           <>
                               {isProfessionalRole ? 'KAYDI TAMAMLA' : 'DEVAM ET'} <ArrowRight size={20} />
                           </>
                       )}
                    </button>
                </div>
            )}

            {/* --- STEP 3: PHYSICAL & POSITION (ONLY FOR PLAYERS) --- */}
            {!isProfessionalRole && step === 3 && (
                <div className="space-y-8">
                    
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-[#0A0E14] border border-gray-800 p-4 rounded-[24px] flex flex-col items-center justify-center gap-2 focus-within:border-white/40 transition-colors relative overflow-hidden group">
                            <div className={`absolute top-0 left-0 w-full h-1 ${theme.bg} opacity-0 group-focus-within:opacity-100 transition-opacity`}></div>
                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">YAŞ</span>
                            <input 
                                type="number" 
                                placeholder="25"
                                value={formData.age}
                                onChange={(e) => setFormData({...formData, age: e.target.value})} 
                                className="bg-transparent w-full outline-none text-white text-center font-black text-3xl placeholder:text-gray-800"
                            />
                        </div>
                        <div className="bg-[#0A0E14] border border-gray-800 p-4 rounded-[24px] flex flex-col items-center justify-center gap-2 focus-within:border-white/40 transition-colors relative overflow-hidden group">
                            <div className={`absolute top-0 left-0 w-full h-1 ${theme.bg} opacity-0 group-focus-within:opacity-100 transition-opacity`}></div>
                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">BOY</span>
                            <div className="flex items-baseline gap-0.5">
                                <input 
                                    type="number" 
                                    placeholder="178"
                                    value={formData.height}
                                    onChange={(e) => setFormData({...formData, height: e.target.value})} 
                                    className="bg-transparent w-16 outline-none text-white text-center font-black text-3xl placeholder:text-gray-800"
                                />
                                <span className="text-[10px] text-gray-500 font-bold">cm</span>
                            </div>
                        </div>
                        <div className="bg-[#0A0E14] border border-gray-800 p-4 rounded-[24px] flex flex-col items-center justify-center gap-2 focus-within:border-white/40 transition-colors relative overflow-hidden group">
                            <div className={`absolute top-0 left-0 w-full h-1 ${theme.bg} opacity-0 group-focus-within:opacity-100 transition-opacity`}></div>
                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">KİLO</span>
                            <div className="flex items-baseline gap-0.5">
                                <input 
                                    type="number" 
                                    placeholder="75"
                                    value={formData.weight}
                                    onChange={(e) => setFormData({...formData, weight: e.target.value})} 
                                    className="bg-transparent w-14 outline-none text-white text-center font-black text-3xl placeholder:text-gray-800"
                                />
                                <span className="text-[10px] text-gray-500 font-bold">kg</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2 mb-3 ml-1">
                            <Target size={14} className={theme.color} /> Pozisyon Tercihi
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            {positions.map(pos => (
                                <button
                                    key={pos}
                                    onClick={() => setFormData({...formData, position: pos})}
                                    className={`py-4 px-5 rounded-2xl text-xs font-black transition-all border flex items-center justify-between group ${
                                        formData.position === pos 
                                        ? `bg-white text-black border-white shadow-lg scale-[1.02]` 
                                        : 'bg-[#0A0E14] text-gray-500 border-gray-800 hover:border-gray-600 hover:text-gray-300'
                                    }`}
                                >
                                    {pos}
                                    {formData.position === pos && <Check size={16} className="text-black" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button 
                       onClick={handleComplete}
                       disabled={isVerifying}
                       className={`w-full h-16 mt-4 rounded-2xl font-black text-lg shadow-xl flex items-center justify-center gap-3 transition-all relative overflow-hidden
                       ${isVerifying 
                           ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                           : theme.color === 'text-[#FFFF00]' ? 'bg-[#FFFF00] text-black shadow-yellow-900/30 hover:scale-[1.02] active:scale-95' : `${theme.bg} text-white hover:scale-[1.02] active:scale-95`
                       }`}
                    >
                       {isVerifying ? (
                           <>
                               <Activity size={20} className="animate-spin" /> OLUŞTURULUYOR...
                           </>
                       ) : (
                           <>
                               KAYDI TAMAMLA <Check size={20} />
                           </>
                       )}
                    </button>
                </div>
            )}

         </div>
      </div>
      {pendingModal}
    </>
    );
  }

  // --- STEP 1: HERO SELECTION ---
  return (
    <div className="min-h-screen flex flex-col bg-[#060A12] relative overflow-hidden">
      
      {/* ── Animated ambient orbs ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <FloatingOrb color="#f59e0b" size={260} x="-80px" y="10%" duration={7} />
        <FloatingOrb color="#22c55e" size={200} x="60%" y="5%" duration={9} />
        <FloatingOrb color="#ef4444" size={180} x="20%" y="55%" duration={8} />
        <FloatingOrb color="#3b82f6" size={220} x="65%" y="60%" duration={10} />
        {/* Grid overlay */}
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '44px 44px'
        }} />
        {/* Vignette */}
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, #060A12 100%)'
        }} />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen w-full mx-auto max-w-lg px-4">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="pt-14 pb-8 text-center"
        >
          <motion.p
            initial={{ opacity: 0, letterSpacing: '0.5em' }}
            animate={{ opacity: 1, letterSpacing: '0.35em' }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="text-[9px] font-black uppercase text-white/30 mb-3 tracking-[0.35em]"
          >OYNA — ROL SEÇİMİ</motion.p>
          <motion.h1
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 22 }}
            className="text-[34px] font-black text-white leading-tight tracking-tight"
            style={{ textShadow: '0 2px 8px rgba(255,255,255,0.2)' }}
          >
            Kim olarak<br />sahaya çıkıyorsun?
          </motion.h1>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.5, duration: 0.8, ease: 'easeOut' }}
            className="mt-4 h-px mx-auto w-24"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)' }}
          />
        </motion.div>

        {/* ── Cards ── */}
        <div className="flex flex-col gap-3 pb-10">
          <RoleHeroCard
            role={UserRole.PLAYER}
            title="OYUNCU"
            subtitle="Maç yap, takıma katıl veya eksik tamamla."
            icon={<FootballIcon />}
            glowColor="#f59e0b"
            gradientFrom="rgba(120,60,0,0.55)"
            gradientTo="rgba(92,50,0,0.15)"
            borderActive="border-amber-400/60"
            iconBg="rgba(245,158,11,0.15)"
            onComplete={() => handleCardClick(UserRole.PLAYER)}
            delayMs={80}
          />
          <RoleHeroCard
            role={UserRole.GOALKEEPER}
            title="KALECİ"
            subtitle="Maç başı ücretini belirle, eldivenlerini konuştur."
            icon={<Shield />}
            glowColor="#22c55e"
            gradientFrom="rgba(0,80,30,0.55)"
            gradientTo="rgba(0,60,20,0.15)"
            borderActive="border-green-400/60"
            iconBg="rgba(34,197,94,0.15)"
            onComplete={() => handleCardClick(UserRole.GOALKEEPER)}
            delayMs={180}
          />
          <RoleHeroCard
            role={UserRole.REFEREE}
            title="HAKEM"
            subtitle="Adaleti sağla, yönettiğin maç başına kazan."
            icon={<Scale />}
            glowColor="#ef4444"
            gradientFrom="rgba(100,10,10,0.55)"
            gradientTo="rgba(80,0,0,0.15)"
            borderActive="border-red-500/60"
            iconBg="rgba(239,68,68,0.15)"
            onComplete={() => handleCardClick(UserRole.REFEREE)}
            delayMs={280}
          />
          <RoleHeroCard
            role={UserRole.OWNER}
            title="TESİS"
            subtitle="Sahanı listele, rezervasyonları yönet."
            icon={<Building2 />}
            glowColor="#3b82f6"
            gradientFrom="rgba(15,30,100,0.55)"
            gradientTo="rgba(10,20,80,0.15)"
            borderActive="border-blue-400/60"
            iconBg="rgba(59,130,246,0.15)"
            onComplete={() => handleCardClick(UserRole.OWNER)}
            delayMs={380}
          />
        </div>
      </div>

      {/* Admin panel artık standalone: /admin.html */}
      {pendingModal}
    </div>
  );
};

export default RoleSelection;