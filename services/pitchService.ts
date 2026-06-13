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
    const dbData = {
      pitch_id: slotData.pitchId,
      date: slotData.date,
      time: slotData.time,
      status: 'AVAILABLE',
      price: slotData.price,
      booked_by: slotData.bookedBy ?? null,
      booked_at: slotData.bookedAt ?? null
    };
    const { data, error } = await supabase.from('pitch_slots').insert([dbData]).select().single();

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
      booked_by: userId,
      booked_at: new Date().toISOString()
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
      .eq('pitch_id', pitchId)
      .eq('status', 'AVAILABLE');
    
    if (data) {
      const mapped = data.map((s: any) => ({
        id: s.id,
        pitchId: s.pitch_id,
        date: s.date,
        time: s.time,
        status: s.status as any,
        price: Number(s.price),
        bookedBy: s.booked_by,
        bookedAt: s.booked_at,
        createdAt: s.created_at
      } as PitchSlot));
      callback(mapped);
    }
  };

  fetchSlots();

  const channel = supabase.channel(`public:pitch_slots:${pitchId}`)
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'pitch_slots', 
      filter: `pitch_id=eq.${pitchId}` 
    }, () => {
      fetchSlots();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
