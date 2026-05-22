import { collection, addDoc, onSnapshot, query, where, Timestamp, updateDoc, doc, arrayUnion, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface Match {
  id?: string;
  pitchId: string;
  pitchName: string;
  captainId: string;
  captainName: string;
  date: string;
  time: string;
  status: 'OPEN' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  gkId?: string;
  refId?: string;
  applicants?: Array<{
    uid: string;
    displayName: string;
    role: 'GOALKEEPER' | 'REFEREE';
    photoURL?: string;
    status: 'PENDING' | 'REJECTED';
  }>;
  createdAt?: any;
}

// ============================================================================
// 1. OYUNCU (KAPTAN) UYGULAMASI FONKSİYONLARI
// ============================================================================

/**
 * Oyuncu uygulaması bir maç oluşturduğunda çalışır.
 * Bu maç, Kaleci ve Hakem uygulamasında "Açık Maçlar" olarak görünür.
 */
export const createMatch = async (matchData: Omit<Match, 'id' | 'createdAt' | 'status' | 'applicants'>) => {
  try {
    const docRef = await addDoc(collection(db, 'matches'), {
      ...matchData,
      status: 'OPEN',
      applicants: [],
      createdAt: Timestamp.now()
    });
    return docRef.id;
  } catch (error) {
    console.error("Maç oluşturulurken hata oluştu: ", error);
    throw error;
  }
};

/**
 * Kaptan, kendisine başvuran bir kaleciyi veya hakemi onayladığında çalışır.
 */
export const approveApplicant = async (matchId: string, applicantUid: string, role: 'GOALKEEPER' | 'REFEREE') => {
  try {
    const matchRef = doc(db, 'matches', matchId);
    const updateData: any = {};
    
    if (role === 'GOALKEEPER') updateData.gkId = applicantUid;
    else if (role === 'REFEREE') updateData.refId = applicantUid;
    
    // Maçı onaylanmış duruma getir (Eğer hem kaleci hem hakem gerekiyorsa mantık genişletilebilir)
    updateData.status = 'CONFIRMED';

    await updateDoc(matchRef, updateData);
    console.log(`${role} onaylandı: `, applicantUid);
  } catch (error) {
    console.error("Başvuru onaylanırken hata oluştu: ", error);
    throw error;
  }
};


// ============================================================================
// 2. KALECİ / HAKEM UYGULAMASI FONKSİYONLARI
// ============================================================================

/**
 * Kaleci veya Hakem bir maça başvurmak istediğinde çalışır.
 * Kaptan uygulamasındaki "Başvurular" listesine düşer.
 */
export const applyToMatch = async (matchId: string, user: { uid: string, displayName: string, role: 'GOALKEEPER' | 'REFEREE', photoURL?: string }) => {
  try {
    const matchRef = doc(db, 'matches', matchId);
    await updateDoc(matchRef, {
      applicants: arrayUnion({
        ...user,
        status: 'PENDING'
      })
    });
    console.log("Maça başvuru yapıldı: ", matchId);
  } catch (error) {
    console.error("Maça başvururken hata oluştu: ", error);
    throw error;
  }
};

/**
 * Kaleci ve Hakemlerin "Açık Maçları" canlı olarak görmesini sağlar.
 */
export const subscribeToOpenMatches = (callback: (matches: Match[]) => void) => {
  const q = query(
    collection(db, 'matches'), 
    where('status', '==', 'OPEN')
  );

  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const matches: Match[] = [];
    querySnapshot.forEach((doc) => {
      matches.push({ id: doc.id, ...doc.data() } as Match);
    });
    callback(matches);
  }, (error) => {
    console.error("Maçları dinlerken hata oluştu: ", error);
  });

  return unsubscribe;
};
