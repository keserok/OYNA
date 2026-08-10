import React, { useState } from 'react';
import { AlertCircle, Check, X } from 'lucide-react';
import { saveWorkingHours, toTurkishError, type WorkingDay } from '../../../services/pitchOwnerService';
import { useOwnerToast } from '../components/useOwnerToast';
import { OwnerFullscreenModal } from './OwnerModalFrame';
import { DEFAULT_WORKING_DAYS, type OwnerWorkingDay } from './ownerMenuTypes';

interface Props {
  onClose: () => void;
  facilityId: string;
  isOpen: boolean;
  onToggleOpen: () => void;
  initialHours?: OwnerWorkingDay[];
  onSave: (days: OwnerWorkingDay[]) => void;
}

export const OwnerWorkingHoursModal: React.FC<Props> = ({
  onClose,
  facilityId,
  isOpen,
  onToggleOpen,
  initialHours,
  onSave,
}) => {
  const notify = useOwnerToast();
  const [days, setDays] = useState<OwnerWorkingDay[]>(() => {
    if (Array.isArray(initialHours) && initialHours.length > 0) {
      return initialHours.map((d) => ({
        name: String(d.name ?? ''),
        open: String(d.open ?? '08:00').slice(0, 5),
        close: String(d.close ?? '23:00').slice(0, 5),
        closed: Boolean(d.closed),
      }));
    }
    return DEFAULT_WORKING_DAYS;
  });
  const [isSaving, setIsSaving] = useState(false);

  const updateDay = (index: number, field: keyof OwnerWorkingDay, value: string | boolean) => {
    setDays((prev) =>
      prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)),
    );
  };

  const handleSave = async () => {
    if (!facilityId) return;
    setIsSaving(true);
    try {
      if (!facilityId.startsWith('mock-')) {
        const payload: WorkingDay[] = days.map((d) => ({
          name: d.name,
          open: d.open,
          close: d.close,
          closed: d.closed ?? false,
        }));
        await saveWorkingHours(facilityId, payload);
      }
      onSave(days);
      notify('Çalışma saatleri kaydedildi.', 'success');
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OwnerFullscreenModal
      title="Çalışma Saatleri"
      onClose={onClose}
      onSave={handleSave}
      isSaving={isSaving}
    >
      <div className="max-w-xl mx-auto space-y-6">
        <div className="bg-surface-1 p-6 rounded-[32px] border border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-white">Tesis Durumu</h3>
            <p className="text-[10px] text-ink-4 font-bold uppercase">Anlık açık / kapalı</p>
          </div>
          <button
            type="button"
            onClick={onToggleOpen}
            className={`w-20 h-10 rounded-full relative transition-all ${
              isOpen ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          >
            <div
              className={`absolute top-1 w-8 h-8 bg-white rounded-full transition-all flex items-center justify-center ${
                isOpen ? 'right-1' : 'left-1'
              }`}
            >
              {isOpen ? (
                <Check size={16} className="text-emerald-500" />
              ) : (
                <X size={16} className="text-red-500" />
              )}
            </div>
          </button>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-start gap-3">
          <AlertCircle size={18} className="text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-200">
            Kapalı günleri işaretleyebilir veya saat aralıklarını düzenleyebilirsin. Değişiklikler
            yeni rezervasyonlara yansır.
          </p>
        </div>

        <div className="space-y-3">
          {days.map((day, idx) => (
            <div
              key={day.name}
              className={`bg-surface-1 p-4 rounded-2xl border border-white/5 ${
                day.closed ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-white">{day.name}</span>
                <label className="flex items-center gap-2 text-[10px] font-bold text-gray-400">
                  <input
                    type="checkbox"
                    checked={!!day.closed}
                    onChange={(e) => updateDay(idx, 'closed', e.target.checked)}
                    className="rounded"
                  />
                  Kapalı
                </label>
              </div>
              {!day.closed && (
                <div className="flex items-center gap-3">
                  <input
                    type="time"
                    value={day.open}
                    onChange={(e) => updateDay(idx, 'open', e.target.value)}
                    className="flex-1 bg-bg border border-white/5 px-3 py-2 rounded-xl text-white text-sm font-mono outline-none"
                  />
                  <span className="text-ink-4">—</span>
                  <input
                    type="time"
                    value={day.close}
                    onChange={(e) => updateDay(idx, 'close', e.target.value)}
                    className="flex-1 bg-bg border border-white/5 px-3 py-2 rounded-xl text-white text-sm font-mono outline-none"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </OwnerFullscreenModal>
  );
};
