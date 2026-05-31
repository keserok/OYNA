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
