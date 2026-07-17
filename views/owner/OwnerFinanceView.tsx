import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Coins, ChevronLeft, ChevronRight, ArrowUpRight, Loader2, AlertTriangle, Download } from 'lucide-react';
import { LoadingState } from '../../components/common/StatusState';
import {
  addExpense, getDebtors, getOwnerExpenses, toTurkishError,
} from '../../services/pitchOwnerService';
import { getPitchFinanceSummary, createDebtor, getMonthPayments, type FinanceSummary } from '../../services/financeService';
import { getOwnerEarningsSummary, type EarningsSummary } from '../../services/walletService';
import type { PitchDebtor, PitchExpense } from '../../types';
import { useOwnerToast } from './components/useOwnerToast';
import { OwnerDemoDataBar } from './components/OwnerDemoDataBar';
import { OwnerWithdrawalsModal } from './menu/OwnerWithdrawalsModal';
import { localDateISO } from './ownerCalendarHelpers';
import { growthPercent, monthLabel, shiftMonth, isMonthAfter, methodLabel, buildFinanceCsv, type CsvRow } from '../../shared/financeModel';
import { money, StatTile, GrowthBadge } from './finance/financeUi';
import { FinanceSummaryTab } from './finance/FinanceSummaryTab';
import { FinanceCollectTab } from './finance/FinanceCollectTab';
import { FinanceExpenseTab } from './finance/FinanceExpenseTab';

// ─── FI-1 — Finans kabuğu: ay seçici + kıyaslı hero + OYNA kartı + 3 sekme ────
// Tek doğruluk kaynağı: get_pitch_finance_summary RPC (dönem tutarlı). Sekmeler
// saf sunum; yazma (veresiye/gider) handler'ları burada, RPC'yi yeniden çeker.

type FinTab = 'SUMMARY' | 'COLLECT' | 'EXPENSE';

interface OwnerFinanceViewProps {
  pitchId: string;
  isDemoMode?: boolean;
  readOnly?: boolean;
  /** Takvim (Hafta) görünümüne geçiş — doluluk için (heatmap buradan kaldırıldı). */
  onOpenCalendar?: () => void;
}

export const OwnerFinanceView: React.FC<OwnerFinanceViewProps> = ({ pitchId, isDemoMode, readOnly = false, onOpenCalendar }) => {
  const notify = useOwnerToast();
  const currentMonth = useMemo(() => localDateISO().slice(0, 7), []);
  const [month, setMonth] = useState(currentMonth);
  const [tab, setTab] = useState<FinTab>('SUMMARY');
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [debtors, setDebtors] = useState<PitchDebtor[]>([]);
  const [expenses, setExpenses] = useState<PitchExpense[]>([]);
  const [oynaEarn, setOynaEarn] = useState<EarningsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const reqRef = useRef(0);
  const loadedOnceRef = useRef(false);

  const isMock = !pitchId || pitchId.startsWith('mock-');

  // İstek-kimliği koruması: hızlı ay geçişlerinde bayat cevap ekranı ezmesin.
  const load = useCallback(async () => {
    if (isMock) { setIsLoading(false); return; }
    const reqId = ++reqRef.current;
    setError(null);
    if (loadedOnceRef.current) setRefreshing(true); else setIsLoading(true);
    try {
      const [sum, deb, exp, earn] = await Promise.all([
        getPitchFinanceSummary(pitchId, month),
        getDebtors(pitchId),
        getOwnerExpenses(pitchId, month),
        getOwnerEarningsSummary().catch(() => null),
      ]);
      if (reqRef.current !== reqId) return; // daha yeni bir yükleme başladı
      setSummary(sum);
      setDebtors(deb);
      setExpenses(exp);
      setOynaEarn(earn);
      loadedOnceRef.current = true;
    } catch (err) {
      if (reqRef.current !== reqId) return;
      setError(toTurkishError(err));
    } finally {
      if (reqRef.current === reqId) { setIsLoading(false); setRefreshing(false); }
    }
  }, [isMock, pitchId, month]);

  useEffect(() => { load(); }, [load]);

  const onAddDebtor = useCallback(async (d: { name: string; phone?: string; amount_owed: number }) => {
    if (readOnly) { notify('Salt okunur mod.', 'warning'); return; }
    try { await createDebtor(pitchId, d.name, d.phone, d.amount_owed); await load(); }
    catch (err) { notify(toTurkishError(err), 'error'); throw err; }
  }, [pitchId, readOnly, load, notify]);

  const onAddExpense = useCallback(async (e: { title: string; amount: number; category: string; expense_date?: string }) => {
    if (readOnly) { notify('Salt okunur mod.', 'warning'); return; }
    try { await addExpense(pitchId, e); await load(); }
    catch (err) { notify(toTurkishError(err), 'error'); throw err; }
  }, [pitchId, readOnly, load, notify]);

  const [exporting, setExporting] = useState(false);
  const exportCsv = useCallback(async () => {
    if (!summary) return;
    setExporting(true);
    try {
      const payments = await getMonthPayments(pitchId, month);
      const rows: CsvRow[] = [];
      payments.forEach((p) => rows.push({ type: 'ÖDEME', date: p.date, description: p.customer, detail: methodLabel(p.method), amount: p.amount }));
      expenses.forEach((e) => rows.push({ type: 'GİDER', date: e.expense_date, description: e.title, detail: e.category, amount: -(e.amount ?? 0) }));
      summary.income.pending_bookings.forEach((b) => rows.push({ type: 'BEKLEYEN', date: b.date, description: b.customer_name ?? 'Müşteri', detail: b.court ?? '', amount: b.balance }));
      debtors.forEach((d) => rows.push({ type: 'VERESİYE', date: '', description: d.name, detail: d.phone ?? '', amount: d.amount_owed }));
      rows.sort((a, b) => a.date.localeCompare(b.date));
      const csv = buildFinanceCsv(month, rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `finans_${month}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally { setExporting(false); }
  }, [summary, pitchId, month, expenses, debtors, notify]);

  const net = (summary?.income.collected_total ?? 0) - (summary?.expenses.total ?? 0);
  const prevNet = (summary?.prev.collected_total ?? 0) - (summary?.prev.expense_total ?? 0);
  const growth = growthPercent(net, prevNet);
  const hasDemoData = debtors.some((d) => d.is_demo) || expenses.some((e) => e.is_demo);
  const nextLocked = isMonthAfter(shiftMonth(month, 1), currentMonth);

  if (isLoading) {
    return <div className="p-6 pb-32"><LoadingState message="Finans verileri yükleniyor…" /></div>;
  }
  if (isMock) {
    return (
      <div className="p-6 pb-32 text-center text-gray-500">
        <p className="text-sm">Finans modülü için tesisinizi oluşturun veya demo modunu başlatın.</p>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="p-6 pb-32 text-center">
        <p className="text-sm text-red-400 font-bold mb-3">{error ?? 'Finans özeti yüklenemedi.'}</p>
        <button onClick={load} className="text-xs text-blue-400 font-bold">Tekrar dene</button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 pb-32 overflow-y-auto custom-scrollbar bg-[#0A0E14]">
      <div className="max-w-5xl mx-auto w-full">
        <OwnerDemoDataBar pitchId={pitchId} onChanged={load} hasDemo={hasDemoData} />
        {isDemoMode && (
          <div className="mb-4 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold text-center">
            DEMO MODU — Finans verileri demo tesise aittir
          </div>
        )}
        {readOnly && (
          <div className="mb-4 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] font-bold text-center">
            Salt okunur mod — finans kayıtları düzenlenemez
          </div>
        )}

        {/* Dönem seçici */}
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="w-10 h-10 rounded-xl bg-[#161B22] border border-white/5 text-gray-300 flex items-center justify-center hover:bg-white/5"
            aria-label="Önceki ay"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <p className="text-sm font-black text-white flex items-center justify-center gap-1.5">
              {monthLabel(month)}
              {refreshing && <Loader2 size={12} className="animate-spin text-gray-400" />}
            </p>
            {month !== currentMonth && (
              <button type="button" onClick={() => setMonth(currentMonth)} className="text-[10px] font-bold text-blue-400 hover:text-blue-300">
                Bu aya dön
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => { if (!nextLocked) setMonth((m) => shiftMonth(m, 1)); }}
            disabled={nextLocked}
            className="w-10 h-10 rounded-xl bg-[#161B22] border border-white/5 text-gray-300 flex items-center justify-center hover:bg-white/5 disabled:opacity-30"
            aria-label="Sonraki ay"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* CSV dışa aktar (muhasebe) */}
        <div className="flex justify-end mb-4 -mt-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 text-[10px] font-black text-gray-400 hover:text-white bg-[#161B22] border border-white/5 px-3 py-1.5 rounded-lg disabled:opacity-40"
          >
            {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} CSV indir
          </button>
        </div>

        {error ? (
          <div className="bg-red-500/10 border border-red-500/25 rounded-2xl p-5 flex flex-col items-center gap-3 text-center">
            <AlertTriangle size={20} className="text-red-400" />
            <p className="text-sm text-red-300 font-bold">{monthLabel(month)} yüklenemedi.<br /><span className="font-normal text-red-200/70">{error}</span></p>
            <button onClick={load} className="text-xs font-black text-blue-400">Tekrar dene</button>
          </div>
        ) : (
        <>
        {/* Hero: dönem bakiyesi (tahsilat − gider) + kıyas.
            Bilinçli olarak "net kazanç" DEĞİL: collected app rezervasyonlarında brüt
            olabildiği için OYNA komisyonu bu rakamdan düşülmez (aşağıda ayrı gösterilir). */}
        <div className="bg-[#161B22] border border-white/10 rounded-[32px] p-6 shadow-2xl mb-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">DÖNEM BAKİYESİ</p>
            <GrowthBadge growth={growth} label="geçen aya göre" />
          </div>
          <h2 className={`text-4xl font-black tracking-tight ${net >= 0 ? 'text-white' : 'text-red-400'}`}>{money(net)}</h2>
          <p className="text-[10px] text-gray-500 mt-1">Tahsilat − Gider · OYNA komisyonu hariç</p>
          <div className="grid grid-cols-3 gap-3 mt-6">
            <StatTile label="Tahsilat" value={money(summary.income.collected_total)} accent="text-emerald-400" />
            <StatTile label="Gider" value={money(summary.expenses.total)} accent="text-red-400" />
            <StatTile label="Bu Ay Bekleyen" value={money(summary.income.pending_total)} accent="text-amber-400" sub={`${summary.income.pending_bookings.length} rezervasyon`} />
          </div>
        </div>

        {/* OYNA kazançları — komisyon şeffaflığı (korunur) + çekim */}
        {oynaEarn && (
          <div className="bg-[#161B22] border border-emerald-500/15 rounded-[32px] p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black text-gray-400 uppercase flex items-center gap-2">
                <Coins size={16} className="text-emerald-400" /> OYNA KAZANÇLARIN
              </h3>
              <button
                type="button"
                onClick={() => { if (!readOnly) setWithdrawalOpen(true); }}
                disabled={readOnly || oynaEarn.available <= 0}
                className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5 rounded-lg disabled:opacity-40"
              >
                ÇEKİM TALEBİ <ArrowUpRight size={12} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Çekilebilir" value={money(oynaEarn.available)} accent="text-emerald-400" sub="Cüzdan → IBAN'a çek" />
              <StatTile label="Güvence beklemesinde" value={money(oynaEarn.pending)} accent="text-blue-300" sub="2 hafta sonra çekilebilir" />
            </div>
            {/* Aylık uygulama kırılımı yalnız GÜNCEL ay için geçerli (RPC'den değil,
                owner_earnings_summary güncel-ay döner). Geçmiş aya bakınca yanıltmasın. */}
            {month === currentMonth ? (
              <div className="mt-4 bg-white/[0.03] border border-white/5 rounded-2xl p-4">
                <p className="text-[10px] text-gray-500 font-black uppercase mb-3">
                  Bu Ay Uygulama Tahsilatı{oynaEarn.monthCount > 0 ? ` · ${oynaEarn.monthCount} ödeme` : ''}
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Brüt tahsilat</span><span className="text-white font-bold">{money(oynaEarn.monthGross)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">OYNA komisyonu</span><span className="text-red-300 font-bold">−{money(oynaEarn.monthCommission)}</span></div>
                  <div className="h-px bg-white/8 my-1" />
                  <div className="flex justify-between"><span className="text-gray-300 font-bold">Net kazanç</span><span className="text-emerald-400 font-black">{money(oynaEarn.monthNet)}</span></div>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-gray-500 mt-4">Çekilebilir/güvence tutarları günceldir; aylık uygulama kırılımı yalnız içinde bulunduğumuz ayda gösterilir.</p>
            )}
            {oynaEarn.reserved > 0 && (
              <p className="text-[11px] text-yellow-300/90 mt-3">{money(oynaEarn.reserved)} bekleyen çekim talebinde rezerve.</p>
            )}
          </div>
        )}

        {/* Sekmeler */}
        <div className="flex bg-[#161B22] p-1.5 rounded-2xl mb-8 border border-white/5">
          {([['SUMMARY', 'Özet'], ['COLLECT', 'Tahsilat'], ['EXPENSE', 'Gider']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${
                tab === id ? 'bg-blue-500/15 text-blue-300 border border-blue-500/20' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* key={month}: ay değişince ÖZET içi seçili gün/yöntem durumu sıfırlansın. */}
        {tab === 'SUMMARY' && <FinanceSummaryTab key={month} summary={summary} onOpenCalendarWeek={onOpenCalendar} />}
        {tab === 'COLLECT' && (
          <FinanceCollectTab
            summary={summary}
            debtors={debtors}
            readOnly={readOnly}
            onAddDebtor={onAddDebtor}
            onChanged={load}
            notify={notify}
          />
        )}
        {tab === 'EXPENSE' && (
          <FinanceExpenseTab
            summary={summary}
            expenses={expenses}
            readOnly={readOnly}
            pitchId={pitchId}
            currentMonth={currentMonth}
            onAddExpense={onAddExpense}
            onChanged={load}
            notify={notify}
          />
        )}
        </>
        )}
      </div>

      {withdrawalOpen && (
        <OwnerWithdrawalsModal facilityId={pitchId} readOnly={readOnly} onClose={() => { setWithdrawalOpen(false); load(); }} />
      )}
    </div>
  );
};
