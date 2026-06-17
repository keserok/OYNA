import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Banknote, Camera, Trash2, Wallet, X } from 'lucide-react';
import { getOwnerBalance, requestWithdrawal, toTurkishError } from '../../../services/pitchOwnerService';
import { useOwnerToast } from '../components/useOwnerToast';

interface Props {
  onClose: () => void;
  facilityId: string;
  readOnly?: boolean;
}

export const OwnerWithdrawalsModal: React.FC<Props> = ({
  onClose,
  facilityId,
  readOnly = false,
}) => {
  const notify = useOwnerToast();
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [iban, setIban] = useState('');
  const [ibanPhoto, setIbanPhoto] = useState<string | null>(null);
  const [ibanPhotoFile, setIbanPhotoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [availableBalance, setAvailableBalance] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isRealPitch = !!facilityId && !facilityId.startsWith('mock-');

  useEffect(() => {
    let active = true;
    if (!isRealPitch) {
      setAvailableBalance(12500);
      return;
    }
    getOwnerBalance(facilityId)
      .then((bal) => {
        if (active) setAvailableBalance(bal.available);
      })
      .catch(() => {
        if (active) setAvailableBalance(0);
      });
    return () => {
      active = false;
    };
  }, [facilityId, isRealPitch]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIbanPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setIbanPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleWithdraw = async () => {
    if (readOnly) return;
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify('Geçerli bir tutar girin.', 'error');
      return;
    }
    if (!iban.trim()) {
      notify('IBAN numarası gerekli.', 'error');
      return;
    }
    if (amount > availableBalance) {
      notify('Tutar bakiyenizden fazla olamaz.', 'error');
      return;
    }
    setIsProcessing(true);
    try {
      if (isRealPitch) {
        await requestWithdrawal(facilityId, amount, iban, ibanPhotoFile ?? undefined);
      } else {
        await new Promise((r) => setTimeout(r, 800));
      }
      notify('Para çekme talebiniz alındı.', 'success');
      setTimeout(onClose, 1200);
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0A0D14] flex flex-col animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-[#161B22] p-4 flex justify-between items-center border-b border-white/5 safe-area-top">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/5 text-white">
            <X size={20} />
          </button>
          <h2 className="text-white font-bold text-lg">Para Çekme</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 max-w-2xl mx-auto w-full space-y-8">
        <div className="bg-gradient-to-br from-blue-900/40 to-emerald-900/30 p-6 rounded-3xl border border-blue-500/20 relative overflow-hidden">
          <Wallet size={64} className="absolute top-0 right-0 p-4 opacity-10 text-white" />
          <p className="text-blue-200 text-sm font-bold mb-1">Çekilebilir Bakiye</p>
          <h3 className="text-4xl font-black text-white">
            ₺{availableBalance.toLocaleString('tr-TR')}
          </h3>
        </div>

        <div className="space-y-4">
          <div className="bg-[#161B22] p-5 rounded-2xl border border-white/5">
            <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Tutar (TL)</label>
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              disabled={readOnly}
              className="w-full bg-transparent text-white font-bold text-2xl outline-none"
              placeholder="0"
            />
          </div>
          <div className="bg-[#161B22] p-5 rounded-2xl border border-white/5">
            <label className="text-xs font-bold text-gray-400 uppercase block mb-2">IBAN</label>
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              disabled={readOnly}
              className="w-full bg-transparent text-white font-mono text-lg outline-none tracking-wider"
              placeholder="TR00 0000 0000 0000 0000 0000 00"
            />
          </div>
          <div className="bg-[#161B22] p-5 rounded-2xl border border-white/5">
            <label className="text-xs font-bold text-gray-400 uppercase block mb-3">
              IBAN Fotoğrafı (isteğe bağlı)
            </label>
            {ibanPhoto ? (
              <div className="relative w-full h-40 rounded-xl overflow-hidden border border-white/10">
                <img src={ibanPhoto} alt="IBAN" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setIbanPhoto(null);
                    setIbanPhotoFile(null);
                  }}
                  className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={readOnly}
                className="w-full h-28 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-white"
              >
                <Camera size={28} />
                <span className="text-sm font-bold">Fotoğraf Yükle</span>
              </button>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoUpload}
              accept="image/*"
              className="hidden"
            />
          </div>
        </div>

        {readOnly && (
          <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-xs text-amber-200 flex items-center gap-2">
            <AlertCircle size={16} /> Salt okunur modda para çekme yapılamaz.
          </div>
        )}

        <button
          type="button"
          onClick={handleWithdraw}
          disabled={
            readOnly ||
            isProcessing ||
            !withdrawAmount ||
            !iban ||
            Number(withdrawAmount) <= 0 ||
            Number(withdrawAmount) > availableBalance
          }
          className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black text-lg flex items-center justify-center gap-2 hover:bg-blue-500 disabled:opacity-50"
        >
          {isProcessing ? 'İşleniyor...' : (
            <>
              <Banknote size={22} /> Para Çek
            </>
          )}
        </button>
      </div>
    </div>
  );
};
