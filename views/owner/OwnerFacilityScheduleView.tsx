import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Loader2, Lock, Clock, RefreshCcw } from 'lucide-react';
import { getFacilitySchedule, type FacilitySchedule } from '../../services/facilitySchedule';
import { buildFacilityDayGrid, type CellStatus, type GridCell } from '../../shared/facilityScheduleModel';
import { useOwnerToast } from './components/useOwnerToast';

// ─── OW-E (P4) — TESİS görünümü: satır=saat, sütun=kort, renk-kodlu ──────────
// Çok kortlu tesisi tek bakışta gösterir. Boş hücreye dokunuş → hızlı rezervasyon.
// Veri get_facility_schedule RPC'sinden; ızgara saf facilityScheduleModel'de.

interface Props {
  pitchId: string;
  isRealPitch: boolean;
  selectedDateISO: string;
  /** Boş hücreye dokununca hızlı rezervasyon aç (mevcut quick-create akışı). */
  onQuickBook: (courtId: string, time: string) => void;
  /** Rezervasyon detayı için (opsiyonel). */
  onBookingTap?: (bookingId: string) => void;
  refreshKey?: number;
}

const CELL_STYLE: Record<CellStatus, string> = {
  AVAILABLE: 'bg-[#0A0E14] border-white/5 hover:border-blue-500/40 hover:bg-blue-500/5 cursor-pointer',
  BOOKED:    'bg-blue-500/15 border-blue-500/30 text-blue-200',
  PENDING:   'bg-amber-500/15 border-amber-500/30 text-amber-200',
  CLOSED:    'bg-white/[0.03] border-white/5 text-slate-600',
  HOLD:      'bg-purple-500/15 border-purple-500/40 text-purple-200 animate-pulse',
};

const SOURCE_LABEL: Record<string, string> = {
  OWNER_MANUAL: 'Elle', APP_BOOKING: 'App', SUBSCRIPTION: 'Abonman', APP_MATCH: 'Maç',
};

export const OwnerFacilityScheduleView: React.FC<Props> = ({
  pitchId, isRealPitch, selectedDateISO, onQuickBook, onBookingTap, refreshKey,
}) => {
  const notify = useOwnerToast();
  const [schedule, setSchedule] = useState<FacilitySchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isRealPitch) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      setSchedule(await getFacilitySchedule(pitchId, selectedDateISO, selectedDateISO));
    } catch (e: any) {
      setError(e?.message || 'Takvim yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [pitchId, selectedDateISO, isRealPitch]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const grid = useMemo(
    () => (schedule ? buildFacilityDayGrid(schedule, selectedDateISO) : null),
    [schedule, selectedDateISO],
  );

  if (!isRealPitch) {
    return <div className="p-8 text-center text-slate-500 text-sm">Tesis görünümü onaylı tesiste kullanılabilir.</div>;
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
  if (grid.closed) {
    return <div className="p-8 text-center text-slate-500 text-sm flex flex-col items-center gap-2"><Lock size={20} /> Tesis bu gün kapalı.</div>;
  }

  return (
    <div className="space-y-3">
      {/* Doluluk özeti */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-bold">
          <Clock size={13} /> {grid.courts.length} kort · {grid.openHours} saat açık
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${grid.occupancyPercent}%` }} />
          </div>
          <span className="text-[11px] font-black text-white tabular-nums">%{grid.occupancyPercent}</span>
        </div>
      </div>

      {/* Izgara: sol saat sütunu sabit, kort sütunları yatay kayar */}
      <div className="overflow-x-auto custom-scrollbar -mx-1 px-1">
        <div className="inline-grid gap-1" style={{ gridTemplateColumns: `48px repeat(${grid.courts.length}, minmax(84px, 1fr))` }}>
          {/* Başlık satırı */}
          <div className="sticky left-0 z-10 bg-[#161B22]" />
          {grid.courts.map((c) => (
            <div key={c.courtId} className="text-center text-[10px] font-black text-slate-300 uppercase truncate px-1 pb-1">{c.courtName}</div>
          ))}

          {/* Saat satırları */}
          {grid.hours.map((hour, rowIdx) => (
            <React.Fragment key={hour}>
              <div className="sticky left-0 z-10 bg-[#161B22] text-[10px] font-bold text-slate-500 tabular-nums flex items-center justify-end pr-2">
                {String(hour).padStart(2, '0')}:00
              </div>
              {grid.courts.map((col) => {
                const cell: GridCell = col.cells[rowIdx];
                const isBooking = cell.status === 'BOOKED' || cell.status === 'PENDING';
                return (
                  <button
                    key={col.courtId}
                    disabled={cell.status === 'CLOSED'}
                    onClick={() => {
                      if (cell.status === 'AVAILABLE') onQuickBook(col.courtId, cell.time);
                      else if (isBooking && cell.booking && onBookingTap) onBookingTap(cell.booking.id);
                    }}
                    className={`h-9 rounded-lg border text-[9px] font-bold px-1 flex flex-col items-center justify-center leading-tight transition-all disabled:cursor-not-allowed ${CELL_STYLE[cell.status]}`}
                  >
                    {cell.status === 'CLOSED' ? <Lock size={10} />
                      : isBooking && !cell.isContinuation ? (
                        <>
                          <span className="truncate max-w-full">{cell.booking?.customer_name || cell.booking?.title || 'Dolu'}</span>
                          <span className="opacity-60">{SOURCE_LABEL[cell.booking?.source ?? ''] ?? ''}</span>
                        </>
                      ) : isBooking ? <span className="opacity-40">↑</span>
                      : cell.status === 'HOLD' ? <span>Alınıyor</span>
                      : null}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Lejant */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-1 text-[9px] text-slate-500 font-bold">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500/40 border border-blue-500/30" /> Dolu</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500/40 border border-amber-500/30" /> Onay bekliyor</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-purple-500/40 border border-purple-500/40" /> Alınıyor</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-white/10 border border-white/10" /> Kapalı</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[#0A0E14] border border-white/10" /> Boş → dokun</span>
      </div>
    </div>
  );
};

export default OwnerFacilityScheduleView;
