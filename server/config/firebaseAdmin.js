import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
dotenv.config();

let adminApp = null;
let adminAuth = null;
let adminDb = null;

const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'obsidianide-1606f';

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = typeof process.env.FIREBASE_SERVICE_ACCOUNT === 'string'
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : process.env.FIREBASE_SERVICE_ACCOUNT;
      
    if (!getApps().length) {
      adminApp = initializeApp({ credential: cert(serviceAccount), projectId });
    } else {
      adminApp = getApps()[0];
    }
    adminAuth = getAuth(adminApp);
    adminDb = getFirestore(adminApp);
  } catch (error) {
    console.warn("Firebase Admin SDK initialization notice:", error.message);
  }
} else {
  // No Service Account provided in environment — Firestore client-side SDK handles persistence safely
  console.log("ℹ️ Running in direct Client Firestore mode (FIREBASE_SERVICE_ACCOUNT omitted).");
}

export { adminAuth, adminDb };
export default adminApp;
