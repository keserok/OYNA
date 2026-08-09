import React, { useState } from 'react';
import { Banknote, MessageCircle, Phone, QrCode, UserX, XCircle } from 'lucide-react';
import { waLink, bookingReminderMessage } from '../../utils/whatsapp';
import { markBookingNoShow } from '../../services/customerService';
import { cancelConfirmedBooking, recordBookingPayment, type PaymentMethod, toTurkishError } from '../../services/pitchOwnerService';
import { bookingToDebtor } from '../../services/financeService';
import { parseTRYAmount } from '../../shared/financeModel';
import { money } from './finance/financeUi';
import { useOwnerToast } from './components/useOwnerToast';
import { useConfirmSheet } from './components/useConfirmSheet';
import { OwnerBottomSheet } from './components/OwnerBottomSheet';
import { Spinner } from '../../components/ui/Spinner';

export interface BookingDetailData {
  id: string;
  time: string;
  user: string;
  type: 'APP' | 'PHONE' | 'SUB' | 'DAILY';
  status: 'PAID' | 'PARTIAL' | 'PENDING';
  price: number;
  paid: number;
  note?: string;
  /** Rezervasyonu yapanın telefonu (pitch_bookings.customer_phone). */
  phone?: string;
}

interface OwnerBookingDetailModalProps {
  booking: BookingDetailData;
  readOnly?: boolean;
  onClose: () => void;
  /** Takvimi yenile — hem iptal hem tahsilat sonrası. */
  onChanged: () => void;
  onNavigateQr?: () => void;
  /** C2 — WhatsApp hatırlatma mesajı için: rezervasyonun günü (ISO). */
  dateISO?: string;
  /** C2 — mesajda "X hatırlatması:" diye geçen tesis adı. */
  facilityName?: string;
}

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'CASH', label: 'Nakit' },
  { id: 'CARD', label: 'Kart' },
  { id: 'BANK_TRANSFER', label: 'Havale' },
];

export const OwnerBookingDetailModal: React.FC<OwnerBookingDetailModalProps> = ({
  booking,
  readOnly = false,
  onClose,
  onChanged,
  onNavigateQr,
  dateISO,
  facilityName,
}) => {
  const notify = useOwnerToast();
  const { confirm, confirmElement } = useConfirmSheet();
  const [mode, setMode] = useState<'view' | 'cancel' | 'collect'>('view');
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);

  const balance = Math.max(0, Math.round((booking.price ?? 0) - (booking.paid ?? 0)));
  const [amountStr, setAmountStr] = useState(String(balance));
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const amount = parseTRYAmount(amountStr);
  const validPay = Number.isFinite(amount) && amount > 0 && amount <= balance + 0.001;

  const statusLabel =
    booking.status === 'PAID' ? 'ÖDENDİ' : booking.status === 'PARTIAL' ? 'KISMİ' : 'BEKLEYEN';
  const statusCls =
    booking.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-400'
    : booking.status === 'PARTIAL' ? 'bg-yellow-500/20 text-yellow-400'
    : 'bg-red-500/20 text-red-400';
  const isManual = booking.type === 'PHONE' || booking.type === 'DAILY';

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      notify('İptal nedeni zorunludur.', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Rezervasyonu iptal et?',
      // Karar 12a: sahibi iptal edebilir, ama parasal sonucu ÖNCEDEN görmeli.
      // Ödeme altyapısının kestiği ücret iade edilmez; bu tutar tesise yapılacak
      // ödemeden düşülür.
      message:
        'Ödenmiş tutar varsa oyuncuya iade işlemi başlatılır. Ödeme altyapısının bu tahsilat için kestiği ücret geri alınmaz; sana yapılacak ödemeden düşülür. Bu işlem geri alınamaz.',
      confirmLabel: 'İptal Et',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await cancelConfirmedBooking(booking.id, cancelReason.trim());
      onChanged();
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCollect = async () => {
    if (!validPay) {
      notify(balance <= 0 ? 'Bu rezervasyon tamamen tahsil edilmiş.' : 'Geçerli bir tutar girin.', 'error');
      return;
    }
    setBusy(true);
    try {
      const { queued } = await recordBookingPayment(booking.id, amount, method, 'Takvimden tahsilat');
      // BULGU-125: çevrimdışı kayıt "kaydedildi" DEĞİL — para henüz sunucuda yok.
      notify(
        queued
          ? `İnternet yok — ${money(amount)} henüz kaydedilmedi. Bağlantı gelince otomatik gönderilecek.`
          : 'Tahsilat kaydedildi.',
        queued ? 'warning' : 'success',
      );
      onChanged();
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  // BULGU-124: gelmeyen müşteri. İptal DEĞİL (iade tetiklemez) — kalan bakiye
  // veresiye defterine taşınır; Finans'ın "Bekleyen" toplamı şişmez
  // (get_pitch_finance_summary DEBT bağlı rezervasyonu pending'ten düşer).
  const handleNoShow = async () => {
    if (balance <= 0) {
      notify('Bu rezervasyonun bekleyen tutarı yok — veresiyeye yazılacak bakiye bulunmuyor.', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Gelmedi olarak işaretle?',
      message: `${booking.user} · ${booking.time} — kalan ${money(balance)} veresiye defterine yazılacak. Tahsil edilen tutar iade edilmez.`,
      confirmLabel: 'Gelmedi',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await bookingToDebtor(booking.id, booking.user);
      // Müşteri kartındaki "gelmedi" sayacı için işaret — veresiye kaydı ayakta
      // kalırken bu işaret düşse bile para tarafı etkilenmez (yalnız istatistik).
      markBookingNoShow(booking.id).catch(() => {});
      notify(`Gelmedi olarak işaretlendi. ${money(balance)} veresiyeye yazıldı — Finans → Veresiye'den takip et.`, 'success');
      onChanged();
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const footer = readOnly ? null : mode === 'collect' ? (
    <div className="flex gap-3">
      <button type="button" onClick={() => setMode('view')} disabled={busy}
        className="flex-1 h-12 rounded-2xl bg-white/5 text-white font-bold active:scale-[0.98] transition-transform disabled:opacity-40">
        Vazgeç
      </button>
      <button type="button" onClick={handleCollect} disabled={busy || !validPay}
        className="flex-[1.5] h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50">
        {busy ? <Spinner size={18} color="currentColor" glow={false} /> : <>Tahsil Et · {money(Math.max(0, amount))}</>}
      </button>
    </div>
  ) : mode === 'cancel' ? (
    <div className="flex gap-3">
      <button type="button" onClick={() => setMode('view')} disabled={busy}
        className="flex-1 h-12 rounded-2xl bg-white/5 text-white font-bold active:scale-[0.98] transition-transform disabled:opacity-40">
        Vazgeç
      </button>
      <button type="button" onClick={handleCancel} disabled={busy}
        className="flex-[1.5] h-12 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-extrabold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50">
        {busy ? <Spinner size={18} color="currentColor" glow={false} /> : 'İptali Onayla'}
      </button>
    </div>
  ) : (
    // BULGU-124: bakiye varken üç aksiyon var — eşit ızgara, hepsi 48px yüksek.
    // Bakiye 0 ise "Gelmedi" ve "Tahsilat Al" hiç çizilmez, tek buton kalır.
    <div className={balance > 0 ? 'grid grid-cols-3 gap-2' : 'flex gap-3'}>
      <button type="button" onClick={() => setMode('cancel')} disabled={busy}
        className="flex-1 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 font-extrabold text-[11px] flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-50">
        <XCircle size={16} /> İptal Et
      </button>
      {balance > 0 && (
        <button type="button" onClick={handleNoShow} disabled={busy}
          className="h-12 rounded-2xl bg-[#FACC15]/10 border border-[#FACC15]/30 text-[#FACC15] font-extrabold text-[11px] flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-50">
          {busy ? <Spinner size={16} color="currentColor" glow={false} /> : <><UserX size={16} /> Gelmedi</>}
        </button>
      )}
      {balance > 0 && (
        <button type="button" onClick={() => setMode('collect')} disabled={busy}
          className="h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-50">
          <Banknote size={16} /> Tahsilat Al
        </button>
      )}
    </div>
  );

  return (
    <OwnerBottomSheet
      open
      onClose={busy ? () => {} : onClose}
      title={booking.user}
      subtitle={`${booking.time} • ${booking.type === 'APP' ? 'Uygulama Rezervasyonu' : 'Manuel Rezervasyon'}`}
      footer={footer}
    >
      {/* Durum kartı */}
      <div className="bg-[#0A0E14] p-4 rounded-2xl border border-white/5 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-[0.6875rem] text-gray-500 font-bold uppercase">Durum</span>
          <span className={`text-[0.6875rem] font-extrabold px-2 py-1 rounded ${statusCls}`}>{statusLabel}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[0.6875rem] text-gray-500 font-bold uppercase">Tutar</span>
          <span className="text-lg font-extrabold text-white font-mono tabular-nums">{money(booking.price)}</span>
        </div>
        {booking.paid > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-[0.6875rem] text-gray-500 font-bold uppercase">Tahsil edilen</span>
            <span className="text-sm font-extrabold text-emerald-400 font-mono tabular-nums">{money(booking.paid)}</span>
          </div>
        )}
        {balance > 0 && (
          <div className="flex justify-between items-center border-t border-white/5 pt-2">
            <span className="text-[0.6875rem] text-amber-400 font-bold uppercase">Bekleyen</span>
            <span className="text-sm font-extrabold text-amber-400 font-mono tabular-nums">{money(balance)}</span>
          </div>
        )}
        {booking.note && (
          <p className="text-xs text-gray-400 border-t border-white/5 pt-2">{booking.note}</p>
        )}
      </div>

      {/* COLLECT modu: tutar + yöntem */}
      {mode === 'collect' && (
        <div className="mt-4 space-y-3">
          <label className="text-[0.6875rem] font-extrabold text-gray-500 uppercase tracking-widest">Tahsil edilecek tutar</label>
          <div className="flex gap-2">
            <div className="flex-1 bg-[#0A0E14] border border-white/10 rounded-2xl px-4 flex items-center focus-within:border-emerald-500/50">
              <input
                type="text"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="w-full bg-transparent text-white font-extrabold text-xl py-3 outline-none tabular-nums"
                autoFocus
              />
              <span className="text-gray-500 font-bold">₺</span>
            </div>
            <button type="button" onClick={() => setAmountStr(String(balance))}
              className="px-4 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-extrabold uppercase active:scale-95">
              Tümü
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button key={m.id} type="button" onClick={() => setMethod(m.id)}
                className={`min-h-[44px] py-2.5 rounded-xl border text-xs font-extrabold transition-colors ${method === m.id ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-[#0A0E14] border-white/5 text-gray-400 hover:text-white'}`}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[0.6875rem] text-gray-500">Tahsilat denetimli ve idempotent kaydedilir; kalan tutar kadar tahsil edebilirsin.</p>
        </div>
      )}

      {/* CANCEL modu: neden */}
      {mode === 'cancel' && (
        <div className="mt-4 space-y-2">
          <label className="text-[0.6875rem] font-extrabold text-gray-500 uppercase tracking-widest">İptal nedeni</label>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={2}
            placeholder="Örn: Hava koşulları, bakım çalışması"
            className="w-full bg-[#0A0E14] border border-white/5 p-4 rounded-2xl text-white text-sm outline-none resize-none focus:border-red-500/40"
            autoFocus
          />
        </div>
      )}

      {/* VIEW modu: hızlı aksiyonlar */}
      {mode === 'view' && (
        <div className={`grid ${booking.phone ? 'grid-cols-3' : 'grid-cols-2'} gap-3 mt-4`}>
          {/* [YAYIN] Buradaki düğme eskiden yalnız "yakında aktif olacak" uyarısı
              gösteriyordu — yani hiçbir işe yaramıyordu. Rezervasyonun telefonu
              zaten kayıtlı (pitch_bookings.customer_phone); düğme artık DOĞRUDAN
              arama başlatıyor. Telefon yoksa (ör. eski kayıt) düğme HİÇ ÇİZİLMEZ:
              çalışmayan bir düğme göstermektense hiç göstermemek doğrudur. */}
          {booking.phone ? (
            <a
              href={`tel:${booking.phone.replace(/[^0-9+]/g, '')}`}
              className="min-h-[52px] py-3 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-xl text-[0.6875rem] font-extrabold hover:bg-blue-500/20 transition-colors flex flex-col items-center justify-center gap-1.5 uppercase"
            >
              <Phone size={16} /> Müşteriyi Ara
            </a>
          ) : (
            <div className="min-h-[52px] py-3 bg-white/[0.03] border border-white/5 text-gray-600 rounded-xl text-[0.6875rem] font-extrabold flex flex-col items-center justify-center gap-1.5 uppercase">
              <Phone size={16} /> Telefon Yok
            </div>
          )}
          {/* C2 — no-show panzehiri: hazır mesajlı WhatsApp hatırlatması.
              Telefon yoksa çizilmez (arama düğmesiyle aynı ilke). */}
          {booking.phone && (
            <a
              href={waLink(booking.phone, bookingReminderMessage({
                customerName: booking.user,
                time: booking.time,
                facilityName,
                dateISO,
              }))}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[52px] py-3 bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] rounded-xl text-[0.6875rem] font-extrabold hover:bg-[#25D366]/20 transition-colors flex flex-col items-center justify-center gap-1.5 uppercase"
            >
              <MessageCircle size={16} /> WhatsApp Hatırlat
            </a>
          )}
          <button
            type="button"
            onClick={() => { onClose(); onNavigateQr?.(); }}
            className="min-h-[52px] py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-[0.6875rem] font-extrabold hover:bg-emerald-500/20 transition-colors flex flex-col items-center gap-1.5 uppercase"
          >
            <QrCode size={16} /> QR Check-in
          </button>
        </div>
      )}
      {confirmElement}
    </OwnerBottomSheet>
  );
};
