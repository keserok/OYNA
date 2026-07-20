import React, { useState } from 'react';
import { X, User, Phone, RefreshCw } from 'lucide-react';
import { addSubscription, toTurkishError } from '../../services/pitchOwnerService';
import type { PitchCourt } from '../../types';
import { addMonthsISO, resolveHourlyPrice, slotKeyToTime } from './ownerCalendarHelpers';

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const DURATION_OPTIONS = [1, 3, 6, 12] as const;

interface OwnerSubscriptionModalProps {
  pitchId: string;
  courts: PitchCourt[];
  defaultCourtId?: string;
  timeSlots: string[];
  pricingPolicy?: Array<{ startTime: string; endTime: string; price?: number; price_per_hour?: number }>;
  onClose: () => void;
  onCreated: () => void;
}

export const OwnerSubscriptionModal: React.FC<OwnerSubscriptionModalProps> = ({
  pitchId,
  courts,
  defaultCourtId,
  timeSlots,
  pricingPolicy,
  onClose,
  onCreated,
}) => {
  const activeCourts = courts.filter((c) => c.is_active !== false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [weekdayIdx, setWeekdayIdx] = useState(0);
  const [timeSlot, setTimeSlot] = useState(timeSlots[18] ?? '18.00');
  const [courtId, setCourtId] = useState(defaultCourtId ?? activeCourts[0]?.id ?? '');
  const [durationMonths, setDurationMonths] = useState<number>(3);
  const [price, setPrice] = useState(() => {
    const hour = parseInt((timeSlots[18] ?? '18.00').split('.')[0], 10);
    return resolveHourlyPrice(hour, pricingPolicy) ?? 0;
  });
  const [notes, setNotes] = useState('');
  const [autoRenew, setAutoRenew] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTimeChange = (t: string) => {
    setTimeSlot(t);
    const hour = parseInt(t.split('.')[0], 10);
    setPrice(resolveHourlyPrice(hour, pricingPolicy) ?? 0);
  };

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      setError('Müşteri adı zorunludur.');
      return;
    }
    if (!courtId) {
      setError('Saha seçin.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const startTime = slotKeyToTime(timeSlot);
      const hour = parseInt(startTime.split(':')[0], 10);
      const endTime = `${((hour + 1) % 24).toString().padStart(2, '0')}:00`;
      const startDate = new Date().toISOString().slice(0, 10);
      await addSubscription(pitchId, {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || undefined,
        weekday: weekdayIdx + 1,
        start_time: startTime,
        end_time: endTime,
        price: Number(price) || 0,
        court_id: courtId,
        start_date: startDate,
        end_date: addMonthsISO(startDate, durationMonths),
        notes: notes.trim() || undefined,
        auto_renew: autoRenew,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(toTurkishError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="bg-[#161B22] w-full max-w-md rounded-[40px] border border-white/10 p-8 animate-in zoom-in duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-2xl font-black text-white italic tracking-tight">YENİ ABONMAN</h3>
          <button type="button" onClick={onClose} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Müşteri</label>
            <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl flex items-center gap-3">
              <User size={20} className="text-gray-500 shrink-0" />
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ad Soyad / Takım Adı"
                className="bg-transparent w-full outline-none text-white font-bold"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Telefon (opsiyonel)</label>
            <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl flex items-center gap-3">
              <Phone size={20} className="text-gray-500 shrink-0" />
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="05xx xxx xx xx"
                className="bg-transparent w-full outline-none text-white font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Saha</label>
            <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl">
              <select
                value={courtId}
                onChange={(e) => setCourtId(e.target.value)}
                className="bg-transparent w-full outline-none text-white font-bold appearance-none"
              >
                {activeCourts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Gün</label>
              <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl">
                <select
                  value={weekdayIdx}
                  onChange={(e) => setWeekdayIdx(Number(e.target.value))}
                  className="bg-transparent w-full outline-none text-white font-bold appearance-none"
                >
                  {DAY_LABELS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Saat</label>
              <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl">
                <select
                  value={timeSlot}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  className="bg-transparent w-full outline-none text-white font-bold appearance-none"
                >
                  {timeSlots.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Saatlik ücret (₺)</label>
            <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl">
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="bg-transparent w-full outline-none text-white font-black text-xl"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Süre</label>
            <div className="flex gap-2">
              {DURATION_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDurationMonths(m)}
                  className={`flex-1 py-3 border rounded-xl text-xs font-bold transition-colors ${
                    durationMonths === m
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-[#0A0E14] border-white/5 text-gray-400 hover:border-blue-500/40'
                  }`}
                >
                  {m} Ay
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAutoRenew((v) => !v)}
            className={`w-full flex items-center justify-between gap-3 p-4 rounded-2xl border transition-colors ${
              autoRenew
                ? 'bg-blue-600/10 border-blue-500/40'
                : 'bg-[#0A0E14] border-white/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <RefreshCw size={18} className={autoRenew ? 'text-blue-400' : 'text-gray-500'} />
              <div className="text-left">
                <p className="text-xs font-black text-white">Otomatik Yenileme</p>
                <p className="text-[10px] text-gray-500 font-bold">Süre dolunca abonelik kendiliğinden uzar</p>
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full p-0.5 transition-colors ${autoRenew ? 'bg-blue-600' : 'bg-white/10'}`}>
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${autoRenew ? 'translate-x-5' : ''}`} />
            </div>
          </button>

          {error && <p className="text-sm text-red-400 font-bold">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="w-full h-16 bg-blue-600 text-white font-black text-lg rounded-2xl shadow-xl shadow-blue-900/20 hover:bg-blue-500 transition-all disabled:opacity-50"
          >
            {saving ? 'KAYDEDİLİYOR...' : 'ABONMANI OLUŞTUR'}
          </button>
        </div>
      </div>
    </div>
  );
};
