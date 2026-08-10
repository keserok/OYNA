import React, { useState } from 'react';
import { Plus, Clock, Banknote, HandCoins, ChevronRight } from 'lucide-react';
import type { FinanceSummary, PendingBooking } from '../../../services/financeService';
import type { PitchDebtor } from '../../../types';
import { methodLabel, parseTRYAmount } from '../../../shared/financeModel';
import { money } from './financeUi';
import { BottomSheetModal } from './BottomSheetModal';
import { CollectModal } from './CollectModal';
import { DebtorSheet } from './DebtorSheet';

// ─── FI-2 — TAHSİLAT: bekleyen tahsil + veresiye v2 (defter/kısmi) + son ödemeler
// Bekleyen rezervasyona dokun → Tahsil Et / Veresiyeye Yaz. Veresiye kişiye dokun
// → hareket defteri + kısmi ödeme + WhatsApp.

interface Props {
  summary: FinanceSummary;
  debtors: PitchDebtor[];
  readOnly: boolean;
  onAddDebtor: (d: { name: string; phone?: string; amount_owed: number }) => Promise<void>;
  onChanged: () => void;
  notify: (msg: string, type?: 'success' | 'error' | 'warning') => void;
}

export const FinanceCollectTab: React.FC<Props> = ({ summary, debtors, readOnly, onAddDebtor, onChanged, notify }) => {
  const { income } = summary;
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', amount: '' });
  const [collectBooking, setCollectBooking] = useState<PendingBooking | null>(null);
  const [openDebtor, setOpenDebtor] = useState<PitchDebtor | null>(null);

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
      {/* Bekleyen tahsilatlar — dokun → Tahsil Et / Veresiyeye Yaz */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-[10px] font-extrabold text-ink-4 uppercase flex items-center gap-1.5"><Clock size={12} /> Bekleyen Tahsilatlar</h3>
          <span className="text-xs font-extrabold text-amber-400">{money(income.pending_total)}</span>
        </div>
        {income.pending_bookings.length === 0 ? (
          <p className="text-sm text-ink-4 px-2">Bu ay bekleyen tahsilat yok — her rezervasyon tam ödendi. 👏</p>
        ) : income.pending_bookings.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => { if (readOnly) { notify('Salt okunur mod.', 'warning'); return; } setCollectBooking(b); }}
            className="w-full bg-surface-1 p-4 rounded-2xl border border-amber-500/15 flex justify-between items-center gap-3 text-left hover:border-amber-500/40 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{b.customer_name ?? 'Müşteri'}</p>
              <p className="text-[10px] text-ink-4">{b.date} · {b.time} · {b.court ?? 'Saha'} · {money(b.paid)} / {money(b.price)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-amber-400 font-extrabold tabular-nums">{money(b.balance)}</span>
              {!readOnly && <ChevronRight size={16} className="text-ink-4" />}
            </div>
          </button>
        ))}
      </div>

      {/* Veresiye v2 — kişiye dokun → defter + kısmi ödeme + WhatsApp */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-[10px] font-extrabold text-ink-4 uppercase flex items-center gap-1.5">
            <HandCoins size={12} /> Veresiye
            {summary.debt.open_total > 0 && <span className="text-red-400 normal-case">· {money(summary.debt.open_total)} açık</span>}
          </h3>
          <button
            type="button"
            onClick={() => { if (!readOnly) setAddOpen(true); }}
            disabled={readOnly}
            className="text-[10px] font-extrabold text-red-400 flex items-center gap-1 disabled:opacity-40"
          >
            <Plus size={12} /> Ekle
          </button>
        </div>
        {debtors.length === 0 ? (
          <p className="text-sm text-ink-4 px-2">Açık veresiye kaydı yok.</p>
        ) : debtors.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setOpenDebtor(d)}
            className="w-full bg-surface-1 p-4 rounded-2xl border border-red-500/20 flex justify-between items-center text-left hover:border-red-500/40 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-white flex items-center gap-2">
                <span className="truncate">{d.name}</span>
                {d.is_demo && <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 shrink-0">DEMO</span>}
              </p>
              <p className="text-[10px] text-ink-4">{d.phone ?? ''}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-red-400 font-extrabold tabular-nums">{money(d.amount_owed)}</span>
              <ChevronRight size={16} className="text-ink-4" />
            </div>
          </button>
        ))}
      </div>

      {/* Son ödemeler */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-extrabold text-ink-4 uppercase px-1 flex items-center gap-1.5"><Banknote size={12} /> Son Ödemeler</h3>
        {income.recent_payments.length === 0 ? (
          <p className="text-sm text-ink-4 px-2">Bu ay ödeme kaydı yok.</p>
        ) : income.recent_payments.map((p) => (
          <div key={p.id} className="bg-surface-1 p-4 rounded-2xl border border-white/5 flex justify-between items-center">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{p.customer_name ?? 'Müşteri'}</p>
              <p className="text-[10px] text-ink-4">{p.booking_date} · {methodLabel(p.method)}</p>
            </div>
            <span className="text-emerald-400 font-extrabold shrink-0 tabular-nums">+{money(p.amount)}</span>
          </div>
        ))}
      </div>

      {collectBooking && (
        <CollectModal booking={collectBooking} onClose={() => setCollectBooking(null)} onChanged={onChanged} notify={notify} />
      )}
      {openDebtor && (
        <DebtorSheet debtor={openDebtor} readOnly={readOnly} onClose={() => setOpenDebtor(null)} onChanged={onChanged} notify={notify} />
      )}

      {/* Veresiye ekle modalı */}
      {addOpen && (
        <BottomSheetModal title="Veresiye Ekle" onClose={() => setAddOpen(false)}>
          <input
            className="w-full bg-bg border border-white/10 rounded-xl p-3 text-white mb-3"
            placeholder="Müşteri adı"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="w-full bg-bg border border-white/10 rounded-xl p-3 text-white mb-3"
            placeholder="Telefon (opsiyonel)"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <input
            inputMode="decimal"
            className="w-full bg-bg border border-white/10 rounded-xl p-3 text-white mb-4"
            placeholder="Borç tutarı (₺)"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <button
            type="button"
            onClick={submitDebtor}
            disabled={saving || !canSubmit}
            className="w-full py-4 bg-red-600 text-white font-extrabold rounded-2xl disabled:opacity-40"
          >
            {saving ? 'KAYDEDİLİYOR…' : 'KAYDET'}
          </button>
        </BottomSheetModal>
      )}
    </div>
  );
};
