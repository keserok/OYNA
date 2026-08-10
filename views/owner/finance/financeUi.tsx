import React, { useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatTRYAmount } from '../../../utils/formatTRY';
import { sharePercent, type GrowthResult, type DayBar } from '../../../shared/financeModel';

// ─── FI-1 — Finans ekranı ortak sunum parçaları ──────────────────────────────

/** IP-19: gövde SİLİNDİ, tek kaynağa alias oldu — ikinci implementasyon yok.
 *  Tek fark: finans raporunda sıfır "Ücretsiz" değil "0₺"dir (muhasebe satırı,
 *  bedava bir şey değil). */
export const money = formatTRYAmount;

/** Kıyas rozeti: ▲%12 (yeşil) / ▼%8 (kırmızı) / "Yeni" (prev 0) / "—" (eşit). */
export const GrowthBadge: React.FC<{ growth: GrowthResult; label?: string }> = ({ growth, label }) => {
  if (growth.pct === null) {
    return <span className="text-[11px] font-extrabold text-emerald-400">Yeni{label ? ` ${label}` : ''}</span>;
  }
  if (growth.direction === 'flat') {
    return <span className="text-[11px] font-bold text-ink-4">Değişim yok</span>;
  }
  const up = growth.direction === 'up';
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      <Icon size={12} /> %{Math.abs(growth.pct)}{label ? ` ${label}` : ''}
    </span>
  );
};

/** Özet istatistik kutusu. */
export const StatTile: React.FC<{ label: string; value: string; accent?: string; sub?: string }> = ({
  label, value, accent = 'text-white', sub,
}) => (
  <div className="bg-white/5 p-3 rounded-2xl border border-white/5 min-w-0">
    <p className="text-[10px] text-ink-4 font-extrabold uppercase mb-1">{label}</p>
    {/* MOB-M7: dar sütunda büyük tutar taşmasın — küçük ekranda ufalt + kırp. */}
    <p className={`text-lg font-extrabold tabular-nums truncate ${accent}`} title={value}>{value}</p>
    {sub && <p className="text-[10px] text-ink-4 mt-1 truncate">{sub}</p>}
  </div>
);

/** Kırılım listesi: etiket + oran çubuğu + tutar (yöntem/kaynak/kategori). */
export const BreakdownList: React.FC<{
  rows: { key: string; label: string; amount: number; count?: number }[];
  total: number;
  color?: string;
  emptyText?: string;
  onRowClick?: (key: string) => void;
  activeKey?: string | null;
}> = ({ rows, total, color = '#3B82F6', emptyText = 'Kayıt yok', onRowClick, activeKey }) => {
  if (rows.length === 0) return <p className="text-sm text-ink-4 px-1">{emptyText}</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const pct = sharePercent(r.amount, total);
        const active = activeKey === r.key;
        const Row = onRowClick ? 'button' : 'div';
        return (
          <Row
            key={r.key}
            {...(onRowClick ? { onClick: () => onRowClick(r.key), type: 'button' } : {})}
            className={`w-full text-left ${onRowClick ? 'cursor-pointer' : ''}`}
          >
            <div className="flex justify-between items-baseline mb-1">
              <span className={`text-xs font-bold ${active ? 'text-white' : 'text-gray-300'}`}>
                {r.label}{typeof r.count === 'number' && r.count > 0 ? <span className="text-ink-4"> · {r.count}</span> : ''}
              </span>
              <span className="text-sm font-extrabold text-white tabular-nums">{money(r.amount)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color, opacity: active ? 1 : 0.65 }} />
            </div>
          </Row>
        );
      })}
    </div>
  );
};

/** Günlük tahsilat çubukları — ay serisi; bir çubuğa dokun → tepe caption güncellenir. */
export const DailyBars: React.FC<{ series: DayBar[]; monthLabelText: string }> = ({ series, monthLabelText }) => {
  const max = Math.max(...series.map((d) => d.collected), 1);
  const peak = series.reduce((a, b) => (b.collected > a.collected ? b : a), series[0]);
  const [sel, setSel] = useState<DayBar | null>(null);
  const shown = sel ?? (peak && peak.collected > 0 ? peak : null);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-xs font-extrabold text-gray-400 uppercase flex items-center gap-2">
          <TrendingUp size={16} className="text-emerald-400" /> Günlük Tahsilat
        </h3>
        {shown ? (
          <span className="text-[11px] font-bold text-gray-400">
            {String(shown.day).padStart(2, '0')} {monthLabelText.split(' ')[0]} · <span className="text-emerald-400 font-extrabold">{money(shown.collected)}</span>
          </span>
        ) : (
          <span className="text-[11px] text-ink-4">Bu ay tahsilat yok</span>
        )}
      </div>
      <div className="h-32 flex items-end gap-[3px]">
        {series.map((d) => {
          const active = shown?.date === d.date;
          return (
            <button
              key={d.date}
              onClick={() => setSel((s) => (s?.date === d.date ? null : d))}
              className="flex-1 h-full flex items-end min-w-0 touch-manipulation select-none"
              title={`${d.day} · ${money(d.collected)}`}
            >
              <div
                className={`w-full rounded-t-[3px] transition-all ${active ? 'bg-emerald-300' : d.collected > 0 ? 'bg-gradient-to-t from-emerald-900 to-emerald-500' : 'bg-white/[0.04]'}`}
                style={{ height: `${d.collected > 0 ? Math.max((d.collected / max) * 100, 4) : 2}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5 text-[9px] text-ink-4 font-bold tabular-nums">
        <span>1</span><span>{Math.ceil(series.length / 2)}</span><span>{series.length}</span>
      </div>
    </div>
  );
};
