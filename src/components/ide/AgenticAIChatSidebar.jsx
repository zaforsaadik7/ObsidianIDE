import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';

export const AgenticAIChatSidebar = ({ 
  isOpen, 
  onClose, 
  activeFile, 
  currentContent, 
  files = [], 
  onApplyModifications,
  projectId = 'default-project',
  projectTitle = 'Project',
  projectGithubRepoUrl = '',
  githubInfo = null,
  terminalOutput = '',
  onRunCommand,
  onRunCode,
  onPushToGitHub,
  width = 420
}) => {
  const { currentUser } = useAuth();
  const sessionsStorageKey = `obsidian_ai_sessions_${projectId}`;
  const [includeTerminalLogs, setIncludeTerminalLogs] = useState(true);
  const [dispatchedCmdIds, setDispatchedCmdIds] = useState(new Set());
  const [pushingGitHubIdx, setPushingGitHubIdx] = useState(null);
  const [pushedGitHubResults, setPushedGitHubResults] = useState({});
  const [githubRepoUrlInputs, setGithubRepoUrlInputs] = useState({});
  const [githubErrorResults, setGithubErrorResults] = useState({});

  const createNewSession = (title = 'New Conversation') => ({
    id: 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    title,
    messages: [
      {
        sender: 'ai',
        text: 'Hello! I am your **Antigravity Agentic AI Assistant**. I have complete vision over all project files in this workspace.\n\nAsk me to refactor code, implement new features, or type `@` to reference specific files!',
        modifications: []
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // ── Multi-Session Chat History State ──
  const [sessions, setSessions] = useState(() => {
    try {
      const saved = localStorage.getItem(sessionsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [createNewSession('Initial Session')];
  });

  const [activeSessionId, setActiveSessionId] = useState(() => {
    return sessions[0]?.id || 'session_default';
  });

  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  // Active Session helper
  const currentSession = sessions.find(s => s.id === activeSessionId) || sessions[0] || createNewSession();
  const messages = currentSession.messages || [];

  // Persist sessions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(sessionsStorageKey, JSON.stringify(sessions));
    } catch (e) {
      console.warn('Storage quota notice for AI sessions:', e);
    }
  }, [sessions, sessionsStorageKey]);

  // ── Dynamic Backend & API Resolution ──
  const getBackendBaseUrl = () => {
    const envUrl = (import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
    if (envUrl) return envUrl;
    if (typeof window !== 'undefined' && (window.location.hostname.includes('vercel.app') || window.location.port === '5173')) {
      return 'https://obsidianide.onrender.com';
    }
    return '';
  };

  // ── Dynamic Model Discovery State ──
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('obsidian_ai_key') || '');
  const [availableModels, setAvailableModels] = useState([
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Recommended)', description: 'Fast, reliable standard model' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Next-gen high-speed model' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Deep multi-file reasoning' }
  ]);
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-flash');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [hasValidApiKey, setHasValidApiKey] = useState(Boolean(userApiKey));

  // Fetch verified workable models dynamically from API
  const fetchAvailableModels = async (keyToUse) => {
    setIsLoadingModels(true);
    const key = (keyToUse !== undefined ? keyToUse : userApiKey).trim();
    const backendBase = getBackendBaseUrl();

    try {
      // 1. Try Backend endpoint
      let res = await fetch(`${backendBase}/api/ai-agent/models?apiKey=${encodeURIComponent(key)}`).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models) && data.models.length > 0) {
          setAvailableModels(data.models);
          setHasValidApiKey(Boolean(data.hasKey));
          if (!data.models.some(m => m.id === selectedModel)) {
            setSelectedModel(data.models[0].id);
          }
          setIsLoadingModels(false);
          return;
        }
      }

      // 2. Direct Google Generative Language API fallback if key provided
      if (key) {
        const googleRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`).catch(() => null);
        if (googleRes && googleRes.ok) {
          const gData = await googleRes.json();
          const rawModels = gData.models || [];
          const genModels = rawModels
            .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
            .map(m => ({
              id: m.name.replace(/^models\//, ''),
              name: m.displayName || m.name.replace(/^models\//, ''),
              description: m.description || 'Google Gemini Language Model'
            }))
            .filter(m => m.id.startsWith('gemini-') && !m.id.includes('image') && !m.id.includes('embedding') && !m.id.includes('tts'));

          if (genModels.length > 0) {
            setAvailableModels(genModels);
            setHasValidApiKey(true);
            if (!genModels.some(m => m.id === selectedModel)) {
              setSelectedModel(genModels[0].id);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Model discovery notice:', err);
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    fetchAvailableModels(userApiKey);
  }, []);

  // ── Prompt & Mentions State ──
  const [inputPrompt, setInputPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [appliedModIds, setAppliedModIds] = useState(new Set());
  const [mentionQuery, setMentionQuery] = useState(null); // null when not mentioning, string when typing after @
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const inputRef = useRef(null);

  // ── API Key Vault Modal State ──
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [vaultKeyInput, setVaultKeyInput] = useState(userApiKey);
  const [keyValidationStatus, setKeyValidationStatus] = useState(null); // { loading, valid, message, error }

  // Detect "@" in input to trigger file autocomplete
  const handleInputChange = (e) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setInputPrompt(val);

    // Look for @ before cursor
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const query = textBeforeCursor.slice(lastAtIndex + 1);
      // Only match if no spaces after @ or valid path characters
      if (!query.includes(' ') && !query.includes('\n')) {
        setMentionQuery(query.toLowerCase());
        setMentionCursorPos(lastAtIndex);
        setMentionIndex(0);
        return;
      }
    }
    setMentionQuery(null);
  };

  // Filter matching workspace files for @ mention
  const matchingFiles = mentionQuery !== null 
    ? files.filter(f => {
        const path = (f.filePath || f.fileName || '').toLowerCase();
        return path.includes(mentionQuery);
      }).slice(0, 6)
    : [];

  const handleSelectMention = (filePath) => {
    if (mentionCursorPos === -1) return;
    const beforeAt = inputPrompt.slice(0, mentionCursorPos);
    const textAfterCursor = inputPrompt.slice(inputRef.current?.selectionStart || mentionCursorPos);
    const afterAt = textAfterCursor.replace(/^[^\s]*/, ''); // Remove the partial query

    const newText = `${beforeAt}@${filePath} ${afterAt}`;
    setInputPrompt(newText);
    setMentionQuery(null);

    setTimeout(() => {
      if (inputRef.current) {
        const newPos = beforeAt.length + filePath.length + 2;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  };

  const handleKeyDown = (e) => {
    if (mentionQuery !== null && matchingFiles.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % matchingFiles.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + matchingFiles.length) % matchingFiles.length);
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = matchingFiles[mentionIndex];
        if (selected) {
          handleSelectMention(selected.filePath || selected.fileName);
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendPrompt();
    }
  };

  // Extract all @mentioned file paths from the current prompt
  const extractMentionedFiles = (text) => {
    const matches = text.match(/@([\w\-./\\]+)/g) || [];
    return matches.map(m => m.slice(1)).filter(p => files.some(f => f.filePath === p || f.fileName === p));
  };

  const activeMentionedFiles = extractMentionedFiles(inputPrompt);

  // ── Session Management Functions ──
  const handleStartNewChat = () => {
    const newSess = createNewSession(`Chat ${sessions.length + 1}`);
    setSessions(prev => [newSess, ...prev]);
    setActiveSessionId(newSess.id);
    setIsHistoryDrawerOpen(false);
    setInputPrompt('');
  };

  const handleSwitchSession = (id) => {
    setActiveSessionId(id);
    setIsHistoryDrawerOpen(false);
  };

  const handleDeleteSession = (e, id) => {
    e.stopPropagation();
    setSessions(prev => {
      const remaining = prev.filter(s => s.id !== id);
      if (remaining.length === 0) {
        const fresh = [createNewSession('New Chat')];
        setActiveSessionId(fresh[0].id);
        return fresh;
      }
      if (activeSessionId === id) {
        setActiveSessionId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleClearAllHistory = () => {
    const fresh = [createNewSession('Fresh Workspace')];
    setSessions(fresh);
    setActiveSessionId(fresh[0].id);
    setIsHistoryDrawerOpen(false);
  };

  // ── Direct Client-Side Gemini API Fallback Engine (Dual-Layer Resilience) ──
  const callDirectGeminiApi = async ({ apiKey, selectedModel, prompt, activeFile, currentContent, fileManifest, mentionedFiles, terminalOutput }) => {
    const modelsToTry = [
      selectedModel || 'gemini-1.5-flash',
      'gemini-1.5-flash',
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-1.5-pro'
    ].filter((v, i, a) => a.indexOf(v) === i);

    let codebaseContextSection = '';
    if (Array.isArray(fileManifest) && fileManifest.length > 0) {
      const filesWithContent = fileManifest.map((f, i) => {
        const path = f.filePath || f.fileName || `file_${i}`;
        const content = f.content !== undefined ? String(f.content) : '';
        const isMentioned = Array.isArray(mentionedFiles) && mentionedFiles.includes(path);
        const tag = isMentioned ? ' [⭐ USER MENTIONED FILE]' : '';
        return `========================================================\nFILE [${i + 1}/${fileManifest.length}]: ${path}${tag}\n========================================================\n${content}\n`;
      }).join('\n');
      codebaseContextSection = `PROJECT CODEBASE (${fileManifest.length} files):\n${filesWithContent}\n`;
    }

    const terminalContextSection = terminalOutput ? `\nLATEST TERMINAL OUTPUT:\n\`\`\`terminal\n${String(terminalOutput).slice(-10000)}\n\`\`\`\n` : '';
    const activeBufferSection = activeFile ? `\nACTIVE OPEN BUFFER (${activeFile.filePath || activeFile.fileName}):\n\`\`\`\n${currentContent || ''}\n\`\`\`\n` : '';

    const systemPrompt = `You are Antigravity-AI, the advanced autonomous agentic coding assistant embedded in ObsidianIDE.
You have complete access to the user's workspace files and terminal output.

${codebaseContextSection}
${activeBufferSection}
${terminalContextSection}

USER INSTRUCTION:
${prompt}

RESPONSE GUIDELINES:
1. Provide a comprehensive, clear, and professional response explaining the code analysis and solution.
2. If code modifications are needed across the workspace, you MUST include a clean JSON block at the very end inside a \`\`\`json\`\`\` code fence formatted EXACTLY as:
\`\`\`json
{
  "modifications": [
    {
      "filePath": "path/to/file.ext",
      "newContent": "COMPLETE updated source code for this file"
    }
  ],
  "commands": [
    "python src/main.py"
  ]
}
\`\`\`
3. If no file modifications are needed, provide your explanation directly without the JSON block.`;

    let lastError = null;
    for (const modelName of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{ text: systemPrompt }]
            }],
            generationConfig: {
              temperature: 0.2,
              topP: 0.95,
              maxOutputTokens: 8192
            }
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          const candidate = data.candidates?.[0];
          const rawText = candidate?.content?.parts?.[0]?.text || '';
          if (rawText) {
            let text = rawText;
            let fileModifications = [];
            let terminalCommands = [];
            let runScript = null;
            let githubAction = null;

            const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[1].trim());
                text = rawText.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
                if (Array.isArray(parsed.modifications)) {
                  fileModifications = parsed.modifications.map((m, idx) => ({
                    modificationId: `mod_${Date.now()}_${idx}`,
                    filePath: m.filePath,
                    newContent: m.newContent,
                    action: 'MODIFY',
                    description: `Update ${m.filePath}`
                  }));
                }
                if (Array.isArray(parsed.commands)) {
                  terminalCommands = parsed.commands;
                }
                if (parsed.runScript) runScript = parsed.runScript;
                if (parsed.githubAction) githubAction = parsed.githubAction;
              } catch (e) {}
            }

            return {
              text,
              fileModifications,
              terminalCommands,
              runScript,
              githubAction,
              modelUsed: modelName
            };
          }
        } else {
          const errData = await resp.json().catch(() => ({}));
          lastError = new Error(errData.error?.message || `HTTP ${resp.status} on ${modelName}`);
        }
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('All Gemini models failed to generate a response.');
  };

  // ── API Key Vault Functions ──
  const handleTestKeyInVault = async () => {
    const key = vaultKeyInput.trim();
    if (!key) {
      setKeyValidationStatus({ valid: false, error: 'Please paste an API key first.' });
      return;
    }

    setKeyValidationStatus({ loading: true });
    const backendBase = getBackendBaseUrl();
    try {
      // 1. Try Backend endpoint first
      let res = await fetch(`${backendBase}/api/ai-agent/validate-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key })
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        if (data.valid) {
          setUserApiKey(key);
          localStorage.setItem('obsidian_ai_key', key);
          setHasValidApiKey(true);
          fetchAvailableModels(key);
          setKeyValidationStatus({
            valid: true,
            message: `✅ Key is live & working! ${data.workingModels?.length || 0} models ready.`
          });
          return;
        }
      }

      // 2. Direct Google Generative Language API test fallback
      const googlePing = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'OK' }] }]
        })
      }).catch(() => null);

      if (googlePing && googlePing.ok) {
        setUserApiKey(key);
        localStorage.setItem('obsidian_ai_key', key);
        setHasValidApiKey(true);
        fetchAvailableModels(key);
        setKeyValidationStatus({
          valid: true,
          message: `✅ Key is live & connected directly to Google Gemini API!`
        });
        return;
      }

      let errMsg = 'API Key rejected by Google Gemini API.';
      if (googlePing) {
        const gErr = await googlePing.json().catch(() => ({}));
        errMsg = gErr.error?.message || errMsg;
      }
      setKeyValidationStatus({ valid: false, error: errMsg });
    } catch (err) {
      setKeyValidationStatus({
        valid: false,
        error: `Connection error: ${err.message}`
      });
    }
  };

  const handleSaveVaultKey = () => {
    const key = vaultKeyInput.trim();
    setUserApiKey(key);
    if (key) {
      localStorage.setItem('obsidian_ai_key', key);
      setHasValidApiKey(true);
    } else {
      localStorage.removeItem('obsidian_ai_key');
      setHasValidApiKey(false);
    }
    fetchAvailableModels(key);
    setIsKeyModalOpen(false);
    setKeyValidationStatus(null);
  };

  // ── Send Prompt Function with Whole Codebase Context ──
  const handleSendPrompt = async (e) => {
    e?.preventDefault();
    if (!inputPrompt.trim() || isSending) return;

    const userText = inputPrompt.trim();
    const mentioned = extractMentionedFiles(userText);
    setInputPrompt('');
    setMentionQuery(null);

    // Append developer message to active session
    const updatedMessages = [
      ...messages,
      { sender: 'user', text: userText, mentionedFiles: mentioned }
    ];

    // Generate smart session title from first prompt if default title
    let sessionTitle = currentSession.title;
    if (currentSession.title.startsWith('New') || currentSession.title.startsWith('Chat')) {
      sessionTitle = userText.slice(0, 28) + (userText.length > 28 ? '...' : '');
    }

    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          title: sessionTitle,
          messages: updatedMessages,
          updatedAt: new Date().toISOString()
        };
      }
      return s;
    }));

    setIsSending(true);

    try {
      // Build comprehensive whole-project codebase manifest (filtered for code files & safe size)
      const fileManifest = (files || [])
        .filter(f => !f.isBinary && (!f.filePath || (!f.filePath.includes('node_modules') && !f.filePath.includes('.git'))))
        .slice(0, 80)
        .map(f => ({
          filePath: f.filePath || f.fileName,
          fileName: f.fileName || (f.filePath ? f.filePath.split('/').pop() : 'file'),
          content: f.content !== undefined ? String(f.content).slice(0, 30000) : '',
          fileType: f.fileType || (f.filePath ? f.filePath.split('.').pop() : 'txt')
        }));

      const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';
      const effectiveApiKey = (userApiKey || localStorage.getItem('obsidian_ai_key') || '').trim();
      const backendBase = getBackendBaseUrl();
      let aiResponseData = null;

      // 1. Attempt Backend AI Endpoint
      try {
        const res = await fetch(`${backendBase}/api/ai-agent/chat`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            prompt: userText,
            activeFilePath: activeFile?.filePath || '',
            activeFileContent: currentContent || '',
            fileManifest,
            mentionedFiles: mentioned,
            terminalOutput: (includeTerminalLogs && terminalOutput) ? terminalOutput : '',
            githubInfo,
            projectInfo: {
              projectId,
              title: projectTitle,
              githubRepoUrl: projectGithubRepoUrl
            },
            apiKey: effectiveApiKey,
            selectedModel
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.response) {
            aiResponseData = data.response;
          }
        }
      } catch (backendErr) {
        console.warn('Backend AI endpoint unreachable, attempting direct client fallback:', backendErr);
      }

      // 2. Direct Client-Side Gemini API Fallback (Dual-layer resilience)
      if (!aiResponseData && effectiveApiKey) {
        try {
          aiResponseData = await callDirectGeminiApi({
            apiKey: effectiveApiKey,
            selectedModel,
            prompt: userText,
            activeFile,
            currentContent,
            fileManifest,
            mentionedFiles: mentioned,
            terminalOutput: (includeTerminalLogs && terminalOutput) ? terminalOutput : ''
          });
        } catch (directErr) {
          console.warn('Direct Gemini API fallback error:', directErr);
        }
      }

      if (aiResponseData) {
        const aiMessage = {
          sender: 'ai',
          text: aiResponseData.text,
          modifications: aiResponseData.fileModifications || [],
          terminalCommands: aiResponseData.terminalCommands || [],
          runScript: aiResponseData.runScript || null,
          githubAction: aiResponseData.githubAction || null,
          modelUsed: aiResponseData.modelUsed || selectedModel
        };

        setSessions(prev => prev.map(s => {
          if (s.id === activeSessionId) {
            return {
              ...s,
              messages: [...s.messages, aiMessage],
              updatedAt: new Date().toISOString()
            };
          }
          return s;
        }));
      } else {
        const errMessage = {
          sender: 'ai',
          text: `⚠️ **Agent Notice**: Unable to generate AI response. Please ensure you have entered a valid Google Gemini API Key in the Key Vault.\n\n*Click the Key icon (🔑) in the top header to enter or test your Gemini API Key.*`,
          modifications: []
        };
        setSessions(prev => prev.map(s => {
          if (s.id === activeSessionId) {
            return {
              ...s,
              messages: [...s.messages, errMessage],
              updatedAt: new Date().toISOString()
            };
          }
          return s;
        }));
      }
    } catch (err) {
      console.error('Error in agentic AI chat:', err);
      const connErrMessage = {
        sender: 'ai',
        text: `⚠️ **Connection Error**: ${err.message || 'Unable to connect to AI service.'}`,
        modifications: []
      };
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            messages: [...s.messages, connErrMessage],
            updatedAt: new Date().toISOString()
          };
        }
        return s;
      }));
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <aside 
      style={{ width: `${width}px` }}
      className="fixed top-12 right-0 bottom-8 z-[260] flex flex-col bg-[#0A0A0B] border-l border-outline-variant shadow-2xl font-mono text-xs select-none"
    >
      {/* Top Header Strip */}
      <div className="p-2.5 bg-surface-container-low border-b border-outline-variant flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-surface-tint text-base shrink-0">auto_awesome</span>
          <span className="font-bold text-on-surface font-headline text-xs truncate">
            ANTIGRAVITY AGENT
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Multi-Model Selector Dropdown (Dynamic from API) */}
          <select 
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isLoadingModels}
            title={availableModels.find(m => m.id === selectedModel)?.description || 'Select AI Model'}
            className="bg-[#141417] border border-cyan-500/30 text-[10px] text-cyan-300 px-2 py-1 rounded focus:outline-none focus:border-cyan-400 cursor-pointer max-w-[135px] truncate"
          >
            {availableModels.map(m => (
              <option key={m.id} value={m.id} className="bg-[#141417] text-white">
                {m.name}
              </option>
            ))}
          </select>

          {/* New Chat Button */}
          <button
            onClick={handleStartNewChat}
            className="text-on-surface-variant hover:text-cyan-400 p-1 rounded hover:bg-white/5 transition-colors cursor-pointer"
            title="Start New Chat (+ New Chat)"
          >
            <span className="material-symbols-outlined text-sm">add_comment</span>
          </button>

          {/* Chat History Drawer Toggle Button */}
          <button
            onClick={() => setIsHistoryDrawerOpen(!isHistoryDrawerOpen)}
            className={`p-1 rounded transition-colors cursor-pointer ${
              isHistoryDrawerOpen ? 'bg-cyan-950 text-cyan-400' : 'text-on-surface-variant hover:text-surface-tint hover:bg-white/5'
            }`}
            title="View Chat History"
          >
            <span className="material-symbols-outlined text-sm">history</span>
          </button>

          {/* API Key Vault Modal Button */}
          <button
            onClick={() => {
              setVaultKeyInput(userApiKey);
              setKeyValidationStatus(null);
              setIsKeyModalOpen(true);
            }}
            className="text-on-surface-variant hover:text-amber-400 p-1 rounded hover:bg-white/5 transition-colors cursor-pointer"
            title="Configure API Key Vault"
          >
            <span className="material-symbols-outlined text-sm">vpn_key</span>
          </button>

          {/* Close Sidebar */}
          <button 
            onClick={onClose} 
            className="text-on-surface-variant hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </div>

      {/* Codebase Context & Active File Ribbon */}
      <div className="px-3 py-1.5 bg-cyan-950/40 border-b border-cyan-900/30 text-[10px] text-cyan-400 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 truncate">
          <span className="material-symbols-outlined text-xs">folder_open</span>
          <span className="truncate">Context: {files.length} project files indexed</span>
        </div>
        <div className="flex items-center gap-1 text-zinc-400 truncate">
          <span className="text-zinc-500">Active:</span>
          <span className="text-cyan-300 font-bold truncate">{activeFile?.filePath || activeFile?.fileName || 'main.rs'}</span>
        </div>
      </div>

      {/* Chat History Dropdown / Drawer View */}
      {isHistoryDrawerOpen ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#0E0E11] animate-fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs">
              <span className="material-symbols-outlined text-sm">history</span>
              <span>CHAT SESSIONS ({sessions.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleStartNewChat}
                className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-2 py-0.5 rounded hover:bg-cyan-900 cursor-pointer"
              >
                + New Chat
              </button>
              <button
                onClick={handleClearAllHistory}
                className="text-[10px] text-rose-400 hover:underline cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            {sessions.map(sess => (
              <div
                key={sess.id}
                onClick={() => handleSwitchSession(sess.id)}
                className={`p-2.5 rounded border transition-all cursor-pointer flex items-center justify-between group ${
                  sess.id === activeSessionId
                    ? 'bg-cyan-950/40 border-cyan-500/50 text-white'
                    : 'bg-surface-container-low border-outline-variant/40 text-zinc-400 hover:border-cyan-500/30 hover:text-zinc-200'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="font-bold text-xs truncate flex items-center gap-1.5">
                    {sess.id === activeSessionId && (
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                    )}
                    <span className="truncate">{sess.title || 'Untitled Session'}</span>
                  </div>
                  <div className="text-[9px] text-zinc-500 font-mono mt-0.5">
                    {sess.messages.length} messages • {new Date(sess.updatedAt || sess.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <button
                  onClick={(e) => handleDeleteSession(e, sess.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 transition-opacity"
                  title="Delete Session"
                >
                  <span className="material-symbols-outlined text-xs">delete</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Chat Messages Stream */
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`flex flex-col gap-1 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 text-[9px] text-on-surface-variant/60 uppercase">
                <span>{msg.sender === 'user' ? 'Developer' : 'Antigravity Agent'}</span>
                {msg.modelUsed && <span className="text-cyan-500/70 font-mono">• {msg.modelUsed}</span>}
              </div>

              <div className={`p-3 max-w-[92%] text-xs font-mono leading-relaxed rounded-lg border shadow-sm ${
                msg.sender === 'user'
                  ? 'bg-cyan-950/30 border-cyan-500/30 text-cyan-200'
                  : 'bg-surface-container-low border-outline-variant text-on-surface'
              }`}>
                {/* Mentioned Files Badges */}
                {msg.mentionedFiles && msg.mentionedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {msg.mentionedFiles.map((mPath, mi) => (
                      <span key={mi} className="text-[9px] bg-cyan-950/80 text-cyan-300 border border-cyan-700/50 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <span>@{mPath}</span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="whitespace-pre-wrap">{msg.text}</div>

                {/* Proposed File Modifications Preview & Apply Trigger */}
                {msg.modifications && msg.modifications.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-outline-variant/40 space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-emerald-400 font-bold">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">edit_document</span>
                        <span>PROPOSED FILE EDITS ({msg.modifications.length})</span>
                      </span>
                      {msg.modifications.length > 1 && (
                        <button
                          onClick={() => {
                            msg.modifications.forEach((mod, mIdx) => {
                              onApplyModifications(mod.filePath, mod.newContent);
                              setAppliedModIds(prev => new Set(prev).add(`${idx}_${mIdx}`));
                            });
                          }}
                          className="text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded hover:bg-emerald-900 cursor-pointer font-mono"
                        >
                          ⚡ Apply All ({msg.modifications.length})
                        </button>
                      )}
                    </div>

                    {msg.modifications.map((mod, mIdx) => {
                      const modKey = `${idx}_${mIdx}`;
                      const isApplied = appliedModIds.has(modKey);
                      return (
                        <div key={mIdx} className="bg-[#0A0A0B] p-2.5 rounded border border-outline-variant/50 text-[10px] space-y-2">
                          <div className="text-cyan-300 font-bold flex items-center justify-between">
                            <span className="truncate">{mod.filePath}</span>
                            <span className="text-[9px] text-zinc-500 font-mono">
                              {mod.newContent ? `${mod.newContent.split('\n').length} lines` : ''}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            <button
                              onClick={() => {
                                onApplyModifications(mod.filePath, mod.newContent);
                                setAppliedModIds(prev => new Set(prev).add(modKey));
                              }}
                              className={`py-1.5 px-2 rounded font-bold transition-all cursor-pointer flex items-center justify-center gap-1 shadow ${
                                isApplied
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/80 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                                  : 'bg-cyan-950 text-cyan-300 border border-cyan-700/60 hover:bg-cyan-900'
                              }`}
                            >
                              <span className="material-symbols-outlined text-xs">
                                {isApplied ? 'check_circle' : 'task_alt'}
                              </span>
                              <span>{isApplied ? 'APPLIED' : 'APPLY EDITS'}</span>
                            </button>

                            <button
                              onClick={() => {
                                onApplyModifications(mod.filePath, mod.newContent);
                                setAppliedModIds(prev => new Set(prev).add(modKey));
                                if (onRunCode) {
                                  onRunCode(mod.newContent, mod.filePath);
                                } else if (onRunCommand) {
                                  onRunCommand(`python ${mod.filePath}`, mod.newContent, mod.filePath);
                                }
                              }}
                              className="py-1.5 px-2 rounded font-bold transition-all cursor-pointer flex items-center justify-center gap-1 shadow bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 border border-emerald-400/50"
                              title="Apply changes to workspace and execute immediately in interactive terminal"
                            >
                              <span className="material-symbols-outlined text-xs">play_arrow</span>
                              <span>APPLY & RUN</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Proposed Terminal Command & Script Execution Actions */}
                {((msg.terminalCommands && msg.terminalCommands.length > 0) || msg.runScript) && (
                  <div className="mt-3 pt-2.5 border-t border-cyan-500/30 space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-cyan-400 font-bold">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">terminal</span>
                        <span>TERMINAL EXECUTION ACTIONS</span>
                      </span>
                    </div>

                    {/* Dedicated Run Script Action */}
                    {msg.runScript && (
                      <div className="bg-[#0A0A0E] p-2.5 rounded border border-cyan-500/40 text-[10px] space-y-1.5">
                        <div className="text-cyan-300 font-bold flex items-center justify-between">
                          <span className="flex items-center gap-1 truncate">
                            <span className="material-symbols-outlined text-xs text-amber-400">play_circle</span>
                            <span className="truncate">{msg.runScript.filePath || msg.runScript.command || 'Execute Script'}</span>
                          </span>
                          {msg.runScript.command && (
                            <span className="text-[9px] text-zinc-500 font-mono">{msg.runScript.command}</span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            const cmdKey = `runscript_${idx}`;
                            if (onRunCommand && msg.runScript.command) {
                              onRunCommand(msg.runScript.command, msg.runScript.code, msg.runScript.filePath);
                            } else if (onRunCode && msg.runScript.code) {
                              onRunCode(msg.runScript.code, msg.runScript.filePath);
                            } else if (onRunCommand && msg.runScript.filePath) {
                              onRunCommand(`python ${msg.runScript.filePath}`);
                            }
                            setDispatchedCmdIds(prev => new Set(prev).add(cmdKey));
                          }}
                          className={`w-full py-1.5 px-2 rounded font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow ${
                            dispatchedCmdIds.has(`runscript_${idx}`)
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-600 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                              : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 border border-cyan-400/50'
                          }`}
                        >
                          <span className="material-symbols-outlined text-xs">
                            {dispatchedCmdIds.has(`runscript_${idx}`) ? 'done' : 'play_arrow'}
                          </span>
                          <span>
                            {dispatchedCmdIds.has(`runscript_${idx}`)
                              ? 'EXECUTED IN TERMINAL'
                              : `▶ RUN IN TERMINAL (${msg.runScript.filePath || msg.runScript.command || 'SCRIPT'})`}
                          </span>
                        </button>
                      </div>
                    )}

                    {/* Individual Terminal Commands */}
                    {msg.terminalCommands && msg.terminalCommands.map((cmdItem, cIdx) => {
                      const cmdStr = typeof cmdItem === 'string' ? cmdItem : (cmdItem.command || cmdItem.cmd || '');
                      if (!cmdStr) return null;
                      const cmdKey = `cmd_${idx}_${cIdx}`;
                      const isDispatched = dispatchedCmdIds.has(cmdKey);
                      return (
                        <div key={cIdx} className="bg-[#0A0A0E] p-2.5 rounded border border-cyan-500/30 text-[10px] space-y-1.5">
                          <div className="text-zinc-300 font-mono flex items-center justify-between">
                            <span className="truncate text-cyan-300 font-bold">$ {cmdStr}</span>
                          </div>
                          <button
                            onClick={() => {
                              if (onRunCommand) onRunCommand(cmdStr);
                              setDispatchedCmdIds(prev => new Set(prev).add(cmdKey));
                            }}
                            className={`w-full py-1.5 px-2 rounded font-bold font-mono transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow ${
                              isDispatched
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-600 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                                : 'bg-cyan-950 text-cyan-300 border border-cyan-700/60 hover:bg-cyan-900'
                            }`}
                          >
                            <span className="material-symbols-outlined text-xs">
                              {isDispatched ? 'check_circle' : 'terminal'}
                            </span>
                            <span>{isDispatched ? 'EXECUTED IN TERMINAL' : `▶ RUN IN TERMINAL`}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Proposed GitHub Upload / Push Action Card */}
                {msg.githubAction && (
                  <div className="mt-3 pt-2.5 border-t border-purple-500/30 space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-purple-400 font-bold">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">cloud_upload</span>
                        <span>GITHUB REPOSITORY UPLOAD</span>
                      </span>
                      {githubInfo?.username && (
                        <span className="text-[9px] text-zinc-400 font-mono">
                          @{githubInfo.username}
                        </span>
                      )}
                    </div>

                    {(() => {
                      const isPushing = pushingGitHubIdx === idx;
                      const pushResult = pushedGitHubResults[idx];
                      const pushError = githubErrorResults[idx];
                      const defaultRepo = (msg.githubAction.repoUrl || projectGithubRepoUrl || '').trim();
                      const currentInput = githubRepoUrlInputs[idx] !== undefined ? githubRepoUrlInputs[idx] : defaultRepo;

                      return (
                        <div className="bg-[#0D0B14] p-3 rounded-lg border border-purple-500/40 text-[10px] space-y-2.5">
                          {/* Target Repository Input / Badge */}
                          <div className="space-y-1">
                            <label className="text-[9px] text-zinc-400 uppercase font-bold flex justify-between">
                              <span>Target Repository</span>
                              <a
                                href="https://github.com/new"
                                target="_blank"
                                rel="noreferrer"
                                className="text-purple-400 hover:underline normal-case text-[9px]"
                              >
                                Create New Repo ↗
                              </a>
                            </label>
                            <input
                              type="text"
                              value={currentInput}
                              onChange={(e) => setGithubRepoUrlInputs(prev => ({ ...prev, [idx]: e.target.value }))}
                              placeholder="https://github.com/username/repository or username/repo"
                              disabled={isPushing || !!pushResult}
                              className="w-full bg-[#161220] border border-purple-500/30 p-2 text-[11px] text-white focus:outline-none focus:border-purple-400 font-mono rounded"
                            />
                          </div>

                          {/* Commit Message Info */}
                          <div className="text-[9px] text-zinc-400 font-mono flex items-center justify-between">
                            <span className="truncate">Commit: {msg.githubAction.commitMessage || `ObsidianIDE: Update ${projectTitle}`}</span>
                            <span className="text-purple-300 font-bold shrink-0">{files.length} files • main</span>
                          </div>

                          {/* Success Status Banner */}
                          {pushResult && (
                            <div className="p-2 bg-emerald-950/60 border border-emerald-500/60 rounded text-emerald-300 text-[10px] space-y-1">
                              <div className="flex items-center gap-1.5 font-bold">
                                <span className="material-symbols-outlined text-xs">check_circle</span>
                                <span>✓ Successfully Uploaded to GitHub!</span>
                              </div>
                              <div className="text-[9px] text-zinc-300 font-mono">
                                Pushed {pushResult.pushedFilesCount || files.length} files to branch {pushResult.branch || 'main'}.
                              </div>
                              {pushResult.repoUrl && (
                                <a
                                  href={pushResult.repoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:underline font-bold mt-1"
                                >
                                  <span>Open in GitHub</span>
                                  <span className="material-symbols-outlined text-xs">open_in_new</span>
                                </a>
                              )}
                            </div>
                          )}

                          {/* Error Banner */}
                          {pushError && (
                            <div className="p-2 bg-rose-950/60 border border-rose-500/60 rounded text-rose-300 text-[10px] space-y-1">
                              <div className="flex items-center gap-1 font-bold">
                                <span className="material-symbols-outlined text-xs">error</span>
                                <span>Upload Failed</span>
                              </div>
                              <p className="text-[9px] text-rose-200">{pushError}</p>
                            </div>
                          )}

                          {/* Action Trigger Button */}
                          {!pushResult && (
                            <button
                              onClick={async () => {
                                const targetRepo = (currentInput || defaultRepo).trim();
                                if (!targetRepo) {
                                  setGithubErrorResults(prev => ({ ...prev, [idx]: 'Please enter a valid GitHub repository link (e.g. https://github.com/username/repo)' }));
                                  return;
                                }
                                setPushingGitHubIdx(idx);
                                setGithubErrorResults(prev => ({ ...prev, [idx]: null }));
                                try {
                                  if (!onPushToGitHub) {
                                    throw new Error('GitHub push handler is not connected in workspace.');
                                  }
                                  const res = await onPushToGitHub({
                                    repoUrl: targetRepo,
                                    commitMessage: msg.githubAction.commitMessage || `Update from ObsidianIDE AI Agent (${new Date().toLocaleDateString()})`,
                                    branch: msg.githubAction.branch || 'main'
                                  });
                                  setPushedGitHubResults(prev => ({ ...prev, [idx]: res }));
                                } catch (err) {
                                  console.error("GitHub upload error:", err);
                                  setGithubErrorResults(prev => ({ ...prev, [idx]: err.message || 'Failed to upload project to GitHub' }));
                                } finally {
                                  setPushingGitHubIdx(null);
                                }
                              }}
                              disabled={isPushing}
                              className={`w-full py-2 px-3 rounded font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow ${
                                isPushing
                                  ? 'bg-purple-950 text-purple-300 border border-purple-600 animate-pulse'
                                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 border border-purple-400/50 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                              }`}
                            >
                              <span className="material-symbols-outlined text-xs">
                                {isPushing ? 'sync' : 'rocket_launch'}
                              </span>
                              <span>
                                {isPushing
                                  ? 'COMMITTING & UPLOADING TO GITHUB...'
                                  : `🚀 UPLOAD ALL PROJECT FILES TO GITHUB`}
                              </span>
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono animate-pulse p-2 bg-cyan-950/20 border border-cyan-900/30 rounded">
              <span className="material-symbols-outlined text-sm animate-spin">sync</span>
              <span>Agent reasoning with whole project context...</span>
            </div>
          )}
        </div>
      )}

      {/* Floating "@" File Mention Suggestion Dropdown */}
      {mentionQuery !== null && matchingFiles.length > 0 && (
        <div className="mx-2 mb-1 p-1 bg-[#16161A] border border-cyan-500/40 rounded-lg shadow-2xl z-20 space-y-0.5 animate-fade-in max-h-48 overflow-y-auto">
          <div className="px-2 py-1 text-[9px] font-bold text-cyan-400 uppercase tracking-wider border-b border-white/10 flex items-center justify-between">
            <span>Reference Project File (@)</span>
            <span className="text-zinc-500">↑↓ to navigate, ↵ to insert</span>
          </div>
          {matchingFiles.map((file, idx) => (
            <div
              key={file.filePath || idx}
              onClick={() => handleSelectMention(file.filePath || file.fileName)}
              className={`px-2 py-1.5 rounded text-xs flex items-center justify-between cursor-pointer transition-colors ${
                idx === mentionIndex 
                  ? 'bg-cyan-500 text-neutral-950 font-bold' 
                  : 'text-zinc-300 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className="material-symbols-outlined text-xs">description</span>
                <span className="truncate">{file.filePath || file.fileName}</span>
              </div>
              <span className={`text-[9px] uppercase px-1 rounded ${
                idx === mentionIndex ? 'bg-neutral-900 text-cyan-400' : 'text-zinc-500 bg-zinc-800'
              }`}>
                {file.fileType || (file.filePath ? file.filePath.split('.').pop() : 'file')}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Mentioned Files Chips Preview */}
      {activeMentionedFiles.length > 0 && (
        <div className="px-2.5 py-1 bg-[#121215] border-t border-outline-variant/40 flex flex-wrap gap-1 items-center">
          <span className="text-[9px] text-zinc-500 font-mono">Referenced:</span>
          {activeMentionedFiles.map((mPath, mi) => (
            <span key={mi} className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-1.5 py-0.5 rounded flex items-center gap-1">
              <span>@{mPath}</span>
            </span>
          ))}
        </div>
      )}

      {/* Live Terminal Output Vision Attachment Status */}
      {terminalOutput && terminalOutput.trim().length > 0 && (
        <div className="px-2.5 py-1 bg-[#0E1117] border-t border-cyan-500/20 flex justify-between items-center text-[10px]">
          <div className="flex items-center gap-1.5 min-w-0 text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="material-symbols-outlined text-xs shrink-0">terminal</span>
            <span className="truncate font-sans font-medium text-slate-300">
              Terminal Output Connected ({terminalOutput.trim().split('\n').length} lines)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIncludeTerminalLogs(prev => !prev)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border transition-colors cursor-pointer shrink-0 ${
              includeTerminalLogs
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
                : 'bg-white/5 text-zinc-500 border-white/10 hover:text-zinc-400'
            }`}
            title="Toggle whether recent terminal logs are sent to the AI assistant"
          >
            {includeTerminalLogs ? '✓ Attached' : 'Detached'}
          </button>
        </div>
      )}

      {/* Prompt Input Form */}
      <form onSubmit={handleSendPrompt} className="p-2 border-t border-outline-variant bg-surface-container-low flex gap-2 relative">
        <textarea 
          ref={inputRef}
          rows={2}
          value={inputPrompt}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask AI or type @ to mention files..."
          className="flex-1 bg-[#141417] border border-outline-variant p-2 text-xs text-on-surface focus:outline-none focus:border-cyan-400 font-mono resize-none rounded"
        />
        <button
          type="submit"
          disabled={!inputPrompt.trim() || isSending}
          className="bg-surface-tint text-neutral-900 px-3.5 py-2 font-bold hover:bg-cyan-400 transition-colors disabled:opacity-50 cursor-pointer self-end rounded flex items-center justify-center shadow"
        >
          <span className="material-symbols-outlined text-sm">send</span>
        </button>
      </form>

      {/* Unrestricted Secure API Key Vault Modal */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#121216] border border-cyan-500/30 w-full max-w-md p-6 rounded-xl shadow-2xl flex flex-col gap-4 font-mono select-none">
            <div className="flex justify-between items-center border-b border-outline-variant/40 pb-2.5">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                <span className="material-symbols-outlined text-base">vpn_key</span>
                <span>API Key Vault</span>
              </div>
              <button 
                onClick={() => setIsKeyModalOpen(false)} 
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <p className="text-xs text-zinc-300 font-sans leading-relaxed">
              Paste your Google Gemini API Key below. You can freely copy, paste, and test your key directly to verify live response and discover all working models.
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-zinc-400 font-bold uppercase flex justify-between">
                <span>Google Gemini API Key</span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 hover:underline text-[10px] normal-case"
                >
                  Get Free API Key ↗
                </a>
              </label>
              
              {/* Unrestricted Input Box: Copy and paste freely */}
              <input
                type="text"
                value={vaultKeyInput}
                onChange={(e) => setVaultKeyInput(e.target.value)}
                placeholder="AIzaSy... or paste key here"
                className="bg-[#0A0A0C] border border-cyan-500/30 p-2.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono rounded-lg transition-colors"
              />
            </div>

            {/* Live Key Validation Feedback */}
            {keyValidationStatus && (
              <div className={`p-3 rounded-lg text-xs leading-relaxed flex items-start gap-2 border ${
                keyValidationStatus.loading
                  ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
                  : keyValidationStatus.valid
                    ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
              }`}>
                {keyValidationStatus.loading ? (
                  <span className="material-symbols-outlined text-sm animate-spin shrink-0 mt-0.5">sync</span>
                ) : keyValidationStatus.valid ? (
                  <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">check_circle</span>
                ) : (
                  <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">error</span>
                )}
                <span>
                  {keyValidationStatus.loading 
                    ? 'Testing key with Google Gemini API & discovering models...' 
                    : keyValidationStatus.valid 
                      ? keyValidationStatus.message 
                      : keyValidationStatus.error}
                </span>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-outline-variant/40">
              <button
                type="button"
                onClick={handleTestKeyInVault}
                disabled={keyValidationStatus?.loading || !vaultKeyInput.trim()}
                className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-xs">network_check</span>
                <span>Test & Discover Models</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsKeyModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveVaultKey}
                  className="bg-cyan-500 text-neutral-950 px-4 py-1.5 text-xs font-bold hover:bg-cyan-400 rounded-lg cursor-pointer transition-colors shadow"
                >
                  Save & Apply Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default AgenticAIChatSidebar;

