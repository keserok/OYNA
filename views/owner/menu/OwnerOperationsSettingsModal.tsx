import React, { useEffect, useState } from 'react';
import { AlertCircle, Clock } from 'lucide-react';
import {
  getPitchOperationsSettings,
  toTurkishError,
  updatePitchOperationsSettings,
} from '../../../services/pitchOwnerService';
import { useOwnerToast } from '../components/useOwnerToast';
import { OwnerCenteredModal } from './OwnerModalFrame';

interface Props {
  onClose: () => void;
  facilityId: string;
  onUpdated: (settings: { autoApproveEnabled: boolean; autoApproveMinutes: number }) => void;
}

const MINUTE_OPTIONS = [15, 20, 30, 35, 45, 60, 90, 120];

export const OwnerOperationsSettingsModal: React.FC<Props> = ({
  onClose,
  facilityId,
  onUpdated,
}) => {
  const notify = useOwnerToast();
  const [enabled, setEnabled] = useState(true);
  const [minutes, setMinutes] = useState(35);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const isRealPitch = !!facilityId && !facilityId.startsWith('mock-');

  useEffect(() => {
    if (!isRealPitch) {
      setIsLoading(false);
      return;
    }
    getPitchOperationsSettings(facilityId)
      .then((s) => {
        setEnabled(s.auto_approve_enabled);
        setMinutes(s.auto_approve_minutes);
      })
      .catch((err) => notify(toTurkishError(err), 'error'))
      .finally(() => setIsLoading(false));
  }, [facilityId, isRealPitch, notify]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (isRealPitch) {
        await updatePitchOperationsSettings(facilityId, {
          auto_approve_enabled: enabled,
          auto_approve_minutes: minutes,
        });
      }
      onUpdated({ autoApproveEnabled: enabled, autoApproveMinutes: minutes });
      notify('Rezervasyon ayarları kaydedildi.', 'success');
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OwnerCenteredModal title="Rezervasyon İşlemleri" onClose={onClose}>
      {isLoading ? (
        <p className="text-center text-gray-500 text-sm py-6">Yükleniyor...</p>
      ) : (
        <div className="space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-start gap-3">
            <AlertCircle size={18} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-200">
              Otomatik onay açıkken bekleyen talepler belirlediğiniz süre sonunda onaylanır.
              Kapalıyken tüm talepler manuel onay bekler.
            </p>
          </div>

          <div className="bg-[#0A0E14] p-5 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-white">Otomatik Onay</h4>
              <p className="text-[10px] text-gray-500 mt-0.5">Süre dolunca otomatik onayla</p>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={`w-14 h-8 rounded-full relative transition-colors ${
                enabled ? 'bg-emerald-500' : 'bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1">
              <Clock size={12} /> Onay Süresi (dakika)
            </label>
            <select
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              disabled={!enabled}
              className="w-full bg-[#0A0E14] border border-white/5 rounded-xl px-4 py-3 text-white font-bold outline-none disabled:opacity-50"
            >
              {MINUTE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} dakika
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-500 disabled:opacity-50"
          >
            {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      )}
    </OwnerCenteredModal>
  );
};
