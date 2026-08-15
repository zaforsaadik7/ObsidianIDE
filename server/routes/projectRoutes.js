import express from 'express';
import { adminDb } from '../config/firebaseAdmin.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { v4 as uuidv4 } from 'uuid';
import { sendProjectInvitationEmail } from '../utils/emailService.js';
import { syncToOwnerPersonalFirestore } from '../utils/personalDbSync.js';

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

// Synchronous In-Memory fallback cache for robust local development and fast testing
export const inMemoryProjectStore = new Map();

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

    const projectId = req.body.projectId || uuidv4();
    const timestamp = new Date().toISOString();

    // Normalize team members / collaborators input
    const normalizedCollabs = { [ownerEmail]: 'OWNER' };
    const rawMap = { ...collaborators, ...teamMembersInput };
    Object.entries(rawMap).forEach(([email, val]) => {
      const roleStr = typeof val === 'string' ? val : (val?.role || 'EDITOR');
      normalizedCollabs[email] = roleStr.toUpperCase();
    });

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

    const newProject = {
      projectId,
      ownerEmail,
      title,
      description: description ? String(description).trim().slice(0, 150) : '',
      languageEnv: languageEnv || 'RUST_1.75',
      collaborators: normalizedCollabs,
      project_files: initialFiles,
      working_files: initialFiles,
      master_project_files: initialFiles,
      pending_patches: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Cache in memory
    inMemoryProjectStore.set(projectId, newProject);

    // Automatic Anti-Spam Invitation Email Dispatch (Requirement 1 Fix)
    const emailDispatchLogs = [];
    const domain = resolveAppDomain(req);
    Object.entries(normalizedCollabs).forEach(([email, role]) => {
      if (role.toUpperCase() !== 'OWNER' || (email !== ownerEmail && Object.keys(normalizedCollabs).length > 1)) {
        const invitePath = `/invite/${projectId}?role=${role}&email=${encodeURIComponent(email)}`;
        const fullInviteUrl = `${domain}${invitePath}`;

        emailDispatchLogs.push({
          to: email,
          subject: `[ObsidianIDE] Invitation to Join Project Repository: ${title}`,
          role,
          inviteUrl: fullInviteUrl,
          dispatchedAt: timestamp
        });

        // Anti-spam deliverability email dispatch
        sendProjectInvitationEmail({
          to: email,
          ownerEmail,
          projectTitle: title,
          projectId,
          role,
          inviteUrl: fullInviteUrl
        }).then(res => {
          console.log(`✉️ Project creation email dispatch result for ${email}:`, res);
        }).catch(err => console.warn("Background email dispatch notice:", err));
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

    res.status(201).json({
      status: 'SUCCESS',
      message: 'Project repository initialized successfully. Invitation emails dispatched.',
      project: newProject,
      inviteLinks: emailDispatchLogs.reduce((acc, l) => { acc[l.to] = l.inviteUrl; return acc; }, {}),
      emailsDispatched: true,
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
    const { email } = req.query;

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

      const isOwner = (p.ownerEmail || '').toLowerCase() === emailNorm;
      const collabs = p.collaborators || {};
      const collabRole = collabs[emailNorm] || collabs[email];

      if (isOwner || collabRole) {
        const key = getCanonicalKey(p, pid);
        const existing = userProjectsMap.get(key) || {};
        const chosenPid = (p.projectId && String(p.projectId).startsWith('proj_')) 
          ? p.projectId 
          : (existing.projectId && String(existing.projectId).startsWith('proj_')) 
            ? existing.projectId 
            : pid;

        userProjectsMap.set(key, {
          ...existing,
          ...p,
          projectId: chosenPid,
          userRole: isOwner ? 'OWNER' : (collabRole || existing.userRole || 'EDITOR')
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

// POST /api/projects/update-files: Directly save project_files array to Firestore via Admin SDK
// ── Repository File & Staging Operations ──────────────────────────────────

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

    const pid = projectId || 'quantum-router-01';
    const author = userEmail || req.user?.email || 'developer@obsidian.io';
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
    const pid = projectId || 'quantum-router-01';
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
    const { email, role = 'EDITOR' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Collaborator email is required.' });
    }

    let updatedCollaborators = { [email]: role.toUpperCase() };

    if (adminDb) {
      const projectDocRef = adminDb.collection('projects').doc(projectId);
      const projectSnap = await projectDocRef.get();

      if (projectSnap.exists) {
        const projectData = projectSnap.data();
        updatedCollaborators = {
          ...projectData.collaborators,
          [email]: role.toUpperCase()
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
                title: projectData.title,
                languageEnv: projectData.languageEnv || 'RUST_1.75',
                userRole: role.toUpperCase(),
                ownerEmail: projectData.ownerEmail,
                updatedAt: new Date().toISOString()
              }
            }
          }, { merge: true });

          const domain = resolveAppDomain(req);
          const fullInviteUrl = `${domain}/invite/${projectId}?role=${role.toUpperCase()}&email=${encodeURIComponent(email)}`;

          // Record invitation email dispatch
          await projectDocRef.collection('invitation_outbox').add({
            to: email,
            subject: `[ObsidianIDE] Invitation to Join Project Repository: ${projectData.title}`,
            role: role.toUpperCase(),
            inviteUrl: fullInviteUrl,
            dispatchedAt: new Date().toISOString()
          });

          // Anti-spam deliverability email dispatch
          sendProjectInvitationEmail({
            to: email,
            ownerEmail: projectData.ownerEmail || 'Project Owner',
            projectTitle: projectData.title || 'Project Workspace',
            projectId,
            role: role.toUpperCase(),
            inviteUrl: fullInviteUrl
          }).catch(err => console.warn("Background email dispatch notice:", err));
        } catch (collabErr) {
          console.warn("Notice updating collaborator profile doc:", collabErr.message);
        }
      }
    }

    if (inMemoryProjectStore.has(projectId)) {
      const p = inMemoryProjectStore.get(projectId);
      if (!p.collaborators) p.collaborators = {};
      p.collaborators[email] = role.toUpperCase();
    }

    res.json({
      status: 'SUCCESS',
      message: `Collaborator ${email} added as ${role.toUpperCase()}. Invitation email dispatched.`,
      emailDispatched: true,
      collaborators: updatedCollaborators
    });
  } catch (error) {
    console.error('Error inviting collaborator:', error);
    res.status(500).json({ error: 'Failed to send invitation', details: error.message });
  }
});

// POST /api/projects/update-files: Batch update WORKING fork files only.
// CRITICAL: This endpoint MUST only update working_files. It must NEVER overwrite
// master_project_files or project_files, which serve as the canonical master baseline.
// Overwriting project_files would collapse the owner's diff view to 0 changes.
router.post('/update-files', async (req, res) => {
  try {
    const { projectId, project_files = [], working_files, userEmail, master_project_files: incomingMaster } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const filesToPersist = (working_files && working_files.length > 0) ? working_files : project_files;
    const timestamp = new Date().toISOString();

    // Resolve master baseline: prefer the incoming master from the client, then Firestore, never the working copy
    let resolvedMaster = (incomingMaster && incomingMaster.length > 0) ? incomingMaster : null;

    if (inMemoryProjectStore.has(projectId)) {
      const existing = inMemoryProjectStore.get(projectId);
      // STRICTLY update the working fork - NEVER overwrite master_project_files here
      existing.working_files = filesToPersist;
      existing.updatedAt = timestamp;
      existing.lastWorkingModifiedBy = userEmail || 'developer@obsidian.io';
    } else {
      let existingOwner = req.body.ownerEmail || null;
      let existingCollabs = req.body.collaborators || null;
      let existingMasterFromDb = null;

      if (adminDb) {
        try {
          const docSnap = await adminDb.collection('projects').doc(projectId).get();
          if (docSnap.exists) {
            const d = docSnap.data();
            existingOwner = d.ownerEmail || existingOwner;
            existingCollabs = d.collaborators || existingCollabs;
            // STRICTLY read existing master from master_project_files only
            if (d.master_project_files && d.master_project_files.length > 0) {
              existingMasterFromDb = d.master_project_files;
            }
          }
        } catch (e) {}
      }

      // Master baseline priority: Firestore master > incoming client master > full working files baseline
      const finalMaster = existingMasterFromDb || (incomingMaster && incomingMaster.length > 0 ? incomingMaster : null) || filesToPersist;

      inMemoryProjectStore.set(projectId, {
        projectId,
        title: req.body.title || 'Project',
        ownerEmail: existingOwner || userEmail || 'developer@obsidian.io',
        collaborators: existingCollabs || { [userEmail || 'developer@obsidian.io']: 'EDITOR' },
        project_files: finalMaster,  // project_files mirrors master baseline
        working_files: filesToPersist,
        master_project_files: finalMaster,
        updatedAt: timestamp,
        lastWorkingModifiedBy: userEmail || 'developer@obsidian.io'
      });
    }

    if (adminDb) {
      const projRef = adminDb.collection('projects').doc(projectId);

      // CRITICAL: Only write working_files to Firestore Admin.
      // DO NOT write master_project_files or project_files here.
      // Only the Owner's /api/projects/sync-master endpoint can commit to master.
      const updatePayload = {
        working_files: filesToPersist,
        updatedAt: timestamp,
        lastWorkingModifiedBy: userEmail || 'developer@obsidian.io',
        lastModifiedBy: userEmail || 'developer@obsidian.io'
      };

      await projRef.set(updatePayload, { merge: true });

      // Update individual file docs safely in chunks of 400 to avoid 500-limit error
      try {
        const chunkSize = 400;
        for (let i = 0; i < filesToPersist.length; i += chunkSize) {
          const chunk = filesToPersist.slice(i, i + chunkSize);
          const batch = adminDb.batch();
          for (const f of chunk) {
            if (f && f.fileId) {
              const fileRef = projRef.collection('files').doc(f.fileId);
              batch.set(fileRef, {
                fileId: f.fileId,
                projectId,
                filePath: f.filePath || '',
                fileName: f.fileName || (f.filePath ? f.filePath.split('/').pop() : 'file'),
                content: f.content || '',
                fileType: f.fileType || 'plaintext',
                updatedAt: timestamp,
                lastModifiedBy: userEmail || 'developer@obsidian.io'
              }, { merge: true });
            }
          }
          await batch.commit();
        }
      } catch (batchErr) {
        console.warn('Notice saving individual file subcollection docs:', batchErr.message);
      }
    }

    // Sync exclusively to Owner's Personal Firebase Database
    const resolvedOwnerEmail = (req.body.ownerEmail || inMemoryProjectStore.get(projectId)?.ownerEmail || userEmail || '').trim().toLowerCase();
    try {
      await syncToOwnerPersonalFirestore({
        ownerEmail: resolvedOwnerEmail,
        projectId,
        projectTitle: req.body.title || inMemoryProjectStore.get(projectId)?.title || projectId,
        files: filesToPersist,
        isMasterSync: false,
        modifiedBy: userEmail
      });
    } catch (syncErr) {
      console.warn('Notice syncing working files to owner personal Firestore:', syncErr.message);
    }

    res.json({
      status: 'SUCCESS',
      message: `Updated ${filesToPersist.length} working file(s) in repository fork.`,
      projectId,
      timestamp
    });
  } catch (err) {
    console.error('Error updating project files:', err);
    res.status(500).json({ error: 'Failed to update project files', details: err.message });
  }
});

// POST /api/projects/sync-master: Commit current working/fork files to canonical Master Repository (Owner only)
router.post('/sync-master', verifyToken, async (req, res) => {
  try {
    const { projectId, working_files = [], ownerEmail } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const timestamp = new Date().toISOString();

    if (inMemoryProjectStore.has(projectId)) {
      const existing = inMemoryProjectStore.get(projectId);
      existing.master_project_files = working_files;
      existing.project_files = working_files;
      existing.working_files = working_files;
      existing.pending_patches = [];
      existing.masterLastSyncedAt = timestamp;
      existing.masterLastSyncedBy = ownerEmail || 'owner@obsidian.io';
      existing.updatedAt = timestamp;
    }

    if (adminDb) {
      const projRef = adminDb.collection('projects').doc(projectId);
      await projRef.set({
        masterLastSyncedAt: timestamp,
        masterLastSyncedBy: ownerEmail || 'owner@obsidian.io',
        updatedAt: timestamp
      }, { merge: true });
    }

    // Sync canonical master baseline exclusively to Owner's Personal Firebase Database
    const resolvedOwnerEmail = (ownerEmail || inMemoryProjectStore.get(projectId)?.ownerEmail || 'owner@obsidian.io').trim().toLowerCase();
    try {
      await syncToOwnerPersonalFirestore({
        ownerEmail: resolvedOwnerEmail,
        projectId,
        projectTitle: inMemoryProjectStore.get(projectId)?.title || projectId,
        files: working_files,
        isMasterSync: true,
        modifiedBy: ownerEmail
      });
    } catch (syncErr) {
      console.warn('Notice syncing master files to owner personal Firestore:', syncErr.message);
    }

    res.json({
      status: 'SUCCESS',
      message: `Successfully synchronized ${working_files.length} file(s) into Master Project Repository!`,
      master_project_files: working_files,
      syncedAt: timestamp
    });
  } catch (err) {
    console.error('Error syncing master project files:', err);
    res.status(500).json({ error: 'Failed to sync master repository', details: err.message });
  }
});

// GET /api/projects/:projectId: Retrieve project details, project_files, and pending_patches
router.get('/:projectId', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { userEmail } = req.query;
    const requestingEmail = (userEmail || req.user?.email || '').trim().toLowerCase();

    let projData = null;

    try {
      if (adminDb) {
        const projRef = adminDb.collection('projects').doc(projectId);
        const snap = await projRef.get();
        if (snap.exists) {
          projData = snap.data();
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

    // Strict Authorization Guard: allow owner by ownerEmail OR by OWNER role in collaborators map
    // The collaborators-map OWNER check handles legacy data where ownerEmail may differ from actual owner
    if (requestingEmail) {
      const ownerEmailNorm = (projData.ownerEmail || '').toLowerCase();
      const collabsLower = {};
      Object.entries(projData.collaborators || {}).forEach(([k, v]) => {
        collabsLower[k.toLowerCase()] = typeof v === 'string' ? v.toUpperCase() : (v?.role || 'EDITOR').toUpperCase();
      });

      const isOwnerByEmail = ownerEmailNorm === requestingEmail;
      const isOwnerByRole = collabsLower[requestingEmail] === 'OWNER';
      const isCollab = Boolean(collabsLower[requestingEmail]);

      if (!isOwnerByEmail && !isOwnerByRole && !isCollab) {
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
      project: projData
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project', details: error.message });
  }
});

// POST /api/projects/send-invite-email: Direct trigger for invitation email dispatch
router.post('/send-invite-email', async (req, res) => {
  try {
    const { to, ownerEmail, projectTitle, projectId, role = 'REVIEWER' } = req.body;
    if (!to || !projectTitle || !projectId) {
      return res.status(400).json({ error: 'Missing required invitation payload fields.' });
    }

    const domain = resolveAppDomain(req);
    const inviteUrl = `${domain}/invite/${projectId}?role=${role}&email=${encodeURIComponent(to)}`;

    const result = await sendProjectInvitationEmail({
      to,
      ownerEmail: ownerEmail || 'owner@obsidian.io',
      projectTitle,
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

// DELETE /api/projects/:projectId: Delete project from owner & collaborator repositories
router.delete('/:projectId', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { userEmail } = req.query;

    if (inMemoryProjectStore.has(projectId)) {
      inMemoryProjectStore.delete(projectId);
    }

    if (adminDb) {
      const projRef = adminDb.collection('projects').doc(projectId);
      const projSnap = await projRef.get();
      if (projSnap.exists) {
        const data = projSnap.data();
        const collabs = Object.keys(data.collaborators || {});
        for (const email of collabs) {
          const userDocId = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
          try {
            const userRef = adminDb.collection('users').doc(userDocId);
            await userRef.set({
              projects: {
                [projectId]: adminDb.FieldValue ? adminDb.FieldValue.delete() : null
              }
            }, { merge: true });
          } catch (e) {}
        }
        await projRef.delete();
      }
    }

    res.json({
      status: 'SUCCESS',
      message: `Project ${projectId} deleted.`
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project from user database', details: error.message });
  }
});

// POST /api/projects/reset-store: Wipe in-memory project store
router.post('/reset-store', (req, res) => {
  inMemoryProjectStore.clear();
  res.json({ status: 'SUCCESS', message: 'In-memory project store cleared.' });
});

export default router;
