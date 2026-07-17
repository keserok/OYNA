import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { FinanceSummary } from '../../../services/financeService';
import type { PitchExpense } from '../../../types';
import { parseTRYAmount } from '../../../shared/financeModel';
import { money, BreakdownList } from './financeUi';
import { BottomSheetModal } from './BottomSheetModal';

// ─── FI-1 — GİDER: kategori özeti + gider listesi + ekle ─────────────────────
// Düzenle/sil + tarih + sabit-gider şablonları FI-3'te.

const CATEGORIES = ['Fatura', 'Personel', 'Bakım', 'Kira', 'Malzeme', 'Diğer'];

interface Props {
  summary: FinanceSummary;
  expenses: PitchExpense[];
  readOnly: boolean;
  onAddExpense: (e: { title: string; amount: number; category: string }) => Promise<void>;
}

export const FinanceExpenseTab: React.FC<Props> = ({ summary, expenses, readOnly, onAddExpense }) => {
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', amount: '', category: 'Diğer' });

  const catRows = summary.expenses.by_category.map((c) => ({ key: c.category, label: c.category, amount: c.amount, count: c.count }));

  const amt = parseTRYAmount(form.amount);
  const canSubmit = !!form.title.trim() && Number.isFinite(amt) && amt > 0;
  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onAddExpense({ title: form.title.trim(), amount: amt, category: form.category });
      setForm({ title: '', amount: '', category: 'Diğer' });
      setAddOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6">
        <div className="flex justify-between items-baseline mb-4">
          <h3 className="text-xs font-black text-gray-400 uppercase">Bu Ay Gider</h3>
          <span className="text-lg font-black text-red-400">{money(summary.expenses.total)}</span>
        </div>
        <BreakdownList rows={catRows} total={summary.expenses.total} color="#EF4444" emptyText="Bu ay gider kaydı yok." />
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-[10px] font-black text-gray-500 uppercase">Gider Kayıtları</h3>
          <button
            type="button"
            onClick={() => { if (!readOnly) setAddOpen(true); }}
            disabled={readOnly}
            className="p-2 bg-white/5 rounded-xl text-white disabled:opacity-40"
          >
            <Plus size={18} />
          </button>
        </div>
        {expenses.length === 0 ? (
          <p className="text-sm text-gray-500 px-2">Bu ay gider kaydı yok.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {expenses.map((e) => (
              <div key={e.id} className="bg-[#161B22] p-4 rounded-2xl border border-white/5 flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="truncate">{e.title}</span>
                    {e.is_demo && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 shrink-0">DEMO</span>}
                  </p>
                  <p className="text-[10px] text-gray-500">{e.category} • {e.expense_date}</p>
                </div>
                <span className="text-red-400 font-black shrink-0 tabular-nums">{money(e.amount ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {addOpen && (
        <BottomSheetModal title="Yeni Gider" onClose={() => setAddOpen(false)}>
          <input
            className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white mb-3"
            placeholder="Başlık"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            inputMode="decimal"
            className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white mb-3"
            placeholder="Tutar"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <select
            className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white mb-4"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !canSubmit}
            className="w-full py-4 bg-[#FF00FF] text-white font-black rounded-2xl disabled:opacity-40"
          >
            {saving ? 'KAYDEDİLİYOR…' : 'GİDERİ KAYDET'}
          </button>
        </BottomSheetModal>
      )}
    </div>
  );
};
