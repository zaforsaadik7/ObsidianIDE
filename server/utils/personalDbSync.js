import { adminDb } from '../config/firebaseAdmin.js';
import { inMemoryUserStore } from '../routes/userRoutes.js';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Resolves the personal Firebase configuration for a project owner.
 */
export const getOwnerPersonalFirebaseConfig = async (ownerEmail) => {
  if (!ownerEmail) return null;
  const cleanEmail = ownerEmail.trim().toLowerCase();
  const username = cleanEmail.split('@')[0].replace(/[^a-z0-9_]/g, '_');

  // 1. Check in-memory store
  const memUser = inMemoryUserStore.get(username) || inMemoryUserStore.get(cleanEmail);
  if (memUser?.info?.personalStorageVerified === true && memUser?.info?.personalStorageConnected === true && memUser?.info?.personalFirebaseConfig?.apiKey && memUser?.info?.personalFirebaseConfig?.projectId) {
    return memUser.info.personalFirebaseConfig;
  }

  // 2. Check Firestore Website DB via adminDb if available
  if (adminDb) {
    try {
      const userSnap = await adminDb.collection('users').doc(username).get();
      if (userSnap.exists) {
        const uData = userSnap.data();
        if (uData?.info?.personalStorageVerified === true && uData?.info?.personalStorageConnected === true && uData?.info?.personalFirebaseConfig?.apiKey && uData?.info?.personalFirebaseConfig?.projectId) {
          return uData.info.personalFirebaseConfig;
        }
      }
    } catch (e) {
      console.warn('Owner personal config lookup notice:', e.message);
    }
  }

  // 3. Check Firestore Website DB via direct REST API
  try {
    const websiteApiKey = process.env.VITE_FIREBASE_API_KEY;
    const websiteProjectId = process.env.VITE_FIREBASE_PROJECT_ID || 'obsidianide-1606f';
    if (websiteApiKey && websiteProjectId) {
      const userDocUrl = `https://firestore.googleapis.com/v1/projects/${websiteProjectId}/databases/(default)/documents/users/${username}?key=${websiteApiKey}`;
      const res = await fetch(userDocUrl);
      if (res.ok) {
        const docJson = await res.json();
        const infoMap = docJson.fields?.info?.mapValue?.fields;
        const pcfgMap = infoMap?.personalFirebaseConfig?.mapValue?.fields;
        const verified = infoMap?.personalStorageVerified?.booleanValue === true;
        const connected = infoMap?.personalStorageConnected?.booleanValue === true;
        if (verified && connected && pcfgMap?.apiKey?.stringValue && pcfgMap?.projectId?.stringValue) {
          const resolved = {
            apiKey: pcfgMap.apiKey.stringValue,
            projectId: pcfgMap.projectId.stringValue,
            appId: pcfgMap.appId?.stringValue || '',
            authDomain: pcfgMap.authDomain?.stringValue || `${pcfgMap.projectId.stringValue}.firebaseapp.com`
          };
          return resolved;
        }
      }
    }
  } catch (restErr) {
    console.warn('REST owner config lookup notice:', restErr.message);
  }

  return null;
};

/**
 * Synchronizes project files directly into the project owner's personal Firebase Firestore database via REST API.
 * Prunes stale or deleted file documents so Firestore Console matches active workspace files 1:1.
 */
export const syncToOwnerPersonalFirestore = async ({
  ownerEmail,
  projectId,
  projectTitle = '',
  languageEnv = 'PYTHON_3.11',
  files = [],
  isMasterSync = false,
  modifiedBy = ''
}) => {
  if (!ownerEmail || !projectId) return { success: false, reason: 'Missing ownerEmail or projectId' };

  const config = await getOwnerPersonalFirebaseConfig(ownerEmail);
  if (!config || !config.projectId || !config.apiKey) {
    console.log(`ℹ️ Personal Firebase config not found on server for ${ownerEmail}.`);
    return { success: false, reason: 'No config found' };
  }

  const timestamp = new Date().toISOString();
  const pid = projectId;
  const apiKey = config.apiKey;
  const targetProjectId = config.projectId;

  try {
    // 1. Update Project Document in Owner's Personal Firestore with explicit updateMask
    const maskFields = ['working_files', 'updatedAt', 'projectId', 'title', 'languageEnv', 'ownerEmail'];
    if (isMasterSync) {
      maskFields.push('master_project_files', 'project_files', 'masterLastSyncedAt', 'masterLastSyncedBy');
    }
    const updateMaskParams = maskFields.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
    const projectRestUrl = `https://firestore.googleapis.com/v1/projects/${targetProjectId}/databases/(default)/documents/projects/${pid}?key=${encodeURIComponent(apiKey)}&${updateMaskParams}`;
    
    const formattedFilesArray = {
      arrayValue: {
        values: files.map(f => ({
          mapValue: {
            fields: {
              fileId: { stringValue: f.fileId || `file_${pid}_${(f.filePath || '').replace(/[^a-zA-Z0-9_]/g, '_')}` },
              projectId: { stringValue: pid },
              filePath: { stringValue: f.filePath || '' },
              fileName: { stringValue: f.fileName || (f.filePath ? f.filePath.split('/').pop() : 'file') },
              content: { stringValue: typeof f.content === 'string' ? f.content : '' },
              fileType: { stringValue: f.fileType || 'plaintext' },
              updatedAt: { stringValue: f.updatedAt || timestamp },
              lastModifiedBy: { stringValue: f.lastModifiedBy || modifiedBy || ownerEmail }
            }
          }
        }))
      }
    };

    const projectFields = {
      projectId: { stringValue: pid },
      title: { stringValue: projectTitle || pid },
      languageEnv: { stringValue: languageEnv },
      ownerEmail: { stringValue: ownerEmail },
      working_files: formattedFilesArray,
      updatedAt: { stringValue: timestamp }
    };

    if (isMasterSync) {
      projectFields.master_project_files = formattedFilesArray;
      projectFields.project_files = formattedFilesArray;
      projectFields.masterLastSyncedAt = { stringValue: timestamp };
      projectFields.masterLastSyncedBy = { stringValue: modifiedBy || ownerEmail };
    }

    const projectWriteResponse = await fetch(projectRestUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: projectFields })
    });
    if (!projectWriteResponse.ok) {
      const payload = await projectWriteResponse.json().catch(() => ({}));
      throw new Error(payload?.error?.message || `Personal Firestore rejected the project write (HTTP ${projectWriteResponse.status}).`);
    }

    // 2. Active File IDs Set for Exact Database Pruning
    const activeFileDocIds = new Set();
    const activeFilePaths = new Set();

    // Write / Update Active Files
    for (const f of files) {
      if (f && (f.filePath || f.fileId)) {
        const fileDocId = f.fileId || `file_${pid}_${f.filePath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        activeFileDocIds.add(fileDocId);
        if (f.filePath) activeFilePaths.add(f.filePath);
        
        const fileFields = {
          fileId: { stringValue: fileDocId },
          projectId: { stringValue: pid },
          filePath: { stringValue: f.filePath || '' },
          fileName: { stringValue: f.fileName || (f.filePath ? f.filePath.split('/').pop() : 'file') },
          content: { stringValue: typeof f.content === 'string' ? f.content : '' },
          fileType: { stringValue: f.fileType || 'plaintext' },
          updatedAt: { stringValue: f.updatedAt || timestamp },
          lastModifiedBy: { stringValue: f.lastModifiedBy || modifiedBy || ownerEmail }
        };

        // Subcollection write
        const subcolUrl = `https://firestore.googleapis.com/v1/projects/${targetProjectId}/databases/(default)/documents/projects/${pid}/files/${fileDocId}?key=${encodeURIComponent(apiKey)}`;
        const subcollectionWriteResponse = await fetch(subcolUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: fileFields })
        });
        if (!subcollectionWriteResponse.ok) {
          const payload = await subcollectionWriteResponse.json().catch(() => ({}));
          throw new Error(payload?.error?.message || `Personal Firestore rejected a file write (HTTP ${subcollectionWriteResponse.status}).`);
        }

        // Root collection write for instant visibility in Firestore Console column 1
        const rootColUrl = `https://firestore.googleapis.com/v1/projects/${targetProjectId}/databases/(default)/documents/files/${fileDocId}?key=${encodeURIComponent(apiKey)}`;
        const rootCollectionWriteResponse = await fetch(rootColUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: fileFields })
        });
        if (!rootCollectionWriteResponse.ok) {
          const payload = await rootCollectionWriteResponse.json().catch(() => ({}));
          throw new Error(payload?.error?.message || `Personal Firestore rejected the files index write (HTTP ${rootCollectionWriteResponse.status}).`);
        }
      }
    }

    // 3. Prune Deleted / Stale Files from Subcollection: projects/{pid}/files
    try {
      const subcolListUrl = `https://firestore.googleapis.com/v1/projects/${targetProjectId}/databases/(default)/documents/projects/${pid}/files?key=${encodeURIComponent(apiKey)}`;
      const subcolRes = await fetch(subcolListUrl);
      if (subcolRes.ok) {
        const subcolData = await subcolRes.json();
        if (subcolData.documents) {
          for (const doc of subcolData.documents) {
            const docId = doc.name.split('/').pop();
            const filePath = doc.fields?.filePath?.stringValue;
            if (!activeFileDocIds.has(docId) && (!filePath || !activeFilePaths.has(filePath))) {
              console.log(`🗑️ [Pruning] Deleting stale subcollection file doc ${docId} (${filePath}) in ${targetProjectId}`);
              await fetch(`https://firestore.googleapis.com/v1/projects/${targetProjectId}/databases/(default)/documents/projects/${pid}/files/${docId}?key=${encodeURIComponent(apiKey)}`, {
                method: 'DELETE'
              });
            }
          }
        }
      }
    } catch (pruneSubErr) {
      console.warn('Subcollection pruning notice:', pruneSubErr.message);
    }

    // 4. Prune Deleted / Stale Files from Root Collection: files
    try {
      const rootListUrl = `https://firestore.googleapis.com/v1/projects/${targetProjectId}/databases/(default)/documents/files?key=${encodeURIComponent(apiKey)}`;
      const rootRes = await fetch(rootListUrl);
      if (rootRes.ok) {
        const rootData = await rootRes.json();
        if (rootData.documents) {
          for (const doc of rootData.documents) {
            const docId = doc.name.split('/').pop();
            const docPid = doc.fields?.projectId?.stringValue;
            const filePath = doc.fields?.filePath?.stringValue;
            if (docPid === pid && !activeFileDocIds.has(docId) && (!filePath || !activeFilePaths.has(filePath))) {
              console.log(`🗑️ [Pruning] Deleting stale root file doc ${docId} (${filePath}) in ${targetProjectId}`);
              await fetch(`https://firestore.googleapis.com/v1/projects/${targetProjectId}/databases/(default)/documents/files/${docId}?key=${encodeURIComponent(apiKey)}`, {
                method: 'DELETE'
              });
            }
          }
        }
      }
    } catch (pruneRootErr) {
      console.warn('Root files pruning notice:', pruneRootErr.message);
    }

    console.log(`✅ [Server-Side BYOD] Synced & Pruned ${files.length} file(s) in Owner Personal DB (${targetProjectId}) for project ${pid}`);
    return { success: true, count: files.length, targetProjectId };
  } catch (err) {
    console.error(`❌ [Server-Side BYOD] Failed to sync to Owner Personal DB (${targetProjectId}):`, err.message);
    return { success: false, error: err.message };
  }
};
