import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { auth, db, googleProvider, getFirebaseIdToken } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { syncPublicUserCount } from '../services/publicUserStats';

const AuthContext = createContext();

// Centralized helper to guarantee EXACTLY 1 document ID per email address in the 'users' collection
export const getUserDocId = (email, fallbackName) => {
  if (email && email.includes('@')) {
    return email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }
  if (fallbackName && fallbackName.trim()) {
    return fallbackName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }
  return 'user_default';
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('obsidian_active_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [userProfile, setUserProfileState] = useState(() => {
    try {
      const saved = localStorage.getItem('obsidian_active_profile');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [loading, setLoading] = useState(true);

  // Helper to dynamically track accounts used on this browser without hardcoding
  const recordKnownAccount = (email, displayName, avatarUrl = '') => {
    if (!email || !email.includes('@')) return;
    try {
      const cleanEmail = email.trim().toLowerCase();
      const name = displayName || cleanEmail.split('@')[0];
      const avatar = (name.charAt(0) || 'G').toUpperCase();
      
      const stored = localStorage.getItem('obsidian_known_google_accounts');
      const list = stored ? JSON.parse(stored) : [];
      
      const filtered = list.filter(acc => (acc.email || '').toLowerCase() !== cleanEmail);
      const updated = [
        {
          id: `acc_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`,
          name,
          email: cleanEmail,
          status: 'Active',
          avatarUrl: avatarUrl || '',
          avatar,
          lastUsed: new Date().toISOString()
        },
        ...filtered
      ].slice(0, 8);

      localStorage.setItem('obsidian_known_google_accounts', JSON.stringify(updated));
    } catch (e) {}
  };

  const saveSession = (userObj, profileObj) => {
    if (userObj) {
      setCurrentUser(userObj);
      try { localStorage.setItem('obsidian_active_user', JSON.stringify(userObj)); } catch (e) {}
      recordKnownAccount(userObj.email, userObj.displayName, userObj.photoURL || profileObj?.info?.avatarUrl);
    }
    if (profileObj) {
      setUserProfileState(profileObj);
      try { localStorage.setItem('obsidian_active_profile', JSON.stringify(profileObj)); } catch (e) {}
    }
  };

  const clearSession = () => {
    setCurrentUser(null);
    setUserProfileState(null);
    try {
      localStorage.removeItem('obsidian_active_user');
      localStorage.removeItem('obsidian_active_profile');
    } catch (e) {}
  };

  const setUserProfile = (newVal) => {
    setUserProfileState((prev) => {
      const updated = typeof newVal === 'function' ? newVal(prev) : newVal;
      try {
        if (updated) localStorage.setItem('obsidian_active_profile', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  useEffect(() => {
    const syncProfileOnStartup = async () => {
      const activeUser = currentUser;
      if (activeUser && activeUser.email) {
        const docId = getUserDocId(activeUser.email, activeUser.displayName);
        try {
          // 1. Read from Client Firestore
          const docSnap = await getDoc(doc(db, 'users', docId));
          if (docSnap.exists()) {
            saveSession(activeUser, docSnap.data());
          } else {
            // 2. Fallback to API profile fetch
            const token = await getFirebaseIdToken();
            const res = await fetch(`/api/users/profile?email=${encodeURIComponent(activeUser.email)}`, {
              headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
            });
            const data = await res.json();
            if (res.ok && data.profile) {
              const merged = {
                ...(userProfile || {}),
                ...data.profile,
                info: {
                  ...(userProfile?.info || {}),
                  ...(data.profile?.info || {}),
                  avatarUrl: data.profile?.info?.avatarUrl || userProfile?.info?.avatarUrl || activeUser.photoURL || ''
                }
              };
              saveSession(activeUser, merged);
            }
          }
        } catch (err) {
          console.warn("Startup profile sync notice:", err);
        }
      }
      setLoading(false);
    };

    syncProfileOnStartup();

    try {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          const docId = getUserDocId(user.email, user.displayName);
          let fetchedProf = null;
          try {
            const docSnap = await getDoc(doc(db, 'users', docId));
            if (docSnap.exists()) {
              fetchedProf = docSnap.data();
            } else {
              const token = user.getIdToken ? await user.getIdToken() : '';
              const res = await fetch(`/api/users/profile?email=${encodeURIComponent(user.email)}`, {
                headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
              });
              const data = await res.json();
              if (res.ok && data.profile) fetchedProf = data.profile;
            }
          } catch (e) {}

          const userObj = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || docId,
            photoURL: user.photoURL || fetchedProf?.info?.avatarUrl || ''
          };
          const mergedProf = fetchedProf ? {
            ...(userProfile || {}),
            ...fetchedProf,
            info: {
              ...(userProfile?.info || {}),
              ...(fetchedProf?.info || {}),
              avatarUrl: fetchedProf?.info?.avatarUrl || userProfile?.info?.avatarUrl || user.photoURL || ''
            }
          } : userProfile;

          saveSession(userObj, mergedProf);
          syncPublicUserCount().catch((countErr) => {
            console.warn('Public user count sync notice:', countErr);
          });
        } else {
          clearSession();
        }
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (e) {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const cleanEmail = email.trim().toLowerCase();
    const docId = getUserDocId(cleanEmail);

    let firebaseUser = null;
    let authError = null;
    try {
      const res = await signInWithEmailAndPassword(auth, cleanEmail, password);
      firebaseUser = res.user;
    } catch (err) {
      authError = err;
    }

    // Retrieve user document from Firestore & Backend API
    let foundProfile = null;
    try {
      const docSnap = await getDoc(doc(db, 'users', docId));
      if (docSnap.exists()) {
        foundProfile = docSnap.data();
      }
    } catch (e) {}

    if (!foundProfile) {
      try {
        const profToken = firebaseUser ? await firebaseUser.getIdToken() : '';
        const res = await fetch(`/api/users/profile?email=${encodeURIComponent(cleanEmail)}`, {
          headers: { ...(profToken ? { 'Authorization': `Bearer ${profToken}` } : {}) }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.profile && !data.notFound) {
            foundProfile = data.profile;
          }
        }
      } catch (e) {}
    }

    // STRICT SIGN IN RULE: If user was NEVER registered, block login!
    if (!foundProfile) {
      if (firebaseUser) {
        try { await signOut(auth); } catch (e) {}
      }
      clearSession();
      const err = new Error('No registered account found with this email. Please sign up first to create your account.');
      err.code = 'auth/user-not-registered';
      throw err;
    }

    // If there was a Firebase password error and profile existed
    if (authError && !firebaseUser) {
      throw authError;
    }

    if (foundProfile.info) {
      foundProfile.info.lastLogin = new Date().toISOString();
    }

    const userObj = {
      uid: firebaseUser?.uid || foundProfile?.info?.uid || `dev-user-${docId}`,
      email: cleanEmail,
      displayName: foundProfile?.info?.fullName || docId,
      photoURL: foundProfile?.info?.avatarUrl || firebaseUser?.photoURL || ''
    };

    saveSession(userObj, foundProfile);
    return { user: userObj, profile: foundProfile };
  };

  const register = async (email, password, profileInput) => {
    const cleanEmail = email.trim().toLowerCase();
    const profileData = typeof profileInput === 'string' ? { displayName: profileInput } : (profileInput || {});
    const fullName = profileData.displayName || cleanEmail.split('@')[0];
    const docId = getUserDocId(cleanEmail, fullName);
    const profession = profileData.profession || 'Student';
    const avatarUrl = profileData.avatarUrl || '';
    const username = profileData.username || docId;

    // Check if account already exists
    let existingProfile = null;
    try {
      const docSnap = await getDoc(doc(db, 'users', docId));
      if (docSnap.exists()) {
        existingProfile = docSnap.data();
      }
    } catch (e) {}

    if (!existingProfile) {
      try {
        const res = await fetch(`/api/users/profile?email=${encodeURIComponent(cleanEmail)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.profile && !data.notFound) {
            existingProfile = data.profile;
          }
        }
      } catch (e) {}
    }

    if (existingProfile) {
      const err = new Error('An account with this email already exists. Please switch to Sign In instead.');
      err.code = 'auth/email-already-in-use';
      throw err;
    }

    let res = null;
    try {
      res = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      if (res.user) {
        try {
          await updateProfile(res.user, { displayName: fullName, photoURL: avatarUrl || undefined });
        } catch (e) {}
      }
    } catch (e) {
      // Surface every Firebase failure (email in use, weak password, network…)
      // instead of continuing with a token-less local-only session.
      throw e;
    }

    const newProfile = {
      info: {
        fullName,
        username,
        email: cleanEmail,
        profession,
        avatarUrl,
        uid: res?.user?.uid || `dev-user-${docId}`,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        consents: {
          termsAccepted: true,
          termsAcceptedTimestamp: new Date().toISOString(),
          googleOAuthConsent: true,
          permissionsGranted: ['INSPECT_FIREBASE_PROJECT', 'CREATE_DATABASE_OBSIDIANIDE', 'READ_WRITE_MODIFY_PROJECT_FILES']
        }
      },
      projects: {}
    };

    const userObj = {
      uid: newProfile.info.uid,
      email: cleanEmail,
      displayName: fullName,
      photoURL: avatarUrl || ''
    };

    // Client Firestore Direct Write Guarantee
    try {
      const userDocRef = doc(db, 'users', docId);
      await setDoc(userDocRef, newProfile, { merge: true });
    } catch (fsErr) {
      console.warn("Client Firestore user doc save notice:", fsErr);
    }

    if (res?.user) {
      syncPublicUserCount().catch((countErr) => {
        console.warn('Public user count sync notice:', countErr);
      });
    }

    try {
      const token = res?.user?.getIdToken ? await res.user.getIdToken() : '';
      await fetch('/api/users/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          email: cleanEmail,
          displayName: fullName,
          username,
          profession,
          avatarUrl
        })
      });
    } catch (dbErr) {
      console.warn("Backend user register notice:", dbErr);
    }

    saveSession(userObj, newProfile);
    return { user: userObj, profile: newProfile };
  };

  const logout = () => {
    clearSession();
    try {
      return signOut(auth);
    } catch (e) {
      return Promise.resolve();
    }
  };

  const signInWithGoogle = async (isSignUp = false) => {
    const provider = googleProvider || new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    let firebaseUser = null;
    try {
      const result = await signInWithPopup(auth, provider);
      firebaseUser = result.user;
    } catch (popupErr) {
      console.error("Firebase Google Auth popup error:", popupErr);
      throw popupErr;
    }

    if (!firebaseUser || !firebaseUser.email) {
      throw new Error('Google Sign-In failed to retrieve a valid user account.');
    }

    const cleanEmail = firebaseUser.email.trim().toLowerCase();
    const fullName = firebaseUser.displayName || cleanEmail.split('@')[0] || 'Developer';
    const docId = getUserDocId(cleanEmail, fullName);
    const photoURL = firebaseUser.photoURL || '';

    // Check if user profile already exists
    let foundProfile = null;
    try {
      const docSnap = await getDoc(doc(db, 'users', docId));
      if (docSnap.exists()) {
        foundProfile = docSnap.data();
      }
    } catch (e) {}

    if (!foundProfile) {
      try {
        const profToken = firebaseUser ? await firebaseUser.getIdToken() : '';
        const res = await fetch(`/api/users/profile?email=${encodeURIComponent(cleanEmail)}`, {
          headers: { ...(profToken ? { 'Authorization': `Bearer ${profToken}` } : {}) }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.profile && !data.notFound) {
            foundProfile = data.profile;
          }
        }
      } catch (e) {}
    }

    // SCENARIO 1: SIGN IN MODE (User clicked "Sign In with Google" on Sign In tab)
    if (!isSignUp) {
      if (!foundProfile) {
        // User has NEVER registered! Do NOT auto-create account!
        try { await signOut(auth); } catch (e) {}
        clearSession();
        const notFoundErr = new Error('No registered account found with this Google email. Please switch to Sign Up first to create your account.');
        notFoundErr.code = 'auth/user-not-registered';
        throw notFoundErr;
      }

      if (foundProfile.info) {
        foundProfile.info.lastLogin = new Date().toISOString();
        if (photoURL && !foundProfile.info.avatarUrl) {
          foundProfile.info.avatarUrl = photoURL;
        }
      }

      const userObj = {
        uid: firebaseUser.uid,
        email: cleanEmail,
        displayName: foundProfile?.info?.fullName || fullName,
        photoURL: photoURL || foundProfile?.info?.avatarUrl || ''
      };

      saveSession(userObj, foundProfile);
      return { user: userObj, profile: foundProfile, isNewUser: false };
    }

    // SCENARIO 2: SIGN UP MODE (User clicked "Sign Up with Google" on Sign Up tab)
    if (isSignUp) {
      if (foundProfile) {
        // Account already exists — no onboarding to resume anymore.
        try { await signOut(auth); } catch (e) {}
        clearSession();
        const existsErr = new Error('An account with this Google email already exists. Please switch to Sign In instead.');
        existsErr.code = 'auth/email-already-in-use';
        throw existsErr;
      }

      // TRULY NEW USER: Initialize new registration record
      const newProfile = {
        info: {
          fullName,
          username: `@${cleanEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_')}`,
          email: cleanEmail,
          profession: 'Student',
          avatarUrl: photoURL,
          uid: firebaseUser.uid,
          authProvider: 'google.com',
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
          consents: {
            termsAccepted: true,
            termsAcceptedTimestamp: new Date().toISOString(),
            googleOAuthConsent: true,
            permissionsGranted: ['INSPECT_FIREBASE_PROJECT', 'CREATE_DATABASE_OBSIDIANIDE', 'READ_WRITE_MODIFY_PROJECT_FILES']
          }
        },
        projects: {}
      };

      try {
        await setDoc(doc(db, 'users', docId), newProfile, { merge: true });
      } catch (e) {}

      syncPublicUserCount().catch((countErr) => {
        console.warn('Public user count sync notice:', countErr);
      });

      try {
        const token = firebaseUser.getIdToken ? await firebaseUser.getIdToken() : '';
        await fetch('/api/users/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            email: cleanEmail,
            displayName: fullName,
            username: `@${cleanEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_')}`,
            profession: 'Student',
            avatarUrl: photoURL
          })
        });
      } catch (e) {}

      const userObj = {
        uid: firebaseUser.uid,
        email: cleanEmail,
        displayName: fullName,
        photoURL
      };

      saveSession(userObj, newProfile);
      return { user: userObj, profile: newProfile, isNewUser: true };
    }
  };

  const loginWithGoogleAccount = async (account) => {
    const cleanEmail = (account.email || '').trim().toLowerCase();
    const fullName = account.name || cleanEmail.split('@')[0] || 'Developer';
    const docId = getUserDocId(cleanEmail, fullName);

    // Real Firebase sign-in so the session can mint ID tokens; abort if the
    // user picks a different Google account in the popup.
    const provider = googleProvider || new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const popupResult = await signInWithPopup(auth, provider);
    const firebaseUser = popupResult.user;
    if (!firebaseUser?.email || firebaseUser.email.trim().toLowerCase() !== cleanEmail) {
      try { await signOut(auth); } catch (e) {}
      const err = new Error('The Google account chosen in the popup does not match. Please select the registered account.');
      err.code = 'auth/account-mismatch';
      throw err;
    }

    let foundProf = null;

    try {
      const docSnap = await getDoc(doc(db, 'users', docId));
      if (docSnap.exists()) {
        foundProf = docSnap.data();
      }
    } catch (e) {}

    if (!foundProf) {
      try {
        const token = await getFirebaseIdToken();
        const res = await fetch(`/api/users/profile?email=${encodeURIComponent(cleanEmail)}`, {
          headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.profile && !data.notFound) {
            foundProf = data.profile;
          }
        }
      } catch (e) {}
    }

    if (!foundProf) {
      clearSession();
      const err = new Error('No registered account found with this Google email. Please switch to Sign Up first to create your account.');
      err.code = 'auth/user-not-registered';
      throw err;
    }

    if (foundProf.info) {
      foundProf.info.lastLogin = new Date().toISOString();
    }

    const userObj = {
      uid: firebaseUser.uid,
      email: cleanEmail,
      displayName: foundProf?.info?.fullName || fullName,
      photoURL: foundProf?.info?.avatarUrl || account.avatarUrl || ''
    };

    saveSession(userObj, foundProf);
    return { user: userObj, profile: foundProf };
  };

  const registerWithGoogleAccount = async (account, profileInput) => {
    const cleanEmail = (account.email || '').trim().toLowerCase();
    const fullName = profileInput?.displayName || account.name || cleanEmail.split('@')[0];
    const docId = getUserDocId(cleanEmail, fullName);
    const profession = profileInput?.profession || 'Student';
    const username = profileInput?.username || docId;

    // Real Firebase sign-in creates the Firebase account so the session can
    // mint ID tokens; abort if a different Google account is chosen.
    const provider = googleProvider || new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const popupResult = await signInWithPopup(auth, provider);
    const firebaseUser = popupResult.user;
    if (!firebaseUser?.email || firebaseUser.email.trim().toLowerCase() !== cleanEmail) {
      try { await signOut(auth); } catch (e) {}
      const err = new Error('The Google account chosen in the popup does not match. Please select the account you want to register.');
      err.code = 'auth/account-mismatch';
      throw err;
    }
    const uid = firebaseUser.uid;

    // Check if account already exists
    let existingProfile = null;
    try {
      const docSnap = await getDoc(doc(db, 'users', docId));
      if (docSnap.exists()) {
        existingProfile = docSnap.data();
      }
    } catch (e) {}

    if (existingProfile) {
      const err = new Error('An account with this email already exists. Please switch to Sign In instead.');
      err.code = 'auth/email-already-in-use';
      throw err;
    }

    let newProfile = {
      info: {
        fullName,
        username,
        email: cleanEmail,
        profession,
        uid,
        authProvider: 'google.com',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        consents: {
          termsAccepted: true,
          termsAcceptedTimestamp: new Date().toISOString(),
          googleOAuthConsent: true,
          permissionsGranted: ['INSPECT_FIREBASE_PROJECT', 'CREATE_DATABASE_OBSIDIANIDE', 'READ_WRITE_MODIFY_PROJECT_FILES']
        }
      },
      projects: {}
    };

    const mockUser = {
      uid,
      email: cleanEmail,
      displayName: fullName,
      photoURL: account.avatarUrl || ''
    };

    // Client Firestore Direct Write Guarantee
    try {
      const userDocRef = doc(db, 'users', docId);
      await setDoc(userDocRef, newProfile, { merge: true });
    } catch (fsErr) {
      console.warn("Client Firestore Google user doc save notice:", fsErr);
    }

    try {
      const token = await getFirebaseIdToken();
      const regRes = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          email: cleanEmail,
          displayName: fullName,
          username,
          profession
        })
      });
      const regData = await regRes.json();
      if (regRes.ok && regData.profile) {
        newProfile = regData.profile;
      }
    } catch (dbErr) {
      console.warn("Google register API save notice:", dbErr);
    }

    saveSession(mockUser, newProfile);
    return { user: mockUser, profile: newProfile };
  };

  // Allows external components to refresh the cached profile
  const refreshProfile = async () => {
    const user = currentUser;
    if (!user) return;
    try {
      const token = await getFirebaseIdToken();
      const res = await fetch(`/api/users/profile?email=${encodeURIComponent(user.email)}`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      const data = await res.json();
      if (res.ok && data.profile) {
        setUserProfile(data.profile);
      }
    } catch (e) {
      console.warn('refreshProfile notice:', e);
    }
  };

  const value = {
    currentUser,
    userProfile,
    setUserProfile,
    refreshProfile,
    loading,
    login,
    register,
    signInWithGoogle,
    loginWithGoogleAccount,
    registerWithGoogleAccount,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
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
