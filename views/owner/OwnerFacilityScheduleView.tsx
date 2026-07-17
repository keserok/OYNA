import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Loader2, Lock, RefreshCcw } from 'lucide-react';
import { getFacilitySchedule, type FacilitySchedule } from '../../services/facilitySchedule';
import { buildFacilityDayGrid } from '../../shared/facilityScheduleModel';
import { FacilityScheduleGrid } from '../../shared/FacilityScheduleGrid';

// ─── OW-E (P4) — TESİS görünümü: satır=saat, sütun=kort, renk-kodlu ──────────
// Çok kortlu tesisi tek bakışta gösterir. Boş hücreye dokunuş → hızlı rezervasyon.
// Veri get_facility_schedule RPC'sinden; ızgara saf facilityScheduleModel'de,
// sunum ise ortak FacilityScheduleGrid'de (admin gözetimiyle paylaşılır).

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

export const OwnerFacilityScheduleView: React.FC<Props> = ({
  pitchId, isRealPitch, selectedDateISO, onQuickBook, onBookingTap, refreshKey,
}) => {
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
    <FacilityScheduleGrid
      grid={grid}
      interactive
      onQuickBook={onQuickBook}
      onBookingTap={onBookingTap}
    />
  );
};

export default OwnerFacilityScheduleView;
