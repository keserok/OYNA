import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Activity, Calendar as CalendarIcon, Clock, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { getOccupancyMatrix, OccupancyMatrix, OccupancyCell } from '../services/pitchService';
import { fbSubscribePitchBookings } from '../supabaseMutations';

interface OccupancyCalendarProps {
  pitchId: string;
  variant?: 'player' | 'owner'; // owner: hücre tıklanır (drawer), player: slot seçilir
  onSlotSelect?: (date: string, time: string) => void;
  selectedSlot?: { date: string; time: string } | null;
  onBookingClick?: (bookingId: string, title?: string) => void;
}

const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const startOfWeek = (d: Date): Date => {
  const result = new Date(d);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Pazartesi başlangıç
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

const formatDayLabel = (dateStr: string, dayIdx: number): { dayName: string; dayNum: string } => {
  const d = new Date(dateStr);
  return {
    dayName: DAY_NAMES[dayIdx],
    dayNum: String(d.getDate())
  };
};

const isToday = (dateStr: string): boolean => {
  const t = new Date();
  const d = new Date(dateStr);
  return (
    t.getFullYear() === d.getFullYear() &&
    t.getMonth() === d.getMonth() &&
    t.getDate() === d.getDate()
  );
};

const OccupancyCalendar: React.FC<OccupancyCalendarProps> = ({
  pitchId,
  variant = 'player',
  onSlotSelect,
  selectedSlot,
  onBookingClick
}) => {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [matrix, setMatrix] = useState<OccupancyMatrix | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMatrix = async () => {
    setLoading(true);
    try {
      const result = await getOccupancyMatrix(pitchId, weekStart);
      setMatrix(result);
    } catch (e) {
      console.error('Occupancy matrix error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatrix();
  }, [pitchId, weekStart]);

  // Realtime: pitch_bookings değişirse matrisi yenile
  useEffect(() => {
    if (!pitchId) return;
    const unsubscribe = fbSubscribePitchBookings(pitchId, () => {
      fetchMatrix();
    });
    return unsubscribe;
  }, [pitchId, weekStart]);

  const goPrevWeek = () => {
    const newStart = new Date(weekStart);
    newStart.setDate(newStart.getDate() - 7);
    setWeekStart(newStart);
  };

  const goNextWeek = () => {
    const newStart = new Date(weekStart);
    newStart.setDate(newStart.getDate() + 7);
    setWeekStart(newStart);
  };

  const handleCellClick = (cell: OccupancyCell) => {
    if (cell.status === 'PAST') return;
    if (cell.status === 'BOOKED') {
      if (variant === 'owner' && cell.bookingId) {
        onBookingClick?.(cell.bookingId, cell.bookingTitle);
      }
      return;
    }
    onSlotSelect?.(cell.date, cell.time);
  };

  if (loading && !matrix) {
    return (
      <div className="bg-[#161B22] border border-white/5 rounded-3xl p-12 flex items-center justify-center">
        <Loader2 className="animate-spin text-[#FFFF00]" size={32} />
      </div>
    );
  }

  if (!matrix) return null;

  return (
    <div className="bg-[#0A0E14] border border-white/5 rounded-3xl overflow-hidden">
      {/* Top Band: Occupancy Stats */}
      <div className="px-5 py-4 bg-gradient-to-r from-[#FFFF00]/5 to-transparent border-b border-white/5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center font-black text-base ${
                matrix.currentOccupancyPct >= 85
                  ? 'border-red-500/50 bg-red-500/10 text-red-400'
                  : matrix.currentOccupancyPct >= 60
                  ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400'
                  : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
              }`}
            >
              %{matrix.currentOccupancyPct}
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Bugün Doluluk</p>
              <p className="text-sm font-black text-white">
                {matrix.currentOccupancyPct >= 85
                  ? 'Çok Yoğun'
                  : matrix.currentOccupancyPct >= 60
                  ? 'Yoğun'
                  : 'Müsait'}
              </p>
            </div>
          </div>
          {matrix.emptiestHour && (
            <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2">
              <TrendingDown size={14} />
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest opacity-80">En Boş</p>
                <p className="text-xs font-black">{matrix.emptiestHour}</p>
              </div>
            </div>
          )}
          {matrix.busiestHour && (
            <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
              <TrendingUp size={14} />
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest opacity-80">En Yoğun</p>
                <p className="text-xs font-black">{matrix.busiestHour}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Week Nav */}
      <div className="px-5 py-3 flex items-center justify-between border-b border-white/5 bg-[#161B22]/50">
        <button
          onClick={goPrevWeek}
          className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <CalendarIcon size={14} className="text-[#FFFF00]" />
          <span className="text-xs font-black text-white uppercase tracking-widest">
            {new Date(matrix.days[0]).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} -{' '}
            {new Date(matrix.days[6]).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
          </span>
        </div>
        <button
          onClick={goNextWeek}
          className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto custom-scrollbar">
        <div className="min-w-[700px] p-4">
          {/* Day headers */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-1 mb-2">
            <div></div>
            {matrix.days.map((dayStr, idx) => {
              const { dayName, dayNum } = formatDayLabel(dayStr, idx);
              const today = isToday(dayStr);
              return (
                <div
                  key={dayStr}
                  className={`text-center py-2 rounded-lg ${
                    today ? 'bg-[#FFFF00]/10 border border-[#FFFF00]/30' : ''
                  }`}
                >
                  <p
                    className={`text-[10px] font-black uppercase tracking-widest ${
                      today ? 'text-[#FFFF00]' : 'text-gray-500'
                    }`}
                  >
                    {dayName}
                  </p>
                  <p className={`text-sm font-black ${today ? 'text-[#FFFF00]' : 'text-white'}`}>
                    {dayNum}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Hour rows */}
          {matrix.hours.map((hour, hourIdx) => (
            <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] gap-1 mb-1">
              <div className="flex items-center justify-end pr-2">
                <span className="text-[10px] font-black text-gray-500 tracking-widest">{hour}</span>
              </div>
              {matrix.cells.map((dayCells, dayIdx) => {
                const cell = dayCells[hourIdx];
                const isSelected =
                  selectedSlot && selectedSlot.date === cell.date && selectedSlot.time === cell.time;

                let cellClasses =
                  'h-8 rounded-md transition-all duration-150 border text-[9px] font-bold flex items-center justify-center';
                if (cell.status === 'PAST') {
                  cellClasses += ' bg-white/[0.02] border-white/5 text-gray-700 cursor-not-allowed';
                } else if (cell.status === 'BOOKED') {
                  if (cell.bookingType === 'SUB') {
                    cellClasses +=
                      ' bg-blue-500/30 border-blue-500/50 text-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.15)]';
                  } else if (cell.bookingType === 'DAILY' || cell.bookingType === 'PHONE') {
                    cellClasses +=
                      ' bg-emerald-500/30 border-emerald-500/50 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.15)]';
                  } else {
                    cellClasses +=
                      ' bg-purple-500/30 border-purple-500/50 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.15)]';
                  }
                  if (variant === 'owner') cellClasses += ' cursor-pointer hover:brightness-125';
                } else {
                  // AVAILABLE
                  if (isSelected) {
                    cellClasses += ' bg-[#FFFF00] border-[#FFFF00] text-black scale-105 shadow-[0_0_15px_rgba(255,255,0,0.5)]';
                  } else {
                    cellClasses += ' bg-white/5 border-white/10 text-gray-400 hover:bg-[#FFFF00]/10 hover:border-[#FFFF00]/30 hover:text-white cursor-pointer';
                  }
                }

                return (
                  <button
                    key={cell.date + cell.time}
                    onClick={() => handleCellClick(cell)}
                    disabled={cell.status === 'PAST'}
                    className={cellClasses}
                    title={
                      cell.status === 'BOOKED' && cell.bookingTitle
                        ? `${cell.bookingTitle} - ${cell.time}`
                        : cell.status === 'PAST'
                        ? 'Geçmiş'
                        : 'Müsait'
                    }
                  >
                    {cell.status === 'BOOKED' && variant === 'owner' && '●'}
                    {isSelected && '✓'}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="px-5 py-3 border-t border-white/5 bg-[#161B22]/50 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-white/5 border border-white/10"></div>
          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Müsait</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-500/30 border border-blue-500/50"></div>
          <span className="text-[9px] font-bold text-blue-300 uppercase tracking-widest">Abone</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-emerald-500/30 border border-emerald-500/50"></div>
          <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest">Günlük</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-purple-500/30 border border-purple-500/50"></div>
          <span className="text-[9px] font-bold text-purple-300 uppercase tracking-widest">Uygulama</span>
        </div>
        {loading && <Loader2 className="ml-auto animate-spin text-[#FFFF00]" size={14} />}
      </div>
    </div>
  );
};

export default OccupancyCalendar;
