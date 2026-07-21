import React, { useState } from 'react';
import { parseFlatArrayToTreeNodes } from '../../utils/flatTreeParser';

export const FileExplorer = ({ files = [], activeFile, onSelectFile, onCreateFile, projectTitle = 'Quantum_Router' }) => {
  const [newFilePath, setNewFilePath] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const tree = parseFlatArrayToTreeNodes(files);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (newFilePath.trim()) {
      onCreateFile(newFilePath.trim());
      setNewFilePath('');
      setIsCreating(false);
    }
  };

  const renderFolderNode = (folderNode, depth = 0) => {
    return (
      <div key={folderNode.name} style={{ paddingLeft: `${depth * 12}px` }}>
        {folderNode.name !== 'root' && (
          <div className="flex items-center gap-1.5 py-1 text-on-surface font-bold cursor-pointer hover:text-surface-tint">
            <span className="material-symbols-outlined text-sm">expand_more</span>
            <span>{folderNode.name}</span>
          </div>
        )}

        {/* Subfolders */}
        {Object.values(folderNode.children).map(subFolder => renderFolderNode(subFolder, depth + 1))}

        {/* Files */}
        {folderNode.files.map(item => {
          const isSelected = activeFile?.fileId === item.fileObj.fileId;
          return (
            <div
              key={item.fileObj.fileId}
              onClick={() => onSelectFile(item.fileObj)}
              style={{ paddingLeft: `${(depth + 1) * 12}px` }}
              className={`flex items-center gap-2 py-1 cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-secondary-container/30 text-surface-tint border-r-2 border-surface-tint font-bold'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40'
              }`}
            >
              <span className="material-symbols-outlined text-sm">
                {item.name.endsWith('.rs') || item.name.endsWith('.py') || item.name.endsWith('.js') ? 'code' : 'description'}
              </span>
              <span className="truncate">{item.name}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section className="w-64 bg-surface-container-lowest border-r border-outline-variant flex flex-col h-full overflow-hidden shrink-0 font-mono text-xs select-none">
      <div className="h-9 px-3 flex items-center justify-between border-b border-outline-variant bg-surface-container-low text-[10px] text-on-surface-variant uppercase tracking-wider">
        <span>Flat Directory Explorer</span>
        <button 
          onClick={() => setIsCreating(!isCreating)}
          className="hover:text-surface-tint text-sm flex items-center justify-center p-1 rounded"
          title="Create New File"
        >
          <span className="material-symbols-outlined text-sm">add</span>
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreateSubmit} className="p-2 border-b border-outline-variant bg-surface-slate">
          <input
            type="text"
            value={newFilePath}
            onChange={(e) => setNewFilePath(e.target.value)}
            className="w-full bg-[#1A1A1C] border border-outline-variant p-1 text-[11px] text-on-surface focus:outline-none focus:border-surface-tint"
            placeholder="e.g. src/utils/helper.rs"
            autoFocus
          />
        </form>
      )}

      <div className="p-2 flex flex-col gap-0.5 overflow-y-auto flex-1">
        <div className="flex items-center gap-2 py-1 text-on-surface font-bold">
          <span className="material-symbols-outlined text-sm text-surface-tint">folder</span>
          <span>{projectTitle}</span>
        </div>
        <div className="pl-2">
          {renderFolderNode(tree)}
        </div>
      </div>
    </section>
  );
};
