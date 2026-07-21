import React from 'react';
import Editor from '@monaco-editor/react';

export const MonacoEditorCanvas = ({ 
  openFiles = [], 
  activeFile, 
  onSelectTab, 
  onCloseTab, 
  currentContent, 
  onChangeContent, 
  onSaveFile,
  isSaving,
  isUnsaved 
}) => {

  const getLanguageForFile = (filePath = '') => {
    if (filePath.endsWith('.rs')) return 'rust';
    if (filePath.endsWith('.py')) return 'python';
    if (filePath.endsWith('.ts') || filePath.endsWith('.js')) return 'typescript';
    if (filePath.endsWith('.html')) return 'html';
    if (filePath.endsWith('.css')) return 'css';
    if (filePath.endsWith('.json')) return 'json';
    if (filePath.endsWith('.toml')) return 'toml';
    return 'plaintext';
  };

  return (
    <section className="flex-1 min-w-0 bg-surface-dark border-r border-outline-variant flex flex-col h-full overflow-hidden">
      {/* Top Open Files Tab Ribbon */}
      <div className="h-9 flex items-center bg-surface-container-lowest border-b border-outline-variant overflow-x-auto shrink-0 font-mono text-xs select-none">
        {openFiles.map((file) => {
          const isActive = activeFile?.fileId === file.fileId;
          return (
            <div
              key={file.fileId}
              onClick={() => onSelectTab(file)}
              className={`h-full px-4 flex items-center gap-2 border-r border-outline-variant cursor-pointer transition-colors ${
                isActive
                  ? 'bg-surface-dark text-surface-tint border-t-2 border-t-surface-tint font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low'
              }`}
            >
              <span className="material-symbols-outlined text-sm">
                {getLanguageForFile(file.filePath) === 'rust' ? 'terminal' : 'code'}
              </span>
              <span>{file.filePath.split('/').pop()}</span>

              {/* Unsaved Cyan Dot Indicator */}
              {isActive && isUnsaved && (
                <div className="w-2 h-2 rounded-full bg-surface-tint shadow-[0_0_6px_#00dce5]" title="Unsaved Edits"></div>
              )}

              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(file);
                }}
                className="hover:text-red-400 ml-1 text-xs"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Center Monaco Editor Viewport */}
      <div className="flex-1 relative bg-[#0E0E10]">
        {activeFile ? (
          <Editor
            height="100%"
            language={getLanguageForFile(activeFile.filePath)}
            theme="vs-dark"
            value={currentContent}
            onChange={(val) => onChangeContent(val || '')}
            options={{
              fontSize: 13,
              fontFamily: 'JetBrains Mono',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              lineNumbersMinChars: 3,
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center font-mono text-xs text-on-surface-variant">
            No file open. Select a file from the explorer to begin editing.
          </div>
        )}
      </div>

      {/* Editor Action Bar (Atomic Save Trigger) */}
      <div className="h-10 bg-surface-container-low border-t border-outline-variant flex items-center justify-between px-4 shrink-0 font-mono text-xs">
        <span className="text-on-surface-variant flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isUnsaved ? 'bg-amber-400' : 'bg-neon-green'}`}></span>
          {isUnsaved ? 'Unsaved local changes in buffer' : 'Plaintext modification state in sync'}
        </span>

        <button
          onClick={onSaveFile}
          disabled={!activeFile || isSaving || !isUnsaved}
          className={`px-4 py-1 font-bold text-xs transition-colors font-mono ${
            isUnsaved && activeFile && !isSaving
              ? 'bg-surface-tint text-neutral-900 hover:bg-cyan-400 cursor-pointer shadow-md'
              : 'bg-surface-container-high text-on-surface-variant/40 cursor-not-allowed opacity-60'
          }`}
        >
          {isSaving ? 'SAVING...' : 'SAVE CHANGES'}
        </button>
      </div>
    </section>
  );
};
