import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import * as fs from 'fs';
import * as path from 'path';

// Read config
const configPath = path.resolve('./firebase-applet-config.json');
const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Init Firebase
const app = initializeApp(configData);
const db = getFirestore(app);

// Get data
import { PITCHES, GOALKEEPERS, REFEREES } from './constants';
import { INITIAL_USERS } from './store';

async function seed() {
    console.log("🚀 Starting Firestore seeding for OYNA App...");

    // Pitches
    for (const p of PITCHES) {
        await setDoc(doc(db, 'pitches', p.id), p);
    }
    console.log(`✅ Pitches seeded: ${PITCHES.length}`);

    // Goalkeepers
    for (const g of GOALKEEPERS) {
        await setDoc(doc(db, 'goalkeepers', g.id), g);
    }
    console.log(`✅ GKs seeded: ${GOALKEEPERS.length}`);

    // Referees
    for (const r of REFEREES) {
        await setDoc(doc(db, 'referees', r.id), r);
    }
    console.log(`✅ Referees seeded: ${REFEREES.length}`);

    // Users
    for (const u of INITIAL_USERS) {
        await setDoc(doc(db, 'users', u.id), u);
    }
    console.log(`✅ Users seeded: ${INITIAL_USERS.length}`);

    // Settings
    const INITIAL_SETTINGS = {
      appName: 'OYNA',
      maintenanceMode: false,
      registrationOpen: true,
      proPrice: 199,
      commissionRate: 10,
      minRatingToPlay: 2.5,
      maxMatchsPerDay: 3,
      featuredPitchId: '1',
      announcementBanner: '🎉 OYNA v2.0 yayında! Yeni özellikler geldi.',
      showAnnouncementBanner: true,
    };
    await setDoc(doc(db, 'settings', 'main'), INITIAL_SETTINGS);
    console.log("✅ App settings seeded!");

    // Global Texts
    const INITIAL_TEXTS = {
      dashboardTitle: 'ANA SAYFA',
      dashboardSubtitle: "OYNA'YA HOŞ GELDİN",
      communityViewTitle: 'TOPLULUKLAR',
      profileTitle: 'OYUNCU PROFİLİ',
      matchDiscoveryTitle: 'MAÇ BUL',
      marketplaceGkTitle: 'KALECİ KİRALA',
      marketplaceRefTitle: 'HAKEM KİRALA',
      pitchDiscoveryTitle: 'SAHA KİRALA',
      opponentFinderTitle: 'RAKİP BUL',
      studioTitle: 'TAKTİK ZEKA',
    };
    await setDoc(doc(db, 'texts', 'global'), INITIAL_TEXTS);
    console.log("✅ Global texts seeded!");

    console.log("🎉 Firestore database successfully seeded!");
    process.exit(0);
}

seed().catch(err => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
