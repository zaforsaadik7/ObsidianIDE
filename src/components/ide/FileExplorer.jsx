import React, { useState, useRef, useEffect } from 'react';
import { parseFlatArrayToTreeNodes } from '../../utils/flatTreeParser';
import { exportSingleFile } from '../../utils/fileExporter';

/**
 * FileExplorer - VS Code-Grade Directory Explorer for ObsidianIDE
 *
 * Features:
 * - Drag-and-Drop Moveable Files & Folders:
 *   • Grab files and folders with cursor and drag into any folder or back to root.
 *   • Cyan glowing dropzones and validation to prevent circular folder moves.
 * - Local Import Integration:
 *   • Import File(s), Folder Projects, and ZIP Archives into Root or Target Folder.
 * - Collapsible / Expandable folder hierarchy.
 * - 3-Dot Context Dropdown on Every File & Folder.
 * - Top Header: New File, New Folder, Import, Expand/Collapse All.
 */
export const FileExplorer = ({ 
  files = [], 
  activeFile, 
  onSelectFile, 
  onCreateFile, 
  onCreateFolder,
  onRenameFile,
  onDeleteFile,
  onRenameFolder,
  onDeleteFolder,
  onPasteItem,
  onMoveItem,
  onTriggerImport,
  fileStatusMap = {},
  attributions = {},
  projectTitle = 'Project_Workspace',
  isProjectOwner = false,
  onSaveAndSyncMaster,
  onRejectFork,
  isSaving = false,
  width = 256
}) => {
  // Context Menu State
  const [activeMenu, setActiveMenu] = useState(null); // { type: 'file' | 'folder', id: string, fileObj?: object, fileName?: string, folderNode?: object, position: { top: number, left: number } }
  const [exportSubmenuOpen, setExportSubmenuOpen] = useState(false);
  const [importSubmenuOpen, setImportSubmenuOpen] = useState(false);

  // Folder Collapsed States
  const [collapsedFolders, setCollapsedFolders] = useState({});

  // Clipboard State for Cut / Copy
  const [clipboard, setClipboard] = useState(null);

  // Drag and Drop State
  const [draggedItem, setDraggedItem] = useState(null); // { type: 'file' | 'folder', path: string, name: string }
  const [dropTarget, setDropTarget] = useState(null);   // folderPath | '__root__'

  // Interactive Action Modals
  const [modalState, setModalState] = useState(null);
  const [modalInputValue, setModalInputValue] = useState('');

  // ── Smart Context Menu Positioning (Prevents Off-Screen Left/Right/Bottom Clipping) ──
  const getSmartMenuPosition = (targetElement, e = null, menuWidth = 224, menuHeight = 290) => {
    let top = 100;
    let left = 8;

    if (e && e.clientX !== undefined) {
      top = e.clientY + 2;
      left = e.clientX + 2;
    } else if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      top = rect.bottom + 4;
      left = rect.right - menuWidth;
    }

    // Horizontal Boundary Protection (Never clip off left or right of screen)
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuWidth - 8);
    }

    // Vertical Boundary Protection (Flip upwards if near bottom)
    if (top + menuHeight > window.innerHeight - 12) {
      if (targetElement && !e) {
        const rect = targetElement.getBoundingClientRect();
        top = Math.max(10, rect.top - menuHeight - 4);
      } else {
        top = Math.max(10, top - menuHeight - 8);
      }
    }

    return { top, left };
  };

  // Close menus on outside click or scrolling
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (!e.target.closest('.explorer-menu-trigger') && !e.target.closest('.explorer-dropdown-menu')) {
        setActiveMenu(null);
        setExportSubmenuOpen(false);
        setImportSubmenuOpen(false);
      }
    };
    const handleGlobalScroll = (e) => {
      if (e.target.closest && e.target.closest('.explorer-dropdown-menu')) return;
      setActiveMenu(null);
      setExportSubmenuOpen(false);
      setImportSubmenuOpen(false);
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('contextmenu', handleGlobalClick);
    window.addEventListener('scroll', handleGlobalScroll, true);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('contextmenu', handleGlobalClick);
      window.removeEventListener('scroll', handleGlobalScroll, true);
    };
  }, []);

  const tree = parseFlatArrayToTreeNodes(files);

  const toggleFolderCollapse = (folderPath) => {
    setCollapsedFolders(prev => ({
      ...prev,
      [folderPath]: !prev[folderPath]
    }));
  };

  const collapseAll = () => {
    const allCollapsed = {};
    const recurse = (node) => {
      if (node.folderPath) allCollapsed[node.folderPath] = true;
      Object.values(node.children).forEach(recurse);
    };
    recurse(tree);
    setCollapsedFolders(allCollapsed);
  };

  const expandAll = () => {
    setCollapsedFolders({});
  };

  // ── Open Modals ─────────────────────────────────────────────────────────────
  const openModal = (config) => {
    setModalState(config);
    setModalInputValue(config.defaultValue || '');
    setActiveMenu(null);
    setExportSubmenuOpen(false);
    setImportSubmenuOpen(false);
  };

  const closeModal = () => {
    setModalState(null);
    setModalInputValue('');
  };

  const handleModalSubmit = (e) => {
    e.preventDefault();
    if (!modalState) return;

    const val = modalInputValue.trim();
    if (!val && !modalState.action.startsWith('delete')) return;

    switch (modalState.action) {
      case 'new_file': {
        const fullPath = modalState.targetFolder ? `${modalState.targetFolder}/${val}` : val;
        onCreateFile(fullPath);
        break;
      }
      case 'new_folder': {
        const fullPath = modalState.targetFolder ? `${modalState.targetFolder}/${val}` : val;
        if (onCreateFolder) {
          onCreateFolder(fullPath);
        } else {
          onCreateFile(`${fullPath}/.gitkeep`);
        }
        break;
      }
      case 'rename_file': {
        if (modalState.fileObj && onRenameFile) {
          onRenameFile(modalState.fileObj, val);
        }
        break;
      }
      case 'rename_folder': {
        if (modalState.folderPath && onRenameFolder) {
          onRenameFolder(modalState.folderPath, val);
        }
        break;
      }
      case 'delete_file': {
        if (modalState.fileObj && onDeleteFile) {
          onDeleteFile(modalState.fileObj);
        }
        break;
      }
      case 'delete_folder': {
        if (modalState.folderPath && onDeleteFolder) {
          onDeleteFolder(modalState.folderPath);
        }
        break;
      }
      default:
        break;
    }
    closeModal();
  };

  // ── Cut / Copy / Paste Clipboard ──────────────────────────────────────────
  const handleCut = (target, type = 'file') => {
    setClipboard({ type, op: 'cut', ...(type === 'file' ? { fileObj: target } : { folderPath: target }) });
    setActiveMenu(null);
  };

  const handleCopy = (target, type = 'file') => {
    setClipboard({ type, op: 'copy', ...(type === 'file' ? { fileObj: target } : { folderPath: target }) });
    setActiveMenu(null);
  };

  const handlePaste = (targetFolder = '') => {
    if (!clipboard || !onPasteItem) return;
    onPasteItem(clipboard, targetFolder);
    if (clipboard.op === 'cut') setClipboard(null);
    setActiveMenu(null);
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setActiveMenu(null);
  };

  // ── Drag & Drop Handlers ──────────────────────────────────────────────────
  const handleDragStart = (e, item, type) => {
    e.stopPropagation();
    const payload = {
      type,
      path: type === 'file' ? item.filePath : item.folderPath,
      name: type === 'file' ? item.fileName : item.name
    };
    setDraggedItem(payload);
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverFolder = (e, folderPath) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedItem) return;

    // Cannot drop folder into itself or its descendant
    if (draggedItem.type === 'folder') {
      if (draggedItem.path === folderPath || folderPath.startsWith(draggedItem.path + '/')) {
        e.dataTransfer.dropEffect = 'none';
        return;
      }
    }

    e.dataTransfer.dropEffect = 'move';
    if (dropTarget !== folderPath) {
      setDropTarget(folderPath);
    }
  };

  const handleDropOnFolder = (e, targetFolder) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);

    if (draggedItem && onMoveItem) {
      onMoveItem(draggedItem.type, draggedItem.path, targetFolder);
    }
    setDraggedItem(null);
  };

  const getFileIcon = (fileName = '') => {
    const ext = fileName.split('.').pop().toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
        return { icon: 'javascript', color: 'text-yellow-400' };
      case 'ts':
      case 'tsx':
        return { icon: 'code', color: 'text-blue-400' };
      case 'py':
        return { icon: 'terminal', color: 'text-yellow-300' };
      case 'cpp':
      case 'c':
      case 'h':
      case 'hpp':
        return { icon: 'code_blocks', color: 'text-cyan-400' };
      case 'java':
        return { icon: 'coffee', color: 'text-amber-400' };
      case 'cs':
        return { icon: 'data_object', color: 'text-purple-400' };
      case 'html':
      case 'htm':
        return { icon: 'html', color: 'text-orange-400' };
      case 'css':
      case 'scss':
        return { icon: 'css', color: 'text-blue-300' };
      case 'json':
        return { icon: 'schema', color: 'text-emerald-400' };
      case 'md':
        return { icon: 'article', color: 'text-zinc-300' };
      case 'svg':
      case 'png':
      case 'jpg':
        return { icon: 'image', color: 'text-pink-400' };
      case 'php':
        return { icon: 'php', color: 'text-indigo-400' };
      case 'sh':
      case 'bash':
        return { icon: 'terminal', color: 'text-emerald-400' };
      case 'zip':
        return { icon: 'folder_zip', color: 'text-amber-400' };
      default:
        return { icon: 'description', color: 'text-zinc-400' };
    }
  };

  // ── Recursive Folder Node Renderer ─────────────────────────────────────────
  const renderFolderNode = (folderNode, depth = 0) => {
    const isRoot = !folderNode.folderPath;
    const isFolderCollapsed = collapsedFolders[folderNode.folderPath];
    const isPasteTarget = clipboard !== null;
    const isCutStaged = clipboard?.type === 'folder' && clipboard?.op === 'cut' && clipboard?.folderPath === folderNode.folderPath;
    const isHoveredDropTarget = dropTarget === folderNode.folderPath;

    return (
      <div 
        key={folderNode.folderPath || 'root'} 
        className="flex flex-col"
        onDragOver={(e) => !isRoot && handleDragOverFolder(e, folderNode.folderPath)}
        onDragLeave={(e) => {
          e.stopPropagation();
          if (dropTarget === folderNode.folderPath) setDropTarget(null);
        }}
        onDrop={(e) => !isRoot && handleDropOnFolder(e, folderNode.folderPath)}
      >
        {/* Folder Header Row (Hide for root wrapper) */}
        {!isRoot && (
          <div 
            style={{ paddingLeft: `${depth * 10}px` }}
            draggable={true}
            onDragStart={(e) => handleDragStart(e, folderNode, 'folder')}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const pos = getSmartMenuPosition(null, e, 224, 300);
              setActiveMenu({
                type: 'folder',
                id: folderNode.folderPath,
                folderNode,
                position: pos
              });
              setExportSubmenuOpen(false);
              setImportSubmenuOpen(false);
            }}
            className={`group relative flex items-center justify-between py-1 px-1.5 rounded cursor-pointer transition-all text-xs select-none ${
              isCutStaged
                ? 'opacity-40 border border-dashed border-zinc-500'
                : isHoveredDropTarget
                  ? 'bg-cyan-500/25 text-cyan-200 border-2 border-cyan-400 shadow-[0_0_12px_#06b6d4]'
                  : 'text-zinc-300 hover:text-white hover:bg-white/[0.04]'
            }`}
            onClick={() => toggleFolderCollapse(folderNode.folderPath)}
          >
            <div className="flex items-center gap-1.5 truncate">
              <span className="material-symbols-outlined text-xs text-zinc-500 transition-transform">
                {isFolderCollapsed ? 'chevron_right' : 'expand_more'}
              </span>
              <span className="material-symbols-outlined text-sm text-cyan-400">
                {isFolderCollapsed ? 'folder' : 'folder_open'}
              </span>
              <span className="truncate font-semibold text-[11px]">{folderNode.name}</span>
            </div>

            {/* Folder 3-Dot Action Menu Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (activeMenu?.type === 'folder' && activeMenu.id === folderNode.folderPath) {
                  setActiveMenu(null);
                } else {
                  const pos = getSmartMenuPosition(e.currentTarget, null, 224, 300);
                  setActiveMenu({
                    type: 'folder',
                    id: folderNode.folderPath,
                    folderNode,
                    position: pos
                  });
                }
                setExportSubmenuOpen(false);
                setImportSubmenuOpen(false);
              }}
              className="explorer-menu-trigger opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-opacity"
              title="Folder Options"
            >
              <span className="material-symbols-outlined text-sm">more_vert</span>
            </button>
          </div>
        )}

        {/* Sub-Items (Shown if not collapsed) */}
        {!isFolderCollapsed && (
          <div className="flex flex-col gap-0.5">
            {/* Subfolders */}
            {Object.values(folderNode.children).map(subFolder => renderFolderNode(subFolder, depth + 1))}

            {/* Files inside this folder */}
            {folderNode.files.map(item => {
              const isSelected = activeFile?.fileId === item.fileObj.fileId || activeFile?.filePath === item.fileObj.filePath;
              const { icon, color } = getFileIcon(item.name);
              const isCutStaged = clipboard?.type === 'file' && clipboard?.op === 'cut' && (clipboard?.fileObj?.fileId === item.fileObj.fileId || clipboard?.fileObj?.filePath === item.fileObj.filePath);

              return (
                <div
                  key={item.fileObj.fileId || item.fileObj.filePath}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, item.fileObj, 'file')}
                  onClick={() => onSelectFile(item.fileObj)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectFile(item.fileObj);
                    const pos = getSmartMenuPosition(null, e, 210, 300);
                    setActiveMenu({
                      type: 'file',
                      id: item.fileObj.fileId || item.fileObj.filePath,
                      fileObj: item.fileObj,
                      fileName: item.name,
                      position: pos
                    });
                    setExportSubmenuOpen(false);
                    setImportSubmenuOpen(false);
                  }}
                  style={{ paddingLeft: isRoot ? '8px' : `${(depth + 1) * 10}px` }}
                  className={`group relative flex items-center justify-between py-1 px-1.5 rounded cursor-pointer transition-colors text-[11px] select-none ${
                    isCutStaged
                      ? 'opacity-40 border border-dashed border-zinc-500'
                      : isSelected
                        ? 'bg-cyan-500/15 text-cyan-300 border-l-2 border-cyan-400 font-semibold'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className={`material-symbols-outlined text-[15px] ${color}`}>{icon}</span>
                    <span className={`truncate ${fileStatusMap[item.fileObj.filePath] === 'DELETED' ? 'line-through text-rose-400' : ''}`}>
                      {item.name}
                    </span>

                    {/* GitHub-Style Change Indicator Badge with Collaborator Author Attribution */}
                    {fileStatusMap[item.fileObj.filePath] === 'ADDED' && (
                      <span 
                        className="px-1.5 py-0.2 rounded text-[9px] font-bold font-mono bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 shadow-sm" 
                        title={`New file added in Working Fork (by ${item.fileObj.lastModifiedBy || 'Developer'})`}
                      >
                        A
                      </span>
                    )}
                    {fileStatusMap[item.fileObj.filePath] === 'MODIFIED' && (() => {
                      const author = item.fileObj.lastModifiedBy || attributions[item.fileObj.filePath]?.lastModifiedBy?.authorEmail || '';
                      const authorShort = author ? author.split('@')[0] : '';
                      return (
                        <span 
                          className="flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold font-mono bg-amber-950/90 text-amber-300 border border-amber-500/50 shadow-sm" 
                          title={`Modified by: ${author || 'Collaborator'}`}
                        >
                          <span>M</span>
                          {authorShort && <span className="text-[8px] text-amber-200/80 font-sans truncate max-w-[55px] hidden xl:inline">by {authorShort}</span>}
                        </span>
                      );
                    })()}
                    {fileStatusMap[item.fileObj.filePath] === 'DELETED' && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold font-mono bg-rose-950/90 text-rose-300 border border-rose-500/50 shadow-sm" title="File deleted in Working Fork">
                        D
                      </span>
                    )}
                    {fileStatusMap[item.fileObj.filePath] === 'RENAMED' && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold font-mono bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-sm" title="File moved or renamed">
                        R
                      </span>
                    )}
                  </div>

                  {/* File 3-Dot Action Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeMenu?.type === 'file' && activeMenu.id === (item.fileObj.fileId || item.fileObj.filePath)) {
                        setActiveMenu(null);
                      } else {
                        const pos = getSmartMenuPosition(e.currentTarget, null, 210, 300);
                        setActiveMenu({
                          type: 'file',
                          id: item.fileObj.fileId || item.fileObj.filePath,
                          fileObj: item.fileObj,
                          fileName: item.name,
                          position: pos
                        });
                      }
                      setExportSubmenuOpen(false);
                      setImportSubmenuOpen(false);
                    }}
                    className="explorer-menu-trigger opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-opacity"
                    title="File Options"
                  >
                    <span className="material-symbols-outlined text-sm">more_vert</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside 
      style={{ width: `${width}px` }}
      className="bg-[#0D0E14] border-r border-white/[0.08] flex flex-col h-full font-mono text-xs select-none shrink-0 relative"
    >
      {/* Explorer Top Toolbar */}
      <div className="p-2 border-b border-white/[0.06] flex items-center justify-between text-zinc-400 text-[11px]">
        <span className="font-bold tracking-wider uppercase text-zinc-300 text-[10px] truncate px-1">
          {projectTitle}
        </span>
        
        <div className="flex items-center gap-1">
          {/* Quick Import Header Button */}
          <button
            onClick={() => onTriggerImport && onTriggerImport('files', '')}
            className="p-1 hover:bg-white/10 hover:text-cyan-300 rounded transition-colors cursor-pointer"
            title="Import Local File(s) to Project"
          >
            <span className="material-symbols-outlined text-sm text-cyan-400">file_upload</span>
          </button>
          
          <button
            onClick={() => openModal({ action: 'new_file', targetFolder: '' })}
            className="p-1 hover:bg-white/10 hover:text-white rounded transition-colors cursor-pointer"
            title="New File (Root)"
          >
            <span className="material-symbols-outlined text-sm">note_add</span>
          </button>
          <button
            onClick={() => openModal({ action: 'new_folder', targetFolder: '' })}
            className="p-1 hover:bg-white/10 hover:text-white rounded transition-colors cursor-pointer"
            title="New Folder (Root)"
          >
            <span className="material-symbols-outlined text-sm">create_new_folder</span>
          </button>
          <button
            onClick={collapseAll}
            className="p-1 hover:bg-white/10 hover:text-white rounded transition-colors cursor-pointer"
            title="Collapse All Folders"
          >
            <span className="material-symbols-outlined text-sm">unfold_less</span>
          </button>
          <button
            onClick={expandAll}
            className="p-1 hover:bg-white/10 hover:text-white rounded transition-colors cursor-pointer"
            title="Expand All Folders"
          >
            <span className="material-symbols-outlined text-sm">unfold_more</span>
          </button>
        </div>
      </div>

      {/* GitHub-Style Working Fork Staged Modifications Banner */}
      {Object.keys(fileStatusMap).length > 0 && (
        <div className={`px-2.5 py-1.5 border-b flex items-center justify-between text-[10px] font-mono ${
          isProjectOwner
            ? 'bg-cyan-950/60 border-cyan-500/40 text-cyan-200'
            : 'bg-amber-950/40 border-amber-500/30 text-amber-200'
        }`}>
          <div className="flex items-center gap-1.5 font-bold truncate">
            <span className={`inline-block w-2 h-2 rounded-full animate-pulse ${isProjectOwner ? 'bg-cyan-400' : 'bg-amber-400'}`} />
            <span className="truncate">
              {isProjectOwner ? 'Fork Proposals' : 'Working Fork'}: {Object.keys(fileStatusMap).length} change{Object.keys(fileStatusMap).length > 1 ? 's' : ''}
            </span>
          </div>
          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
            isProjectOwner
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
          }`}>
            {isProjectOwner ? 'PENDING APPROVAL' : 'PENDING MERGE'}
          </span>
        </div>
      )}

      {/* Directory File Tree View */}
      <div 
        className="flex-1 overflow-y-auto p-1 space-y-0.5"
        onDragOver={(e) => {
          e.preventDefault();
          if (draggedItem) e.dataTransfer.dropEffect = 'move';
        }}
      >
        {renderFolderNode(tree, 0)}

        {/* ── Dropzone to Move to Project Root ── */}
        {draggedItem && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDropTarget('__root__');
              e.dataTransfer.dropEffect = 'move';
            }}
            onDragLeave={() => {
              if (dropTarget === '__root__') setDropTarget(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDropTarget(null);
              if (draggedItem && onMoveItem) {
                onMoveItem(draggedItem.type, draggedItem.path, '');
              }
              setDraggedItem(null);
            }}
            className={`mt-3 p-2.5 border-2 border-dashed rounded-lg text-center font-mono text-[10px] transition-all cursor-copy ${
              dropTarget === '__root__' 
                ? 'border-cyan-400 bg-cyan-500/25 text-cyan-300 font-bold shadow-[0_0_12px_#06b6d4]' 
                : 'border-white/15 bg-white/[0.02] text-zinc-500 hover:border-cyan-500/50 hover:text-zinc-300'
            }`}
          >
            <div className="flex items-center justify-center gap-1">
              <span className="material-symbols-outlined text-sm text-cyan-400">move_up</span>
              <span>Drop here to move to Project Root (/)</span>
            </div>
          </div>
        )}
      </div>

      {/* Universal Fixed-Position Context Menu (Never clipped or pushed off-screen) */}
      {activeMenu && activeMenu.position && (
        <div 
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: `${activeMenu.position.top}px`,
            left: `${activeMenu.position.left}px`,
            zIndex: 999
          }}
          className="explorer-dropdown-menu w-56 bg-[#12131A] border border-white/10 rounded-lg shadow-2xl py-1 text-[11px] divide-y divide-white/5 animate-fade-in font-sans"
        >
          {activeMenu.type === 'folder' && activeMenu.folderNode && (
            <>
              <div className="py-1">
                <button
                  onClick={() => openModal({ action: 'new_file', targetFolder: activeMenu.folderNode.folderPath })}
                  className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/20 hover:text-cyan-300 flex items-center gap-2 cursor-pointer font-medium"
                >
                  <span className="material-symbols-outlined text-sm text-cyan-400">note_add</span>
                  <span>New File in Folder...</span>
                </button>
                <button
                  onClick={() => openModal({ action: 'new_folder', targetFolder: activeMenu.folderNode.folderPath })}
                  className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/20 hover:text-cyan-300 flex items-center gap-2 cursor-pointer font-medium"
                >
                  <span className="material-symbols-outlined text-sm text-cyan-400">create_new_folder</span>
                  <span>New Subfolder...</span>
                </button>
              </div>

              {/* Import Submenu */}
              <div className="py-1">
                <button
                  onClick={() => {
                    if (onTriggerImport) onTriggerImport('files', activeMenu.folderNode.folderPath);
                    setActiveMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/20 hover:text-cyan-300 flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-cyan-400">file_upload</span>
                  <span>Import Files to Folder...</span>
                </button>
                <button
                  onClick={() => {
                    if (onTriggerImport) onTriggerImport('folder', activeMenu.folderNode.folderPath);
                    setActiveMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/20 hover:text-cyan-300 flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-emerald-400">drive_folder_upload</span>
                  <span>Import Subfolder Tree...</span>
                </button>
                <button
                  onClick={() => {
                    if (onTriggerImport) onTriggerImport('zip', activeMenu.folderNode.folderPath);
                    setActiveMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/20 hover:text-cyan-300 flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-amber-400">folder_zip</span>
                  <span>Import & Unzip into Folder...</span>
                </button>
              </div>

              <div className="py-1">
                {clipboard && (clipboard.type === 'file' || (clipboard.type === 'folder' && clipboard.folderPath !== activeMenu.folderNode.folderPath)) && (
                  <button
                    onClick={() => handlePaste(activeMenu.folderNode.folderPath)}
                    className="w-full text-left px-3 py-1.5 text-emerald-300 hover:bg-emerald-500/20 flex items-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm text-emerald-400">content_paste</span>
                    <span>Paste into Folder</span>
                  </button>
                )}
                <button
                  onClick={() => handleCut(activeMenu.folderNode.folderPath, 'folder')}
                  className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-zinc-400">content_cut</span>
                  <span>Cut Folder</span>
                </button>
                <button
                  onClick={() => handleCopy(activeMenu.folderNode.folderPath, 'folder')}
                  className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-zinc-400">content_copy</span>
                  <span>Copy Folder</span>
                </button>
              </div>

              <div className="py-1">
                <button
                  onClick={() => openModal({ action: 'rename_folder', folderPath: activeMenu.folderNode.folderPath, defaultValue: activeMenu.folderNode.name })}
                  className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-amber-400">edit</span>
                  <span>Rename Folder</span>
                </button>
                <button
                  onClick={() => openModal({ action: 'delete_folder', folderPath: activeMenu.folderNode.folderPath, folderName: activeMenu.folderNode.name })}
                  className="w-full text-left px-3 py-1.5 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-rose-400">delete</span>
                  <span>Delete Folder</span>
                </button>
              </div>
            </>
          )}

          {activeMenu.type === 'file' && activeMenu.fileObj && (
            <>
              {/* Export Submenu */}
              <div className="py-1 relative">
                <button
                  onClick={() => setExportSubmenuOpen(prev => !prev)}
                  className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/20 hover:text-cyan-300 flex justify-between items-center cursor-pointer font-medium"
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-cyan-400">download</span>
                    <span>Export File</span>
                  </span>
                  <span className="material-symbols-outlined text-xs">{exportSubmenuOpen ? 'expand_less' : 'chevron_right'}</span>
                </button>

                {exportSubmenuOpen && (
                  <div className={`absolute top-0 w-44 bg-[#161722] border border-white/10 rounded-lg shadow-2xl py-1 z-[1000] divide-y divide-white/5 animate-fade-in ${
                    (activeMenu.position.left + 224 + 176 > window.innerWidth)
                      ? 'right-full mr-1'
                      : 'left-full ml-1'
                  }`}>
                    <button
                      onClick={() => { exportSingleFile(activeMenu.fileObj, 'original'); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/20 hover:text-cyan-300 flex items-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm text-cyan-400">save</span>
                      <span>Original (.{activeMenu.fileName?.split('.').pop() || 'txt'})</span>
                    </button>
                    <button
                      onClick={() => { exportSingleFile(activeMenu.fileObj, 'txt'); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/20 hover:text-cyan-300 flex items-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm text-yellow-400">description</span>
                      <span>Plain Text (.txt)</span>
                    </button>
                    <button
                      onClick={() => { exportSingleFile(activeMenu.fileObj, 'md'); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/20 hover:text-cyan-300 flex items-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm text-blue-400">article</span>
                      <span>Markdown (.md)</span>
                    </button>
                    <button
                      onClick={() => { exportSingleFile(activeMenu.fileObj, 'doc'); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/20 hover:text-cyan-300 flex items-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm text-blue-500">wysiwyg</span>
                      <span>Word Document (.doc)</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="py-1">
                <button
                  onClick={() => handleCut(activeMenu.fileObj, 'file')}
                  className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-zinc-400">content_cut</span>
                  <span>Cut</span>
                </button>
                <button
                  onClick={() => handleCopy(activeMenu.fileObj, 'file')}
                  className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-zinc-400">content_copy</span>
                  <span>Copy</span>
                </button>
                <button
                  onClick={() => copyToClipboard(activeMenu.fileObj.filePath, 'Relative Path')}
                  className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-zinc-400">link</span>
                  <span>Copy Relative Path</span>
                </button>
                <button
                  onClick={() => copyToClipboard(`${projectTitle}/${activeMenu.fileObj.filePath}`, 'Full Path')}
                  className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-zinc-400">share</span>
                  <span>Copy Full Path</span>
                </button>
              </div>

              <div className="py-1">
                <button
                  onClick={() => openModal({ action: 'rename_file', fileObj: activeMenu.fileObj, defaultValue: activeMenu.fileName })}
                  className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-white/5 flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-amber-400">edit</span>
                  <span>Rename File</span>
                </button>
                <button
                  onClick={() => openModal({ action: 'delete_file', fileObj: activeMenu.fileObj, fileName: activeMenu.fileName })}
                  className="w-full text-left px-3 py-1.5 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-rose-400">delete</span>
                  <span>Delete File</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Action Dialog Modal */}
      {modalState && (
        <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in font-sans">
          <div className="bg-[#161720] border border-white/10 rounded-xl shadow-2xl p-4 w-full max-w-sm">
            <h3 className="text-xs font-bold text-white mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-cyan-400">
                {modalState.action.includes('delete') ? 'warning' : 'edit_square'}
              </span>
              {modalState.action === 'new_file' && 'Create New File'}
              {modalState.action === 'new_folder' && 'Create New Folder'}
              {modalState.action === 'rename_file' && 'Rename File'}
              {modalState.action === 'rename_folder' && 'Rename Folder'}
              {modalState.action === 'delete_file' && 'Confirm Delete File'}
              {modalState.action === 'delete_folder' && 'Confirm Delete Folder'}
            </h3>

            {modalState.action.startsWith('delete') ? (
              <p className="text-[11px] text-zinc-300 mb-4 leading-relaxed">
                Are you sure you want to permanently delete{' '}
                <strong className="text-rose-400">
                  {modalState.fileName || modalState.folderName || 'this item'}
                </strong>? This action cannot be undone.
              </p>
            ) : (
              <form onSubmit={handleModalSubmit}>
                <input
                  type="text"
                  autoFocus
                  value={modalInputValue}
                  onChange={(e) => setModalInputValue(e.target.value)}
                  placeholder={
                    modalState.action.includes('folder') 
                      ? 'Folder name (e.g. components)' 
                      : 'File name (e.g. index.jsx)'
                  }
                  className="w-full bg-[#0A0A0D] border border-white/15 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400 mb-4 font-mono"
                />
              </form>
            )}

            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={closeModal}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleModalSubmit}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  modalState.action.startsWith('delete')
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-gradient-to-r from-cyan-500 to-teal-500 text-black hover:brightness-110'
                }`}
              >
                {modalState.action.startsWith('delete') ? 'Delete Permanently' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default FileExplorer;
