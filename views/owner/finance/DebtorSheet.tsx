import React, { useEffect, useState } from 'react';
import { Loader2, MessageCircle, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { getDebtorEntries, debtorAddPayment, markDebtorReminded, type DebtorEntry } from '../../../services/financeService';
import type { PitchDebtor } from '../../../types';
import { parseTRYAmount, methodLabel } from '../../../shared/financeModel';
import { money } from './financeUi';
import { BottomSheetModal } from './BottomSheetModal';

// ─── FI-2 — Veresiye kişi sayfası: hareket defteri + kısmi ödeme + WhatsApp ───

const METHODS = [
  { id: 'CASH', label: 'Nakit' },
  { id: 'CARD', label: 'Kart' },
  { id: 'BANK_TRANSFER', label: 'Havale' },
];

/** TR telefonu wa.me formatına: rakamları al, 0 baş → 90, 10 hane → 90 ekle. */
function waNumber(phone: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10) d = '90' + d;
  return d;
}

interface Props {
  debtor: PitchDebtor;
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => void;
  notify: (msg: string, type?: 'success' | 'error' | 'warning') => void;
}

export const DebtorSheet: React.FC<Props> = ({ debtor, readOnly, onClose, onChanged, notify }) => {
  const [entries, setEntries] = useState<DebtorEntry[] | null>(null);
  const [balance, setBalance] = useState(debtor.amount_owed);
  const [payOpen, setPayOpen] = useState(false);
  const [amountStr, setAmountStr] = useState(String(Math.round(debtor.amount_owed)));
  const [method, setMethod] = useState('CASH');
  const [busy, setBusy] = useState(false);

  const loadEntries = () => {
    getDebtorEntries(debtor.id).then(setEntries).catch(() => setEntries([]));
  };
  useEffect(loadEntries, [debtor.id]);

  const amount = parseTRYAmount(amountStr);
  const validPay = Number.isFinite(amount) && amount > 0 && amount <= balance + 0.001;

  const takePayment = async () => {
    if (!validPay) return;
    setBusy(true);
    try {
      const { queued } = await debtorAddPayment(debtor.id, amount, method, 'Veresiye ödemesi');
      if (queued) {
        // P-OFFLINE: sunucuya ulaşmadı — bakiyeyi YEREL tahminle DEĞİŞTİRME
        // (para dürüstlüğü: görünen bakiye her zaman sunucu gerçeği).
        setPayOpen(false);
        notify('İnternet yok — ödeme kuyruğa alındı, bağlantı gelince otomatik işlenecek.', 'warning');
      } else {
        const newBal = Math.max(0, balance - amount);
        setBalance(newBal);
        setAmountStr(String(Math.round(newBal)));
        setPayOpen(false);
        loadEntries();
        onChanged();
        notify(newBal <= 0 ? 'Veresiye kapandı.' : 'Ödeme alındı.', 'success');
      }
    } catch (e: any) {
      notify(e?.message || 'Ödeme alınamadı.', 'error');
    } finally { setBusy(false); }
  };

  const remind = () => {
    if (!debtor.phone) return;
    const msg = encodeURIComponent(`Merhaba, güncel veresiye bakiyeniz ${money(balance)}. İyi günler.`);
    window.open(`https://wa.me/${waNumber(debtor.phone)}?text=${msg}`, '_blank');
    markDebtorReminded(debtor.id).catch(() => {});
  };

  return (
    <BottomSheetModal title={debtor.name} onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <div>
          {debtor.phone && <p className="text-[11px] text-gray-500">{debtor.phone}</p>}
          <p className={`text-2xl font-extrabold ${balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{money(balance)}</p>
          <p className="text-[10px] text-gray-500">{balance > 0 ? 'açık bakiye' : 'kapandı'}</p>
        </div>
        {debtor.phone && (
          <button type="button" onClick={remind} className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-3 py-2 rounded-xl">
            <MessageCircle size={14} /> Hatırlat
          </button>
        )}
      </div>

      {/* Ödeme al */}
      {balance > 0 && !readOnly && (
        payOpen ? (
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 mb-4">
            <label className="text-[10px] font-extrabold text-gray-500 uppercase block mb-1.5">Alınan tutar</label>
            <input inputMode="decimal" className="w-full bg-bg border border-white/10 rounded-xl p-3 text-white mb-3" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
            <div className="flex gap-2 mb-3">
              {METHODS.map((m) => (
                <button key={m.id} type="button" onClick={() => setMethod(m.id)}
                  className={`flex-1 py-2 rounded-lg text-xs font-extrabold border ${method === m.id ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-white/[0.03] border-white/10 text-gray-400'}`}>
                  {m.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={takePayment} disabled={busy || !validPay} className="w-full py-3 bg-emerald-600 text-white font-extrabold rounded-xl disabled:opacity-40">
              {busy ? 'KAYDEDİLİYOR…' : 'ÖDEMEYİ AL'}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setPayOpen(true)} className="w-full py-3 mb-4 bg-emerald-600 text-white font-extrabold rounded-2xl">
            ÖDEME AL
          </button>
        )
      )}

      {/* Hareket defteri */}
      <p className="text-[10px] font-extrabold text-gray-500 uppercase mb-2">Hareketler</p>
      {entries === null ? (
        <div className="flex justify-center py-6 text-gray-500"><Loader2 size={16} className="animate-spin" /></div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-gray-600">Hareket yok.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
          {entries.map((e) => {
            const isPay = e.entry_type === 'PAYMENT';
            return (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  {isPay ? <ArrowDownCircle size={16} className="text-emerald-400 shrink-0" /> : <ArrowUpCircle size={16} className="text-red-400 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-gray-300 truncate">{isPay ? 'Ödeme' : 'Borç'}{e.note ? ` · ${e.note}` : ''}</p>
                    <p className="text-[10px] text-gray-600">{e.created_at.slice(0, 10)}{isPay && e.payment_method ? ` · ${methodLabel(e.payment_method)}` : ''}</p>
                  </div>
                </div>
                <span className={`font-extrabold tabular-nums shrink-0 ${isPay ? 'text-emerald-400' : 'text-red-400'}`}>{isPay ? '−' : '+'}{money(e.amount)}</span>
              </div>
            );
          })}
        </div>
      )}
    </BottomSheetModal>
  );
};
