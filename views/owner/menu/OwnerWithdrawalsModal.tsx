import React, { useEffect, useState } from 'react';
import { AlertCircle, Banknote, Clock, Lock, Wallet, X } from 'lucide-react';
import { getOwnerBalance, getBankAccounts, requestWithdrawal, getCashoutStatus, toTurkishError } from '../../../services/pitchOwnerService';
import { useOwnerToast } from '../components/useOwnerToast';
import { validateTrIban } from '../../../utils/iban';
import { useBackDismiss } from '../../../hooks/useBackDismiss';

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
  // Android geri tuşu + Esc bu modalı kapatır (BULGU-132).
  useBackDismiss(true, onClose, 'owner-withdrawals-modal');
  const notify = useOwnerToast();
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [iban, setIban] = useState('');
  const [ibanHolder, setIbanHolder] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [reservedBalance, setReservedBalance] = useState(0);
  const [cashout, setCashout] = useState<{ enabled: boolean; min: number }>({ enabled: false, min: 100 });
  const isRealPitch = !!facilityId && !facilityId.startsWith('mock-');

  useEffect(() => {
    let active = true;
    if (!isRealPitch) {
      // OP-P0-4/N-5: demo tesiste sahte ₺12.500 çekilebilir bakiye gösterme.
      setAvailableBalance(0);
      return;
    }
    getOwnerBalance(facilityId)
      .then((bal) => {
        if (active) {
          setAvailableBalance(bal.available);
          setReservedBalance(bal.pendingWithdrawals);
        }
      })
      .catch(() => {
        if (active) setAvailableBalance(0);
      });
    getCashoutStatus().then((s) => { if (active) setCashout(s); }).catch(() => undefined);
    // N-3: kayıtlı birincil banka hesabını (IBAN + sahip) çekim formuna ön-doldur —
    // owner her çekimde IBAN'ı elle yazmasın (kurulumdaki IBAN ölü veri olmasın).
    getBankAccounts(facilityId)
      .then((accts) => {
        if (!active || accts.length === 0) return;
        const primary = accts[0]; // is_primary DESC sıralı
        if (primary?.iban) setIban(primary.iban);
        if (primary?.account_holder) setIbanHolder(primary.account_holder);
      })
      .catch(() => { /* ön-doldurma başarısızsa form boş kalır, akış bozulmaz */ });
    return () => {
      active = false;
    };
  }, [facilityId, isRealPitch]);

  const handleWithdraw = async () => {
    if (readOnly) return;
    if (!cashout.enabled) {
      notify('Para çekme şu an kapalı. Yakında admin onayıyla açılacak.', 'warning');
      return;
    }
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify('Geçerli bir tutar girin.', 'error');
      return;
    }
    const ibanCheck = validateTrIban(iban);
    if (!ibanCheck.valid) {
      notify(ibanCheck.reason ?? 'Geçerli bir TR IBAN girin.', 'error');
      return;
    }
    if (!ibanHolder.trim()) {
      notify('IBAN sahibi adı zorunludur.', 'error');
      return;
    }
    if (amount < cashout.min) {
      notify(`Minimum çekim tutarı ₺${cashout.min}.`, 'error');
      return;
    }
    if (amount > availableBalance) {
      notify('Tutar bakiyenizden fazla olamaz.', 'error');
      return;
    }
    setIsProcessing(true);
    try {
      if (isRealPitch) {
        await requestWithdrawal(amount, iban, ibanHolder.trim());
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
          <button type="button" onClick={onClose} aria-label="Kapat" className="w-11 h-11 flex items-center justify-center rounded-full bg-white/5 text-white">
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
          {reservedBalance > 0 && (
            <p className="text-amber-200/80 text-xs font-bold mt-2 flex items-center gap-1.5">
              <Clock size={13} /> ₺{reservedBalance.toLocaleString('tr-TR')} bekleyen talepte rezerve
            </p>
          )}
        </div>

        {!cashout.enabled ? (
          <div className="bg-amber-500/10 border border-amber-500/25 p-4 rounded-2xl text-xs text-amber-200 flex items-start gap-2.5">
            <Lock size={16} className="shrink-0 mt-0.5" />
            <span>
              <b>Para çekme şu an kapalı.</b> Güvenli ödeme altyapımız devreye girince admin onayıyla
              açılacak. Bu arada banka hesabını (IBAN) ekleyip hazır tutabilirsin; bakiyen birikmeye
              devam eder.
            </span>
          </div>
        ) : (
          <div className="bg-blue-500/5 border border-blue-500/15 p-4 rounded-2xl text-xs text-blue-200/80 flex items-start gap-2.5">
            <Clock size={16} className="shrink-0 mt-0.5" />
            <span>
              Kazancınız (maç + saha kiralama) tahsilattan <b>2 hafta</b> sonra çekilebilir hale gelir.
              Talebiniz admin onayıyla kayıtlı IBAN'ınıza gönderilir (min ₺{cashout.min}).
            </span>
          </div>
        )}

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
            <label className="text-xs font-bold text-gray-400 uppercase block mb-2">IBAN Sahibi (Ad Soyad / Ünvan)</label>
            <input
              type="text"
              value={ibanHolder}
              onChange={(e) => setIbanHolder(e.target.value)}
              disabled={readOnly}
              className="w-full bg-transparent text-white font-bold text-lg outline-none"
              placeholder="Hesap sahibinin adı"
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
            !cashout.enabled ||
            isProcessing ||
            !withdrawAmount ||
            !iban ||
            !ibanHolder ||
            Number(withdrawAmount) <= 0 ||
            Number(withdrawAmount) > availableBalance
          }
          className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black text-lg flex items-center justify-center gap-2 hover:bg-blue-500 disabled:opacity-50"
        >
          {!cashout.enabled ? (
            <><Lock size={20} /> Çekim Yakında Açılacak</>
          ) : isProcessing ? 'İşleniyor...' : (
            <><Banknote size={22} /> Para Çek</>
          )}
        </button>
      </div>
    </div>
  );
};
