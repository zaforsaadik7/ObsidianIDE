import React from 'react';

export const ProjectDetailsModal = ({ isOpen, onClose, project, userRole = 'OWNER' }) => {
  if (!isOpen || !project) return null;

  const getRoleDescription = (role) => {
    switch (role) {
      case 'OWNER':
        return 'Full administrative access: edit code, manage collaborators, approve patches, and delete repository.';
      case 'EDITOR':
        return 'Read and write access: create files, edit code directly, and execute in sandbox.';
      case 'REVIEWER':
      default:
        return 'Read and proposal access: review code, test in sandbox, and submit patch proposals for owner approval.';
    }
  };

  const formattedCreated = project.createdAt 
    ? new Date(project.createdAt).toLocaleString() 
    : (project.updatedAt ? new Date(project.updatedAt).toLocaleString() : 'N/A');

  const formattedUpdated = project.updatedAt 
    ? new Date(project.updatedAt).toLocaleString() 
    : 'N/A';

  const collaboratorsList = project.collaborators 
    ? (typeof project.collaborators === 'object' ? Object.entries(project.collaborators) : [])
    : [];

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm font-sans animate-fade-in select-none">
      <div className="relative glass-panel w-full max-w-lg p-6 shadow-2xl flex flex-col gap-5 bg-surface-container-low border border-outline-variant rounded-xl text-xs">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-outline-variant/40 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-surface-tint text-lg">info</span>
            <h2 className="text-sm font-bold text-on-surface font-headline uppercase tracking-wider">
              Project Details & Metadata
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="text-on-surface-variant hover:text-red-400 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Main Info Box */}
          <div className="p-3.5 bg-black/40 rounded-lg border border-white/5 space-y-2 font-mono">
            <div className="flex justify-between items-center">
              <span className="text-on-surface-variant text-[11px]">Repository Title:</span>
              <span className="font-bold text-cyan-300 text-sm">{project.title}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-on-surface-variant text-[11px]">Project ID:</span>
              <span className="text-slate-400 text-[11px] select-all">{project.projectId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-on-surface-variant text-[11px]">Runtime Environment:</span>
              <span className="text-emerald-400 font-bold">{project.languageEnv || 'PYTHON 3.11 / PyTorch'}</span>
            </div>
            {project.description && (
              <div className="pt-2 border-t border-white/5 space-y-1">
                <span className="text-on-surface-variant text-[11px] block">Description:</span>
                <p className="text-zinc-300 font-sans text-xs leading-relaxed">{project.description}</p>
              </div>
            )}
          </div>

          {/* Access Rights Box */}
          <div className="p-3.5 bg-cyan-950/20 border border-cyan-500/20 rounded-lg space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-bold text-cyan-300 uppercase tracking-wider text-[11px]">
                Your Access Level
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                {userRole}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
              {getRoleDescription(userRole)}
            </p>
          </div>

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-3 font-mono">
            <div className="p-3 bg-black/30 rounded-lg border border-white/5">
              <span className="text-[10px] text-on-surface-variant block">CREATED AT</span>
              <span className="text-[11px] text-slate-300 font-bold">{formattedCreated}</span>
            </div>
            <div className="p-3 bg-black/30 rounded-lg border border-white/5">
              <span className="text-[10px] text-on-surface-variant block">LAST MODIFIED</span>
              <span className="text-[11px] text-slate-300 font-bold">{formattedUpdated}</span>
            </div>
          </div>

          {/* Owner & Collaborators */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-on-surface uppercase tracking-wider block">
              Project Team & Collaborators ({collaboratorsList.length > 0 ? collaboratorsList.length : 1})
            </span>
            <div className="p-3 bg-black/30 rounded-lg border border-white/5 space-y-2 font-mono text-[11px]">
              <div className="flex justify-between items-center pb-1.5 border-b border-white/5">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-xs text-amber-400">shield_person</span>
                  {project.ownerEmail || 'Primary Account'}
                </span>
                <span className="text-amber-400 font-bold text-[10px] uppercase">OWNER</span>
              </div>

              {collaboratorsList.map(([email, role], idx) => {
                if (email === project.ownerEmail) return null;
                return (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-xs text-purple-400">person</span>
                      {email}
                    </span>
                    <span className="text-purple-400 font-bold text-[10px] uppercase">{String(role)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end pt-3 border-t border-outline-variant/40">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-surface-tint text-neutral-900 font-bold text-xs rounded hover:bg-cyan-400 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
