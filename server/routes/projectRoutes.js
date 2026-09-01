import express from 'express';
import fs from 'fs';
import path from 'path';
import { adminDb } from '../config/firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken, verifyTokenOptional } from '../middleware/authMiddleware.js';
import { v4 as uuidv4 } from 'uuid';
import { sendProjectInvitationEmail } from '../utils/emailService.js';
import { getProjectMembership, requireProjectRole } from '../utils/projectMembership.js';

const router = express.Router();

// Helper to dynamically resolve client application domain across local and online deployments
export const resolveAppDomain = (req) => {
  if (process.env.APP_DOMAIN) return process.env.APP_DOMAIN.replace(/\/+$/, '');
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  if (req?.headers?.origin) return req.headers.origin.replace(/\/+$/, '');
  if (req?.headers?.referer) {
    try {
      const u = new URL(req.headers.referer);
      return `${u.protocol}//${u.host}`;
    } catch {}
  }
  const host = req?.headers?.host || 'localhost:3000';
  const proto = req?.headers?.['x-forwarded-proto'] || (req?.secure ? 'https' : 'http');
  return `${proto}://${host}`;
};

// Synchronous In-Memory fallback cache backed by durable disk persistence
export const inMemoryProjectStore = new Map();

const STORE_FILE_PATH = path.resolve(process.cwd(), 'server', 'data', 'projects_store.json');

// Initialize store directory and load persisted projects on startup
try {
  const dir = path.dirname(STORE_FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(STORE_FILE_PATH)) {
    const raw = fs.readFileSync(STORE_FILE_PATH, 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      data.forEach(p => {
        if (p && (p.projectId || p.id)) {
          const pid = p.projectId || p.id;
          inMemoryProjectStore.set(pid, { ...p, projectId: pid });
        }
      });
    }
  }
} catch (e) {}

export const persistStoreToDisk = () => {
  try {
    const dir = path.dirname(STORE_FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const arr = Array.from(inMemoryProjectStore.values());
    fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (e) {}
};

// Mock default project template files for initial repository seeding
const getDefaultFileContent = (languageEnv = '', title = '') => {
  if (languageEnv.includes('RUST')) {
    return {
      filePath: 'src/main.rs',
      content: `// ${title} - Rust Entry Point\nfn main() {\n    println!("Initializing ${title}...");\n}`
    };
  } else if (languageEnv.includes('PYTHON')) {
    return {
      filePath: 'main.py',
      content: `# ${title} - Python Entry Point\ndef main():\n    print("Initializing ${title}...")\n\nif __name__ == "__main__":\n    main()`
    };
  } else if (languageEnv.includes('TYPESCRIPT') || languageEnv.includes('JS')) {
    return {
      filePath: 'src/index.ts',
      content: `// ${title} - TypeScript Entry Point\nconsole.log("Initializing ${title}...");`
    };
  } else {
    return {
      filePath: 'main.go',
      content: `// ${title} - Go Entry Point\npackage main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Initializing ${title}...")\n}`
    };
  }
};

// POST /api/projects: Create new project instance
router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, description = '', languageEnv, ownerEmail, collaborators = {}, teamMembersInput = {} } = req.body;

    if (!title || !ownerEmail) {
      return res.status(400).json({ error: 'Title and ownerEmail are required fields.' });
    }

    // The authenticated caller may only create projects under their own account.
    const callerEmail = (req.user?.email || '').trim().toLowerCase();
    if ((ownerEmail || '').trim().toLowerCase() !== callerEmail) {
      return res.status(403).json({ error: 'You can only create projects under your own account.' });
    }

    const projectId = req.body.projectId || uuidv4();

    // A client-chosen ID must never overwrite an existing project document.
    if (req.body.projectId) {
      let exists = inMemoryProjectStore.has(projectId);
      if (!exists && adminDb) {
        try {
          const snap = await adminDb.collection('projects').doc(projectId).get();
          exists = snap.exists;
        } catch (e) {}
      }
      if (exists) {
        return res.status(409).json({ error: 'A project with this ID already exists.' });
      }
    }

    const timestamp = new Date().toISOString();

    const cleanOwnerEmail = (ownerEmail || req.user?.email || '').trim().toLowerCase();
    // Normalize team members / collaborators input
    const normalizedCollabs = {};
    const rawMap = { ...collaborators, ...teamMembersInput };
    Object.entries(rawMap).forEach(([email, val]) => {
      const cEmail = (email || '').trim().toLowerCase();
      if (cEmail && cEmail !== cleanOwnerEmail) {
        const roleStr = typeof val === 'string' ? val : (val?.role || 'EDITOR');
        normalizedCollabs[cEmail] = roleStr.toUpperCase();
      }
    });
    normalizedCollabs[cleanOwnerEmail] = 'OWNER'; // Creator is permanently OWNER

    const defaultFile = getDefaultFileContent(languageEnv || 'RUST_1.75', title);
    const initialFiles = [
      {
        fileId: uuidv4(),
        projectId,
        filePath: defaultFile.filePath,
        fileName: defaultFile.filePath.split('/').pop(),
        content: defaultFile.content,
        fileType: defaultFile.filePath.split('.').pop(),
        lastModifiedBy: ownerEmail,
        updatedAt: timestamp
      }
    ];

    const allCollabEmails = Object.keys(normalizedCollabs).map(e => e.toLowerCase());
    const memberEmails = Array.from(new Set([cleanOwnerEmail, ...allCollabEmails]));
    const collaboratorEmails = allCollabEmails.filter(e => e !== cleanOwnerEmail);

    const newProject = {
      projectId,
      ownerEmail,
      title,
      description: description ? String(description).trim().slice(0, 150) : '',
      languageEnv: languageEnv || 'RUST_1.75',
      collaborators: normalizedCollabs,
      memberEmails,
      collaboratorEmails,
      rosterEmails: memberEmails,
      project_files: initialFiles,
      working_files: initialFiles,
      master_project_files: initialFiles,
      pending_patches: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Cache in memory and persist to disk
    inMemoryProjectStore.set(projectId, newProject);
    persistStoreToDisk();

    // Automatic Anti-Spam Invitation Email Dispatch (Requirement 1 Fix)
    // Brevo HTTPS API is the primary provider (Render blocks outbound SMTP);
    // dispatches are awaited with a bound so the client sees the true status.
    const emailDispatchLogs = [];
    const emailDispatchPromises = [];
    const domain = resolveAppDomain(req);
    Object.entries(normalizedCollabs).forEach(([email, role]) => {
      if (role.toUpperCase() !== 'OWNER' || (email !== ownerEmail && Object.keys(normalizedCollabs).length > 1)) {
        const invitePath = `/invite/${projectId}?role=${role}&email=${encodeURIComponent(email)}&title=${encodeURIComponent(title)}&owner=${encodeURIComponent(ownerEmail)}`;
        const fullInviteUrl = `${domain}${invitePath}`;

        emailDispatchLogs.push({
          to: email,
          subject: `[ObsidianIDE] Invitation to Join Project Repository: ${title}`,
          role,
          inviteUrl: fullInviteUrl,
          dispatchedAt: timestamp
        });

        const boundedDispatch = Promise.race([
          sendProjectInvitationEmail({
            to: email,
            ownerEmail,
            projectTitle: title,
            projectId,
            role,
            inviteUrl: fullInviteUrl
          }),
          new Promise((_, reject) => {
            const t = setTimeout(() => reject(new Error('email dispatch timed out')), 12000);
            if (t.unref) t.unref();
          })
        ]);
        emailDispatchPromises.push(
          boundedDispatch
            .then(result => ({ to: email, success: Boolean(result && result.success), reason: result?.reason || result?.error }))
            .catch(err => ({ to: email, success: false, reason: err.message }))
        );
      }
    });

    try {
      if (adminDb) {
        await adminDb.collection('projects').doc(projectId).set(newProject);

        // Save invitation outbox records
        try {
          const outboxRef = adminDb.collection('projects').doc(projectId).collection('invitation_outbox');
          for (const log of emailDispatchLogs) {
            await outboxRef.add(log);
          }
        } catch (e) {}

        // Update project copy/reference in ALL collaborators' user database documents (Requirement 2 Fix)
        try {
          const updatePromises = Object.entries(normalizedCollabs).map(async ([collabEmail, role]) => {
            const collabDocId = collabEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
            const userRef = adminDb.collection('users').doc(collabDocId);
            await userRef.set({
              projects: {
                [projectId]: {
                  projectId,
                  title,
                  description: newProject.description || '',
                  languageEnv: newProject.languageEnv,
                  userRole: role,
                  ownerEmail,
                  updatedAt: timestamp
                }
              }
            }, { merge: true });
          });
          await Promise.all(updatePromises);
        } catch (uErr) {
          console.warn("Notice updating collaborator project lists:", uErr.message);
        }
      }
    } catch (dbError) {
      console.warn("Notice during Admin Firestore project save:", dbError.message);
    }

    const emailResults = await Promise.all(emailDispatchPromises);
    const emailFailures = emailResults.filter(r => !r.success);
    const emailsDispatched = emailResults.length > 0 && emailFailures.length === 0;
    emailResults.forEach(r => {
      console.log(`✉️ Project creation email dispatch result for ${r.to}:`, r);
    });

    res.status(201).json({
      status: 'SUCCESS',
      message: 'Project repository initialized successfully. Invitation emails dispatched.',
      project: newProject,
      inviteLinks: emailDispatchLogs.reduce((acc, l) => { acc[l.to] = l.inviteUrl; return acc; }, {}),
      emailsDispatched,
      invitationsQueued: false,
      emailFailures: emailFailures.map(f => ({ to: f.to, reason: f.reason })),
      emailDispatchLogs
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to initialize project', details: error.message });
  }
});

// GET /api/projects: List projects accessible by user email
router.get('/', verifyToken, async (req, res) => {
  try {
    // Identity comes from the verified token only; the ?email hint is ignored.
    const email = req.user?.email || req.query.email || '';

    if (!email) {
      return res.status(400).json({ error: 'User email query parameter is required.' });
    }

    const emailNorm = email.trim().toLowerCase();
    const userProjectsMap = new Map();

    const getCanonicalKey = (p, fallbackId) => {
      const pid = (p?.projectId || p?.id || fallbackId || '').trim();
      const title = (p?.title || '').trim().toLowerCase();
      const owner = (p?.ownerEmail || '').trim().toLowerCase();
      if (title && owner) {
        return `owner::${owner}::title::${title}`;
      }
      return `pid::${pid || title}`;
    };

    const addOrMergeProject = (p, fallbackId) => {
      if (!p) return;
      const pid = p.projectId || p.id || fallbackId;
      if (!pid) return;

      const ownerNorm = (p.ownerEmail || '').trim().toLowerCase();
      const isOwner = Boolean(ownerNorm && ownerNorm === emailNorm);

      let collabRole = null;
      const collabs = p.collaborators;

      // 1. Map Collaborators
      if (collabs && typeof collabs === 'object' && !Array.isArray(collabs)) {
        if (collabs[emailNorm]) {
          collabRole = collabs[emailNorm];
        } else if (collabs[email]) {
          collabRole = collabs[email];
        } else {
          const matchedKey = Object.keys(collabs).find(k => String(k).trim().toLowerCase() === emailNorm);
          if (matchedKey) collabRole = collabs[matchedKey];
        }

        if (!collabRole) {
          const matchedVal = Object.values(collabs).find(v => {
            if (!v) return false;
            if (typeof v === 'string') return v.trim().toLowerCase() === emailNorm;
            const vEmail = (v.email || v.userEmail || '').trim().toLowerCase();
            return vEmail === emailNorm;
          });
          if (matchedVal) {
            collabRole = typeof matchedVal === 'string' ? matchedVal : (matchedVal.role || 'EDITOR');
          }
        }
      }

      // 2. Array Collaborators
      if (!collabRole && Array.isArray(collabs)) {
        const found = collabs.find(item => {
          if (!item) return false;
          if (typeof item === 'string') return item.trim().toLowerCase() === emailNorm;
          return (item.email || item.userEmail || '').trim().toLowerCase() === emailNorm;
        });
        if (found) {
          collabRole = typeof found === 'string' ? 'EDITOR' : (found.role || 'EDITOR');
        }
      }

      // 3. Team members / Text / History check
      if (!collabRole) {
        if (typeof p.teamMembersInput === 'string' && p.teamMembersInput.toLowerCase().includes(emailNorm)) {
          collabRole = 'EDITOR';
        } else if (Array.isArray(p.teamMembers) && p.teamMembers.some(m => String(m).toLowerCase().includes(emailNorm))) {
          collabRole = 'EDITOR';
        } else if (Array.isArray(p.members) && p.members.some(m => (typeof m === 'string' ? m : m?.email || '').toLowerCase() === emailNorm)) {
          collabRole = 'EDITOR';
        } else if ((p.lastWorkingModifiedBy || '').toLowerCase() === emailNorm || (p.masterLastSyncedBy || '').toLowerCase() === emailNorm) {
          collabRole = 'EDITOR';
        } else if (Array.isArray(p.working_files) && p.working_files.some(f => (f?.lastModifiedBy || '').toLowerCase() === emailNorm)) {
          collabRole = 'EDITOR';
        }
      }

      const isMember = isOwner || Boolean(collabRole);

      if (isMember) {
        const key = getCanonicalKey(p, pid);
        const existing = userProjectsMap.get(key) || {};
        const chosenPid = (p.projectId && String(p.projectId).startsWith('proj_')) 
          ? p.projectId 
          : (existing.projectId && String(existing.projectId).startsWith('proj_')) 
            ? existing.projectId 
            : pid;

        const resolvedRole = isOwner ? 'OWNER' : (typeof collabRole === 'string' ? collabRole.toUpperCase() : (collabRole?.role || 'EDITOR').toUpperCase());

        userProjectsMap.set(key, {
          ...existing,
          ...p,
          projectId: chosenPid,
          userRole: resolvedRole
        });
      }
    };

    // 1. From In-Memory Store
    inMemoryProjectStore.forEach((proj, pid) => {
      addOrMergeProject(proj, pid);
    });

    // 2. From Firestore Admin SDK (if configured)
    if (adminDb) {
      try {
        const querySnapshot = await adminDb.collection('projects').get();
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          addOrMergeProject(data, docSnap.id);
        });
      } catch (dbErr) {
        console.warn('AdminDB projects query notice:', dbErr.message);
      }
    }

    const userProjects = Array.from(userProjectsMap.values());

    res.json({
      status: 'SUCCESS',
      count: userProjects.length,
      projects: userProjects
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch user projects', details: error.message });
  }
});

// POST /api/projects/sync-catalog: Populate and synchronize in-memory project store from client catalogs
router.post('/sync-catalog', verifyTokenOptional, async (req, res) => {
  try {
    const { projects, userEmail } = req.body;
    const callerEmail = ((userEmail || req.user?.email || '')).trim().toLowerCase();
    let addedCount = 0;
    if (Array.isArray(projects)) {
      projects.forEach(p => {
        if (p && (p.projectId || p.id)) {
          const pid = p.projectId || p.id;
          const existing = inMemoryProjectStore.get(pid) || {};

          // Never clobber existing ownerEmail with an empty or undefined value
          const ownerEmail = p.ownerEmail || existing.ownerEmail || '';
          
          // Merge collaborators map
          const mergedCollabs = {
            ...(existing.collaborators || {}),
            ...(p.collaborators || {})
          };

          // If caller is an editor/collaborator, ensure they are registered in the collaborators roster
          if (callerEmail && ownerEmail && callerEmail !== ownerEmail.toLowerCase()) {
            mergedCollabs[callerEmail] = p.userRole || 'EDITOR';
          }

          const allCollabEmails = Object.keys(mergedCollabs).map(e => e.toLowerCase());
          const memberEmails = Array.from(new Set([ownerEmail.toLowerCase(), ...allCollabEmails].filter(Boolean)));
          const collaboratorEmails = allCollabEmails.filter(e => e !== ownerEmail.toLowerCase());

          inMemoryProjectStore.set(pid, {
            ...existing,
            ...p,
            projectId: pid,
            title: p.title || existing.title || pid,
            ownerEmail,
            collaborators: mergedCollabs,
            memberEmails,
            collaboratorEmails,
            rosterEmails: memberEmails
          });
          addedCount++;
        }
      });
      persistStoreToDisk();
    }
    res.json({ status: 'SUCCESS', syncedCount: addedCount, totalProjects: inMemoryProjectStore.size });
  } catch (err) {
    res.status(500).json({ error: 'Failed to sync project catalog', details: err.message });
  }
});

// DELETE /api/projects/:projectId: Permanently delete project (for Owner) or unlink (for Collaborator)
router.delete('/:projectId', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userEmail = (req.user?.email || '').trim().toLowerCase();

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID parameter is required.' });
    }

    let isOwner = false;
    let projectData = inMemoryProjectStore.get(projectId);

    if (adminDb) {
      try {
        const projDoc = await adminDb.collection('projects').doc(projectId).get();
        if (projDoc.exists) {
          projectData = projDoc.data();
        }
      } catch (e) {}
    }

    const ownerEmail = (projectData?.ownerEmail || '').trim().toLowerCase();
    isOwner = Boolean(ownerEmail && userEmail && ownerEmail === userEmail);

    const collabs = projectData?.collaborators || {};
    const isMember = isOwner || Object.keys(collabs).some(k => k.trim().toLowerCase() === userEmail);

    if (projectData && !isMember) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    if (isOwner) {
      // 1. Permanently delete canonical project document from Firestore
      if (adminDb) {
        try {
          // Clear the project reference from every collaborator's user document
          for (const email of Object.keys(collabs)) {
            const userDocId = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
            try {
              await adminDb.collection('users').doc(userDocId).set({
                projects: {
                  [projectId]: FieldValue.delete()
                }
              }, { merge: true });
            } catch (e) {}
          }

          await adminDb.collection('projects').doc(projectId).delete();
          
          // Delete files subcollection
          const filesSnap = await adminDb.collection('projects').doc(projectId).collection('files').get();
          if (!filesSnap.empty) {
            const batch = adminDb.batch();
            filesSnap.forEach(fDoc => batch.delete(fDoc.ref));
            await batch.commit().catch(() => {});
          }
        } catch (delErr) {
          console.warn('AdminDB project delete notice:', delErr.message);
        }
      }
      inMemoryProjectStore.delete(projectId);
      persistStoreToDisk();

      // 2. Remove project reference from owner's user document
      if (adminDb && userEmail) {
        try {
          const userDocId = userEmail.split('@')[0].replace(/[^a-z0-9_]/g, '_');
          const userRef = adminDb.collection('users').doc(userDocId);
          const uSnap = await userRef.get();
          if (uSnap.exists) {
            const uData = uSnap.data();
            const uProjects = { ...(uData.projects || {}) };
            delete uProjects[projectId];
            await userRef.set({ projects: uProjects }, { merge: true });
          }
        } catch (uErr) {}
      }

      return res.json({
        status: 'SUCCESS',
        message: `Project ${projectId} permanently deleted by owner.`,
        deleted: true
      });
    } else {
      // If collaborator: unlink collaborator from the project
      const memProj = inMemoryProjectStore.get(projectId);
      if (memProj && memProj.collaborators) {
        Object.keys(memProj.collaborators).forEach(key => {
          if (key.trim().toLowerCase() === userEmail) {
            delete memProj.collaborators[key];
          }
        });
        persistStoreToDisk();
      }

      if (adminDb) {
        try {
          const projRef = adminDb.collection('projects').doc(projectId);
          const projSnap = await projRef.get();
          if (projSnap.exists) {
            const data = projSnap.data();
            const collabs = { ...(data.collaborators || {}) };
            Object.keys(collabs).forEach(key => {
              if (key.trim().toLowerCase() === userEmail) {
                delete collabs[key];
              }
            });
            await projRef.set({ collaborators: collabs }, { merge: true });
          }

          const userDocId = userEmail.split('@')[0].replace(/[^a-z0-9_]/g, '_');
          const userRef = adminDb.collection('users').doc(userDocId);
          const uSnap = await userRef.get();
          if (uSnap.exists) {
            const uData = uSnap.data();
            const uProjects = { ...(uData.projects || {}) };
            delete uProjects[projectId];
            await userRef.set({
              projects: uProjects,
              deletedProjects: {
                ...(uData.deletedProjects || {}),
                [projectId]: true
              }
            }, { merge: true });
          }
        } catch (collabErr) {
          console.warn('AdminDB collaborator unlink notice:', collabErr.message);
        }
      }

      return res.json({
        status: 'SUCCESS',
        message: `Project ${projectId} unlinked from collaborator workspace.`,
        unlinked: true
      });
    }
  } catch (err) {
    console.error('Error deleting project:', err);
    res.status(500).json({ error: 'Failed to delete project', details: err.message });
  }
});

// Keeps only the most recently modified entry per filePath so re-imports
// cannot create duplicate file rows for the same path.
const dedupeFilesByPath = (fileArray = []) => {
  const byPath = new Map();
  const noPath = [];
  (fileArray || []).forEach(f => {
    if (!f) return;
    const path = f.filePath || f.fileName;
    if (!path) { noPath.push(f); return; }
    const existing = byPath.get(path);
    if (!existing || String(f.updatedAt || '') >= String(existing.updatedAt || '')) {
      byPath.set(path, f);
    }
  });
  return [...byPath.values(), ...noPath];
};

// Deletes subcollection file docs that are no longer part of the active file
// set, so deleted files/folders are not resurrected by later hydration reads.
const pruneStaleFileDocs = async (projRef, projectId, activeFiles = []) => {
  if (!adminDb || !projRef) return;
  try {
    const activeFileDocIds = new Set();
    const activeFilePaths = new Set();
    (activeFiles || []).forEach(f => {
      if (!f) return;
      if (f.filePath) {
        activeFilePaths.add(f.filePath);
        activeFileDocIds.add(f.fileId || `file_${projectId}_${f.filePath.replace(/[^a-zA-Z0-9_]/g, '_')}`);
      }
      if (f.fileId) activeFileDocIds.add(f.fileId);
    });

    const listSnap = await projRef.collection('files').get();
    const staleRefs = [];
    listSnap.forEach(d => {
      const fd = d.data() || {};
      const path = fd.filePath || '';
      if (!activeFileDocIds.has(d.id) && (!path || !activeFilePaths.has(path))) {
        staleRefs.push(d.ref);
      }
    });

    if (staleRefs.length > 0) {
      console.log(`🗑️ [Prune] Removing ${staleRefs.length} stale file doc(s) for project ${projectId}`);
      const chunkSize = 400;
      for (let i = 0; i < staleRefs.length; i += chunkSize) {
        const batch = adminDb.batch();
        staleRefs.slice(i, i + chunkSize).forEach(ref => batch.delete(ref));
        await batch.commit();
      }
    }
  } catch (pruneErr) {
    console.warn('File subcollection pruning notice:', pruneErr.message);
  }
};

// POST /api/projects/update-files: Persist working_files or master_project_files
router.post('/update-files', verifyToken, async (req, res) => {
  try {
    const {
      projectId,
      working_files,
      master_project_files,
      project_files,
      userEmail: bodyUserEmail,
      isOwner: claimedIsOwner,
      ownerEmail: bodyOwnerEmail,
      collaborators: bodyCollaborators,
      title,
      pendingFork
    } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required.' });
    }

    const membership = await requireProjectRole(req, res, projectId, 'EDITOR');
    if (!membership) return;

    // Identity and owner status come from the verified session, not client claims.
    const userEmail = (req.user?.email || bodyUserEmail || '').trim();
    const isOwner = membership.devFallback ? Boolean(claimedIsOwner) : membership.role === 'OWNER';
    const ownerEmail = membership.project?.ownerEmail || bodyOwnerEmail;
    const collaborators = membership.project?.collaborators || bodyCollaborators;

    const filesToPersist = dedupeFilesByPath((working_files && working_files.length > 0) ? working_files : (project_files || []));
    const timestamp = new Date().toISOString();
    const memProj = inMemoryProjectStore.get(projectId) || {};
    // pendingFork may only change via an explicit value in the request. Inferring it
    // from the in-memory cache overwrote the editor's direct Firestore write with a
    // stale flag, which made the fork banners twitch on both sides.
    const explicitPendingFork = pendingFork !== undefined ? Boolean(pendingFork) : null;

    const updatedProj = {
      ...memProj,
      projectId,
      title: title || memProj.title || 'Project',
      ownerEmail: ownerEmail || memProj.ownerEmail || (isOwner ? userEmail : 'developer@obsidian.io'),
      collaborators: collaborators || memProj.collaborators || {},
      working_files: filesToPersist,
      ...(explicitPendingFork !== null ? { pendingFork: explicitPendingFork } : {}),
      ...(isOwner || (!memProj.master_project_files && master_project_files) ? {
        master_project_files: master_project_files || filesToPersist,
        project_files: master_project_files || filesToPersist
      } : {}),
      updatedAt: timestamp,
      lastWorkingModifiedBy: userEmail || memProj.lastWorkingModifiedBy || 'developer@obsidian.io',
      lastModifiedBy: userEmail || memProj.lastModifiedBy
    };
    inMemoryProjectStore.set(projectId, updatedProj);

    if (adminDb) {
      try {
        const projRef = adminDb.collection('projects').doc(projectId);
        // Preserve full contents for normal projects (< 800 KB); strip only if payload exceeds 800 KB to avoid 1 MiB limit
        const safeServerFilesPayload = (fileArray = []) => {
          try {
            if (JSON.stringify(fileArray).length < 800000) return fileArray;
          } catch (e) {}
          return fileArray.map(({ content, ...rest }) => ({ ...rest, _manifestOnly: true }));
        };

        const payloadWorking = safeServerFilesPayload(filesToPersist || []);
        const payloadMaster = safeServerFilesPayload(master_project_files || filesToPersist || []);

        const payload = {
          working_files: payloadWorking,
          ...(explicitPendingFork !== null ? { pendingFork: explicitPendingFork } : {}),
          ...(isOwner || (!memProj.master_project_files && master_project_files) ? {
            master_project_files: payloadMaster,
            project_files: payloadMaster
          } : {}),
          updatedAt: timestamp,
          lastWorkingModifiedBy: userEmail || 'developer@obsidian.io',
          lastModifiedBy: userEmail || 'developer@obsidian.io'
        };
        await projRef.set(payload, { merge: true });

        // Update individual file docs safely with FULL content in chunks of 400
        const chunkSize = 400;
        for (let i = 0; i < filesToPersist.length; i += chunkSize) {
          const chunk = filesToPersist.slice(i, i + chunkSize);
          const batch = adminDb.batch();
          for (const f of chunk) {
            if (f && (f.fileId || f.filePath)) {
              const fileDocId = f.fileId || `file_${projectId}_${f.filePath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
              const fileRef = projRef.collection('files').doc(fileDocId);
              batch.set(fileRef, {
                fileId: fileDocId,
                projectId,
                filePath: f.filePath || '',
                fileName: f.fileName || (f.filePath ? f.filePath.split('/').pop() : 'file'),
                content: f.content || '',
                fileType: f.fileType || 'plaintext',
                isBinary: Boolean(f.isBinary),
                size: Number(f.size || (f.content ? f.content.length : 0)),
                updatedAt: timestamp,
                lastModifiedBy: userEmail || 'developer@obsidian.io'
              }, { merge: true });
            }
          }
          await batch.commit();
        }

        // Remove subcollection docs that are no longer in the active working set
        // (deleted files/folders must stay deleted, not resurrect on next hydration)
        await pruneStaleFileDocs(projRef, projectId, filesToPersist);
      } catch (dbErr) {
        console.warn('AdminDB update-files notice:', dbErr.message);
      }
    }

    res.json({
      status: 'SUCCESS',
      message: 'Project files updated successfully.',
      projectId,
      filesCount: filesToPersist.length
    });
  } catch (error) {
    console.error('Error updating project files:', error);
    res.status(500).json({ error: 'Failed to update files', details: error.message });
  }
});

// POST /api/projects/sync-master: Save master repository baseline directly
router.post('/sync-master', verifyToken, async (req, res) => {
  try {
    const { projectId, working_files, ownerEmail: bodyOwnerEmail } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required.' });
    }

    const membership = await requireProjectRole(req, res, projectId, 'OWNER');
    if (!membership) return;
    const ownerEmail = req.user?.email || bodyOwnerEmail;

    const timestamp = new Date().toISOString();
    const files = dedupeFilesByPath(working_files || []);

    const memProj = inMemoryProjectStore.get(projectId) || {};
    inMemoryProjectStore.set(projectId, {
      ...memProj,
      projectId,
      master_project_files: files,
      project_files: files,
      working_files: files,
      pending_patches: [],
      pendingFork: false,
      lastWorkingModifiedBy: ownerEmail || 'owner@obsidian.io',
      masterLastSyncedAt: timestamp,
      masterLastSyncedBy: ownerEmail,
      updatedAt: timestamp
    });

    if (adminDb) {
      try {
        const safeServerFilesPayload = (fileArray = []) => {
          try {
            if (JSON.stringify(fileArray).length < 800000) return fileArray;
          } catch (e) {}
          return fileArray.map(({ content, ...rest }) => ({ ...rest, _manifestOnly: true }));
        };

        const payloadFiles = safeServerFilesPayload(files);
        const projRef = adminDb.collection('projects').doc(projectId);
        await projRef.set({
          master_project_files: payloadFiles,
          project_files: payloadFiles,
          working_files: payloadFiles,
          pending_patches: [],
          pendingFork: false,
          lastWorkingModifiedBy: ownerEmail || 'owner@obsidian.io',
          masterLastSyncedAt: timestamp,
          masterLastSyncedBy: ownerEmail,
          updatedAt: timestamp
        }, { merge: true });

        // Update files subcollection with FULL content in chunks of 400
        const chunkSize = 400;
        for (let i = 0; i < files.length; i += chunkSize) {
          const chunk = files.slice(i, i + chunkSize);
          const batch = adminDb.batch();
          for (const f of chunk) {
            if (f && (f.fileId || f.filePath)) {
              const fileDocId = f.fileId || `file_${projectId}_${f.filePath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
              const fileRef = projRef.collection('files').doc(fileDocId);
              batch.set(fileRef, {
                fileId: fileDocId,
                projectId,
                filePath: f.filePath || '',
                fileName: f.fileName || (f.filePath ? f.filePath.split('/').pop() : 'file'),
                content: f.content || '',
                fileType: f.fileType || 'plaintext',
                isBinary: Boolean(f.isBinary),
                size: Number(f.size || (f.content ? f.content.length : 0)),
                updatedAt: timestamp,
                lastModifiedBy: ownerEmail || 'owner@obsidian.io'
              }, { merge: true });
            }
          }
          await batch.commit();
        }

        // Remove subcollection docs that were deleted in the accepted fork so the
        // merge is fully applied on the first try (no stale docs to resurrect)
        await pruneStaleFileDocs(projRef, projectId, files);
      } catch (dbErr) {
        console.warn('AdminDB sync-master notice:', dbErr.message);
      }
    }

    res.json({
      status: 'SUCCESS',
      message: 'Master repository synced successfully.',
      projectId,
      master_project_files: files,
      filesCount: files.length,
      syncedAt: timestamp
    });
  } catch (error) {
    console.error('Error in sync-master:', error);
    res.status(500).json({ error: 'Failed to sync master', details: error.message });
  }
});

// POST /api/projects/save-and-sync: Save & Sync staging patch submission
// Supports all modification types: MODIFY_FILE, CREATE_FILE, DELETE_FILE, RENAME_FILE, MOVE_ITEM, IMPORT_BATCH
router.post('/save-and-sync', verifyToken, async (req, res) => {
  try {
    const { 
      projectId, 
      fileId, 
      filePath, 
      content, 
      userEmail, 
      userName, 
      summaryNote, 
      oldContent,
      type = 'MODIFY_FILE',
      oldPath,
      newPath,
      importedFiles = []
    } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }
    const pid = projectId;
    const author = req.user?.email || userEmail || 'developer@obsidian.io';
    const authorName = userName || author.split('@')[0];

    const patchObj = {
      patchId: `patch-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: type || 'MODIFY_FILE',
      fileId: fileId || `file_${Date.now()}`,
      filePath: filePath || (importedFiles.length > 0 ? `${importedFiles.length} file(s) batch` : 'src/main.rs'),
      oldPath: oldPath || null,
      newPath: newPath || null,
      authorEmail: author,
      authorName,
      submittedAt: new Date().toISOString(),
      summaryNote: summaryNote || (type === 'IMPORT_BATCH' ? `Import of ${importedFiles.length} file(s)` : 'Code modification submitted for Owner review'),
      diffPayload: {
        removed: oldContent || '',
        added: content || (importedFiles.length > 0 ? `${importedFiles.length} imported files` : '')
      },
      fullProposedContent: content || '',
      importedFiles: importedFiles || [],
      status: 'PENDING'
    };

    let updatedPatches = [patchObj];

    try {
      if (adminDb) {
        const projRef = adminDb.collection('projects').doc(pid);
        await adminDb.runTransaction(async (t) => {
          const snap = await t.get(projRef);
          if (snap.exists) {
            const existingData = snap.data();
            const existingPatches = existingData.pending_patches || [];
            const filtered = existingPatches.filter(p => !(p.fileId === patchObj.fileId && p.authorEmail === author && p.type === patchObj.type));
            updatedPatches = [patchObj, ...filtered];

            t.set(projRef, {
              pending_patches: updatedPatches
            }, { merge: true });
          } else {
            t.set(projRef, {
              projectId: pid,
              pending_patches: updatedPatches
            }, { merge: true });
          }
        });
      }
    } catch (dbErr) {
      console.warn("Save and sync Admin Firestore transaction notice:", dbErr.message);
    }

    res.json({
      status: 'SUCCESS',
      message: 'Proposal staged in Review Drawer for Owner approval.',
      patch: patchObj,
      pendingPatchesCount: updatedPatches.length
    });
  } catch (error) {
    console.error('Error staging save-and-sync patch:', error);
    res.status(500).json({ error: 'Failed to stage code modification', details: error.message });
  }
});

// POST /api/projects/resolve-patch: Approve or Reject a staging patch (Owner trigger)
router.post('/resolve-patch', verifyToken, async (req, res) => {
  try {
    const { projectId, patchId, action } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }
    const pid = projectId;

    const membership = await requireProjectRole(req, res, pid, 'OWNER');
    if (!membership) return;

    const isApprove = action === 'APPROVE';

    let updatedFiles = [];
    let updatedPatches = [];
    let targetPatch = null;

    try {
      if (adminDb) {
        const projRef = adminDb.collection('projects').doc(pid);
        await adminDb.runTransaction(async (t) => {
          const snap = await t.get(projRef);
          if (snap.exists) {
            const projData = snap.data();
            let files = projData.project_files || [];
            const patches = projData.pending_patches || [];

            targetPatch = patches.find(p => p.patchId === patchId);
            updatedPatches = patches.filter(p => p.patchId !== patchId);

            if (isApprove && targetPatch) {
              const pType = targetPatch.type || 'MODIFY_FILE';

              if (pType === 'CREATE_FILE') {
                const newFile = {
                  fileId: targetPatch.fileId || `file_${Date.now()}`,
                  filePath: targetPatch.filePath,
                  fileName: targetPatch.filePath.split('/').pop(),
                  content: targetPatch.fullProposedContent || '',
                  updatedAt: new Date().toISOString(),
                  lastModifiedBy: targetPatch.authorEmail
                };
                files = [...files.filter(f => f.filePath !== newFile.filePath), newFile];
              } else if (pType === 'DELETE_FILE') {
                files = files.filter(f => f.fileId !== targetPatch.fileId && f.filePath !== targetPatch.filePath);
              } else if (pType === 'RENAME_FILE' || pType === 'MOVE_ITEM') {
                const oldP = targetPatch.oldPath || targetPatch.filePath;
                const newP = targetPatch.newPath;
                if (newP) {
                  files = files.map(f => {
                    if (f.filePath === oldP) {
                      return { ...f, filePath: newP, fileName: newP.split('/').pop(), updatedAt: new Date().toISOString() };
                    } else if (f.filePath.startsWith(oldP + '/')) {
                      const suffix = f.filePath.slice(oldP.length);
                      const updatedPath = `${newP}${suffix}`;
                      return { ...f, filePath: updatedPath, fileName: updatedPath.split('/').pop(), updatedAt: new Date().toISOString() };
                    }
                    return f;
                  });
                }
              } else if (pType === 'IMPORT_BATCH') {
                const incoming = targetPatch.importedFiles || [];
                const incomingPaths = new Set(incoming.map(f => f.filePath));
                const filteredExisting = files.filter(f => !incomingPaths.has(f.filePath));
                files = [...filteredExisting, ...incoming];
              } else {
                // Default: MODIFY_FILE
                let matched = false;
                files = files.map(f => {
                  if (f.fileId === targetPatch.fileId || f.filePath === targetPatch.filePath) {
                    matched = true;
                    return {
                      ...f,
                      content: targetPatch.fullProposedContent,
                      lastModifiedBy: targetPatch.authorEmail,
                      updatedAt: new Date().toISOString()
                    };
                  }
                  return f;
                });
                if (!matched) {
                  files.push({
                    fileId: targetPatch.fileId || `file_${Date.now()}`,
                    filePath: targetPatch.filePath,
                    fileName: targetPatch.filePath.split('/').pop(),
                    content: targetPatch.fullProposedContent || '',
                    lastModifiedBy: targetPatch.authorEmail,
                    updatedAt: new Date().toISOString()
                  });
                }
              }

              updatedFiles = files;
              t.set(projRef, {
                project_files: updatedFiles,
                pending_patches: updatedPatches,
                updatedAt: new Date().toISOString()
              }, { merge: true });
            } else {
              t.set(projRef, {
                pending_patches: updatedPatches
              }, { merge: true });
            }
          }
        });
      }
    } catch (dbErr) {
      console.warn("Resolve patch Admin Firestore transaction notice:", dbErr.message);
    }

    res.json({
      status: 'SUCCESS',
      action: isApprove ? 'APPROVED' : 'REJECTED',
      message: isApprove 
        ? `Patch '${patchId}' approved and merged to master project_files!` 
        : `Patch '${patchId}' rejected and removed from staging queue.`,
      remainingPatchesCount: updatedPatches.length,
      mergedFilesCount: updatedFiles.length
    });
  } catch (error) {
    console.error('Error resolving patch:', error);
    res.status(500).json({ error: 'Failed to resolve patch', details: error.message });
  }
});

// POST /api/projects/:id/invite: Add collaborator to project
// NOTE: Dynamic param routes MUST come AFTER static routes (save-and-sync, resolve-patch)
router.post('/:id/invite', verifyToken, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { email, role = 'EDITOR', projectTitle: reqTitle } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Collaborator email is required.' });
    }

    // Only the project owner may issue invitations.
    const membership = await requireProjectRole(req, res, projectId, 'OWNER');
    if (!membership) return;

    // Invitations can never grant OWNER or target the owner themselves.
    const safeRole = String(role || 'EDITOR').toUpperCase() === 'VIEWER' ? 'VIEWER' : 'EDITOR';
    const ownerEmail = (req.user?.email || '').trim().toLowerCase();
    if ((email || '').trim().toLowerCase() === ownerEmail) {
      return res.status(400).json({ error: 'The project owner cannot be invited as a collaborator.' });
    }

    let updatedCollaborators = { [email]: safeRole };
    let projectTitle = reqTitle || projectId;

    if (adminDb) {
      try {
        const projectDocRef = adminDb.collection('projects').doc(projectId);
        const projectSnap = await projectDocRef.get();

        if (projectSnap.exists) {
          const projectData = projectSnap.data();
          projectTitle = reqTitle || projectData.title || projectTitle;
          updatedCollaborators = {
            ...projectData.collaborators,
            [email]: safeRole
          };

          await projectDocRef.update({
            collaborators: updatedCollaborators,
            updatedAt: new Date().toISOString()
          });

          // Add copy/reference of project to collaborator's user document (Requirement 2 Fix)
          try {
            const collabDocId = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
            const userRef = adminDb.collection('users').doc(collabDocId);
            await userRef.set({
              projects: {
                [projectId]: {
                  projectId,
                  title: projectTitle,
                  languageEnv: projectData.languageEnv || 'PYTHON_3.11',
                  userRole: safeRole,
                  ownerEmail: projectData.ownerEmail || ownerEmail,
                  updatedAt: new Date().toISOString()
                }
              }
            }, { merge: true });
          } catch (collabErr) {
            console.warn("Notice updating collaborator profile doc:", collabErr.message);
          }
        }
      } catch (dbErr) {
        console.warn("Admin Firestore invite lookup notice:", dbErr.message);
      }
    }

    if (inMemoryProjectStore.has(projectId)) {
      const p = inMemoryProjectStore.get(projectId);
      if (!p.collaborators) p.collaborators = {};
      p.collaborators[email] = safeRole;
      projectTitle = reqTitle || p.title || projectTitle;
    }

    const domain = resolveAppDomain(req);
    const fullInviteUrl = `${domain}/invite/${projectId}?role=${safeRole}&email=${encodeURIComponent(email)}&title=${encodeURIComponent(projectTitle)}&owner=${encodeURIComponent(ownerEmail)}`;

    // Anti-spam deliverability email dispatch (Guaranteed to execute)
    let emailResult = null;
    try {
      emailResult = await sendProjectInvitationEmail({
        to: email,
        ownerEmail,
        projectTitle,
        projectId,
        role: safeRole,
        inviteUrl: fullInviteUrl
      });
      console.log(`✉️ Invite endpoint email result for ${email}:`, emailResult);
    } catch (mailErr) {
      console.warn("Notice dispatching invite email:", mailErr.message);
    }

    res.json({
      status: 'SUCCESS',
      message: `Collaborator ${email} added as ${safeRole}. Invitation email dispatched.`,
      emailDispatched: emailResult?.success ?? true,
      inviteUrl: fullInviteUrl,
      collaborators: updatedCollaborators
    });
  } catch (error) {
    console.error('Error inviting collaborator:', error);
    res.status(500).json({ error: 'Failed to send invitation', details: error.message });
  }
});





// POST /api/projects/reject-fork: Project Owner declines collaborator working fork changes and restores Master baseline
router.post('/reject-fork', verifyToken, async (req, res) => {
  try {
    const { projectId, ownerEmail: bodyOwnerEmail, reason = 'Fork changes declined by Project Owner' } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const membership = await requireProjectRole(req, res, projectId, 'OWNER');
    if (!membership) return;
    const ownerEmail = req.user?.email || bodyOwnerEmail;

    const timestamp = new Date().toISOString();
    let masterFiles = [];

    // 1. Retrieve canonical master baseline
    if (adminDb) {
      const projRef = adminDb.collection('projects').doc(projectId);
      const snap = await projRef.get();
      if (snap.exists) {
        const data = snap.data();
        masterFiles = data.master_project_files || data.project_files || [];
      }
    }

    if ((!masterFiles || masterFiles.length === 0) && inMemoryProjectStore.has(projectId)) {
      const existing = inMemoryProjectStore.get(projectId);
      masterFiles = existing.master_project_files || existing.project_files || [];
    }

    // 2. Reset working_files and project_files back to canonical master_project_files
    if (inMemoryProjectStore.has(projectId)) {
      const existing = inMemoryProjectStore.get(projectId);
      existing.working_files = masterFiles;
      existing.project_files = masterFiles;
      existing.pending_patches = [];
      existing.lastForkRejectedAt = timestamp;
      existing.lastForkRejectedBy = ownerEmail || 'owner@obsidian.io';
      existing.updatedAt = timestamp;
    }

    if (adminDb) {
      const projRef = adminDb.collection('projects').doc(projectId);
      await projRef.set({
        working_files: masterFiles,
        project_files: masterFiles,
        pending_patches: [],
        lastForkRejectedAt: timestamp,
        lastForkRejectedBy: ownerEmail || 'owner@obsidian.io',
        updatedAt: timestamp
      }, { merge: true });

      // Reconcile files subcollection
      try {
        const filesSubRef = projRef.collection('files');
        const existingDocs = await filesSubRef.get();
        const batch = adminDb.batch();
        existingDocs.docs.forEach(docSnap => batch.delete(docSnap.ref));
        for (const f of masterFiles) {
          if (f && (f.fileId || f.filePath)) {
            const docId = f.fileId || `file_${projectId}_${f.filePath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
            const newDocRef = filesSubRef.doc(docId);
            batch.set(newDocRef, {
              ...f,
              fileId: docId,
              projectId,
              updatedAt: timestamp
            });
          }
        }
        await batch.commit();
      } catch (subErr) {
        console.warn('Subcollection reconciliation notice:', subErr.message);
      }
    }

    res.json({
      status: 'SUCCESS',
      message: 'Fork request successfully rejected. Shared working copy restored to Master baseline.',
      master_project_files: masterFiles,
      working_files: masterFiles,
      rejectedAt: timestamp,
      reason
    });
  } catch (err) {
    console.error('Error rejecting fork request:', err);
    res.status(500).json({ error: 'Failed to reject fork request', details: err.message });
  }
});

// GET /api/projects/:projectId: Retrieve project details, project_files, and pending_patches
router.get('/:projectId', verifyTokenOptional, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { isInvite } = req.query;

    let projData = null;

    try {
      if (adminDb) {
        const projRef = adminDb.collection('projects').doc(projectId);
        const snap = await projRef.get();
        if (snap.exists) {
          projData = snap.data();

          // Hydrate full file contents from subcollection if files exist or are manifests
          try {
            const filesSnap = await projRef.collection('files').get();
            if (!filesSnap.empty) {
              const subFilesMap = new Map();
              filesSnap.forEach(d => {
                const fd = d.data();
                if (fd && (fd.filePath || fd.fileName)) {
                  subFilesMap.set(fd.filePath || fd.fileName, fd);
                }
              });

              // Hydrate working_files
              if (Array.isArray(projData.working_files) && projData.working_files.length > 0) {
                projData.working_files = projData.working_files.map(wf => {
                  const sub = subFilesMap.get(wf.filePath || wf.fileName);
                  return sub ? { ...wf, content: sub.content !== undefined ? sub.content : (wf.content || ''), _manifestOnly: undefined } : wf;
                });
              } else if (subFilesMap.size > 0) {
                projData.working_files = Array.from(subFilesMap.values());
              }

              // Hydrate master_project_files
              if (Array.isArray(projData.master_project_files) && projData.master_project_files.length > 0) {
                projData.master_project_files = projData.master_project_files.map(mf => {
                  const sub = subFilesMap.get(mf.filePath || mf.fileName);
                  return sub ? { ...mf, content: sub.content !== undefined ? sub.content : (mf.content || ''), _manifestOnly: undefined } : mf;
                });
              } else if (subFilesMap.size > 0) {
                projData.master_project_files = projData.working_files;
              }

              // Hydrate project_files
              if (Array.isArray(projData.project_files) && projData.project_files.length > 0) {
                projData.project_files = projData.project_files.map(pf => {
                  const sub = subFilesMap.get(pf.filePath || pf.fileName);
                  return sub ? { ...pf, content: sub.content !== undefined ? sub.content : (pf.content || ''), _manifestOnly: undefined } : pf;
                });
              } else if (subFilesMap.size > 0) {
                projData.project_files = projData.master_project_files;
              }
            }
          } catch (subErr) {
            console.warn("Project Admin subcollection files hydration notice:", subErr.message);
          }
        }
      }
    } catch (e) {
      console.warn("Project Admin getDoc notice:", e.message);
    }

    if (!projData && inMemoryProjectStore.has(projectId)) {
      projData = inMemoryProjectStore.get(projectId);
    }

    if (!projData) {
      return res.status(404).json({
        status: 'NOT_FOUND',
        isAuthorized: false,
        error: `Project '${projectId}' was not found in the backend repository.`
      });
    }

    // Invitation Preview Bypass: Allow unauthenticated visitors to inspect public repository metadata
    if (isInvite === 'true') {
      return res.json({
        status: 'SUCCESS',
        isAuthorized: true,
        isInvitePreview: true,
        project: {
          projectId: projData.projectId || projectId,
          title: projData.title || projectId,
          description: projData.description || '',
          ownerEmail: projData.ownerEmail || 'Project Owner',
          languageEnv: projData.languageEnv || 'PYTHON_3.11',
          rosterEmails: Object.keys(projData.collaborators || {}).map(k => String(k).trim().toLowerCase())
        }
      });
    }

    // Full project data requires a verified identity.
    if (!req.user?.email) {
      return res.status(401).json({
        status: 'UNAUTHORIZED',
        isAuthorized: false,
        error: 'Authentication required. Please sign in again.'
      });
    }
    const requestingEmail = req.user.email.trim().toLowerCase();

    // Strict Authorization Guard: allow owner by ownerEmail OR by OWNER role in collaborators map
    // The collaborators-map OWNER check handles legacy data where ownerEmail may differ from actual owner
    let resolvedRole = 'EDITOR';
    if (requestingEmail) {
      const ownerEmailNorm = (projData.ownerEmail || '').toLowerCase().trim();
      const collabsLower = {};
      Object.entries(projData.collaborators || {}).forEach(([k, v]) => {
        collabsLower[k.toLowerCase().trim()] = typeof v === 'string' ? v.toUpperCase() : (v?.role || 'EDITOR').toUpperCase();
      });

      const isOwnerByEmail = Boolean(ownerEmailNorm && ownerEmailNorm === requestingEmail);
      const isOwnerByRole = collabsLower[requestingEmail] === 'OWNER';
      const isCollab = Boolean(collabsLower[requestingEmail]);

      if (isOwnerByEmail || isOwnerByRole) {
        resolvedRole = 'OWNER';
      } else if (isCollab) {
        resolvedRole = collabsLower[requestingEmail] || 'EDITOR';
      } else {
        return res.status(403).json({
          status: 'UNAUTHORIZED',
          isAuthorized: false,
          error: `Access Denied: Your account email (${requestingEmail}) is not authorized to access repository '${projectId}'. Contact the project owner (${projData.ownerEmail || 'administrator'}) to request access.`,
          ownerEmail: projData.ownerEmail
        });
      }
    }

    res.json({
      status: 'SUCCESS',
      isAuthorized: true,
      userRole: resolvedRole,
      project: {
        ...projData,
        userRole: resolvedRole
      }
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project', details: error.message });
  }
});

// POST /api/projects/send-invite-email: Direct trigger for invitation email dispatch
router.post('/send-invite-email', verifyToken, async (req, res) => {
  try {
    const { to, projectTitle, projectId, role = 'REVIEWER' } = req.body;
    if (!to || !projectId) {
      return res.status(400).json({ error: 'Missing required invitation payload fields.' });
    }

    const membership = await requireProjectRole(req, res, projectId, 'OWNER');
    if (!membership) return;

    const cleanTitle = projectTitle || projectId;
    const cleanOwner = (req.user?.email || '').trim().toLowerCase();
    const domain = resolveAppDomain(req);
    const inviteUrl = `${domain}/invite/${projectId}?role=${role}&email=${encodeURIComponent(to)}&title=${encodeURIComponent(cleanTitle)}&owner=${encodeURIComponent(cleanOwner)}`;

    const result = await sendProjectInvitationEmail({
      to,
      ownerEmail: cleanOwner,
      projectTitle: cleanTitle,
      projectId,
      role,
      inviteUrl
    });

    res.json({
      status: 'SUCCESS',
      message: `Invitation email dispatched to ${to}`,
      inviteUrl,
      result
    });
  } catch (error) {
    console.error('Error dispatching direct invite email:', error);
    res.status(500).json({ error: 'Failed to dispatch email', details: error.message });
  }
});

// POST /api/projects/:projectId/accept-invite: Verified invitee finalizes joining a project.
// Server-side replacement for client Firestore writes during invite acceptance.
router.post('/:projectId/accept-invite', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userEmail = (req.user?.email || '').trim().toLowerCase();

    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required. Please sign in again.' });
    }

    let membership = await getProjectMembership(projectId, userEmail);

    if (membership?.role === 'OWNER') {
      return res.json({ status: 'SUCCESS', message: 'User is the repository owner.', role: 'OWNER' });
    }

    // Only callers already placed on the roster by the owner may accept.
    if (!membership) {
      if (adminDb) {
        return res.status(403).json({ error: 'You are not on this project\'s invitation roster.' });
      }
      // Local dev without Firestore: roster cannot be verified, accept at the
      // advertised role (never OWNER).
      const requestedRole = String(req.body?.role || 'EDITOR').toUpperCase();
      membership = { project: null, role: requestedRole === 'OWNER' ? 'EDITOR' : requestedRole };
    }

    const role = membership.role || 'EDITOR';
    const project = membership.project || {};
    const timestamp = new Date().toISOString();

    if (inMemoryProjectStore.has(projectId)) {
      const proj = inMemoryProjectStore.get(projectId);
      proj.collaborators = proj.collaborators || {};
      proj.collaborators[userEmail] = role;
      const allCollabs = Object.keys(proj.collaborators).map(e => e.toLowerCase());
      const owner = (proj.ownerEmail || '').toLowerCase();
      proj.memberEmails = Array.from(new Set([owner, ...allCollabs].filter(Boolean)));
      proj.collaboratorEmails = allCollabs.filter(e => e !== owner);
      proj.rosterEmails = proj.memberEmails;
      proj.updatedAt = timestamp;
      persistStoreToDisk();
    }

    if (adminDb) {
      try {
        const projRef = adminDb.collection('projects').doc(projectId);
        await projRef.set({
          collaborators: {
            [userEmail]: role
          },
          memberEmails: FieldValue.arrayUnion(userEmail),
          collaboratorEmails: FieldValue.arrayUnion(userEmail),
          rosterEmails: FieldValue.arrayUnion(userEmail),
          updatedAt: timestamp
        }, { merge: true });

        const collabDocId = userEmail.split('@')[0].replace(/[^a-z0-9_]/g, '_');
        await adminDb.collection('users').doc(collabDocId).set({
          projects: {
            [projectId]: {
              projectId,
              title: project.title || projectId,
              description: project.description || '',
              languageEnv: project.languageEnv || 'PYTHON_3.11',
              userRole: role,
              ownerEmail: project.ownerEmail || '',
              updatedAt: timestamp
            }
          }
        }, { merge: true });
      } catch (e) {
        console.warn('AdminDB accept-invite notice:', e.message);
      }
    }

    res.json({
      status: 'SUCCESS',
      message: `Invitation accepted. You now have ${role} access.`,
      role,
      projectId
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ error: 'Failed to accept invitation', details: error.message });
  }
});

// POST /api/projects/reset-store: Wipe in-memory project store
router.post('/reset-store', verifyToken, (req, res) => {
  if (process.env.ENABLE_ADMIN_TOOLS !== 'true') {
    return res.status(403).json({ error: 'Administrative tools are disabled.' });
  }
  inMemoryProjectStore.clear();
  res.json({ status: 'SUCCESS', message: 'In-memory project store cleared.' });
});

export default router;
