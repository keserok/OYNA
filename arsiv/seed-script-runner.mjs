import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import * as fs from 'fs';
import * as path from 'path';

// Read config
const configPath = path.resolve('/Users/kerem/.gemini/antigravity/scratch/oyna_workspace/firebase-applet-config.json');
const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Init Firebase
const app = initializeApp(configData);
const db = getFirestore(app);

// Get data
import { PITCHES, GOALKEEPERS, REFEREES } from './constants.js';
import { INITIAL_USERS } from './store.js';

async function seed() {
    console.log("Starting direct Firestore seed...");

    // Pitches (user wants 5)
    for (const p of PITCHES.slice(0, 5)) {
        await setDoc(doc(db, 'pitches', p.id), p);
    }
    console.log("Pitches seeded: 5");

    // Goalkeepers (user wants 3)
    for (const g of GOALKEEPERS.slice(0, 3)) {
        await setDoc(doc(db, 'goalkeepers', g.id), g);
    }
    console.log("GKs seeded: 3");

    // Referees (user wants 3)
    for (const r of REFEREES.slice(0, 3)) {
        await setDoc(doc(db, 'referees', r.id), r);
    }
    console.log("Referees seeded: 3");

    // Let's make sure the 5 mock players are also seeded so Studio works
    for (const u of INITIAL_USERS) {
        await setDoc(doc(db, 'users', u.id), u);
    }
    console.log("Users seeded: " + INITIAL_USERS.length);

    console.log("Seed complete! Exiting...");
    process.exit(0);
}

seed().catch(console.error);
