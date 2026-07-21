import React, { useCallback, useEffect, useState } from 'react';
import { Banknote, Plus, Save, Star, Trash2, X } from 'lucide-react';
import {
  deleteBankAccount,
  getBankAccounts,
  toTurkishError,
  upsertBankAccount,
} from '../../services/pitchOwnerService';
import { validateTrIban, normalizeIban } from '../../utils/iban';
import type { PitchBankAccount } from '../../types';

interface OwnerBankAccountsModalProps {
  pitchId: string;
  onClose: () => void;
  onUpdated?: (accounts: PitchBankAccount[]) => void;
  readOnly?: boolean;
}

export const OwnerBankAccountsModal: React.FC<OwnerBankAccountsModalProps> = ({
  pitchId,
  onClose,
  onUpdated,
  readOnly = false,
}) => {
  const [accounts, setAccounts] = useState<PitchBankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    bank_name: '',
    account_holder: '',
    iban: '',
    is_primary: false,
  });

  const canUseDb = !!pitchId && !pitchId.startsWith('mock-');

  const load = useCallback(async () => {
    if (!canUseDb) {
      setAccounts([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const rows = await getBankAccounts(pitchId);
      setAccounts(rows);
      onUpdated?.(rows);
    } catch (err) {
      setError(toTurkishError(err));
    } finally {
      setIsLoading(false);
    }
  }, [pitchId, canUseDb, onUpdated]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (readOnly) return;
    if (!canUseDb || !form.bank_name.trim() || !form.account_holder.trim() || !form.iban.trim()) {
      setError('Banka adı, hesap sahibi ve IBAN zorunludur.');
      return;
    }
    const ibanCheck = validateTrIban(form.iban);
    if (!ibanCheck.valid) {
      setError(ibanCheck.reason ?? 'Geçerli bir TR IBAN girin.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await upsertBankAccount(pitchId, {
        bank_name: form.bank_name,
        account_holder: form.account_holder,
        iban: normalizeIban(form.iban),
        is_primary: form.is_primary || accounts.length === 0,
      });
      setForm({ bank_name: '', account_holder: '', iban: '', is_primary: false });
      await load();
    } catch (err) {
      setError(toTurkishError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (readOnly) return;
    if (!confirm('Bu banka hesabını silmek istiyor musunuz?')) return;
    try {
      await deleteBankAccount(id);
      await load();
    } catch (err) {
      setError(toTurkishError(err));
    }
  };

  const handleSetPrimary = async (acc: PitchBankAccount) => {
    if (readOnly) return;
    try {
      await upsertBankAccount(pitchId, {
        id: acc.id,
        bank_name: acc.bank_name,
        account_holder: acc.account_holder,
        iban: acc.iban,
        is_primary: true,
      });
      await load();
    } catch (err) {
      setError(toTurkishError(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col">
      <div className="bg-[#161B22] p-4 flex justify-between items-center border-b border-white/5 safe-area-top">
        <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/5 text-white">
          <X size={20} />
        </button>
        <h2 className="text-white font-black text-lg italic uppercase">Banka Hesapları</h2>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-xl mx-auto w-full space-y-6">
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
            {error}
          </div>
        )}

        {!canUseDb && (
          <p className="text-sm text-gray-500 text-center py-8">
            Banka hesabı eklemek için önce tesisinizi oluşturun.
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-gray-500 text-center animate-pulse">Yükleniyor…</p>
        ) : (
          <div className="space-y-3">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="bg-[#161B22] p-4 rounded-2xl border border-white/5 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Banknote size={20} className="text-emerald-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white">{acc.bank_name}</p>
                    <p className="text-xs text-gray-400">{acc.account_holder}</p>
                    <p className="text-[10px] font-mono text-gray-500 mt-1 break-all">{acc.iban}</p>
                    {acc.is_primary && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-400 mt-2">
                        <Star size={10} fill="currentColor" /> Birincil hesap
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {!acc.is_primary && (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(acc)}
                      className="text-[10px] font-bold text-amber-400 px-2 py-1 bg-amber-500/10 rounded-lg"
                    >
                      Birincil yap
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(acc.id)}
                    className="p-2 text-gray-600 hover:text-red-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {accounts.length === 0 && canUseDb && (
              <p className="text-sm text-gray-500 text-center py-4">Henüz banka hesabı yok.</p>
            )}
          </div>
        )}

        {canUseDb && !readOnly && (
          <div className="bg-[#161B22] p-5 rounded-3xl border border-white/5 space-y-3">
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Yeni Hesap</h3>
            <input
              className="w-full bg-[#0A0E14] border border-white/5 rounded-xl p-3 text-white text-sm"
              placeholder="Banka adı"
              value={form.bank_name}
              onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
            />
            <input
              className="w-full bg-[#0A0E14] border border-white/5 rounded-xl p-3 text-white text-sm"
              placeholder="Hesap sahibi"
              value={form.account_holder}
              onChange={(e) => setForm({ ...form, account_holder: e.target.value })}
            />
            <input
              className="w-full bg-[#0A0E14] border border-white/5 rounded-xl p-3 text-white text-sm font-mono"
              placeholder="IBAN (TR...)"
              value={form.iban}
              onChange={(e) => setForm({ ...form, iban: e.target.value })}
            />
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={form.is_primary}
                onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
              />
              Birincil tahsilat hesabı
            </label>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleAdd}
              className="w-full py-3 bg-emerald-600 text-white font-black rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSaving ? 'Kaydediliyor…' : <><Plus size={16} /> HESAP EKLE</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
