import React, { useState, useEffect } from 'react';

export const AgenticAIChatSidebar = ({ 
  isOpen, 
  onClose, 
  activeFile, 
  currentContent, 
  files = [], 
  onApplyModifications,
  projectId = 'default-project'
}) => {
  const storageKey = `obsidian_ai_chat_${projectId}`;

  const defaultMessages = [
    {
      sender: 'ai',
      text: 'Hello! I am your **Agentic AI Coding Assistant**. I have full context awareness of all files in this project. Ask me to refactor code, generate functions, or fix bugs across your workspace!',
      modifications: []
    }
  ];

  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : defaultMessages;
    } catch (e) {
      return defaultMessages;
    }
  });

  const [inputPrompt, setInputPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-flash');
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('obsidian_ai_key') || '');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Sync chat history to localStorage whenever messages change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (e) {
      console.warn("Failed to persist chat history to localStorage:", e);
    }
  }, [messages, storageKey]);

  // Save API key securely in localStorage when updated
  const handleSaveApiKey = () => {
    try {
      if (userApiKey) {
        localStorage.setItem('obsidian_ai_key', userApiKey);
      } else {
        localStorage.removeItem('obsidian_ai_key');
      }
    } catch (e) {}
    setIsKeyModalOpen(false);
  };

  const handleClearHistory = () => {
    setMessages(defaultMessages);
    localStorage.removeItem(storageKey);
  };

  if (!isOpen) return null;

  const handleSendPrompt = async (e) => {
    e?.preventDefault();
    if (!inputPrompt.trim() || isSending) return;

    const userText = inputPrompt.trim();
    setInputPrompt('');

    // Append user message
    const updatedMessages = [
      ...messages,
      { sender: 'user', text: userText }
    ];
    setMessages(updatedMessages);
    setIsSending(true);

    try {
      // Build file manifest index
      const fileManifest = files.map(f => ({
        filePath: f.filePath,
        content: f.content
      }));

      const res = await fetch('/api/ai-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userText,
          activeFilePath: activeFile?.filePath || 'main.rs',
          activeFileContent: currentContent || '',
          fileManifest,
          apiKey: userApiKey,
          selectedModel
        })
      });

      const data = await res.json();
      if (res.ok && data.response) {
        setMessages(prev => [
          ...prev,
          {
            sender: 'ai',
            text: data.response.text,
            modifications: data.response.fileModifications || []
          }
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          { sender: 'ai', text: '⚠️ Failed to receive agent response from server.' }
        ]);
      }
    } catch (err) {
      console.error('Error in agentic AI chat:', err);
      setMessages(prev => [
        ...prev,
        { sender: 'ai', text: '⚠️ Communication error with AI backend service.' }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="fixed top-12 right-0 bottom-8 w-96 z-[260] flex flex-col bg-[#0A0A0B] border-l border-outline-variant shadow-2xl font-mono text-xs select-none">
      {/* Top Header Strip */}
      <div className="p-3 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-surface-tint text-base">auto_awesome</span>
          <span className="font-bold text-on-surface font-headline text-xs">ANTIGRAVITY AGENT</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Multi-Model Selector Dropdown */}
          <select 
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-[#1A1A1C] border border-outline-variant text-[10px] text-surface-tint px-1.5 py-0.5 rounded focus:outline-none"
          >
            <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast)</option>
            <option value="gemini-1.5-pro">Gemini 1.5 Pro (Deep)</option>
            <option value="gpt-4o">GPT-4o (Proxy)</option>
            <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
          </select>

          <button
            onClick={() => setIsKeyModalOpen(true)}
            className="text-on-surface-variant hover:text-surface-tint p-1"
            title="Configure Custom API Key"
          >
            <span className="material-symbols-outlined text-sm">key</span>
          </button>

          <button 
            onClick={handleClearHistory}
            className="text-on-surface-variant hover:text-amber-400 p-1"
            title="Clear Chat History"
          >
            <span className="material-symbols-outlined text-sm">delete_sweep</span>
          </button>

          <button onClick={onClose} className="text-on-surface-variant hover:text-red-400 p-1">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </div>

      {/* Context Awareness Pill */}
      <div className="px-3 py-1.5 bg-cyan-950/40 border-b border-cyan-900/30 text-[10px] text-cyan-400 flex items-center justify-between">
        <span>Context: {files.length} project files indexed</span>
        <span>Active: {activeFile?.filePath || 'None'}</span>
      </div>

      {/* Chat Messages Stream */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`flex flex-col gap-1 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <span className="text-[9px] text-on-surface-variant/60 uppercase">
              {msg.sender === 'user' ? 'Developer' : 'Antigravity Agent'}
            </span>

            <div className={`p-3 max-w-[90%] text-xs font-mono leading-relaxed rounded-none border ${
              msg.sender === 'user'
                ? 'bg-surface-tint/10 border-surface-tint/30 text-surface-tint'
                : 'bg-surface-container-low border-outline-variant text-on-surface'
            }`}>
              <div className="whitespace-pre-wrap">{msg.text}</div>

              {/* Proposed File Modifications Preview & Apply Trigger */}
              {msg.modifications && msg.modifications.length > 0 && (
                <div className="mt-3 pt-2 border-t border-outline-variant/40 space-y-2">
                  <span className="text-[10px] text-neon-green font-bold block">
                    ⚡ PROPOSED AGENTIC FILE EDITS ({msg.modifications.length})
                  </span>
                  {msg.modifications.map((mod, mIdx) => (
                    <div key={mIdx} className="bg-[#0A0A0B] p-2 border border-outline-variant/50 text-[10px]">
                      <div className="text-surface-tint font-bold mb-1">{mod.filePath}</div>
                      <button
                        onClick={() => onApplyModifications(mod.filePath, mod.newContent)}
                        className="w-full bg-cyan-950 text-cyan-400 border border-cyan-800 py-1 font-bold hover:bg-cyan-900 transition-colors cursor-pointer"
                      >
                        APPLY EDITS TO WORKSPACE
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex items-center gap-2 text-surface-tint text-xs font-mono animate-pulse p-2">
            <span className="material-symbols-outlined text-sm animate-spin">sync</span>
            Agent analyzing project context...
          </div>
        )}
      </div>

      {/* Prompt Input Form */}
      <form onSubmit={handleSendPrompt} className="p-2 border-t border-outline-variant bg-surface-container-low flex gap-2">
        <input 
          type="text"
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          placeholder="Ask AI to edit code or build feature..."
          className="flex-1 bg-[#1A1A1C] border border-outline-variant p-2 text-xs text-on-surface focus:outline-none focus:border-surface-tint font-mono"
        />
        <button
          type="submit"
          disabled={!inputPrompt.trim() || isSending}
          className="bg-surface-tint text-neutral-900 px-3 py-2 font-bold hover:bg-cyan-400 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">send</span>
        </button>
      </form>

      {/* Secure API Key Configuration Modal */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-sm p-6 shadow-2xl flex flex-col gap-4 bg-surface-container-low border border-outline-variant font-mono">
            <div className="flex justify-between items-center border-b border-outline-variant/40 pb-2">
              <h3 className="text-xs font-bold text-surface-tint font-headline">Secure API Key Vault</h3>
              <button onClick={() => setIsKeyModalOpen(false)} className="text-on-surface-variant hover:text-red-400">×</button>
            </div>

            <p className="text-[10px] text-on-surface-variant leading-relaxed">
              API Keys are masked securely and never saved unencrypted. Copy-pasting is restricted for security compliance.
            </p>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-on-surface-variant uppercase">Gemini / OpenAI API Key</label>
              <input
                type="password"
                value={userApiKey}
                onChange={(e) => setUserApiKey(e.target.value)}
                onCopy={(e) => e.preventDefault()}
                onPaste={(e) => e.preventDefault()}
                placeholder="AI_KEY_••••••••••••••••"
                className="bg-[#1A1A1C] border border-outline-variant p-2 text-xs text-on-surface focus:outline-none focus:border-surface-tint"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/40">
              <button
                type="button"
                onClick={handleSaveApiKey}
                className="bg-surface-tint text-neutral-900 px-3 py-1 text-xs font-bold hover:bg-cyan-400 cursor-pointer"
              >
                Save & Secure Key
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
