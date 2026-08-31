import { adminDb } from '../config/firebaseAdmin.js';
import { inMemoryProjectStore } from '../routes/projectRoutes.js';

const norm = (v) => String(v || '').trim().toLowerCase();

const ROLE_LEVEL = { OWNER: 3, EDITOR: 2, VIEWER: 1 };

// Resolves the caller's membership in a project.
// Returns { project, role } or null when no membership (or project) is found.
export const getProjectMembership = async (projectId, email) => {
  const pid = String(projectId || '').trim();
  const caller = norm(email);
  if (!pid || !caller) return null;

  let project = inMemoryProjectStore.get(pid) || null;

  if (!project && adminDb) {
    try {
      const snap = await adminDb.collection('projects').doc(pid).get();
      if (snap.exists) {
        project = snap.data();
        inMemoryProjectStore.set(pid, project);
      }
    } catch (e) {
      console.warn('Membership lookup warning:', e.message);
    }
  }

  if (!project) return null;

  if (norm(project.ownerEmail) === caller) {
    return { project, role: 'OWNER' };
  }

  const collaborators = project.collaborators || {};
  for (const key of Object.keys(collaborators)) {
    if (norm(key) === caller) {
      return { project, role: String(collaborators[key] || 'EDITOR').toUpperCase() };
    }
  }

  return null;
};

// Authorization gate for project-scoped endpoints.
// Returns { project, role } on success; sends a 403 response and returns null
// when the caller lacks the required role. In local dev (no adminDb) an
// unknown project is treated permissively so single-user setups keep working.
export const requireProjectRole = async (req, res, projectId, minRole = 'EDITOR') => {
  const callerEmail = norm(req.user?.email);
  const membership = await getProjectMembership(projectId, callerEmail);

  if (!membership) {
    if (!adminDb) {
      return { project: null, role: 'OWNER', devFallback: true };
    }
    res.status(403).json({ error: 'You do not have access to this project.' });
    return null;
  }

  const has = ROLE_LEVEL[membership.role] || 0;
  const needs = ROLE_LEVEL[minRole] || 0;
  if (has < needs) {
    res.status(403).json({ error: `This action requires ${minRole} permissions.` });
    return null;
  }

  return membership;
};
