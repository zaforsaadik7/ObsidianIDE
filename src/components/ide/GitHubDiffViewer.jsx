import React, { useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';

/**
 * GitHubDiffViewer - High-Visibility GitHub PR-Grade Split/Unified Diff Editor
 * with Multi-Collaborator Author Attribution & Contributor Badges
 */
export const GitHubDiffViewer = ({
  originalContent = '',
  modifiedContent = '',
  fileName = 'file.js',
  language = 'javascript',
  lastModifiedBy = null,
  attribution = null,
  collaborators = {},
  isDark = true,
  onClose
}) => {
  const [renderSideBySide, setRenderSideBySide] = useState(true);
  const [showContributorsList, setShowContributorsList] = useState(false);

  // Compute rough line difference metrics
  const origLines = (originalContent || '').split('\n');
  const modLines = (modifiedContent || '').split('\n');
  const linesAdded = Math.max(0, modLines.length - origLines.length);
  const linesRemoved = Math.max(0, origLines.length - modLines.length);

  // Determine author name & details
  const authorEmail = typeof lastModifiedBy === 'string' 
    ? lastModifiedBy 
    : (lastModifiedBy?.email || lastModifiedBy?.authorEmail || attribution?.lastModifiedBy?.authorEmail || 'Developer');

  const authorName = lastModifiedBy?.name || lastModifiedBy?.authorName || attribution?.lastModifiedBy?.authorName || authorEmail.split('@')[0];
  const authorAvatar = lastModifiedBy?.avatar || lastModifiedBy?.authorAvatar || attribution?.lastModifiedBy?.authorAvatar || '';
  const authorColor = attribution?.lastModifiedBy?.color || '#00DCE5';

  const contributors = attribution?.contributors || [
    { email: authorEmail, name: authorName, color: authorColor }
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0D1117] text-white font-mono select-none relative overflow-hidden">
      {/* Top GitHub Diff Control Header */}
      <div className="flex flex-wrap justify-between items-center px-4 py-2 bg-[#161B22] border-b border-[#30363D] text-xs gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-zinc-200">
            <span className="material-symbols-outlined text-sm text-cyan-400">compare</span>
            <span>{fileName}</span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="px-2 py-0.5 bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 rounded font-bold">
              +{linesAdded || 1} lines
            </span>
            {linesRemoved > 0 && (
              <span className="px-2 py-0.5 bg-rose-950/80 text-rose-300 border border-rose-500/40 rounded font-bold">
                -{linesRemoved} lines
              </span>
            )}
          </div>

          {/* Collaborator Change Author Attribution Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-cyan-950/50 border border-cyan-500/30 rounded-full text-[11px] shadow-sm">
            <span className="text-zinc-400">Modified by:</span>
            <div className="flex items-center gap-1.5 font-sans font-medium text-cyan-200">
              {authorAvatar ? (
                <img src={authorAvatar} alt={authorName} className="w-4 h-4 rounded-full object-cover" />
              ) : (
                <div 
                  className="w-4 h-4 rounded-full text-black font-bold flex items-center justify-center text-[10px]"
                  style={{ backgroundColor: authorColor }}
                >
                  {(authorName.charAt(0) || 'U').toUpperCase()}
                </div>
              )}
              <strong className="text-cyan-300">{authorName}</strong>
              <span className="text-zinc-400 font-mono text-[10px]">({authorEmail})</span>
            </div>
          </div>

          {/* Multiple Contributors Dropdown / Badge */}
          {contributors.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowContributorsList(!showContributorsList)}
                className="flex items-center gap-1 px-2 py-0.5 bg-purple-950/60 border border-purple-500/40 rounded-full text-[10px] text-purple-200 hover:bg-purple-900/80 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-xs">group</span>
                <span>{contributors.length} Contributors</span>
              </button>

              {showContributorsList && (
                <div className="absolute top-7 left-0 w-64 bg-[#12131A] border border-purple-500/30 rounded-lg shadow-2xl p-2 z-50 space-y-1.5 animate-fade-in font-sans">
                  <div className="text-[10px] font-bold text-zinc-400 px-1 uppercase tracking-wider">File Contributors</div>
                  {contributors.map((c) => (
                    <div key={c.email} className="flex items-center justify-between p-1 rounded hover:bg-white/5 text-xs">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded-full text-black font-bold flex items-center justify-center text-[10px]"
                          style={{ backgroundColor: c.color || '#A855F7' }}
                        >
                          {(c.name?.charAt(0) || 'C').toUpperCase()}
                        </div>
                        <div>
                          <div className="text-zinc-200 font-medium text-[11px]">{c.name}</div>
                          <div className="text-[10px] text-zinc-500 font-mono">{c.email}</div>
                        </div>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-400 font-mono">{c.role || 'EDITOR'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <span className="text-[11px] text-zinc-400 hidden xl:inline">
            Comparing <strong className="text-zinc-300">Master Repository</strong> ➔ <strong className="text-amber-300">Working Fork</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle Split / Unified View */}
          <button
            onClick={() => setRenderSideBySide(!renderSideBySide)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#21262D] hover:bg-[#30363D] text-zinc-200 border border-[#30363D] text-[11px] transition-colors cursor-pointer"
            title={renderSideBySide ? "Switch to Unified Inline Diff" : "Switch to Split Side-by-Side Diff"}
          >
            <span className="material-symbols-outlined text-xs">
              {renderSideBySide ? 'vertical_split' : 'horizontal_split'}
            </span>
            <span>{renderSideBySide ? 'Side-by-Side' : 'Unified'}</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-600/40 text-[11px] font-bold transition-colors cursor-pointer"
              title="Return to standard code editor"
            >
              <span className="material-symbols-outlined text-xs">edit</span>
              <span>Edit Code</span>
            </button>
          )}
        </div>
      </div>

      {/* Monaco Native Diff Editor */}
      <div className="flex-1 w-full h-[calc(100%-40px)] relative">
        <DiffEditor
          height="100%"
          language={language || 'javascript'}
          original={originalContent || ''}
          modified={modifiedContent || ''}
          theme={isDark ? 'vs-dark' : 'light'}
          options={{
            readOnly: true,
            renderSideBySide,
            automaticLayout: true,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 20,
            fontFamily: "'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace",
            renderIndicators: true,
            diffWordWrap: 'on',
            scrollBeyondLastLine: false
          }}
        />
      </div>
    </div>
  );
};

export default GitHubDiffViewer;
