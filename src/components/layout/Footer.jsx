import React from 'react';

export const Footer = () => {
  return (
    <footer className="fixed bottom-0 left-0 w-full z-[100] flex justify-between items-center px-6 h-8 bg-surface-container-lowest/80 backdrop-blur-sm border-t border-outline-variant text-[11px] font-mono text-on-surface-variant transition-colors duration-150">
      <div className="flex items-center gap-4">
        <span className="text-surface-tint font-bold flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-neon-green"></span>
          ObsidianIDE Core Engine
        </span>
        <span className="hidden sm:inline">© 2026 Obsidian Systems. Central project sync pipelines fully active.</span>
      </div>

      <div className="flex items-center gap-6">
        <a href="#documentation" className="hover:text-surface-tint transition-colors">Docs</a>
        <a href="#security" className="hover:text-surface-tint transition-colors">Security</a>
        <span className="text-neon-green font-bold">SYSTEM_READY</span>
      </div>
    </footer>
  );
};
