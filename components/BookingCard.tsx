import React from 'react';
import {
  Calendar, Clock, MapPin, CheckCircle2, XCircle, Hourglass,
  CreditCard, Navigation, Repeat, Swords, Loader2, QrCode,
} from 'lucide-react';
import type { MyBooking } from '../services/playerBookingService';
import { canCancel, shortTime } from '../services/playerBookingService';
import { formatCapacityRange } from '../shared/pitchShowcaseMapper';

// Maçlarım hub'ındaki rezervasyon kartı — MatchJoinCard'ın cam diliyle uyumlu.
// Para = altın (#FACC15) kuralı; rakamlar Space Grotesk (.font-numeric).
// Aksiyon mantığı props ile dışarıdan gelir (hub sahibidir): kapora öde,
// iptal (sunucu önizlemeli modal hub'da), maça çevir, yol tarifi, tekrar rezerve.

const STATUS_META: Record<MyBooking['status'], { label: string; color: string; bg: string; icon: React.ElementType }> = {
  PENDING:   { label: 'Onay Bekliyor', color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/30', icon: Hourglass },
  CONFIRMED: { label: 'Onaylandı',     color: 'text-[#39FF14]',   bg: 'bg-[#39FF14]/10 border-[#39FF14]/30',   icon: CheckCircle2 },
  CANCELLED: { label: 'İptal Edildi',  color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30',       icon: XCircle },
};

export const formatBookingDate = (iso: string): string => {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' });
  } catch {
    return iso;
  }
};

interface BookingCardProps {
  booking: MyBooking;
  onPayDeposit: (b: MyBooking) => void;
  onCancel: (b: MyBooking) => void;
  onConvertToMatch: (b: MyBooking) => void;
  onDirections: (b: MyBooking) => void;
  onRebook: () => void;
  /** F4.1: QR bilet ekranına giriş — ekran + QR üretimi hazırdı ama hiçbir
   * karttan erişilemiyordu (tek navigate, ulaşılamaz bir default dalındaydı). */
  onViewTicket?: (b: MyBooking) => void;
  payingId?: string | null;
}

export const BookingCard: React.FC<BookingCardProps> = ({
  booking: b, onPayDeposit, onCancel, onConvertToMatch, onDirections, onRebook, onViewTicket, payingId = null,
}) => {
  const meta = STATUS_META[b.status] ?? STATUS_META.PENDING;
  const StatusIcon = meta.icon;
  const isCancelled = b.status === 'CANCELLED';
  const cancellable = canCancel(b);
  const depositRemaining = Math.max((b.deposit_amount || 0) - (b.paid_amount || 0), 0);
  const depositPaid = b.deposit_amount > 0 && b.paid_amount >= b.deposit_amount;
  const paying = payingId === b.id;
  // Kort format aralığı rozeti ("6v6–8v8") — TEK KAYNAK yardımcıdan; null ise gösterilmez.
  const courtRange = formatCapacityRange(b.courts?.min_capacity, b.courts?.max_capacity, b.courts?.capacity);

  return (
    <div className={`bg-[#161B22] rounded-[24px] border border-white/5 overflow-hidden ${isCancelled ? 'opacity-80' : ''}`}>
      <div className="p-5">
        {/* Üst satır: saha görseli + isim/ilçe + durum rozeti */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-14 h-14 rounded-xl shrink-0 overflow-hidden border border-white/10 bg-gradient-to-br from-[#0D121F] to-[#161B22] flex items-center justify-center">
            {b.pitches?.image ? (
              <img src={b.pitches.image} alt={b.pitches?.name ?? 'Saha'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <MapPin size={20} className="text-ink-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-extrabold text-white truncate leading-tight">{b.pitches?.name ?? 'Saha'}</h3>
            {(b.pitches?.district || b.courts?.name) && (
              <p className="text-xs text-gray-400 flex items-center gap-1 mt-1 truncate">
                <MapPin size={12} className="shrink-0" />
                <span className="truncate">
                  {b.pitches?.district ?? ''}{b.pitches?.district && b.courts?.name ? ' · ' : ''}{b.courts?.name ?? ''}{b.courts?.name && courtRange ? ` · ${courtRange}` : ''}
                </span>
              </p>
            )}
          </div>
          <span className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[0.6875rem] font-extrabold uppercase ${meta.bg} ${meta.color}`}>
            <StatusIcon size={12} /> {meta.label}
          </span>
        </div>

        {/* Takvim kutusu — rakamlar Space Grotesk */}
        <div className="flex items-center gap-4 text-sm text-gray-300 bg-black/30 rounded-2xl px-4 py-3 border border-white/5">
          <span className="flex items-center gap-1.5 font-bold font-numeric">
            <Calendar size={14} className="text-[#39FF14]" /> {formatBookingDate(b.booking_date)}
          </span>
          <span className="flex items-center gap-1.5 font-bold font-numeric">
            <Clock size={14} className="text-[#39FF14]" /> {shortTime(b.start_time)}–{shortTime(b.end_time)}
          </span>
        </div>

        {/* Para satırı — altın */}
        {b.price > 0 && (
          <div className="flex items-center justify-between mt-3 text-xs">
            <span className="text-ink-4 font-bold uppercase tracking-wide">Tutar</span>
            <span className="text-[#FACC15] font-extrabold font-numeric">
              ₺{b.price.toLocaleString('tr-TR')}
              {b.deposit_amount > 0 && (
                <span className="text-ink-4 font-bold"> · Kapora ₺{b.deposit_amount.toLocaleString('tr-TR')}</span>
              )}
            </span>
          </div>
        )}
        {!isCancelled && b.deposit_amount > 0 && (
          <div className="flex items-center justify-between mt-2 text-xs">
            <span className="text-ink-4 font-bold uppercase tracking-wide">Kapora durumu</span>
            {depositPaid ? (
              <span className="text-[#39FF14] font-bold flex items-center gap-1"><CheckCircle2 size={12} /> Ödendi</span>
            ) : (
              <span className="text-yellow-400 font-bold">Ödenmedi</span>
            )}
          </div>
        )}
        {isCancelled && b.cancellation_reason && (
          <p className="text-[0.6875rem] text-red-400/80 mt-3 italic">{b.cancellation_reason}</p>
        )}
      </div>

      {/* Kartın tek dolu butonu: ödenmemiş kapora (altın, h-12) */}
      {!isCancelled && depositRemaining > 0 && (
        <div className="px-5 pb-4">
          <button
            onClick={() => onPayDeposit(b)}
            disabled={paying}
            className={`w-full h-12 rounded-xl bg-[#FACC15] text-black text-xs font-extrabold uppercase tracking-widest flex items-center justify-center gap-2 transition-transform ${
              paying ? 'opacity-60 cursor-wait' : 'active:scale-95 hover:bg-yellow-300'
            }`}
          >
            {paying
              ? (<><Loader2 size={14} className="animate-spin" /> İşleniyor...</>)
              : (<><CreditCard size={14} /> Kaporayı Öde (<span className="font-numeric">₺{depositRemaining.toLocaleString('tr-TR')}</span>)</>)}
          </button>
        </div>
      )}

      {/* İkincil aksiyonlar: maça çevir · yol tarifi · tekrar rezerve (≥44px hücreler) */}
      <div className={`border-t border-white/5 px-3 py-2.5 grid gap-1.5 ${isCancelled ? 'grid-cols-2' : (onViewTicket ? 'grid-cols-4' : 'grid-cols-3')}`}>
        {!isCancelled && onViewTicket && (
          <button
            onClick={() => onViewTicket(b)}
            className="flex flex-col items-center justify-center gap-1 min-h-[44px] py-2 rounded-xl bg-[#FACC15]/[0.06] border border-[#FACC15]/25 text-[#FACC15] hover:bg-[#FACC15]/12 active:scale-95 transition-all"
          >
            <QrCode size={15} />
            <span className="text-[0.625rem] font-extrabold uppercase tracking-wider">Bilet</span>
          </button>
        )}
        {!isCancelled && (
          <button
            onClick={() => onConvertToMatch(b)}
            className="flex flex-col items-center justify-center gap-1 min-h-[44px] py-2 rounded-xl bg-[#39FF14]/[0.06] border border-[#39FF14]/20 text-[#39FF14] hover:bg-[#39FF14]/12 active:scale-95 transition-all"
          >
            <Swords size={15} />
            <span className="text-[0.625rem] font-extrabold uppercase tracking-wider">Maça Çevir</span>
          </button>
        )}
        <button
          onClick={() => onDirections(b)}
          className="flex flex-col items-center justify-center gap-1 min-h-[44px] py-2 rounded-xl bg-white/[0.03] border border-white/10 text-white/80 hover:bg-white/[0.07] active:scale-95 transition-all"
        >
          <Navigation size={15} />
          <span className="text-[0.625rem] font-extrabold uppercase tracking-wider">Yol Tarifi</span>
        </button>
        <button
          onClick={onRebook}
          className="flex flex-col items-center justify-center gap-1 min-h-[44px] py-2 rounded-xl bg-white/[0.03] border border-white/10 text-white/80 hover:bg-white/[0.07] active:scale-95 transition-all"
        >
          <Repeat size={15} />
          <span className="text-[0.625rem] font-extrabold uppercase tracking-wider">Tekrar Rezerve</span>
        </button>
      </div>

      {/* İptal: tam genişlik kırmızı metin butonu / kapalıysa bilgi notu */}
      {!isCancelled && (
        <div className="border-t border-white/5 px-5 py-1.5">
          {cancellable ? (
            <button
              onClick={() => onCancel(b)}
              className="w-full min-h-[44px] text-red-400 hover:text-red-300 text-xs font-extrabold uppercase tracking-widest transition-colors"
            >
              İptal Et
            </button>
          ) : (
            <p className="text-center text-[0.625rem] text-ink-4 font-bold uppercase tracking-wide py-3">
              Rezervasyon başladı · iptal kapalı
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default BookingCard;
