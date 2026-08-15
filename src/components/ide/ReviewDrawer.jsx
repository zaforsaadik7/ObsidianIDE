import React, { useState } from 'react';

export const ReviewDrawer = ({ isOpen, onClose, patches = [], onResolvePatch, isOwner = false }) => {
  const [expandedPatchId, setExpandedPatchId] = useState(null);

  if (!isOpen) return null;

  const toggleExpand = (patchId) => {
    setExpandedPatchId(prev => prev === patchId ? null : patchId);
  };

  const getPatchBadge = (type) => {
    switch (type) {
      case 'CREATE_FILE':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">NEW FILE</span>;
      case 'DELETE_FILE':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">DELETE</span>;
      case 'RENAME_FILE':
      case 'MOVE_ITEM':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">MOVE / RENAME</span>;
      case 'IMPORT_BATCH':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">IMPORT BATCH</span>;
      case 'MODIFY_FILE':
      default:
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">CODE EDIT</span>;
    }
  };

  return (
    <aside className="fixed top-12 right-0 bottom-8 w-full sm:w-[420px] z-[250] flex flex-col shadow-2xl border-l border-white/[0.12] bg-[#0E0F17]/98 backdrop-blur-2xl font-mono text-xs duration-200 animate-fade-in">
      {/* Drawer Header */}
      <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-[#121420]/90">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-cyan-400 text-lg">rate_review</span>
          <div>
            <h2 className="font-bold text-sm text-white font-sans tracking-tight">Collaboration Review Drawer</h2>
            <p className="text-[10px] text-zinc-400 font-sans">
              {isOwner ? 'Review & merge collaborator proposals into master repository' : 'Your submitted proposal patches pending Owner approval'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
            patches.length > 0 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse' : 'bg-zinc-800 text-zinc-400'
          }`}>
            {patches.length} PENDING
          </span>
          <button 
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
            title="Close Drawer"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      </div>

      {/* Linear Queue of Patch Edits */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar">
        {patches.length > 0 ? (
          patches.map((patch) => {
            const isExpanded = expandedPatchId === patch.patchId;
            const pType = patch.type || 'MODIFY_FILE';
            const importedCount = patch.importedFiles?.length || 0;

            return (
              <div 
                key={patch.patchId} 
                className="bg-[#141624]/90 p-3.5 border border-white/[0.08] hover:border-cyan-500/30 transition-all rounded-lg space-y-3 shadow-lg"
              >
                {/* Proposal Meta & Type */}
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getPatchBadge(pType)}
                    <span className="text-zinc-200 font-bold font-sans text-xs truncate max-w-[200px]" title={patch.filePath}>
                      {patch.filePath || 'src/main.rs'}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 shrink-0">
                    {patch.submittedAt ? new Date(patch.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just Now'}
                  </span>
                </div>

                {/* Author Info */}
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-sans">
                  <span className="material-symbols-outlined text-xs text-cyan-400">person</span>
                  <span className="text-cyan-300 font-medium">{patch.authorName || 'Collaborator'}</span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-zinc-500 truncate max-w-[170px]">{patch.authorEmail}</span>
                </div>

                {/* Diff / Payload Render based on Proposal Type */}
                {pType === 'MODIFY_FILE' && (
                  <div className="bg-[#0A0B10] border border-white/[0.06] rounded p-2 space-y-1 text-[11px] overflow-x-auto max-h-40">
                    {patch.diffPayload?.removed && (
                      <div className="text-red-400 bg-red-950/20 px-1.5 py-0.5 rounded font-mono whitespace-pre-wrap break-words border-l-2 border-red-500/50">
                        - {patch.diffPayload.removed}
                      </div>
                    )}
                    {patch.diffPayload?.added && (
                      <div className="text-emerald-400 bg-emerald-950/20 px-1.5 py-0.5 rounded font-mono whitespace-pre-wrap break-words border-l-2 border-emerald-500/50">
                        + {patch.diffPayload.added}
                      </div>
                    )}
                  </div>
                )}

                {pType === 'CREATE_FILE' && (
                  <div className="bg-[#0A0B10] border border-emerald-500/20 rounded p-2.5 space-y-1 text-[11px]">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-sans font-bold">
                      <span className="material-symbols-outlined text-xs">add_box</span>
                      <span>Proposed New File: {patch.filePath}</span>
                    </div>
                    {patch.fullProposedContent && (
                      <div className="text-zinc-400 font-mono text-[10px] max-h-24 overflow-y-auto bg-black/40 p-1.5 rounded">
                        <pre className="whitespace-pre-wrap">{patch.fullProposedContent.slice(0, 300)}</pre>
                      </div>
                    )}
                  </div>
                )}

                {pType === 'DELETE_FILE' && (
                  <div className="bg-rose-950/20 border border-rose-500/30 rounded p-2.5 text-rose-300 text-[11px] font-sans flex items-center gap-2">
                    <span className="material-symbols-outlined text-rose-400 text-sm">delete_forever</span>
                    <span>Proposes permanent deletion of: <code className="font-mono bg-black/40 px-1 rounded">{patch.filePath}</code></span>
                  </div>
                )}

                {(pType === 'RENAME_FILE' || pType === 'MOVE_ITEM') && (
                  <div className="bg-purple-950/20 border border-purple-500/30 rounded p-2.5 text-purple-200 text-[11px] font-sans space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-purple-400 text-sm">drive_file_move</span>
                      <span>Item Reorganization:</span>
                    </div>
                    <div className="font-mono text-[10px] text-zinc-400 flex items-center gap-2 bg-black/40 p-1.5 rounded">
                      <span className="line-through text-red-400">{patch.oldPath || patch.filePath}</span>
                      <span className="text-cyan-400">➔</span>
                      <span className="text-emerald-400 font-bold">{patch.newPath}</span>
                    </div>
                  </div>
                )}

                {pType === 'IMPORT_BATCH' && (
                  <div className="bg-amber-950/20 border border-amber-500/30 rounded p-2.5 space-y-2 text-[11px] font-sans">
                    <div className="flex items-center justify-between text-amber-300 font-bold">
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">inventory_2</span>
                        <span>Imported Archive Package</span>
                      </span>
                      <span className="bg-amber-500/30 px-1.5 py-0.5 rounded text-[10px] font-mono">
                        {importedCount} file(s)
                      </span>
                    </div>
                    
                    <button
                      onClick={() => toggleExpand(patch.patchId)}
                      className="text-cyan-400 hover:text-cyan-300 text-[10px] flex items-center gap-1 cursor-pointer font-sans"
                    >
                      <span>{isExpanded ? 'Hide' : 'Inspect'} Manifest Details</span>
                      <span className="material-symbols-outlined text-xs">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                    </button>

                    {isExpanded && patch.importedFiles && (
                      <div className="max-h-32 overflow-y-auto space-y-1 font-mono text-[10px] bg-black/50 p-2 rounded border border-white/5">
                        {patch.importedFiles.map((f, idx) => (
                          <div key={idx} className="text-zinc-300 flex items-center gap-1.5 truncate">
                            <span className="material-symbols-outlined text-[10px] text-amber-400">draft</span>
                            <span>{f.filePath}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Summary / Reason Note */}
                {patch.summaryNote && (
                  <p className="text-[11px] text-zinc-400 italic font-sans bg-black/20 p-1.5 rounded">
                    "{patch.summaryNote}"
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-1 font-sans">
                  <button
                    onClick={() => onResolvePatch(patch, 'APPROVE')}
                    className="flex-1 bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 hover:from-cyan-500/30 hover:to-emerald-500/30 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 py-1.5 rounded font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.1)]"
                  >
                    <span className="material-symbols-outlined text-xs">check_circle</span>
                    <span>Approve & Merge</span>
                  </button>
                  <button
                    onClick={() => onResolvePatch(patch, 'REJECT')}
                    className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:border-rose-500/50 py-1.5 rounded font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-xs">cancel</span>
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-16 text-zinc-500 font-sans space-y-2">
            <span className="material-symbols-outlined text-3xl text-zinc-600">task_alt</span>
            <p className="text-xs">No pending collaborator proposals.</p>
            <p className="text-[10px] text-zinc-600">All submitted changes have been reviewed or merged.</p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default ReviewDrawer;
