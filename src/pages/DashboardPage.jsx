import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ProjectCard } from '../components/dashboard/ProjectCard';
import { CreateProjectModal } from '../components/dashboard/CreateProjectModal';
import { ProjectDetailsModal } from '../components/dashboard/ProjectDetailsModal';
import { InviteTeammateModal } from '../components/dashboard/InviteTeammateModal';
import { ExportToGitHubModal } from '../components/dashboard/ExportToGitHubModal';
import { db } from '../firebase';
import { doc, getDoc, collection, getDocs, deleteDoc, updateDoc, deleteField } from 'firebase/firestore';
import { deleteProjectFromPersonalFirestore } from '../services/personalFirebaseStorage';

export const DashboardPage = () => {
  const { currentUser, userProfile, setUserProfile } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
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

    const formatProjectTitle = (rawTitle, fallbackId) => {
      if (rawTitle && typeof rawTitle === 'string' && rawTitle.trim()) {
        const t = rawTitle.trim();
        if (t.startsWith('proj_') && t.includes('_')) {
          const parts = t.replace(/^proj_/, '').split('_');
          if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
            parts.pop();
          }
          return parts.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
        return t;
      }
      if (fallbackId && typeof fallbackId === 'string' && fallbackId.startsWith('proj_')) {
        const parts = fallbackId.replace(/^proj_/, '').split('_');
        if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
          parts.pop();
        }
        return parts.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
      return fallbackId || 'Workspace Project';
    };

    const getCanonicalProjectKey = (p, fallbackId) => {
      const pid = (p?.projectId || p?.id || fallbackId || '').trim();
      const title = (p?.title || '').trim().toLowerCase();
      const owner = (p?.ownerEmail || '').trim().toLowerCase();
      if (title && owner && !title.startsWith('proj_')) {
        return `owner::${owner}::title::${title}`;
      }
      return `pid::${pid || title}`;
    };

    const upsertProject = (p, fallbackId) => {
      if (!p) return;
      const pid = p.projectId || p.id || fallbackId;
      if (!pid) return;

      // Filter out legacy template mocks unless genuinely associated with user
      if (pid === 'quantum-router-01' || pid === 'nexus-graph-db-02') {
        const ownerNorm = (p.ownerEmail || '').trim().toLowerCase();
        const hasCollab = p.collaborators && (p.collaborators[userEmailNorm] || p.collaborators[currentUser.email]);
        if (ownerNorm !== userEmailNorm && !hasCollab) return;
      }

      const ownerEmailNorm = (p.ownerEmail || '').trim().toLowerCase();
      const isOwner = ownerEmailNorm === userEmailNorm;
      const collabRole = p.collaborators ? (p.collaborators[userEmailNorm] || p.collaborators[currentUser.email]) : null;
      const resolvedRole = isOwner ? 'OWNER' : (collabRole || p.userRole || p.role || 'EDITOR');

      const canonicalKey = getCanonicalProjectKey(p, pid);
      const existing = projectMap[canonicalKey] || {};

      // Prefer structured 'proj_...' id if available
      const chosenPid = (p.projectId && String(p.projectId).startsWith('proj_'))
        ? p.projectId
        : (existing.projectId && String(existing.projectId).startsWith('proj_'))
          ? existing.projectId
          : pid;

      const rawTitle = p.title || existing.title;
      const resolvedTitle = formatProjectTitle(rawTitle, chosenPid);

      projectMap[canonicalKey] = {
        ...existing,
        ...p,
        projectId: chosenPid,
        title: resolvedTitle,
        description: p.description !== undefined ? p.description : (existing.description || ''),
        languageEnv: p.languageEnv || existing.languageEnv || 'PYTHON_3.11',
        userRole: resolvedRole,
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

    // 2. Fetch directly from Client Firestore User Document
    try {
      const cleanDocId = userEmailNorm.split('@')[0].replace(/[^a-z0-9_]/g, '_');
      const userDocRef = doc(db, 'users', cleanDocId);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists() && userDocSnap.data().projects) {
        Object.entries(userDocSnap.data().projects).forEach(([key, p]) => upsertProject(p, key));
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
          const ownerNorm = (p.ownerEmail || '').trim().toLowerCase();
          const isOwner = ownerNorm === userEmailNorm;
          const isCollab = p.collaborators && Boolean(p.collaborators[userEmailNorm] || p.collaborators[currentUser.email]);
          if (isOwner || isCollab) {
            upsertProject(p, docSnap.id);
          }
        }
      });
    } catch (colErr) {
      console.warn("Client Firestore projects collection lookup notice:", colErr);
    }

    // 4. Fetch from Backend REST API
    try {
      const token = currentUser.getIdToken ? await currentUser.getIdToken() : '';
      const res = await fetch(`/api/projects?email=${encodeURIComponent(currentUser.email)}`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      const data = await res.json();
      if (res.ok && data.projects && Array.isArray(data.projects)) {
        data.projects.forEach(p => upsertProject(p, p.projectId));
      }
    } catch (err) {
      console.warn("Backend REST API projects lookup notice:", err);
    }

    const mergedList = Object.values(projectMap);
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

  // Handle Project Deletion (Owner permanently deletes; Collaborator unlinks)
  const handleDeleteConfirm = async () => {
    if (!deleteTargetProject) return;
    setIsDeleting(true);

    const pid = deleteTargetProject.projectId;
    const title = deleteTargetProject.title;
    const userEmailNorm = (currentUser?.email || '').trim().toLowerCase();
    const isOwner = deleteTargetProject.userRole === 'OWNER' || (deleteTargetProject.ownerEmail && deleteTargetProject.ownerEmail.trim().toLowerCase() === userEmailNorm);

    try {
      // 1. Purge from AuthContext userProfile state & LocalStorage Cache
      if (setUserProfile) {
        setUserProfile(prev => {
          if (!prev) return prev;
          const updatedProjects = { ...(prev.projects || {}) };
          delete updatedProjects[pid];
          return {
            ...prev,
            projects: updatedProjects
          };
        });
      }

      try {
        const rawProfile = localStorage.getItem('obsidian_active_profile');
        if (rawProfile) {
          const parsed = JSON.parse(rawProfile);
          if (parsed?.projects?.[pid]) {
            delete parsed.projects[pid];
            localStorage.setItem('obsidian_active_profile', JSON.stringify(parsed));
          }
        }
      } catch (e) {}

      // 2. Client Firestore operations
      try {
        const cleanDocId = userEmailNorm.split('@')[0].replace(/[^a-z0-9_]/g, '_');
        if (cleanDocId) {
          const userRef = doc(db, 'users', cleanDocId);
          await updateDoc(userRef, {
            [`projects.${pid}`]: deleteField()
          }).catch(() => {});
        }

        const projRef = doc(db, 'projects', pid);
        if (isOwner) {
          // Permanently delete canonical project document from website database
          await deleteDoc(projRef).catch(() => {});
        } else {
          // Unlink collaborator
          if (currentUser?.email) {
            await updateDoc(projRef, {
              [`collaborators.${currentUser.email}`]: deleteField(),
              [`collaborators.${userEmailNorm}`]: deleteField()
            }).catch(() => {});
          }
        }
      } catch (fsErr) {
        console.warn('Firestore project deletion notice:', fsErr);
      }

      // 3. Purge from Personal Firebase Storage if configured
      try {
        await deleteProjectFromPersonalFirestore(pid, userProfile, currentUser?.email);
      } catch (pErr) {}

      // 4. Call backend REST DELETE endpoint
      try {
        const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';
        await fetch(`/api/projects/${pid}?userEmail=${encodeURIComponent(currentUser?.email || '')}`, {
          method: 'DELETE',
          headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          }
        });
      } catch (apiErr) {
        console.warn('Backend DELETE notice:', apiErr);
      }

      // 5. Remove from UI state for this user
      setProjects(prev => prev.filter(p => p.projectId !== pid));
      showToast(isOwner ? `✓ Repository '${title}' permanently deleted.` : `✓ Repository '${title}' unlinked from your workspace.`);
      setDeleteTargetProject(null);
    } catch (err) {
      alert(`Failed to remove project: ${err.message}`);
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

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto font-sans select-none">
      {/* Toast Notification Banner */}
      {notificationMsg && (
        <div className="fixed top-16 right-8 z-[600] animate-bounce bg-emerald-950/90 border border-emerald-500/60 text-emerald-200 px-4 py-2.5 rounded-lg shadow-2xl font-mono text-xs flex items-center gap-2 backdrop-blur-md">
          <span className="material-symbols-outlined text-sm text-emerald-400">check_circle</span>
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* Dashboard Global Header Strip */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-outline-variant/30 pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-3 font-headline">
            Workspace Central Launcher 
            <span className="bg-cyan-950/80 text-cyan-400 text-[10px] tracking-widest font-mono px-2 py-0.5 uppercase align-middle border border-cyan-800/50 rounded">
              Mesh Online
            </span>
          </h1>
          <p className="text-xs text-on-surface-variant mt-1 font-sans">
            Initialize clean workspaces, manage repository permissions, and collaborate in real-time.
          </p>
        </div>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-surface-tint text-neutral-900 px-4 py-2 font-mono text-xs font-bold flex items-center gap-1.5 hover:bg-cyan-400 transition-colors shadow-md rounded cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">add_box</span> Create New Project
        </button>
      </div>

      {/* Optional Personal Database Connection Prompt */}
      {userProfile?.info && userProfile.info.personalStorageConnected === false && (
        <div className="p-3.5 bg-amber-950/40 border border-amber-500/50 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono text-xs text-amber-200 animate-fade-in shadow-lg">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-amber-400 text-lg">database</span>
            <span>
              <strong>Personal Storage Notice:</strong> Your personal database is not connected yet. Connect your database to ensure your private drafts, file changes, and collaboration proposals are backed up under your account.
            </span>
          </div>
          <button
            onClick={() => navigate('/onboarding')}
            className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold px-3.5 py-1.5 rounded text-xs whitespace-nowrap transition-colors cursor-pointer self-end sm:self-auto shadow"
          >
            Connect Database
          </button>
        </div>
      )}

      {/* Search Filter Bar */}
      <div className="flex justify-between items-center bg-surface-container-lowest p-3 border border-outline-variant/40 rounded-lg">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <span className="material-symbols-outlined text-on-surface-variant text-sm">search</span>
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none focus:outline-none text-xs text-on-surface w-full font-mono placeholder:text-on-surface-variant/40"
            placeholder="Search active repository cards..."
          />
        </div>
        <span className="text-[11px] font-mono text-on-surface-variant">
          Active Repositories: {filteredProjects.length}
        </span>
      </div>

      {/* Project Cards Grid */}
      {loading ? (
        <div className="py-12 flex justify-center text-xs font-mono text-surface-tint animate-pulse">
          Loading workspace repositories...
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-8 space-y-4 font-mono">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project) => (
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
        userRole={
          (detailsProject?.ownerEmail && currentUser?.email && detailsProject.ownerEmail.toLowerCase().trim() === currentUser.email.toLowerCase().trim())
            ? 'OWNER'
            : (detailsProject?.userRole || detailsProject?.collaborators?.[currentUser?.email?.toLowerCase()] || 'EDITOR')
        }
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
