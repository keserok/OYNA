import { collection, addDoc, onSnapshot, query, where, Timestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

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
 * Veriyi ortak veritabanı olan Firestore'a yazar.
 */
export const addAvailableSlot = async (slotData: Omit<PitchSlot, 'id' | 'createdAt'>) => {
  try {
    const docRef = await addDoc(collection(db, 'pitch_slots'), {
      ...slotData,
      createdAt: Timestamp.now()
    });
    console.log("Yeni saat eklendi, ID: ", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Saat eklenirken hata oluştu: ", error);
    throw error;
  }
};

/**
 * Tesis sahibi bir saati sildiğinde veya iptal ettiğinde çalışır.
 */
export const removeSlot = async (slotId: string) => {
  try {
    await deleteDoc(doc(db, 'pitch_slots', slotId));
    console.log("Saat silindi: ", slotId);
  } catch (error) {
    console.error("Saat silinirken hata oluştu: ", error);
    throw error;
  }
};


/**
 * Oyuncu uygulaması bir saati kiraladığında (rezervasyon yaptığında) çalışır.
 * Saatin durumunu 'BOOKED' olarak günceller.
 */
export const bookSlot = async (slotId: string, userId: string) => {
  try {
    const slotRef = doc(db, 'pitch_slots', slotId);
    await updateDoc(slotRef, {
      status: 'BOOKED',
      bookedBy: userId,
      bookedAt: Timestamp.now()
    });
    console.log("Saat kiralandı: ", slotId);
  } catch (error) {
    console.error("Saat kiralanırken hata oluştu: ", error);
    throw error;
  }
};

// ============================================================================
// 2. OYUNCU UYGULAMASININ KULLANACAĞI FONKSİYONLAR (DİNLEME İŞLEMLERİ)
// ============================================================================

/**
 * Oyuncu uygulaması bu fonksiyonu çağırarak bir tesisin müsait saatlerini
 * "CANLI" (Real-time) olarak dinlemeye başlar.
 * Tesis uygulaması "addAvailableSlot" ile yeni bir saat eklediği an, 
 * bu fonksiyon otomatik olarak tetiklenir ve oyuncunun ekranı güncellenir.
 */
export const subscribeToPitchSlots = (pitchId: string, callback: (slots: PitchSlot[]) => void) => {
  // Sadece 'AVAILABLE' olan ve bu tesise ait saatleri getir
  const q = query(
    collection(db, 'pitch_slots'), 
    where('pitchId', '==', pitchId),
    where('status', '==', 'AVAILABLE')
  );

  // onSnapshot: Firestore'daki değişiklikleri anlık olarak yakalar
  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const slots: PitchSlot[] = [];
    querySnapshot.forEach((doc) => {
      slots.push({ id: doc.id, ...doc.data() } as PitchSlot);
    });
    
    // Yeni veriyi callback ile React componentine (arayüze) gönder
    callback(slots);
  }, (error) => {
    console.error("Saatleri dinlerken hata oluştu: ", error);
  });

  // Dinlemeyi durdurmak için bu fonksiyonu döndürüyoruz (useEffect cleanup için)
  return unsubscribe;
};
