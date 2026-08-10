import React, { useState } from 'react';
import { HandCoins } from 'lucide-react';
import { recordBookingPayment, type PaymentMethod } from '../../../services/pitchOwnerService';
import { bookingToDebtor, type PendingBooking } from '../../../services/financeService';
import { parseTRYAmount } from '../../../shared/financeModel';
import { money } from './financeUi';
import { BottomSheetModal } from './BottomSheetModal';

// ─── FI-2 — Bekleyen rezervasyonu tahsil et VEYA veresiyeye yaz ───────────────

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'CASH', label: 'Nakit' },
  { id: 'CARD', label: 'Kart' },
  { id: 'BANK_TRANSFER', label: 'Havale' },
];

interface Props {
  booking: PendingBooking;
  onClose: () => void;
  onChanged: () => void;
  notify: (msg: string, type?: 'success' | 'error' | 'warning') => void;
}

export const CollectModal: React.FC<Props> = ({ booking, onClose, onChanged, notify }) => {
  const [amountStr, setAmountStr] = useState(String(Math.round(booking.balance)));
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [busy, setBusy] = useState<'pay' | 'debt' | null>(null);

  const amount = parseTRYAmount(amountStr);
  const validPay = Number.isFinite(amount) && amount > 0 && amount <= booking.balance + 0.001;

  const collect = async () => {
    if (!validPay) return;
    setBusy('pay');
    try {
      const { queued } = await recordBookingPayment(booking.id, amount, method, 'Elle tahsilat');
      // P-OFFLINE: ağ yoksa kuyruğa alınır — dürüst mesaj (henüz sunucuda değil).
      notify(queued
        ? 'İnternet yok — tahsilat kuyruğa alındı, bağlantı gelince otomatik işlenecek.'
        : 'Tahsilat kaydedildi.', queued ? 'warning' : 'success');
      onChanged(); onClose();
    } catch (e: any) {
      notify(e?.message || 'Tahsilat kaydedilemedi.', 'error');
    } finally { setBusy(null); }
  };

  const toDebt = async () => {
    setBusy('debt');
    try {
      await bookingToDebtor(booking.id);
      notify('Bakiye veresiyeye yazıldı.', 'success');
      onChanged(); onClose();
    } catch (e: any) {
      notify(e?.message || 'Veresiyeye yazılamadı.', 'error');
    } finally { setBusy(null); }
  };

  return (
    <BottomSheetModal title={`Tahsilat — ${booking.customer_name ?? 'Müşteri'}`} onClose={onClose}>
      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-3 mb-4 text-[11px] text-gray-400">
        {booking.date} · {booking.time} · {booking.court ?? 'Saha'} · Ödenen {money(booking.paid)} / {money(booking.price)}
        <div className="text-amber-400 font-extrabold text-sm mt-1">Bekleyen {money(booking.balance)}</div>
      </div>

      <label className="text-[10px] font-extrabold text-ink-4 uppercase block mb-1.5">Tahsil edilecek tutar</label>
      <input
        inputMode="decimal"
        className="w-full bg-bg border border-white/10 rounded-xl p-3 text-white mb-3"
        value={amountStr}
        onChange={(e) => setAmountStr(e.target.value)}
      />
      <div className="flex gap-2 mb-4">
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMethod(m.id)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold border transition-colors ${
              method === m.id ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-white/[0.03] border-white/10 text-gray-400'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={collect}
        disabled={busy !== null || !validPay}
        className="w-full py-4 bg-emerald-600 text-white font-extrabold rounded-2xl disabled:opacity-40 mb-2"
      >
        {busy === 'pay' ? 'KAYDEDİLİYOR…' : 'TAHSİL ET'}
      </button>
      <button
        type="button"
        onClick={toDebt}
        disabled={busy !== null}
        className="w-full py-3 bg-red-500/10 border border-red-500/25 text-red-300 font-extrabold rounded-2xl disabled:opacity-40 inline-flex items-center justify-center gap-2"
      >
        <HandCoins size={15} /> {busy === 'debt' ? 'YAZILIYOR…' : 'VERESİYEYE YAZ'}
      </button>
    </BottomSheetModal>
  );
};
