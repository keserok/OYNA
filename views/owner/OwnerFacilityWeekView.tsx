import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Loader2, RefreshCcw, Flame } from 'lucide-react';
import { getFacilitySchedule, type FacilitySchedule } from '../../services/facilitySchedule';
import { buildFacilityWeekGrid, weekStartISO, addDaysISO } from '../../shared/facilityWeekModel';

// ─── OW-E (P4) — HAFTA görünümü: satır=kort, sütun=7 gün, doluluk ısı-haritası ─
// Haftanın hangi gün/kort yoğun olduğunu tek bakışta gösterir. Gün başlığına
// dokununca o güne (GÜN görünümü) atlar. Veri get_facility_schedule (1 hafta);
// birleştirme saf facilityWeekModel'de (unit-testli).

interface Props {
  pitchId: string;
  isRealPitch: boolean;
  selectedDateISO: string;
  onSelectDay: (dateISO: string) => void;
  refreshKey?: number;
}

const DOW_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

/** Doluluk %'ine göre ısı-harita hücre stili. */
function heatStyle(pct: number, closed: boolean): string {
  if (closed) return 'bg-white/[0.02] text-slate-700';
  if (pct <= 0) return 'bg-[#0A0E14] text-slate-600';
  if (pct < 25) return 'bg-blue-500/15 text-blue-200';
  if (pct < 50) return 'bg-blue-500/30 text-blue-100';
  if (pct < 75) return 'bg-amber-500/30 text-amber-100';
  return 'bg-red-500/35 text-red-100';
}

export const OwnerFacilityWeekView: React.FC<Props> = ({
  pitchId, isRealPitch, selectedDateISO, onSelectDay, refreshKey,
}) => {
  const weekStart = useMemo(() => weekStartISO(selectedDateISO), [selectedDateISO]);
  const [schedule, setSchedule] = useState<FacilitySchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isRealPitch) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      setSchedule(await getFacilitySchedule(pitchId, weekStart, addDaysISO(weekStart, 6)));
    } catch (e: any) {
      setError(e?.message || 'Hafta yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [pitchId, weekStart, isRealPitch]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const grid = useMemo(
    () => (schedule ? buildFacilityWeekGrid(schedule, weekStart) : null),
    [schedule, weekStart],
  );

  if (!isRealPitch) {
    return <div className="p-8 text-center text-slate-500 text-sm">Hafta görünümü onaylı tesiste kullanılabilir.</div>;
  }
  if (loading) {
    return <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 size={20} className="animate-spin" /></div>;
  }
  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-400 font-bold mb-3">{error}</p>
        <button onClick={load} className="text-xs text-blue-400 font-bold inline-flex items-center gap-1.5"><RefreshCcw size={12} /> Tekrar dene</button>
      </div>
    );
  }
  if (!grid || grid.courts.length === 0) {
    return <div className="p-8 text-center text-slate-500 text-sm">Bu tesiste aktif kort yok.</div>;
  }

  const busiest = grid.busiestDayISO;

  return (
    <div className="space-y-3">
      {/* Başlık: hafta aralığı + en yoğun gün */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-slate-400 font-bold">
          {grid.courts.length} kort · {DOW_LABELS[0]} {weekStart.slice(8)} – {DOW_LABELS[6]} {addDaysISO(weekStart, 6).slice(8)}
        </span>
        {busiest && (
          <span className="flex items-center gap-1 text-[11px] font-black text-amber-300">
            <Flame size={12} /> En yoğun: {DOW_LABELS[(grid.days.find((d) => d.dateISO === busiest)?.dow ?? 1) - 1]}
          </span>
        )}
      </div>

      {/* Isı-harita: sol kort sütunu sabit, 7 gün yatay */}
      <div className="overflow-x-auto custom-scrollbar -mx-1 px-1">
        <div className="inline-grid gap-1" style={{ gridTemplateColumns: `72px repeat(7, minmax(44px, 1fr))` }}>
          {/* Başlık satırı: gün etiketleri (tıklanınca o güne atla) */}
          <div className="sticky left-0 z-10 bg-[#161B22]" />
          {grid.days.map((d) => (
            <button
              key={d.dateISO}
              onClick={() => onSelectDay(d.dateISO)}
              className={`text-center pb-1 rounded-md transition-colors ${d.dateISO === busiest ? 'text-amber-300' : 'text-slate-300'} ${d.dateISO === selectedDateISO ? 'bg-white/5' : 'hover:bg-white/5'}`}
              title="Bu güne git"
            >
              <div className="text-[10px] font-black uppercase">{DOW_LABELS[d.dow - 1]}</div>
              <div className="text-[10px] font-bold text-slate-500 tabular-nums">{d.dateISO.slice(8)}</div>
            </button>
          ))}

          {/* Kort satırları */}
          {grid.courts.map((court) => (
            <React.Fragment key={court.courtId}>
              <div className="sticky left-0 z-10 bg-[#161B22] text-[10px] font-black text-slate-300 uppercase truncate flex items-center pr-1">
                {court.courtName}
              </div>
              {grid.days.map((d) => {
                const cell = d.courts.find((c) => c.courtId === court.courtId);
                const pct = cell?.occupancyPercent ?? 0;
                return (
                  <button
                    key={d.dateISO}
                    onClick={() => onSelectDay(d.dateISO)}
                    className={`h-10 rounded-lg border border-white/5 text-[10px] font-black tabular-nums flex items-center justify-center transition-all hover:border-white/20 ${heatStyle(pct, d.closed)}`}
                    title={`${court.courtName} · ${DOW_LABELS[d.dow - 1]}: %${pct}`}
                  >
                    {d.closed ? '–' : pct > 0 ? `%${pct}` : ''}
                  </button>
                );
              })}
            </React.Fragment>
          ))}

          {/* Alt satır: gün geneli doluluk */}
          <div className="sticky left-0 z-10 bg-[#161B22] text-[9px] font-bold text-slate-500 uppercase flex items-center pr-1">Gün</div>
          {grid.days.map((d) => (
            <div
              key={d.dateISO}
              className={`h-7 rounded-lg text-[10px] font-black tabular-nums flex items-center justify-center ${heatStyle(d.occupancyPercent, d.closed)}`}
            >
              {d.closed ? '–' : `%${d.occupancyPercent}`}
            </div>
          ))}
        </div>
      </div>

      {/* Isı lejantı */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-1 text-[9px] text-slate-500 font-bold">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500/15" /> &lt;%25</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500/30" /> %25–50</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500/30" /> %50–75</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500/35" /> &gt;%75</span>
        <span className="opacity-70">· Güne dokun → detay</span>
      </div>
    </div>
  );
};

export default OwnerFacilityWeekView;
