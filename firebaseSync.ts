import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, query } from 'firebase/firestore';
import { db } from './firebase';
import { useAppStore } from './store';
import { Pitch, MatchListing, Goalkeeper, Referee, Team, AdminUser } from './types';
import { AdminNotification, AppSettings } from './store';

// ============================================================================
// FIREBASE -> ZUSTAND SYNC (LISTENERS)
// ============================================================================

let unsubscribers: (() => void)[] = [];

/**
 * Başlatıldığında Firestore'u dinlemeye başlar ve Zustand'ı günceller.
 * Uygulama açılışında App.tsx içinde çağrılmalıdır.
 */
export const startFirebaseSync = () => {
    stopFirebaseSync();

    const {
        setAdminPitches, setAdminMatches, setAdminUsers,
        setAdminGoalkeepers, setAdminReferees, setAdminNotifications,
        setAdminTeams, updateAppSettings, setGlobalText, setInitialLoadComplete
    } = useAppStore.getState();

    let loadedCount = 0;
    const checkLoaded = () => {
        loadedCount++;
        if (loadedCount >= 9) {
            setInitialLoadComplete(true);
        }
    };

    const handleFirebaseError = (error: any, fallbackData: any, setter: Function) => {
        console.warn("Firebase sync failed, using local fallback data:", error);
        setter(fallbackData);
        checkLoaded();
    };

    // We import constants inside to avoid top-level circular deps if any
    import('./constants').then(({ PITCHES, MATCH_LISTINGS, GOALKEEPERS, REFEREES, USER_TEAMS }) => {
        import('./store').then(({ INITIAL_USERS }) => {

            // 1. Pitches
            unsubscribers.push(onSnapshot(collection(db, 'pitches'), (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pitch));
                setAdminPitches(data.length > 0 ? data : PITCHES);
                checkLoaded();
            }, (error) => handleFirebaseError(error, PITCHES, setAdminPitches)));

            // 2. Matches
            unsubscribers.push(onSnapshot(collection(db, 'matches'), (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MatchListing));
                setAdminMatches(data.length > 0 ? data : MATCH_LISTINGS);
                checkLoaded();
            }, (error) => handleFirebaseError(error, MATCH_LISTINGS, setAdminMatches)));

            // 3. Users
            unsubscribers.push(onSnapshot(collection(db, 'users'), (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminUser));
                setAdminUsers(data.length > 0 ? data : INITIAL_USERS);
                checkLoaded();
            }, (error) => handleFirebaseError(error, INITIAL_USERS, setAdminUsers)));

            // 4. Goalkeepers
            unsubscribers.push(onSnapshot(collection(db, 'goalkeepers'), (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Goalkeeper));
                setAdminGoalkeepers(data.length > 0 && data[0].name ? data : GOALKEEPERS);
                checkLoaded();
            }, (error) => handleFirebaseError(error, GOALKEEPERS, setAdminGoalkeepers)));

            // 5. Referees
            unsubscribers.push(onSnapshot(collection(db, 'referees'), (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Referee));
                setAdminReferees(data.length > 0 && data[0].name ? data : REFEREES);
                checkLoaded();
            }, (error) => handleFirebaseError(error, REFEREES, setAdminReferees)));

            // 6. Teams
            unsubscribers.push(onSnapshot(collection(db, 'teams'), (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
                setAdminTeams(data.length > 0 ? data : USER_TEAMS);
                checkLoaded();
            }, (error) => handleFirebaseError(error, USER_TEAMS, setAdminTeams)));

            // 7. Notifications
            unsubscribers.push(onSnapshot(collection(db, 'notifications'), (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminNotification));
                if (data.length > 0) setAdminNotifications(data);
                checkLoaded();
            }, (error) => handleFirebaseError(error, [], setAdminNotifications)));

            // 8. AppSettings
            unsubscribers.push(onSnapshot(doc(db, 'settings', 'main'), (docSnap) => {
                if (docSnap.exists()) updateAppSettings(docSnap.data() as Partial<AppSettings>);
                checkLoaded();
            }, (error) => handleFirebaseError(error, null, () => { })));

            // 9. Global Texts
            unsubscribers.push(onSnapshot(doc(db, 'texts', 'global'), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    Object.keys(data).forEach(key => setGlobalText(key, data[key]));
                }
                checkLoaded();
            }, (error) => handleFirebaseError(error, null, () => { })));

        });
    });
};

export const stopFirebaseSync = () => {
    unsubscribers.forEach(unsub => {
        try { unsub(); } catch (e) {}
    });
    unsubscribers = [];
};

import { encodeGeohash } from './utils/geo';

export const seedFirestore = async () => {
    try {
        console.log("Seeding Firestore with Geohashes...");
        const { INITIAL_USERS } = await import('./store');
        const { PITCHES, MATCH_LISTINGS, GOALKEEPERS, REFEREES, USER_TEAMS } = await import('./constants');

        // Helper to attach geohash if coordinates are present
        const attachGeohash = (item: any) => {
            if (item.coordinates?.lat && item.coordinates?.lng) {
                return {
                    ...item,
                    geohash: encodeGeohash(item.coordinates.lat, item.coordinates.lng)
                };
            }
            return item;
        };

        // Pitches
        for (const p of PITCHES) {
            const newDoc = doc(db, 'pitches', p.id);
            await setDoc(newDoc, attachGeohash(p));
        }
        // Matches
        for (const m of MATCH_LISTINGS) {
            const newDoc = doc(db, 'matches', m.id);
            await setDoc(newDoc, m);
        }
        // Goalkeepers
        for (const g of GOALKEEPERS) {
            const newDoc = doc(db, 'goalkeepers', g.id);
            await setDoc(newDoc, attachGeohash(g));
        }
        // Referees
        for (const r of REFEREES) {
            const newDoc = doc(db, 'referees', r.id);
            await setDoc(newDoc, attachGeohash(r));
        }
        // Teams
        for (const t of USER_TEAMS) {
            const newDoc = doc(db, 'teams', t.id);
            await setDoc(newDoc, attachGeohash(t));
        }
        // Users
        for (const u of INITIAL_USERS) {
            const newDoc = doc(db, 'users', u.id);
            await setDoc(newDoc, u);
        }

        console.log("Seed with Geohashes complete! Refresh the page.");
        alert("Veritabanı başarıyla coğrafi geohash kodlarıyla tohumlandı! Lütfen sayfayı yenileyin.");
    } catch (error) {
        console.error("Seed error:", error);
        alert("Seed sırasında hata oluştu!");
    }
};

