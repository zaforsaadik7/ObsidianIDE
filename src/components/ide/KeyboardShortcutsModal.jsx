import React from 'react';

export const KeyboardShortcutsModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { category: 'General', items: [
      { key: 'Ctrl + S / Cmd + S', desc: 'Save & Sync active file with Firestore' },
      { key: 'Ctrl + R / F5', desc: 'Execute active file in interactive sandbox' },
      { key: 'Ctrl + `', desc: 'Toggle bottom terminal & console drawer' },
      { key: 'F11', desc: 'Toggle fullscreen workspace mode' },
    ]},
    { category: 'Editor & Navigation', items: [
      { key: 'Ctrl + F', desc: 'Find in active file' },
      { key: 'Ctrl + H', desc: 'Find and Replace in active file' },
      { key: 'Ctrl + Z', desc: 'Undo last edit' },
      { key: 'Ctrl + Y / Shift + Ctrl + Z', desc: 'Redo last edit' },
      { key: 'Ctrl + A', desc: 'Select all code buffer' },
      { key: 'Shift + Alt + F', desc: 'Format code document / JSON indentation' },
      { key: 'Ctrl + /', desc: 'Toggle single-line comment' },
    ]},
    { category: 'AI & Suggestive Writing', items: [
      { key: 'Tab', desc: 'Accept inline AI ghost text completion (GitHub Copilot style)' },
      { key: 'Ctrl + I / Cmd + I', desc: 'Open AI Suggestive Writing prompt & code generator' },
      { key: 'Esc', desc: 'Dismiss active AI suggestion or prompt' },
    ]},
    { category: 'Terminal & Debugging', items: [
      { key: 'Ctrl + C', desc: 'Send SIGINT interrupt to active running process' },
      { key: 'Ctrl + Enter', desc: 'Run code snippet in interactive terminal' },
      { key: 'Ctrl + K', desc: 'Clear interactive terminal screen' },
    ]},
  ];

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm font-sans animate-fade-in select-none">
      <div className="bg-[#121318] border border-cyan-500/30 rounded-xl p-6 max-w-lg w-full shadow-2xl space-y-4 text-xs">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-cyan-400 text-lg">keyboard</span>
            <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider font-headline">
              Keyboard Shortcuts & Controls
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {shortcuts.map((group, idx) => (
            <div key={idx} className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 font-mono">
                {group.category}
              </span>
              <div className="bg-black/40 rounded-lg border border-white/5 divide-y divide-white/5">
                {group.items.map((item, i) => (
                  <div key={i} className="flex justify-between items-center p-2.5">
                    <span className="text-zinc-300">{item.desc}</span>
                    <span className="px-2 py-0.5 bg-zinc-800 text-cyan-300 font-mono font-bold text-[10px] rounded border border-white/10 shadow-sm">
                      {item.key}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-surface-tint text-neutral-900 font-bold font-mono text-xs rounded hover:bg-cyan-400 transition-colors cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
