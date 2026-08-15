import React, { useState, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';

let inlineProviderRegistered = false;
let lastRequestTime = 0;

export const MonacoEditorCanvas = ({ 
  openFiles = [], 
  activeFile, 
  onSelectTab, 
  onCloseTab, 
  currentContent, 
  onChangeContent, 
  onSaveFile,
  isSaving,
  isUnsaved,
  isReadOnly = false,
  remoteCollaborators = [],
  onCursorChange,
  currentUserEmail = '',
  showActiveCollaborators = true
}) => {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationIdsRef = useRef([]);
  const contentWidgetsRef = useRef(new Map()); // email -> widget instance

  // AI Inline Suggestive Writing State (Ctrl+I)
  const [isSuggestivePromptOpen, setIsSuggestivePromptOpen] = useState(false);
  const [suggestivePromptText, setSuggestivePromptText] = useState('');
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [inlineSuggestionsEnabled, setInlineSuggestionsEnabled] = useState(true);
  const [copilotStatus, setCopilotStatus] = useState('Active'); // 'Active' | 'Thinking...' | 'Disabled'

  const getLanguageForFile = (filePath = '') => {
    const lower = (filePath || '').toLowerCase();
    const ext = lower.split('.').pop() || '';

    switch (ext) {
      case 'cpp':
      case 'cc':
      case 'cxx':
      case 'hpp':
      case 'hxx':
      case 'h':
        return 'cpp';
      case 'c':
        return 'c';
      case 'java':
        return 'java';
      case 'cs':
        return 'csharp';
      case 'py':
      case 'pyw':
        return 'python';
      case 'rs':
        return 'rust';
      case 'js':
      case 'jsx':
      case 'mjs':
      case 'cjs':
        return 'javascript';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'go':
        return 'go';
      case 'sh':
      case 'bash':
      case 'zsh':
        return 'shell';
      case 'ps1':
        return 'powershell';
      case 'html':
      case 'htm':
        return 'html';
      case 'css':
      case 'scss':
      case 'less':
        return 'css';
      case 'json':
        return 'json';
      case 'toml':
      case 'ini':
      case 'env':
        return 'ini';
      case 'yaml':
      case 'yml':
        return 'yaml';
      case 'xml':
      case 'svg':
        return 'xml';
      case 'sql':
        return 'sql';
      case 'md':
      case 'markdown':
        return 'markdown';
      default:
        return 'plaintext';
    }
  };

  const handleEditorWillMount = (monaco) => {
    // 1. Custom Dark Substrate Palette Theme
    monaco.editor.defineTheme('obsidian-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'C084FC', fontStyle: 'bold' },
        { token: 'keyword.directive', foreground: 'F43F5E', fontStyle: 'bold' },
        { token: 'keyword.directive.include', foreground: 'F43F5E', fontStyle: 'bold' },
        { token: 'string', foreground: '34D399' },
        { token: 'string.escape', foreground: 'FBBF24' },
        { token: 'number', foreground: 'FDE68A' },
        { token: 'type', foreground: '38BDF8' },
        { token: 'class', foreground: '60A5FA', fontStyle: 'bold' },
        { token: 'function', foreground: '7DD3FC' },
        { token: 'identifier', foreground: 'E0E7FF' },
        { token: 'comment', foreground: '64748B', fontStyle: 'italic' },
        { token: 'operator', foreground: '38BDF8' }
      ],
      colors: {
        'editor.background': '#07080B',
        'editor.foreground': '#E0E7FF',
        'editor.lineHighlightBackground': '#18181B44',
        'editorLineNumber.foreground': '#52525B',
        'editorLineNumber.activeForeground': '#38BDF8',
        'editorCursor.foreground': '#38BDF8',
        'editor.selectionBackground': '#38BDF833',
        'editor.inactiveSelectionBackground': '#38BDF81A',
        'editorGutter.background': '#07080B',
        'editorWidget.background': '#0D0E14',
        'editorWidget.border': '#27272A',
        'input.background': '#18181B',
        'input.foreground': '#E0E7FF',
        'scrollbarSlider.background': '#27272A80',
        'scrollbarSlider.hoverBackground': '#3F3F4680',
        'scrollbarSlider.activeBackground': '#52525B80'
      }
    });
    monaco.editor.setTheme('obsidian-dark');

    // 2. Register Global AI Inline Completions Provider (Ghost Text like GitHub Copilot)
    if (!inlineProviderRegistered) {
      inlineProviderRegistered = true;
      monaco.languages.registerInlineCompletionsProvider({ pattern: '**' }, {
        provideInlineCompletions: async (model, position, context, token) => {
          if (!inlineSuggestionsEnabled || isReadOnly) {
            return { items: [] };
          }

          const now = Date.now();
          if (now - lastRequestTime < 450) {
            return { items: [] };
          }
          lastRequestTime = now;

          const textBeforeCursor = model.getValueInRange({
            startLineNumber: Math.max(1, position.lineNumber - 30),
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column
          });

          const textAfterCursor = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: Math.min(model.getLineCount(), position.lineNumber + 10),
            endColumn: 1
          });

          const currentLineContent = model.getLineContent(position.lineNumber);

          try {
            setCopilotStatus('Thinking...');
            const res = await fetch('/api/ai/inline-completion', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prefix: textBeforeCursor,
                suffix: textAfterCursor,
                language: model.getLanguageId(),
                currentLine: currentLineContent
              })
            });

            const data = await res.json();
            setCopilotStatus('Active');

            if (data?.completion && data.completion.trim()) {
              return {
                items: [
                  {
                    insertText: data.completion,
                    range: new monaco.Range(
                      position.lineNumber,
                      position.column,
                      position.lineNumber,
                      position.column
                    )
                  }
                ]
              };
            }
          } catch (err) {
            setCopilotStatus('Active');
          }

          return { items: [] };
        },
        freeInlineCompletions: () => {}
      });
    }
  };

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    monaco.editor.setTheme('obsidian-dark');

    // Bind Ctrl+I / Cmd+I for Inline Suggestive Writing
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
      setIsSuggestivePromptOpen(true);
    });

    // Listen to local cursor position changes and broadcast
    editor.onDidChangeCursorPosition((e) => {
      if (onCursorChange && e.position) {
        onCursorChange({
          lineNumber: e.position.lineNumber,
          column: e.position.column
        });
      }
    });
  };

  // ── Multi-Collaborator Remote Cursors & Floating Name Widgets ───────────────
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    // Filter peers active in the same file (excluding self)
    const activePeersOnSameFile = (showActiveCollaborators ? remoteCollaborators : []).filter(c => {
      const isSelf = currentUserEmail && c.email && c.email.toLowerCase() === currentUserEmail.toLowerCase();
      const isSameFile = activeFile && (
        c.activeFilePath === activeFile.filePath ||
        c.activeFilePath === activeFile.fileName ||
        (activeFile.filePath && c.activeFilePath && c.activeFilePath.endsWith(activeFile.filePath))
      );
      return !isSelf && isSameFile;
    });

    // 1. Update Monaco Line/Glyph Decorations
    const newDecorations = activePeersOnSameFile.map(collab => {
      const line = Number(collab.cursor?.lineNumber) || 1;
      const col = Number(collab.cursor?.column) || 1;
      const cleanClass = `remote-cursor-${collab.email.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // Inject dynamic CSS rule for this user's cursor color if not present
      const styleId = `style-${cleanClass}`;
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        const color = collab.color || '#00DCE5';
        style.innerHTML = `
          .${cleanClass} {
            border-left: 2px solid ${color} !important;
            margin-left: -1px;
            animation: remoteCursorBlink 1s ease-in-out infinite;
          }
          @keyframes remoteCursorBlink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `;
        document.head.appendChild(style);
      }

      return {
        range: new monaco.Range(line, col, line, col),
        options: {
          className: cleanClass,
          hoverMessage: { 
            value: `**${collab.displayName || collab.email}** (${collab.role || 'EDITOR'})\n\n📍 Line ${line}, Col ${col}` 
          }
        }
      };
    });

    try {
      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, newDecorations);
    } catch (e) {}

    // 2. Update / Reconcile Floating Name Tag Content Widgets
    const activeWidgetEmails = new Set(activePeersOnSameFile.map(c => c.email));

    // Remove widgets for peers who left or moved to another file
    for (const [email, widget] of contentWidgetsRef.current.entries()) {
      if (!activeWidgetEmails.has(email)) {
        try {
          editor.removeContentWidget(widget);
        } catch (e) {}
        contentWidgetsRef.current.delete(email);
      }
    }

    // Add or update widgets for active peers
    activePeersOnSameFile.forEach(collab => {
      const line = Number(collab.cursor?.lineNumber) || 1;
      const col = Number(collab.cursor?.column) || 1;
      const name = collab.displayName || collab.email.split('@')[0];
      const initial = (name.charAt(0) || 'U').toUpperCase();
      const color = collab.color || '#00DCE5';
      const widgetId = `remote-name-widget-${collab.email}`;

      let widget = contentWidgetsRef.current.get(collab.email);

      if (!widget) {
        const domNode = document.createElement('div');
        domNode.className = 'remote-cursor-floating-badge';
        domNode.style.pointerEvents = 'none';
        domNode.style.zIndex = '100';
        domNode.style.transform = 'translateY(-120%)';
        domNode.style.transition = 'top 0.12s cubic-bezier(0.16, 1, 0.3, 1), left 0.12s cubic-bezier(0.16, 1, 0.3, 1)';

        widget = {
          getId: () => widgetId,
          getDomNode: () => domNode,
          getPosition: () => ({
            position: { lineNumber: line, column: col },
            preference: [
              monaco.editor.ContentWidgetPositionPreference.ABOVE,
              monaco.editor.ContentWidgetPositionPreference.BELOW
            ]
          })
        };

        contentWidgetsRef.current.set(collab.email, widget);
        try {
          editor.addContentWidget(widget);
        } catch (e) {}
      }

      // Update widget DOM representation
      const domNode = widget.getDomNode();
      domNode.innerHTML = `
        <div style="
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: ${color};
          color: #07080B;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 10px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 4px 4px 4px 0px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.6);
          white-space: nowrap;
          user-select: none;
          letter-spacing: 0.02em;
        ">
          <span style="display: inline-flex; align-items: center; justify-content: center; width: 13px; height: 13px; border-radius: 50%; background: #07080B; color: ${color}; font-size: 8px; font-weight: 900;">
            ${initial}
          </span>
          <span>${name}</span>
          <span style="opacity: 0.8; font-size: 9px; font-family: monospace;">Ln ${line}</span>
        </div>
      `;

      try {
        editor.layoutContentWidget(widget);
      } catch (e) {}
    });

    return () => {
      // Cleanup widgets on unmount or file change
      for (const [, widget] of contentWidgetsRef.current.entries()) {
        try {
          editor.removeContentWidget(widget);
        } catch (e) {}
      }
      contentWidgetsRef.current.clear();
      try {
        decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
      } catch (e) {}
    };
  }, [remoteCollaborators, activeFile, showActiveCollaborators, currentUserEmail]);

  // Synchronize Monaco editor content whenever external currentContent changes
  useEffect(() => {
    if (editorRef.current && currentContent !== undefined) {
      const editorValue = editorRef.current.getValue();
      if (editorValue !== currentContent) {
        const position = editorRef.current.getPosition();
        editorRef.current.setValue(currentContent);
        if (position) {
          try {
            editorRef.current.setPosition(position);
          } catch (e) {}
        }
      }
    }
  }, [currentContent]);

  // ── Handle Inline Suggestive Writing Submit ─────────────────────────────────
  const handleSuggestiveWriteSubmit = async (e) => {
    e?.preventDefault();
    if (!suggestivePromptText.trim() || isGeneratingSuggestion) return;

    setIsGeneratingSuggestion(true);
    setGeneratedCode('');

    try {
      const language = activeFile ? getLanguageForFile(activeFile.filePath) : 'javascript';
      const selection = editorRef.current?.getSelection();
      const selectedText = selection ? editorRef.current?.getModel()?.getValueInRange(selection) : '';

      const res = await fetch('/api/ai/suggestive-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: suggestivePromptText.trim(),
          language,
          selectedText,
          currentFile: activeFile?.filePath
        })
      });

      const data = await res.json();
      if (data?.code) {
        setGeneratedCode(data.code);
      }
    } catch (err) {
      console.error('Suggestive write error:', err);
    } finally {
      setIsGeneratingSuggestion(false);
    }
  };

  const handleApplySuggestion = () => {
    if (!generatedCode || !editorRef.current) return;
    const editor = editorRef.current;
    const selection = editor.getSelection();

    if (selection && !selection.isEmpty()) {
      editor.executeEdits('ai-suggestive', [{
        range: selection,
        text: generatedCode,
        forceMoveMarkers: true
      }]);
    } else {
      const position = editor.getPosition();
      editor.executeEdits('ai-suggestive', [{
        range: new monacoRef.current.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: generatedCode,
        forceMoveMarkers: true
      }]);
    }

    setIsSuggestivePromptOpen(false);
    setSuggestivePromptText('');
    setGeneratedCode('');
  };

  // Active peers on this specific file for status bar
  const sameFilePeers = (remoteCollaborators || []).filter(c => 
    c.email && currentUserEmail && c.email.toLowerCase() !== currentUserEmail.toLowerCase() &&
    activeFile && (c.activeFilePath === activeFile.filePath || c.activeFilePath === activeFile.fileName)
  );

  return (
    <section className="flex-1 flex flex-col h-full bg-[#07080B] relative overflow-hidden select-none">
      {/* Tab Navigation Header */}
      <div className="h-10 bg-[#0B0C10] border-b border-white/[0.08] flex items-center justify-between px-2 shrink-0 select-none overflow-x-auto no-scrollbar relative z-10">
        <div className="flex items-center gap-1.5 h-full overflow-x-auto no-scrollbar">
          {openFiles.length === 0 ? (
            <div className="text-zinc-400 text-xs px-3 py-1.5 flex items-center gap-1.5 italic font-sans">
              <span className="material-symbols-outlined text-sm text-zinc-400">code_off</span>
              <span>No active files open</span>
            </div>
          ) : (
            openFiles.map((file) => {
              const isActive = activeFile?.fileId === file.fileId || activeFile?.filePath === file.filePath;
              return (
                <div
                  key={file.fileId || file.filePath}
                  onClick={() => onSelectTab(file)}
                  className={`h-7 px-2.5 rounded flex items-center gap-2 cursor-pointer transition-all text-xs font-mono select-none group border ${
                    isActive
                      ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 font-semibold shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                      : 'bg-white/[0.02] text-zinc-400 border-white/[0.04] hover:bg-white/[0.06] hover:text-zinc-200'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm text-cyan-400/80">description</span>
                  <span className="truncate max-w-[140px]">{file.fileName || file.filePath?.split('/').pop()}</span>
                  
                  {/* Tab Unsaved Indicator */}
                  {isActive && isUnsaved && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24] shrink-0" title="Unsaved buffer changes" />
                  )}

                  {/* Close Tab Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(file);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-white p-0.5 rounded transition-opacity"
                    title="Close Tab"
                  >
                    <span className="material-symbols-outlined text-xs">close</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Right Tab Controls: Active collaborators on this file chip */}
        {sameFilePeers.length > 0 && (
          <div className="flex items-center gap-1.5 bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded-full text-[10px] text-cyan-200">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
            <span>{sameFilePeers.length} collaborator{sameFilePeers.length > 1 ? 's' : ''} on this file:</span>
            <div className="flex items-center -space-x-1">
              {sameFilePeers.map(p => (
                <div 
                  key={p.email} 
                  className="w-4 h-4 rounded-full text-[9px] font-bold text-black flex items-center justify-center border border-black shadow"
                  style={{ backgroundColor: p.color || '#00DCE5' }}
                  title={`${p.displayName} (${p.email}) - Line ${p.cursor?.lineNumber || 1}`}
                >
                  {(p.displayName?.charAt(0) || 'U').toUpperCase()}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Editor Main Canvas */}
      <div className="flex-1 relative w-full h-full overflow-hidden bg-[#07080B]">
        {activeFile ? (
          <Editor
            height="100%"
            language={getLanguageForFile(activeFile.filePath)}
            value={currentContent}
            onChange={(val) => onChangeContent(val || '')}
            beforeMount={handleEditorWillMount}
            onMount={handleEditorDidMount}
            theme="obsidian-dark"
            options={{
              fontSize: 13,
              fontFamily: "'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace",
              fontLigatures: true,
              lineHeight: 20,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              smoothScrolling: true,
              automaticLayout: true,
              readOnly: isReadOnly,
              minimap: { enabled: true, side: 'right', renderCharacters: false },
              scrollBeyondLastLine: false,
              renderWhitespace: 'selection',
              tabSize: 2,
              wordWrap: 'on',
              folding: true,
              bracketPairColorization: { enabled: true },
              suggest: {
                showKeywords: true,
                showSnippets: true,
                preview: true
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 space-y-3 font-mono">
            <span className="material-symbols-outlined text-5xl text-zinc-400">code_blocks</span>
            <p className="text-sm">Select a file from the explorer to begin coding</p>
          </div>
        )}

        {/* AI Inline Suggestive Writing Floating Modal (Ctrl+I) */}
        {isSuggestivePromptOpen && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 w-full max-w-xl bg-[#0F1117]/98 backdrop-blur-2xl border border-purple-500/40 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] p-4 z-50 animate-fade-in font-sans">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2 text-purple-300 font-semibold text-xs">
                <span className="material-symbols-outlined text-sm text-purple-400">auto_fix_high</span>
                <span>AI Suggestive Writing (Neural Copilot)</span>
              </div>
              <button 
                onClick={() => setIsSuggestivePromptOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-xs">close</span>
              </button>
            </div>

            <form onSubmit={handleSuggestiveWriteSubmit} className="space-y-3">
              <input
                type="text"
                value={suggestivePromptText}
                onChange={(e) => setSuggestivePromptText(e.target.value)}
                placeholder="e.g. 'Write a function to perform binary search in O(log n)'..."
                className="w-full bg-black/40 border border-purple-500/30 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-400 font-mono"
                autoFocus
              />

              {generatedCode && (
                <div className="max-h-48 overflow-y-auto bg-black/60 border border-white/[0.08] rounded-lg p-3 text-xs font-mono text-emerald-300">
                  <pre>{generatedCode}</pre>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-[10px] text-zinc-500 font-mono">Press Enter to generate</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSuggestivePromptOpen(false)}
                    className="px-3 py-1 text-zinc-400 hover:text-white rounded hover:bg-white/5 cursor-pointer text-[11px]"
                  >
                    Cancel
                  </button>
                  {generatedCode ? (
                    <button
                      type="button"
                      onClick={handleApplySuggestion}
                      className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded font-bold cursor-pointer text-[11px]"
                    >
                      Apply Code
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={isGeneratingSuggestion || !suggestivePromptText.trim()}
                      className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 rounded font-bold disabled:opacity-40 cursor-pointer text-[11px]"
                    >
                      {isGeneratingSuggestion ? 'Generating...' : 'Generate'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Editor Action Bar (Atomic Save Trigger & AI Copilot Status) */}
      <div className="h-9 bg-[#0D0E14] border-t border-white/[0.08] flex items-center justify-between px-3 shrink-0 font-mono text-xs">
        {/* Left: Sync Status & Copilot Status */}
        <div className="flex items-center gap-4">
          <span className="text-zinc-400 flex items-center gap-1.5 truncate text-[11px]">
            <span className={`w-1.5 h-1.5 rounded-full ${isReadOnly ? 'bg-purple-400' : isUnsaved ? 'bg-amber-400 shadow-[0_0_6px_#fbbf24]' : 'bg-emerald-400 shadow-[0_0_6px_#34d399]'}`}></span>
            {isReadOnly 
              ? 'Read-only buffer protected' 
              : isUnsaved 
                ? 'Unsaved changes' 
                : 'Workspace synchronized'}
          </span>

          {/* AI Inline Copilot Status Pill */}
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-zinc-400 bg-white/[0.03] px-2 py-0.5 rounded border border-white/[0.06]">
            <span className={`w-1.5 h-1.5 rounded-full ${inlineSuggestionsEnabled ? 'bg-cyan-400 shadow-[0_0_6px_#06b6d4]' : 'bg-zinc-600'}`}></span>
            <span>AI Inline: <strong className="text-zinc-200">{inlineSuggestionsEnabled ? copilotStatus : 'Disabled'}</strong> (Tab to accept)</span>
            <button
              onClick={() => setInlineSuggestionsEnabled(prev => !prev)}
              className="text-[9px] text-cyan-400 hover:underline ml-1 cursor-pointer"
              title="Toggle AI inline completions"
            >
              [{inlineSuggestionsEnabled ? 'ON' : 'OFF'}]
            </button>
          </div>

          {/* AI Suggestive Writing Quick Trigger Button */}
          <button
            onClick={() => setIsSuggestivePromptOpen(prev => !prev)}
            className="flex items-center gap-1 text-[10px] text-purple-300 hover:text-purple-200 bg-purple-950/40 hover:bg-purple-900/50 px-2 py-0.5 rounded border border-purple-800/40 transition-colors cursor-pointer"
            title="Open AI Suggestive Writing (Ctrl+I)"
          >
            <span className="material-symbols-outlined text-[13px] text-purple-400">auto_fix_high</span>
            <span>AI Write (Ctrl+I)</span>
          </button>
        </div>

        {/* Right: Save & Sync Action */}
        <button
          onClick={onSaveFile}
          disabled={!activeFile || isSaving || !isUnsaved || isReadOnly}
          className={`px-3 py-1 font-bold text-[11px] transition-all font-mono uppercase tracking-wider flex items-center gap-1.5 rounded ${
            isReadOnly
              ? 'bg-purple-950/40 text-purple-400/50 cursor-not-allowed border border-purple-900/40'
              : isUnsaved && activeFile && !isSaving
                ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40 cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                : 'bg-white/5 text-zinc-600 border border-white/5 cursor-not-allowed'
          }`}
          title={isReadOnly ? "Read-Only Mode: Reviewers cannot submit code edits" : "Stage code modifications via Save & Sync protocol"}
        >
          <span className="material-symbols-outlined text-sm">{isReadOnly ? 'lock' : 'sync'}</span>
          {isReadOnly ? 'READ-ONLY' : isSaving ? 'STAGING...' : 'SAVE & SYNC'}
        </button>
      </div>
    </section>
  );
};

export default MonacoEditorCanvas;
