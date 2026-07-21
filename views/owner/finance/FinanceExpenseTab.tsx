import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Repeat, Check } from 'lucide-react';
import { useConfirmSheet } from '../components/useConfirmSheet';
import type { FinanceSummary } from '../../../services/financeService';
import type { PitchExpense } from '../../../types';
import {
  getExpenseTemplates, createExpenseTemplate, deleteExpenseTemplate, applyExpenseTemplate,
  updateExpense, deleteExpense, type ExpenseTemplate,
} from '../../../services/financeService';
import { parseTRYAmount } from '../../../shared/financeModel';
import { localDateISO } from '../ownerCalendarHelpers';
import { money, BreakdownList } from './financeUi';
import { BottomSheetModal } from './BottomSheetModal';

// ─── FI-3 — GİDER v2: düzenle/sil + tarih + sabit gider şablonları ────────────

const CATEGORIES = ['Fatura', 'Personel', 'Bakım', 'Kira', 'Malzeme', 'Diğer'];

interface Props {
  summary: FinanceSummary;
  expenses: PitchExpense[];
  readOnly: boolean;
  pitchId: string;
  currentMonth: string;
  onAddExpense: (e: { title: string; amount: number; category: string; expense_date?: string }) => Promise<void>;
  onChanged: () => void;
  notify: (msg: string, type?: 'success' | 'error' | 'warning') => void;
}

const emptyForm = { title: '', amount: '', category: 'Diğer', date: '' };

export const FinanceExpenseTab: React.FC<Props> = ({
  summary, expenses, readOnly, pitchId, currentMonth, onAddExpense, onChanged, notify,
}) => {
  const { confirm, confirmElement } = useConfirmSheet();
  const [templates, setTemplates] = useState<ExpenseTemplate[]>([]);
  const [editing, setEditing] = useState<PitchExpense | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [tplForm, setTplForm] = useState({ title: '', amount: '', category: 'Kira' });

  const loadTemplates = () => { getExpenseTemplates(pitchId).then(setTemplates).catch(() => setTemplates([])); };
  useEffect(loadTemplates, [pitchId]);

  const month = summary.period.month;
  const catRows = summary.expenses.by_category.map((c) => ({ key: c.category, label: c.category, amount: c.amount, count: c.count }));

  // Bu ay hangi şablonlar uygulandı? (template_id taşıyan giderlerden)
  const appliedIds = new Set(expenses.filter((e) => e.template_id).map((e) => e.template_id));
  const unapplied = templates.filter((t) => !appliedIds.has(t.id));

  const defaultDate = () => (month === currentMonth ? localDateISO() : summary.period.end);

  const openAdd = () => { if (readOnly) return; setForm({ ...emptyForm, date: defaultDate() }); setAddOpen(true); };
  const openEdit = (e: PitchExpense) => {
    if (readOnly) return;
    setForm({ title: e.title, amount: String(e.amount ?? 0), category: e.category || 'Diğer', date: e.expense_date });
    setEditing(e);
  };

  const amt = parseTRYAmount(form.amount);
  const canSave = !!form.title.trim() && Number.isFinite(amt) && amt > 0 && !!form.date;

  const saveExpense = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      if (editing) {
        await updateExpense(editing.id, { title: form.title.trim(), amount: amt, category: form.category, expense_date: form.date });
        onChanged();
        setEditing(null);
      } else {
        await onAddExpense({ title: form.title.trim(), amount: amt, category: form.category, expense_date: form.date });
        setAddOpen(false);
      }
      setForm(emptyForm);
    } catch (e: any) {
      notify(e?.message || 'Kaydedilemedi.', 'error');
    } finally { setBusy(false); }
  };

  const removeExpense = async (e: PitchExpense) => {
    if (readOnly) return;
    if (!(await confirm({ title: 'Gideri sil?', message: `"${e.title}" gideri silinecek.`, confirmLabel: 'Sil', destructive: true }))) return;
    try { await deleteExpense(e.id); onChanged(); notify('Gider silindi.', 'success'); }
    catch (err: any) { notify(err?.message || 'Silinemedi.', 'error'); }
  };

  const applyAll = async () => {
    setBusy(true);
    let ok = 0;
    for (const t of unapplied) {
      try { await applyExpenseTemplate(pitchId, t, defaultDate()); ok += 1; }
      catch (e: any) { notify(e?.message || 'Eklenemedi.', 'error'); }
    }
    if (ok > 0) { notify(`${ok} sabit gider eklendi.`, 'success'); onChanged(); }
    setBusy(false);
  };

  const applyOne = async (t: ExpenseTemplate) => {
    setBusy(true);
    try { await applyExpenseTemplate(pitchId, t, defaultDate()); notify('Eklendi.', 'success'); onChanged(); }
    catch (e: any) { notify(e?.message || 'Eklenemedi.', 'error'); }
    finally { setBusy(false); }
  };

  const tplAmt = parseTRYAmount(tplForm.amount);
  const addTemplate = async () => {
    if (!tplForm.title.trim() || !(tplAmt > 0)) return;
    setBusy(true);
    try {
      await createExpenseTemplate(pitchId, { title: tplForm.title.trim(), category: tplForm.category, amount: tplAmt });
      setTplForm({ title: '', amount: '', category: 'Kira' });
      loadTemplates();
    } catch (e: any) { notify(e?.message || 'Şablon eklenemedi.', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      {/* Kategori özeti */}
      <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6">
        <div className="flex justify-between items-baseline mb-4">
          <h3 className="text-xs font-black text-gray-400 uppercase">Bu Ay Gider</h3>
          <span className="text-lg font-black text-red-400">{money(summary.expenses.total)}</span>
        </div>
        <BreakdownList rows={catRows} total={summary.expenses.total} color="#EF4444" emptyText="Bu ay gider kaydı yok." />
      </div>

      {/* Sabit gider banner'ı */}
      {templates.length > 0 && (
        <div className="bg-[#161B22] border border-white/5 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-black text-gray-300">
              <Repeat size={14} className="text-blue-400" />
              Sabit giderler: {templates.length - unapplied.length}/{templates.length} eklendi
            </div>
            {!readOnly && (
              <button type="button" onClick={() => setTplOpen(true)} className="text-[10px] font-black text-gray-500 hover:text-gray-300">Yönet</button>
            )}
          </div>
          {unapplied.length > 0 && !readOnly && (
            <div className="mt-3 flex flex-wrap gap-2">
              {unapplied.map((t) => (
                <button key={t.id} type="button" onClick={() => applyOne(t)} disabled={busy}
                  className="text-[11px] font-bold bg-blue-500/10 border border-blue-500/25 text-blue-300 px-2.5 py-1 rounded-lg disabled:opacity-40">
                  + {t.title} · {money(t.amount)}
                </button>
              ))}
              {unapplied.length > 1 && (
                <button type="button" onClick={applyAll} disabled={busy}
                  className="text-[11px] font-black bg-blue-500/20 border border-blue-500/40 text-blue-200 px-2.5 py-1 rounded-lg disabled:opacity-40">
                  Kalanları Ekle
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Gider kayıtları */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-[10px] font-black text-gray-500 uppercase">Gider Kayıtları</h3>
          <button type="button" onClick={openAdd} disabled={readOnly} className="p-2 bg-white/5 rounded-xl text-white disabled:opacity-40">
            <Plus size={18} />
          </button>
        </div>
        {expenses.length === 0 ? (
          <p className="text-sm text-gray-500 px-2">Bu ay gider kaydı yok.</p>
        ) : (
          <div className="space-y-3">
            {expenses.map((e) => (
              <div key={e.id} className="bg-[#161B22] p-4 rounded-2xl border border-white/5 flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="truncate">{e.title}</span>
                    {e.template_id && <Repeat size={11} className="text-blue-400 shrink-0" />}
                    {e.is_demo && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 shrink-0">DEMO</span>}
                  </p>
                  <p className="text-[10px] text-gray-500">{e.category} • {e.expense_date}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-red-400 font-black tabular-nums">{money(e.amount ?? 0)}</span>
                  {!readOnly && (
                    <>
                      <button type="button" onClick={() => openEdit(e)} className="p-1.5 text-gray-400 hover:text-white"><Pencil size={14} /></button>
                      <button type="button" onClick={() => removeExpense(e)} className="p-1.5 text-red-500/70 hover:text-red-400"><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ekle / Düzenle modalı */}
      {(addOpen || editing) && (
        <BottomSheetModal title={editing ? 'Gideri Düzenle' : 'Yeni Gider'} onClose={() => { setAddOpen(false); setEditing(null); setForm(emptyForm); }}>
          <input className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white mb-3" placeholder="Başlık" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input inputMode="decimal" className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white mb-3" placeholder="Tutar" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <div className="grid grid-cols-2 gap-3 mb-4">
            <select className="bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="date" className="bg-[#0A0E14] border border-white/10 rounded-xl p-3 text-white" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <button type="button" onClick={saveExpense} disabled={busy || !canSave} className="w-full py-4 bg-[#FF00FF] text-white font-black rounded-2xl disabled:opacity-40">
            {busy ? 'KAYDEDİLİYOR…' : editing ? 'GÜNCELLE' : 'GİDERİ KAYDET'}
          </button>
        </BottomSheetModal>
      )}

      {/* Sabit gider şablon yönetimi */}
      {tplOpen && (
        <BottomSheetModal title="Sabit Giderler" onClose={() => setTplOpen(false)}>
          <div className="space-y-2 mb-4 max-h-52 overflow-y-auto custom-scrollbar">
            {templates.length === 0 ? (
              <p className="text-xs text-gray-500">Henüz sabit gider yok. Kira, personel gibi her ay tekrarlayan giderleri ekle.</p>
            ) : templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2">
                <div className="min-w-0"><p className="text-sm font-bold text-white truncate">{t.title}</p><p className="text-[10px] text-gray-500">{t.category} · {money(t.amount)}</p></div>
                <button type="button" onClick={() => { deleteExpenseTemplate(t.id).then(loadTemplates).catch(() => {}); }} className="p-1.5 text-red-500/70 hover:text-red-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="border-t border-white/5 pt-3">
            <p className="text-[10px] font-black text-gray-500 uppercase mb-2">Yeni sabit gider</p>
            <input className="w-full bg-[#0A0E14] border border-white/10 rounded-xl p-2.5 text-white mb-2 text-sm" placeholder="Başlık (ör. Kira)" value={tplForm.title} onChange={(e) => setTplForm({ ...tplForm, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-2 mb-3">
              <input inputMode="decimal" className="bg-[#0A0E14] border border-white/10 rounded-xl p-2.5 text-white text-sm" placeholder="Tutar" value={tplForm.amount} onChange={(e) => setTplForm({ ...tplForm, amount: e.target.value })} />
              <select className="bg-[#0A0E14] border border-white/10 rounded-xl p-2.5 text-white text-sm" value={tplForm.category} onChange={(e) => setTplForm({ ...tplForm, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button type="button" onClick={addTemplate} disabled={busy || !tplForm.title.trim() || !(tplAmt > 0)} className="w-full py-2.5 bg-blue-600 text-white font-black rounded-xl text-sm disabled:opacity-40 inline-flex items-center justify-center gap-2">
              <Check size={15} /> Şablon Ekle
            </button>
          </div>
        </BottomSheetModal>
      )}
      {confirmElement}
    </div>
  );
};
