import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, orderBy, limit, DocumentData, runTransaction, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { IUser, IMatch, ITeam, Pitch, Referee, Goalkeeper, UserRole } from '../types';

// ==========================================
// USERS
// ==========================================
export const getUserProfile = async (uid: string): Promise<IUser | null> => {
  try {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as IUser;
    }
    return null;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
};

export const updateUserProfile = async (uid: string, data: Partial<IUser>): Promise<boolean> => {
  try {
    const docRef = doc(db, 'users', uid);
    await updateDoc(docRef, data as DocumentData);
    return true;
  } catch (error) {
    console.error("Error updating user profile:", error);
    return false;
  }
};

export const createUserProfile = async (uid: string, email: string, displayName: string): Promise<IUser | null> => {
    try {
      const userRef = doc(db, 'users', uid);
      const newUser: Omit<IUser, 'id'> = {
        name: displayName,
        email: email,
        roles: [UserRole.PLAYER],
        communities: [],
        fairPlayScore: 100
      };
      await setDoc(userRef, newUser);
      return { id: uid, ...newUser };
    } catch (error) {
      console.error("Error creating user profile:", error);
      return null;
    }
  };

// ==========================================
// MATCHES
// ==========================================
export const getActiveMatches = async (): Promise<IMatch[]> => {
  try {
    const q = query(collection(db, 'matches'), where('status', 'in', ['PENDING', 'WAITING_APPROVAL']));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IMatch));
  } catch (error) {
    console.error("Error fetching matches:", error);
    return [];
  }
};

export const getMatchById = async (matchId: string): Promise<IMatch | null> => {
  try {
    const docRef = doc(db, 'matches', matchId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as IMatch;
    }
    return null;
  } catch (error) {
    console.error("Error fetching match:", error);
    return null;
  }
};

export const createMatch = async (matchData: Omit<IMatch, 'id'>): Promise<string | null> => {
    try {
        const docRef = doc(collection(db, 'matches'));
        await setDoc(docRef, matchData);
        return docRef.id;
    } catch (error) {
        console.error("Error creating match:", error);
        return null;
    }
};

// ==========================================
// TEAMS
// ==========================================
export const getUserTeams = async (userId: string): Promise<ITeam[]> => {
  try {
    // Need a composite index or just simple query if roster contains userId
    const q = query(collection(db, 'teams'), where('captainId', '==', userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ITeam));
  } catch (error) {
    console.error("Error fetching teams:", error);
    return [];
  }
};

// ==========================================
// PITCHES (Halı Sahalar)
// ==========================================
export const getAllPitches = async (): Promise<Pitch[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, 'pitches'));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pitch));
  } catch (error) {
    console.error("Error fetching pitches:", error);
    return [];
  }
};

// ==========================================
// MARKETPLACE (Referees & GKs)
// ==========================================
export const getAvailableReferees = async (): Promise<Referee[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, 'referees'));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Referee));
  } catch (error) {
    console.error("Error fetching referees:", error);
    return [];
  }
};

export const getAvailableGoalkeepers = async (): Promise<Goalkeeper[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, 'goalkeepers'));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Goalkeeper));
  } catch (error) {
    console.error("Error fetching goalkeepers:", error);
    return [];
  }
};
