import { collection, doc, setDoc, updateDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';
import { Pitch, MatchListing, Goalkeeper, Referee, AdminUser, Team } from './types';
import { AdminNotification, AppSettings } from './store';
import { encodeGeohash } from './utils/geo';

// ============================================================================
// ZUSTAND -> FIREBASE WRITE (MUTATIONS)
// ============================================================================
// Store üzerinden her state değişiminde bu fonksiyonlar çağrılacak.

// Helper to compute and append geohash if coordinates are present
const withGeohash = <T extends { coordinates?: { lat?: number; lng?: number } }>(item: T): T & { geohash?: string } => {
    if (item.coordinates?.lat && item.coordinates?.lng) {
        return {
            ...item,
            geohash: encodeGeohash(item.coordinates.lat, item.coordinates.lng)
        };
    }
    return item;
};

// -- Pitches --
export const fbAddPitch = async (pitch: Omit<Pitch, 'id'>) => {
    const newDoc = doc(collection(db, 'pitches'));
    const pitchWithGeo = withGeohash({ ...pitch, id: newDoc.id });
    await setDoc(newDoc, pitchWithGeo);
};
export const fbUpdatePitch = async (pitch: Pitch) => {
    if (!pitch.id) return;
    const pitchWithGeo = withGeohash(pitch);
    await updateDoc(doc(db, 'pitches', pitch.id), { ...pitchWithGeo });
};
export const fbDeletePitch = async (id: string) => {
    await deleteDoc(doc(db, 'pitches', id));
};

// -- Matches --
export const fbAddMatch = async (match: Omit<MatchListing, 'id'>) => {
    const newDoc = doc(collection(db, 'matches'));
    await setDoc(newDoc, { ...match, id: newDoc.id });
};
export const fbUpdateMatch = async (match: MatchListing) => {
    if (!match.id) return;
    await updateDoc(doc(db, 'matches', match.id), { ...match });
};
export const fbDeleteMatch = async (id: string) => {
    await deleteDoc(doc(db, 'matches', id));
};

// -- Users --
export const fbAddUser = async (user: Omit<AdminUser, 'id'>) => {
    const newDoc = doc(collection(db, 'users'));
    await setDoc(newDoc, { ...user, id: newDoc.id });
};
export const fbUpdateUser = async (user: AdminUser) => {
    if (!user.id) return;
    await updateDoc(doc(db, 'users', user.id), { ...user });
};
export const fbDeleteUser = async (id: string) => {
    await deleteDoc(doc(db, 'users', id));
};
export const fbBanUser = async (id: string, isBanned: boolean) => {
    await updateDoc(doc(db, 'users', id), { isBanned });
};
export const fbToggleUserPro = async (id: string, isPro: boolean) => {
    await updateDoc(doc(db, 'users', id), { isPro });
};
export const fbVerifyUser = async (id: string) => {
    await updateDoc(doc(db, 'users', id), { isVerified: true });
};

// -- Goalkeepers --
export const fbAddGoalkeeper = async (gk: Omit<Goalkeeper, 'id'>) => {
    const newDoc = doc(collection(db, 'goalkeepers'));
    const gkWithGeo = withGeohash({ ...gk, id: newDoc.id });
    await setDoc(newDoc, gkWithGeo);
};
export const fbUpdateGoalkeeper = async (gk: Goalkeeper) => {
    if (!gk.id) return;
    const gkWithGeo = withGeohash(gk);
    await updateDoc(doc(db, 'goalkeepers', gk.id), { ...gkWithGeo });
};
export const fbDeleteGoalkeeper = async (id: string) => {
    await deleteDoc(doc(db, 'goalkeepers', id));
};

// -- Referees --
export const fbAddReferee = async (ref: Omit<Referee, 'id'>) => {
    const newDoc = doc(collection(db, 'referees'));
    const refWithGeo = withGeohash({ ...ref, id: newDoc.id });
    await setDoc(newDoc, refWithGeo);
};
export const fbUpdateReferee = async (ref: Referee) => {
    if (!ref.id) return;
    const refWithGeo = withGeohash(ref);
    await updateDoc(doc(db, 'referees', ref.id), { ...refWithGeo });
};
export const fbDeleteReferee = async (id: string) => {
    await deleteDoc(doc(db, 'referees', id));
};

// -- Notifications --
export const fbAddNotification = async (notif: Omit<AdminNotification, 'id'>) => {
    const newDoc = doc(collection(db, 'notifications'));
    await setDoc(newDoc, { ...notif, id: newDoc.id });
};
export const fbDeleteNotification = async (id: string) => {
    await deleteDoc(doc(db, 'notifications', id));
};
export const fbToggleNotificationAlert = async (id: string, isActive: boolean) => {
    await updateDoc(doc(db, 'notifications', id), { isActive });
};

// -- App Settings --
export const fbUpdateAppSettings = async (settings: Partial<AppSettings>) => {
    await setDoc(doc(db, 'settings', 'main'), settings, { merge: true });
};

// -- Global Texts --
export const fbSetGlobalText = async (key: string, value: string) => {
    await setDoc(doc(db, 'texts', 'global'), { [key]: value }, { merge: true });
};

// -- Teams --
export const fbAddTeam = async (team: Omit<Team, 'id'>) => {
    const newDoc = doc(collection(db, 'teams'));
    const teamWithGeo = withGeohash({ ...team, id: newDoc.id });
    await setDoc(newDoc, teamWithGeo);
};
export const fbUpdateTeam = async (team: Team) => {
    if (!team.id) return;
    const teamWithGeo = withGeohash(team);
    await updateDoc(doc(db, 'teams', team.id), { ...teamWithGeo });
};
export const fbDeleteTeam = async (id: string) => {
    await deleteDoc(doc(db, 'teams', id));
};

// ============================================================================
// OPANEL REPUTATION OVERRIDES (MANTIK 2)
// ============================================================================
export const fbForceOverrideReputation = async (
    userId: string, 
    flatModifier: number,
    wins: number,
    totalMatches: number,
    adminId: string,
    adminName: string
) => {
    // 1. Yeni Elmas değerini Eksponansiyel Formül ile hesapla
    const winRate = totalMatches > 0 ? wins / totalMatches : 0;
    const newElmas = Math.max(0, Math.round(Math.pow(wins, 2) * winRate * 1000) + flatModifier);

    // 2. Kullanıcı belgesini (Client'ları tetikleyecek şekilde) güncelle
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
        'playerCard.flatModifier': flatModifier,
        'playerCard.winCount': wins,
        'playerCard.totalMatches': totalMatches,
        'playerCard.diamondValue': newElmas
    });

    // 3. Audit Log (Denetim İzi) kaydını oluştur
    const auditRef = doc(collection(db, 'audit_logs'));
    await setDoc(auditRef, {
        id: auditRef.id,
        adminId,
        adminName,
        action: 'STATS_UPDATED',
        targetId: userId,
        details: `Manuel müdahale: ${wins}W/${totalMatches}M, Katsayı: ${flatModifier}, Yeni Elmas: ${newElmas}`,
        timestamp: new Date().toISOString()
    });
};

// ============================================================================
// OYNA SOCIAL GRAPH (ARKADAŞLIK AĞI & TRANSFER)
// ============================================================================

export const fbSendFriendRequest = async (
    senderId: string,
    senderName: string,
    senderAvatar: string,
    receiverId: string
) => {
    // 1. İsteği friend_requests tablosuna ekle
    const requestRef = doc(collection(db, 'friend_requests'));
    await setDoc(requestRef, {
        id: requestRef.id,
        senderId,
        senderName,
        senderAvatar,
        receiverId,
        status: 'PENDING',
        timestamp: new Date().toISOString()
    });

    // 2. Alıcıya bildirim at (Push Notification Tablosu)
    const notifRef = doc(collection(db, 'notifications'));
    await setDoc(notifRef, {
        id: notifRef.id,
        title: 'Yeni Arkadaşlık İsteği!',
        message: `${senderName} sana arkadaşlık isteği gönderdi.`,
        type: 'SOCIAL',
        date: new Date().toISOString(),
        isActive: true,
        targetUserId: receiverId // Sadece o kişiye gidecek özel bildirim
    });
};

export const fbAcceptFriendRequest = async (requestId: string, senderId: string, receiverId: string) => {
    // 1. İsteğin durumunu ACCEPTED olarak güncelle
    await updateDoc(doc(db, 'friend_requests', requestId), { status: 'ACCEPTED' });

    // 2. Her iki kullanıcının "friends" dizisine birbirlerinin ID'sini ekle (Mutual Bağlantı)
    await updateDoc(doc(db, 'users', senderId), {
        friends: arrayUnion(receiverId)
    });
    await updateDoc(doc(db, 'users', receiverId), {
        friends: arrayUnion(senderId)
    });
};

export const fbRejectFriendRequest = async (requestId: string) => {
    // İsteği tamamen çöpe atmak yerine REJECTED durumuna çekiyoruz (Gelecekte spam engellemek için)
    await updateDoc(doc(db, 'friend_requests', requestId), { status: 'REJECTED' });
};

export const fbToggleTransferVisibility = async (userId: string, isLooking: boolean) => {
    // Soru 3'ün cevabı: Transfer pazarında sadece arayanlar görünecek.
    await updateDoc(doc(db, 'users', userId), {
        isLookingForTeam: isLooking
    });
};

// ============================================================================
// OYNA REFEREE & CAPTAIN MUTATIONS (HAKEM OTORİTESİ & ÇOKLU KAPTANLIK)
// ============================================================================

export const fbAssignCaptain = async (teamId: string, assignerId: string, newCaptainId: string) => {
    // 1. Yeni kaptanı takımın 'captains' dizisine ekle
    await updateDoc(doc(db, 'teams', teamId), {
        captains: arrayUnion(newCaptainId)
    });

    // 2. Yeni kaptana bildirim at
    const notifRef = doc(collection(db, 'notifications'));
    await setDoc(notifRef, {
        id: notifRef.id,
        title: 'Kaptanlık Yetkisi Verildi!',
        message: `Takımında sana Kaptanlık yetkisi verildi. Artık kadroyu yönetebilir ve maça çıkabilirsiniz.`,
        type: 'SYSTEM',
        date: new Date().toISOString(),
        isActive: true,
        targetUserId: newCaptainId
    });
};

export const fbSubmitRefereeScore = async (
    matchId: string, 
    refereeId: string, 
    homeTeamId: string, 
    awayTeamId: string, 
    homeScore: number, 
    awayScore: number
) => {
    // 1. Maça hakem skorunu işle ve maçı COMPLETED (Bitti) yap
    const matchRef = doc(db, 'matches', matchId);
    await updateDoc(matchRef, {
        homeScore,
        awayScore,
        refereeId,
        status: 'COMPLETED',
        scoreEnteredAt: new Date().toISOString()
    });

    // 2. Takımların istatistiklerini güncelle (Firebase Increment veya Cloud Function ile Karat tetiklenir)
    // Not: Karat ve Elmas güncellemeleri eksponansiyel formüle (reputationEngine) göre tetiklenecektir.
    
    // 3. Hakemin maç yönetme sayısını artır (Referans)
    // await updateDoc(doc(db, 'referees', refereeId), { matchCount: increment(1) });
};

