import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FileExplorer } from '../components/ide/FileExplorer';
import { MonacoEditorCanvas } from '../components/ide/MonacoEditorCanvas';
import { SandboxPreview } from '../components/ide/SandboxPreview';
import { ReviewDrawer } from '../components/ide/ReviewDrawer';
import { AITerminalPanel } from '../components/ide/AITerminalPanel';
import { AgenticAIChatSidebar } from '../components/ide/AgenticAIChatSidebar';

export const IDEWorkspacePage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const [files, setFiles] = useState([]);
  const [openFiles, setOpenFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [currentContent, setCurrentContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Review Drawer & Patches State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [patches, setPatches] = useState([]);

  // Agentic AI State
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');

  const userRole = userProfile?.role || 'OWNER'; // OWNER, EDITOR, REVIEWER

  const fetchProjectFiles = async () => {
    try {
      const res = await fetch(`/api/files/${projectId}?userEmail=${encodeURIComponent(currentUser?.email || '')}`);
      const data = await res.json();
      if (res.ok && data.files) {
        setFiles(data.files);
        if (data.files.length > 0) {
          const firstFile = data.files[0];
          setOpenFiles([firstFile]);
          setActiveFile(firstFile);
          setCurrentContent(firstFile.content);
          setSavedContent(firstFile.content);
        }
      }
    } catch (err) {
      console.error('Error fetching project files:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectPatches = async () => {
    try {
      const res = await fetch(`/api/patches/${projectId}`);
      const data = await res.json();
      if (res.ok && data.patches) {
        setPatches(data.patches);
      }
    } catch (err) {
      console.warn("Failed to fetch patches:", err);
    }
  };

  useEffect(() => {
    fetchProjectFiles();
    fetchProjectPatches();
  }, [projectId]);

  const handleSelectFile = (fileObj) => {
    if (!openFiles.some((f) => f.fileId === fileObj.fileId)) {
      setOpenFiles([...openFiles, fileObj]);
    }
    setActiveFile(fileObj);
    setCurrentContent(fileObj.content);
    setSavedContent(fileObj.content);
  };

  const handleSelectTab = (fileObj) => {
    setActiveFile(fileObj);
    setCurrentContent(fileObj.content);
    setSavedContent(fileObj.content);
  };

  const handleCloseTab = (fileObj) => {
    const nextTabs = openFiles.filter((f) => f.fileId !== fileObj.fileId);
    setOpenFiles(nextTabs);
    if (activeFile?.fileId === fileObj.fileId) {
      if (nextTabs.length > 0) {
        const lastTab = nextTabs[nextTabs.length - 1];
        setActiveFile(lastTab);
        setCurrentContent(lastTab.content);
        setSavedContent(lastTab.content);
      } else {
        setActiveFile(null);
        setCurrentContent('');
        setSavedContent('');
      }
    }
  };

  const handleSaveFile = async () => {
    if (!activeFile) return;

    setIsSaving(true);
    try {
      if (userRole === 'REVIEWER') {
        const res = await fetch('/api/patches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            fileId: activeFile.fileId,
            authorName: currentUser?.displayName || 'Samia Sultana',
            authorEmail: currentUser?.email || 'samia@bubt.edu.bd',
            diffPayload: {
              removed: savedContent.slice(0, 40) + '...',
              added: currentContent.slice(0, 40) + '...'
            },
            comment: 'Reviewer text delta submitted for approval.'
          })
        });

        const data = await res.json();
        if (res.ok && data.patch) {
          setPatches([data.patch, ...patches]);
          alert("Reviewer patch request submitted to validation queue!");
        }
      } else {
        const res = await fetch(`/api/files/${activeFile.fileId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: currentContent,
            userEmail: currentUser?.email || 'admin@bubt.edu.bd'
          })
        });

        if (res.ok) {
          setSavedContent(currentContent);
          setFiles(files.map(f => f.fileId === activeFile.fileId ? { ...f, content: currentContent } : f));
        }
      }
    } catch (err) {
      console.error('Error saving file:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResolvePatch = async (patch, action) => {
    try {
      const res = await fetch(`/api/patches/${patch.patchId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          fileId: patch.fileId,
          newContent: currentContent
        })
      });

      if (res.ok) {
        setPatches(patches.filter(p => p.patchId !== patch.patchId));
        if (action === 'APPROVE') {
          setSavedContent(currentContent);
        }
      }
    } catch (err) {
      console.error('Error resolving patch:', err);
    }
  };

  const handleRunAIDiagnostics = async () => {
    if (!currentContent) return;

    setIsAIPanelOpen(true);
    setIsAnalyzing(true);

    try {
      const res = await fetch('/api/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codeText: currentContent,
          language: activeFile?.filePath.split('.').pop() || 'rust'
        })
      });

      const data = await res.json();
      if (res.ok && data.aiFeedback) {
        setAiFeedback(data.aiFeedback);
      } else {
        setAiFeedback('AI Diagnostics notice: Engine response unavailable.');
      }
    } catch (err) {
      console.error('Error running AI diagnostics:', err);
      setAiFeedback('Failed to communicate with Express Gemini API endpoint.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyAIModifications = (filePath, newContent) => {
    // If target file is active, update currentContent editor buffer
    if (activeFile && activeFile.filePath === filePath) {
      setCurrentContent(newContent);
    }
    // Update files array
    setFiles(files.map(f => f.filePath === filePath ? { ...f, content: newContent } : f));
    alert(`Applied AI agent modifications to ${filePath}! Click "SAVE CHANGES" to persist.`);
  };

  const handleCreateFile = async (filePath) => {
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          filePath,
          content: `// New File: ${filePath}\n`,
          userEmail: currentUser?.email || 'admin@bubt.edu.bd'
        })
      });

      const data = await res.json();
      if (res.ok && data.file) {
        setFiles([...files, data.file]);
        handleSelectFile(data.file);
      }
    } catch (err) {
      console.error('Error creating new file:', err);
    }
  };

  const isUnsaved = currentContent !== savedContent;

  return (
    <div className="h-screen flex flex-col bg-surface-dark text-on-surface overflow-hidden font-sans">
      {/* Top IDE Toolbelt Header */}
      <header className="fixed top-0 left-0 w-full z-[200] flex justify-between items-center px-6 h-12 bg-surface-container-low/90 backdrop-blur-xl border-b border-outline-variant shadow-md select-none font-mono">
        <div className="flex items-center gap-8">
          <span 
            onClick={() => navigate('/dashboard')}
            className="text-xl font-bold text-surface-tint tracking-tighter cursor-pointer font-headline hover:opacity-90"
          >
            ObsidianIDE
          </span>
          <nav className="hidden md:flex items-center gap-5 text-xs text-on-surface-variant">
            <span className="hover:text-primary transition-colors cursor-pointer px-1">File</span>
            <span className="hover:text-primary transition-colors cursor-pointer px-1">Edit</span>
            <span className="hover:text-primary transition-colors cursor-pointer px-1">Project</span>
            <span className="hover:text-primary transition-colors cursor-pointer px-1">Build</span>
            <span className="hover:text-primary transition-colors cursor-pointer px-1">Tools</span>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              const inviteUrl = `${window.location.origin}/invite/${projectId}`;
              navigator.clipboard.writeText(inviteUrl);
              alert(`Teammate invite link copied to clipboard:\n${inviteUrl}`);
            }}
            className="flex items-center gap-1.5 bg-surface-container-high text-on-surface border border-outline-variant px-2.5 py-1 text-xs rounded hover:border-surface-tint transition-colors cursor-pointer"
            title="Copy Teammate Invitation Link"
          >
            <span className="material-symbols-outlined text-sm">person_add</span>
            <span className="hidden sm:inline">Invite Teammate</span>
          </button>

          <button 
            onClick={() => window.open('https://meet.google.com/new', '_blank')}
            className="flex items-center gap-2 bg-cyan-950/40 text-primary-fixed-dim border border-cyan-800/40 px-3 py-1 text-xs rounded hover:bg-cyan-900/50 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">video_call</span>
            <span>Link Meet Session</span>
          </button>

          <button 
            onClick={handleRunAIDiagnostics}
            className="flex items-center gap-2 bg-cyan-950 text-cyan-400 border border-cyan-700 px-3 py-1 text-xs rounded hover:bg-cyan-900 transition-colors cursor-pointer font-bold"
          >
            <span className="material-symbols-outlined text-sm">psychology</span>
            <span>Run AI Review</span>
          </button>

          {/* Agentic AI Assistant Trigger Button (Top Right) */}
          <button 
            onClick={() => setIsAIChatOpen(!isAIChatOpen)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-600 to-purple-600 text-white px-3 py-1 text-xs rounded font-bold hover:brightness-110 transition-all shadow-[0_0_12px_#00dce5] cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">auto_awesome</span>
            <span>AI Assistant</span>
          </button>

          <button 
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className="flex items-center gap-2 bg-purple-950/40 text-secondary-fixed-dim border border-purple-800/40 px-3 py-1 text-xs rounded hover:bg-purple-900/50 transition-colors relative group cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">verified_user</span>
            <span>Review Actions ({patches.length})</span>
            {patches.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse absolute -top-1 -right-1 shadow-[0_0_8px_#e0b6ff]" title="Pending Patches Ready for Review"></span>
            )}
          </button>

          <button 
            onClick={toggleTheme}
            className="p-1 rounded text-on-surface-variant hover:text-surface-tint cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">{isDark ? 'light_mode' : 'dark_mode'}</span>
          </button>
        </div>
      </header>

      {/* 3-Pane Split Workspace Main Canvas */}
      <main className="flex-1 flex pt-12 pb-8 h-[calc(100vh)] bg-surface-dark overflow-hidden relative">
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
            />

            {/* Pane B: Central Monaco Development Editor Window */}
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
            />

            {/* Pane C: Right-Hand Live Preview Sandbox Frame */}
            <SandboxPreview content={currentContent} />

            {/* Agentic AI Diagnostic Console Terminal */}
            <AITerminalPanel 
              isOpen={isAIPanelOpen}
              onClose={() => setIsAIPanelOpen(false)}
              onRunDiagnostics={handleRunAIDiagnostics}
              isAnalyzing={isAnalyzing}
              aiFeedback={aiFeedback}
              currentFileName={activeFile?.filePath || 'main.rs'}
            />

            {/* Agentic AI Chatbot Drawer (Right Side) */}
            <AgenticAIChatSidebar
              isOpen={isAIChatOpen}
              onClose={() => setIsAIChatOpen(false)}
              activeFile={activeFile}
              currentContent={currentContent}
              files={files}
              onApplyModifications={handleApplyAIModifications}
              projectId={projectId}
            />

            {/* Collaboration Review Drawer Overlay */}
            <ReviewDrawer 
              isOpen={isDrawerOpen}
              onClose={() => setIsDrawerOpen(false)}
              patches={patches}
              onResolvePatch={handleResolvePatch}
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
          <span>Firestore Synced</span>
        </div>
        <div>© 2026 Obsidian Systems. Built via agile workspace methodology layers.</div>
      </footer>
    </div>
  );
};
export default IDEWorkspacePage;
