import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const ProjectCard = ({ 
  project, 
  userRole = 'OWNER', 
  onOpenDetails, 
  onOpenInvite, 
  onExportToGitHub,
  onDeleteProject 
}) => {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);

  // Close 3-dot menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const getRoleBadgeStyle = (role) => {
    switch (role) {
      case 'OWNER':
        return 'text-cyan-300 border-cyan-500/40 bg-cyan-950/40';
      case 'EDITOR':
        return 'text-emerald-300 border-emerald-500/40 bg-emerald-950/40';
      case 'REVIEWER':
      default:
        return 'text-purple-300 border-purple-500/40 bg-purple-950/40';
    }
  };

  const getLanguageTag = (languageEnv = '') => {
    if (languageEnv.includes('RUST')) return 'Rust 1.75 / Tokio';
    if (languageEnv.includes('PYTHON')) return 'Python 3.11 / PyTorch';
    if (languageEnv.includes('TYPESCRIPT')) return 'TypeScript 5.0';
    if (languageEnv.includes('GO')) return 'GoLang 1.21';
    return 'Python 3.11';
  };

  const handleCopyInvite = (e) => {
    e.stopPropagation();
    const inviteUrl = `${window.location.origin}/invite/${project.projectId}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportProject = (e) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${project.title || 'project'}_export.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="glass-panel p-5 rounded-xl flex flex-col justify-between gap-4 relative border border-outline-variant/40 hover:border-cyan-500/50 transition-all duration-200 group bg-surface-container-low/80 hover:shadow-[0_4px_24px_rgba(0,220,229,0.08)]">
      {/* ── Top Bar with Icon, Role Badge, and 3-Dot Menu ── */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-400">
            <span className="material-symbols-outlined text-lg">terminal</span>
          </div>
          <span className={`text-[10px] font-mono border px-2 py-0.5 rounded-full uppercase tracking-wider font-bold ${getRoleBadgeStyle(userRole)}`}>
            {userRole}
          </span>
        </div>

        {/* 3-Dot Action Menu Container */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(!isMenuOpen);
            }}
            className="p-1 rounded-lg text-on-surface-variant hover:text-cyan-300 hover:bg-white/5 transition-colors cursor-pointer"
            title="Project Options"
          >
            <span className="material-symbols-outlined text-lg">more_vert</span>
          </button>

          {/* 3-Dot Dropdown */}
          {isMenuOpen && (
            <div className="absolute right-0 top-8 w-48 bg-[#14141A]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl py-1 z-[100] text-xs font-mono select-none animate-fade-in">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(false);
                  onOpenDetails?.(project);
                }}
                className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm text-cyan-400">info</span>
                <span>Project Details</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(false);
                  onOpenInvite?.(project);
                }}
                className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-purple-500/15 hover:text-purple-300 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm text-purple-400">person_add</span>
                <span>Invite Members</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(false);
                  onExportToGitHub?.(project);
                }}
                className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 fill-current text-white" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
                <span>Export to GitHub</span>
              </button>

              <button
                onClick={handleExportProject}
                className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-emerald-500/15 hover:text-emerald-300 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm text-emerald-400">download</span>
                <span>Export JSON</span>
              </button>

              <div className="my-1 border-t border-white/10" />

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(false);
                  onDeleteProject?.(project);
                }}
                className="w-full text-left px-3 py-1.5 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm text-rose-400">delete</span>
                <span>Delete Project</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Project Title & Summary ── */}
      <div 
        onClick={() => navigate(`/ide/${project.projectId}`)}
        className="cursor-pointer space-y-1.5"
      >
        <h3 className="font-bold text-base text-on-surface group-hover:text-cyan-300 transition-colors font-headline flex items-center gap-2">
          <span>{project.title}</span>
          <span className="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-cyan-400">
            arrow_forward
          </span>
        </h3>
        <p className="text-xs text-on-surface-variant line-clamp-2 font-sans">
          {project.description && project.description.trim() 
            ? project.description.trim() 
            : `Cloud development repository configured for ${getLanguageTag(project.languageEnv)}.`}
        </p>
      </div>

      {/* ── Footer Metadata & Quick Actions ── */}
      <div className="pt-3 border-t border-outline-variant/30 flex justify-between items-center text-[10px] font-mono text-on-surface-variant">
        <span className="text-emerald-400/90 font-medium">
          {getLanguageTag(project.languageEnv)}
        </span>
        <div className="flex items-center gap-2">
          <span>
            {project.updatedAt ? `Updated ${new Date(project.updatedAt).toLocaleDateString()}` : 'Active'}
          </span>
        </div>
      </div>
    </div>
  );
};
export default ProjectCard;
