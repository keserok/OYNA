// ════════════════════════════════════════════════════════════════════════
// PAYLAŞILAN GÖRSEL SAHA — TEK KAYNAK
// Saf görsel futbol sahası: SVG çizgileri + x/y% ile konumlanmış slotlar.
// Hem tüketici hem admin AYNI bileşeni kullanır (drift yok). Aksiyonlar
// (ata/çıkar/seç) dışarıdan onSlotClick ile bağlanır.
// Slotlar ZENGİNLEŞTİRİLMİŞ gelmeli (shared/lobbyEnrichment.enrichSlots).
// ════════════════════════════════════════════════════════════════════════
import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Check, Clock, Crown } from 'lucide-react';
import type { PositionSlot } from '../types';
import { normalizeRole, roleShort, avatarFor } from './lobbyEnrichment';

export interface MatchPitchProps {
  slots: PositionSlot[];                 // enrichSlots'tan geçmiş (x/y/role basılı)
  activeSlotId?: string | null;
  onSlotClick?: (slot: PositionSlot) => void;
  showPayment?: boolean;                 // ödeme rozeti (yeşil ödedi / amber bekliyor)
  captainId?: string | null;             // kaptanı taçla işaretle
  readOnly?: boolean;                    // true => tıklama yok (yalnız görüntüle)
}

const takenRing = (role: string): string =>
  normalizeRole(role) === 'GK' ? 'border-orange-400' : 'border-white/25';

export const MatchPitch: React.FC<MatchPitchProps> = ({ slots, activeSlotId, onSlotClick, showPayment, captainId, readOnly }) => (
  <div
    className="relative w-full max-w-[360px] mx-auto rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
    style={{ aspectRatio: '600 / 1000', background: 'linear-gradient(165deg,#0c2a16 0%,#0a1f12 55%,#081a0f 100%)' }}
  >
    <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, #ffffff 0px, #ffffff 2px, transparent 2px, transparent 56px)' }} />
    <svg viewBox="0 0 600 1000" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <g stroke="rgba(255,255,255,0.35)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect x="10" y="10" width="580" height="980" />
        <line x1="10" y1="500" x2="590" y2="500" />
        <circle cx="300" cy="500" r="80" />
        <circle cx="300" cy="500" r="4" fill="rgba(255,255,255,0.35)" />
        <rect x="150" y="10" width="300" height="160" />
        <rect x="150" y="830" width="300" height="160" />
        <path d="M 220 170 A 80 80 0 0 0 380 170" />
        <path d="M 220 830 A 80 80 0 0 1 380 830" />
      </g>
    </svg>

    {slots.map((slot) => {
      const taken = slot.status === 'TAKEN' && !!slot.player;
      const isActive = activeSlotId === slot.id;
      const player = slot.player;
      const paid = player?.paymentStatus === 'PAID';
      const isCaptain = !!captainId && (player?.id === captainId);
      const clickable = !readOnly && !!onSlotClick;
      return (
        <div
          key={slot.id}
          className="absolute w-12 h-12 flex items-center justify-center z-10"
          style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%, -50%)' }}
        >
          <button
            type="button"
            disabled={!clickable}
            onClick={clickable ? () => onSlotClick!(slot) : undefined}
            className={`w-full h-full rounded-full focus:outline-none ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <motion.div whileHover={clickable ? { scale: 1.12 } : undefined} whileTap={clickable ? { scale: 0.9 } : undefined} className="relative w-full h-full flex flex-col items-center justify-center">
              {taken && player ? (
                <>
                  <div className={`relative w-12 h-12 rounded-full overflow-hidden border-2 shadow-lg transition-all ${takenRing(slot.role)} ${isActive ? 'ring-2 ring-primary shadow-[0_0_16px_rgba(57,255,20,0.7)]' : ''}`}>
                    <img src={player.avatar || avatarFor(player.id || slot.id, player.name)} alt={player.name || 'Oyuncu'} className="w-full h-full object-cover bg-bg" />
                  </div>
                  {/* Ödeme rozeti */}
                  {showPayment && (
                    <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border border-black shadow z-20 ${paid ? 'bg-primary text-black' : 'bg-amber-500 text-black'}`}>
                      {paid ? <Check size={11} strokeWidth={3} /> : <Clock size={10} strokeWidth={3} />}
                    </div>
                  )}
                  {isCaptain && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-yellow-400 z-20"><Crown size={12} fill="currentColor" /></div>
                  )}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-black/90 px-1.5 py-0.5 rounded-full border border-white/10 max-w-[64px] z-20 pointer-events-none">
                    <span className="text-[8px] font-black text-white whitespace-nowrap uppercase truncate block">{(player.name || 'Oyuncu').split(' ')[0]}</span>
                  </div>
                </>
              ) : (
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 shadow-lg transition-all relative backdrop-blur-md ${
                  isActive ? 'bg-primary border-white text-black shadow-[0_0_22px_rgba(57,255,20,0.85)] scale-110' : 'bg-black/45 border-white/25 text-white/70 hover:border-primary/60'
                }`}>
                  <span className="text-[10px] font-black uppercase tracking-wider leading-none">{roleShort(slot.role)}</span>
                  {clickable && (
                    <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-black flex items-center justify-center border border-black shadow-md z-20 ${isActive ? 'bg-white' : 'bg-primary'}`}>
                      <Plus size={9} strokeWidth={3} />
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </button>
        </div>
      );
    })}
  </div>
);
