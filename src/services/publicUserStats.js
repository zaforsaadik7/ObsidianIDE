import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const publicUserStatsRef = doc(db, 'public_stats', 'user_metrics');

export const getPublicUserCount = async () => {
  try {
    const snapshot = await getDoc(publicUserStatsRef);
    if (snapshot.exists()) {
      const count = Number(snapshot.data()?.totalUsers);
      if (Number.isFinite(count)) return Math.max(0, Math.floor(count));
    }
  } catch (error) {}

  try {
    const response = await fetch('/api/users/count', { cache: 'no-store' });
    const data = await response.json();
    if (response.ok && Number.isFinite(data?.count) && (data.source === 'firestore' || data.count > 0)) {
      return Math.max(0, Math.floor(data.count));
    }
  } catch (error) {}

  return null;
};

// Authenticated users can refresh this aggregate via the backend count
// endpoint without exposing any user profile data to the public landing page.
export const syncPublicUserCount = async () => {
  try {
    const response = await fetch('/api/users/count', { cache: 'no-store' });
    const data = await response.json();
    if (response.ok && Number.isFinite(data?.count) && data.count > 0) {
      const count = Math.max(0, Math.floor(data.count));
      await setDoc(publicUserStatsRef, { totalUsers: count }, { merge: true });
      return count;
    }
  } catch (error) {}
  return null;
};
