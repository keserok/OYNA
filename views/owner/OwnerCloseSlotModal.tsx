import React, { useState } from 'react';
import { X, Lock } from 'lucide-react';
import { closeSlot, toTurkishError } from '../../services/pitchOwnerService';
import { slotKeyToTime } from './ownerCalendarHelpers';

type ExceptionType = 'MAINTENANCE' | 'PRIVATE_EVENT' | 'HOLIDAY' | 'EMERGENCY' | 'OTHER';

const EXCEPTION_LABELS: Record<ExceptionType, string> = {
  MAINTENANCE: 'Bakım',
  PRIVATE_EVENT: 'Özel Etkinlik',
  HOLIDAY: 'Tatil',
  EMERGENCY: 'Acil',
  OTHER: 'Diğer',
};

interface OwnerCloseSlotModalProps {
  pitchId: string;
  courtId: string;
  bookingDate: string;
  timeKey: string;
  courtName?: string;
  onClose: () => void;
  onClosed: () => void;
}

export const OwnerCloseSlotModal: React.FC<OwnerCloseSlotModalProps> = ({
  pitchId,
  courtId,
  bookingDate,
  timeKey,
  courtName,
  onClose,
  onClosed,
}) => {
  const [reason, setReason] = useState('');
  const [exceptionType, setExceptionType] = useState<ExceptionType>('MAINTENANCE');
  const [closeFullDay, setCloseFullDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startTime = slotKeyToTime(timeKey);
  const hour = parseInt(startTime.split(':')[0], 10);
  const endTime = `${((hour + 1) % 24).toString().padStart(2, '0')}:00`;

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await closeSlot({
        pitchId,
        courtId,
        date: bookingDate,
        startTime: closeFullDay ? undefined : startTime,
        endTime: closeFullDay ? undefined : endTime,
        reason: reason.trim() || undefined,
        exceptionType,
      });
      onClosed();
      onClose();
    } catch (err) {
      setError(toTurkishError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200">
      <div className="bg-surface-1 w-full max-w-md rounded-t-[32px] border-t border-white/10 p-6 animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
              <Lock size={20} className="text-red-400" /> Slot Kapat
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              {courtName ?? 'Saha'} • {bookingDate} • {closeFullDay ? 'Tüm gün' : `${timeKey} - ${endTime.replace(':', '.')}`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div className="space-y-2">
            <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest ml-1">Kapanma nedeni</label>
            <div className="bg-bg border border-white/5 p-4 rounded-2xl">
              <select
                value={exceptionType}
                onChange={(e) => setExceptionType(e.target.value as ExceptionType)}
                className="bg-transparent w-full outline-none text-white font-bold appearance-none"
              >
                {(Object.keys(EXCEPTION_LABELS) as ExceptionType[]).map((key) => (
                  <option key={key} value={key}>
                    {EXCEPTION_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest ml-1">Not (opsiyonel)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Örn: Çim bakımı"
              className="w-full bg-bg border border-white/5 p-4 rounded-2xl text-white text-sm outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-between bg-bg p-4 rounded-2xl border border-white/5">
            <div>
              <p className="text-xs font-extrabold text-white uppercase">Tüm günü kapat</p>
              <p className="text-[9px] text-gray-500 font-bold mt-1">Seçili saha için gün boyunca rezervasyon alınmaz</p>
            </div>
            <button
              type="button"
              onClick={() => setCloseFullDay(!closeFullDay)}
              className={`w-12 h-6 rounded-full relative transition-all duration-300 ${closeFullDay ? 'bg-red-500' : 'bg-white/10'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all duration-300 ${closeFullDay ? 'right-0.5' : 'left-0.5'}`} />
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-400 font-bold mb-4">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="w-full py-4 bg-red-600 text-white font-extrabold text-lg rounded-2xl hover:bg-red-500 active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? 'KAPATILIYOR…' : 'SLOTU KAPAT'}
        </button>
      </div>
    </div>
  );
};
