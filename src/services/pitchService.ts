export interface PitchSlot {
  id?: string;
  pitchId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  status: 'AVAILABLE' | 'BOOKED';
  price: number;
  createdAt?: any;
}

// ============================================================================
// 1. TESİS UYGULAMASININ KULLANACAĞI FONKSİYONLAR (YAZMA İŞLEMLERİ)
// ============================================================================

/**
 * Tesis sahibi yeni bir müsait saat eklediğinde bu fonksiyon çalışır.
 * Mock implementation.
 */
export const addAvailableSlot = async (slotData: Omit<PitchSlot, 'id' | 'createdAt'>) => {
  console.log("Mock: Yeni saat eklendi", slotData);
  return `mock-slot-${Date.now()}`;
};

/**
 * Tesis sahibi bir saati sildiğinde veya iptal ettiğinde çalışır.
 */
export const removeSlot = async (slotId: string) => {
  console.log("Mock: Saat silindi", slotId);
};


/**
 * Oyuncu uygulaması bir saati kiraladığında (rezervasyon yaptığında) çalışır.
 */
export const bookSlot = async (slotId: string, userId: string) => {
  console.log("Mock: Saat kiralandı", slotId, "by user", userId);
};

// ============================================================================
// 2. OYUNCU UYGULAMASININ KULLANACAĞI FONKSİYONLAR (DİNLEME İŞLEMLERİ)
// ============================================================================

/**
 * Oyuncu uygulaması bu fonksiyonu çağırarak bir tesisin müsait saatlerini
 * "CANLI" (Real-time) olarak dinlemeye başlar.
 */
export const subscribeToPitchSlots = (pitchId: string, callback: (slots: PitchSlot[]) => void) => {
  console.log("Mock: Subscribed to pitch slots for", pitchId);
  
  // Return empty array for now
  callback([]);

  // Return a no-op unsubscribe function
  return () => {
    console.log("Mock: Unsubscribed from pitch slots for", pitchId);
  };
};
