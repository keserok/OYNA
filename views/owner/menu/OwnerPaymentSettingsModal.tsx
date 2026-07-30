import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { getPaymentSettings, savePaymentSettings, toTurkishError } from '../../../services/pitchOwnerService';
import { useOwnerToast } from '../components/useOwnerToast';
import { OwnerFullscreenModal } from './OwnerModalFrame';

interface Props {
  onClose: () => void;
  facilityId: string;
  onSave: (data: {
    paymentOptions: { online: boolean; deposit: boolean; cash: boolean };
    paramMerchantId: string;
    paramApiKey: string;
    paramClientId: string;
  }) => void;
}

export const OwnerPaymentSettingsModal: React.FC<Props> = ({ onClose, facilityId, onSave }) => {
  const notify = useOwnerToast();
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
    getPaymentSettings(facilityId)
      .then((s) => {
        setOnline(s.paymentOptions.online);
        setDeposit(s.paymentOptions.deposit);
        setCash(s.paymentOptions.cash);
        setParamMerchantId(s.paramMerchantId);
        setParamApiKey(s.paramApiKey);
        setParamClientId(s.paramClientId);
      })
      .catch((err) => notify(toTurkishError(err), 'error'))
      .finally(() => setIsLoading(false));
  }, [facilityId, isRealPitch, notify]);

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
  }: {
    value: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`w-14 h-8 rounded-full relative transition-all ${value ? 'bg-blue-600' : 'bg-white/10'}`}
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
      title="Param Ödeme Entegrasyonu"
      onClose={onClose}
      onSave={handleSave}
      isSaving={isSaving}
    >
      <div className="max-w-xl mx-auto space-y-6">
        {isLoading ? (
          <p className="text-center text-gray-500 text-sm py-8">Ayarlar yükleniyor…</p>
        ) : (
          <>
            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-start gap-3">
              <AlertCircle size={18} className="text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-200">
                Ödeme tercihleri ve Param bilgileri doğrudan tesis kaydına yazılır.
              </p>
            </div>

            <div className="bg-[#161B22] p-5 rounded-3xl border border-white/5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div>
                  <h4 className="text-sm font-bold text-white">%100 Online Ödeme</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">Rezervasyonda tam tutar tahsil edilir</p>
                </div>
                <Toggle value={online} onChange={setOnline} />
              </div>
              <div className="flex items-center justify-between py-3 border-b border-white/5">
                <div>
                  <h4 className="text-sm font-bold text-white">Kapora ile Ödeme</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">Yalnızca kapora online alınır</p>
                </div>
                <Toggle value={deposit} onChange={setDeposit} />
              </div>
              <div className="flex items-center justify-between pt-3">
                <div>
                  <h4 className="text-sm font-bold text-white">Sahada Nakit/Kart</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">Ödeme sahada tahsil edilir</p>
                </div>
                <Toggle value={cash} onChange={setCash} />
              </div>
            </div>

            {(online || deposit) && (
              <div className="bg-[#161B22] p-6 rounded-3xl border border-white/5 space-y-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase">Param Sanal POS</h3>
                <input
                  type="text"
                  value={paramMerchantId}
                  onChange={(e) => setParamMerchantId(e.target.value)}
                  placeholder="Merchant ID"
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white text-sm font-mono outline-none focus:border-blue-500/40"
                />
                <input
                  type="password"
                  value={paramApiKey}
                  onChange={(e) => setParamApiKey(e.target.value)}
                  placeholder="API Key"
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white text-sm font-mono outline-none focus:border-blue-500/40"
                />
                <input
                  type="text"
                  value={paramClientId}
                  onChange={(e) => setParamClientId(e.target.value)}
                  placeholder="Client ID"
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white text-sm font-mono outline-none focus:border-blue-500/40"
                />
              </div>
            )}
          </>
        )}
      </div>
    </OwnerFullscreenModal>
  );
};
