import React, { useEffect, useState } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import {
  getPitchRefundPolicy,
  setPitchRefundPolicy,
  toTurkishError,
} from '../../../services/pitchOwnerService';
import { useOwnerToast } from '../components/useOwnerToast';
import { OwnerCenteredModal } from './OwnerModalFrame';

interface Props {
  onClose: () => void;
  facilityId: string;
  readOnly?: boolean;
}

// [S2.6-FE] Saha sahibi kendi iptal/iade politikasını belirler. Boşsa (özel
// kapalı) OYNA global varsayılanı geçerli: ≥24s %100 · 6-24s %50 · <6s iade yok.
// Oyuncu tarafı bu politikayı ödeme ekranında/iptalde otomatik görür (SSOT).
export const OwnerCancellationPolicyModal: React.FC<Props> = ({ onClose, facilityId, readOnly }) => {
  const notify = useOwnerToast();
  const [custom, setCustom] = useState(false);
  const [fullHours, setFullHours] = useState(24);
  const [halfHours, setHalfHours] = useState(6);
  const [halfPct, setHalfPct] = useState(50);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const isRealPitch = !!facilityId && !facilityId.startsWith('mock-');

  useEffect(() => {
    if (!isRealPitch) {
      setIsLoading(false);
      return;
    }
    getPitchRefundPolicy(facilityId)
      .then((p) => {
        setCustom(p.is_custom);
        setFullHours(p.full_hours);
        setHalfHours(p.half_hours);
        setHalfPct(p.half_pct);
      })
      .catch((err) => notify(toTurkishError(err), 'error'))
      .finally(() => setIsLoading(false));
  }, [facilityId, isRealPitch, notify]);

  const handleSave = async () => {
    if (readOnly) return;
    if (custom && halfHours > fullHours) {
      notify('Yarım-iade saati tam-iade saatinden büyük olamaz.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      if (isRealPitch) {
        await setPitchRefundPolicy(
          facilityId,
          custom ? { full_hours: fullHours, half_hours: halfHours, half_pct: halfPct } : null,
        );
      }
      notify(custom ? 'İptal politikası kaydedildi.' : 'Global varsayılana dönüldü.', 'success');
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <OwnerCenteredModal title="İptal / İade Politikası" onClose={onClose}>
      {isLoading ? (
        <p className="text-center text-ink-4 text-sm py-6">Yükleniyor…</p>
      ) : (
        <div className="space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-start gap-3">
            <AlertCircle size={18} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-200 leading-relaxed">
              Oyuncular rezervasyonu iptal ettiğinde ne kadar iade alacağını burada belirlersin.
              Kapalıyken OYNA varsayılanı geçerlidir: <b>≥24 saat %100</b>, <b>6–24 saat %50</b>, <b>&lt;6 saat iade yok</b>.
              Oyuncu bu koşulları ödeme ve iptal ekranında görür.
            </p>
          </div>

          {/* Özel politika anahtarı */}
          <div className="bg-bg p-5 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-white">Özel Politika</h4>
              <p className="text-[10px] text-ink-4 mt-0.5">Kapalı: OYNA varsayılanı kullanılır</p>
            </div>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setCustom((v) => !v)}
              className={`w-14 h-8 rounded-full relative transition-colors disabled:opacity-50 ${custom ? 'bg-emerald-500' : 'bg-gray-600'}`}
            >
              <span className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white transition-transform ${custom ? 'translate-x-6' : ''}`} />
            </button>
          </div>

          {custom && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-ink-4 uppercase">Tam iade (%100) — bu saatten önce iptalde</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={720} inputMode="numeric"
                    value={fullHours}
                    disabled={readOnly}
                    onChange={(e) => setFullHours(num(e.target.value, 24))}
                    className="w-full bg-bg border border-white/5 rounded-xl px-4 py-3 text-white font-bold outline-none disabled:opacity-50"
                  />
                  <span className="text-xs text-ink-4 font-bold">saat</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-ink-4 uppercase">Yarım iade — bu saatten önce iptalde</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={720} inputMode="numeric"
                    value={halfHours}
                    disabled={readOnly}
                    onChange={(e) => setHalfHours(num(e.target.value, 6))}
                    className="w-full bg-bg border border-white/5 rounded-xl px-4 py-3 text-white font-bold outline-none disabled:opacity-50"
                  />
                  <span className="text-xs text-ink-4 font-bold">saat</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-ink-4 uppercase">Yarım iade yüzdesi</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={100} inputMode="numeric"
                    value={halfPct}
                    disabled={readOnly}
                    onChange={(e) => setHalfPct(num(e.target.value, 50))}
                    className="w-full bg-bg border border-white/5 rounded-xl px-4 py-3 text-white font-bold outline-none disabled:opacity-50"
                  />
                  <span className="text-xs text-ink-4 font-bold">%</span>
                </div>
              </div>
              <p className="text-[11px] text-ink-4 leading-relaxed bg-white/5 rounded-xl p-3">
                Özet: <b>≥{fullHours} saat</b> önce iptal → %100 · <b>{halfHours}–{fullHours} saat</b> → %{halfPct} · <b>&lt;{halfHours} saat</b> → iade yok.
                <br />İade edilen tutardan ödeme altyapısı kesintisi düşülür (oyuncuya net gösterilir).
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
              {!custom && <RotateCcw size={16} />}
              {isSaving ? 'Kaydediliyor…' : custom ? 'Kaydet' : 'Global Varsayılanı Kullan'}
            </button>
          )}
        </div>
      )}
    </OwnerCenteredModal>
  );
};
