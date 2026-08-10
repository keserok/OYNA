import React, { useEffect, useState } from 'react';
import { AlertCircle, Banknote, Lock, Users, Wallet } from 'lucide-react';
import { getPaymentSettings, savePaymentSettings, toTurkishError } from '../../../services/pitchOwnerService';
import {
  paymentModeDescription,
  paymentModeReasonText,
  resolvePaymentMode,
  setOwnerPaymentMode,
} from '../../../services/paymentModeService';
import type { PaymentMode, PaymentModeResolution } from '../../../types';
import { useOwnerToast } from '../components/useOwnerToast';
import { OwnerFullscreenModal } from './OwnerModalFrame';

interface Props {
  onClose: () => void;
  facilityId: string;
  readOnly?: boolean;
  onSave: (data: {
    paymentOptions: { online: boolean; deposit: boolean; cash: boolean };
    paramMerchantId: string;
    paramApiKey: string;
    paramClientId: string;
  }) => void;
}

const MODE_CHOICES: { value: PaymentMode; label: string; icon: React.ReactNode }[] = [
  { value: 'CASH_ONLY', label: 'Sahada Ödeme', icon: <Banknote size={16} /> },
  { value: 'ONLINE_ONLY', label: 'Online Ödeme', icon: <Wallet size={16} /> },
  { value: 'HYBRID', label: 'Oyuncu Seçsin', icon: <Users size={16} /> },
];

/**
 * Saha sahibinin ödeme modu ekranı.
 *
 * Burada gösterilen "şu an geçerli" değeri istemcide hesaplanmaz —
 * `resolve_payment_mode` RPC'sinden gelir. Sebebi: global mod bir tavandır ve
 * ödeme sağlayıcısı canlı değilken online ödeme hiçbir koşulda açılmaz. Sahibin
 * seçimi ile fiilî durum ayrıştığında bunu gizlemek yerine açıkça söyleriz.
 */
export const OwnerPaymentSettingsModal: React.FC<Props> = ({
  onClose,
  facilityId,
  readOnly = false,
  onSave,
}) => {
  const notify = useOwnerToast();
  const [mode, setMode] = useState<PaymentMode>('CASH_ONLY');
  const [resolution, setResolution] = useState<PaymentModeResolution | null>(null);
  const [online, setOnline] = useState(true);
  const [deposit, setDeposit] = useState(false);
  const [cash, setCash] = useState(true);
  const [paramMerchantId, setParamMerchantId] = useState('');
  const [paramApiKey, setParamApiKey] = useState('');
  const [paramClientId, setParamClientId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const isRealPitch = !!facilityId && !facilityId.startsWith('mock-');

  useEffect(() => {
    if (!isRealPitch) {
      setIsLoading(false);
      return;
    }
    Promise.all([getPaymentSettings(facilityId), resolvePaymentMode(facilityId)])
      .then(([s, res]) => {
        setOnline(s.paymentOptions.online);
        setDeposit(s.paymentOptions.deposit);
        setCash(s.paymentOptions.cash);
        setParamMerchantId(s.paramMerchantId);
        setParamApiKey(s.paramApiKey);
        setParamClientId(s.paramClientId);
        setResolution(res);
        if (res.pitch_mode) setMode(res.pitch_mode);
      })
      .catch((err) => notify(toTurkishError(err), 'error'))
      .finally(() => setIsLoading(false));
  }, [facilityId, isRealPitch, notify]);

  // Admin kilidi veya salt-okunur rol → mod seçimi kapalı.
  const modeLocked = readOnly || !!resolution?.locked;
  // Global mod HYBRID değilse (veya sağlayıcı canlı değilse) tesis tercihi fiiliyatı değiştirmez.
  const modeHasEffect = resolution?.global_mode === 'HYBRID' && resolution?.provider_live === true;
  const onlineAllowed = resolution?.online_allowed ?? false;
  const reasonText = resolution ? paymentModeReasonText(resolution) : null;
  const effectiveLabel = resolution
    ? MODE_CHOICES.find((m) => m.value === resolution.effective_mode)?.label
    : null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        paymentOptions: { online, deposit, cash },
        paramMerchantId,
        paramApiKey,
        paramClientId,
      };
      if (isRealPitch) {
        if (!modeLocked && mode !== resolution?.pitch_mode) {
          setResolution(await setOwnerPaymentMode(facilityId, mode));
        }
        await savePaymentSettings(facilityId, {
          paymentOptions: payload.paymentOptions,
          paramMerchantId,
          paramClientId,
          paramApiKey,
        });
      }
      onSave(payload);
      notify('Ödeme ayarları kaydedildi.', 'success');
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const Toggle = ({
    value,
    onChange,
    disabled,
  }: {
    value: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`w-14 h-8 rounded-full relative transition-all disabled:opacity-30 ${
        value ? 'bg-blue-600' : 'bg-white/10'
      }`}
    >
      <div
        className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${
          value ? 'right-1' : 'left-1'
        }`}
      />
    </button>
  );

  return (
    <OwnerFullscreenModal
      title="Ödeme Modu"
      onClose={onClose}
      onSave={readOnly ? undefined : handleSave}
      isSaving={isSaving}
    >
      <div className="max-w-xl mx-auto space-y-6">
        {isLoading ? (
          <p className="text-center text-gray-500 text-sm py-8">Ayarlar yükleniyor…</p>
        ) : (
          <>
            {/* ── Fiilî durum: sahibin gördüğü tek dürüst kaynak ───────────── */}
            {resolution && (
              <div
                className={`p-4 rounded-2xl border flex items-start gap-3 ${
                  onlineAllowed
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-amber-500/10 border-amber-500/20'
                }`}
              >
                <AlertCircle
                  size={18}
                  className={`shrink-0 mt-0.5 ${onlineAllowed ? 'text-emerald-400' : 'text-amber-400'}`}
                />
                <div className="min-w-0">
                  <p
                    className={`text-xs font-bold ${
                      onlineAllowed ? 'text-emerald-200' : 'text-amber-200'
                    }`}
                  >
                    Şu an geçerli: {effectiveLabel}
                  </p>
                  {reasonText && (
                    <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{reasonText}</p>
                  )}
                </div>
              </div>
            )}

            {resolution?.locked && (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-start gap-3">
                <Lock size={18} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-200">
                  Ödeme modu platform yöneticisi tarafından kilitlenmiş. Değiştirmek için destek ile
                  iletişime geçin.
                </p>
              </div>
            )}

            {/* ── Mod seçimi ───────────────────────────────────────────────── */}
            <div className="bg-surface-1 p-5 rounded-3xl border border-white/5 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase">Tesisinizin Ödeme Modu</h3>
              <div className="grid grid-cols-3 gap-2">
                {MODE_CHOICES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    disabled={modeLocked}
                    onClick={() => setMode(c.value)}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl border text-[11px] font-bold transition-all disabled:opacity-40 ${
                      mode === c.value
                        ? 'bg-blue-600/20 border-blue-500/40 text-blue-200'
                        : 'bg-black/30 border-white/5 text-gray-400 hover:border-white/15'
                    }`}
                  >
                    {c.icon}
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">{paymentModeDescription(mode)}</p>
              {!modeHasEffect && !modeLocked && (
                <p className="text-[11px] text-amber-400/80 leading-relaxed">
                  Seçimin kaydedilir, ancak platform şu anda tesis tercihine izin vermediği için hemen
                  etkili olmaz. Platform hibrit moda geçtiğinde otomatik devreye girer.
                </p>
              )}
            </div>

            {/* ── Online alt tercihleri: yalnız online açıkken anlamlı ─────── */}
            {onlineAllowed && (
              <div className="bg-surface-1 p-5 rounded-3xl border border-white/5 space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase">Online Tahsilat Biçimi</h3>
                <div className="flex items-center justify-between pb-3 border-b border-white/5">
                  <div>
                    <h4 className="text-sm font-bold text-white">%100 Online Ödeme</h4>
                    <p className="text-[10px] text-gray-500 mt-0.5">Rezervasyonda tam tutar tahsil edilir</p>
                  </div>
                  <Toggle value={online} onChange={setOnline} disabled={readOnly} />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-white/5">
                  <div>
                    <h4 className="text-sm font-bold text-white">Kapora ile Ödeme</h4>
                    <p className="text-[10px] text-gray-500 mt-0.5">Yalnızca kapora online alınır</p>
                  </div>
                  <Toggle value={deposit} onChange={setDeposit} disabled={readOnly} />
                </div>
                <div className="flex items-center justify-between pt-3">
                  <div>
                    <h4 className="text-sm font-bold text-white">Kalanı Sahada</h4>
                    <p className="text-[10px] text-gray-500 mt-0.5">Bakiye tesiste tahsil edilir</p>
                  </div>
                  <Toggle value={cash} onChange={setCash} disabled={readOnly} />
                </div>
              </div>
            )}

            {onlineAllowed && (online || deposit) && (
              <div className="bg-surface-1 p-6 rounded-3xl border border-white/5 space-y-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase">Param Sanal POS</h3>
                <input
                  type="text"
                  value={paramMerchantId}
                  onChange={(e) => setParamMerchantId(e.target.value)}
                  placeholder="Merchant ID"
                  disabled={readOnly}
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white text-sm font-mono outline-none focus:border-blue-500/40 disabled:opacity-40"
                />
                <input
                  type="password"
                  value={paramApiKey}
                  onChange={(e) => setParamApiKey(e.target.value)}
                  placeholder="API Key"
                  disabled={readOnly}
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white text-sm font-mono outline-none focus:border-blue-500/40 disabled:opacity-40"
                />
                <input
                  type="text"
                  value={paramClientId}
                  onChange={(e) => setParamClientId(e.target.value)}
                  placeholder="Client ID"
                  disabled={readOnly}
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white text-sm font-mono outline-none focus:border-blue-500/40 disabled:opacity-40"
                />
              </div>
            )}
          </>
        )}
      </div>
    </OwnerFullscreenModal>
  );
};
