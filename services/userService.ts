import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { User as FirebaseUser } from 'firebase/auth';

export interface OynaUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: 'PLAYER' | 'GOALKEEPER' | 'REFEREE' | 'ADMIN';
  walletBalance: number;
  stats: {
    matchesPlayed: number;
    rating: number;
  };
  createdAt: any;
  updatedAt: any;
}

/**
 * Kullanıcı sisteme girdiğinde veritabanında (Firestore) kaydı olup olmadığını kontrol eder.
 * Eğer yeni bir kullanıcıysa, OYNA sistemine varsayılan özellikleriyle (Oyuncu rolü ve 0₺ bakiye) kaydeder.
 */
export const syncUserToFirestore = async (firebaseUser: FirebaseUser): Promise<OynaUser | null> => {
  if (!firebaseUser) return null;

  const userRef = doc(db, 'users', firebaseUser.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    // Yeni kullanıcı, profilini oluşturuyoruz.
    const newUser: OynaUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      role: 'PLAYER', // Standart kayıt olan herkes varsayılan olarak oyuncudur
      walletBalance: 0, // Cüzdan başlangıç bakiyesi
      stats: {
        matchesPlayed: 0,
        rating: 5.0, // Başlangıç reytingi
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(userRef, newUser);
    return newUser;
  } else {
    // Zaten kayıtlı bir kullanıcı, son aktif olma tarihini güncelleyip bilgilerini döndür
    await setDoc(userRef, { updatedAt: serverTimestamp() }, { merge: true });
    return userSnap.data() as OynaUser;
  }
};
