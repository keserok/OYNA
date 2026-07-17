import React, { useState } from 'react';
import { Plus, Clock, Banknote, HandCoins } from 'lucide-react';
import type { FinanceSummary } from '../../../services/financeService';
import type { PitchDebtor } from '../../../types';
import { methodLabel, parseTRYAmount } from '../../../shared/financeModel';
import { money } from './financeUi';
import { BottomSheetModal } from './BottomSheetModal';

// ─── FI-1 — TAHSİLAT: bekleyen tahsilatlar + veresiye + son ödemeler ──────────
// Bekleyen tahsilatlar RPC'den (D8 — "kim borçlu kaldı" ilk kez görünür).
// Yazma akışları (Tahsil Et / Veresiyeye Yaz / kısmi ödeme) FI-2'de.

interface Props {
  summary: FinanceSummary;
  debtors: PitchDebtor[];
  readOnly: boolean;
  onAddDebtor: (d: { name: string; phone?: string; amount_owed: number }) => Promise<void>;
  onResolveDebtor: (id: string) => Promise<void>;
}

export const FinanceCollectTab: React.FC<Props> = ({ summary, debtors, readOnly, onAddDebtor, onResolveDebtor }) => {
  const { income } = summary;
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', amount: '' });

  const amt = parseTRYAmount(form.amount);
  const canSubmit = !!form.name.trim() && Number.isFinite(amt) && amt > 0;
  const submitDebtor = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onAddDebtor({ name: form.name.trim(), phone: form.phone.trim() || undefined, amount_owed: amt });
      setForm({ name: '', phone: '', amount: '' });
      setAddOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Bekleyen tahsilatlar */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-[10px] font-black text-gray-500 uppercase flex items-center gap-1.5"><Clock size={12} /> Bekleyen Tahsilatlar</h3>
          <span className="text-xs font-black text-amber-400">{money(income.pending_total)}</span>
        </div>
        {income.pending_bookings.length === 0 ? (
          <p className="text-sm text-gray-500 px-2">Bu ay bekleyen tahsilat yok — her rezervasyon tam ödendi. 👏</p>
        ) : income.pending_bookings.map((b) => (
          <div key={b.id} className="bg-[#161B22] p-4 rounded-2xl border border-amber-500/15 flex justify-between items-center gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{b.customer_name ?? 'Müşteri'}</p>
              <p className="text-[10px] text-gray-500">{b.date} · {b.time} · {b.court ?? 'Saha'} · {money(b.paid)} / {money(b.price)}</p>
            </div>
            <span className="text-amber-400 font-black shrink-0 tabular-nums">{money(b.balance)}</span>
          </div>
        ))}
      </div>

      {/* Veresiye (v1 — kişi bazlı bakiye; hareket defteri + kısmi ödeme FI-2'de) */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-[10px] font-black text-gray-500 uppercase flex items-center gap-1.5">
            <HandCoins size={12} /> Veresiye
            {summary.debt.open_total > 0 && <span className="text-red-400 normal-case">· {money(summary.debt.open_total)} açık</span>}
          </h3>
          <button
            type="button"
            onClick={() => { if (!readOnly) setAddOpen(true); }}
            disabled={readOnly}
            className="text-[10px] font-black text-red-400 flex items-center gap-1 disabled:opacity-40"
          >
            <Plus size={12} /> Ekle
          </button>
        </div>
        {debtors.length === 0 ? (
          <p className="text-sm text-gray-500 px-2">Açık veresiye kaydı yok.</p>
        ) : debtors.map((d) => (
          <div key={d.id} className="bg-[#161B22] p-4 rounded-2xl border border-red-500/20 flex justify-between items-center">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white flex items-center gap-2">
                <span className="truncate">{d.name}</span>
                {d.is_demo && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 shrink-0">DEMO</span>}
              </p>
              <p className="text-[10px] text-gray-500">{d.phone ?? ''}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-red-400 font-black tabular-nums">{money(d.amount_owed)}</span>
              <button
                onClick={() => { if (!readOnly) onResolveDebtor(d.id); }}
                disabled={readOnly}
                className="text-[10px] font-bold text-emerald-400 px-2 py-1 bg-emerald-500/10 rounded-lg disabled:opacity-40"
              >
                Kapat
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Son ödemeler */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-black text-gray-500 uppercase px-1 flex items-center gap-1.5"><Banknote size={12} /> Son Ödemeler</h3>
        {income.recent_payments.length === 0 ? (
          <p className="text-sm text-gray-500 px-2">Bu ay ödeme kaydı yok.</p>
        ) : income.recent_payments.map((p) => (
          <div key={p.id} className="bg-[#161B22] p-4 rounded-2xl border border-white/5 flex justify-between items-center">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{p.customer_name ?? 'Müşteri'}</p>
              <p className="text-[10px] text-gray-500">{p.booking_date} · {methodLabel(p.method)}</p>
            </div>
            <span className="text-emerald-400 font-black shrink-0 tabular-nums">+{money(p.amount)}</span>
          </div>
        ))}
      </div>

      {/* Veresiye ekle modalı */}
      {addOpen && (
        <BottomSheetModal title="Veresiye Ekle" onClose={() => setAddOpen(false)}>
          <input
            className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white mb-3"
            placeholder="Müşteri adı"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white mb-3"
            placeholder="Telefon (opsiyonel)"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <input
            inputMode="decimal"
            className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white mb-4"
            placeholder="Borç tutarı (₺)"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <button
            type="button"
            onClick={submitDebtor}
            disabled={saving || !canSubmit}
            className="w-full py-4 bg-red-600 text-white font-black rounded-2xl disabled:opacity-40"
          >
            {saving ? 'KAYDEDİLİYOR…' : 'KAYDET'}
          </button>
        </BottomSheetModal>
      )}
    </div>
  );
};
