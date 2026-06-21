import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Calendar, Clock, MapPin, CheckCircle2, XCircle, Hourglass, AlertTriangle, Loader2, CreditCard, Wallet } from 'lucide-react';
import {
  fetchMyBookings,
  cancelMyBooking,
  canCancel,
  toPlayerErrorMessage,
  shortTime,
  type MyBooking,
  type CancelResult,
} from '../services/playerBookingService';
import { payBookingDeposit, toPaymentErrorMessage } from '../services/paymentService';
import { LoadingState, ErrorState, EmptyState } from '../components/common/StatusState';

interface MyBookingsProps {
  onBack: () => void;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  PENDING: { label: 'Onay Bekliyor', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', icon: Hourglass },
  CONFIRMED: { label: 'Onaylandı', color: 'text-[#39FF14]', bg: 'bg-[#39FF14]/10 border-[#39FF14]/30', icon: CheckCircle2 },
  CANCELLED: { label: 'İptal Edildi', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: XCircle },
};

const formatDate = (iso: string): string => {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' });
  } catch {
    return iso;
  }
};

const MyBookings: React.FC<MyBookingsProps> = ({ onBack }) => {
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // İptal onay modalı
  const [cancelTarget, setCancelTarget] = useState<MyBooking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState<CancelResult | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Kapora ödeme durumu
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payOkId, setPayOkId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const handlePayDeposit = async (b: MyBooking) => {
    setPayingId(b.id);
    setPayError(null);
    try {
      const res = await payBookingDeposit(b.id);
      if (!res.redirected) {
        setPayOkId(b.id);
        await load();
        setTimeout(() => setPayOkId(null), 2500);
      }
    } catch (err) {
      console.error('Kapora ödeme hatası:', err);
      setPayError(toPaymentErrorMessage(err));
      setTimeout(() => setPayError(null), 5000);
    } finally {
      setPayingId(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBookings(await fetchMyBookings());
    } catch (err) {
      console.error('Rezervasyonlar yüklenemedi:', err);
      setError('Rezervasyonlar yüklenemedi. Lütfen tekrar dene.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const result = await cancelMyBooking(cancelTarget.id);
      setCancelResult(result);
      setCancelTarget(null);
      await load();
    } catch (err) {
      setCancelError(toPlayerErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white font-sans">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#0A0E14]/90 backdrop-blur-xl border-b border-white/5 px-6 py-5 flex items-center gap-4">
        <button onClick={onBack} className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-black italic tracking-tight">REZERVASYONLARIM</h1>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Saha kiralamaların</p>
        </div>
      </header>

      <main className="p-6 max-w-2xl mx-auto">
        {loading ? (
          <LoadingState message="Rezervasyonlar yükleniyor..." />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : bookings.length === 0 ? (
          <EmptyState
            title="HENÜZ REZERVASYON YOK"
            message="Saha Vitrini'nden ilk rezervasyonunu oluştur."
            icon={<Calendar size={32} />}
          />
        ) : (
          <div className="space-y-4">
            {bookings.map((b) => {
              const meta = STATUS_META[b.status] ?? STATUS_META.PENDING;
              const StatusIcon = meta.icon;
              const cancellable = canCancel(b);
              return (
                <div key={b.id} className="bg-[#161B22] rounded-3xl border border-white/5 overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <h3 className="text-lg font-black text-white truncate">{b.pitches?.name ?? 'Saha'}</h3>
                        {b.pitches?.district && (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <MapPin size={12} /> {b.pitches.district}{b.courts?.name ? ` · ${b.courts.name}` : ''}
                          </p>
                        )}
                      </div>
                      <span className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase ${meta.bg} ${meta.color}`}>
                        <StatusIcon size={12} /> {meta.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-300 bg-black/30 rounded-2xl px-4 py-3 border border-white/5">
                      <span className="flex items-center gap-1.5 font-bold"><Calendar size={14} className="text-[#39FF14]" /> {formatDate(b.booking_date)}</span>
                      <span className="flex items-center gap-1.5 font-bold"><Clock size={14} className="text-[#39FF14]" /> {shortTime(b.start_time)} - {shortTime(b.end_time)}</span>
                    </div>

                    {b.price > 0 && (
                      <div className="flex items-center justify-between mt-3 text-xs">
                        <span className="text-gray-500">Tutar</span>
                        <span className="text-white font-bold">₺{b.price}{b.deposit_amount > 0 && <span className="text-gray-500 font-normal"> · Kapora ₺{b.deposit_amount}</span>}</span>
                      </div>
                    )}

                    {/* Kapora ödeme durumu */}
                    {b.status !== 'CANCELLED' && b.deposit_amount > 0 && (
                      <div className="flex items-center justify-between mt-2 text-xs">
                        <span className="text-gray-500">Kapora durumu</span>
                        {b.paid_amount >= b.deposit_amount ? (
                          <span className="text-[#39FF14] font-bold flex items-center gap-1"><CheckCircle2 size={12} /> Ödendi</span>
                        ) : (
                          <span className="text-yellow-400 font-bold">Ödenmedi</span>
                        )}
                      </div>
                    )}

                    {b.status === 'CANCELLED' && b.cancellation_reason && (
                      <p className="text-[11px] text-red-400/80 mt-3 italic">{b.cancellation_reason}</p>
                    )}
                  </div>

                  {/* Aksiyonlar: kapora öde + iptal */}
                  {b.status !== 'CANCELLED' && (
                    <div className="border-t border-white/5 px-5 py-3 space-y-2">
                      {/* Kaporayı Öde — yalnız ödenmemiş kapora varsa */}
                      {b.deposit_amount > 0 && b.paid_amount < b.deposit_amount && (
                        payOkId === b.id ? (
                          <div className="w-full py-2.5 text-center text-[#39FF14] text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2">
                            <CheckCircle2 size={14} /> Kapora Ödendi
                          </div>
                        ) : (
                          <button
                            onClick={() => handlePayDeposit(b)}
                            disabled={payingId === b.id}
                            className={`w-full py-3 rounded-xl bg-[#FFFF00] text-black text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-transform ${payingId === b.id ? 'opacity-60 cursor-wait' : 'active:scale-95 hover:bg-yellow-300'}`}
                          >
                            {payingId === b.id
                              ? (<><Loader2 size={14} className="animate-spin" /> İşleniyor...</>)
                              : (<><CreditCard size={14} /> Kaporayı Öde (₺{b.deposit_amount})</>)}
                          </button>
                        )
                      )}

                      {cancellable ? (
                        <button
                          onClick={() => { setCancelTarget(b); setCancelError(null); }}
                          className="w-full py-2.5 text-red-400 hover:text-red-300 text-xs font-black uppercase tracking-widest transition-colors"
                        >
                          İptal Et (%90 İade)
                        </button>
                      ) : (
                        <p className="text-center text-[10px] text-gray-600 font-bold uppercase tracking-wide py-1">
                          Maça 48 saatten az kaldı · uygulamadan iptal kapalı
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Ödeme hatası toast */}
      <AnimatePresence>
        {payError && (
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] max-w-sm w-[90%] bg-red-950/95 backdrop-blur-xl border border-red-500/40 rounded-2xl px-5 py-4 shadow-2xl flex items-start gap-3"
          >
            <XCircle size={18} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-100 leading-relaxed flex-1">{payError}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* İptal Onay Modalı */}
      <AnimatePresence>
        {cancelTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setCancelTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#161B22] w-full max-w-sm rounded-[32px] border border-white/10 p-7 text-center"
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center mb-5">
                <AlertTriangle size={28} className="text-red-400" />
              </div>
              <h2 className="text-xl font-black text-white mb-2">Rezervasyonu İptal Et</h2>
              <p className="text-sm text-gray-400 leading-relaxed mb-1">
                {cancelTarget.pitches?.name} — {formatDate(cancelTarget.booking_date)} {shortTime(cancelTarget.start_time)}
              </p>
              <p className="text-xs text-gray-500 mb-6">
                Ödediğin tutarın <span className="text-[#39FF14] font-bold">%90'ı</span> iade edilecek
                {cancelTarget.paid_amount > 0 && <> (≈ ₺{Math.round(cancelTarget.paid_amount * 0.9)})</>}.
                {' '}Bu işlem geri alınamaz.
              </p>

              {cancelError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-500/20 rounded-xl px-3 py-2 mb-4">{cancelError}</p>
              )}

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className={`w-full py-3.5 bg-red-500 text-white font-black rounded-2xl text-sm uppercase tracking-wide transition-transform flex items-center justify-center gap-2 ${cancelling ? 'opacity-60 cursor-wait' : 'active:scale-95 hover:bg-red-600'}`}
                >
                  {cancelling ? <><Loader2 size={16} className="animate-spin" /> İptal ediliyor...</> : 'Evet, İptal Et'}
                </button>
                <button onClick={() => setCancelTarget(null)} className="w-full py-3 text-gray-400 font-bold text-sm hover:text-white transition-colors">
                  Vazgeç
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* İptal Başarı Bilgisi */}
      <AnimatePresence>
        {cancelResult && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setCancelResult(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#161B22] w-full max-w-sm rounded-[32px] border border-white/10 p-7 text-center"
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-[#39FF14]/15 border-2 border-[#39FF14]/40 flex items-center justify-center mb-5">
                <CheckCircle2 size={28} className="text-[#39FF14]" />
              </div>
              <h2 className="text-xl font-black text-white mb-2">İptal Edildi</h2>
              <p className="text-sm text-gray-400 leading-relaxed mb-6">
                Rezervasyonun iptal edildi.
                {cancelResult.refund_amount > 0
                  ? <> <span className="text-[#39FF14] font-bold">₺{cancelResult.refund_amount}</span> (%90) iade işlemine alındı.</>
                  : ' İade edilecek ödeme bulunmuyor.'}
              </p>
              <button onClick={() => setCancelResult(null)} className="w-full py-3.5 bg-[#FFFF00] text-black font-black rounded-2xl text-sm uppercase tracking-wide active:scale-95 transition-transform">
                Tamam
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MyBookings;
