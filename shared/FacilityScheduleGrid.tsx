import React from 'react';
import { Clock, Lock } from 'lucide-react';
import type { CellStatus, GridCell, FacilityDayGrid } from './facilityScheduleModel';

// ─── OW-E (P4) — Tesis takvimi sunum ızgarası (owner + admin ortak) ──────────
// Saf sunum: satır=saat, sütun=kort, renk-kodlu. Veri çekme/yükleme durumu
// çağırana ait. `interactive=false` → salt-okuma (admin gözetimi): boş hücre
// tıklanamaz. `interactive=true` → owner: boş hücre → hızlı rezervasyon.

const CELL_STYLE: Record<CellStatus, string> = {
  AVAILABLE: 'bg-bg border-white/5',
  BOOKED:    'bg-blue-500/15 border-blue-500/30 text-blue-200',
  PENDING:   'bg-amber-500/15 border-amber-500/30 text-amber-200',
  CLOSED:    'bg-white/[0.03] border-white/5 text-slate-600',
  HOLD:      'bg-purple-500/15 border-purple-500/40 text-purple-200 animate-pulse',
};
const AVAILABLE_INTERACTIVE = 'hover:border-blue-500/40 hover:bg-blue-500/5 cursor-pointer';

const SOURCE_LABEL: Record<string, string> = {
  OWNER_MANUAL: 'Elle', APP_BOOKING: 'App', SUBSCRIPTION: 'Abonman', APP_MATCH: 'Maç',
};

export interface FacilityScheduleGridProps {
  grid: FacilityDayGrid;
  /** true → owner (boş hücre tıklanabilir); false → admin salt-okuma gözetim. */
  interactive?: boolean;
  onQuickBook?: (courtId: string, time: string) => void;
  onBookingTap?: (bookingId: string) => void;
}

export const FacilityScheduleGrid: React.FC<FacilityScheduleGridProps> = ({
  grid, interactive = false, onQuickBook, onBookingTap,
}) => {
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
          <div className="sticky left-0 z-10 bg-surface-1" />
          {grid.courts.map((c) => (
            <div key={c.courtId} className="text-center text-[10px] font-black text-slate-300 uppercase truncate px-1 pb-1">{c.courtName}</div>
          ))}

          {/* Saat satırları */}
          {grid.hours.map((hour, rowIdx) => (
            <React.Fragment key={hour}>
              <div className="sticky left-0 z-10 bg-surface-1 text-[10px] font-bold text-slate-500 tabular-nums flex items-center justify-end pr-2">
                {String(hour).padStart(2, '0')}:00
              </div>
              {grid.courts.map((col) => {
                const cell: GridCell = col.cells[rowIdx];
                const isBooking = cell.status === 'BOOKED' || cell.status === 'PENDING';
                const canTapAvailable = interactive && cell.status === 'AVAILABLE';
                const canTapBooking = isBooking && !!cell.booking && !!onBookingTap;
                return (
                  <button
                    key={col.courtId}
                    disabled={cell.status === 'CLOSED' || (!canTapAvailable && !canTapBooking)}
                    onClick={() => {
                      if (canTapAvailable) onQuickBook?.(col.courtId, cell.time);
                      else if (canTapBooking) onBookingTap!(cell.booking!.id);
                    }}
                    className={`h-9 rounded-lg border text-[9px] font-bold px-1 flex flex-col items-center justify-center leading-tight transition-all disabled:cursor-default ${CELL_STYLE[cell.status]}${canTapAvailable ? ' ' + AVAILABLE_INTERACTIVE : ''}`}
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
        {interactive && (
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-bg border border-white/10" /> Boş → dokun</span>
        )}
      </div>
    </div>
  );
};

export default FacilityScheduleGrid;
