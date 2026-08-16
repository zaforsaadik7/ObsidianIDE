import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FileExplorer } from '../components/ide/FileExplorer';
import { MonacoEditorCanvas } from '../components/ide/MonacoEditorCanvas';
import { SandboxPreview } from '../components/ide/SandboxPreview';
import { GitHubDiffViewer } from '../components/ide/GitHubDiffViewer';
import { BinaryAssetViewer } from '../components/ide/BinaryAssetViewer';
import { AgenticAIChatSidebar } from '../components/ide/AgenticAIChatSidebar';
import { InteractiveTerminal } from '../components/ide/InteractiveTerminal';
import { KeyboardShortcutsModal } from '../components/ide/KeyboardShortcutsModal';
import { db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';
import { exportSingleFile, exportProjectZip } from '../utils/fileExporter';
import { ImportAnalysisModal } from '../components/ide/ImportAnalysisModal';
import {
  processLocalFiles,
  processLocalFolder,
  processZipArchive,
  analyzeImportConstraints
} from '../utils/fileImporter';
import { syncProjectToPersonalFirestore, syncWorkingFilesToPersonalFirestore } from '../services/personalFirebaseStorage';
import { stageAndDispatchInvitationEmail } from '../utils/emailQueueService';

export const IDEWorkspacePage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  // Dual Repository State: Master Canonical Repository vs Shared Working Fork
  const [masterFiles, setMasterFiles] = useState([]);   // Canonical committed state (owner's baseline)
  const [files, setFiles] = useState([]);               // Live shared workspace files (working copy)
  const [openFiles, setOpenFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [currentContent, setCurrentContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [terminalController, setTerminalController] = useState(null);

  // Active Collaborators & Real-Time Presence State
  const [showActiveCollaborators, setShowActiveCollaborators] = useState(true);
  const [remoteCollaborators, setRemoteCollaborators] = useState([]);
  const [fileAttributions, setFileAttributions] = useState({});
  const [isCollaboratorsDrawerOpen, setIsCollaboratorsDrawerOpen] = useState(false);
  const localCursorRef = useRef({ lineNumber: 1, column: 1 });
  const collaborationWsRef = useRef(null);

  // GitHub Diff Mode Toggle
  const [isDiffViewActive, setIsDiffViewActive] = useState(false);

  // Import System State & File Input Refs
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const zipInputRef = useRef(null);
  const [importTargetFolder, setImportTargetFolder] = useState('');
  const [importModalData, setImportModalData] = useState(null);

  const [serverUserRole, setServerUserRole] = useState(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [unauthorizedMsg, setUnauthorizedMsg] = useState('');

  // Agentic AI State
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);

  // Adjustable 3-Partition Widths & Live Sandbox View State
  const [isSandboxOpen, setIsSandboxOpen] = useState(false);
  const [leftWidth, setLeftWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('obsidian_pane_left_width');
      return saved ? parseInt(saved, 10) : 256;
    } catch { return 256; }
  });
  const [rightWidth, setRightWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('obsidian_pane_right_width');
      return saved ? parseInt(saved, 10) : 340;
    } catch { return 340; }
  });
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  // Global mouse handlers for smooth partition resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDraggingLeft) {
        const newWidth = Math.max(160, Math.min(480, e.clientX));
        setLeftWidth(newWidth);
        try { localStorage.setItem('obsidian_pane_left_width', newWidth); } catch { }
      } else if (isDraggingRight) {
        const newWidth = Math.max(220, Math.min(750, window.innerWidth - e.clientX));
        setRightWidth(newWidth);
        try { localStorage.setItem('obsidian_pane_right_width', newWidth); } catch { }
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isDraggingLeft || isDraggingRight) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight]);

  const projectData = userProfile?.projects?.[projectId];

  const isProjectOwner = useMemo(() => {
    const userEmail = (currentUser?.email || '').trim().toLowerCase();
    if (!userEmail) return false;
    
    const ownerEmail = (projectData?.ownerEmail || '').trim().toLowerCase();
    if (ownerEmail && ownerEmail === userEmail) return true;
    if (serverUserRole === 'OWNER') return true;
    if (projectData?.ownerId && projectData.ownerId === currentUser?.uid) return true;
    if (projectData?.userRole === 'OWNER' || projectData?.role === 'OWNER' || projectData?.isOwner === true) return true;
    
    return false;
  }, [currentUser, serverUserRole, projectData]);

  const activeUserRole = isProjectOwner ? 'OWNER' : (serverUserRole || projectData?.userRole || projectData?.role || 'EDITOR');

  const [saveSyncSuccessMsg, setSaveSyncSuccessMsg] = useState('');

  // ── Helper to detect binary file types (PDF, Images, Archives) ─────────────
  const isBinaryFile = (filePath = '') => {
    const ext = (filePath.split('.').pop() || '').toLowerCase();
    return ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'zip', 'tar', 'gz', 'exe', 'bin', 'mp4', 'webm'].includes(ext);
  };

  // ── Active File & Mutation Guard References ───────────────────────────────
  const activeFileRef = useRef(null);
  activeFileRef.current = activeFile;
  const isLocalDirtyRef = useRef(false);
  isLocalDirtyRef.current = (currentContent !== savedContent);
  const hasUnsavedForkChangesRef = useRef(false);
  const localMutationTimestampRef = useRef(0);
  const localFilesRef = useRef([]);
  localFilesRef.current = files;
  const localMasterRef = useRef([]);
  localMasterRef.current = masterFiles;

  // ── Real-Time Dual Repository Snapshot Listener (Master & Shared Working Fork) ──
  useEffect(() => {
    if (!projectId) return;
    const userEmail = (currentUser?.email || '').trim().toLowerCase();

    try {
      const projDocRef = doc(db, 'projects', projectId);
      const unsubscribe = onSnapshot(projDocRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();

          // 1. Resolve User Role (Project Owner email has absolute authority)
          const docOwnerEmail = (data.ownerEmail || '').trim().toLowerCase();
          if (docOwnerEmail && docOwnerEmail === userEmail) {
            setServerUserRole('OWNER');
          } else if (data.collaborators && userEmail) {
            const matchedKey = Object.keys(data.collaborators).find(k => k.toLowerCase() === userEmail);
            if (matchedKey) {
              const rv = data.collaborators[matchedKey];
              const roleName = typeof rv === 'string' ? rv.toUpperCase() : (rv?.role || 'EDITOR').toUpperCase();
              setServerUserRole(roleName);
            } else {
              setServerUserRole('EDITOR');
            }
          }

          // 2. Resolve Master Baseline (Strictly from master_project_files, falling back to project_files or working_files)
          const master = (data.master_project_files && data.master_project_files.length > 0)
            ? data.master_project_files
            : (data.project_files && data.project_files.length > 0)
              ? data.project_files
              : (data.working_files && data.working_files.length > 0)
                ? data.working_files
                : [];

          if (master && master.length > 0) {
            setMasterFiles(master);
            localMasterRef.current = master;
          }

          // 3. Resolve Live Shared Working Files (Created / uploaded by Owner or Collaborator)
          const working = (data.working_files && data.working_files.length > 0)
            ? data.working_files
            : master;

          // 4. Update working files state with strict mutation protection (Never wipe active typing)
          const hasLocalTypingDirty = (currentContent !== savedContent);
          const isRecentLocalMutation = (Date.now() - localMutationTimestampRef.current) < 5000;
          if (!isRecentLocalMutation && !hasLocalTypingDirty) {
            if (working && working.length > 0) {
              setFiles(working);
              localFilesRef.current = working;
              if (master && master.length === working.length) {
                hasUnsavedForkChangesRef.current = false;
              }
            }
          }

          // 5. Active File & Content synchronization (Safe: Never overwrites live typing buffer or recent saves)
          if (!activeFileRef.current && working && working.length > 0) {
            const first = working[0];
            setOpenFiles([first]);
            setActiveFile(first);
            activeFileRef.current = first;
            setCurrentContent(first.content || '');
            setSavedContent(first.content || '');
          } else if (activeFileRef.current && working && working.length > 0) {
            const matching = working.find(f =>
              (activeFileRef.current.fileId && f.fileId === activeFileRef.current.fileId) ||
              f.filePath === activeFileRef.current.filePath
            );
            if (matching && !isRecentLocalMutation) {
              setActiveFile(matching);
              activeFileRef.current = matching;
              setOpenFiles(prev => prev.map(of =>
                (of.filePath === matching.filePath || (matching.fileId && of.fileId === matching.fileId)) ? matching : of
              ));
              // ONLY update editor text if the local user is NOT actively typing unsaved changes
              if (!isLocalDirtyRef.current && matching.content !== undefined) {
                setCurrentContent(matching.content);
                setSavedContent(matching.content);
              }
            }
          }

          setLoading(false);
        }
      }, (err) => {
        console.warn('Real-time project listener notice:', err);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (e) {
      console.warn('Firestore snapshot setup notice:', e);
      setLoading(false);
    }
  }, [projectId, currentUser]);

  // ── Periodic Server REST Synchronization (Authoritative Polling Fallback) ──
  useEffect(() => {
    if (!projectId) return;

    const syncFromServer = async () => {
      try {
        const userEmail = (currentUser?.email || '').trim().toLowerCase();
        const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';
        const res = await fetch(`/api/projects/${projectId}?userEmail=${encodeURIComponent(userEmail)}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const resData = await res.json();
          const proj = resData.project;
          if (proj) {
            // 1. Resolve User Role (Project Owner email has absolute authority)
            const serverOwnerEmail = (proj.ownerEmail || '').trim().toLowerCase();
            if (serverOwnerEmail && serverOwnerEmail === userEmail) {
              setServerUserRole('OWNER');
            } else if (proj.collaborators && userEmail) {
              const matchedKey = Object.keys(proj.collaborators).find(k => k.toLowerCase() === userEmail);
              if (matchedKey) {
                const rv = proj.collaborators[matchedKey];
                const roleName = typeof rv === 'string' ? rv.toUpperCase() : (rv?.role || 'EDITOR').toUpperCase();
                setServerUserRole(roleName);
              } else {
                setServerUserRole('EDITOR');
              }
            }

            // 2. Master baseline
            const serverMaster = (proj.master_project_files && proj.master_project_files.length > 0)
              ? proj.master_project_files
              : (proj.project_files && proj.project_files.length > 0)
                ? proj.project_files
                : [];

            // Protect master baseline from being downgraded by stale server polling
            if (serverMaster && serverMaster.length >= localMasterRef.current.length) {
              setMasterFiles(serverMaster);
              localMasterRef.current = serverMaster;
            }

            // Working files
            const serverWorking = (proj.working_files && proj.working_files.length > 0)
              ? proj.working_files
              : serverMaster;

            const hasStagedModifications = hasUnsavedForkChangesRef.current || (currentContent !== savedContent);
            const isRecentLocalMutation = (Date.now() - localMutationTimestampRef.current) < 15000;
            if (!isRecentLocalMutation && !hasStagedModifications) {
              if (serverWorking && serverWorking.length > 0) {
                setFiles(serverWorking);
                localFilesRef.current = serverWorking;
              }
            }

            // Sync active file metadata (content only if not dirty and no local mutation)
            if (activeFileRef.current && serverWorking && serverWorking.length > 0 && !isRecentLocalMutation && !hasStagedModifications) {
              const matching = serverWorking.find(f =>
                (activeFileRef.current.fileId && f.fileId === activeFileRef.current.fileId) ||
                f.filePath === activeFileRef.current.filePath
              );
              if (matching) {
                setActiveFile(matching);
                activeFileRef.current = matching;
                setOpenFiles(prev => prev.map(of =>
                  (of.filePath === matching.filePath || (matching.fileId && of.fileId === matching.fileId)) ? matching : of
                ));
                if (!isLocalDirtyRef.current && matching.content !== undefined) {
                  setCurrentContent(matching.content);
                  setSavedContent(matching.content);
                }
              }
            }
          }
        }
      } catch (e) { }
      setLoading(false);
    };

    syncFromServer();
    const intervalId = setInterval(syncFromServer, 5000);
    return () => clearInterval(intervalId);
  }, [projectId, currentUser, currentContent, savedContent]);

  // ── Real-Time Active Collaborators & Cursor Coordination Protocol ──────────
  useEffect(() => {
    if (!projectId || !currentUser?.email) return;

    const userEmail = currentUser.email.toLowerCase().trim();
    const userPayload = {
      email: userEmail,
      displayName: currentUser.displayName || userProfile?.info?.fullName || userEmail.split('@')[0],
      username: userProfile?.info?.username || `@${userEmail.split('@')[0]}`,
      avatarUrl: currentUser.photoURL || userProfile?.info?.avatarUrl || '',
      role: activeUserRole || 'EDITOR'
    };

    // 1. Establish WebSocket for low-latency cursor coordination
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname === 'localhost' ? 'localhost:5000' : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws/collaboration`;

    try {
      const ws = new WebSocket(wsUrl);
      collaborationWsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'JOIN_ROOM',
          projectId,
          user: userPayload,
          activeFilePath: activeFileRef.current?.filePath || activeFile?.filePath || '',
          cursor: localCursorRef.current || { lineNumber: 1, column: 1 }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const collabsList = msg.activeCollaborators || msg.collaborators;
          if ((msg.type === 'PEER_PRESENCE_UPDATE' || msg.type === 'PEER_DISCONNECTED') && Array.isArray(collabsList)) {
            const filtered = collabsList.filter(c => c.email && c.email.toLowerCase() !== userEmail);
            setRemoteCollaborators(filtered);
          } else if (msg.type === 'FORK_ACCEPTED') {
            if (msg.master_project_files && msg.master_project_files.length > 0) {
              setMasterFiles(msg.master_project_files);
              localMasterRef.current = msg.master_project_files;
              setFiles(msg.master_project_files);
              localFilesRef.current = msg.master_project_files;
              hasUnsavedForkChangesRef.current = false;
              isLocalDirtyRef.current = false;
              localMutationTimestampRef.current = 0;
            }
            setSaveSyncSuccessMsg('🎉 Fork request accepted & merged into Master Repository!');
            setTimeout(() => setSaveSyncSuccessMsg(''), 5000);
          } else if (msg.type === 'FORK_REQUESTED') {
            if (msg.working_files && msg.working_files.length > 0) {
              setFiles(msg.working_files);
              localFilesRef.current = msg.working_files;
            }
            setSaveSyncSuccessMsg(`🔔 New fork request submitted by ${msg.requestedBy || 'collaborator'}!`);
            setTimeout(() => setSaveSyncSuccessMsg(''), 5000);
          } else if (msg.type === 'FORK_REJECTED') {
            if (msg.master_project_files && msg.master_project_files.length > 0) {
              setMasterFiles(msg.master_project_files);
              localMasterRef.current = msg.master_project_files;
              setFiles(msg.master_project_files);
              localFilesRef.current = msg.master_project_files;
              hasUnsavedForkChangesRef.current = false;
              isLocalDirtyRef.current = false;
            }
            setSaveSyncSuccessMsg('❌ Notice: Collaborator fork request was rejected by the Project Owner. Workspace restored to Master baseline.');
            setTimeout(() => setSaveSyncSuccessMsg(''), 5000);
          }
        } catch (e) {}
      };

      ws.onerror = () => { };
    } catch (e) { }

    // 2. HTTP Polling Fallback for Presence & Attribution Heartbeat
    const syncPresenceAndAttribution = async () => {
      try {
        const presRes = await fetch(`/api/collaboration/${projectId}/presence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...userPayload,
            activeFilePath: activeFileRef.current?.filePath || activeFile?.filePath || '',
            cursor: localCursorRef.current || { lineNumber: 1, column: 1 }
          })
        });

        if (presRes.ok) {
          const presData = await presRes.json();
          const collabsList = presData?.activeCollaborators || presData?.collaborators;
          if (Array.isArray(collabsList)) {
            const filtered = collabsList.filter(c => c.email && c.email.toLowerCase() !== userEmail);
            setRemoteCollaborators(filtered);
          }
        }

        // Fetch attribution changelog
        const attrRes = await fetch(`/api/collaboration/${projectId}/attribution`);
        const attrData = await attrRes.json();
        if (attrData?.attributions) {
          setFileAttributions(attrData.attributions);
        }
      } catch (e) { }
    };

    syncPresenceAndAttribution();
    const heartbeatInterval = setInterval(syncPresenceAndAttribution, 3000);

    return () => {
      clearInterval(heartbeatInterval);
      if (collaborationWsRef.current) {
        try {
          collaborationWsRef.current.close();
        } catch (e) { }
      }
    };
  }, [projectId, currentUser?.email, activeFile?.filePath, activeUserRole]);

  // Handler for local cursor position update from Monaco editor
  const handleLocalCursorChange = (cursorPos) => {
    localCursorRef.current = cursorPos;
    const currentPath = activeFileRef.current?.filePath || activeFile?.filePath || '';
    if (collaborationWsRef.current && collaborationWsRef.current.readyState === WebSocket.OPEN) {
      collaborationWsRef.current.send(JSON.stringify({
        type: 'CURSOR_MOVE',
        projectId,
        user: {
          email: currentUser?.email,
          displayName: currentUser?.displayName || userProfile?.info?.fullName || currentUser?.email?.split('@')[0],
          username: userProfile?.info?.username || `@${currentUser?.email?.split('@')[0]}`,
          avatarUrl: currentUser?.photoURL || userProfile?.info?.avatarUrl || '',
          role: activeUserRole || 'EDITOR'
        },
        activeFilePath: currentPath,
        cursor: cursorPos
      }));
    }
  };

  // ── GitHub Diff Calculation (Working Copy vs Canonical Master Repository) ──
  const fileStatusMap = useMemo(() => {
    const status = {};
    if (!masterFiles || masterFiles.length === 0) {
      return status;
    }
    const masterPathMap = new Map((masterFiles || []).map(f => [f.filePath, f]));
    const workingPathMap = new Map((files || []).map(f => [f.filePath, f]));

    // Added or Modified in Working Fork
    (files || []).forEach(wf => {
      const mf = masterPathMap.get(wf.filePath);
      const isBinary = isBinaryFile(wf.filePath);
      const effectiveContent = (activeFile && wf.filePath === activeFile.filePath && !isBinary && currentContent !== undefined)
        ? currentContent
        : wf.content;
      if (!mf) {
        status[wf.filePath] = 'ADDED';
      } else if (mf.content !== effectiveContent) {
        status[wf.filePath] = 'MODIFIED';
      }
    });

    // Deleted from Master in Working Fork
    (masterFiles || []).forEach(mf => {
      if (!workingPathMap.has(mf.filePath)) {
        status[mf.filePath] = 'DELETED';
      }
    });

    return status;
  }, [files, masterFiles, activeFile, currentContent]);

  // Detect who authored the unmerged changes in the workspace
  const { hasEditorForkChanges, hasOwnerAuthoredChanges, editorAuthoredChangesCount, collaboratorPendingChangesCount } = useMemo(() => {
    const ownerEmail = (projectData?.ownerEmail || '').toLowerCase().trim();
    const userEmail = (currentUser?.email || '').toLowerCase().trim();

    if (!masterFiles || masterFiles.length === 0) {
      return { hasEditorForkChanges: false, hasOwnerAuthoredChanges: false, editorAuthoredChangesCount: 0, collaboratorPendingChangesCount: 0 };
    }

    const masterPathMap = new Map(masterFiles.map(f => [f.filePath, f]));
    const hasLocalBufferDirty = Boolean(isLocalDirtyRef.current || hasUnsavedForkChangesRef.current || (activeFile && !isBinaryFile(activeFile?.filePath) && currentContent !== savedContent));

    let editorCount = 0;
    let ownerChangesExist = false;
    let collabCount = 0;

    (files || []).forEach(wf => {
      const mf = masterPathMap.get(wf.filePath);
      const isBinary = isBinaryFile(wf.filePath);
      const isEffectiveMod = !mf || mf.content !== (activeFile && wf.filePath === activeFile.filePath && !isBinary && currentContent !== undefined ? currentContent : wf.content);
      if (isEffectiveMod) {
        const author = (wf.lastModifiedBy || '').toLowerCase().trim();
        if (author === ownerEmail) {
          ownerChangesExist = true;
        } else if (author === userEmail) {
          editorCount++;
        } else if (author && author !== ownerEmail) {
          collabCount++;
        } else {
          // If no author recorded, treat as current user's local working change
          if (!isProjectOwner) editorCount++;
        }
      }
    });

    (masterFiles || []).forEach(mf => {
      const isDeletedInWorking = !files.some(wf => wf.filePath === mf.filePath);
      if (isDeletedInWorking) {
        if (!isProjectOwner) editorCount++;
      }
    });

    // If all working files match master baseline 1:1, fork changes is false
    const hasForkChanges = !isProjectOwner && (editorCount > 0 || (hasLocalBufferDirty && Object.keys(fileStatusMap).length > 0));

    return {
      hasEditorForkChanges: hasForkChanges,
      hasOwnerAuthoredChanges: ownerChangesExist,
      editorAuthoredChangesCount: editorCount,
      collaboratorPendingChangesCount: collabCount + (isProjectOwner ? editorCount : 0)
    };
  }, [files, masterFiles, activeFile, currentContent, savedContent, currentUser?.email, projectData?.ownerEmail, isProjectOwner, fileStatusMap]);

  const activeMasterFile = useMemo(() => {
    if (!activeFile) return null;
    return (masterFiles || []).find(f => f.filePath === activeFile.filePath) || null;
  }, [masterFiles, activeFile]);

  const isCurrentFileModified = useMemo(() => {
    if (!activeFile) return false;
    return fileStatusMap[activeFile.filePath] === 'MODIFIED' || (activeMasterFile && activeMasterFile.content !== currentContent);
  }, [fileStatusMap, activeFile, activeMasterFile, currentContent]);

  const handleSelectFile = (fileObj) => {
    if (!fileObj) return;
    const currentFiles = (localFilesRef.current && localFilesRef.current.length > 0) ? localFilesRef.current : files;
    const latest = currentFiles.find(f => f.fileId === fileObj.fileId || f.filePath === fileObj.filePath) || fileObj;
    if (!openFiles.some((f) => f.fileId === latest.fileId || f.filePath === latest.filePath)) {
      setOpenFiles(prev => [...prev, latest]);
    }
    setActiveFile(latest);
    activeFileRef.current = latest;
    setCurrentContent(latest.content || '');
    setSavedContent(latest.content || '');
    setIsDiffViewActive(false);
  };

  const handleSelectTab = (fileObj) => {
    if (!fileObj) return;
    const currentFiles = (localFilesRef.current && localFilesRef.current.length > 0) ? localFilesRef.current : files;
    const latest = currentFiles.find(f => f.fileId === fileObj.fileId || f.filePath === fileObj.filePath) || fileObj;
    setActiveFile(latest);
    activeFileRef.current = latest;
    setCurrentContent(latest.content || '');
    setSavedContent(latest.content || '');
    setIsDiffViewActive(false);
  };

  const handleCloseTab = (fileObj) => {
    const nextTabs = openFiles.filter((f) => f.fileId !== fileObj.fileId && f.filePath !== fileObj.filePath);
    setOpenFiles(nextTabs);
    if (activeFile?.fileId === fileObj.fileId || activeFile?.filePath === fileObj.filePath) {
      if (nextTabs.length > 0) {
        const lastTab = nextTabs[nextTabs.length - 1];
        setActiveFile(lastTab);
        activeFileRef.current = lastTab;
        setCurrentContent(lastTab.content || '');
        setSavedContent(lastTab.content || '');
      } else {
        setActiveFile(null);
        activeFileRef.current = null;
        setCurrentContent('');
        setSavedContent('');
      }
    }
  };

  // ── 1. Save to Editor's Local Storage & Personal DB (No Fork Push to Owner) ──
  const handleSaveToLocalStorage = async () => {
    const targetFile = activeFileRef.current || activeFile;
    setIsSaving(true);
    setSaveSyncSuccessMsg('');
    try {
      const userEmail = currentUser?.email || 'developer@obsidian.io';
      const timestamp = new Date().toISOString();

      localMutationTimestampRef.current = Date.now();

      const currentFiles = (localFilesRef.current && localFilesRef.current.length > 0) ? localFilesRef.current : files;
      let updatedFiles = currentFiles;
      if (targetFile) {
        updatedFiles = currentFiles.map(f =>
          (f.fileId === targetFile.fileId || f.filePath === targetFile.filePath)
            ? { ...f, content: currentContent, updatedAt: timestamp, lastModifiedBy: userEmail }
            : f
        );
        if (!updatedFiles.some(f => f.fileId === targetFile.fileId || f.filePath === targetFile.filePath)) {
          updatedFiles.push({ ...targetFile, content: currentContent, updatedAt: timestamp, lastModifiedBy: userEmail });
        }
      }

      localFilesRef.current = updatedFiles;
      setFiles(updatedFiles);
      setSavedContent(currentContent);

      if (targetFile) {
        const updatedActive = { ...targetFile, content: currentContent, updatedAt: timestamp, lastModifiedBy: userEmail };
        setActiveFile(updatedActive);
        activeFileRef.current = updatedActive;
        setOpenFiles(prev => prev.map(of => (of.filePath === targetFile.filePath || of.fileId === targetFile.fileId) ? updatedActive : of));
      }

      // Check which files are new or modified compared to previous local draft
      let changedFilesCount = 0;
      try {
        const existingDraftRaw = localStorage.getItem(`obsidian_draft_${projectId}_${userEmail}`);
        const existingDraft = existingDraftRaw ? JSON.parse(existingDraftRaw) : [];
        const existingMap = new Map(existingDraft.map(f => [f.filePath, f.content]));
        changedFilesCount = updatedFiles.filter(f => !existingMap.has(f.filePath) || existingMap.get(f.filePath) !== f.content).length;
      } catch (e) {
        changedFilesCount = updatedFiles.length;
      }

      // 1. Persist local offline draft in browser localStorage
      try {
        localStorage.setItem(`obsidian_draft_${projectId}_${userEmail}`, JSON.stringify(updatedFiles));
      } catch (e) { }

      // 2. Persist to Editor's Own Personal Firebase Database
      try {
        await syncProjectToPersonalFirestore({
          projectId,
          title: projectData?.title || projectId,
          description: projectData?.description || '',
          languageEnv: projectData?.languageEnv || 'PYTHON_3.11',
          ownerEmail: userEmail,
          project_files: updatedFiles,
          working_files: updatedFiles,
          master_project_files: updatedFiles
        }, userProfile, userEmail);
      } catch (pErr) {
        console.warn('Personal Firestore local save notice:', pErr);
      }

      // 3. Update User Catalog in website DB
      const userDocUsername = (userEmail.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_');
      try {
        await setDoc(doc(db, 'users', userDocUsername), {
          projects: {
            [projectId]: {
              projectId,
              title: projectData?.title || projectId,
              lastModifiedAt: timestamp
            }
          }
        }, { merge: true });
      } catch (uErr) { }

      setSaveSyncSuccessMsg(`💾 Saved ${changedFilesCount || updatedFiles.length} file(s) to your Personal Local Storage & Database!`);
      setTimeout(() => setSaveSyncSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Error saving to local storage:', err);
      alert(`Failed to save to local storage: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── 2. Request Fork / Submit Working Copy to Project Owner ─────────────────
  const handleRequestFork = async () => {
    const targetFile = activeFileRef.current || activeFile;
    setIsSaving(true);
    setSaveSyncSuccessMsg('');
    try {
      const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';
      const userEmail = (currentUser?.email || 'developer@obsidian.io').trim().toLowerCase();
      const timestamp = new Date().toISOString();

      localMutationTimestampRef.current = Date.now();

      const currentFiles = (localFilesRef.current && localFilesRef.current.length > 0) ? localFilesRef.current : files;
      let updatedFiles = currentFiles;
      if (targetFile && !isBinaryFile(targetFile.filePath) && currentContent !== undefined) {
        updatedFiles = currentFiles.map(f =>
          (f.fileId === targetFile.fileId || f.filePath === targetFile.filePath)
            ? { ...f, content: currentContent, updatedAt: timestamp, lastModifiedBy: userEmail }
            : f
        );
        if (!updatedFiles.some(f => f.fileId === targetFile.fileId || f.filePath === targetFile.filePath)) {
          updatedFiles.push({ ...targetFile, content: currentContent, updatedAt: timestamp, lastModifiedBy: userEmail });
        }
      }

      localFilesRef.current = updatedFiles;
      setFiles(updatedFiles);
      if (!targetFile || !isBinaryFile(targetFile.filePath)) {
        setSavedContent(currentContent);
      }

      // 1. Broadcast FORK_REQUESTED immediately over WebSocket so Owner sees new proposal within < 50ms
      if (collaborationWsRef.current && collaborationWsRef.current.readyState === WebSocket.OPEN) {
        collaborationWsRef.current.send(JSON.stringify({
          type: 'FORK_REQUESTED',
          projectId,
          working_files: updatedFiles,
          user: {
            email: userEmail,
            displayName: currentUser?.displayName || userProfile?.info?.fullName || userEmail.split('@')[0],
            role: activeUserRole || 'EDITOR'
          }
        }));
      }

      // 2. Persist Working Files to Owner DB via server-side BYOD asynchronously
      fetch('/api/projects/update-files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          projectId,
          working_files: updatedFiles,
          userEmail,
          ownerEmail: projectData?.ownerEmail,
          collaborators: projectData?.collaborators
        })
      }).catch(apiErr => console.warn('Backend update-files notice:', apiErr));

      // 3. Record Collaborator Change Attribution
      if (targetFile) {
        fetch(`/api/collaboration/${projectId}/attribution`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: targetFile.filePath,
            authorEmail: userEmail,
            authorName: currentUser?.displayName || userProfile?.info?.fullName || userEmail.split('@')[0],
            authorRole: activeUserRole,
            authorAvatar: currentUser?.photoURL || userProfile?.info?.avatarUrl || '',
            changeSummary: `Submitted fork updates for ${targetFile.filePath}`
          })
        }).catch(() => {});
      }

      setSaveSyncSuccessMsg(`🍴 Fork requested! ${Object.keys(fileStatusMap).length || updatedFiles.length} change(s) submitted for Project Owner review.`);
      setTimeout(() => setSaveSyncSuccessMsg(''), 4500);
    } catch (err) {
      console.error('Error submitting fork request:', err);
      alert(`Failed to submit fork request: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // General Save Handler (Dispatches to Local Save or Owner Commit)
  const handleSaveFile = () => {
    if (isProjectOwner) {
      handleSaveAndSyncMaster();
    } else {
      handleSaveToLocalStorage();
    }
  };

  // ── 2. Save & Sync to Master (Owner-Gated Canonical Repository Merge) ───────
  const handleSaveAndSyncMaster = async () => {
    if (!isProjectOwner) {
      alert('🔒 Access Restricted: Only the Project Owner can merge working changes into the canonical Master Repository.');
      return;
    }

    setIsSaving(true);
    setSaveSyncSuccessMsg('');
    try {
      const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';
      const userEmail = (currentUser?.email || 'owner@obsidian.io').trim().toLowerCase();
      const timestamp = new Date().toISOString();

      // Ensure active editor buffer is included
      let targetWorkingFiles = files;
      if (activeFile && currentContent !== savedContent) {
        targetWorkingFiles = files.map(f =>
          (f.fileId === activeFile.fileId || f.filePath === activeFile.filePath)
            ? { ...f, content: currentContent, updatedAt: timestamp, lastModifiedBy: userEmail }
            : f
        );
        setFiles(targetWorkingFiles);
        setSavedContent(currentContent);
      }

      // 1. Commit to Client Firestore Master & Working files in Website Database (Instant atomic doc update)
      try {
        await setDoc(doc(db, 'projects', projectId), {
          master_project_files: targetWorkingFiles,
          project_files: targetWorkingFiles,
          working_files: targetWorkingFiles,
          pending_patches: [],
          masterLastSyncedAt: timestamp,
          masterLastSyncedBy: userEmail,
          updatedAt: timestamp
        }, { merge: true });

        // Update files subcollection non-blocking in parallel
        Promise.allSettled(targetWorkingFiles.map(f => {
          if (f && (f.fileId || f.filePath)) {
            const fileDocId = f.fileId || `file_${projectId}_${f.filePath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
            return setDoc(doc(db, 'projects', projectId, 'files', fileDocId), {
              fileId: fileDocId,
              projectId,
              filePath: f.filePath,
              fileName: f.fileName || f.filePath.split('/').pop(),
              content: f.content || '',
              fileType: f.fileType || 'plaintext',
              updatedAt: timestamp,
              lastModifiedBy: userEmail
            }, { merge: true });
          }
          return Promise.resolve();
        })).catch(() => {});

        const ownerDocUsername = userEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
        setDoc(doc(db, 'users', ownerDocUsername), {
          projects: {
            [projectId]: {
              projectId,
              title: projectData?.title || projectId,
              description: projectData?.description || '',
              languageEnv: projectData?.languageEnv || 'PYTHON_3.11',
              ownerEmail: userEmail,
              userRole: 'OWNER',
              updatedAt: timestamp
            }
          }
        }, { merge: true }).catch(() => {});
      } catch (fsErr) {
        console.warn('Firestore master commit notice:', fsErr);
      }

      // 2. Commit to Backend API
      try {
        await fetch('/api/projects/sync-master', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            projectId,
            working_files: targetWorkingFiles,
            ownerEmail: userEmail
          })
        });
      } catch (apiErr) {
        console.warn('Backend sync-master notice:', apiErr);
      }

      // 3. Commit to Personal Firebase Cloud Database (Owner's Database) non-blocking
      try {
        syncProjectToPersonalFirestore({
          projectId,
          title: projectData?.title || projectId,
          languageEnv: projectData?.languageEnv || 'PYTHON_3.11',
          ownerEmail: projectData?.ownerEmail || userEmail,
          master_project_files: targetWorkingFiles,
          project_files: targetWorkingFiles,
          working_files: targetWorkingFiles,
          collaborators: projectData?.collaborators || { [userEmail]: 'OWNER' }
        }, userProfile, userEmail).catch(() => {});
      } catch (pErr) {
        console.warn('Personal Firestore master sync notice:', pErr);
      }

      // 4. Broadcast FORK_ACCEPTED over WebSocket so all connected editors update immediately
      if (collaborationWsRef.current && collaborationWsRef.current.readyState === WebSocket.OPEN) {
        collaborationWsRef.current.send(JSON.stringify({
          type: 'FORK_ACCEPTED',
          projectId,
          master_project_files: targetWorkingFiles,
          working_files: targetWorkingFiles,
          user: {
            email: userEmail,
            displayName: currentUser?.displayName || 'Project Owner',
            role: 'OWNER'
          }
        }));
      }

      localMutationTimestampRef.current = Date.now();
      localFilesRef.current = targetWorkingFiles;
      localMasterRef.current = targetWorkingFiles;
      setMasterFiles(targetWorkingFiles);
      setFiles(targetWorkingFiles);
      hasUnsavedForkChangesRef.current = false;
      isLocalDirtyRef.current = false;
      setIsDiffViewActive(false);
      setSaveSyncSuccessMsg('🎉 All working changes merged and synchronized to Master Repository!');
      setTimeout(() => setSaveSyncSuccessMsg(''), 5000);
    } catch (err) {
      console.error('Error syncing master repository:', err);
      alert(`Failed to sync master repository: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── 3. Reject Fork (Project Owner Declines Collaborator Changes & Restores Master) ──
  const handleRejectFork = async () => {
    if (!isProjectOwner) {
      alert('🔒 Access Restricted: Only the Project Owner can decline or reject collaborator fork requests.');
      return;
    }

    const confirmReject = window.confirm(
      'Are you sure you want to reject this collaborator fork request?\n\nThis will decline the working changes and revert the shared workspace back to the canonical Master Baseline.'
    );
    if (!confirmReject) return;

    setIsSaving(true);
    setSaveSyncSuccessMsg('');
    try {
      const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';
      const userEmail = (currentUser?.email || 'owner@obsidian.io').trim().toLowerCase();
      const timestamp = new Date().toISOString();

      // Master baseline is the source of truth to restore
      const targetMasterFiles = masterFiles && masterFiles.length > 0 ? masterFiles : files;

      // 1. Reset working_files and pending_patches in Firestore
      try {
        await setDoc(doc(db, 'projects', projectId), {
          working_files: targetMasterFiles,
          project_files: targetMasterFiles,
          pending_patches: [],
          lastForkRejectedAt: timestamp,
          lastForkRejectedBy: userEmail,
          updatedAt: timestamp
        }, { merge: true });

        // Reset files subcollection to match canonical master
        for (const f of targetMasterFiles) {
          if (f && (f.fileId || f.filePath)) {
            const fileDocId = f.fileId || `file_${projectId}_${f.filePath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
            await setDoc(doc(db, 'projects', projectId, 'files', fileDocId), {
              fileId: fileDocId,
              projectId,
              filePath: f.filePath,
              fileName: f.fileName || f.filePath.split('/').pop(),
              content: f.content || '',
              fileType: f.fileType || 'plaintext',
              updatedAt: timestamp,
              lastModifiedBy: userEmail
            }, { merge: true });
          }
        }
      } catch (fsErr) {
        console.warn('Firestore reject fork reset notice:', fsErr);
      }

      // 2. Call backend reject-fork endpoint
      try {
        await fetch('/api/projects/reject-fork', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            projectId,
            ownerEmail: userEmail,
            reason: 'Fork changes declined by Project Owner'
          })
        });
      } catch (apiErr) {
        console.warn('Backend reject-fork notice:', apiErr);
      }

      // 3. Broadcast FORK_REJECTED over WebSocket
      if (collaborationWsRef.current && collaborationWsRef.current.readyState === WebSocket.OPEN) {
        collaborationWsRef.current.send(JSON.stringify({
          type: 'FORK_REJECTED',
          projectId,
          user: {
            email: userEmail,
            displayName: currentUser?.displayName || 'Project Owner',
            role: 'OWNER'
          }
        }));
      }

      // 4. Update local state and editor buffers
      localMutationTimestampRef.current = Date.now();
      localFilesRef.current = targetMasterFiles;
      setFiles(targetMasterFiles);
      hasUnsavedForkChangesRef.current = false;
      isLocalDirtyRef.current = false;

      if (activeFile) {
        const restoredActive = targetMasterFiles.find(f => f.filePath === activeFile.filePath || f.fileId === activeFile.fileId);
        if (restoredActive) {
          setActiveFile(restoredActive);
          activeFileRef.current = restoredActive;
          setCurrentContent(restoredActive.content || '');
          setSavedContent(restoredActive.content || '');
        } else if (targetMasterFiles.length > 0) {
          setActiveFile(targetMasterFiles[0]);
          activeFileRef.current = targetMasterFiles[0];
          setCurrentContent(targetMasterFiles[0].content || '');
          setSavedContent(targetMasterFiles[0].content || '');
        }
      }

      setIsDiffViewActive(false);
      setSaveSyncSuccessMsg('❌ Fork request rejected. Shared workspace restored to Master baseline.');
      setTimeout(() => setSaveSyncSuccessMsg(''), 5000);
    } catch (err) {
      console.error('Error rejecting fork request:', err);
      alert(`Failed to reject fork request: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInviteTeammate = async () => {
    const email = window.prompt("Enter teammate email address:");
    if (!email || !email.includes('@')) return;

    const roleInput = window.prompt("Enter access role (EDITOR, REVIEWER, OWNER):", "REVIEWER");
    const role = (roleInput || 'REVIEWER').toUpperCase().trim();

    const projTitle = projectData?.title || title || projectId;
    const projOwner = projectData?.ownerEmail || currentUser?.email || 'owner@obsidianide.com';
    const inviteUrl = `${window.location.origin}/invite/${projectId}?role=${role}&email=${encodeURIComponent(email.trim())}&title=${encodeURIComponent(projTitle)}&owner=${encodeURIComponent(projOwner)}`;

    try {
      // 1. Stage in Firebase Queue and dispatch
      await stageAndDispatchInvitationEmail({
        to: email.trim(),
        ownerEmail: projOwner,
        projectTitle: projTitle,
        projectId,
        role,
        inviteUrl,
        currentUser
      });

      // 2. Register collaborator on backend API
      const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';
      const res = await fetch(`/api/projects/${projectId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          email: email.trim(),
          role,
          projectTitle: projTitle,
          ownerEmail: projOwner
        })
      });
      const data = await res.json();
      if (res.ok) {
        const finalUrl = data.inviteUrl || inviteUrl;
        navigator.clipboard.writeText(finalUrl);
        alert(`✓ Collaborator ${email} added as ${role} to ${projTitle}!\n\nInvitation link copied to clipboard:\n${finalUrl}`);
      } else {
        alert(`Error inviting teammate: ${data.error || 'Server error'}`);
      }
    } catch (err) {
      alert(`Failed to send invite: ${err.message}`);
    }
  };

  const handleApplyAIModifications = async (targetFilePath, newContent) => {
    if (!targetFilePath) return;
    const userEmail = currentUser?.email || 'developer@obsidian.io';
    const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';

    try {
      const clean = (p = '') => p.replace(/^\/+|\/+$/g, '').trim().toLowerCase();
      const targetClean = clean(targetFilePath);
      const targetBase = targetClean.split('/').pop();

      // Find existing file matching exact path, stripped path, base fileName, or suffix
      const existingFile = files.find(f => {
        const fPath = clean(f.filePath);
        const fName = clean(f.fileName);
        return fPath === targetClean ||
          fName === targetClean ||
          fName === targetBase ||
          fPath.endsWith('/' + targetClean) ||
          targetClean.endsWith('/' + fPath) ||
          fPath.endsWith('/' + targetBase);
      });

      const actualFilePath = existingFile ? existingFile.filePath : targetFilePath;
      let updatedFiles;

      if (existingFile) {
        updatedFiles = files.map(f => f.fileId === existingFile.fileId ? {
          ...f,
          content: newContent,
          updatedAt: new Date().toISOString(),
          lastModifiedBy: userEmail
        } : f);
      } else {
        const fileExt = targetFilePath.split('.').pop() || 'txt';
        const newFileObj = {
          fileId: 'file_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          filePath: targetFilePath,
          fileName: targetFilePath.split('/').pop(),
          fileType: fileExt,
          content: newContent,
          updatedAt: new Date().toISOString(),
          lastModifiedBy: userEmail
        };
        updatedFiles = [...files, newFileObj];
      }

      localMutationTimestampRef.current = Date.now();
      localFilesRef.current = updatedFiles;
      setFiles(updatedFiles);

      // Check if current activeFile matches the modified file
      const isActiveMatched = activeFile && (
        (existingFile && (activeFile.fileId === existingFile.fileId || clean(activeFile.filePath) === clean(existingFile.filePath))) ||
        clean(activeFile.filePath) === targetClean ||
        clean(activeFile.fileName) === targetClean ||
        clean(activeFile.fileName) === targetBase ||
        clean(activeFile.filePath).endsWith('/' + targetClean) ||
        targetClean.endsWith('/' + clean(activeFile.filePath))
      );

      if (isActiveMatched) {
        setCurrentContent(newContent);
        setSavedContent(newContent);
        setActiveFile(prev => ({ ...prev, content: newContent }));
      }

      // Update in openFiles tabs as well
      setOpenFiles(prev => prev.map(f => {
        if (
          (existingFile && (f.fileId === existingFile.fileId || clean(f.filePath) === clean(existingFile.filePath))) ||
          clean(f.filePath) === targetClean ||
          clean(f.fileName) === targetClean ||
          clean(f.fileName) === targetBase
        ) {
          return { ...f, content: newContent };
        }
        return f;
      }));

      // Persist to Client Firestore
      try {
        await setDoc(doc(db, 'projects', projectId), {
          working_files: updatedFiles,
          updatedAt: new Date().toISOString(),
          lastWorkingModifiedBy: userEmail
        }, { merge: true });

        await fetch('/api/projects/update-files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            projectId,
            working_files: updatedFiles,
            master_project_files: masterFiles,
            userEmail,
            ownerEmail: projectData?.ownerEmail
          })
        });
      } catch (fsErr) { }

      setSaveSyncSuccessMsg(`⚡ Applied AI edits to ${actualFilePath}`);
      setTimeout(() => setSaveSyncSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Error applying AI modifications:', err);
      alert(`Failed to apply edits: ${err.message}`);
    }
  };

  const handleCreateFile = async (filePath, initialContent = null) => {
    const cleanPath = filePath.trim().replace(/^\/+/, '');
    if (!cleanPath) return;

    const defaultContent = initialContent !== null ? initialContent : `// Created: ${cleanPath}\n`;
    const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';
    const userEmail = currentUser?.email || 'developer@obsidian.io';

    try {
      const newFileObj = {
        fileId: `file_${projectId}_${Date.now()}`,
        projectId,
        filePath: cleanPath,
        fileName: cleanPath.split('/').pop(),
        content: defaultContent,
        fileType: cleanPath.split('.').pop() || 'text',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastModifiedBy: userEmail
      };

      const updatedFiles = [...files.filter(f => f.filePath !== cleanPath), newFileObj];
      localMutationTimestampRef.current = Date.now();
      localFilesRef.current = updatedFiles;
      setFiles(updatedFiles);
      handleSelectFile(newFileObj);

      // Persist to Shared Working Fork in Firestore & REST API (NOT project_files — that's the master baseline)
      try {
        await setDoc(doc(db, 'projects', projectId), {
          working_files: updatedFiles,
          updatedAt: new Date().toISOString(),
          lastWorkingModifiedBy: userEmail
        }, { merge: true });

        await fetch('/api/projects/update-files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            projectId,
            working_files: updatedFiles,
            master_project_files: masterFiles,
            userEmail,
            ownerEmail: projectData?.ownerEmail,
            collaborators: projectData?.collaborators
          })
        });
      } catch (fsErr) {
        console.warn('Working create file sync notice:', fsErr);
      }

      setSaveSyncSuccessMsg(`[+] Created '${cleanPath}' in Working Fork (${isProjectOwner ? 'Owner merge ready' : 'Pending Owner merge'})`);
      setTimeout(() => setSaveSyncSuccessMsg(''), 4500);
    } catch (err) {
      console.error('Error creating new file:', err);
    }
  };

  const handleCreateFolder = async (folderPath) => {
    const cleanFolder = folderPath.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanFolder) return;
    await handleCreateFile(`${cleanFolder}/.keep`, `// Folder directory entry: ${cleanFolder}\n`);
  };

  const handleRenameFile = async (fileObj, newPath) => {
    const cleanNewPath = newPath.trim().replace(/^\/+/, '');
    if (!cleanNewPath || cleanNewPath === fileObj.filePath) return;
    const userEmail = currentUser?.email || 'developer@obsidian.io';
    const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';

    try {
      const updatedFiles = files.map(f => f.fileId === fileObj.fileId ? { ...f, filePath: cleanNewPath, fileName: cleanNewPath.split('/').pop() } : f);
      localMutationTimestampRef.current = Date.now();
      localFilesRef.current = updatedFiles;
      setFiles(updatedFiles);

      if (activeFile?.fileId === fileObj.fileId) {
        setActiveFile(prev => ({ ...prev, filePath: cleanNewPath, fileName: cleanNewPath.split('/').pop() }));
      }
      setOpenFiles(prev => prev.map(f => f.fileId === fileObj.fileId ? { ...f, filePath: cleanNewPath, fileName: cleanNewPath.split('/').pop() } : f));

      // Persist to Shared Working Fork (NOT project_files — that's the master baseline)
      try {
        await setDoc(doc(db, 'projects', projectId), {
          working_files: updatedFiles,
          updatedAt: new Date().toISOString(),
          lastWorkingModifiedBy: userEmail
        }, { merge: true });

        await fetch('/api/projects/update-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
          body: JSON.stringify({ projectId, working_files: updatedFiles, master_project_files: masterFiles, userEmail, ownerEmail: projectData?.ownerEmail })
        });
      } catch (fsErr) { }

      setSaveSyncSuccessMsg(`[→] Renamed to '${cleanNewPath}' in Working Fork`);
      setTimeout(() => setSaveSyncSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Error renaming file:', err);
      alert(`Failed to rename file: ${err.message}`);
    }
  };

  const handleDeleteFile = async (fileObj) => {
    const userEmail = currentUser?.email || 'developer@obsidian.io';
    const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';

    try {
      const remainingFiles = files.filter(f => f.fileId !== fileObj.fileId && f.filePath !== fileObj.filePath);
      localMutationTimestampRef.current = Date.now();
      localFilesRef.current = remainingFiles;
      setFiles(remainingFiles);
      handleCloseTab(fileObj);
      if (activeFile?.fileId === fileObj.fileId || activeFile?.filePath === fileObj.filePath) {
        const next = remainingFiles[0] || null;
        if (next) handleSelectFile(next);
        else {
          setActiveFile(null);
          setCurrentContent('');
          setSavedContent('');
        }
      }

      // Persist to Shared Working Fork (NOT project_files — that's the master baseline)
      try {
        await setDoc(doc(db, 'projects', projectId), {
          working_files: remainingFiles,
          updatedAt: new Date().toISOString(),
          lastWorkingModifiedBy: userEmail
        }, { merge: true });

        await fetch('/api/projects/update-files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            projectId,
            working_files: remainingFiles,
            master_project_files: masterFiles,
            userEmail,
            ownerEmail: projectData?.ownerEmail,
            collaborators: projectData?.collaborators
          })
        });
      } catch (fsErr) { }

      setSaveSyncSuccessMsg(`[-] Deleted '${fileObj.fileName}' in Working Fork (${isProjectOwner ? 'Owner merge ready' : 'Pending Owner merge'})`);
      setTimeout(() => setSaveSyncSuccessMsg(''), 4500);
    } catch (err) {
      console.error('Error deleting file:', err);
    }
  };

  const handleRenameFolder = async (oldPath, newPath) => {
    const cleanOld = oldPath.trim().replace(/^\/+|\/+$/g, '');
    const cleanNew = newPath.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;

    const userEmail = currentUser?.email || 'developer@obsidian.io';
    const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';

    try {
      const updatedFiles = files.map(f => {
        if (f.filePath === cleanOld || f.filePath.startsWith(`${cleanOld}/`)) {
          const updatedPath = f.filePath.replace(new RegExp(`^${cleanOld}`), cleanNew);
          return {
            ...f,
            filePath: updatedPath,
            fileName: updatedPath.split('/').pop(),
            updatedAt: new Date().toISOString(),
            lastModifiedBy: userEmail
          };
        }
        return f;
      });

      localMutationTimestampRef.current = Date.now();
      localFilesRef.current = updatedFiles;
      setFiles(updatedFiles);

      if (activeFile && (activeFile.filePath === cleanOld || activeFile.filePath.startsWith(`${cleanOld}/`))) {
        const updatedPath = activeFile.filePath.replace(new RegExp(`^${cleanOld}`), cleanNew);
        setActiveFile(prev => ({ ...prev, filePath: updatedPath, fileName: updatedPath.split('/').pop() }));
      }
      setOpenFiles(prev => prev.map(f => {
        if (f.filePath === cleanOld || f.filePath.startsWith(`${cleanOld}/`)) {
          const updatedPath = f.filePath.replace(new RegExp(`^${cleanOld}`), cleanNew);
          return { ...f, filePath: updatedPath, fileName: updatedPath.split('/').pop() };
        }
        return f;
      }));

      // Persist to Shared Working Fork (NOT project_files — that's the master baseline)
      try {
        await setDoc(doc(db, 'projects', projectId), {
          working_files: updatedFiles,
          updatedAt: new Date().toISOString(),
          lastWorkingModifiedBy: userEmail
        }, { merge: true });

        await fetch('/api/projects/update-files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            projectId,
            working_files: updatedFiles,
            master_project_files: masterFiles,
            userEmail,
            ownerEmail: projectData?.ownerEmail,
            collaborators: projectData?.collaborators
          })
        });
      } catch (fsErr) { }

      setSaveSyncSuccessMsg(`[→] Renamed folder /${cleanOld} to /${cleanNew} in Working Fork`);
      setTimeout(() => setSaveSyncSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Error renaming folder:', err);
      alert(`Failed to rename folder: ${err.message}`);
    }
  };

  const handleDeleteFolder = async (folderPath) => {
    const cleanFolder = folderPath.replace(/^\/+|\/+$/g, '');
    const userEmail = currentUser?.email || 'developer@obsidian.io';
    const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';

    try {
      const remaining = files.filter(f => !(f.filePath === cleanFolder || f.filePath.startsWith(`${cleanFolder}/`)));
      localMutationTimestampRef.current = Date.now();
      localFilesRef.current = remaining;
      setFiles(remaining);

      if (activeFile && (activeFile.filePath === cleanFolder || activeFile.filePath.startsWith(`${cleanFolder}/`))) {
        const next = remaining[0] || null;
        if (next) handleSelectFile(next);
        else {
          setActiveFile(null);
          setCurrentContent('');
          setSavedContent('');
        }
      }

      // Persist to Shared Working Fork (NOT project_files — that's the master baseline)
      try {
        await setDoc(doc(db, 'projects', projectId), {
          working_files: remaining,
          updatedAt: new Date().toISOString(),
          lastWorkingModifiedBy: userEmail
        }, { merge: true });

        await fetch('/api/projects/update-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
          body: JSON.stringify({ projectId, working_files: remaining, master_project_files: masterFiles, userEmail, ownerEmail: projectData?.ownerEmail })
        });
      } catch (fsErr) { }

      setSaveSyncSuccessMsg(`[×] Deleted folder /${cleanFolder} from Working Fork`);
      setTimeout(() => setSaveSyncSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Error deleting folder:', err);
      alert(`Failed to delete folder: ${err.message}`);
    }
  };

  const handlePasteItem = async (clipboard, targetFolder = '') => {
    if (!clipboard) return;
    const prefix = targetFolder ? `${targetFolder.replace(/^\/+|\/+$/g, '')}/` : '';

    if (clipboard.type === 'file' && clipboard.fileObj) {
      const fileName = clipboard.fileObj.filePath.split('/').pop();
      const newPath = `${prefix}${fileName}`;
      if (clipboard.op === 'cut') {
        await handleRenameFile(clipboard.fileObj, newPath);
      } else {
        await handleCreateFile(newPath, clipboard.fileObj.content || '');
      }
    } else if (clipboard.type === 'folder' && clipboard.folderPath) {
      const folderBaseName = clipboard.folderPath.split('/').pop();
      const newFolderTarget = `${prefix}${folderBaseName}`;
      if (clipboard.op === 'cut') {
        await handleRenameFolder(clipboard.folderPath, newFolderTarget);
      } else {
        const filesToClone = files.filter(f => f.filePath === clipboard.folderPath || f.filePath.startsWith(`${clipboard.folderPath}/`));
        for (const f of filesToClone) {
          const relativePart = f.filePath.substring(clipboard.folderPath.length);
          const clonedPath = `${newFolderTarget}${relativePart}`;
          await handleCreateFile(clonedPath, f.content || '');
        }
      }
    }
  };

  const handleSaveAs = async () => {
    const currentName = activeFile?.filePath || 'src/main.py';
    const newName = window.prompt("Save File As (Enter path & name):", currentName);
    if (newName && newName.trim()) {
      await handleCreateFile(newName.trim(), currentContent);
    }
  };

  const handleDownloadProjectZip = async () => {
    const isOwner = activeUserRole === 'OWNER' || projectData?.ownerId === currentUser?.uid || projectData?.ownerEmail === currentUser?.email;
    if (!isOwner) {
      alert('🔒 Access Denied: Downloading the project as a ZIP archive is restricted to the Project Owner.');
      return;
    }
    await exportProjectZip(files, projectData?.title || 'Quantum_Router');
  };

  // ── Drag & Drop Move Handler ──────────────────────────────────────────────
  const handleMoveItem = async (sourceType, sourcePath, targetFolderPath = '') => {
    const cleanTarget = targetFolderPath.replace(/^\/+|\/+$/g, '');
    const prefix = cleanTarget ? `${cleanTarget}/` : '';
    const userEmail = currentUser?.email || 'developer@obsidian.io';
    const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';

    if (sourceType === 'file') {
      const fileName = sourcePath.split('/').pop();
      const newPath = `${prefix}${fileName}`;
      if (newPath === sourcePath) return;

      try {
        const targetFile = files.find(f => f.filePath === sourcePath);
        if (!targetFile) return;

        const updatedFiles = files.map(f =>
          f.filePath === sourcePath
            ? { ...f, filePath: newPath, fileName, updatedAt: new Date().toISOString(), lastModifiedBy: userEmail }
            : f
        );

        localMutationTimestampRef.current = Date.now();
        localFilesRef.current = updatedFiles;
        setFiles(updatedFiles);

        if (activeFile?.filePath === sourcePath) {
          setActiveFile(prev => ({ ...prev, filePath: newPath, fileName }));
        }
        setOpenFiles(prev => prev.map(f => f.filePath === sourcePath ? { ...f, filePath: newPath, fileName } : f));

        // Persist to Shared Working Fork (NOT project_files — that's the master baseline)
        try {
          await setDoc(doc(db, 'projects', projectId), {
            working_files: updatedFiles,
            updatedAt: new Date().toISOString(),
            lastWorkingModifiedBy: userEmail
          }, { merge: true });

          await fetch('/api/projects/update-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
            body: JSON.stringify({
              projectId,
              working_files: updatedFiles,
              master_project_files: masterFiles,
              userEmail,
              ownerEmail: projectData?.ownerEmail,
              collaborators: projectData?.collaborators
            })
          });
        } catch (fsErr) { }

        setSaveSyncSuccessMsg(`[→] Moved ${fileName} to ${cleanTarget ? '/' + cleanTarget : 'Project Root'} in Working Fork`);
        setTimeout(() => setSaveSyncSuccessMsg(''), 3500);
      } catch (err) {
        console.error('Error moving file:', err);
        alert(`Failed to move file: ${err.message}`);
      }
    } else if (sourceType === 'folder') {
      const cleanOld = sourcePath.replace(/^\/+|\/+$/g, '');
      const folderBase = cleanOld.split('/').pop();
      const newFolderTarget = `${prefix}${folderBase}`;

      if (newFolderTarget === cleanOld || cleanTarget === cleanOld || cleanTarget.startsWith(cleanOld + '/')) {
        alert('⚠️ Cannot move a folder into itself or one of its own subdirectories.');
        return;
      }

      try {
        const updatedFiles = files.map(f => {
          if (f.filePath === cleanOld || f.filePath.startsWith(`${cleanOld}/`)) {
            const suffix = f.filePath.slice(cleanOld.length);
            const newFilePath = `${newFolderTarget}${suffix}`;
            return {
              ...f,
              filePath: newFilePath,
              fileName: newFilePath.split('/').pop(),
              updatedAt: new Date().toISOString(),
              lastModifiedBy: userEmail
            };
          }
          return f;
        });

        localMutationTimestampRef.current = Date.now();
        localFilesRef.current = updatedFiles;
        setFiles(updatedFiles);

        if (activeFile && (activeFile.filePath === cleanOld || activeFile.filePath.startsWith(`${cleanOld}/`))) {
          const suffix = activeFile.filePath.slice(cleanOld.length);
          const newActivePath = `${newFolderTarget}${suffix}`;
          setActiveFile(prev => ({ ...prev, filePath: newActivePath, fileName: newActivePath.split('/').pop() }));
        }

        setOpenFiles(prev => prev.map(f => {
          if (f.filePath === cleanOld || f.filePath.startsWith(`${cleanOld}/`)) {
            const suffix = f.filePath.slice(cleanOld.length);
            const newTabPath = `${newFolderTarget}${suffix}`;
            return { ...f, filePath: newTabPath, fileName: newTabPath.split('/').pop() };
          }
          return f;
        }));

        // Persist to Shared Working Fork (NOT project_files — that's the master baseline)
        try {
          await setDoc(doc(db, 'projects', projectId), {
            working_files: updatedFiles,
            updatedAt: new Date().toISOString(),
            lastWorkingModifiedBy: userEmail
          }, { merge: true });

          await fetch('/api/projects/update-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
            body: JSON.stringify({
              projectId,
              working_files: updatedFiles,
              master_project_files: masterFiles,
              userEmail,
              ownerEmail: projectData?.ownerEmail,
              collaborators: projectData?.collaborators
            })
          });
        } catch (fsErr) { }

        setSaveSyncSuccessMsg(`[→] Moved folder /${cleanOld} to ${cleanTarget ? '/' + cleanTarget : 'Project Root'} in Working Fork`);
        setTimeout(() => setSaveSyncSuccessMsg(''), 3500);
      } catch (err) {
        console.error('Error moving folder:', err);
        alert(`Failed to move folder: ${err.message}`);
      }
    }
  };

  // ── Import Actions & File Pickers ───────────────────────────────────────────
  const handleTriggerImport = (type, targetFolder = '') => {
    setImportTargetFolder(targetFolder || '');
    if (type === 'files' && fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    } else if (type === 'folder' && folderInputRef.current) {
      folderInputRef.current.value = '';
      folderInputRef.current.click();
    } else if (type === 'zip' && zipInputRef.current) {
      zipInputRef.current.value = '';
      zipInputRef.current.click();
    }
  };

  const handleFilePickerChange = async (e) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    try {
      const parsedFiles = await processLocalFiles(selected, importTargetFolder);
      const analysis = analyzeImportConstraints(parsedFiles);
      setImportModalData({
        type: 'files',
        targetFolder: importTargetFolder,
        files: parsedFiles,
        analysis
      });
    } catch (err) {
      alert(`Error reading files: ${err.message}`);
    }
  };

  const handleFolderPickerChange = async (e) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    try {
      const parsedFiles = await processLocalFolder(selected, importTargetFolder);
      const analysis = analyzeImportConstraints(parsedFiles);
      setImportModalData({
        type: 'folder',
        targetFolder: importTargetFolder,
        files: parsedFiles,
        analysis
      });
    } catch (err) {
      alert(`Error reading folder: ${err.message}`);
    }
  };

  const handleZipPickerChange = async (e) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    try {
      const zipFile = selected[0];
      const parsedFiles = await processZipArchive(zipFile, importTargetFolder);
      const analysis = analyzeImportConstraints(parsedFiles);
      setImportModalData({
        type: 'zip',
        targetFolder: importTargetFolder,
        files: parsedFiles,
        analysis
      });
    } catch (err) {
      alert(`Error reading ZIP archive: ${err.message}`);
    }
  };

  const handleConfirmImport = async (incomingFiles) => {
    try {
      const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';
      const userEmail = currentUser?.email || 'developer@obsidian.io';

      // Prepare new files array with unique fileIds and timestamps
      const newFormattedFiles = incomingFiles.map((f, idx) => ({
        fileId: f.fileId || `file_${projectId}_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 6)}`,
        projectId,
        filePath: f.filePath,
        fileName: f.fileName || (f.filePath ? f.filePath.split('/').pop() : 'file'),
        content: typeof f.content === 'string' ? f.content : '',
        fileType: f.fileType || 'plaintext',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastModifiedBy: userEmail
      }));

      // Merge with existing files (replace if same filePath exists, else append)
      const existingPaths = new Set(newFormattedFiles.map(f => f.filePath));
      const mergedFiles = [
        ...files.filter(f => !existingPaths.has(f.filePath)),
        ...newFormattedFiles
      ];

      localMutationTimestampRef.current = Date.now();
      hasUnsavedForkChangesRef.current = true;
      localFilesRef.current = mergedFiles;
      isLocalDirtyRef.current = true;
      setFiles(mergedFiles);
      setImportModalData(null);

      if (newFormattedFiles.length > 0) {
        handleSelectFile(newFormattedFiles[0]);
      }

      setSaveSyncSuccessMsg(`[+] Staged ${newFormattedFiles.length} file(s) in Working Fork. Save to Local or Request Fork when ready.`);
      setTimeout(() => setSaveSyncSuccessMsg(''), 5000);
    } catch (err) {
      console.error('Error confirming import:', err);
      alert(`Failed to import files: ${err.message}`);
    }
  };

  // Menu & Terminal Drawer State
  const [activeMenu, setActiveMenu] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isExecTerminalOpen, setIsExecTerminalOpen] = useState(false);
  const [activeTerminalTab, setActiveTerminalTab] = useState('interactive'); // 'interactive' | 'ai'

  const handleRunCode = () => {
    if (!activeFile) return;
    setIsExecTerminalOpen(true);
    setActiveTerminalTab('interactive');
    if (terminalController?.runCode) {
      terminalController.runCode(currentContent, activeFile?.filePath || 'src/main.py');
    }
  };

  const toggleMenu = (menuName) => {
    setActiveMenu(prev => prev === menuName ? null : menuName);
  };

  const isUnsaved = currentContent !== savedContent;

  const handleDownloadActiveFile = () => {
    if (!activeFile) return;
    exportSingleFile({ ...activeFile, content: currentContent }, 'original');
  };

  const handleExportProjectJson = () => {
    const bundle = {
      projectId,
      exportedAt: new Date().toISOString(),
      files,
      activeFile: activeFile?.filePath
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectId || 'project'}_workspace_export.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Keyboard Shortcuts (Ctrl+S for Save, Ctrl+Shift+S for Save As, Ctrl+N for New File, Ctrl+R / F5 for Run, Ctrl+` for Terminal, F11 for Fullscreen)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveAs();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const folder = window.prompt("Enter new folder path (e.g. src/components):", "src/utils");
        if (folder && folder.trim()) handleCreateFolder(folder.trim());
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveFile();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const name = window.prompt("Enter new file path (e.g. src/utils.py):", "src/module.py");
        if (name && name.trim()) handleCreateFile(name.trim());
      } else if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') || e.key === 'F5') {
        e.preventDefault();
        handleRunCode();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setIsExecTerminalOpen(prev => !prev);
      } else if (e.key === 'F11') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => { });
        } else {
          document.exitFullscreen().catch(() => { });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFile, currentContent, savedContent, terminalController, files]);

  if (isUnauthorized) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0A0A0B] text-white p-6 font-mono select-none">
        <div className="max-w-lg w-full p-8 bg-surface-container-low border border-red-800/80 rounded-lg shadow-2xl space-y-4">
          <div className="flex items-center gap-3 text-red-400">
            <span className="material-symbols-outlined text-3xl">gpp_bad</span>
            <h1 className="text-xl font-bold font-headline">403 UNAUTHORIZED WORKSPACE ACCESS</h1>
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {unauthorizedMsg || `Your account email (${currentUser?.email}) is not authorized to access repository '${projectId}'.`}
          </p>
          <div className="p-3.5 bg-red-950/50 border border-red-800/70 rounded text-[11px] text-red-200 leading-relaxed">
            🔒 <strong>Security Enforcement:</strong> Access to this repository is restricted to authorized team members. Contact the repository owner to request access permissions.
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full bg-surface-tint text-neutral-900 font-bold py-2.5 text-xs hover:bg-cyan-400 transition-colors cursor-pointer rounded"
          >
            RETURN TO DASHBOARD
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-surface-dark text-on-surface overflow-hidden font-sans relative">
      {/* Invisible backdrop to dismiss open dropdown menus on outside click */}
      {activeMenu && (
        <div className="fixed inset-0 z-[190]" onClick={() => setActiveMenu(null)} />
      )}

      {/* Top IDE Toolbelt Header - Full VS Code Navigation */}
      <header className="fixed top-0 left-0 w-full z-[200] flex justify-between items-center px-4 h-11 bg-[#101015]/95 backdrop-blur-xl border-b border-white/10 shadow-md select-none font-mono text-xs">
        <div className="flex items-center gap-6">
          {/* Logo */}
          <Link
            to="/dashboard"
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 cursor-pointer group no-underline"
            title="Return to Workspace Central Launcher (Dashboard)"
          >
            <div className="w-6 h-6 rounded bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-[0_0_10px_rgba(0,220,229,0.3)] group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-black text-sm font-bold">code_blocks</span>
            </div>
            <span className="text-sm font-bold text-white font-headline tracking-tight group-hover:text-cyan-300 transition-colors">
              ObsidianIDE
            </span>
          </Link>

          {/* ── VS Code-Style Menu Bar ── */}
          <nav className="hidden lg:flex items-center gap-1 text-[11px] text-zinc-400 relative z-[210]">
            {/* 1. File Menu */}
            <div className="relative">
              <button
                onClick={() => toggleMenu('file')}
                className={`px-2.5 py-1 rounded hover:text-white hover:bg-white/5 transition-all cursor-pointer ${activeMenu === 'file' ? 'bg-white/10 text-cyan-300 font-bold' : ''}`}
              >
                File
              </button>
              {activeMenu === 'file' && (
                <div className="absolute top-8 left-0 w-64 bg-[#12131A]/98 backdrop-blur-2xl border border-white/[0.12] rounded-lg shadow-2xl py-1.5 z-[300] divide-y divide-white/5 animate-fade-in font-sans text-xs">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setActiveMenu(null);
                        const name = window.prompt("Enter new file path (e.g. src/module.cpp):", "src/new_file.py");
                        if (name && name.trim()) handleCreateFile(name.trim());
                      }}
                      className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/15 hover:text-cyan-300 flex justify-between items-center cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-cyan-400">note_add</span>
                        <span>New File...</span>
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">Ctrl+N</span>
                    </button>
                    <button
                      onClick={() => {
                        setActiveMenu(null);
                        const folder = window.prompt("Enter new folder path (e.g. src/components):", "src/utils");
                        if (folder && folder.trim()) handleCreateFolder(folder.trim());
                      }}
                      className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/15 hover:text-cyan-300 flex justify-between items-center cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-cyan-400">create_new_folder</span>
                        <span>New Folder...</span>
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">Ctrl+Shift+N</span>
                    </button>
                  </div>

                  {/* Import Submenu */}
                  <div className="py-1">
                    <button
                      onClick={() => { handleTriggerImport('files', ''); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/15 hover:text-cyan-300 flex items-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm text-cyan-400">file_upload</span>
                      <span>Import File(s)...</span>
                    </button>
                    <button
                      onClick={() => { handleTriggerImport('folder', ''); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/15 hover:text-cyan-300 flex items-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm text-emerald-400">drive_folder_upload</span>
                      <span>Import Folder Project...</span>
                    </button>
                    <button
                      onClick={() => { handleTriggerImport('zip', ''); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/15 hover:text-cyan-300 flex items-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm text-amber-400">folder_zip</span>
                      <span>Import ZIP Archive...</span>
                    </button>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => { handleSaveFile(); setActiveMenu(null); }}
                      disabled={!activeFile}
                      className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/15 hover:text-cyan-300 flex justify-between items-center disabled:opacity-40 cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-emerald-400">save</span>
                        <span>Save & Sync</span>
                        {isUnsaved && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24]" />}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">Ctrl+S</span>
                    </button>
                    <button
                      onClick={() => { handleSaveAs(); setActiveMenu(null); }}
                      disabled={!activeFile}
                      className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/15 hover:text-cyan-300 flex justify-between items-center disabled:opacity-40 cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-sky-400">save_as</span>
                        <span>Save As...</span>
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">Ctrl+Shift+S</span>
                    </button>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => { handleDownloadProjectZip(); setActiveMenu(null); }}
                      className={`w-full text-left px-3 py-1.5 flex justify-between items-center cursor-pointer transition-colors ${activeUserRole === 'OWNER' || projectData?.ownerId === currentUser?.uid || projectData?.ownerEmail === currentUser?.email
                          ? 'text-cyan-300 hover:bg-cyan-500/20'
                          : 'text-zinc-500 hover:bg-white/5 opacity-70'
                        }`}
                      title={activeUserRole === 'OWNER' || projectData?.ownerId === currentUser?.uid || projectData?.ownerEmail === currentUser?.email ? "Package entire project as a compressed ZIP" : "Owner permission required"}
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-amber-400">folder_zip</span>
                        <span>Download Project (ZIP)</span>
                      </span>
                      {activeUserRole === 'OWNER' || projectData?.ownerId === currentUser?.uid || projectData?.ownerEmail === currentUser?.email ? (
                        <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono font-bold">OWNER</span>
                      ) : (
                        <span className="material-symbols-outlined text-xs text-zinc-500">lock</span>
                      )}
                    </button>
                    <button
                      onClick={() => { handleExportProjectJson(); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-emerald-500/15 hover:text-emerald-300 flex items-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm text-emerald-400">data_object</span>
                      <span>Export Project (.json)</span>
                    </button>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => { if (activeFile) handleCloseTab(activeFile); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/15 hover:text-cyan-300 flex justify-between items-center cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-zinc-400">close</span>
                        <span>Close Active Tab</span>
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">Ctrl+W</span>
                    </button>
                    <button
                      onClick={() => { window.location.reload(); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/15 hover:text-cyan-300 flex items-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm text-zinc-400">refresh</span>
                      <span>Refresh Workspace</span>
                    </button>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => { navigate('/dashboard'); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-cyan-500/15 hover:text-cyan-300 flex items-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm text-zinc-400">dashboard</span>
                      <span>Switch Project (Dashboard)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Edit Menu */}
            <div className="relative">
              <button
                onClick={() => toggleMenu('edit')}
                className={`px-2.5 py-1 rounded hover:text-white hover:bg-white/5 transition-all cursor-pointer ${activeMenu === 'edit' ? 'bg-white/10 text-cyan-300 font-bold' : ''}`}
              >
                Edit
              </button>
              {activeMenu === 'edit' && (
                <div className="absolute top-8 left-0 w-56 bg-[#16171F]/95 backdrop-blur-2xl border border-white/10 rounded-lg shadow-2xl py-1.5 z-[300] divide-y divide-white/5 animate-fade-in">
                  <div className="py-0.5">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(currentContent);
                        alert('Copied active editor buffer to clipboard');
                        setActiveMenu(null);
                      }}
                      className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 flex justify-between items-center cursor-pointer"
                    >
                      <span>Copy Buffer</span>
                      <span className="text-[10px] text-zinc-500">Ctrl+C</span>
                    </button>
                    <button
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(currentContent);
                          setCurrentContent(JSON.stringify(parsed, null, 2));
                        } catch (e) {
                          alert('Indentation structured.');
                        }
                        setActiveMenu(null);
                      }}
                      className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 flex justify-between items-center cursor-pointer"
                    >
                      <span>Format Document</span>
                      <span className="text-[10px] text-zinc-500">Shift+Alt+F</span>
                    </button>
                  </div>
                  <div className="py-0.5">
                    <button
                      onClick={() => { setCurrentContent(''); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 cursor-pointer"
                    >
                      Clear Buffer Content
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Selection Menu */}
            <div className="relative">
              <button
                onClick={() => toggleMenu('selection')}
                className={`px-2.5 py-1 rounded hover:text-white hover:bg-white/5 transition-all cursor-pointer ${activeMenu === 'selection' ? 'bg-white/10 text-cyan-300 font-bold' : ''}`}
              >
                Selection
              </button>
              {activeMenu === 'selection' && (
                <div className="absolute top-8 left-0 w-52 bg-[#16171F]/95 backdrop-blur-2xl border border-white/10 rounded-lg shadow-2xl py-1.5 z-[300] animate-fade-in">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(currentContent);
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 flex justify-between items-center cursor-pointer"
                  >
                    <span>Select All</span>
                    <span className="text-[10px] text-zinc-500">Ctrl+A</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsShortcutsOpen(true);
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 cursor-pointer"
                  >
                    Multi-Cursor Controls
                  </button>
                </div>
              )}
            </div>

            {/* 4. View Menu */}
            <div className="relative">
              <button
                onClick={() => toggleMenu('view')}
                className={`px-2.5 py-1 rounded hover:text-white hover:bg-white/5 transition-all cursor-pointer ${activeMenu === 'view' ? 'bg-white/10 text-cyan-300 font-bold' : ''}`}
              >
                View
              </button>
              {activeMenu === 'view' && (
                <div className="absolute top-8 left-0 w-64 bg-[#16171F]/95 backdrop-blur-2xl border border-white/10 rounded-lg shadow-2xl py-1.5 z-[300] divide-y divide-white/5 animate-fade-in">
                  <div className="py-0.5">
                    {/* Live Sandbox Preview Toggle */}
                    <button
                      onClick={() => { setIsSandboxOpen(prev => !prev); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 flex justify-between items-center cursor-pointer font-sans"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-emerald-400">preview</span>
                        <span>Live Sandbox Preview</span>
                      </span>
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${isSandboxOpen
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-white/5 text-zinc-500 border-white/5'
                        }`}>
                        {isSandboxOpen ? '✓ ON' : 'OFF'}
                      </span>
                    </button>

                    {/* Integrated Terminal Toggle */}
                    <button
                      onClick={() => { setIsExecTerminalOpen(prev => !prev); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 flex justify-between items-center cursor-pointer font-sans"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-cyan-400">terminal</span>
                        <span>Toggle Terminal</span>
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">Ctrl+`</span>
                    </button>

                    {/* AI Assistant Sidebar Toggle */}
                    <button
                      onClick={() => { setIsAIChatOpen(prev => !prev); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 flex justify-between items-center cursor-pointer font-sans"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-purple-400">auto_awesome</span>
                        <span>AI Assistant Sidebar</span>
                      </span>
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${isAIChatOpen
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : 'bg-white/5 text-zinc-500 border-white/5'
                        }`}>
                        {isAIChatOpen ? '✓ ON' : 'OFF'}
                      </span>
                    </button>

                    {/* Live Repository Diffs */}
                    <button
                      onClick={() => { setIsDiffViewActive(prev => !prev); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 flex justify-between items-center cursor-pointer font-sans"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-cyan-400">difference</span>
                        <span>Live Repository Diffs</span>
                      </span>
                      <span className="text-[10px] text-cyan-400 font-mono font-bold">
                        ({Object.keys(fileStatusMap).length} changed)
                      </span>
                    </button>

                    {/* Active Collaborators Toggle */}
                    <button
                      onClick={() => { setShowActiveCollaborators(prev => !prev); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 flex justify-between items-center cursor-pointer font-sans"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-sky-400">group</span>
                        <span>Active Collaborators</span>
                      </span>
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${showActiveCollaborators
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-white/5 text-zinc-500 border-white/5'
                        }`}>
                        {showActiveCollaborators ? `✓ ON (${remoteCollaborators.length + 1})` : 'OFF'}
                      </span>
                    </button>
                  </div>
                  <div className="py-0.5">
                    <button
                      onClick={() => {
                        if (!document.fullscreenElement) {
                          document.documentElement.requestFullscreen().catch(() => { });
                        } else {
                          document.exitFullscreen().catch(() => { });
                        }
                        setActiveMenu(null);
                      }}
                      className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 flex justify-between items-center cursor-pointer"
                    >
                      <span>Toggle Fullscreen</span>
                      <span className="text-[10px] text-zinc-500">F11</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 5. Run Menu */}
            <div className="relative">
              <button
                onClick={() => toggleMenu('run')}
                className={`px-2.5 py-1 rounded hover:text-white hover:bg-white/5 transition-all cursor-pointer ${activeMenu === 'run' ? 'bg-white/10 text-cyan-300 font-bold' : ''}`}
              >
                Run
              </button>
              {activeMenu === 'run' && (
                <div className="absolute top-8 left-0 w-60 bg-[#16171F]/95 backdrop-blur-2xl border border-white/10 rounded-lg shadow-2xl py-1.5 z-[300] divide-y divide-white/5 animate-fade-in">
                  <div className="py-0.5">
                    <button
                      onClick={() => { handleRunCode(); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 font-bold flex justify-between items-center cursor-pointer"
                    >
                      <span>▶ Run Code</span>
                      <span className="text-[10px] text-zinc-500">Ctrl+R / F5</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsExecTerminalOpen(true);
                        setActiveTerminalTab('interactive');
                        setActiveMenu(null);
                      }}
                      className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 cursor-pointer"
                    >
                      Interactive Terminal Execution
                    </button>
                  </div>
                  <div className="py-0.5">
                    <button
                      onClick={() => { setExecutionOutput(null); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 cursor-pointer"
                    >
                      Clear Output Console
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 6. Terminal Menu */}
            <div className="relative">
              <button
                onClick={() => toggleMenu('terminal')}
                className={`px-2.5 py-1 rounded hover:text-white hover:bg-white/5 transition-all cursor-pointer ${activeMenu === 'terminal' ? 'bg-white/10 text-cyan-300 font-bold' : ''}`}
              >
                Terminal
              </button>
              {activeMenu === 'terminal' && (
                <div className="absolute top-8 left-0 w-56 bg-[#16171F]/95 backdrop-blur-2xl border border-white/10 rounded-lg shadow-2xl py-1.5 z-[300] animate-fade-in">
                  <button
                    onClick={() => {
                      setIsExecTerminalOpen(true);
                      setActiveTerminalTab('interactive');
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 flex justify-between items-center cursor-pointer"
                  >
                    <span>New Terminal</span>
                    <span className="text-[10px] text-zinc-500">Ctrl+`</span>
                  </button>
                  <button
                    onClick={() => {
                      handleRunCode();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 cursor-pointer"
                  >
                    Run Active File
                  </button>
                </div>
              )}
            </div>

            {/* 7. Help Menu */}
            <div className="relative">
              <button
                onClick={() => toggleMenu('help')}
                className={`px-2.5 py-1 rounded hover:text-white hover:bg-white/5 transition-all cursor-pointer ${activeMenu === 'help' ? 'bg-white/10 text-cyan-300 font-bold' : ''}`}
              >
                Help
              </button>
              {activeMenu === 'help' && (
                <div className="absolute top-8 left-0 w-60 bg-[#16171F]/95 backdrop-blur-2xl border border-white/10 rounded-lg shadow-2xl py-1.5 z-[300] divide-y divide-white/5 animate-fade-in">
                  <div className="py-0.5">
                    <button
                      onClick={() => { setIsShortcutsOpen(true); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-cyan-300 hover:bg-cyan-500/15 hover:text-cyan-200 flex justify-between items-center cursor-pointer font-bold"
                    >
                      <span>Keyboard Shortcuts</span>
                      <span className="text-[10px] text-zinc-500">Ctrl+K</span>
                    </button>
                    <button
                      onClick={() => { window.open('https://github.com', '_blank'); setActiveMenu(null); }}
                      className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-cyan-500/15 hover:text-cyan-300 cursor-pointer"
                    >
                      Documentation & Guide
                    </button>
                  </div>
                  <div className="py-0.5">
                    <button
                      onClick={() => {
                        alert('ObsidianIDE v2.0\nCloud-Powered Collaborative Development Engine with Secure Sandboxed Terminal.');
                        setActiveMenu(null);
                      }}
                      className="w-full text-left px-3 py-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 cursor-pointer"
                    >
                      About ObsidianIDE
                    </button>
                  </div>
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Right Actions: Role Badge, Run Code Play Button, Link Meet, AI Assistant, Master Save & Sync, Theme Toggle */}
        <div className="flex items-center gap-3">
          {/* Active User Access Role Badge */}
          <span className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-md border font-mono ${activeUserRole === 'OWNER'
              ? 'bg-amber-950/60 text-amber-300 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
              : activeUserRole === 'REVIEWER'
                ? 'bg-purple-950/60 text-purple-300 border-purple-500/40'
                : 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40'
            }`}>
            {activeUserRole}
          </span>

          {/* ── Single Unified Clean Play Button (Run Code) ── */}
          <button
            onClick={handleRunCode}
            disabled={isExecuting || !activeFile}
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400/40 px-3.5 py-1 text-xs rounded-md font-bold transition-all shadow-[0_0_14px_rgba(16,185,129,0.35)] hover:shadow-[0_0_20px_rgba(16,185,129,0.5)] cursor-pointer disabled:opacity-50 active:scale-95 font-mono"
            title="Execute active code in interactive terminal (Ctrl+R / F5)"
          >
            <span className="material-symbols-outlined text-sm">{isExecuting ? 'sync' : 'play_arrow'}</span>
            <span>{isExecuting ? 'Running...' : 'Run Code'}</span>
          </button>

          {/* Active Collaborators Presence Stack & Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsCollaboratorsDrawerOpen(prev => !prev)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] rounded-md text-xs transition-colors cursor-pointer"
              title="View active collaborators working on this project"
            >
              <div className="flex items-center -space-x-1.5">
                {remoteCollaborators.slice(0, 3).map((c, i) => (
                  <div
                    key={c.email || i}
                    className="w-5 h-5 rounded-full text-black font-bold text-[9px] flex items-center justify-center border border-black shadow"
                    style={{ backgroundColor: c.color || '#00DCE5' }}
                    title={`${c.displayName} (${c.email})`}
                  >
                    {(c.displayName?.charAt(0) || 'U').toUpperCase()}
                  </div>
                ))}
                {remoteCollaborators.length === 0 && (
                  <div className="w-5 h-5 rounded-full bg-cyan-500 text-black font-bold text-[9px] flex items-center justify-center border border-black">
                    {(currentUser?.displayName?.charAt(0) || currentUser?.email?.charAt(0) || 'U').toUpperCase()}
                  </div>
                )}
              </div>
              <span className="text-[11px] text-zinc-300 font-medium hidden md:inline">
                {remoteCollaborators.length + 1} Online
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            </button>

            {isCollaboratorsDrawerOpen && (
              <div className="absolute right-0 top-9 w-72 bg-[#12131A]/98 backdrop-blur-2xl border border-white/[0.12] rounded-xl shadow-2xl p-3 z-[300] space-y-2 animate-fade-in font-sans">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                    <span className="material-symbols-outlined text-sm text-cyan-400">group</span>
                    <span>Active Collaborators ({remoteCollaborators.length + 1})</span>
                  </div>
                  <button onClick={() => setIsCollaboratorsDrawerOpen(false)} className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded cursor-pointer">
                    <span className="material-symbols-outlined text-xs">close</span>
                  </button>
                </div>

                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {/* Current User Self Card */}
                  <div className="flex items-center justify-between p-1.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-cyan-400 text-black font-bold flex items-center justify-center text-[10px]">
                        {(currentUser?.displayName?.charAt(0) || currentUser?.email?.charAt(0) || 'Y').toUpperCase()}
                      </div>
                      <div>
                        <div className="text-cyan-200 font-medium text-[11px] flex items-center gap-1">
                          <span>{currentUser?.displayName || currentUser?.email?.split('@')[0]}</span>
                          <span className="text-[9px] text-cyan-400/80 font-mono">(You)</span>
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono">{activeFile?.filePath || 'Workspace'}</div>
                      </div>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold">{activeUserRole}</span>
                  </div>

                  {/* Remote Active Collaborators */}
                  {remoteCollaborators.map(c => (
                    <div
                      key={c.email}
                      onClick={() => {
                        if (c.activeFilePath) {
                          const targetFile = files.find(f => f.filePath === c.activeFilePath || f.fileName === c.activeFilePath);
                          if (targetFile) handleSelectFile(targetFile);
                        }
                        setIsCollaboratorsDrawerOpen(false);
                      }}
                      className="flex items-center justify-between p-1.5 rounded hover:bg-white/5 border border-white/[0.04] text-xs cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full text-black font-bold flex items-center justify-center text-[10px]"
                          style={{ backgroundColor: c.color || '#00DCE5' }}
                        >
                          {(c.displayName?.charAt(0) || 'U').toUpperCase()}
                        </div>
                        <div>
                          <div className="text-zinc-200 font-medium text-[11px]">{c.displayName}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">
                            {c.activeFilePath ? `${c.activeFilePath.split('/').pop()}: Ln ${c.cursor?.lineNumber || 1}` : 'Online'}
                          </div>
                        </div>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-400 font-mono">{c.role || 'EDITOR'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Invite Teammate */}
          <button
            onClick={handleInviteTeammate}
            className="flex items-center gap-1.5 bg-zinc-900/90 text-zinc-300 border border-white/10 px-2.5 py-1 text-xs rounded-md hover:border-cyan-400/50 hover:text-cyan-300 transition-colors cursor-pointer"
            title="Invite Teammate to Project Workspace"
          >
            <span className="material-symbols-outlined text-sm">person_add</span>
            <span className="hidden sm:inline">Invite</span>
          </button>

          <button
            onClick={() => window.open('https://meet.google.com/new', '_blank')}
            className="flex items-center gap-2 bg-cyan-950/40 text-primary-fixed-dim border border-cyan-800/40 px-3 py-1 text-xs rounded hover:bg-cyan-900/50 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">video_call</span>
            <span>Link Meet</span>
          </button>

          {/* Agentic AI Assistant Trigger Button (Top Right) */}
          <button
            onClick={() => setIsAIChatOpen(!isAIChatOpen)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-600 to-purple-600 text-white px-3 py-1 text-xs rounded font-bold hover:brightness-110 transition-all shadow-[0_0_12px_#00dce5] cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">auto_awesome</span>
            <span>AI Assistant</span>
          </button>

          {/* ── Dual-Tier Architecture: Owner Master Commit vs Editor Local Save & Fork Request ── */}
          {isProjectOwner ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveAndSyncMaster}
                disabled={isSaving}
                className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white px-3.5 py-1 text-xs rounded-md font-bold transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] cursor-pointer font-mono active:scale-95 disabled:opacity-50"
                title="Commit and merge all live Working Fork modifications into the canonical Master Repository"
              >
                <span className="material-symbols-outlined text-sm">{isSaving ? 'sync' : 'cloud_sync'}</span>
                <span>{isSaving ? 'Merging...' : 'Save & Sync to Master'}</span>
                {Object.keys(fileStatusMap).length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px] font-mono border border-white/20">
                    {Object.keys(fileStatusMap).length}
                  </span>
                )}
              </button>
              {Object.keys(fileStatusMap).length > 0 && (
                <button
                  onClick={handleRejectFork}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white px-3 py-1 text-xs rounded-md font-bold transition-all shadow-[0_0_12px_rgba(239,68,68,0.4)] cursor-pointer font-mono active:scale-95 disabled:opacity-50 animate-fade-in"
                  title="Decline collaborator working fork and restore shared workspace to Master baseline"
                >
                  <span className="material-symbols-outlined text-sm">{isSaving ? 'sync' : 'cancel'}</span>
                  <span>Reject Fork</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveToLocalStorage}
                disabled={isSaving}
                className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-cyan-300 border border-cyan-500/40 px-3 py-1 text-xs rounded-md font-bold transition-all cursor-pointer font-mono shadow-sm active:scale-95"
                title="Save modified and new files strictly into your personal local storage & database"
              >
                <span className="material-symbols-outlined text-sm">{isSaving ? 'sync' : 'save'}</span>
                <span>Save to Local</span>
              </button>
              {/* Request Fork button ONLY appears when Editor has modified code or staged uncommitted changes */}
              {hasEditorForkChanges && (
                <button
                  onClick={handleRequestFork}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white px-3 py-1 text-xs rounded-md font-bold transition-all shadow-md cursor-pointer font-mono active:scale-95 disabled:opacity-50 animate-fade-in"
                  title="Submit staged working fork to the Project Owner for review & master merge"
                >
                  <span className="material-symbols-outlined text-sm">{isSaving ? 'sync' : 'fork_right'}</span>
                  <span>Request Fork</span>
                  {editorAuthoredChangesCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px] font-mono border border-white/20">
                      {editorAuthoredChangesCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Save / Sync Notification Toast Banner */}
      {saveSyncSuccessMsg && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[250] bg-[#12131C]/95 border border-cyan-500/50 backdrop-blur-xl text-cyan-200 px-4 py-2 rounded-xl shadow-[0_0_25px_rgba(6,182,212,0.3)] text-xs font-mono flex items-center gap-2.5 animate-fade-in">
          <span className="material-symbols-outlined text-cyan-400 text-sm">verified</span>
          <span>{saveSyncSuccessMsg}</span>
        </div>
      )}

      {/* 3-Pane Split Workspace Main Canvas */}
      <main className="flex-1 flex pt-11 pb-8 h-[calc(100vh)] bg-surface-dark overflow-hidden relative">
        {loading ? (
          <div className="w-full flex items-center justify-center font-mono text-xs text-surface-tint">
            Initializing workspace files & flat path parser...
          </div>
        ) : (
          <>
            {/* Pane A: Left-Hand Directory Explorer */}
            <FileExplorer
              files={files}
              activeFile={activeFile}
              onSelectFile={handleSelectFile}
              onCreateFile={handleCreateFile}
              onCreateFolder={handleCreateFolder}
              onRenameFile={handleRenameFile}
              onDeleteFile={handleDeleteFile}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onPasteItem={handlePasteItem}
              onMoveItem={handleMoveItem}
              onTriggerImport={handleTriggerImport}
              fileStatusMap={fileStatusMap}
              attributions={fileAttributions}
              projectTitle={projectData?.title || 'Quantum_Router'}
              isProjectOwner={isProjectOwner}
              onSaveAndSyncMaster={handleSaveAndSyncMaster}
              onRejectFork={handleRejectFork}
              isSaving={isSaving}
              width={leftWidth}
            />

            {/* ── Left Draggable Partition Splitter (Explorer <-> Editor) ── */}
            <div
              onMouseDown={() => setIsDraggingLeft(true)}
              className={`w-1.5 hover:w-2 bg-white/[0.06] hover:bg-cyan-500 cursor-col-resize z-40 transition-all select-none relative group shrink-0 ${isDraggingLeft ? 'bg-cyan-400 !w-2 shadow-[0_0_10px_#06b6d4]' : ''
                }`}
              title="Drag to resize Directory Explorer"
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-6 bg-zinc-600 group-hover:bg-black rounded-full pointer-events-none" />
            </div>

            {/* Pane B: Central Development Area (Monaco Editor / GitHub Diff / Binary Asset Viewer) */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-[#0E0E12]">
              {/* 1. Working Fork Active (Shown to Editor ONLY when Editor has staged changes) */}
              {!isProjectOwner && hasEditorForkChanges && (
                <div className="bg-amber-950/80 border-b border-amber-500/40 px-4 py-1.5 flex items-center justify-between text-xs font-mono text-amber-200 shrink-0 z-20 shadow-md">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-base text-amber-400 animate-pulse">fork_right</span>
                    <div>
                      <span className="font-bold text-amber-300">Working Fork Active:</span>{' '}
                      <span>{editorAuthoredChangesCount || 1} file change(s) staged by you (Pending Project Owner review & merge into Master).</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Master Updated by Owner (Shown to Editor when Owner modified files) */}
              {!isProjectOwner && !hasEditorForkChanges && hasOwnerAuthoredChanges && (
                <div className="bg-cyan-950/80 border-b border-cyan-500/40 px-4 py-1.5 flex items-center justify-between text-xs font-mono text-cyan-200 shrink-0 z-20 shadow-md">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-base text-cyan-400">cloud_download</span>
                    <div>
                      <span className="font-bold text-cyan-300">Master Updated by Owner:</span>{' '}
                      <span>The Project Owner updated repository files. Click &apos;Save to Local&apos; to save a copy into your personal storage.</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Owner Pending Merge Review Banner (Shown to Owner when workspace has changes) */}
              {isProjectOwner && Object.keys(fileStatusMap).length > 0 && (
                <div className="bg-cyan-950/95 border-b border-cyan-500/50 px-4 py-1.5 flex items-center justify-between text-xs font-mono text-cyan-200 shrink-0 z-20 shadow-lg flex-wrap gap-2 animate-fade-in">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-base text-cyan-400 animate-pulse">rate_review</span>
                    <div>
                      <span className="font-bold text-cyan-300">Pending Review:</span>{' '}
                      <span>{Object.keys(fileStatusMap).length} working change{Object.keys(fileStatusMap).length > 1 ? 's' : ''} staged (Accept & Merge or Reject & Restore Master).</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveAndSyncMaster}
                      disabled={isSaving}
                      className="px-3 py-1 rounded bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow-md active:scale-95"
                      title="Approve and merge collaborator changes into Master"
                    >
                      <span className="material-symbols-outlined text-xs">check_circle</span>
                      <span>Merge to Master</span>
                    </button>
                    <button
                      onClick={handleRejectFork}
                      disabled={isSaving}
                      className="px-3 py-1 rounded bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow-md active:scale-95"
                      title="Decline changes and restore Master baseline"
                    >
                      <span className="material-symbols-outlined text-xs">cancel</span>
                      <span>Reject Fork</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Secondary Active File Tab Bar with Live Diff vs Master Toggle & Fork Status */}
              {activeFile && (
                <div className="h-8 bg-[#12131A] border-b border-white/[0.06] flex items-center justify-between px-3 text-xs font-mono select-none z-10 shrink-0">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[11px] text-zinc-300 font-semibold truncate max-w-[240px]">
                      {activeFile.fileName || activeFile.filePath.split('/').pop()}
                    </span>
                    {fileStatusMap[activeFile.filePath] && (
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${fileStatusMap[activeFile.filePath] === 'ADDED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                          : fileStatusMap[activeFile.filePath] === 'MODIFIED'
                            ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                            : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                        }`}>
                        {fileStatusMap[activeFile.filePath] === 'ADDED' ? '• NEW PROPOSED FILE' : '• PROPOSED MODIFICATION'}
                      </span>
                    )}
                    {isBinaryFile(activeFile.filePath) && (
                      <span className="text-[9px] bg-cyan-950/70 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.2 rounded">
                        BINARY ASSET
                      </span>
                    )}
                  </div>

                  {/* Right Side Options */}
                  <div className="flex items-center gap-2">
                    {!isBinaryFile(activeFile.filePath) && (
                      <div className="flex items-center bg-black/50 p-0.5 rounded-lg border border-white/10 text-[11px]">
                        <button
                          onClick={() => setIsDiffViewActive(false)}
                          className={`px-2.5 py-0.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${!isDiffViewActive
                              ? 'bg-cyan-600 text-white font-bold shadow'
                              : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                        >
                          <span className="material-symbols-outlined text-xs">code</span>
                          <span>Edit Code</span>
                        </button>
                        <button
                          onClick={() => setIsDiffViewActive(true)}
                          className={`px-2.5 py-0.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${isDiffViewActive
                              ? 'bg-purple-600 text-white font-bold shadow'
                              : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                        >
                          <span className="material-symbols-outlined text-xs">difference</span>
                          <span>View Diff vs Master</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* View Selection: Binary Viewer / GitHub Diff / Monaco Canvas */}
              {activeFile && isBinaryFile(activeFile.filePath) ? (
                <BinaryAssetViewer fileObj={activeFile} />
              ) : isDiffViewActive && activeFile ? (
                <GitHubDiffViewer
                  originalContent={activeMasterFile?.content || ''}
                  modifiedContent={currentContent}
                  fileName={activeFile.fileName || activeFile.filePath.split('/').pop()}
                  language={activeFile.fileType || 'javascript'}
                  lastModifiedBy={activeFile.lastModifiedBy}
                  attribution={fileAttributions[activeFile.filePath]}
                  collaborators={projectData?.collaborators || {}}
                  isDark={isDark}
                  onClose={() => setIsDiffViewActive(false)}
                />
              ) : (
                <MonacoEditorCanvas
                  openFiles={openFiles}
                  activeFile={activeFile}
                  onSelectTab={handleSelectTab}
                  onCloseTab={handleCloseTab}
                  currentContent={currentContent}
                  onChangeContent={setCurrentContent}
                  onSaveFile={handleSaveFile}
                  isSaving={isSaving}
                  isUnsaved={isUnsaved}
                  isReadOnly={activeUserRole === 'REVIEWER'}
                  remoteCollaborators={remoteCollaborators}
                  onCursorChange={handleLocalCursorChange}
                  currentUserEmail={currentUser?.email}
                  showActiveCollaborators={showActiveCollaborators}
                />
              )}
            </div>

            {/* ── Right Draggable Partition Splitter (Editor <-> Live Sandbox) ── */}
            {isSandboxOpen && (
              <div
                onMouseDown={() => setIsDraggingRight(true)}
                className={`w-1.5 hover:w-2 bg-white/[0.06] hover:bg-cyan-500 cursor-col-resize z-40 transition-all select-none relative group shrink-0 ${isDraggingRight ? 'bg-cyan-400 !w-2 shadow-[0_0_10px_#06b6d4]' : ''
                  }`}
                title="Drag to resize Live Sandbox"
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-6 bg-zinc-600 group-hover:bg-black rounded-full pointer-events-none" />
              </div>
            )}

            {/* Pane C: Right-Hand Live Preview Sandbox Frame (Toggleable via View Menu) */}
            {isSandboxOpen && (
              <SandboxPreview
                content={currentContent}
                activeFilePath={activeFile?.filePath || ''}
                onClose={() => setIsSandboxOpen(false)}
                width={rightWidth}
              />
            )}

            {/* ── Integrated Terminal Bottom Drawer ── */}
            {isExecTerminalOpen && (
              <div
                className="absolute bottom-8 bg-[#0A0A0D] border-t border-white/[0.08] shadow-2xl z-[150] flex flex-col transition-all duration-75"
                style={{
                  left: `${leftWidth}px`,
                  right: isSandboxOpen ? `${rightWidth}px` : '0px',
                  height: '300px'
                }}
              >
                {/* Terminal Header */}
                <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#0D0E14] flex-shrink-0 px-3 py-1.5">
                  <div className="flex items-center gap-2 text-cyan-300 font-mono text-xs font-bold">
                    <span className="material-symbols-outlined text-sm text-cyan-400">terminal</span>
                    <span>Integrated Terminal</span>
                    <span className="text-[10px] text-zinc-500 font-normal">({activeFile?.filePath?.split('.').pop() || 'shell'})</span>
                  </div>
                  <button
                    onClick={() => setIsExecTerminalOpen(false)}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer rounded"
                    title="Close terminal panel (Ctrl+`)"
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                </div>

                {/* Terminal Content */}
                <div className="flex-1 overflow-hidden">
                  <InteractiveTerminal
                    projectId={projectId}
                    language={activeFile?.fileType || 'python'}
                    currentUser={currentUser}
                    currentCode={currentContent}
                    activeFilePath={activeFile?.filePath || 'src/main.py'}
                    isVisible={isExecTerminalOpen}
                    onTerminalReady={(ctrl) => setTerminalController(ctrl)}
                  />
                </div>
              </div>
            )}

            {/* Agentic AI Chatbot Drawer (Right Side) */}
            <AgenticAIChatSidebar
              isOpen={isAIChatOpen}
              onClose={() => setIsAIChatOpen(false)}
              activeFile={activeFile}
              currentContent={currentContent}
              files={files}
              onApplyModifications={handleApplyAIModifications}
              projectId={projectId}
              width={rightWidth}
            />
          </>
        )}
      </main>

      {/* Footer Status Bar */}
      <footer className="fixed bottom-0 left-0 w-full z-[100] flex justify-between items-center px-6 h-8 bg-surface-container-lowest/80 backdrop-blur-md border-t border-outline-variant text-[11px] font-mono text-on-surface-variant select-none">
        <div className="flex items-center gap-4">
          <span className="text-surface-tint font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">account_tree</span>
            main*
          </span>
          {Object.keys(fileStatusMap).length > 0 ? (
            <span className="text-amber-300 font-bold flex items-center gap-1 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/40">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>Fork: {Object.keys(fileStatusMap).length} staged change{Object.keys(fileStatusMap).length > 1 ? 's' : ''}</span>
            </span>
          ) : (
            <span className="text-emerald-400/80 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">done_all</span>
              <span>Master in Sync</span>
            </span>
          )}
          <span>Firestore Real-Time Synced</span>
          {userProfile?.info?.personalStorageConnected === false ? (
            <button
              onClick={() => navigate('/onboarding')}
              className="text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/40 cursor-pointer"
              title="Click to connect your personal database"
            >
              <span className="material-symbols-outlined text-xs">database</span>
              <span>Connect Personal Database</span>
            </button>
          ) : (
            <span className="text-emerald-400/80 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">database</span>
              <span>DB Connected</span>
            </span>
          )}
        </div>
        <div>© 2026 Obsidian Systems. Built via agile workspace methodology layers.</div>
      </footer>

      {/* Keyboard Shortcuts Cheat Sheet Modal */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Pre-Import Verification & Constraint Safety Analysis Modal */}
      <ImportAnalysisModal
        isOpen={!!importModalData}
        onClose={() => setImportModalData(null)}
        importData={importModalData}
        onConfirm={handleConfirmImport}
      />

      {/* Hidden File Input Pickers */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={handleFilePickerChange}
        className="hidden"
      />
      <input
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        ref={folderInputRef}
        onChange={handleFolderPickerChange}
        className="hidden"
      />
      <input
        type="file"
        accept=".zip"
        ref={zipInputRef}
        onChange={handleZipPickerChange}
        className="hidden"
      />
    </div>
  );
};
export default IDEWorkspacePage;
