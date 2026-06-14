import { supabase } from '../supabaseClient';

export interface PitchSlot {
  id?: string;
  pitchId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  status: 'AVAILABLE' | 'BOOKED';
  price: number;
  bookedBy?: string;
  bookedAt?: string;
  createdAt?: string;
}

// ============================================================================
// 1. TESİS UYGULAMASININ KULLANACAĞI FONKSİYONLAR (YAZMA İŞLEMLERİ)
// ============================================================================

export const addAvailableSlot = async (slotData: Omit<PitchSlot, 'id' | 'createdAt'>) => {
  try {
    const { data, error } = await supabase.from('pitch_slots').insert([{
      ...slotData,
      status: 'AVAILABLE'
    }]).select().single();

    if (error) throw error;
    
    console.log("Yeni saat eklendi, ID: ", data.id);
    return data.id;
  } catch (error) {
    console.error("Saat eklenirken hata oluştu: ", error);
    throw error;
  }
};

export const removeSlot = async (slotId: string) => {
  try {
    const { error } = await supabase.from('pitch_slots').delete().eq('id', slotId);
    if (error) throw error;
    console.log("Saat silindi: ", slotId);
  } catch (error) {
    console.error("Saat silinirken hata oluştu: ", error);
    throw error;
  }
};

export const bookSlot = async (slotId: string, userId: string) => {
  try {
    const { error } = await supabase.from('pitch_slots').update({
      status: 'BOOKED',
      bookedBy: userId,
      bookedAt: new Date().toISOString()
    }).eq('id', slotId);

    if (error) throw error;
    console.log("Saat kiralandı: ", slotId);
  } catch (error) {
    console.error("Saat kiralanırken hata oluştu: ", error);
    throw error;
  }
};

// ============================================================================
// 2. OYUNCU UYGULAMASININ KULLANACAĞI FONKSİYONLAR (DİNLEME İŞLEMLERİ)
// ============================================================================

export const subscribeToPitchSlots = (pitchId: string, callback: (slots: PitchSlot[]) => void) => {
  const fetchSlots = async () => {
    const { data } = await supabase
      .from('pitch_slots')
      .select('*')
      .eq('pitchId', pitchId)
      .eq('status', 'AVAILABLE');

    if (data) callback(data as PitchSlot[]);
  };

  fetchSlots();

  const channel = supabase.channel(`public:pitch_slots:${pitchId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'pitch_slots',
      filter: `pitchId=eq.${pitchId}`
    }, () => {
      fetchSlots();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

// ============================================================================
// 3. DOLULUK MATRİSİ - Owner ve Player aynı kaynaktan beslenir
// ============================================================================

export interface OccupancyCell {
  date: string;       // YYYY-MM-DD
  time: string;       // HH:00
  status: 'AVAILABLE' | 'BOOKED' | 'PAST';
  bookingId?: string;
  bookingTitle?: string;
  bookingType?: 'APP' | 'PHONE' | 'SUB' | 'DAILY'; // pitch_bookings.title'dan türetilir
}

export interface OccupancyMatrix {
  pitchId: string;
  weekStart: string;            // YYYY-MM-DD (Pazartesi)
  hours: string[];              // ['08:00', '09:00', ...]
  days: string[];               // 7 günün YYYY-MM-DD listesi
  cells: OccupancyCell[][];     // [dayIndex][hourIndex]
  currentOccupancyPct: number;  // 0-100
  busiestHour?: string;
  emptiestHour?: string;
}

const HOURS = Array.from({ length: 16 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`); // 08:00 - 23:00

const formatDate = (d: Date): string => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const inferBookingType = (title?: string): 'APP' | 'PHONE' | 'SUB' | 'DAILY' => {
  if (!title) return 'APP';
  const t = title.toLowerCase();
  if (t.includes('abone') || t.includes('sub')) return 'SUB';
  if (t.includes('telefon') || t.includes('phone')) return 'PHONE';
  if (t.includes('günlük') || t.includes('daily')) return 'DAILY';
  return 'APP';
};

export const getOccupancyMatrix = async (pitchId: string, weekStart?: Date): Promise<OccupancyMatrix> => {
  const start = weekStart ? new Date(weekStart) : new Date();
  start.setHours(0, 0, 0, 0);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(formatDate(d));
  }

  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  const { data: bookings, error } = await supabase
    .from('pitch_bookings')
    .select('id, booking_date, start_time, end_time, title, status')
    .eq('pitch_id', pitchId)
    .gte('booking_date', days[0])
    .lt('booking_date', formatDate(end))
    .in('status', ['CONFIRMED', 'PENDING']);

  if (error) {
    console.error('Error fetching occupancy:', error);
  }

  const now = new Date();
  const cells: OccupancyCell[][] = days.map((dayStr) => {
    return HOURS.map((hourStr) => {
      const slotDate = new Date(`${dayStr}T${hourStr}`);
      const isPast = slotDate < now;
      const booking = (bookings || []).find((b: any) => {
        if (b.booking_date !== dayStr) return false;
        const startH = parseInt(b.start_time.split(':')[0]);
        const endH = parseInt(b.end_time.split(':')[0]);
        const slotH = parseInt(hourStr.split(':')[0]);
        return slotH >= startH && slotH < endH;
      });
      if (booking) {
        return {
          date: dayStr,
          time: hourStr,
          status: 'BOOKED',
          bookingId: booking.id,
          bookingTitle: booking.title,
          bookingType: inferBookingType(booking.title)
        };
      }
      return {
        date: dayStr,
        time: hourStr,
        status: isPast ? 'PAST' : 'AVAILABLE'
      };
    });
  });

  // Bugünün doluluk yüzdesi
  const todayIdx = days.findIndex((d) => d === formatDate(new Date()));
  let currentOccupancyPct = 0;
  if (todayIdx >= 0) {
    const futureHours = cells[todayIdx].filter((c) => c.status !== 'PAST');
    const bookedFuture = futureHours.filter((c) => c.status === 'BOOKED').length;
    currentOccupancyPct = futureHours.length > 0 ? Math.round((bookedFuture / futureHours.length) * 100) : 0;
  }

  // En yoğun / en boş saat (hafta ortalaması)
  const hourCounts = HOURS.map((hour, hourIdx) => {
    let booked = 0;
    cells.forEach((dayCells) => {
      if (dayCells[hourIdx].status === 'BOOKED') booked++;
    });
    return { hour, booked };
  });
  const sorted = [...hourCounts].sort((a, b) => b.booked - a.booked);
  const busiestHour = sorted[0]?.booked > 0 ? sorted[0].hour : undefined;
  const emptiestHour = [...hourCounts].sort((a, b) => a.booked - b.booked)[0]?.hour;

  return {
    pitchId,
    weekStart: days[0],
    hours: HOURS,
    days,
    cells,
    currentOccupancyPct,
    busiestHour,
    emptiestHour
  };
};
