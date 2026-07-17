import React, { useMemo, useState } from 'react';
import { Wallet, Users, PieChart, AlertTriangle, CalendarRange, ChevronRight } from 'lucide-react';
import type { FinanceSummary } from '../../../services/financeService';
import { buildMonthSeries, methodLabel, sourceLabel, monthLabel } from '../../../shared/financeModel';
import { money, BreakdownList, DailyBars } from './financeUi';

// ─── FI-1 — ÖZET sekmesi: grafik + tutar-bazlı kırılımlar + dürüstlük sayacı ──

interface Props {
  summary: FinanceSummary;
  onOpenCalendarWeek?: () => void;
}

export const FinanceSummaryTab: React.FC<Props> = ({ summary, onOpenCalendarWeek }) => {
  const { income, expenses } = summary;
  const monthText = monthLabel(summary.period.month);
  const series = useMemo(() => buildMonthSeries(income.daily, summary.period.month), [income.daily, summary.period.month]);
  const [activeMethod, setActiveMethod] = useState<string | null>(null);

  const methodRows = income.by_method.map((m) => ({ key: m.method, label: methodLabel(m.method), amount: m.amount, count: m.count }));
  const sourceRows = income.by_source.map((s) => ({ key: s.source, label: sourceLabel(s.source), amount: s.amount }));
  const catRows = expenses.by_category.map((c) => ({ key: c.category, label: c.category, amount: c.amount, count: c.count }));

  const methodPayments = activeMethod
    ? income.recent_payments.filter((p) => p.method === activeMethod)
    : [];

  return (
    <div className="space-y-6">
      {/* Günlük tahsilat grafiği */}
      <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6">
        <DailyBars series={series} monthLabelText={monthText} />
      </div>

      {/* Ödeme yöntemi kırılımı — tıkla → o yöntemin ödemeleri */}
      <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6">
        <h3 className="text-xs font-black text-gray-400 uppercase mb-4 flex items-center gap-2">
          <Wallet size={16} className="text-blue-400" /> Ödeme Yöntemi
        </h3>
        <BreakdownList
          rows={methodRows}
          total={income.collected_total}
          color="#3B82F6"
          emptyText="Bu ay tahsilat kaydı yok."
          onRowClick={(k) => setActiveMethod((a) => (a === k ? null : k))}
          activeKey={activeMethod}
        />
        {activeMethod && (
          <div className="mt-4 pt-4 border-t border-white/5 space-y-2 animate-in fade-in duration-300">
            <p className="text-[10px] font-black text-gray-500 uppercase">{methodLabel(activeMethod)} işlemleri</p>
            {methodPayments.length === 0 ? (
              <p className="text-xs text-gray-600">
                {activeMethod === 'UNSPECIFIED'
                  ? 'Bu tutar bir rezervasyonda "ödendi" olarak işaretli ama ödeme kaydı (yöntemi) girilmemiş.'
                  : 'Bu yöntemin ödemeleri son 20 işlem arasında görünmüyor.'}
              </p>
            ) : methodPayments.slice(0, 8).map((p) => (
              <div key={p.id} className="flex justify-between items-center text-sm">
                <span className="text-gray-300 truncate">{p.customer_name ?? 'Müşteri'}<span className="text-gray-600"> · {p.booking_date}</span></span>
                <span className="text-white font-bold tabular-nums">{money(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gelir kaynağı (tutar bazlı — D4) */}
      <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6">
        <h3 className="text-xs font-black text-gray-400 uppercase mb-4 flex items-center gap-2">
          <Users size={16} className="text-emerald-400" /> Gelir Kaynağı
        </h3>
        <BreakdownList rows={sourceRows} total={income.collected_total} color="#10B981" emptyText="Bu ay tahsilat kaydı yok." />
      </div>

      {/* Gider dağılımı */}
      <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6">
        <h3 className="text-xs font-black text-gray-400 uppercase mb-4 flex items-center gap-2">
          <PieChart size={16} className="text-fuchsia-400" /> Gider Dağılımı
        </h3>
        <BreakdownList rows={catRows} total={expenses.total} color="#D946EF" emptyText="Bu ay gider kaydı yok." />
      </div>

      {/* Dürüstlük sayacı: paid_amount ile ödeme kayıtları uyuşmuyor */}
      {income.mismatch_count > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-black text-amber-300">{income.mismatch_count} rezervasyonda tahsilat–ödeme kaydı uyuşmuyor</p>
            <p className="text-[11px] text-amber-200/70 mt-1 leading-relaxed">
              Bu rezervasyonların "ödendi" tutarı, girilen ödeme kayıtlarının toplamıyla eşleşmiyor.
              Yöntemi belirtilmemiş tahsilatlar "Ödeme Yöntemi"nde ayrı gösterilir.
            </p>
          </div>
        </div>
      )}

      {/* Doluluk için Takvim → HAFTA (heatmap mükerrerliği kaldırıldı — U10) */}
      <button
        type="button"
        onClick={onOpenCalendarWeek}
        disabled={!onOpenCalendarWeek}
        className="w-full bg-[#161B22] border border-white/5 rounded-2xl p-4 flex items-center justify-between text-left disabled:opacity-60"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center"><CalendarRange size={18} className="text-emerald-400" /></div>
          <div>
            <p className="text-sm font-bold text-white">Doluluk & yoğunluk</p>
            <p className="text-[11px] text-gray-500">Takvim → Hafta görünümünde kort×gün ısı-haritası</p>
          </div>
        </div>
        {onOpenCalendarWeek && <ChevronRight size={18} className="text-gray-500" />}
      </button>
    </div>
  );
};
