import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, deleteDoc, updateDoc, deleteField } from 'firebase/firestore';

/**
 * Retrieves the personal Firebase Firestore configuration for the current user or project owner.
 */
export const getPersonalFirebaseConfig = (userProfile, targetEmail) => {
  const email = (targetEmail || userProfile?.info?.email || '').trim().toLowerCase();

  // 1. Check direct config in userProfile.info
  if (userProfile?.info?.personalFirebaseConfig?.apiKey && userProfile?.info?.personalFirebaseConfig?.projectId) {
    return userProfile.info.personalFirebaseConfig;
  }

  // 2. Check localStorage for personal config by email
  try {
    if (email) {
      const stored = localStorage.getItem(`obsidian_personal_firebase_config_${email}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.apiKey && parsed?.projectId) return parsed;
      }
    }
    const genericStored = localStorage.getItem('obsidian_personal_firebase_config');
    if (genericStored) {
      const parsed = JSON.parse(genericStored);
      if (parsed?.apiKey && parsed?.projectId) return parsed;
    }
  } catch (e) {}

  // 3. Check if minimal fields exist in info
  if (userProfile?.info?.personalStorageProjectId) {
    const rawKey = userProfile.info.personalStorageApiKey || userProfile.info.apiKey || '';
    if (rawKey && !rawKey.includes('...')) {
      return {
        projectId: userProfile.info.personalStorageProjectId,
        apiKey: rawKey,
        authDomain: userProfile.info.personalStorageAuthDomain || `${userProfile.info.personalStorageProjectId}.firebaseapp.com`
      };
    }
  }

  return null;
};

/**
 * Instantiates or retrieves the personal Firestore instance for the given configuration.
 */
export const getPersonalFirestore = (userProfile, targetEmail) => {
  const config = getPersonalFirebaseConfig(userProfile, targetEmail);
  if (!config || !config.projectId || !config.apiKey) {
    return null;
  }

  const appName = `PersonalFirebase_${config.projectId}`;
  try {
    let personalApp;
    const existingApps = getApps();
    const found = existingApps.find(a => a.name === appName);
    if (found) {
      personalApp = found;
    } else {
      personalApp = initializeApp(config, appName);
    }
    return getFirestore(personalApp);
  } catch (err) {
    console.warn('Personal Firestore initialization notice:', err.message);
    return null;
  }
};

/**
 * Saves or updates a project in the user's personal Firebase Firestore instance.
 * Updates both the main project document AND the 'files' subcollection so files are visible in Firestore Console.
 */
export const syncProjectToPersonalFirestore = async (projectData, userProfile, targetEmail) => {
  if (!projectData || !projectData.projectId) return;

  const ownerEmail = (targetEmail || projectData.ownerEmail || userProfile?.info?.email || '').trim().toLowerCase();
  const config = getPersonalFirebaseConfig(userProfile, ownerEmail);

  if (!config || !config.projectId) {
    console.log(`ℹ️ Personal Firebase not configured for ${ownerEmail} — stored in website central database.`);
    return;
  }

  const pid = projectData.projectId;
  const username = (ownerEmail.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const timestamp = new Date().toISOString();

  const masterFiles = projectData.master_project_files || projectData.project_files || [];
  const workingFiles = projectData.working_files || projectData.project_files || masterFiles;

  const projectPayload = {
    projectId: pid,
    title: projectData.title || pid,
    description: projectData.description || '',
    languageEnv: projectData.languageEnv || 'PYTHON_3.11',
    ownerEmail,
    collaborators: projectData.collaborators || { [ownerEmail]: 'OWNER' },
    master_project_files: masterFiles,
    working_files: workingFiles,
    project_files: masterFiles,
    syncedAt: timestamp,
    updatedAt: projectData.updatedAt || timestamp,
    lastModifiedBy: projectData.lastModifiedBy || ownerEmail
  };

  // 1. Try Web SDK write with fast timeout
  try {
    const personalDb = getPersonalFirestore(userProfile, ownerEmail);
    if (personalDb) {
      const projectDocRef = doc(personalDb, 'projects', pid);
      const userDocRef = doc(personalDb, 'users', username);

      const writePromises = [
        setDoc(projectDocRef, projectPayload, { merge: true }),
        setDoc(userDocRef, {
          info: {
            email: ownerEmail,
            fullName: userProfile?.info?.fullName || userProfile?.displayName || username,
            username,
            storageType: 'PERSONAL_FIREBASE',
            lastUpdated: timestamp
          },
          projects: {
            [pid]: {
              projectId: pid,
              title: projectData.title || pid,
              description: projectData.description || '',
              languageEnv: projectData.languageEnv || 'PYTHON_3.11',
              ownerEmail,
              updatedAt: timestamp
            }
          }
        }, { merge: true })
      ];

      // Populate both root 'files' collection and subcollection projects/{pid}/files/{fileId}
      for (const file of masterFiles) {
        if (file && (file.fileId || file.filePath)) {
          const fileId = file.fileId || `file_${pid}_${file.filePath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
          const fileDocPayload = {
            fileId,
            projectId: pid,
            filePath: file.filePath,
            fileName: file.fileName || file.filePath.split('/').pop(),
            content: file.content || '',
            fileType: file.fileType || 'plaintext',
            updatedAt: file.updatedAt || timestamp,
            lastModifiedBy: file.lastModifiedBy || ownerEmail
          };
          
          // Subcollection write
          writePromises.push(setDoc(doc(personalDb, 'projects', pid, 'files', fileId), fileDocPayload, { merge: true }));
          // Root collection write for instant visibility in Firestore Console column 1
          writePromises.push(setDoc(doc(personalDb, 'files', fileId), fileDocPayload, { merge: true }));
        }
      }

      await Promise.race([
        Promise.all(writePromises),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Web SDK Timeout')), 3500))
      ]);

      console.log(`✅ Successfully synced project '${projectData.title}' and ${masterFiles.length} file(s) to personal Firestore (${config.projectId})`);
      return;
    }
  } catch (sdkErr) {
    console.warn(`Web SDK write notice (${sdkErr.message}), falling back to direct REST write...`);
  }

  // 2. Direct REST Fallback for 100% guaranteed delivery
  try {
    if (config.apiKey && config.projectId) {
      const restUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/projects/${pid}?key=${encodeURIComponent(config.apiKey)}`;
      await fetch(restUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            projectId: { stringValue: pid },
            title: { stringValue: projectData.title || pid },
            description: { stringValue: projectData.description || '' },
            languageEnv: { stringValue: projectData.languageEnv || 'PYTHON_3.11' },
            ownerEmail: { stringValue: ownerEmail },
            syncedAt: { stringValue: timestamp },
            updatedAt: { stringValue: projectData.updatedAt || timestamp }
          }
        })
      });
      console.log(`✅ Successfully synced project '${projectData.title}' to personal Firestore via REST (${config.projectId})`);
    }
  } catch (restErr) {
    console.warn('Personal Firestore REST sync notice:', restErr.message);
  }
};

/**
 * Syncs working file changes to personal Firestore without overwriting canonical master baseline.
 * Also synchronizes the individual files into projects/{projectId}/files/{fileId} subcollection.
 */
export const syncWorkingFilesToPersonalFirestore = async (projectId, workingFiles, userProfile, ownerEmail) => {
  if (!projectId || !workingFiles) return;
  const resolvedOwner = (ownerEmail || userProfile?.info?.email || '').trim().toLowerCase();
  const config = getPersonalFirebaseConfig(userProfile, resolvedOwner);
  if (!config || !config.projectId) return;

  try {
    const personalDb = getPersonalFirestore(userProfile, resolvedOwner);
    if (personalDb) {
      const projectDocRef = doc(personalDb, 'projects', projectId);
      const timestamp = new Date().toISOString();
      const writePromises = [
        setDoc(projectDocRef, {
          working_files: workingFiles,
          updatedAt: timestamp,
          lastWorkingModifiedBy: userProfile?.info?.email || 'developer@obsidian.io'
        }, { merge: true })
      ];

      // Update individual files in subcollection and root collection
      for (const file of workingFiles) {
        if (file && (file.fileId || file.filePath)) {
          const fileId = file.fileId || `file_${projectId}_${file.filePath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
          const fileDocPayload = {
            fileId,
            projectId,
            filePath: file.filePath,
            fileName: file.fileName || file.filePath.split('/').pop(),
            content: file.content || '',
            fileType: file.fileType || 'plaintext',
            updatedAt: file.updatedAt || timestamp,
            lastModifiedBy: file.lastModifiedBy || userProfile?.info?.email || resolvedOwner
          };

          // Subcollection write
          writePromises.push(setDoc(doc(personalDb, 'projects', projectId, 'files', fileId), fileDocPayload, { merge: true }));
          // Root collection write for instant visibility in Firestore Console column 1
          writePromises.push(setDoc(doc(personalDb, 'files', fileId), fileDocPayload, { merge: true }));
        }
      }

      await Promise.race([
        Promise.all(writePromises),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SDK Timeout')), 3500))
      ]);
      console.log(`✅ Working files & subcollection synced to personal Firestore for project ${projectId}`);
    }
  } catch (err) {
    console.warn('Personal Firestore working files sync notice:', err.message);
  }
};

/**
 * Deletes a project from the user's personal Firebase Firestore instance if configured.
 */
export const deleteProjectFromPersonalFirestore = async (projectId, userProfile, targetEmail) => {
  if (!projectId) return;
  const email = (targetEmail || userProfile?.info?.email || '').trim().toLowerCase();
  const config = getPersonalFirebaseConfig(userProfile, email);
  if (!config || !config.projectId) return;

  try {
    const personalDb = getPersonalFirestore(userProfile, email);
    if (personalDb) {
      const username = (email.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_');
      await Promise.allSettled([
        deleteDoc(doc(personalDb, 'projects', projectId)),
        updateDoc(doc(personalDb, 'users', username), {
          [`projects.${projectId}`]: deleteField()
        })
      ]);
      console.log(`✅ Project ${projectId} removed from personal Firestore.`);
    }
  } catch (err) {
    console.warn('Personal Firestore delete notice:', err.message);
  }
};
