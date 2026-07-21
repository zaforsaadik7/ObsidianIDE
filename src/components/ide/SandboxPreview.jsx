import React from 'react';

export const SandboxPreview = ({ content = '' }) => {
  return (
    <section className="w-72 bg-white dark:bg-surface-dark flex flex-col h-full overflow-hidden shrink-0 border-l border-outline-variant font-mono text-xs">
      <div className="h-9 px-3 flex items-center justify-between border-b border-neutral-300 dark:border-outline-variant bg-neutral-100 dark:bg-surface-container-low text-[10px] text-neutral-600 dark:text-on-surface-variant uppercase tracking-wider select-none">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-neon-green"></span>
          Sandbox Live Preview
        </span>
        <span className="material-symbols-outlined text-sm cursor-pointer hover:text-neutral-900 dark:hover:text-white" title="Refresh Sandbox">
          refresh
        </span>
      </div>

      <div className="flex-1 bg-white relative">
        <iframe
          title="Sandbox Live Preview"
          srcDoc={content || '<html><body style="background:#0A0A0B;color:#00dce5;font-family:monospace;padding:20px;text-align:center;">[ Live Sandbox Ready ]</body></html>'}
          sandbox="allow-scripts"
          className="w-full h-full border-none"
        />
      </div>
    </section>
  );
};
