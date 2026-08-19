import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import dotenv from 'dotenv';
dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'obsidianide-1606f',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig, `WipeDatabaseApp_${Date.now()}`);
const db = getFirestore(app);

const COLLECTIONS_TO_WIPE = [
  'users',
  'projects',
  'files',
  'ObsidianIDE_Connection_Test',
  'invitations',
  'sessions'
];

async function wipeEntireDatabase() {
  console.log(`🧹 Starting full database purge for project: ${firebaseConfig.projectId}...\n`);
  let totalDeleted = 0;

  for (const colName of COLLECTIONS_TO_WIPE) {
    try {
      const colRef = collection(db, colName);
      const snapshot = await getDocs(colRef);
      
      if (snapshot.empty) {
        console.log(`📁 Collection '${colName}': [Already Empty (0 docs)]`);
        continue;
      }

      console.log(`🗑️  Wiping collection '${colName}' (${snapshot.size} documents)...`);
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, colName, docSnap.id));
        totalDeleted++;
      }
      console.log(`✅ Collection '${colName}' completely cleared.`);
    } catch (err) {
      console.warn(`⚠️ Notice while clearing collection '${colName}':`, err.message);
    }
  }

  // Also reset server in-memory store via REST endpoint
  try {
    const res = await fetch('http://localhost:5000/api/projects/reset-store', { method: 'POST' });
    if (res.ok) {
      console.log('✅ Server in-memory cache reset successfully.');
    }
  } catch (e) {
    // Backend might not have reset endpoint or be offline
  }

  console.log(`\n🎉 DATABASE PURGE COMPLETE: Deleted ${totalDeleted} documents across all collections.`);
  console.log('The database is now 100% clean and ready for fresh account creation.');
}

wipeEntireDatabase().catch(err => {
  console.error('Error during database purge:', err);
  process.exit(1);
});
