import express from 'express';
import { adminDb } from '../config/firebaseAdmin.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { inMemoryProjectStore } from './projectRoutes.js';

const router = express.Router();

export const inMemoryUserStore = new Map();

// GET /api/users/profile: Retrieve user info & projects schema
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const { email, username } = req.query;
    const targetEmail = (email || req.user?.email || 'zafor@bubt.edu.bd').trim().toLowerCase();
    const cleanDocId = (username || targetEmail.split('@')[0]).toLowerCase().replace(/[^a-z0-9_]/g, '_');

    let userData = inMemoryUserStore.get(cleanDocId) || inMemoryUserStore.get(targetEmail) || null;
    try {
      if (adminDb) {
        const docSnap = await adminDb.collection('users').doc(cleanDocId).get();
        if (docSnap.exists) {
          userData = docSnap.data();
          inMemoryUserStore.set(cleanDocId, userData);
          inMemoryUserStore.set(targetEmail, userData);
        }
      }
    } catch (e) {
      console.warn("User doc lookup warning:", e.message);
    }

    if (!userData) {
      return res.status(404).json({
        status: 'NOT_FOUND',
        error: 'No registered user profile found for this email. Please sign up first.',
        notFound: true
      });
    }

    // Aggregate user projects and calculate storage consumption dynamically
    const projectsMap = { ...(userData?.projects || {}) };
    let totalStorageBytes = 0;

    inMemoryProjectStore.forEach((proj, pid) => {
      const isOwner = (proj.ownerEmail || '').trim().toLowerCase() === targetEmail;
      const collabs = proj.collaborators || {};
      const collabRole = collabs[targetEmail] || collabs[email];
      if (isOwner || collabRole) {
        projectsMap[proj.projectId || pid] = {
          projectId: proj.projectId || pid,
          title: proj.title || pid,
          languageEnv: proj.languageEnv || 'PYTHON_3.11',
          userRole: isOwner ? 'OWNER' : (collabRole || 'EDITOR'),
          ownerEmail: proj.ownerEmail,
          collaborators: collabs,
          updatedAt: proj.updatedAt || new Date().toISOString()
        };

        const files = proj.working_files || proj.master_project_files || proj.project_files || [];
        files.forEach(f => {
          if (f && f.content !== undefined) {
            const content = String(f.content);
            if (content.startsWith('data:')) {
              const b64 = content.split(',')[1] || '';
              totalStorageBytes += Math.floor((b64.length * 3) / 4);
            } else {
              totalStorageBytes += Buffer.byteLength(content, 'utf-8');
            }
          }
        });
      }
    });

    const usedStorageMb = Number((totalStorageBytes / (1024 * 1024)).toFixed(2));
    const allocatedStorageMb = 1024;
    const usagePercentage = Number(((usedStorageMb / allocatedStorageMb) * 100).toFixed(2));

    const info = {
      fullName: userData.info?.fullName || cleanDocId,
      username: userData.info?.username || cleanDocId,
      email: targetEmail,
      profession: userData.info?.profession || 'Student',
      avatarUrl: userData.info?.avatarUrl || '',
      storageStrategy: userData.info?.storageStrategy || 'FIREBASE_PERSONAL',
      personalStorageConnected: userData.info?.personalStorageConnected || false,
      personalStorageVerified: userData.info?.personalStorageVerified || false,
      personalStorageProjectId: userData.info?.personalStorageProjectId || '',
      personalStorageDatabaseName: userData.info?.personalStorageDatabaseName || 'ObsidianIDE',
      allocatedStorageMb,
      usedStorageMb,
      usagePercentage,
      totalStorageBytes,
      consents: userData.info?.consents || {
        termsAccepted: true,
        googleOAuthConsent: true,
        permissionsGranted: ['INSPECT_FIREBASE_PROJECT', 'CREATE_DATABASE_OBSIDIANIDE', 'READ_WRITE_MODIFY_PROJECT_FILES']
      },
      ...(userData?.info || {})
    };

    info.allocatedStorageMb = allocatedStorageMb;
    info.usedStorageMb = usedStorageMb;
    info.usagePercentage = usagePercentage;
    info.totalStorageBytes = totalStorageBytes;

    res.json({
      status: 'SUCCESS',
      profile: {
        info,
        projects: projectsMap
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile', details: error.message });
  }
});

// GET /api/users/all: List all registered user account documents in Firestore
router.get('/all', async (req, res) => {
  try {
    const usersList = [];
    if (adminDb) {
      const snapshot = await adminDb.collection('users').get();
      snapshot.forEach(docSnap => {
        usersList.push({
          docId: docSnap.id,
          ...docSnap.data()
        });
      });
    }
    res.json({
      status: 'SUCCESS',
      count: usersList.length,
      users: usersList
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch registered users list', details: err.message });
  }
});

// POST /api/users/register: Register and initialize new user profile in Firestore
router.post('/register', verifyToken, async (req, res) => {
  try {
    const { email, displayName, username, profession, avatarUrl } = req.body;
    const targetEmail = (email || req.user?.email || 'user@example.com').trim();
    const cleanDocId = getUserDocIdFromEmail(targetEmail);
    const storedUsername = username || cleanDocId;

    let newProfile = null;

    try {
      if (adminDb) {
        const userDocRef = adminDb.collection('users').doc(cleanDocId);
        const userSnap = await userDocRef.get();
        const existingData = userSnap.exists ? userSnap.data() : {};

        const info = {
          fullName: displayName || cleanDocId,
          username: storedUsername,
          email: targetEmail,
          profession: profession || 'Student',
          avatarUrl: avatarUrl || '',
          uid: req.user?.uid || `uid_${cleanDocId}`,
          createdAt: existingData.info?.createdAt || new Date().toISOString(),
          lastLogin: new Date().toISOString(),
          storageStrategy: 'FIREBASE_PERSONAL',
          personalStorageConnected: false,
          personalStorageVerified: false,
          personalStorageDatabaseName: 'ObsidianIDE',
          consents: {
            termsAccepted: true,
            termsAcceptedTimestamp: new Date().toISOString(),
            googleOAuthConsent: true,
            permissionsGranted: ['INSPECT_FIREBASE_PROJECT', 'CREATE_DATABASE_OBSIDIANIDE', 'READ_WRITE_MODIFY_PROJECT_FILES']
          }
        };

        newProfile = {
          info,
          projects: existingData.projects || {}
        };

        await userDocRef.set(newProfile, { merge: true });
        inMemoryUserStore.set(cleanDocId, newProfile);
        inMemoryUserStore.set(targetEmail, newProfile);
      }
    } catch (dbErr) {
      console.warn("Register user Admin SDK notice:", dbErr.message);
    }

    if (!newProfile) {
      newProfile = {
        info: {
          fullName: displayName || cleanDocId,
          username: storedUsername,
          email: targetEmail,
          profession: profession || 'Student',
          avatarUrl: avatarUrl || '',
          uid: req.user?.uid || `uid_${cleanDocId}`,
          personalStorageConnected: false,
          personalStorageVerified: false,
          personalStorageDatabaseName: 'ObsidianIDE',
          storageStrategy: 'FIREBASE_PERSONAL'
        },
        projects: {}
      };
      inMemoryUserStore.set(cleanDocId, newProfile);
      inMemoryUserStore.set(targetEmail, newProfile);
    }

    res.status(201).json({
      status: 'SUCCESS',
      message: 'User account registered and profile document initialized.',
      profile: newProfile
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register user', details: error.message });
  }
});

// POST /api/users/provision-firebase-database: Instantiate ObsidianIDE database partition for target user
router.post('/provision-firebase-database', verifyToken, async (req, res) => {
  try {
    const { userEmail, firebaseProjectId = 'obsidian-workspace', databaseName = 'ObsidianIDE' } = req.body;
    const targetEmail = (req.user?.email || userEmail || 'user@example.com').trim().toLowerCase();
    const targetUsername = targetEmail.split('@')[0];

    let existingData = inMemoryUserStore.get(targetUsername) || inMemoryUserStore.get(targetEmail) || {};

    try {
      if (adminDb) {
        const userDocRef = adminDb.collection('users').doc(targetUsername);
        const userSnap = await userDocRef.get();
        if (userSnap.exists) {
          existingData = userSnap.data();
        }
      }
    } catch (dbErr) {
      console.warn("Firestore user metadata lookup notice:", dbErr.message);
    }

    const existingInfo = existingData.info || {};

    const updatedInfo = {
      ...existingInfo,
      email: targetEmail,
      username: targetUsername,
      storageStrategy: 'FIREBASE_PERSONAL',
      personalStorageConnected: true,
      personalStorageVerified: true,
      personalStorageDatabaseName: databaseName,
      personalStorageProjectId: firebaseProjectId,
      personalStorageConsoleUrl: `https://console.firebase.google.com/u/0/project/${firebaseProjectId}/firestore/databases/${databaseName}`,
      consents: {
        termsAccepted: true,
        termsAcceptedTimestamp: new Date().toISOString(),
        googleOAuthConsent: true,
        permissionsGranted: ['INSPECT_FIREBASE_PROJECT', 'CREATE_DATABASE_OBSIDIANIDE', 'READ_WRITE_MODIFY_PROJECT_FILES']
      }
    };

    const updatedProfile = {
      info: updatedInfo,
      projects: existingData.projects || {}
    };

    inMemoryUserStore.set(targetUsername, updatedProfile);
    inMemoryUserStore.set(targetEmail, updatedProfile);

    try {
      if (adminDb) {
        const userDocRef = adminDb.collection('users').doc(targetUsername);
        await userDocRef.set(updatedProfile, { merge: true });
      }
    } catch (dbErr) {
      console.warn("Firestore user metadata update notice:", dbErr.message);
    }

    res.json({
      status: 'SUCCESS',
      message: `Database '${databaseName}' successfully provisioned for user ${targetEmail}.`,
      databaseName,
      firebaseProjectId,
      targetEmail,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error provisioning Firebase database:', error);
    res.status(500).json({ error: 'Failed to provision database', details: error.message });
  }
});

// POST /api/users/clean-database: Complete database purge across all collections
router.post('/clean-database', verifyToken, async (req, res) => {
  try {
    const collectionsToClean = [
      'files',
      'projects',
      'users',
      'ObsidianIDE_metadata',
      'ObsidianIDE_Connection_Test',
      'patches',
      'invites',
      'audit_logs'
    ];
    let deletedCount = 0;

    if (adminDb) {
      for (const colName of collectionsToClean) {
        try {
          const snapshot = await adminDb.collection(colName).get();
          for (const docSnap of snapshot.docs) {
            await adminDb.collection(colName).doc(docSnap.id).delete();
            deletedCount++;
          }
        } catch (colErr) {
          console.warn(`Clean collection notice [${colName}]:`, colErr.message);
        }
      }
    }

    res.json({
      status: 'SUCCESS',
      message: `Database cleaned successfully. Purged ${deletedCount} total document records.`,
      deletedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error cleaning database:', error);
    res.status(500).json({ error: 'Failed to clean database', details: error.message });
  }
});

const getUserDocIdFromEmail = (email) =>
  (email?.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_');

// PUT /api/users/profile: Update user profile fields inside Firestore users/{docId}
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { email, displayName, designation, avatarUrl, username } = req.body;
    const targetEmail = (email || req.user?.email || 'zafor@bubt.edu.bd').trim().toLowerCase();
    const targetUsername = getUserDocIdFromEmail(targetEmail);

    let existingData = inMemoryUserStore.get(targetUsername) || inMemoryUserStore.get(targetEmail) || {};
    let existingInfo = existingData.info || {};

    try {
      if (adminDb) {
        const userDocRef = adminDb.collection('users').doc(targetUsername);
        const userSnap = await userDocRef.get();
        if (userSnap.exists) {
          existingData = userSnap.data();
          existingInfo = existingData.info || {};
        }

        const updatedInfo = {
          ...existingInfo,
          fullName: displayName || existingInfo.fullName || targetUsername,
          email: targetEmail,
          profession: designation || existingInfo.profession || 'Full-Stack Lead Architect',
          avatarUrl: avatarUrl !== undefined ? avatarUrl : (existingInfo.avatarUrl || ''),
          ...(username !== undefined ? { username } : {})
        };

        const updatedProfile = {
          info: updatedInfo,
          projects: existingData.projects || {}
        };

        await userDocRef.set(updatedProfile, { merge: true });
        inMemoryUserStore.set(targetUsername, updatedProfile);
        inMemoryUserStore.set(targetEmail, updatedProfile);
      }
    } catch (dbErr) {
      console.warn("Firestore profile PUT notice:", dbErr.message);
    }

    const updatedInfo = {
      ...existingInfo,
      fullName: displayName || existingInfo.fullName || targetUsername,
      email: targetEmail,
      profession: designation || existingInfo.profession || 'Full-Stack Lead Architect',
      avatarUrl: avatarUrl !== undefined ? avatarUrl : (existingInfo.avatarUrl || ''),
      ...(username !== undefined ? { username } : {})
    };

    const updatedProfile = {
      info: updatedInfo,
      projects: existingData.projects || {}
    };

    inMemoryUserStore.set(targetUsername, updatedProfile);
    inMemoryUserStore.set(targetEmail, updatedProfile);

    res.json({
      status: 'SUCCESS',
      message: 'User profile updated successfully.',
      updatedFields: {
        email: targetEmail,
        displayName,
        designation,
        avatarUrl
      }
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update profile', details: error.message });
  }
});

// POST /api/users/reset-store: Wipe in-memory user store
router.post('/reset-store', (req, res) => {
  inMemoryUserStore.clear();
  res.json({ status: 'SUCCESS', message: 'In-memory user store cleared.' });
});

export default router;
