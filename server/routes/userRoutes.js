import express from 'express';
import { adminDb } from '../config/firebaseAdmin.js';
import { verifyToken, verifyTokenOptional } from '../middleware/authMiddleware.js';
import { inMemoryProjectStore } from './projectRoutes.js';

const router = express.Router();

export const inMemoryUserStore = new Map();

const getProjectDisplayTitle = (project, fallbackProjectId = '') => {
  const projectId = String(project?.projectId || project?.id || fallbackProjectId || '').trim();
  const title = String(project?.title || '').trim();
  if (title && title !== projectId) return title;
  const match = projectId.match(/^proj_(.+)_\d{4}$/i);
  return match ? (match[1].replace(/_+/g, ' ').trim() || 'Untitled project') : (title || projectId || 'Untitled project');
};

// GET /api/users/count: Return the total number of registered user profiles
router.get('/count', async (req, res) => {
  try {
    let count = 0;
    let source = 'memory';

    if (adminDb) {
      const snapshot = await adminDb.collection('users').count().get();
      count = snapshot.data().count;
      source = 'firestore';
    } else {
      const knownEmails = new Set();
      inMemoryUserStore.forEach((profile) => {
        const email = profile?.info?.email;
        if (email) knownEmails.add(String(email).trim().toLowerCase());
      });
      count = knownEmails.size;
    }

    res.set('Cache-Control', 'no-store');
    return res.json({ status: 'SUCCESS', count, source });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch registered user count' });
  }
});

// GET /api/users/profile: Retrieve user info & projects schema
router.get('/profile', verifyTokenOptional, async (req, res) => {
  try {
    const { email, username } = req.query;
    const targetEmail = (email || req.user?.email || '').trim().toLowerCase();

    if (!targetEmail) {
      return res.status(400).json({ status: 'ERROR', error: 'email query parameter is required', notFound: false });
    }

    // Verified callers may only inspect their own profile document
    if (req.user && (req.user.email || '').trim().toLowerCase() !== targetEmail) {
      return res.status(403).json({ status: 'FORBIDDEN', error: 'You can only fetch your own profile' });
    }

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
          title: getProjectDisplayTitle(proj, pid),
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

    // Unverified callers get only the public subset needed for
    // login/register existence checks — never tokens or storage config.
    if (!req.user) {
      return res.json({
        status: 'SUCCESS',
        profile: {
          info: {
            fullName: info.fullName,
            username: info.username,
            email: info.email,
            avatarUrl: info.avatarUrl,
            profession: info.profession
          }
        }
      });
    }

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
router.get('/all', verifyToken, async (req, res) => {
  try {
    const usersList = [];
    if (adminDb) {
      const snapshot = await adminDb.collection('users').get();
      snapshot.forEach(docSnap => {
        const data = docSnap.data() || {};
        // Never expose third-party tokens or personal storage credentials.
        if (data.info && typeof data.info === 'object') {
          const info = { ...data.info };
          if (info.github && typeof info.github === 'object') {
            info.github = { ...info.github };
            delete info.github.accessToken;
          }
          delete info.personalFirebaseConfig;
          data.info = info;
        }
        usersList.push({
          docId: docSnap.id,
          ...data
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

    // Verified callers can only register their own authenticated email
    if (req.user?.email && email && (email || '').trim().toLowerCase() !== (req.user.email || '').trim().toLowerCase()) {
      return res.status(403).json({ error: 'You can only register your own authenticated email' });
    }

    const targetEmail = (req.user?.email || email || '').trim();
    if (!targetEmail) {
      return res.status(400).json({ error: 'Email is required.' });
    }
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
          uid: req.user?.uid || `uid_${cleanDocId}`
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

// POST /api/users/clean-database: Complete database purge across all collections
router.post('/clean-database', verifyToken, async (req, res) => {
  if (process.env.ENABLE_ADMIN_TOOLS !== 'true') {
    return res.status(403).json({ error: 'Administrative tools are disabled.' });
  }
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
    const { displayName, designation, avatarUrl, username } = req.body;
    // Profile updates apply only to the authenticated caller's own document.
    const targetEmail = (req.user?.email || '').trim().toLowerCase();
    if (!targetEmail) {
      return res.status(401).json({ error: 'Authentication required. Please sign in again.' });
    }
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
router.post('/reset-store', verifyToken, (req, res) => {
  if (process.env.ENABLE_ADMIN_TOOLS !== 'true') {
    return res.status(403).json({ error: 'Administrative tools are disabled.' });
  }
  inMemoryUserStore.clear();
  res.json({ status: 'SUCCESS', message: 'In-memory user store cleared.' });
});

export default router;
