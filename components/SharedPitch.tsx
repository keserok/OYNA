import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';

export interface PitchPlayer {
  id: string;
  name: string;
  avatar?: string;
  role?: string;
}

export interface PitchSlot {
  id: string;
  x: number;
  y: number;
  role: string;
  player?: PitchPlayer;
  status?: 'PENDING' | 'CONFIRMED';
}

interface SharedPitchProps {
  mode: 'create' | 'join' | 'edit' | 'view';
  slots: PitchSlot[];
  orientation?: 'vertical' | 'horizontal';
  onSlotClick?: (slotId: string) => void;
  onSlotMove?: (slotId: string, x: number, y: number) => void;
  onDropPlayer?: (slotId: string, player: PitchPlayer) => void;
}

const SharedPitch: React.FC<SharedPitchProps> = ({ mode, slots, orientation = 'vertical', onSlotClick, onSlotMove, onDropPlayer }) => {
  const pitchRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<string | null>(null);
  const startPosRef = useRef<{x: number, y: number} | null>(null);

  React.useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!draggingRef.current || !pitchRef.current || !onSlotMove) return;
      if (startPosRef.current) {
         const dx = e.clientX - startPosRef.current.x;
         const dy = e.clientY - startPosRef.current.y;
         if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      }
      
      const rect = pitchRef.current.getBoundingClientRect();
      const x = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
      
      onSlotMove(draggingRef.current, x, y);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (draggingRef.current) {
          if (startPosRef.current) {
              const dx = e.clientX - startPosRef.current.x;
              const dy = e.clientY - startPosRef.current.y;
              if (Math.abs(dx) < 5 && Math.abs(dy) < 5 && onSlotClick) {
                  onSlotClick(draggingRef.current);
              }
          }
          draggingRef.current = null;
          startPosRef.current = null;
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [onSlotMove, onSlotClick]);

  const onPointerDown = (e: React.PointerEvent, slotId: string) => {
    if ((e.target as HTMLElement).tagName === 'IMG' || (e.target as HTMLElement).tagName === 'DIV') {
       e.preventDefault();
    }
    draggingRef.current = slotId;
    startPosRef.current = { x: e.clientX, y: e.clientY };
  };

  return (
      <div
        ref={pitchRef}
        className={`relative w-full ${orientation === 'horizontal' ? 'aspect-[4/3]' : 'aspect-[3/4]'} bg-[#0B2815] rounded-[24px] border-4 border-[#161B22] shadow-[inset_0_0_60px_rgba(0,0,0,0.8)] overflow-hidden transition-all duration-300`}
      >
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 10%, rgba(0,0,0,0.2) 10%, rgba(0,0,0,0.2) 20%)' }}></div>
        <div className="absolute inset-0 pointer-events-none opacity-40">
            {orientation === 'vertical' ? (
                <svg viewBox="0 0 600 1000" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                    <g stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        {/* Dış Çizgiler */}
                        <rect x="10" y="10" width="580" height="980" />
                        {/* Orta Çizgi */}
                        <line x1="10" y1="500" x2="590" y2="500" />
                        {/* Orta Yuvarlak */}
                        <circle cx="300" cy="500" r="80" />
                        <circle cx="300" cy="500" r="4" fill="white" />
                        
                        {/* Üst Ceza Sahası */}
                        <rect x="150" y="10" width="300" height="160" />
                        <circle cx="300" cy="130" r="4" fill="white" />
                        <path d="M 220 170 A 80 80 0 0 0 380 170" />
                        
                        {/* Alt Ceza Sahası */}
                        <rect x="150" y="830" width="300" height="160" />
                        <circle cx="300" cy="870" r="4" fill="white" />
                        <path d="M 220 830 A 80 80 0 0 1 380 830" />

                        {/* Köşe Vuruşu Yayları */}
                        <path d="M 10 40 A 30 30 0 0 0 40 10" />
                        <path d="M 560 10 A 30 30 0 0 0 590 40" />
                        <path d="M 10 960 A 30 30 0 0 1 40 990" />
                        <path d="M 590 960 A 30 30 0 0 0 560 990" />
                    </g>
                </svg>
            ) : (
                <svg viewBox="0 0 1000 600" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                    <g stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        {/* Dış Çizgiler */}
                        <rect x="10" y="10" width="980" height="580" />
                        {/* Orta Çizgi */}
                        <line x1="500" y1="10" x2="500" y2="590" />
                        {/* Orta Yuvarlak */}
                        <circle cx="500" cy="300" r="80" />
                        <circle cx="500" cy="300" r="4" fill="white" />
                        
                        {/* Sol Ceza Sahası */}
                        <rect x="10" y="150" width="160" height="300" />
                        <circle cx="130" cy="300" r="4" fill="white" />
                        <path d="M 170 220 A 80 80 0 0 1 170 380" />
                        
                        {/* Sağ Ceza Sahası */}
                        <rect x="830" y="150" width="160" height="300" />
                        <circle cx="870" cy="300" r="4" fill="white" />
                        <path d="M 830 220 A 80 80 0 0 0 830 380" />

                        {/* Köşe Vuruşu Yayları */}
                        <path d="M 40 10 A 30 30 0 0 0 10 40" />
                        <path d="M 960 10 A 30 30 0 0 1 990 40" />
                        <path d="M 40 590 A 30 30 0 0 1 10 560" />
                        <path d="M 960 590 A 30 30 0 0 0 990 560" />
                    </g>
                </svg>
            )}
        </div>

        {slots.map(slot => (
          <div
            key={slot.id}
            onPointerDown={e => onPointerDown(e, slot.id)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const data = e.dataTransfer.getData('application/json');
              if (data && onDropPlayer) {
                 onDropPlayer(slot.id, JSON.parse(data));
              }
            }}
            className="absolute z-20 cursor-grab active:cursor-grabbing touch-none group"
            style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%, -50%)' }}
          >
            <div className="relative flex flex-col items-center">
              {slot.status === 'PENDING' && (
                <motion.div 
                  className="absolute inset-[-6px] rounded-full border border-dashed border-[#FACC15]/80 opacity-70 pointer-events-none"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                />
              )}
              {slot.player ? (
                <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className={`relative w-12 h-12 rounded-full border-2 flex items-center justify-center shadow-[0_4px_15px_rgba(0,0,0,0.5)] transition-all ${slot.status === 'PENDING' ? 'opacity-80 grayscale-[30%] border-[#FACC15]/50' : slot.role === 'GK' || slot.role === 'KL' ? 'bg-gradient-to-br from-orange-400 to-orange-600 border-orange-300' : 'bg-gradient-to-br from-[#1e2532] to-[#11151c] border-[#FACC15]/50'}`}
                >
                    {slot.player.avatar ? (
                        <img src={slot.player.avatar} className="w-full h-full rounded-full object-cover" alt={slot.player.name}/>
                    ) : (
                        <span className="text-white font-extrabold text-sm drop-shadow-md">{slot.player.name.charAt(0)}</span>
                    )}
                </motion.div>
              ) : (
                <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className={`relative w-12 h-12 rounded-full border-2 border-dashed flex items-center justify-center bg-black/20 backdrop-blur-sm transition-colors group-hover:border-[#39FF14] group-hover:bg-[#39FF14]/20 ${mode === 'join' ? 'border-[#39FF14]/50 text-[#39FF14] animate-pulse' : slot.role === 'GK' || slot.role === 'KL' ? 'border-orange-500/50 text-orange-500 hover:border-orange-400' : 'border-[#39FF14]/50 text-[#39FF14]/70 hover:border-[#39FF14]'}`}
                >
                    <Plus size={20} />
                </motion.div>
              )}

              {slot.player ? (
                 <div className="absolute top-full mt-1 flex flex-col items-center pointer-events-none">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${slot.status === 'PENDING' ? 'bg-[#FACC15]/20 text-[#FACC15] border-[#FACC15]/50' : 'bg-black/80 text-white border-white/10'} whitespace-nowrap border shadow-sm`}>
                        {slot.status === 'PENDING' ? '⏳ ' : ''}{slot.player.name.split(' ')[0]}
                    </span>
                 </div>
              ) : (
                 <div className="absolute top-full mt-1 flex flex-col items-center pointer-events-none">
                    <span className="text-[8px] font-extrabold tracking-widest px-1.5 py-0.5 rounded bg-black/50 text-gray-400 whitespace-nowrap">
                        {slot.role}
                    </span>
                 </div>
              )}
            </div>
          </div>
        ))}
      </div>
  );
};

export default SharedPitch;
