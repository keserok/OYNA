import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Calendar, Clock, CreditCard, CheckCircle2, Layers } from 'lucide-react';
import type { Pitch, Court, SavedPaymentCard } from '../types';
import { parseSlotLabel } from '../services/availabilityService';
import { auth } from '../supabaseAuth';
import { supabase } from '../supabaseClient';
import { Particles } from './Particles';

type CheckoutStep = 'CONFIRM' | 'PROCESSING' | 'SUCCESS';

interface PitchDepositCheckoutProps {
  open: boolean;
  onClose: () => void;
  pitch: Pitch;
  court: Court;
  bookingDateISO: string;
  slotLabel: string;
  price: number;
  deposit: number;
  card: SavedPaymentCard;
  onSuccess: () => void;
}

function formatBookingDate(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
}

const PitchDepositCheckout: React.FC<PitchDepositCheckoutProps> = ({
  open,
  onClose,
  pitch,
  court,
  bookingDateISO,
  slotLabel,
  price,
  deposit,
  card,
  onSuccess,
}) => {
  const [step, setStep] = useState<CheckoutStep>('CONFIRM');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (open) {
      setStep('CONFIRM');
      setError(null);
      setProgress(0);
    }
  }, [open]);

  useEffect(() => {
    if (step !== 'PROCESSING') return;
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 4, 92));
    }, 60);
    return () => clearInterval(interval);
  }, [step]);

  const createBooking = async () => {
    const { startTime, endTime } = parseSlotLabel(slotLabel);
    const { error: rpcError } = await supabase.rpc('create_pitch_booking', {
      p_pitch_id: pitch.id,
      p_court_id: court.id,
      p_booking_date: bookingDateISO,
      p_start_time: `${startTime}:00`,
      p_end_time: `${endTime}:00`,
      p_source: 'APP_BOOKING',
      p_title: auth.currentUser?.email ? auth.currentUser.email.split('@')[0] : 'Kullanıcı',
    });
    if (rpcError) throw rpcError;
  };

  const handleConfirm = async () => {
    setError(null);
    setStep('PROCESSING');
    try {
      await new Promise((r) => setTimeout(r, 400));
      await createBooking();
      setProgress(100);
      await new Promise((r) => setTimeout(r, 700));
      setStep('SUCCESS');
      await new Promise((r) => setTimeout(r, 1600));
      onSuccess();
    } catch (e) {
      console.error('PitchDepositCheckout:', e);
      setStep('CONFIRM');
      setError(e instanceof Error ? e.message : 'Ödeme alınamadı. Lütfen tekrar deneyin.');
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-[#0A0E14]"
      >
        {/* Kapat — sol üst */}
        {step === 'CONFIRM' && (
          <button
            onClick={onClose}
            className="absolute top-0 left-0 z-20 m-5 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 border border-white/10 text-white hover:bg-white/20 transition-all"
            aria-label="Kapat"
          >
            <X size={22} />
          </button>
        )}

        {/* ONAY EKRANI */}
        {step === 'CONFIRM' && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col h-full px-6 pt-20 pb-36"
          >
            <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full">
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.25em] mb-6">
                Rezervasyon Özeti
              </p>

              <div className="w-full rounded-[28px] overflow-hidden border border-white/10 bg-[#161B22] shadow-2xl mb-8">
                <div className="h-28 relative">
                  <img src={pitch.image} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#161B22] to-transparent" />
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <h2 className="text-xl font-black text-white leading-tight">{pitch.name}</h2>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                      <MapPin size={12} className="text-[#39FF14]" /> {pitch.district}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-black/30 rounded-2xl p-3 border border-white/5">
                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1 mb-1">
                        <Layers size={10} /> Saha
                      </p>
                      <p className="text-sm font-bold text-white">{court.name}</p>
                    </div>
                    <div className="bg-black/30 rounded-2xl p-3 border border-white/5">
                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1 mb-1">
                        <Calendar size={10} /> Tarih
                      </p>
                      <p className="text-sm font-bold text-white capitalize">{formatBookingDate(bookingDateISO)}</p>
                    </div>
                  </div>
                  <div className="bg-[#FFFF00]/10 border border-[#FFFF00]/30 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-black text-[#FFFF00] uppercase tracking-widest flex items-center gap-1">
                        <Clock size={10} /> Saat
                      </p>
                      <p className="text-lg font-black text-white mt-0.5">{slotLabel}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-gray-400 uppercase tracking-widest">Saatlik</p>
                      <p className="text-sm font-black text-white">{price}₺</p>
                    </div>
                  </div>
                </div>
              </div>

              <h3 className="text-2xl font-black text-white text-center tracking-tight">
                Onaylıyor musunuz?
              </h3>
              <p className="text-sm text-gray-400 text-center mt-2 leading-relaxed">
                Kapora ödemesi sonrası sahanız rezerve edilecek.
              </p>

              <div className="mt-6 flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 w-full">
                <div className={`w-10 h-7 rounded-md bg-gradient-to-br ${card.color} flex items-center justify-center shrink-0`}>
                  <CreditCard size={14} className="text-white/90" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest">{card.brand}</p>
                  <p className="text-sm font-bold text-white font-mono">•••• {card.last4}</p>
                </div>
                <p className="text-lg font-black text-[#FFFF00]">{deposit}₺</p>
              </div>

              {error && (
                <p className="mt-4 text-xs text-red-400 text-center font-bold">{error}</p>
              )}
            </div>

            {/* Alt orta — onay butonu */}
            <div className="fixed bottom-0 left-0 right-0 p-6 pb-safe bg-gradient-to-t from-[#0A0E14] via-[#0A0E14] to-transparent">
              <button
                onClick={handleConfirm}
                className="w-full max-w-sm mx-auto block h-16 rounded-[20px] bg-[#FFFF00] text-black font-black text-base tracking-wide shadow-[0_0_40px_rgba(255,255,0,0.35)] hover:brightness-105 active:scale-[0.98] transition-all"
              >
                {deposit}₺ Kapora Öde & Onayla
              </button>
            </div>
          </motion.div>
        )}

        {/* MARTİ TARZI ÖDEME */}
        {step === 'PROCESSING' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-full px-8"
          >
            <div className="relative w-44 h-44 mb-10">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke="#FFFF00"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 44}`}
                  strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress / 100)}`}
                  className="transition-all duration-150"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className={`w-14 h-10 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center mb-2 shadow-lg`}>
                  <CreditCard size={22} className="text-white" />
                </div>
                <p className="text-[10px] font-mono text-gray-400">•••• {card.last4}</p>
              </div>
            </div>
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
              className="text-lg font-black text-white uppercase tracking-widest"
            >
              Ödeme Alınıyor
            </motion.p>
            <p className="text-sm text-gray-500 mt-2">{deposit}₺ kapora işleniyor...</p>
          </motion.div>
        )}

        {/* BAŞARILI */}
        {step === 'SUCCESS' && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center justify-center h-full relative"
          >
            <Particles count={40} colors={['#39FF14', '#FFFF00', '#FFFFFF']} />
            <div className="absolute inset-0 bg-[#39FF14]/10 blur-3xl pointer-events-none" />
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 12, stiffness: 200 }}
              className="w-28 h-28 rounded-full bg-[#39FF14] flex items-center justify-center shadow-[0_0_60px_rgba(57,255,20,0.5)] mb-8 relative z-10"
            >
              <CheckCircle2 size={56} className="text-black" />
            </motion.div>
            <h2 className="text-3xl font-black text-white relative z-10">Rezervasyon Onaylandı!</h2>
            <p className="text-sm text-[#39FF14] font-bold mt-2 relative z-10 uppercase tracking-widest">
              {deposit}₺ kapora alındı
            </p>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default PitchDepositCheckout;
