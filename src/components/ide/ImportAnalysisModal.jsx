import React from 'react';

/**
 * ImportAnalysisModal — Pre-Import Verification & Constraint Safety Dialog
 *
 * Displays:
 * - Import batch metadata (type, target folder, file count, total size)
 * - Interactive file tree preview of incoming files
 * - Warning & Error alerts if payload exceeds system limits
 * - Confirmation and cancellation actions
 */
export const ImportAnalysisModal = ({ 
  isOpen, 
  onClose, 
  importData, // { type: 'files' | 'folder' | 'zip', targetFolder: string, files: Array, analysis: Object }
  onConfirm 
}) => {
  if (!isOpen || !importData) return null;

  const { type, targetFolder, files = [], analysis = {} } = importData;
  const { totalCount = 0, totalSizeFormatted = '0 B', warnings = [], errors = [], isValid = true } = analysis;

  const typeLabels = {
    files: 'Local File(s) Import',
    folder: 'Folder Project Tree Import',
    zip: 'ZIP Archive Extraction & Import'
  };

  const typeIcons = {
    files: 'note_add',
    folder: 'folder_open',
    zip: 'folder_zip'
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in font-sans">
      <div className="bg-[#12131A] border border-white/10 rounded-xl shadow-2xl max-w-xl w-full flex flex-col max-h-[85vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-white/[0.08] bg-[#0E0F15] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-cyan-400 text-xl">
              {typeIcons[type] || 'file_upload'}
            </span>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                {typeLabels[type] || 'Import to Project'}
              </h2>
              <p className="text-[11px] text-zinc-400 font-mono">
                Destination: <span className="text-cyan-300 font-bold">{targetFolder ? `/${targetFolder}` : '/ (Project Root)'}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white hover:bg-white/10 rounded transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Modal Body & Statistics */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          
          {/* Analysis Summary Cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#0A0A0E] p-3 rounded-lg border border-white/5 text-center">
              <div className="text-[10px] text-zinc-500 font-mono uppercase">Total Files</div>
              <div className="text-lg font-bold font-mono text-cyan-400 mt-0.5">{totalCount}</div>
            </div>
            <div className="bg-[#0A0A0E] p-3 rounded-lg border border-white/5 text-center">
              <div className="text-[10px] text-zinc-500 font-mono uppercase">Total Payload</div>
              <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">{totalSizeFormatted}</div>
            </div>
            <div className="bg-[#0A0A0E] p-3 rounded-lg border border-white/5 text-center">
              <div className="text-[10px] text-zinc-500 font-mono uppercase">Status</div>
              <div className={`text-xs font-bold font-mono mt-1 ${
                errors.length > 0 ? 'text-rose-400' : warnings.length > 0 ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {errors.length > 0 ? 'Exceeds Limits' : warnings.length > 0 ? 'Warnings' : '✓ Safe to Import'}
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {errors.length > 0 && (
            <div className="bg-rose-950/40 border border-rose-800/60 rounded-lg p-3 text-rose-300 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-rose-400">
                <span className="material-symbols-outlined text-sm">error</span>
                <span>Import Constraints Exceeded:</span>
              </div>
              <ul className="list-disc list-inside text-[11px] space-y-0.5 pl-1 text-rose-300/90 font-mono">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Warning Banner */}
          {warnings.length > 0 && errors.length === 0 && (
            <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg p-3 text-amber-300 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-400">
                <span className="material-symbols-outlined text-sm">warning</span>
                <span>Pre-Import Safety Notice:</span>
              </div>
              <ul className="list-disc list-inside text-[11px] space-y-0.5 pl-1 text-amber-300/90 font-mono">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Incoming File Manifest List */}
          <div>
            <div className="text-[11px] font-mono text-zinc-400 mb-1.5 flex items-center justify-between">
              <span>Incoming Project File Manifest ({files.length}):</span>
              <span className="text-[10px] text-zinc-500">Relative Project Tree Paths</span>
            </div>
            <div className="max-h-48 overflow-y-auto bg-[#08080C] border border-white/5 rounded-lg p-2 font-mono text-[11px] divide-y divide-white/5">
              {files.map((f, idx) => (
                <div key={idx} className="py-1 px-1.5 flex items-center justify-between hover:bg-white/5 rounded transition-colors">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="material-symbols-outlined text-sm text-cyan-400/80">description</span>
                    <span className="text-zinc-200 truncate">{f.filePath}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 shrink-0">
                    {f.size ? (f.size > 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${f.size} B`) : '0 B'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-3 border-t border-white/[0.08] bg-[#0E0F15] flex items-center justify-between">
          <button 
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          
          <button 
            onClick={() => onConfirm(files)}
            disabled={!isValid}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-lg ${
              isValid 
                ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-black hover:brightness-110 cursor-pointer shadow-cyan-500/20' 
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5'
            }`}
          >
            <span className="material-symbols-outlined text-sm">cloud_upload</span>
            <span>Confirm & Import ({files.length} Files)</span>
          </button>
        </div>

      </div>
    </div>
  );
};

export default ImportAnalysisModal;
