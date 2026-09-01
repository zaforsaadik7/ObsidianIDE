// Project IDs are internal routing keys. They must never become the visible
// project name when a partial record is loaded from a secondary data source.
export const getProjectDisplayTitle = (projectOrTitle, fallbackProjectId = '') => {
  const project = typeof projectOrTitle === 'object' && projectOrTitle !== null
    ? projectOrTitle
    : { title: projectOrTitle, projectId: fallbackProjectId };
  const projectId = String(project.projectId || project.id || fallbackProjectId || '').trim();
  const title = String(project.title || '').trim();

  // A real title always wins, including titles that happen to contain "proj_".
  if (title && title !== projectId) return title;

  // IDs created by CreateProjectModal use proj_<slug>_<four digits>. Recover
  // the original readable title for legacy/incomplete records only.
  const generatedIdMatch = projectId.match(/^proj_(.+)_\d{4}$/i);
  if (generatedIdMatch) {
    return generatedIdMatch[1].replace(/_+/g, ' ').trim() || 'Untitled project';
  }

  return title || projectId || 'Untitled project';
};

/**
 * Universal resolution helper for checking if a user is an owner or collaborator
 * on a project, supporting all possible schema variations (Map, Array, team lists, history).
 */
export const resolveProjectUserRoleAndMembership = (p, userEmail, uid, displayName) => {
  if (!p || (!userEmail && !uid)) return { isMember: false, role: 'EDITOR', isOwner: false };

  const emailNorm = (userEmail || '').trim().toLowerCase();
  const username = emailNorm.includes('@') ? emailNorm.split('@')[0] : emailNorm;
  const ownerNorm = (p.ownerEmail || '').trim().toLowerCase();

  const isOwner = Boolean(ownerNorm && emailNorm && ownerNorm === emailNorm);
  if (isOwner) return { isMember: true, role: 'OWNER', isOwner: true };

  let collabRole = null;

  // 1. Map/Object Collaborators Roster
  if (p.collaborators && typeof p.collaborators === 'object' && !Array.isArray(p.collaborators)) {
    if (emailNorm && p.collaborators[emailNorm]) {
      collabRole = p.collaborators[emailNorm];
    } else if (userEmail && p.collaborators[userEmail]) {
      collabRole = p.collaborators[userEmail];
    } else if (uid && p.collaborators[uid]) {
      collabRole = p.collaborators[uid];
    } else {
      const matchedKey = Object.keys(p.collaborators).find(k => {
        const kNorm = String(k).trim().toLowerCase();
        return kNorm === emailNorm || (uid && k === uid) || (username && kNorm === username);
      });
      if (matchedKey) collabRole = p.collaborators[matchedKey];
    }

    if (!collabRole) {
      const matchedVal = Object.values(p.collaborators).find(v => {
        if (!v) return false;
        if (typeof v === 'string') return v.trim().toLowerCase() === emailNorm;
        const vEmail = (v.email || v.userEmail || '').trim().toLowerCase();
        return vEmail === emailNorm || (uid && v.uid === uid);
      });
      if (matchedVal) {
        collabRole = typeof matchedVal === 'string' ? matchedVal : (matchedVal.role || 'EDITOR');
      }
    }
  }

  // 2. Array Collaborators Roster
  if (!collabRole && Array.isArray(p.collaborators)) {
    const foundItem = p.collaborators.find(item => {
      if (!item) return false;
      if (typeof item === 'string') return item.trim().toLowerCase() === emailNorm;
      const iEmail = (item.email || item.userEmail || '').trim().toLowerCase();
      return iEmail === emailNorm || (uid && item.uid === uid);
    });
    if (foundItem) {
      collabRole = typeof foundItem === 'string' ? 'EDITOR' : (foundItem.role || 'EDITOR');
    }
  }

  // 3. Team Members / Invitations / Raw text input checks
  if (!collabRole) {
    if (typeof p.teamMembersInput === 'string' && p.teamMembersInput.toLowerCase().includes(emailNorm)) {
      collabRole = 'EDITOR';
    } else if (Array.isArray(p.teamMembers) && p.teamMembers.some(m => String(m).toLowerCase().includes(emailNorm))) {
      collabRole = 'EDITOR';
    } else if (Array.isArray(p.members) && p.members.some(m => (typeof m === 'string' ? m : m?.email || '').toLowerCase() === emailNorm)) {
      collabRole = 'EDITOR';
    } else if (p.invitations && typeof p.invitations === 'object') {
      const invRole = p.invitations[emailNorm] || (userEmail && p.invitations[userEmail]);
      if (invRole) collabRole = typeof invRole === 'string' ? invRole : (invRole.role || 'EDITOR');
    }
  }

  // 4. File Modification & Activity History (User previously worked on this project)
  if (!collabRole) {
    const lastWorkingAuthor = (p.lastWorkingModifiedBy || '').trim().toLowerCase();
    const lastMasterAuthor = (p.masterLastSyncedBy || '').trim().toLowerCase();
    const isPastEditor = (lastWorkingAuthor && lastWorkingAuthor === emailNorm) || 
      (lastMasterAuthor && lastMasterAuthor === emailNorm) ||
      (Array.isArray(p.working_files) && p.working_files.some(f => (f?.lastModifiedBy || '').trim().toLowerCase() === emailNorm)) ||
      (Array.isArray(p.master_project_files) && p.master_project_files.some(f => (f?.lastModifiedBy || '').trim().toLowerCase() === emailNorm)) ||
      (Array.isArray(p.project_files) && p.project_files.some(f => (f?.lastModifiedBy || '').trim().toLowerCase() === emailNorm));

    if (isPastEditor) {
      collabRole = p.userRole || p.role || 'EDITOR';
    }
  }

  const finalRole = collabRole
    ? (typeof collabRole === 'string' ? collabRole.toUpperCase() : (collabRole.role || 'EDITOR').toUpperCase())
    : (p.userRole || p.role || null);

  return {
    isMember: Boolean(isOwner || collabRole || p.userRole || p.role),
    role: isOwner ? 'OWNER' : (finalRole || 'EDITOR'),
    isOwner
  };
};
