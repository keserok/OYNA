import React from 'react';
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import { money } from '../finance/financeUi';
import type { WeeklySummary } from '../../../services/pitchOwnerService';

// ─── Haftalık İşletme Özeti kartı (köprü paketi #5, 9 Ağu 2026) ─────────────
// Veriyi gece işi üretir (haftalik_ozet_uret); kart yalnız kayıt varsa çizilir.
// Amaç: sahibi OYNA'nın katkısını SAYIYLA görsün — "değer katıyor" hissinin motoru.

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

export const OwnerWeeklySummaryCard: React.FC<{ summary: WeeklySummary }> = ({ summary }) => {
  const d = summary.data;
  const kiyas = d.onceki_tahsilat > 0
    ? Math.round(((d.tahsilat - d.onceki_tahsilat) / d.onceki_tahsilat) * 100)
    : null;
  return (
    <div className="bg-[#161B22] border border-white/5 rounded-3xl p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center text-[#F5F3EE]/80"><BarChart3 size={18} /></span>
          Geçen Haftanın Özeti
        </h3>
        {kiyas != null && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${kiyas >= 0 ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/25' : 'text-red-300 bg-red-500/15 border-red-500/25'}`}>
            {kiyas >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />} %{Math.abs(kiyas)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-[#0A0E14] border border-white/5 rounded-2xl p-3">
          <p className="text-lg font-extrabold text-white tabular-nums">{d.rezervasyon}</p>
          <p className="text-[10px] font-bold text-gray-500 uppercase">Rezervasyon</p>
        </div>
        <div className="bg-[#0A0E14] border border-white/5 rounded-2xl p-3">
          <p className="text-lg font-extrabold text-emerald-400 tabular-nums truncate">{money(d.tahsilat)}</p>
          <p className="text-[10px] font-bold text-gray-500 uppercase">Tahsilat</p>
        </div>
        <div className="bg-[#0A0E14] border border-white/5 rounded-2xl p-3">
          <p className="text-lg font-extrabold text-white truncate">{d.yogun_gun ? GUNLER[d.yogun_gun] : '—'}</p>
          <p className="text-[10px] font-bold text-gray-500 uppercase">{d.yogun_saat != null ? `Yoğun · ${String(d.yogun_saat).padStart(2, '0')}:00` : 'En yoğun gün'}</p>
        </div>
      </div>
    </div>
  );
};
