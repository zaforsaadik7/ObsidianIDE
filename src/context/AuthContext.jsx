import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          setCurrentUser(user);
          try {
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              setUserProfile(userDoc.data());
            } else {
              const defaultProfile = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                designation: 'Full-Stack Lead Architect',
                storageStrategy: 'FIREBASE_PERSONAL',
                createdAt: new Date().toISOString()
              };
              await setDoc(userDocRef, defaultProfile);
              setUserProfile(defaultProfile);
            }
          } catch (err) {
            console.warn("Firestore user profile fetch warning:", err);
            setUserProfile({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || user.email.split('@')[0],
              designation: 'Lead Architect',
              storageStrategy: 'FIREBASE_PERSONAL'
            });
          }
        } else {
          setCurrentUser(null);
          setUserProfile(null);
        }
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (e) {
      console.warn("Auth state observer notice:", e);
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    try {
      return await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      // Graceful fallback for local dev if Email/Password provider isn't enabled in Firebase Console yet
      if (err.code === 'auth/configuration-not-found' || err.code === 'auth/invalid-api-key') {
        console.warn("Firebase Auth console fallback activated for local dev session.");
        const mockUser = {
          uid: 'dev-user-01',
          email,
          displayName: email.split('@')[0]
        };
        setCurrentUser(mockUser);
        setUserProfile({
          uid: mockUser.uid,
          email,
          displayName: 'Md. Emam Zafor Saadik',
          designation: 'Full-Stack Lead Architect',
          storageStrategy: 'FIREBASE_PERSONAL'
        });
        return { user: mockUser };
      }
      throw err;
    }
  };

  const register = async (email, password, displayName) => {
    try {
      const res = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName && res.user) {
        try {
          await updateProfile(res.user, { displayName });
        } catch (e) {}
      }
      return res;
    } catch (err) {
      // Graceful fallback for local dev if Email/Password provider isn't enabled in Firebase Console yet
      if (err.code === 'auth/configuration-not-found' || err.code === 'auth/invalid-api-key') {
        console.warn("Firebase Auth console fallback activated for local registration.");
        const mockUser = {
          uid: 'dev-user-01',
          email,
          displayName: displayName || email.split('@')[0]
        };
        setCurrentUser(mockUser);
        setUserProfile({
          uid: mockUser.uid,
          email,
          displayName: displayName || 'Md. Emam Zafor Saadik',
          designation: 'Full-Stack Lead Architect',
          storageStrategy: 'FIREBASE_PERSONAL'
        });
        return { user: mockUser };
      }
      throw err;
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setUserProfile(null);
    try {
      return signOut(auth);
    } catch (e) {
      return Promise.resolve();
    }
  };

  const value = {
    currentUser,
    userProfile,
    loading,
    login,
    register,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
