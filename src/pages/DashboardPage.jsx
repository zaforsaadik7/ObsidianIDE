import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ProjectCard } from '../components/dashboard/ProjectCard';
import { CreateProjectModal } from '../components/dashboard/CreateProjectModal';
import { ProjectDetailsModal } from '../components/dashboard/ProjectDetailsModal';
import { InviteTeammateModal } from '../components/dashboard/InviteTeammateModal';
import { ExportToGitHubModal } from '../components/dashboard/ExportToGitHubModal';
import { db, getFirebaseIdToken } from '../firebase';
import { doc, getDoc, collection, getDocs, updateDoc, deleteField } from 'firebase/firestore';
import { getProjectDisplayTitle, resolveProjectUserRoleAndMembership } from '../utils/projectTitle';
import { getUserDocId } from '../context/AuthContext';

export const DashboardPage = () => {
  const { currentUser, userProfile, setUserProfile } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState('recent');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Modals state for 3-dot menu options
  const [detailsProject, setDetailsProject] = useState(null);
  const [inviteProject, setInviteProject] = useState(null);
  const [exportGitHubProject, setExportGitHubProject] = useState(null);
  const [deleteTargetProject, setDeleteTargetProject] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState('');

  const fetchUserProjects = async () => {
    if (!currentUser?.email) return;
    setLoading(true);

    const userEmailNorm = (currentUser.email || '').trim().toLowerCase();
    const projectMap = {};
    const hiddenProjectIds = new Set(Object.keys(userProfile?.hiddenProjects || {}));

    const getCanonicalProjectKey = (p, fallbackId) => {
      const pid = (p?.projectId || p?.id || fallbackId || '').trim();
      const title = (p?.title || '').trim().toLowerCase();
      const owner = (p?.ownerEmail || '').trim().toLowerCase();
      if (title && owner) {
        return `owner::${owner}::title::${title}`;
      }
      return `pid::${pid || title}`;
    };

    const upsertProject = (p, fallbackId) => {
      if (!p) return;
      const pid = p.projectId || p.id || fallbackId;
      if (!pid) return;

      const membership = resolveProjectUserRoleAndMembership(p, userEmailNorm, currentUser.uid, currentUser.displayName);
      if (!membership.isMember) return;

      const canonicalKey = getCanonicalProjectKey(p, pid);
      const existing = projectMap[canonicalKey] || {};

      // Prefer structured 'proj_...' id if available
      const chosenPid = (p.projectId && String(p.projectId).startsWith('proj_'))
        ? p.projectId
        : (existing.projectId && String(existing.projectId).startsWith('proj_'))
          ? existing.projectId
          : pid;
      const incomingTitle = String(p.title || '').trim();
      const existingTitle = String(existing.title || '').trim();
      const resolvedTitle = incomingTitle && incomingTitle !== pid
        ? incomingTitle
        : (existingTitle && existingTitle !== chosenPid
          ? existingTitle
          : getProjectDisplayTitle(p, chosenPid));

      projectMap[canonicalKey] = {
        ...existing,
        ...p,
        projectId: chosenPid,
        title: resolvedTitle,
        description: p.description !== undefined ? p.description : (existing.description || ''),
        languageEnv: p.languageEnv || existing.languageEnv || 'PYTHON_3.11',
        userRole: membership.role,
        ownerEmail: p.ownerEmail || existing.ownerEmail,
        collaborators: p.collaborators || existing.collaborators || {},
        createdAt: p.createdAt || existing.createdAt || new Date().toISOString(),
        updatedAt: p.updatedAt || existing.updatedAt || new Date().toISOString()
      };
    };

    // 1. Load from AuthContext userProfile state
    if (userProfile?.projects) {
      Object.entries(userProfile.projects).forEach(([key, p]) => upsertProject(p, key));
    }

    // 2. Fetch directly from Client Firestore User Documents (checking multiple candidate doc IDs)
    try {
      const candidateDocIds = new Set([
        userEmailNorm.split('@')[0].replace(/[^a-z0-9_]/g, '_'),
        getUserDocId(currentUser.email, currentUser.displayName),
        currentUser.uid
      ]);

      for (const candidateId of candidateDocIds) {
        if (!candidateId) continue;
        try {
          const userDocRef = doc(db, 'users', candidateId);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const uData = userDocSnap.data();
            if (uData.projects) {
              Object.entries(uData.projects).forEach(([key, p]) => upsertProject(p, key));
            }
            if (uData.hiddenProjects) {
              Object.keys(uData.hiddenProjects).forEach((projectId) => hiddenProjectIds.add(projectId));
            }
          }
        } catch (innerErr) {}
      }
    } catch (fsErr) {
      console.warn("Client Firestore user projects lookup notice:", fsErr);
    }

    // 3. Fetch from Client Firestore 'projects' collection
    try {
      const projectsSnap = await getDocs(collection(db, 'projects'));
      projectsSnap.forEach(docSnap => {
        const p = docSnap.data();
        if (p) {
          upsertProject(p, docSnap.id);
        }
      });
    } catch (colErr) {
      console.warn("Client Firestore projects collection lookup notice:", colErr);
    }

    // 4. Fetch from Backend REST API (with direct Render fallback)
    try {
      const token = (await getFirebaseIdToken().catch(() => '')) || (currentUser.getIdToken ? await currentUser.getIdToken().catch(() => '') : '');
      const apiUrls = [
        `/api/projects?email=${encodeURIComponent(currentUser.email)}`,
        `https://obsidianide.onrender.com/api/projects?email=${encodeURIComponent(currentUser.email)}`
      ];

      for (const url of apiUrls) {
        try {
          const res = await fetch(url, {
            headers: {
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.projects && Array.isArray(data.projects)) {
              data.projects.forEach(p => upsertProject(p, p.projectId));
              break;
            }
          }
        } catch (fetchErr) {}
      }
    } catch (err) {
      console.warn("Backend REST API projects lookup notice:", err);
    }

    const mergedList = Object.values(projectMap).filter((project) => !hiddenProjectIds.has(project.projectId));
    mergedList.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    setProjects(mergedList);
    setLoading(false);
  };

  useEffect(() => {
    fetchUserProjects();
  }, [currentUser, userProfile]);

  const handleProjectCreated = (newProject) => {
    if (!newProject || !newProject.projectId) return;
    setProjects(prev => {
      const remaining = (prev || []).filter(p => p && p.projectId !== newProject.projectId);
      return [newProject, ...remaining];
    });
    showToast(`Project '${newProject.title}' initialized successfully.`);
  };

  const showToast = (msg) => {
    setNotificationMsg(msg);
    setTimeout(() => setNotificationMsg(''), 4000);
  };

  // Removes a project from this account only. Shared project data and collaborator
  // membership are deliberately never changed here.
  const handleDeleteConfirm = async () => {
    if (!deleteTargetProject) return;
    setIsDeleting(true);

    const pid = deleteTargetProject.projectId;
    const title = deleteTargetProject.title;

    try {
      const removedAt = new Date().toISOString();

      // 1. Remove the reference from this user's website profile and remember
      // the choice so the shared-project query does not add it back on refresh.
      try {
        const cleanDocId = currentUser?.email?.split('@')[0]?.toLowerCase()?.replace(/[^a-z0-9_]/g, '_');
        if (cleanDocId) {
          const userRef = doc(db, 'users', cleanDocId);
          await updateDoc(userRef, {
            [`projects.${pid}`]: deleteField(),
            [`hiddenProjects.${pid}`]: { removedAt }
          });
        }
      } catch (fsErr) {
        console.warn('Firestore personal-profile removal notice:', fsErr);
      }

      // 2. Ask the server to remove only this user's profile reference. It is
      // intentionally not the shared-project DELETE route.
      try {
        const token = await getFirebaseIdToken();
        await fetch(`/api/projects/${pid}/remove-from-profile`, {
          method: 'DELETE',
          headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...(currentUser?.email ? { 'X-User-Email': currentUser.email } : {})
          }
        });
      } catch (apiErr) {
        console.warn('Backend personal-profile removal notice:', apiErr);
      }

      // 3. Remove from UI and cached profile state for this user.
      setProjects(prev => prev.filter(p => p.projectId !== pid));
      setUserProfile((previousProfile) => {
        if (!previousProfile) return previousProfile;
        const nextProjects = { ...(previousProfile.projects || {}) };
        const nextHiddenProjects = { ...(previousProfile.hiddenProjects || {}) };
        delete nextProjects[pid];
        nextHiddenProjects[pid] = { removedAt };
        return {
          ...previousProfile,
          projects: nextProjects,
          hiddenProjects: nextHiddenProjects
        };
      });
      showToast(`✓ Repository '${title}' removed from your personal workspace.`);
      setDeleteTargetProject(null);
    } catch (err) {
      alert(`Failed to remove project from workspace: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const deduplicatedProjects = Array.from(
    new Map((projects || []).filter(Boolean).map(p => [p.projectId, p])).values()
  );

  const filteredProjects = deduplicatedProjects.filter(p =>
    (p.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const displayedProjects = [...filteredProjects].sort((left, right) => {
    const leftUpdated = new Date(left.updatedAt || left.createdAt || 0).getTime() || 0;
    const rightUpdated = new Date(right.updatedAt || right.createdAt || 0).getTime() || 0;
    const leftCreated = new Date(left.createdAt || 0).getTime() || 0;
    const rightCreated = new Date(right.createdAt || 0).getTime() || 0;

    switch (sortOption) {
      case 'oldest':
        return leftCreated - rightCreated;
      case 'name-az':
        return (left.title || '').localeCompare(right.title || '');
      case 'name-za':
        return (right.title || '').localeCompare(left.title || '');
      case 'role': {
        const rolePriority = { OWNER: 0, REVIEWER: 1, EDITOR: 2 };
        return (rolePriority[left.userRole] ?? 3) - (rolePriority[right.userRole] ?? 3)
          || (left.title || '').localeCompare(right.title || '');
      }
      case 'recent':
      default:
        return rightUpdated - leftUpdated;
    }
  });

  return (
    <div className="flex flex-col gap-7 max-w-7xl mx-auto font-sans select-none pb-8">
      {/* Toast Notification Banner */}
      {notificationMsg && (
        <div className="fixed top-16 right-8 z-[600] animate-bounce bg-emerald-950/90 border border-emerald-500/60 text-emerald-200 px-4 py-2.5 rounded-lg shadow-2xl font-mono text-xs flex items-center gap-2 backdrop-blur-md">
          <span className="material-symbols-outlined text-sm text-emerald-400">check_circle</span>
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* Dashboard Global Header Strip */}
      <div className="control-panel rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center p-5 sm:p-6 gap-4">
        <div>
          <p className="eyebrow mb-2">Workspace directory</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 flex items-center gap-3 font-headline tracking-tight">
            Your projects
            <span className="bg-cyan-300/10 text-cyan-200 text-[10px] tracking-widest font-mono px-2.5 py-1 uppercase align-middle border border-cyan-300/20 rounded-full">
              Online
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-2 font-sans">
            A focused view of your active repositories and collaborators.
          </p>
        </div>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="accent-button px-4 py-2.5 font-mono text-xs font-bold flex items-center gap-1.5 transition-all rounded-xl cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">add_box</span> Create New Project
        </button>
      </div>

      {/* Search Filter Bar */}
      <div className="control-card flex flex-col sm:flex-row justify-between sm:items-center gap-3 p-3.5 rounded-xl">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <span className="material-symbols-outlined text-slate-500 text-sm">search</span>
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none focus:outline-none text-xs text-slate-200 w-full font-mono placeholder:text-slate-600"
            placeholder="Search your projects..."
          />
        </div>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <label className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 whitespace-nowrap">
            <span className="material-symbols-outlined text-sm">sort</span>
            <span className="sr-only">Sort projects</span>
            <select
              value={sortOption}
              onChange={(event) => setSortOption(event.target.value)}
              className="bg-[#101215] border border-white/10 text-slate-300 rounded-lg px-2.5 py-1.5 text-[11px] font-mono focus:outline-none focus:border-cyan-300/50 cursor-pointer"
              aria-label="Sort projects"
            >
              <option value="recent">Recently updated</option>
              <option value="oldest">Oldest created</option>
              <option value="name-az">Name: A–Z</option>
              <option value="name-za">Name: Z–A</option>
              <option value="role">Role: owner first</option>
            </select>
          </label>
          <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap">
            {displayedProjects.length} active {displayedProjects.length === 1 ? 'project' : 'projects'}
          </span>
        </div>
      </div>

      {/* Project Cards Grid */}
      {loading ? (
        <div className="py-12 flex justify-center text-xs font-mono text-surface-tint animate-pulse">
          Loading workspace repositories...
        </div>
      ) : displayedProjects.length === 0 ? (
        <div className="control-panel py-16 flex flex-col items-center justify-center text-center rounded-2xl p-8 space-y-4 font-mono">
          <div className="w-14 h-14 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <span className="material-symbols-outlined text-3xl">folder_off</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-on-surface">No Workspace Repositories Found</h3>
            <p className="text-xs text-on-surface-variant mt-1 max-w-sm">
              {searchQuery ? `No repositories match '${searchQuery}'.` : "You haven't created any repositories or received project invitations yet."}
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-surface-tint hover:bg-cyan-400 text-neutral-900 font-bold px-4 py-2 rounded text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">add_box</span> Create New Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedProjects.map((project) => (
            <ProjectCard 
              key={project.projectId} 
              project={project} 
              userRole={project.userRole || 'OWNER'}
              onOpenDetails={(p) => setDetailsProject(p)}
              onOpenInvite={(p) => setInviteProject(p)}
              onExportToGitHub={(p) => setExportGitHubProject(p)}
              onDeleteProject={(p) => setDeleteTargetProject(p)}
            />
          ))}
        </div>
      )}

      {/* ── Modals ── */}
      {/* Create Project Modal */}
      <CreateProjectModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onProjectCreated={handleProjectCreated}
      />

      {/* Project Details Modal */}
      <ProjectDetailsModal
        isOpen={Boolean(detailsProject)}
        onClose={() => setDetailsProject(null)}
        project={detailsProject}
        userRole={detailsProject?.userRole || 'OWNER'}
      />

      {/* Invite Teammate Modal */}
      <InviteTeammateModal
        isOpen={Boolean(inviteProject)}
        onClose={() => setInviteProject(null)}
        project={inviteProject}
        currentUser={currentUser}
      />

      {/* Export to GitHub Modal */}
      <ExportToGitHubModal
        isOpen={Boolean(exportGitHubProject)}
        onClose={() => setExportGitHubProject(null)}
        project={exportGitHubProject}
        currentUser={currentUser}
        userProfile={userProfile}
        onProjectUpdated={(updatedP) => {
          setProjects(prev => prev.map(p => (p.projectId === updatedP.projectId || p.id === updatedP.projectId) ? { ...p, ...updatedP } : p));
        }}
      />

      {/* Delete / Remove Confirmation Modal */}
      {deleteTargetProject && (
        <div className="fixed inset-0 z-[550] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-sans select-none">
          <div className="bg-[#14141A] border border-rose-500/40 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <span className="material-symbols-outlined text-2xl">delete</span>
              <h3 className="text-sm font-bold uppercase tracking-wider font-headline">
                Remove Project from Workspace
              </h3>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed">
              Remove repository <strong className="text-rose-300 font-mono">'{deleteTargetProject.title}'</strong> from your personal workspace?
            </p>

            <div className="p-3 bg-black/40 border border-white/5 rounded-lg text-[11px] text-zinc-400 leading-relaxed font-mono">
              💡 <strong>Note:</strong> This will delete the repository from your personal dashboard only. Other team collaborators will continue to have access to the repository.
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10 font-mono text-xs">
              <button
                onClick={() => setDeleteTargetProject(null)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">{isDeleting ? 'sync' : 'delete'}</span>
                <span>{isDeleting ? 'Removing...' : 'Delete from My Workspace'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default DashboardPage;
