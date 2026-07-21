import React from 'react';

export const ReviewDrawer = ({ isOpen, onClose, patches = [], onResolvePatch }) => {
  if (!isOpen) return null;

  return (
    <aside className="fixed top-12 right-0 bottom-8 w-96 glass-panel z-[250] flex flex-col shadow-2xl border-l border-outline-variant bg-surface-container-low/95 backdrop-blur-xl font-mono text-xs animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-slate">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-surface-tint">reviews</span>
          <h2 className="font-bold text-sm font-headline text-on-surface">Collaboration Review</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-surface-tint text-neutral-900 text-[10px] font-bold px-2 py-0.5 rounded-sm">
            {patches.length} PENDING
          </span>
          <button 
            onClick={onClose}
            className="text-on-surface-variant hover:text-red-400 transition-colors"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      </div>

      {/* Linear Queue of Patch Edits */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {patches.length > 0 ? (
          patches.map((patch) => (
            <div 
              key={patch.patchId} 
              className="bg-surface-container-high/60 p-4 border border-outline-variant/50 space-y-3 rounded-none"
            >
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-surface-tint font-bold">{patch.authorName || 'Collaborator'}</span>
                <span className="text-on-surface-variant/70">
                  {patch.submittedAt ? new Date(patch.submittedAt).toLocaleTimeString() : 'Just Now'}
                </span>
              </div>

              {/* Text Delta Comparison Box */}
              <div className="bg-[#0E0E10] border border-outline-variant/30 p-2.5 space-y-1 text-xs">
                {patch.diffPayload?.removed && (
                  <div className="text-red-400 line-through bg-red-950/20 px-1 py-0.5 font-mono">
                    - {patch.diffPayload.removed}
                  </div>
                )}
                {patch.diffPayload?.added && (
                  <div className="text-green-400 bg-green-950/20 px-1 py-0.5 font-mono">
                    + {patch.diffPayload.added}
                  </div>
                )}
              </div>

              {patch.comment && (
                <p className="text-[11px] text-on-surface-variant italic font-sans">
                  "{patch.comment}"
                </p>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 font-mono text-[11px] pt-1">
                <button
                  onClick={() => onResolvePatch(patch, 'APPROVE')}
                  className="flex-1 bg-cyan-950 text-cyan-400 border border-cyan-800 py-1.5 font-bold hover:bg-cyan-900 transition-colors cursor-pointer"
                >
                  APPROVE
                </button>
                <button
                  onClick={() => onResolvePatch(patch, 'REJECT')}
                  className="flex-1 bg-red-950 text-red-400 border border-red-900 py-1.5 font-bold hover:bg-red-900 transition-colors cursor-pointer"
                >
                  REJECT
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 text-on-surface-variant/60 font-mono text-xs">
            No pending patch reviews in queue.
          </div>
        )}
      </div>
    </aside>
  );
};
