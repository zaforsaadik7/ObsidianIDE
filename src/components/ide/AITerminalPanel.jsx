import React from 'react';

export const AITerminalPanel = ({ 
  isOpen, 
  onClose, 
  onRunDiagnostics, 
  isAnalyzing, 
  aiFeedback, 
  currentFileName = 'main.rs' 
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute bottom-8 left-64 right-72 h-64 bg-[#0E0E10] border-t border-outline-variant shadow-2xl z-[150] flex flex-col font-mono text-xs select-none">
      {/* Console Top Header Bar */}
      <div className="h-9 px-4 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-surface-tint text-base">psychology</span>
          <span className="font-bold text-on-surface text-xs font-headline">GEMINI AI DIAGNOSTIC CONSOLE</span>
          <span className="bg-cyan-950 text-cyan-400 border border-cyan-800 text-[9px] px-1.5 py-0.2 uppercase">
            gemini-1.5-flash
          </span>
          <span className="text-on-surface-variant text-[11px]">[{currentFileName}]</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRunDiagnostics}
            disabled={isAnalyzing}
            className="bg-surface-tint text-neutral-900 px-3 py-1 font-bold text-[11px] hover:bg-cyan-400 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-xs">play_arrow</span>
            {isAnalyzing ? 'ANALYZING CODE...' : 'RUN DIAGNOSTICS'}
          </button>

          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-red-400"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="flex-1 p-4 overflow-y-auto text-on-surface space-y-2 bg-[#0A0A0B]">
        {isAnalyzing ? (
          <div className="h-full flex items-center justify-center gap-2 text-surface-tint animate-pulse">
            <span className="material-symbols-outlined text-lg animate-spin">sync</span>
            <span>Running Agentic AI Code Analysis via Gemini API...</span>
          </div>
        ) : aiFeedback ? (
          <div className="prose prose-invert max-w-none text-xs font-mono leading-relaxed whitespace-pre-wrap">
            {aiFeedback}
          </div>
        ) : (
          <div className="text-on-surface-variant/60 py-6 text-center">
            Click <strong className="text-surface-tint">"RUN DIAGNOSTICS"</strong> to analyze active buffer syntax, logical edge cases, and performance optimizations.
          </div>
        )}
      </div>
    </div>
  );
};
