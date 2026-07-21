import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const ProjectCard = ({ project, userRole = 'OWNER' }) => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const getRoleBadgeStyle = (role) => {
    switch (role) {
      case 'OWNER':
        return 'text-cyan-400 border-cyan-400 bg-cyan-950/30';
      case 'EDITOR':
        return 'text-green-400 border-green-400 bg-green-950/30';
      case 'REVIEWER':
      default:
        return 'text-purple-400 border-purple-400 bg-purple-950/30';
    }
  };

  const getLanguageTag = (languageEnv) => {
    if (languageEnv.includes('RUST')) return 'Rust / gRPC';
    if (languageEnv.includes('PYTHON')) return 'Python 3.11 / PyTorch';
    if (languageEnv.includes('TYPESCRIPT')) return 'TypeScript 5.0';
    return 'GoLang / Redis';
  };

  const handleCopyInviteLink = (e) => {
    e.stopPropagation();
    const inviteUrl = `${window.location.origin}/invite/${project.projectId}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-panel p-5 rounded-none flex flex-col gap-3 relative border border-outline-variant/40 hover:border-surface-tint transition-all group bg-surface-container-low/60">
      <div className="flex justify-between items-start">
        <span className="material-symbols-outlined text-surface-tint text-xl">
          terminal
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyInviteLink}
            className="text-[10px] font-mono border border-outline-variant px-2 py-0.5 text-on-surface-variant hover:text-surface-tint hover:border-surface-tint transition-colors flex items-center gap-1"
            title="Copy Teammate Invitation Link"
          >
            <span className="material-symbols-outlined text-xs">link</span>
            {copied ? 'COPIED!' : 'INVITE'}
          </button>
          <span className={`text-[9px] font-mono border px-2 py-0.5 rounded-full uppercase tracking-wider ${getRoleBadgeStyle(userRole)}`}>
            {userRole}
          </span>
        </div>
      </div>

      <div>
        <h3 
          onClick={() => navigate(`/ide/${project.projectId}`)}
          className="font-bold text-base text-on-surface group-hover:text-surface-tint transition-colors cursor-pointer font-headline"
        >
          {project.title}
        </h3>
        <p className="text-xs text-on-surface-variant mt-1 line-clamp-2 font-sans">
          High-performance cloud workspace instance powered by Firestore flat relative path array sync.
        </p>
      </div>

      <div className="pt-3 border-t border-outline-variant/40 flex justify-between items-center text-[10px] font-mono text-on-surface-variant">
        <span>{getLanguageTag(project.languageEnv || '')}</span>
        <span>
          {project.updatedAt ? `Updated ${new Date(project.updatedAt).toLocaleDateString()}` : 'Active'}
        </span>
      </div>
    </div>
  );
};
