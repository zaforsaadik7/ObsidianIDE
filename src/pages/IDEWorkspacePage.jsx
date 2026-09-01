import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { db, getFirebaseIdToken } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';
import { exportSingleFile, exportProjectZip } from '../utils/fileExporter';
import { ImportAnalysisModal } from '../components/ide/ImportAnalysisModal';
import {
  processLocalFiles,
  processLocalFolder,
  processZipArchive,
  analyzeImportConstraints
} from '../utils/fileImporter';
import { stageAndDispatchInvitationEmail } from '../utils/emailQueueService';

export const IDEWorkspacePage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  // Dual Repository State: Master Canonical Repository vs Shared Working Fork
  // Master baseline must only ever come from the server (snapshot/REST polling);
  // seeding it from the personal draft produced phantom diffs after refresh.
  const [masterFiles, setMasterFiles] = useState([]);
  const [files, setFiles] = useState(() => {
    try {
      const userEmail = (currentUser?.email || '').trim().toLowerCase();
      const saved = localStorage.getItem(`obsidian_draft_${projectId}_${userEmail}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
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
  const [liveProjectData, setLiveProjectData] = useState(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [unauthorizedMsg, setUnauthorizedMsg] = useState('');
  // Ref that always holds the canonical project ownerEmail â€” updated from Firestore and REST
  // Used in effects to avoid stale closures without causing re-runs
  const projectOwnerEmailRef = useRef('');

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

  const projectData = userProfile?.projects?.[projectId] || liveProjectData;

  const isProjectOwner = useMemo(() => {
    const userEmail = (currentUser?.email || '').trim().toLowerCase();
    if (!userEmail) return false;
    
    const ownerEmail = (liveProjectData?.ownerEmail || projectData?.ownerEmail || '').trim().toLowerCase();
    if (ownerEmail && ownerEmail === userEmail) return true;
    if (serverUserRole === 'OWNER') return true;
    if (liveProjectData?.ownerId && liveProjectData.ownerId === currentUser?.uid) return true;
    if (projectData?.ownerId && projectData.ownerId === currentUser?.uid) return true;
    if (projectData?.userRole === 'OWNER' || projectData?.role === 'OWNER' || projectData?.isOwner === true) return true;
    
    return false;
  }, [currentUser, serverUserRole, projectData, liveProjectData]);

  const activeUserRole = isProjectOwner ? 'OWNER' : (serverUserRole || liveProjectData?.userRole || projectData?.userRole || projectData?.role || 'EDITOR');

  const [saveSyncSuccessMsg, setSaveSyncSuccessMsg] = useState('');
  const toastTimeoutRef = useRef(null);

  const showNotificationToast = useCallback((msg, duration = 4000) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setSaveSyncSuccessMsg(msg);
    if (msg) {
      toastTimeoutRef.current = setTimeout(() => {
        setSaveSyncSuccessMsg('');
      }, duration);
    }
  }, []);

  // â”€â”€ Helper to detect binary file types (PDF, Images, Archives) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const isBinaryFile = (filePath = '') => {
    const ext = (filePath.split('.').pop() || '').toLowerCase();
    return ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'zip', 'tar', 'gz', 'exe', 'bin', 'mp4', 'webm'].includes(ext);
  };

  // â”€â”€ Active File & Mutation Guard References â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const activeFileRef = useRef(null);
  activeFileRef.current = activeFile;
  // Stable content refs — used inside onSnapshot/syncFromServer callbacks to avoid stale closures
  const currentContentRef = useRef(currentContent);
  currentContentRef.current = currentContent;
  const savedContentRef = useRef(savedContent);
  savedContentRef.current = savedContent;
  const isLocalDirtyRef = useRef(false);
  // NOTE: Do NOT overwrite isLocalDirtyRef on every render — it is set explicitly in handlers
  const hasUnsavedForkChangesRef = useRef(false);
  const localMutationTimestampRef = useRef(0);
  // Hard immunity flag: when true, onSnapshot and syncFromServer will NOT overwrite local files state.
  const isImportingRef = useRef(false);
  // NOTE: Do NOT set localFilesRef/localMasterRef on every render — only in handlers.
  const localFilesRef = useRef(files);
  const localMasterRef = useRef(masterFiles);

  // Helper: Ensures file payloads are safe for Firestore document size (< 800 KB).
  // Preserves full content for normal projects, and strips content into manifests only if payload exceeds 800 KB.
  const safeFilesPayload = useCallback((fileArray = []) => {
    try {
      const jsonStr = JSON.stringify(fileArray);
      if (jsonStr.length < 800000) {
        return fileArray;
      }
    } catch (e) {}
    return fileArray.map(({ content, ...rest }) => ({
      ...rest,
      _manifestOnly: true
    }));
  }, []);

  const toManifest = safeFilesPayload;

  // Helper to initialize active file & open tabs from saved user preference or default
  const resolveActiveFileAndTabs = useCallback((fileList = []) => {
    if (!fileList || fileList.length === 0) return;
    const userEmail = (currentUser?.email || '').trim().toLowerCase();
    const savedActivePath = localStorage.getItem(`obsidian_active_file_${projectId}_${userEmail}`);
    const savedOpenTabsRaw = localStorage.getItem(`obsidian_open_tabs_${projectId}_${userEmail}`);

    let savedOpenTabs = [];
    try {
      savedOpenTabs = savedOpenTabsRaw ? JSON.parse(savedOpenTabsRaw) : [];
    } catch (e) {}

    // Find the target active file (Exact match on saved path, then main.py, then first file)
    const targetActive = (savedActivePath && fileList.find(f => f.filePath === savedActivePath || f.fileName === savedActivePath)) ||
      fileList.find(f => f.filePath === 'src/main.py' || f.fileName === 'main.py') ||
      fileList[0];

    // Restore open tabs
    let restoredTabs = [];
    if (Array.isArray(savedOpenTabs) && savedOpenTabs.length > 0) {
      restoredTabs = savedOpenTabs.map(p => fileList.find(f => f.filePath === p || f.fileName === p)).filter(Boolean);
    }
    if (restoredTabs.length === 0 && targetActive) {
      restoredTabs = [targetActive];
    } else if (targetActive && !restoredTabs.some(f => f.filePath === targetActive.filePath)) {
      restoredTabs.push(targetActive);
    }

    setOpenFiles(restoredTabs);
    setActiveFile(targetActive);
    activeFileRef.current = targetActive;
    setCurrentContent(targetActive?.content || '');
    setSavedContent(targetActive?.content || '');
  }, [currentUser?.email, projectId]);

  // ── Real-Time Dual Repository Snapshot Listener (Master & Shared Working Fork) ──
  useEffect(() => {
    if (!projectId) return;
    const userEmail = (currentUser?.email || '').trim().toLowerCase();

    try {
      const projDocRef = doc(db, 'projects', projectId);
      const unsubscribe = onSnapshot(projDocRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setLiveProjectData(data);

          // ── IMPORT GUARD: If actively importing a folder, skip all file state updates ──
          // This prevents the old Firestore data from overwriting the newly imported files
          if (isImportingRef.current) {
            setLoading(false);
            return;
          }

          // 1. Resolve User Role (Project Owner email has absolute authority)
          // Always update the ref so effects that run concurrently can read the latest value
          const docOwnerEmail = (data.ownerEmail || '').trim().toLowerCase();
          if (docOwnerEmail) projectOwnerEmailRef.current = docOwnerEmail;

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

          if (master && master.length > 0 && master.some(f => f.content !== undefined)) {
            setMasterFiles(master);
            localMasterRef.current = master;
          }

          // 3. Resolve Live Shared Working Files (Created / uploaded by Owner or Collaborator)
          // NOTE: never fall back to master while a fork is pending — an empty
          // working set then means the fork proposes deleting everything, and
          // substituting master would resurrect that deletion.
          let working = (data.working_files && data.working_files.length > 0)
            ? data.working_files
            : (data.pendingFork === true ? [] : master);

          // ── SUBCOLLECTION HYDRATION ──
          // If working files are manifests (no content) or empty, hydrate from subcollection
          const needsHydration = working.length > 0 && working.some(f => f._manifestOnly || (f.filePath && f.content === undefined && !f.isBinary));
          
          if (needsHydration || (!working || working.length === 0)) {
            // First, try localStorage draft as immediate cache
            try {
              const draftStr = localStorage.getItem(`obsidian_draft_${projectId}_${userEmail}`);
              if (draftStr) {
                const draftFiles = JSON.parse(draftStr);
                if (Array.isArray(draftFiles) && draftFiles.length > 0) {
                  // The working manifest is the canonical path set; a stale draft may
                  // only supply content for manifest entries, never resurrect deleted
                  // paths. The draft is a full fallback only when the manifest is empty.
                  let draftState = draftFiles;
                  if (working.length > 0) {
                    const draftMap = new Map(draftFiles.map(df => [df.filePath || df.fileName, df]));
                    draftState = working.map(wf => {
                      const d = draftMap.get(wf.filePath || wf.fileName);
                      return d && wf.content === undefined ? { ...wf, content: typeof d.content === 'string' ? d.content : '' } : wf;
                    });
                  }
                  setFiles(draftState);
                  localFilesRef.current = draftState;
                  if (!activeFileRef.current && draftState.length > 0) {
                    resolveActiveFileAndTabs(draftState);
                  }
                }
              }
            } catch (e) {}
            
            // Then hydrate from subcollection (async)
            getDocs(collection(db, 'projects', projectId, 'files')).then(subSnap => {
              if (isImportingRef.current) return; // Guard: skip if import started while loading
              if (!subSnap.empty) {
                const contentMap = new Map();
                subSnap.forEach(d => {
                  const fd = d.data();
                  if (fd && fd.filePath) contentMap.set(fd.filePath, fd);
                });

                // Merge subcollection content into manifest entries
                const manifests = working.length > 0 ? working : [];
                const hydrated = manifests.map(f => {
                  const sub = contentMap.get(f.filePath);
                  return sub ? { ...f, content: sub.content || '', _manifestOnly: undefined } : f;
                });
                // Subcollection is only the source of truth when the manifest is empty;
                // extra subcollection docs are stale/deleted files and must not be re-added.
                // Exception guard: while a fork is pending an empty manifest means
                // "delete everything" — never resurrect from stale subcollection docs.
                if (manifests.length === 0 && data.pendingFork !== true) {
                  contentMap.forEach((fd) => {
                    hydrated.push(fd);
                  });
                }

                if (hydrated.length > 0) {
                  setFiles(hydrated);
                  localFilesRef.current = hydrated;
                  if (!activeFileRef.current) {
                    resolveActiveFileAndTabs(hydrated);
                  }
                  // Update localStorage cache with hydrated files
                  try {
                    localStorage.setItem(`obsidian_draft_${projectId}_${userEmail}`, JSON.stringify(hydrated));
                  } catch (e) {}
                }
              }
            }).catch(() => {});
            
            setLoading(false);
            return; // Skip normal file state update — hydration handles it
          }

          // ── NORMAL PATH: Working files have full content ──

          // Check if Master baseline is synchronized with working files
          const isMasterSynchronized = data.pendingFork === false ||
            (master.length > 0 && master.length === working.length && master.every(mf => {
              const wf = working.find(w => w.filePath === mf.filePath);
              return wf && wf.content === mf.content;
            }));

          // A stale "master synced" snapshot must not wipe an editor's staged
          // fork changes that the server has not yet received.
          if (isMasterSynchronized && !(hasUnsavedForkChangesRef.current && docOwnerEmail && docOwnerEmail !== userEmail)) {
            hasUnsavedForkChangesRef.current = false;
            isLocalDirtyRef.current = false;
            localMutationTimestampRef.current = 0;
          }

          // 4. Update working files state with strict mutation protection
          // Use refs (not stale closure variables) for accurate comparison.
          // A recent local mutation blocks ALL server convergence — inside the
          // immunity window the server may not have our change yet (e.g. a
          // deletion persisted via the backend API), and a "master synchronized"
          // snapshot would otherwise resurrect deleted files.
          const hasLocalTypingDirty = (currentContentRef.current !== savedContentRef.current);
          const isRecentLocalMutation = (Date.now() - localMutationTimestampRef.current) < 30000;
          const hasStagedForkChanges = hasUnsavedForkChangesRef.current;
          if (!isRecentLocalMutation && (isMasterSynchronized || (!hasLocalTypingDirty && !hasStagedForkChanges))) {
            if (working && working.length > 0) {
              if (working.length >= localFilesRef.current.length || isMasterSynchronized) {
                setFiles(working);
                localFilesRef.current = working;
              } else if (localFilesRef.current.length > 0) {
                // Preserve locally imported folders/files and merge updates from server
                const workingMap = new Map(working.map(f => [f.filePath || f.fileName, f]));
                const merged = localFilesRef.current.map(lf => workingMap.get(lf.filePath || lf.fileName) || lf);
                const localSet = new Set(localFilesRef.current.map(f => f.filePath || f.fileName));
                working.forEach(wf => {
                  if (!localSet.has(wf.filePath || wf.fileName)) merged.push(wf);
                });
                setFiles(merged);
                localFilesRef.current = merged;
              }
            }
          }

          // 5. Active File & Content synchronization (Safe: Never overwrites live typing buffer unless Master synchronized)
          if (!activeFileRef.current && working && working.length > 0) {
            resolveActiveFileAndTabs(working);
          } else if (activeFileRef.current && working && working.length > 0) {
            const matching = working.find(f =>
              (activeFileRef.current.fileId && f.fileId === activeFileRef.current.fileId) ||
              f.filePath === activeFileRef.current.filePath
            );
            if (matching) {
              setActiveFile(matching);
              activeFileRef.current = matching;
              setOpenFiles(prev => prev.map(of =>
                (of.filePath === matching.filePath || (matching.fileId && of.fileId === matching.fileId)) ? { ...of, fileName: matching.fileName, content: matching.content } : of
              ));
              // Update editor text if Master is synchronized or user is not typing dirty in this file
              const isUserActivelyEditing = !isMasterSynchronized && (
                isLocalDirtyRef.current ||
                (currentContentRef.current !== savedContentRef.current) ||
                ((Date.now() - localMutationTimestampRef.current) < 30000)
              );

              if (!isUserActivelyEditing && matching.content !== undefined && matching.content !== currentContentRef.current) {
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
      // ── IMPORT GUARD: Skip polling if actively importing ──
      if (isImportingRef.current) return;

      try {
        const userEmail = (currentUser?.email || '').trim().toLowerCase();
        const token = await getFirebaseIdToken();
        const res = await fetch(`/api/projects/${projectId}?userEmail=${encodeURIComponent(userEmail)}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const resData = await res.json();
          const proj = resData.project;
          if (proj) {
            setLiveProjectData(proj);
            // 1. Resolve User Role — always update ownerEmail ref too
            const serverOwnerEmail = (proj.ownerEmail || '').trim().toLowerCase();
            if (serverOwnerEmail) projectOwnerEmailRef.current = serverOwnerEmail;

            if (serverOwnerEmail && serverOwnerEmail === userEmail) {
              setServerUserRole('OWNER');
            } else if (resData.userRole) {
              setServerUserRole(resData.userRole.toUpperCase());
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

            // Working files. Mirror the snapshot listener: never substitute the
            // master baseline while a fork is pending (empty working set means
            // the fork proposes deleting everything).
            const serverWorking = (proj.working_files && proj.working_files.length > 0)
              ? proj.working_files
              : (proj.pendingFork === true ? [] : serverMaster);

            const isServerMasterSynced = proj.pendingFork === false ||
              (serverMaster && serverWorking && serverMaster.length > 0 && serverMaster.length === serverWorking.length && serverMaster.every(mf => {
                const wf = serverWorking.find(w => w.filePath === mf.filePath);
                return wf && wf.content === mf.content;
              }));

            // Protect master baseline from being downgraded by stale server polling —
            // unless the server authoritatively reports master as synced, which must
            // win even when an accepted merge shrank the baseline (deleted files).
            if (serverMaster && (serverMaster.length >= localMasterRef.current.length || isServerMasterSynced)) {
              setMasterFiles(serverMaster);
              localMasterRef.current = serverMaster;
            }

            // A stale "master synced" report must not clear an editor's staged
            // fork changes that the server has not received yet (mirrors the
            // snapshot listener guard).
            if (isServerMasterSynced && !(hasUnsavedForkChangesRef.current && serverOwnerEmail && serverOwnerEmail !== userEmail)) {
              hasUnsavedForkChangesRef.current = false;
              isLocalDirtyRef.current = false;
              localMutationTimestampRef.current = 0;
            }

            // Use refs instead of stale closure variables for accurate comparison.
            // Recent local mutations block ALL convergence (server may not have
            // the change yet); staged fork changes block it even when the server
            // reports master as synchronized — this is what stopped the 5s poll
            // from resurrecting locally deleted files.
            const hasStagedModifications = hasUnsavedForkChangesRef.current || (currentContentRef.current !== savedContentRef.current);
            const isRecentLocalMutation = (Date.now() - localMutationTimestampRef.current) < 30000;
            if (!isRecentLocalMutation && (isServerMasterSynced || !hasStagedModifications)) {
              if (serverWorking && serverWorking.length > 0) {
                if (serverWorking.length >= localFilesRef.current.length || isServerMasterSynced) {
                  setFiles(serverWorking);
                  localFilesRef.current = serverWorking;
                } else if (localFilesRef.current.length > 0) {
                  const serverMap = new Map(serverWorking.map(f => [f.filePath || f.fileName, f]));
                  const merged = localFilesRef.current.map(lf => serverMap.get(lf.filePath || lf.fileName) || lf);
                  const localSet = new Set(localFilesRef.current.map(f => f.filePath || f.fileName));
                  serverWorking.forEach(sf => {
                    if (!localSet.has(sf.filePath || sf.fileName)) merged.push(sf);
                  });
                  setFiles(merged);
                  localFilesRef.current = merged;
                }
              }
            }

            // Sync active file metadata
            if (activeFileRef.current && serverWorking && serverWorking.length > 0) {
              const matching = serverWorking.find(f =>
                (activeFileRef.current.fileId && f.fileId === activeFileRef.current.fileId) ||
                f.filePath === activeFileRef.current.filePath
              );
              if (matching) {
                setActiveFile(matching);
                activeFileRef.current = matching;
                setOpenFiles(prev => prev.map(of =>
                  (of.filePath === matching.filePath || (matching.fileId && of.fileId === matching.fileId)) ? { ...of, fileName: matching.fileName } : of
                ));
                // Update editor text ONLY if user is not actively editing or typing in the buffer
                const isUserActivelyEditing = (currentContentRef.current !== savedContentRef.current) ||
                  isLocalDirtyRef.current ||
                  ((Date.now() - localMutationTimestampRef.current) < 30000);

                if (!isUserActivelyEditing && matching.content !== undefined && matching.content !== currentContentRef.current) {
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
  // FIXED: Removed currentContent/savedContent from deps — using refs instead.
  }, [projectId, currentUser]);

  // â”€â”€ Real-Time Active Collaborators & Cursor Coordination Protocol â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!projectId || !currentUser?.email) return;

    const userEmail = currentUser.email.toLowerCase().trim();

    // Compute authoritative role directly â€” never use the activeUserRole state value here
    // because it may still be the initial null/EDITOR at mount time, causing wrong role broadcast.
    // Instead, derive from the ownerEmail ref (set by Firestore snapshot/REST) and currentUser.
    const getAuthoritativeRole = () => {
      const ownerEmail = projectOwnerEmailRef.current;
      if (ownerEmail && ownerEmail === userEmail) return 'OWNER';
      // Fall through to whatever serverUserRole resolved to, but never to 'EDITOR' for owner
      return activeUserRole || 'EDITOR';
    };

    const userPayload = {
      email: userEmail,
      displayName: currentUser.displayName || userProfile?.info?.fullName || userEmail.split('@')[0],
      username: userProfile?.info?.username || `@${userEmail.split('@')[0]}`,
      avatarUrl: currentUser.photoURL || userProfile?.info?.avatarUrl || '',
      role: getAuthoritativeRole()
    };

    // 1. Establish WebSocket for low-latency cursor coordination
    const rawBackendUrl = (import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || '').trim();
    let wsUrl;
    if (rawBackendUrl) {
      const cleanWsUrl = rawBackendUrl.replace(/^http/, 'ws').replace(/\/$/, '');
      wsUrl = `${cleanWsUrl}/ws/collaboration`;
    } else {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.hostname === 'localhost' ? 'localhost:5000' : window.location.host;
      wsUrl = `${wsProtocol}//${wsHost}/ws/collaboration`;
    }

    try {
      const ws = new WebSocket(wsUrl);
      collaborationWsRef.current = ws;

      ws.onopen = async () => {
        const token = await getFirebaseIdToken();
        ws.send(JSON.stringify({
          type: 'JOIN_ROOM',
          projectId,
          user: userPayload,
          token,
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
          } else if (msg.type === 'FILES_UPDATED' || msg.type === 'FORK_ACCEPTED' || msg.type === 'CODE_UPDATED') {
            const incomingFiles = msg.files || msg.master_project_files || msg.working_files;
            if (Array.isArray(incomingFiles) && incomingFiles.length > 0) {
              setFiles(incomingFiles);
              localFilesRef.current = incomingFiles;
              if (msg.master_project_files) {
                setMasterFiles(msg.master_project_files);
                localMasterRef.current = msg.master_project_files;
              }
              const isUserActivelyEditing = (currentContentRef.current !== savedContentRef.current) ||
                isLocalDirtyRef.current ||
                ((Date.now() - localMutationTimestampRef.current) < 30000);

              if (!isUserActivelyEditing) {
                hasUnsavedForkChangesRef.current = false;
                isLocalDirtyRef.current = false;
                localMutationTimestampRef.current = 0;
              }

              // Seamlessly update active file content ONLY if user is not actively editing
              if (activeFileRef.current) {
                const matched = incomingFiles.find(f =>
                  (activeFileRef.current.fileId && f.fileId === activeFileRef.current.fileId) ||
                  f.filePath === activeFileRef.current.filePath
                );
                if (matched) {
                  setActiveFile(matched);
                  activeFileRef.current = matched;
                  setOpenFiles(prev => prev.map(of =>
                    (of.filePath === matched.filePath || (matched.fileId && of.fileId === matched.fileId)) ? { ...of, fileName: matched.fileName } : of
                  ));
                  if (!isUserActivelyEditing && matched.content !== undefined && matched.content !== currentContentRef.current) {
                    setCurrentContent(matched.content);
                    setSavedContent(matched.content);
                  }
                }
              }
            }
            if (msg.type === 'FORK_ACCEPTED') {
              setIsDiffViewActive(false);
              showNotificationToast('🎉 Changes merged & synchronized to Master Repository!', 5000);
            }
          } else if (msg.type === 'FORK_REQUESTED') {
            if (msg.working_files && msg.working_files.length > 0) {
              setFiles(msg.working_files);
              localFilesRef.current = msg.working_files;
            }
            const sender = (msg.requestedBy || '').trim().toLowerCase();
            const current = (userEmail || '').trim().toLowerCase();
            if (isProjectOwner && sender && sender !== current) {
              showNotificationToast(`🔔 New fork request submitted by ${msg.requestedBy || 'collaborator'}!`, 5000);
            }
          } else if (msg.type === 'FORK_REJECTED') {
            if (msg.master_project_files && msg.master_project_files.length > 0) {
              setMasterFiles(msg.master_project_files);
              localMasterRef.current = msg.master_project_files;
              setFiles(msg.master_project_files);
              localFilesRef.current = msg.master_project_files;
              hasUnsavedForkChangesRef.current = false;
              isLocalDirtyRef.current = false;
            }
            showNotificationToast('❌ Notice: Collaborator fork request was rejected by the Project Owner. Workspace restored to Master baseline.', 5000);
          }
        } catch (e) {}
      };

      ws.onerror = () => { };

      ws.onclose = (event) => {
        if (event.code === 4401 || event.code === 4403) {
          collaborationWsRef.current = null;
          showNotificationToast(event.code === 4401
            ? '🔒 Collaboration session expired. Please sign in again to sync with your team.'
            : '🚫 You do not have access to this project workspace.', 6000);
        }
      };
    } catch (e) { }

    // 2. HTTP Polling Fallback for Presence & Attribution Heartbeat
    const syncPresenceAndAttribution = async () => {
      try {
        const heartbeatToken = await getFirebaseIdToken();
        const authHeaders = heartbeatToken ? { 'Authorization': `Bearer ${heartbeatToken}` } : {};

        const presRes = await fetch(`/api/collaboration/${projectId}/presence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
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
        const attrRes = await fetch(`/api/collaboration/${projectId}/attribution`, { headers: authHeaders });
        if (attrRes.ok) {
          const attrData = await attrRes.json();
          if (attrData?.attributions) {
            setFileAttributions(attrData.attributions);
          }
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
    // IMPORTANT: activeUserRole is intentionally excluded from deps.
    // Including it caused the WebSocket to reconnect every time the role resolved from nullâ†’OWNER,
    // which broadcast EDITOR (the intermediate state) to all peers before OWNER was confirmed.
    // The role is computed via getAuthoritativeRole() using projectOwnerEmailRef (a ref, not state)
    // so it always reads the latest value without triggering a reconnect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, currentUser?.email, activeFile?.filePath]);

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
          role: (projectOwnerEmailRef.current && projectOwnerEmailRef.current === (currentUser?.email || '').toLowerCase().trim()) ? 'OWNER' : (activeUserRole || 'EDITOR')
        },
        activeFilePath: currentPath,
        cursor: cursorPos
      }));
    }
  };

  // â”€â”€ Debounced Live Working Code Synchronization (Broadcasts live code before merge) â”€â”€
  useEffect(() => {
    if (!activeFile || isBinaryFile(activeFile.filePath) || currentContent === savedContent) return;

    const timer = setTimeout(() => {
      const userEmail = (currentUser?.email || 'developer@obsidian.io').trim().toLowerCase();
      const userName = currentUser?.displayName || userProfile?.info?.fullName || userEmail.split('@')[0];
      const timestamp = new Date().toISOString();

      const currentFiles = (localFilesRef.current && localFilesRef.current.length > 0) ? localFilesRef.current : files;
      const updatedFiles = currentFiles.map(f =>
        (f.fileId === activeFile.fileId || f.filePath === activeFile.filePath)
          ? { ...f, content: currentContent, updatedAt: timestamp, lastModifiedBy: userEmail, lastModifiedByName: userName }
          : f
      );

      localFilesRef.current = updatedFiles;
      setFiles(updatedFiles);

      // Save local draft in localStorage for offline resilience
      try {
        localStorage.setItem(`obsidian_draft_${projectId}_${userEmail}`, JSON.stringify(updatedFiles));
      } catch (e) {}

      // If Project Owner: broadcast code updates and persist working copy
      if (isProjectOwner) {
        if (collaborationWsRef.current && collaborationWsRef.current.readyState === WebSocket.OPEN) {
          collaborationWsRef.current.send(JSON.stringify({
            type: 'CODE_UPDATED',
            projectId,
            working_files: updatedFiles,
            requestedBy: userEmail,
            user: {
              email: userEmail,
              displayName: userName,
              role: 'OWNER'
            }
          }));
        }

        const manifestFiles = toManifest(updatedFiles);
        setDoc(doc(db, 'projects', projectId), {
          working_files: manifestFiles,
          lastWorkingModifiedBy: userEmail,
          lastWorkingModifiedByName: userName,
          updatedAt: timestamp
        }, { merge: true }).catch(() => {});

        if (activeFile && (activeFile.fileId || activeFile.filePath)) {
          const fileDocId = activeFile.fileId || `file_${projectId}_${activeFile.filePath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
          setDoc(doc(db, 'projects', projectId, 'files', fileDocId), {
            fileId: String(fileDocId),
            projectId: String(projectId),
            filePath: String(activeFile.filePath),
            fileName: String(activeFile.fileName || activeFile.filePath.split('/').pop()),
            content: String(currentContent || ''),
            fileType: String(activeFile.fileType || 'plaintext'),
            isBinary: Boolean(activeFile.isBinary),
            size: Number(currentContent ? currentContent.length : 0),
            updatedAt: timestamp,
            lastModifiedBy: userEmail
          }, { merge: true }).catch(() => {});
        }
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [currentContent, activeFile, savedContent, projectId, currentUser?.email, isProjectOwner, activeUserRole]);

  // â”€â”€ GitHub Diff Calculation (Working Copy vs Canonical Master Repository) â”€â”€
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
      } else if (mf.content !== undefined && effectiveContent !== undefined && mf.content !== effectiveContent) {
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
    const hasPendingFork = Boolean(projectData?.pendingFork || liveProjectData?.pendingFork);
    const lastWorkingAuthor = (liveProjectData?.lastWorkingModifiedBy || projectData?.lastWorkingModifiedBy || '').toLowerCase().trim();

    let editorCount = 0;
    let ownerChangesExist = false;
    let collabCount = 0;

    const isEditorLocalTyping = Boolean(
      !isProjectOwner &&
      isLocalDirtyRef.current &&
      activeFile &&
      !isBinaryFile(activeFile.filePath) &&
      currentContent !== undefined &&
      currentContent !== savedContent
    );

    (files || []).forEach(wf => {
      const mf = masterPathMap.get(wf.filePath);
      const isBinary = isBinaryFile(wf.filePath);
      const isWfDifferentFromMaster = !mf || (mf.content !== undefined && wf.content !== undefined && mf.content !== wf.content);

      if (isWfDifferentFromMaster) {
        const author = (wf.lastModifiedBy || lastWorkingAuthor || '').toLowerCase().trim();
        const isAuthorEditor = Boolean(author && author === userEmail);
        const isAuthorOwner = Boolean(author && (author === ownerEmail || isProjectOwner));

        if (!isProjectOwner) {
          if (isAuthorEditor) {
            editorCount++;
          } else {
            // Author is the owner or someone else -> it is owner/server changes
            ownerChangesExist = true;
          }
        } else {
          // For project owner
          if (hasPendingFork && !isAuthorOwner && author) {
            collabCount++;
          } else {
            ownerChangesExist = true;
          }
        }
      }
    });

    (masterFiles || []).forEach(mf => {
      const isDeletedInWorking = !files.some(wf => wf.filePath === mf.filePath);
      if (isDeletedInWorking) {
        if (!isProjectOwner) {
          if (lastWorkingAuthor === userEmail || hasUnsavedForkChangesRef.current) editorCount++;
          else ownerChangesExist = true;
        } else {
          if (hasPendingFork) collabCount++;
          else ownerChangesExist = true;
        }
      }
    });

    if (isEditorLocalTyping) {
      editorCount = Math.max(editorCount, 1);
    }

    // Editor ONLY sees fork button if they personally authored changes or have active local dirty buffer
    const hasForkChanges = !isProjectOwner && editorCount > 0;

    return {
      hasEditorForkChanges: hasForkChanges,
      hasOwnerAuthoredChanges: isProjectOwner ? ownerChangesExist : (!hasForkChanges && ownerChangesExist),
      editorAuthoredChangesCount: editorCount,
      collaboratorPendingChangesCount: isProjectOwner ? (hasPendingFork ? Math.max(collabCount, 1) : collabCount) : 0
    };
  }, [files, masterFiles, activeFile, currentContent, savedContent, currentUser?.email, projectData?.ownerEmail, isProjectOwner, fileStatusMap, liveProjectData?.lastWorkingModifiedBy, projectData?.lastWorkingModifiedBy, projectData?.pendingFork, liveProjectData?.pendingFork]);

  const activeMasterFile = useMemo(() => {
    if (!activeFile) return null;
    return (masterFiles || []).find(f => f.filePath === activeFile.filePath) || null;
  }, [masterFiles, activeFile]);

  const isCurrentFileModified = useMemo(() => {
    if (!activeFile) return false;
    return fileStatusMap[activeFile.filePath] === 'MODIFIED' || (activeMasterFile && activeMasterFile.content !== currentContent);
  }, [fileStatusMap, activeFile, activeMasterFile, currentContent]);

  const handleEditorContentChange = useCallback((newContent) => {
    const val = typeof newContent === 'string' ? newContent : '';
    setCurrentContent(val);
    currentContentRef.current = val;
    isLocalDirtyRef.current = true;
    localMutationTimestampRef.current = Date.now();

    // Synchronously reflect change into localFilesRef so file tree & tab switching never lose the typed/deleted buffer
    if (activeFileRef.current) {
      const activePath = activeFileRef.current.filePath;
      const activeId = activeFileRef.current.fileId;
      localFilesRef.current = (localFilesRef.current || []).map(f =>
        ((activeId && f.fileId === activeId) || f.filePath === activePath)
          ? { ...f, content: val }
          : f
      );
    }
  }, []);

  const handleSelectFile = (fileObj) => {
    if (!fileObj) return;
    const currentFiles = (localFilesRef.current && localFilesRef.current.length > 0) ? localFilesRef.current : files;
    const latest = currentFiles.find(f => f.fileId === fileObj.fileId || f.filePath === fileObj.filePath) || fileObj;
    let nextOpenTabs = openFiles;
    if (!openFiles.some((f) => f.fileId === latest.fileId || f.filePath === latest.filePath)) {
      nextOpenTabs = [...openFiles, latest];
      setOpenFiles(nextOpenTabs);
    }
    setActiveFile(latest);
    activeFileRef.current = latest;
    setCurrentContent(latest.content || '');
    setSavedContent(latest.content || '');
    setIsDiffViewActive(false);

    try {
      const userEmail = (currentUser?.email || '').trim().toLowerCase();
      localStorage.setItem(`obsidian_active_file_${projectId}_${userEmail}`, latest.filePath);
      localStorage.setItem(`obsidian_open_tabs_${projectId}_${userEmail}`, JSON.stringify(nextOpenTabs.map(f => f.filePath)));
    } catch (e) {}
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

    try {
      const userEmail = (currentUser?.email || '').trim().toLowerCase();
      localStorage.setItem(`obsidian_active_file_${projectId}_${userEmail}`, latest.filePath);
    } catch (e) {}
  };

  const handleCloseTab = (fileObj) => {
    const nextTabs = openFiles.filter((f) => f.fileId !== fileObj.fileId && f.filePath !== fileObj.filePath);
    setOpenFiles(nextTabs);
    let nextActive = null;
    if (activeFile?.fileId === fileObj.fileId || activeFile?.filePath === fileObj.filePath) {
      if (nextTabs.length > 0) {
        nextActive = nextTabs[nextTabs.length - 1];
        setActiveFile(nextActive);
        activeFileRef.current = nextActive;
        setCurrentContent(nextActive.content || '');
        setSavedContent(nextActive.content || '');
      } else {
        setActiveFile(null);
        activeFileRef.current = null;
        setCurrentContent('');
        setSavedContent('');
      }
    } else {
      nextActive = activeFile;
    }

    try {
      const userEmail = (currentUser?.email || '').trim().toLowerCase();
      if (nextActive) {
        localStorage.setItem(`obsidian_active_file_${projectId}_${userEmail}`, nextActive.filePath);
      } else {
        localStorage.removeItem(`obsidian_active_file_${projectId}_${userEmail}`);
      }
      localStorage.setItem(`obsidian_open_tabs_${projectId}_${userEmail}`, JSON.stringify(nextTabs.map(f => f.filePath)));
    } catch (e) {}
  };

  // ── 2. Request Fork / Submit Working Copy to Project Owner ─────────────────
  const handleRequestFork = async () => {
    const targetFile = activeFileRef.current || activeFile;
    setIsSaving(true);
    setSaveSyncSuccessMsg('');
    try {
      const token = await getFirebaseIdToken();
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
      hasUnsavedForkChangesRef.current = true;
      if (!targetFile || !isBinaryFile(targetFile.filePath)) {
        setSavedContent(currentContent);
      }

      // 1. Direct Firestore write for instant real-time delivery to Owner
      try {
        const manifestFiles = toManifest(updatedFiles);
        setDoc(doc(db, 'projects', projectId), {
          working_files: manifestFiles,
          lastWorkingModifiedBy: userEmail,
          lastWorkingModifiedByName: currentUser?.displayName || userProfile?.info?.fullName || userEmail.split('@')[0],
          pendingFork: true,
          updatedAt: timestamp
        }, { merge: true }).catch(() => {});

        if (targetFile && (targetFile.fileId || targetFile.filePath)) {
          const fileDocId = targetFile.fileId || `file_${projectId}_${targetFile.filePath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
          setDoc(doc(db, 'projects', projectId, 'files', fileDocId), {
            fileId: String(fileDocId),
            projectId: String(projectId),
            filePath: String(targetFile.filePath),
            fileName: String(targetFile.fileName || targetFile.filePath.split('/').pop()),
            content: String(currentContent || ''),
            fileType: String(targetFile.fileType || 'plaintext'),
            isBinary: Boolean(targetFile.isBinary),
            size: Number(currentContent ? currentContent.length : 0),
            updatedAt: timestamp,
            lastModifiedBy: userEmail
          }, { merge: true }).catch(() => {});
        }
      } catch (fsErr) {}

      // 2. Broadcast FORK_REQUESTED immediately over WebSocket so Owner sees new proposal within < 50ms
      if (collaborationWsRef.current && collaborationWsRef.current.readyState === WebSocket.OPEN) {
        collaborationWsRef.current.send(JSON.stringify({
          type: 'FORK_REQUESTED',
          projectId,
          working_files: updatedFiles,
          requestedBy: userEmail,
          user: {
            email: userEmail,
            displayName: currentUser?.displayName || userProfile?.info?.fullName || userEmail.split('@')[0],
            role: activeUserRole || 'EDITOR'
          }
        }));
      }

      // 3. Persist Working Files to Owner DB via server-side BYOD asynchronously
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
          collaborators: projectData?.collaborators,
          pendingFork: true
        })
      }).catch(apiErr => console.warn('Backend update-files notice:', apiErr));

      showNotificationToast(`🔔 Fork requested! ${Object.keys(fileStatusMap).length || updatedFiles.length} change(s) submitted for Project Owner review.`, 4500);
    } catch (err) {
      console.error('Error submitting fork request:', err);
      alert(`Failed to submit fork request: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // General Save Handler (Dispatches to Owner Commit or Editor Fork Request)
  const handleSaveFile = () => {
    if (isProjectOwner) {
      handleSaveAndSyncMaster();
    } else {
      handleRequestFork();
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
      const token = await getFirebaseIdToken();
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
        const manifestFiles = toManifest(targetWorkingFiles);
        await setDoc(doc(db, 'projects', projectId), {
          master_project_files: manifestFiles,
          project_files: manifestFiles,
          working_files: manifestFiles,
          pending_patches: [],
          pendingFork: false,
          lastWorkingModifiedBy: userEmail,
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

      // 3. Broadcast FORK_ACCEPTED over WebSocket so all connected editors update immediately
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
      showNotificationToast('🎉 All working changes merged and synchronized to Master Repository!', 5000);
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
      const token = await getFirebaseIdToken();
      const userEmail = (currentUser?.email || 'owner@obsidian.io').trim().toLowerCase();
      const timestamp = new Date().toISOString();

      // Master baseline is the source of truth to restore
      const targetMasterFiles = masterFiles && masterFiles.length > 0 ? masterFiles : files;

      // 1. Reset working_files and pending_patches in Firestore
      try {
        const manifestMaster = toManifest(targetMasterFiles);
        await setDoc(doc(db, 'projects', projectId), {
          working_files: manifestMaster,
          project_files: manifestMaster,
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
      showNotificationToast('❌ Fork request rejected. Shared workspace restored to Master baseline.', 5000);
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

    const projTitle = liveProjectData?.title || projectData?.title || projectId;
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
      const token = await getFirebaseIdToken();
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
    const token = await getFirebaseIdToken();

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
        // Do NOT overwrite savedContent here so the file remains in an Unsaved (dirty dot ●) state for user review
        setActiveFile(prev => ({ ...prev, content: newContent }));
      }

      // Update in openFiles tabs as well (keeping working buffer)
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

      // Cache locally in offline draft storage for safety without auto-committing
      try {
        localStorage.setItem(`obsidian_draft_${projectId}_${userEmail}`, JSON.stringify(updatedFiles));
      } catch (e) {}

      showNotificationToast(`⚡ Applied AI edits to ${actualFilePath} (Unsaved)`, 3500);
    } catch (err) {
      console.error('Error applying AI modifications:', err);
      alert(`Failed to apply edits: ${err.message}`);
    }
  };

  const handleCreateFile = async (filePath, initialContent = null) => {
    const cleanPath = filePath.trim().replace(/^\/+/, '');
    if (!cleanPath) return;

    const defaultContent = initialContent !== null ? initialContent : `// Created: ${cleanPath}\n`;
    const token = await getFirebaseIdToken();
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
      if (isProjectOwner) {
        setMasterFiles(updatedFiles);
        localMasterRef.current = updatedFiles;
      }
      handleSelectFile(newFileObj);

      // Persist to Shared Working Fork & Master baseline in Firestore & REST API
      try {
        const manifestFiles = toManifest(updatedFiles);
        const payload = {
          working_files: manifestFiles,
          ...(isProjectOwner ? { master_project_files: manifestFiles, project_files: manifestFiles } : {}),
          updatedAt: new Date().toISOString(),
          lastWorkingModifiedBy: userEmail
        };
        await setDoc(doc(db, 'projects', projectId), payload, { merge: true });

        // Save new file directly to subcollection with full content
        const fileDocId = newFileObj.fileId || `file_${projectId}_${newFileObj.filePath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        setDoc(doc(db, 'projects', projectId, 'files', fileDocId), {
          fileId: String(fileDocId),
          projectId: String(projectId),
          filePath: String(newFileObj.filePath),
          fileName: String(newFileObj.fileName),
          content: String(newFileObj.content || ''),
          fileType: String(newFileObj.fileType || 'plaintext'),
          isBinary: Boolean(newFileObj.isBinary),
          size: Number(newFileObj.content ? newFileObj.content.length : 0),
          updatedAt: new Date().toISOString(),
          lastModifiedBy: userEmail
        }, { merge: true }).catch(() => {});

        await fetch('/api/projects/update-files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            projectId,
            working_files: updatedFiles,
            master_project_files: isProjectOwner ? updatedFiles : masterFiles,
            userEmail,
            isOwner: isProjectOwner
          })
        });

        // Broadcast over WebSocket so connected editors see new files instantly
        if (isProjectOwner && collaborationWsRef.current && collaborationWsRef.current.readyState === WebSocket.OPEN) {
          collaborationWsRef.current.send(JSON.stringify({
            type: 'FILES_UPDATED',
            projectId,
            files: updatedFiles,
            master_project_files: updatedFiles,
            working_files: updatedFiles,
            user: { email: userEmail, displayName: currentUser?.displayName || 'Project Owner', role: 'OWNER' }
          }));
        }
      } catch (fsErr) {
        console.warn('Working create file sync notice:', fsErr);
      }

      showNotificationToast(`[+] Created '${cleanPath}' (${isProjectOwner ? 'Live in Master' : 'In Working Fork'})`, 4500);
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
    const token = await getFirebaseIdToken();

    try {
      const updatedFiles = files.map(f => f.fileId === fileObj.fileId ? { ...f, filePath: cleanNewPath, fileName: cleanNewPath.split('/').pop() } : f);
      localMutationTimestampRef.current = Date.now();
      localFilesRef.current = updatedFiles;
      setFiles(updatedFiles);
      if (isProjectOwner) {
        setMasterFiles(updatedFiles);
        localMasterRef.current = updatedFiles;
      }

      if (activeFile?.fileId === fileObj.fileId) {
        setActiveFile(prev => ({ ...prev, filePath: cleanNewPath, fileName: cleanNewPath.split('/').pop() }));
      }
      setOpenFiles(prev => prev.map(f => f.fileId === fileObj.fileId ? { ...f, filePath: cleanNewPath, fileName: cleanNewPath.split('/').pop() } : f));

      // Persist to Shared Working Fork & Master
      try {
        const manifestFiles = toManifest(updatedFiles);
        const payload = {
          working_files: manifestFiles,
          ...(isProjectOwner ? { master_project_files: manifestFiles, project_files: manifestFiles } : {}),
          updatedAt: new Date().toISOString(),
          lastWorkingModifiedBy: userEmail
        };
        await setDoc(doc(db, 'projects', projectId), payload, { merge: true });

        // Update renamed file in subcollection
        const fileDocId = fileObj.fileId || `file_${projectId}_${cleanNewPath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        setDoc(doc(db, 'projects', projectId, 'files', fileDocId), {
          fileId: String(fileDocId),
          projectId: String(projectId),
          filePath: String(cleanNewPath),
          fileName: String(cleanNewPath.split('/').pop()),
          updatedAt: new Date().toISOString(),
          lastModifiedBy: userEmail
        }, { merge: true }).catch(() => {});

        await fetch('/api/projects/update-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
          body: JSON.stringify({ projectId, working_files: updatedFiles, master_project_files: isProjectOwner ? updatedFiles : masterFiles, userEmail, isOwner: isProjectOwner })
        });

        if (isProjectOwner && collaborationWsRef.current && collaborationWsRef.current.readyState === WebSocket.OPEN) {
          collaborationWsRef.current.send(JSON.stringify({
            type: 'FILES_UPDATED',
            projectId,
            files: updatedFiles,
            master_project_files: updatedFiles,
            working_files: updatedFiles,
            user: { email: userEmail, displayName: currentUser?.displayName || 'Project Owner', role: 'OWNER' }
          }));
        }
      } catch (fsErr) { }

      showNotificationToast(`[→] Renamed to '${cleanNewPath}'`, 3500);
    } catch (err) {
      console.error('Error renaming file:', err);
      alert(`Failed to rename file: ${err.message}`);
    }
  };

  const handleDeleteFile = async (fileObj) => {
    const userEmail = currentUser?.email || 'developer@obsidian.io';
    const token = await getFirebaseIdToken();

    try {
      const remainingFiles = files.filter(f => f.fileId !== fileObj.fileId && f.filePath !== fileObj.filePath);
      localMutationTimestampRef.current = Date.now();
      localFilesRef.current = remainingFiles;
      setFiles(remainingFiles);
      // Keep the personal draft in sync so a refresh cannot resurrect the
      // deleted file from the localStorage cache
      try {
        localStorage.setItem(`obsidian_draft_${projectId}_${userEmail.trim().toLowerCase()}`, JSON.stringify(remainingFiles));
      } catch (e) {}
      if (isProjectOwner) {
        setMasterFiles(remainingFiles);
        localMasterRef.current = remainingFiles;
        hasUnsavedForkChangesRef.current = false;
      } else {
        hasUnsavedForkChangesRef.current = true;
      }
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

      // Persist to Shared Working Fork & Master.
      // The direct project-doc write is best-effort: security rules only allow
      // the OWNER to update /projects/{pid}, so for editors it is denied and
      // the backend API call below is the authoritative persistence path. The
      // API + WebSocket steps live in their own try so a denied write can never
      // skip them (skipping made deleted files reappear on the next poll).
      try {
        const manifestFiles = toManifest(remainingFiles);
        const payload = {
          working_files: manifestFiles,
          ...(isProjectOwner ? { master_project_files: manifestFiles, project_files: manifestFiles } : {}),
          updatedAt: new Date().toISOString(),
          lastWorkingModifiedBy: userEmail
        };
        setDoc(doc(db, 'projects', projectId), payload, { merge: true }).catch(() => {});

        // Delete from subcollection (members are allowed to delete file docs)
        const fileDocId = fileObj.fileId || `file_${projectId}_${(fileObj.filePath || '').replace(/[^a-zA-Z0-9_]/g, '_')}`;
        deleteDoc(doc(db, 'projects', projectId, 'files', fileDocId)).catch(() => {});
      } catch (fsErr) { }

      try {
        await fetch('/api/projects/update-files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            projectId,
            working_files: remainingFiles,
            master_project_files: isProjectOwner ? remainingFiles : masterFiles,
            userEmail,
            isOwner: isProjectOwner,
            pendingFork: !isProjectOwner
          })
        });

        if (collaborationWsRef.current && collaborationWsRef.current.readyState === WebSocket.OPEN) {
          collaborationWsRef.current.send(JSON.stringify({
            type: isProjectOwner ? 'FILES_UPDATED' : 'FORK_REQUESTED',
            projectId,
            files: remainingFiles,
            master_project_files: isProjectOwner ? remainingFiles : masterFiles,
            working_files: remainingFiles,
            requestedBy: userEmail,
            user: { email: userEmail, displayName: currentUser?.displayName || 'Project Owner', role: isProjectOwner ? 'OWNER' : 'EDITOR' }
          }));
        }
      } catch (apiErr) { }

      showNotificationToast(`[-] Deleted '${fileObj.fileName}'`, 4500);
    } catch (err) {
      console.error('Error deleting file:', err);
    }
  };

  const handleRenameFolder = async (oldPath, newPath) => {
    const cleanOld = oldPath.trim().replace(/^\/+|\/+$/g, '');
    const cleanNew = newPath.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;

    const userEmail = currentUser?.email || 'developer@obsidian.io';
    const token = await getFirebaseIdToken();

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
      if (isProjectOwner) {
        setMasterFiles(updatedFiles);
        localMasterRef.current = updatedFiles;
      }

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

      // Persist to Shared Working Fork & Master
      try {
        const manifestFiles = toManifest(updatedFiles);
        const payload = {
          working_files: manifestFiles,
          ...(isProjectOwner ? { master_project_files: manifestFiles, project_files: manifestFiles } : {}),
          updatedAt: new Date().toISOString(),
          lastWorkingModifiedBy: userEmail
        };
        await setDoc(doc(db, 'projects', projectId), payload, { merge: true });

        await fetch('/api/projects/update-files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            projectId,
            working_files: updatedFiles,
            master_project_files: isProjectOwner ? updatedFiles : masterFiles,
            userEmail,
            isOwner: isProjectOwner
          })
        });

        if (isProjectOwner && collaborationWsRef.current && collaborationWsRef.current.readyState === WebSocket.OPEN) {
          collaborationWsRef.current.send(JSON.stringify({
            type: 'FILES_UPDATED',
            projectId,
            files: updatedFiles,
            master_project_files: updatedFiles,
            working_files: updatedFiles,
            user: { email: userEmail, displayName: currentUser?.displayName || 'Project Owner', role: 'OWNER' }
          }));
        }
      } catch (fsErr) { }

      showNotificationToast(`[→] Renamed folder /${cleanOld} to /${cleanNew}`, 3500);
    } catch (err) {
      console.error('Error renaming folder:', err);
      alert(`Failed to rename folder: ${err.message}`);
    }
  };

  const handleDeleteFolder = async (folderPath) => {
    const cleanFolder = folderPath.replace(/^\/+|\/+$/g, '');
    const userEmail = currentUser?.email || 'developer@obsidian.io';
    const token = await getFirebaseIdToken();

    try {
      const remaining = files.filter(f => !(f.filePath === cleanFolder || f.filePath.startsWith(`${cleanFolder}/`)));
      localMutationTimestampRef.current = Date.now();
      localFilesRef.current = remaining;
      setFiles(remaining);
      // Keep the personal draft in sync so a refresh cannot resurrect the
      // deleted folder from the localStorage cache
      try {
        localStorage.setItem(`obsidian_draft_${projectId}_${userEmail.trim().toLowerCase()}`, JSON.stringify(remaining));
      } catch (e) {}
      if (isProjectOwner) {
        setMasterFiles(remaining);
        localMasterRef.current = remaining;
        hasUnsavedForkChangesRef.current = false;
      } else {
        hasUnsavedForkChangesRef.current = true;
      }

      if (activeFile && (activeFile.filePath === cleanFolder || activeFile.filePath.startsWith(`${cleanFolder}/`))) {
        const next = remaining[0] || null;
        if (next) handleSelectFile(next);
        else {
          setActiveFile(null);
          setCurrentContent('');
          setSavedContent('');
        }
      }

      // Persist to Shared Working Fork & Master.
      // Best-effort direct write + authoritative API call, mirrored from
      // handleDeleteFile: editors are denied the project-doc write by security
      // rules, and the API + WebSocket steps must still run.
      try {
        const manifestFiles = toManifest(remaining);
        const payload = {
          working_files: manifestFiles,
          ...(isProjectOwner ? { master_project_files: manifestFiles, project_files: manifestFiles } : {}),
          updatedAt: new Date().toISOString(),
          lastWorkingModifiedBy: userEmail
        };
        setDoc(doc(db, 'projects', projectId), payload, { merge: true }).catch(() => {});

        // Delete removed folder entries from the files subcollection so they are
        // not resurrected by later hydration (mirrors handleDeleteFile)
        const deletedEntries = files.filter(f => f.filePath === cleanFolder || f.filePath.startsWith(`${cleanFolder}/`));
        await Promise.allSettled(deletedEntries.map(df => {
          const fileDocId = df.fileId || `file_${projectId}_${(df.filePath || '').replace(/[^a-zA-Z0-9_]/g, '_')}`;
          return deleteDoc(doc(db, 'projects', projectId, 'files', fileDocId));
        }));
      } catch (fsErr) { }

      try {
        await fetch('/api/projects/update-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
          body: JSON.stringify({ projectId, working_files: remaining, master_project_files: isProjectOwner ? remaining : masterFiles, userEmail, isOwner: isProjectOwner, pendingFork: !isProjectOwner })
        });

        if (collaborationWsRef.current && collaborationWsRef.current.readyState === WebSocket.OPEN) {
          collaborationWsRef.current.send(JSON.stringify({
            type: isProjectOwner ? 'FILES_UPDATED' : 'FORK_REQUESTED',
            projectId,
            files: remaining,
            master_project_files: isProjectOwner ? remaining : masterFiles,
            working_files: remaining,
            requestedBy: userEmail,
            user: { email: userEmail, displayName: currentUser?.displayName || 'Project Owner', role: isProjectOwner ? 'OWNER' : 'EDITOR' }
          }));
        }
      } catch (apiErr) { }

      showNotificationToast(`[×] Deleted folder /${cleanFolder}`, 3500);
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
    const token = await getFirebaseIdToken();

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
        if (isProjectOwner) {
          setMasterFiles(updatedFiles);
          localMasterRef.current = updatedFiles;
        }

        if (activeFile?.filePath === sourcePath) {
          setActiveFile(prev => ({ ...prev, filePath: newPath, fileName }));
        }
        setOpenFiles(prev => prev.map(f => f.filePath === sourcePath ? { ...f, filePath: newPath, fileName } : f));

        // Persist to Shared Working Fork & Master
        try {
          const manifestFiles = toManifest(updatedFiles);
          const payload = {
            working_files: manifestFiles,
            ...(isProjectOwner ? { master_project_files: manifestFiles, project_files: manifestFiles } : {}),
            updatedAt: new Date().toISOString(),
            lastWorkingModifiedBy: userEmail
          };
          await setDoc(doc(db, 'projects', projectId), payload, { merge: true });

          // Update moved file in subcollection
          const fileDocId = targetFile.fileId || `file_${projectId}_${newPath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
          setDoc(doc(db, 'projects', projectId, 'files', fileDocId), {
            fileId: String(fileDocId),
            projectId: String(projectId),
            filePath: String(newPath),
            fileName: String(fileName),
            updatedAt: new Date().toISOString(),
            lastModifiedBy: userEmail
          }, { merge: true }).catch(() => {});

          await fetch('/api/projects/update-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
            body: JSON.stringify({
              projectId,
              working_files: updatedFiles,
              master_project_files: isProjectOwner ? updatedFiles : masterFiles,
              userEmail,
              isOwner: isProjectOwner
            })
          });

          if (isProjectOwner && collaborationWsRef.current && collaborationWsRef.current.readyState === WebSocket.OPEN) {
            collaborationWsRef.current.send(JSON.stringify({
              type: 'FILES_UPDATED',
              projectId,
              files: updatedFiles,
              master_project_files: updatedFiles,
              working_files: updatedFiles,
              user: { email: userEmail, displayName: currentUser?.displayName || 'Project Owner', role: 'OWNER' }
            }));
          }
        } catch (fsErr) { }

        showNotificationToast(`[→] Moved ${fileName} to ${cleanTarget ? '/' + cleanTarget : 'Project Root'}`, 3500);
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
          const manifestFiles = toManifest(updatedFiles);
          await setDoc(doc(db, 'projects', projectId), {
            working_files: manifestFiles,
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

        showNotificationToast(`[→] Moved folder /${cleanOld} to ${cleanTarget ? '/' + cleanTarget : 'Project Root'} in Working Fork`, 3500);
      } catch (err) {
        console.error('Error moving folder:', err);
        alert(`Failed to move folder: ${err.message}`);
      }
    }
  };

  // ── Import Actions & File Pickers ──────────────────────────────────────────────
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
    // ── SET IMPORT GUARD: Block onSnapshot and syncFromServer from overwriting local state ──
    isImportingRef.current = true;

    try {
      const token = await getFirebaseIdToken();
      const userEmail = (currentUser?.email || 'developer@obsidian.io').trim().toLowerCase();
      const userName = String(currentUser?.displayName || userProfile?.info?.fullName || userEmail.split('@')[0] || 'User');
      const timestamp = new Date().toISOString();

      // Prepare new files array with strictly defined non-null fields
      const newFormattedFiles = incomingFiles.map((f, idx) => {
        const filePath = String(f.filePath || f.fileName || '').replace(/\\/g, '/').replace(/^\/+/, '');
        const fileName = String(f.fileName || filePath.split('/').pop() || 'file');
        const isBinary = Boolean(f.isBinary !== undefined ? f.isBinary : isBinaryFile(filePath));
        return {
          fileId: String(f.fileId || `file_${projectId}_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 6)}`),
          projectId: String(projectId),
          filePath: String(filePath),
          fileName: String(fileName),
          content: typeof f.content === 'string' ? f.content : '',
          fileType: String(f.fileType || (filePath.split('.').pop() || 'plaintext')),
          isBinary: Boolean(isBinary),
          size: Number(f.size || (typeof f.content === 'string' ? f.content.length : 0)),
          createdAt: timestamp,
          updatedAt: timestamp,
          lastModifiedBy: userEmail,
          lastModifiedByName: userName
        };
      });

      // Merge with existing files (replace if same filePath exists, else append)
      const currentFiles = (localFilesRef.current && localFilesRef.current.length > 0) ? localFilesRef.current : files;
      const incomingPathSet = new Set(newFormattedFiles.map(f => f.filePath));
      const mergedFiles = [
        ...currentFiles.filter(f => !incomingPathSet.has(f.filePath)),
        ...newFormattedFiles
      ];

      // Protect local state with grace period
      localMutationTimestampRef.current = Date.now() + 60000;
      localFilesRef.current = mergedFiles;
      setFiles(mergedFiles);
      setImportModalData(null);

      // Save local offline draft in browser localStorage (full content for instant reload)
      try {
        localStorage.setItem(`obsidian_draft_${projectId}_${userEmail}`, JSON.stringify(mergedFiles));
      } catch (e) {}

      if (isProjectOwner) {
        setMasterFiles(mergedFiles);
        localMasterRef.current = mergedFiles;
        hasUnsavedForkChangesRef.current = false;
        isLocalDirtyRef.current = false;
      } else {
        // For editor: working files contains the imported folder, master baseline remains canonical
        hasUnsavedForkChangesRef.current = true;
        isLocalDirtyRef.current = true;
      }

      if (newFormattedFiles.length > 0) {
        handleSelectFile(newFormattedFiles[0]);
      }

      // 1. Persist MANIFEST-ONLY to Firestore parent document (no file content)
      //    This prevents hitting the 1 MiB Firestore document size limit — the PRIMARY fix.
      //    Full file content is stored exclusively in the subcollection (step 2).
      try {
        const manifestFiles = toManifest(mergedFiles);
        const payload = {
          working_files: manifestFiles,
          ...(isProjectOwner ? {
            master_project_files: manifestFiles,
            project_files: manifestFiles,
            masterLastSyncedAt: timestamp,
            masterLastSyncedBy: userEmail,
            pendingFork: false
          } : {
            lastWorkingModifiedBy: userEmail,
            lastWorkingModifiedByName: userName,
            pendingFork: true
          }),
          updatedAt: timestamp
        };
        await setDoc(doc(db, 'projects', projectId), payload, { merge: true });
      } catch (fsErr) {
        console.warn('Parent project document update notice:', fsErr);
      }

      // 2. Persist individual files WITH FULL CONTENT in subcollection (chunked for resilience)
      try {
        const chunkPromises = mergedFiles.map(f => {
          if (f && (f.fileId || f.filePath)) {
            const fileDocId = f.fileId || `file_${projectId}_${f.filePath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
            return setDoc(doc(db, 'projects', projectId, 'files', fileDocId), {
              fileId: String(fileDocId),
              projectId: String(projectId),
              filePath: String(f.filePath),
              fileName: String(f.fileName),
              content: String(f.content || ''),
              fileType: String(f.fileType || 'plaintext'),
              isBinary: Boolean(f.isBinary),
              size: Number(f.size || 0),
              updatedAt: timestamp,
              lastModifiedBy: userEmail
            }, { merge: true });
          }
          return Promise.resolve();
        });
        await Promise.allSettled(chunkPromises);
      } catch (subErr) {
        console.warn('Subcollection sync notice:', subErr);
      }

      // 3. Persist to Backend REST API (Updates backend in-memory cache and adminDb)
      try {
        await fetch('/api/projects/update-files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            projectId,
            working_files: mergedFiles,
            master_project_files: isProjectOwner ? mergedFiles : masterFiles,
            project_files: isProjectOwner ? mergedFiles : masterFiles,
            userEmail,
            ownerEmail: projectData?.ownerEmail || (isProjectOwner ? userEmail : ''),
            collaborators: projectData?.collaborators,
            title: projectData?.title || projectId,
            isOwner: isProjectOwner,
            pendingFork: !isProjectOwner
          })
        });
      } catch (apiErr) {
        console.warn('API update-files notice:', apiErr);
      }

      // 4. Broadcast over WebSocket so all connected peers update immediately
      if (collaborationWsRef.current && collaborationWsRef.current.readyState === WebSocket.OPEN) {
        collaborationWsRef.current.send(JSON.stringify({
          type: isProjectOwner ? 'FILES_UPDATED' : 'FORK_REQUESTED',
          projectId,
          files: mergedFiles,
          master_project_files: isProjectOwner ? mergedFiles : masterFiles,
          working_files: mergedFiles,
          requestedBy: userEmail,
          user: {
            email: userEmail,
            displayName: userName,
            role: isProjectOwner ? 'OWNER' : 'EDITOR'
          }
        }));
      }

      showNotificationToast(`⚡ Successfully imported ${newFormattedFiles.length} file(s) into ${isProjectOwner ? 'Master Repository' : 'Working Copy'}!`, 5000);
    } catch (err) {
      console.error('Error confirming import:', err);
      alert(`Failed to import files: ${err.message}`);
    } finally {
      // ── CLEAR IMPORT GUARD after all persistence is complete ──
      // Use a short delay to ensure any pending onSnapshot callbacks that were queued
      // during the import window don't overwrite the new state.
      setTimeout(() => { isImportingRef.current = false; }, 5000);
    }
  };

  // Menu & Terminal Drawer State
  const [activeMenu, setActiveMenu] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isExecTerminalOpen, setIsExecTerminalOpen] = useState(false);
  const [activeTerminalTab, setActiveTerminalTab] = useState('interactive'); // 'interactive' | 'ai'
  const [terminalOutput, setTerminalOutput] = useState('');

  const handleRunCode = () => {
    if (!activeFile) return;
    setIsExecTerminalOpen(true);
    setActiveTerminalTab('interactive');
    if (terminalController?.runCode) {
      terminalController.runCode(currentContent, activeFile?.filePath || 'src/main.py');
    }
  };

  const handleRunTerminalCommand = (cmdString, customCode = null, targetPath = null) => {
    setIsExecTerminalOpen(true);
    setActiveTerminalTab('interactive');
    if (terminalController?.runCommand) {
      terminalController.runCommand(cmdString, customCode, targetPath);
    } else if (terminalController?.runCode && customCode) {
      terminalController.runCode(customCode, targetPath || activeFile?.filePath || 'src/main.py');
    }
  };

  const handleRunTerminalCode = (code, targetPath = null) => {
    setIsExecTerminalOpen(true);
    setActiveTerminalTab('interactive');
    if (terminalController?.runCode) {
      terminalController.runCode(code, targetPath || activeFile?.filePath || 'src/main.py');
    }
  };

  const handlePushProjectToGitHub = async ({ repoUrl, commitMessage, branch = 'main', filesToPush = null }) => {
    const targetRepo = (repoUrl || projectData?.githubRepoUrl || liveProjectData?.githubRepoUrl || '').trim();
    if (!targetRepo) {
      throw new Error('No GitHub repository URL provided. Please specify a repository like https://github.com/username/repo');
    }

    const resolvedFiles = filesToPush || files.map(f => {
      if (activeFile && (f.filePath === activeFile.filePath || f.fileName === activeFile.fileName)) {
        return { ...f, content: currentContent };
      }
      return f;
    });

    const userEmail = (currentUser?.email || userProfile?.info?.email || '').trim().toLowerCase();
    const token = await getFirebaseIdToken();
    const pushRes = await fetch('/api/github/push-project', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        projectId,
        userEmail,
        accessToken: userProfile?.info?.github?.accessToken || '',
        repoUrl: targetRepo,
        commitMessage: commitMessage || `Update from ObsidianIDE AI Agent (${new Date().toLocaleDateString()})`,
        branch,
        files: resolvedFiles
      })
    });

    if (!pushRes.ok) {
      const pushErr = await pushRes.json().catch(() => ({}));
      throw new Error(pushErr.message || pushErr.error || 'Failed to push project to GitHub');
    }

    const pushData = await pushRes.json();

    setLiveProjectData(prev => ({
      ...(prev || {}),
      githubRepoUrl: pushData.repoUrl || targetRepo,
      githubLastSyncedAt: pushData.syncedAt,
      githubLastCommitSha: pushData.commitSha
    }));

    try {
      const projDocRef = doc(db, 'projects', projectId);
      await setDoc(projDocRef, {
        githubRepoUrl: pushData.repoUrl || targetRepo,
        githubLastSyncedAt: pushData.syncedAt,
        githubLastCommitSha: pushData.commitSha,
        updatedAt: pushData.syncedAt
      }, { merge: true });
    } catch (fsErr) {
      console.warn("Save githubRepoUrl notice:", fsErr);
    }

    return pushData;
  };

  const handleFilesGenerated = useCallback((generatedFiles = []) => {
    if (!Array.isArray(generatedFiles) || generatedFiles.length === 0) return;

    localMutationTimestampRef.current = Date.now();

    setFiles(prevFiles => {
      const updated = [...prevFiles];
      let newlyAddedCount = 0;
      let newlyAddedPaths = [];

      for (const genFile of generatedFiles) {
        const targetPath = genFile.filePath || genFile.fileName;
        if (!targetPath) continue;

        const existingIndex = updated.findIndex(f => (f.filePath || f.fileName) === targetPath);

        if (existingIndex >= 0) {
          updated[existingIndex] = {
            ...updated[existingIndex],
            content: genFile.content,
            size: genFile.size || genFile.content?.length || 0,
            isBinary: genFile.isBinary !== undefined ? genFile.isBinary : isBinaryFile(targetPath),
            lastModifiedAt: new Date().toISOString(),
            lastModifiedBy: currentUser?.displayName || currentUser?.email || 'terminal_runner'
          };
        } else {
          updated.push({
            filePath: targetPath,
            fileName: genFile.fileName || targetPath.split('/').pop(),
            fileType: genFile.fileType || targetPath.split('.').pop() || 'txt',
            content: genFile.content,
            size: genFile.size || genFile.content?.length || 0,
            isBinary: genFile.isBinary !== undefined ? genFile.isBinary : isBinaryFile(targetPath),
            lastModifiedAt: new Date().toISOString(),
            lastModifiedBy: currentUser?.displayName || currentUser?.email || 'terminal_runner'
          });
          newlyAddedCount++;
          newlyAddedPaths.push(targetPath);
        }
      }

      localFilesRef.current = updated;

      // Persist to backend and Firestore
      const userEmail = (currentUser?.email || '').trim().toLowerCase();
      const tokenPromise = getFirebaseIdToken();

      tokenPromise.then(authHeader => {
        fetch('/api/projects/update-files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader ? { 'Authorization': `Bearer ${authHeader}` } : {})
          },
          body: JSON.stringify({
            projectId,
            working_files: updated,
            master_project_files: isProjectOwner ? updated : masterFiles,
            userEmail,
            isOwner: isProjectOwner
          })
        }).catch(e => console.warn('Sync generated files notice:', e));
      });

      if (newlyAddedCount > 0) {
        showNotificationToast(`📁 Generated ${newlyAddedCount} new project file(s): ${newlyAddedPaths.slice(0, 3).join(', ')}`, 4000);
      }

      return updated;
    });
  }, [projectId, isProjectOwner, currentUser, masterFiles, isBinaryFile]);

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
            to={currentUser ? "/dashboard" : "/"}
            className="flex items-center gap-2 cursor-pointer group no-underline"
            title={currentUser ? "Return to Workspace Central Launcher (Dashboard)" : "Go to Home"}
          >
            <img 
              src="/logo.png" 
              alt="ObsidianIDE Logo" 
              className="w-6 h-6 rounded-full object-cover border border-cyan-400/40 shadow-[0_0_10px_rgba(0,220,229,0.3)] group-hover:scale-105 transition-transform" 
            />
            <span className="text-sm font-bold text-white font-headline tracking-tight group-hover:text-cyan-300 transition-colors">
              ObsidianIDE
            </span>
          </Link>

          {/* â”€â”€ VS Code-Style Menu Bar â”€â”€ */}
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
                <div className="absolute top-8 left-0 w-64 bg-[#12131A] border border-white/[0.12] rounded-lg shadow-2xl py-1.5 z-[300] divide-y divide-white/5 animate-fade-in font-sans text-xs">
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
                <div className="absolute top-8 left-0 w-56 bg-[#16171F] border border-white/10 rounded-lg shadow-2xl py-1.5 z-[300] divide-y divide-white/5 animate-fade-in">
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
                <div className="absolute top-8 left-0 w-52 bg-[#16171F] border border-white/10 rounded-lg shadow-2xl py-1.5 z-[300] animate-fade-in">
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
                <div className="absolute top-8 left-0 w-64 bg-[#16171F] border border-white/10 rounded-lg shadow-2xl py-1.5 z-[300] divide-y divide-white/5 animate-fade-in">
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
                <div className="absolute top-8 left-0 w-60 bg-[#16171F] border border-white/10 rounded-lg shadow-2xl py-1.5 z-[300] divide-y divide-white/5 animate-fade-in">
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
                      onClick={() => { terminalController?.clear?.(); setActiveMenu(null); }}
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
                <div className="absolute top-8 left-0 w-56 bg-[#16171F] border border-white/10 rounded-lg shadow-2xl py-1.5 z-[300] animate-fade-in">
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
                <div className="absolute top-8 left-0 w-60 bg-[#16171F] border border-white/10 rounded-lg shadow-2xl py-1.5 z-[300] divide-y divide-white/5 animate-fade-in">
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

          {/* â”€â”€ Single Unified Clean Play Button (Run Code) â”€â”€ */}
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
              <div className="absolute right-0 top-9 w-72 bg-[#12131A] border border-white/[0.12] rounded-xl shadow-2xl p-3 z-[300] space-y-2 animate-fade-in font-sans">
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
                      {(() => {
                        const projOwnerEmail = (liveProjectData?.ownerEmail || projectData?.ownerEmail || '').trim().toLowerCase();
                        const isRemoteOwner = Boolean(projOwnerEmail && c.email && projOwnerEmail === c.email.trim().toLowerCase());
                        const remoteRole = isRemoteOwner ? 'OWNER' : (c.role || 'EDITOR').toUpperCase();
                        return (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                            remoteRole === 'OWNER'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : remoteRole === 'REVIEWER'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          }`}>
                            {remoteRole}
                          </span>
                        );
                      })()}
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

          {/* â”€â”€ Dual-Tier Architecture: Owner Master Commit vs Editor Fork Request â”€â”€ */}
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
              {collaboratorPendingChangesCount > 0 && (
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
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[250] bg-[#12131C] border border-cyan-500/50 text-cyan-200 px-4 py-2 rounded-xl shadow-[0_0_25px_rgba(6,182,212,0.3)] text-xs font-mono flex items-center gap-2.5 animate-fade-in">
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

            {/* â”€â”€ Left Draggable Partition Splitter (Explorer <-> Editor) â”€â”€ */}
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsDiffViewActive(prev => !prev)}
                      className="px-2.5 py-0.5 rounded bg-purple-700 hover:bg-purple-600 text-white text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow active:scale-95"
                      title="Inspect side-by-side diff of your staged changes against Master"
                    >
                      <span className="material-symbols-outlined text-xs">difference</span>
                      <span>{isDiffViewActive ? 'Exit Diff' : 'View Diff vs Master'}</span>
                    </button>
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
                      <span>The Project Owner updated repository files. Your workspace refreshes automatically from Master.</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsDiffViewActive(prev => !prev)}
                      className="px-2.5 py-0.5 rounded bg-purple-700 hover:bg-purple-600 text-white text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow active:scale-95"
                      title="Inspect what the Project Owner updated"
                    >
                      <span className="material-symbols-outlined text-xs">difference</span>
                      <span>{isDiffViewActive ? 'Exit Diff' : 'Review Changes'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 3. Owner Pending Merge Review Banner (Shown to Owner when COLLABORATOR has submitted changes) */}
              {isProjectOwner && collaboratorPendingChangesCount > 0 && (
                <div className="bg-cyan-950/95 border-b border-cyan-500/50 px-4 py-1.5 flex items-center justify-between text-xs font-mono text-cyan-200 shrink-0 z-20 shadow-lg flex-wrap gap-2 animate-fade-in">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-base text-cyan-400 animate-pulse">rate_review</span>
                    <div>
                      <span className="font-bold text-cyan-300">Pending Collaborator Review:</span>{' '}
                      <span>{collaboratorPendingChangesCount} change{collaboratorPendingChangesCount > 1 ? 's' : ''} submitted by collaborators (Accept & Merge or Reject & Restore Master).</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsDiffViewActive(prev => !prev)}
                      className="px-3 py-1 rounded bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow-md active:scale-95 border border-purple-400/30"
                      title="Inspect side-by-side visual diff before merging into Master"
                    >
                      <span className="material-symbols-outlined text-xs">difference</span>
                      <span>{isDiffViewActive ? 'Exit Diff View' : 'Review Diff & Changes'}</span>
                    </button>
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
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold flex items-center gap-1.5 ${fileStatusMap[activeFile.filePath] === 'ADDED'
                          ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/40'
                          : fileStatusMap[activeFile.filePath] === 'MODIFIED'
                            ? 'bg-amber-950/90 text-amber-300 border border-amber-500/40'
                            : 'bg-rose-950/90 text-rose-300 border border-rose-500/40'
                        }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        <span>
                          {fileStatusMap[activeFile.filePath] === 'ADDED'
                            ? 'NEW PROPOSED FILE'
                            : fileStatusMap[activeFile.filePath] === 'MODIFIED'
                              ? 'PROPOSED MODIFICATION'
                              : 'DELETED FILE'}
                        </span>
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
                  onChangeContent={handleEditorContentChange}
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

            {/* â”€â”€ Right Draggable Partition Splitter (Editor <-> Live Sandbox) â”€â”€ */}
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

            {/* â”€â”€ Integrated Terminal Bottom Drawer â”€â”€ */}
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
                    files={files}
                    isVisible={isExecTerminalOpen}
                    onTerminalReady={(ctrl) => setTerminalController(ctrl)}
                    onOutput={(out) => setTerminalOutput(out)}
                    onFilesGenerated={handleFilesGenerated}
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
              projectTitle={projectData?.title || projectId}
              projectGithubRepoUrl={projectData?.githubRepoUrl || liveProjectData?.githubRepoUrl || ''}
              githubInfo={userProfile?.info?.github || null}
              terminalOutput={terminalOutput}
              onRunCommand={handleRunTerminalCommand}
              onRunCode={handleRunTerminalCode}
              onPushToGitHub={handlePushProjectToGitHub}
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
          <span className="text-emerald-400/80 flex items-center gap-1" title="All project data lives in ObsidianIDE's secure cloud database">
            <span className="material-symbols-outlined text-xs">database</span>
            <span>Cloud Connected</span>
          </span>
        </div>
        <div>Â© 2026 Obsidian Systems. Built via agile workspace methodology layers.</div>
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
