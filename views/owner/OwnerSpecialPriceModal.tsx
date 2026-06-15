import React, { useMemo, useState } from 'react';
import { TrendingUp, X } from 'lucide-react';
import { upsertSpecialSlotTariff, toTurkishError } from '../../services/pitchOwnerService';
import { resolveHourlyPrice } from './ownerCalendarHelpers';

interface OwnerSpecialPriceModalProps {
  pitchId: string;
  courtId: string;
  bookingDate: string;
  timeKey: string;
  pricingPolicy?: Array<{ startTime: string; endTime: string; price?: number; price_per_hour?: number }>;
  onClose: () => void;
  onSaved: () => void;
}

export const OwnerSpecialPriceModal: React.FC<OwnerSpecialPriceModalProps> = ({
  pitchId,
  courtId,
  bookingDate,
  timeKey,
  pricingPolicy,
  onClose,
  onSaved,
}) => {
  const hour = parseInt(timeKey.split('.')[0], 10);
  const standardPrice = useMemo(() => resolveHourlyPrice(hour, pricingPolicy), [hour, pricingPolicy]);
  const [customPrice, setCustomPrice] = useState(() => String(Math.round(standardPrice * 1.25)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newPrice = parseInt(customPrice, 10) || 0;

  const handleSave = async () => {
    if (newPrice <= standardPrice) {
      setError('Özel fiyat standart fiyattan yüksek olmalıdır. İndirim için Flash Deal kullanın.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const startTime = timeKey.replace('.', ':');
      const endHour = (hour + 1) % 24;
      const endTime = `${endHour.toString().padStart(2, '0')}:00`;
      await upsertSpecialSlotTariff(pitchId, {
        courtId,
        bookingDate,
        startTime,
        endTime,
        pricePerHour: newPrice,
        name: `Özel ${bookingDate} ${startTime}`,
      });
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
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <TrendingUp size={20} className="text-amber-400" /> Özel Fiyat
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              {timeKey} • Standart: ₺{standardPrice}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="bg-[#0A0E14] p-6 rounded-3xl border border-white/10 mb-6 text-center">
          <label className="text-xs text-gray-500 font-bold uppercase mb-2 block">Prime Time Fiyatı</label>
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl font-black text-gray-500">₺</span>
            <input
              type="number"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              className="bg-transparent text-5xl font-black text-white outline-none w-40 text-center border-b border-white/20 focus:border-amber-400 transition-colors"
            />
          </div>
          {newPrice > standardPrice && (
            <p className="text-sm text-amber-400 font-bold mt-3">
              +{newPrice - standardPrice}₺ ({Math.round(((newPrice - standardPrice) / standardPrice) * 100)}% artış)
            </p>
          )}
        </div>

        <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">
          Bu gün ve saat için özel tarife oluşturulur. Kalıcı tarife değişikliği için Menü → Tarife Politikası kullanın.
        </p>

        {error && <p className="text-sm text-red-400 font-bold mb-4">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 bg-amber-500 text-black font-black text-lg rounded-2xl hover:bg-amber-400 active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? 'KAYDEDİLİYOR...' : 'ÖZEL FİYATI KAYDET'}
        </button>
      </div>
    </div>
  );
};
