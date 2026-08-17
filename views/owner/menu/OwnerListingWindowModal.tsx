import React, { useEffect, useState } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { getListingCutoff, setListingCutoff, toTurkishError } from '../../../services/pitchOwnerService';
import { useOwnerToast } from '../components/useOwnerToast';
import { OwnerCenteredModal } from './OwnerModalFrame';

interface Props {
  onClose: () => void;
  facilityId: string;
  readOnly?: boolean;
}

// Kurucu kararı (16 Ağu 2026): saha sahibi ilk dönemde akşam saatlerini
// vitrine vermeyebilir. Buradan "uygulamada listelenen son saat" seçilir;
// bitişi bu saati aşan slotlar oyuncuya HİÇ görünmez ve uygulamadan rezerve
// edilemez. Sahibin kendi takvimi etkilenmez: akşamını elle kapatmaya ve
// deftere işlemeye devam eder. Kapalıyken sınır yoktur (her saat listelenir).
const CUTOFF_CHOICES = ['17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00', '02:00'] as const;

export const OwnerListingWindowModal: React.FC<Props> = ({ onClose, facilityId, readOnly }) => {
  const notify = useOwnerToast();
  const [cutoff, setCutoff] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const isRealPitch = !!facilityId && !facilityId.startsWith('mock-');

  useEffect(() => {
    if (!isRealPitch) {
      setIsLoading(false);
      return;
    }
    getListingCutoff(facilityId)
      .then(setCutoff)
      .catch((err) => notify(toTurkishError(err), 'error'))
      .finally(() => setIsLoading(false));
  }, [facilityId, isRealPitch, notify]);

  const handleSave = async () => {
    if (readOnly) return;
    setIsSaving(true);
    try {
      if (isRealPitch) await setListingCutoff(facilityId, cutoff);
      notify(cutoff ? `Listeleme sınırı ${cutoff} olarak kaydedildi.` : 'Sınır kaldırıldı — tüm saatler listelenir.', 'success');
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OwnerCenteredModal title="Uygulamada Listeleme Saati" onClose={onClose}>
      {isLoading ? (
        <p className="text-center text-gray-500 text-sm py-6">Yükleniyor…</p>
      ) : (
        <div className="space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-start gap-3">
            <AlertCircle size={18} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-200 leading-relaxed">
              Oyuncular uygulamada yalnız <b>bu saate kadar biten</b> slotları görür ve rezerve
              edebilir; sonraki saatler vitrine hiç çıkmaz. Kendi takvimin etkilenmez —
              akşam saatlerini elle kapatmaya ve deftere işlemeye devam edersin.
              Sınır yokken tüm açık saatlerin listelenir.
            </p>
          </div>

          {/* Sınır anahtarı */}
          <div className="bg-[#0A0E14] p-5 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-white">Saat Sınırı</h4>
              <p className="text-[10px] text-gray-500 mt-0.5">Kapalı: tüm açık saatler listelenir</p>
            </div>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setCutoff((v) => (v ? null : '20:00'))}
              className={`w-14 h-8 rounded-full relative transition-colors disabled:opacity-50 ${cutoff ? 'bg-emerald-500' : 'bg-gray-600'}`}
            >
              <span className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white transition-transform ${cutoff ? 'translate-x-6' : ''}`} />
            </button>
          </div>

          {cutoff && (
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-gray-500 uppercase">Listelenen son saat</label>
              <div className="grid grid-cols-5 gap-2">
                {CUTOFF_CHOICES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={readOnly}
                    onClick={() => setCutoff(t)}
                    className={`h-11 rounded-xl border text-xs font-extrabold transition-all disabled:opacity-50 ${
                      cutoff === t
                        ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-400'
                        : 'bg-[#0A0E14] border-white/5 text-white/70'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed bg-white/5 rounded-xl p-3">
                Özet: oyuncular en geç <b>{cutoff}</b>&apos;da biten slotu rezerve edebilir.
                {cutoff === '00:00' || cutoff < '06:00'
                  ? ' Gece yarısını aşan saatler de bu sınıra göre okunur (gece, akşamın devamıdır).'
                  : ` ${cutoff} sonrası ve gece yarısı slotları vitrine çıkmaz.`}
              </p>
            </div>
          )}

          {!readOnly && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="w-full py-4 bg-blue-600 text-white font-extrabold rounded-2xl hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {!cutoff && <RotateCcw size={16} />}
              {isSaving ? 'Kaydediliyor…' : cutoff ? 'Kaydet' : 'Sınırsız Listele'}
            </button>
          )}
        </div>
      )}
    </OwnerCenteredModal>
  );
};
