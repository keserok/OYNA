import React, { useMemo, useState } from 'react';
import { X, Zap, Percent, RefreshCw } from 'lucide-react';
import { useBackDismiss } from '../../hooks/useBackDismiss';
import {
  createFlashDeal,
  deleteFlashDeal,
  toTurkishError,
} from '../../services/pitchOwnerService';
import type { FlashDeal } from '../../types';
import { resolveHourlyPrice } from './ownerCalendarHelpers';
import { money } from './finance/financeUi';

interface OwnerFlashDealModalProps {
  pitchId: string;
  courtId: string;
  bookingDate: string;
  timeKey: string;
  pricingPolicy?: Array<{ startTime: string; endTime: string; price?: number; price_per_hour?: number }>;
  existingDeal?: FlashDeal;
  onClose: () => void;
  onSaved: () => void;
}

export const OwnerFlashDealModal: React.FC<OwnerFlashDealModalProps> = ({
  pitchId,
  courtId,
  bookingDate,
  timeKey,
  pricingPolicy,
  existingDeal,
  onClose,
  onSaved,
}) => {
  const hour = parseInt(timeKey.split('.')[0], 10);
  const standardPrice = useMemo(() => resolveHourlyPrice(hour, pricingPolicy, courtId, bookingDate) ?? 0, [hour, pricingPolicy, courtId, bookingDate]);
  const [customPrice, setCustomPrice] = useState(
    () => String(existingDeal?.deal_price ?? Math.round(standardPrice * 0.8)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Android geri tuşu + Esc modalı kapatır (koşullu mount: görünürken hep açık).
  // Kayıt/silme sürerken kapanmaz — yarım işlem bırakılmasın.
  useBackDismiss(true, () => { if (!saving) onClose(); }, 'flash-deal-modali', 0);

  const newPrice = parseInt(customPrice, 10) || 0;
  const discountPercent =
    standardPrice > 0 ? Math.round((1 - newPrice / standardPrice) * 100) : 0;

  const handleSave = async () => {
    if (newPrice >= standardPrice) {
      setError('Flash deal yalnızca standart fiyattan düşük olabilir. Prime time için Menü → Tarife Politikası kullanın.');
      return;
    }
    if (discountPercent < 5 || discountPercent > 80) {
      setError('İndirim %5 ile %80 arasında olmalıdır.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (existingDeal) {
        await deleteFlashDeal(existingDeal.id);
      }
      const startTime = timeKey.replace('.', ':');
      const expiresAt = new Date(`${bookingDate}T23:59:59`).toISOString();
      await createFlashDeal({
        pitch_id: pitchId,
        court_id: courtId,
        booking_date: bookingDate,
        start_time: startTime,
        discount_percent: discountPercent,
        original_price: standardPrice,
        expires_at: expiresAt,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(toTurkishError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!existingDeal) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await deleteFlashDeal(existingDeal.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(toTurkishError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200">
      <div className="bg-[#161B22] w-full max-w-md rounded-t-[32px] border-t border-white/10 p-6 animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-extrabold text-white">Flash Deal</h3>
            <p className="text-xs text-gray-400 mt-1">
              {timeKey} • Standart: {money(standardPrice)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="bg-[#0A0E14] p-6 rounded-3xl border border-white/10 mb-6 text-center">
          <label className="text-xs text-gray-500 font-bold uppercase mb-2 block">İndirimli Fiyat</label>
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl font-extrabold text-gray-500">₺</span>
            <input
              type="number"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              className="bg-transparent text-5xl font-extrabold text-white outline-none w-40 text-center border-b border-white/20 focus:border-[#FACC15] transition-colors"
            />
          </div>
          {discountPercent >= 5 && discountPercent <= 80 && (
            <p className="text-sm text-green-400 font-bold mt-3">%{discountPercent} indirim</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <button
            type="button"
            onClick={() => setCustomPrice(String(Math.max(standardPrice - 400, Math.round(standardPrice * 0.75))))}
            className="py-3 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-xl text-xs font-bold hover:bg-yellow-500 hover:text-black transition-colors flex flex-col items-center gap-1"
          >
            <Zap size={14} /> Hızlı
          </button>
          <button
            type="button"
            onClick={() => setCustomPrice(String(Math.round(standardPrice * 0.8)))}
            className="py-3 bg-green-500/10 border border-green-500/20 text-green-500 rounded-xl text-xs font-bold hover:bg-green-500 hover:text-white transition-colors flex flex-col items-center gap-1"
          >
            <Percent size={14} /> %20
          </button>
          <button
            type="button"
            onClick={() => setCustomPrice(String(standardPrice))}
            className="py-3 bg-gray-800 border border-white/10 text-gray-400 rounded-xl text-xs font-bold hover:bg-white/10 hover:text-white transition-colors flex flex-col items-center gap-1"
          >
            <RefreshCw size={14} /> Standart
          </button>
        </div>

        <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">
          Flash deal, boş slotu uygulamada indirimli gösterir. Süresi seçili gün sonunda biter.
        </p>

        {error && <p className="text-sm text-red-400 font-bold mb-4">{error}</p>}

        <div className="flex gap-3">
          {existingDeal && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={saving}
              className="flex-1 py-4 bg-red-500/10 border border-red-500/30 text-red-400 font-extrabold rounded-2xl hover:bg-red-500/20 disabled:opacity-50"
            >
              KALDIR
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] py-4 bg-[#FACC15] text-black font-extrabold text-lg rounded-2xl hover:bg-yellow-300 active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? 'KAYDEDİLİYOR…' : 'FLASH DEAL OLUŞTUR'}
          </button>
        </div>
      </div>
    </div>
  );
};
