import * as Babel from '@babel/standalone';

const userReactCode = `import React, { useState } from 'react';

export default function App() {
  const [likes, setLikes] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#07080B] text-white p-4">
      <div className="bg-[#0D0E14] border border-cyan-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
        <div className="inline-block px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[11px] font-bold rounded-full uppercase tracking-wider">
          React 18 Live Sandbox
        </div>
        
        <h2 className="text-xl font-bold text-white">Dynamic Component</h2>
        <p className="text-xs text-zinc-400">Compiled in real-time with Babel & Tailwind CSS</p>

        <div className="py-4 bg-[#07080A] rounded-xl border border-white/10">
          <div className="text-3xl font-mono font-extrabold text-emerald-400">{likes}</div>
          <div className="text-[11px] text-zinc-500 font-mono mt-1">Total Reactions</div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setLikes(l => l + 1)}
            className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-black font-bold text-xs rounded-lg transition-all shadow-lg active:scale-95 cursor-pointer"
          >
            👍 Like (+1)
          </button>
          <button 
            onClick={() => setIsBookmarked(b => !b)}
            className={\`px-3 py-2.5 rounded-lg border text-xs font-bold transition-all cursor-pointer \${
              isBookmarked 
                ? 'bg-amber-500/20 border-amber-500 text-amber-300' 
                : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
            }\`}
          >
            {isBookmarked ? '★ Saved' : '☆ Save'}
          </button>
        </div>
      </div>
    </div>
  );
}`;

let cleaned = userReactCode
  .replace(/import\s+.*?from\s+['"].*?['"];?/g, '')
  .replace(/import\s+['"].*?['"];?/g, '')
  .replace(/export\s+default\s+function\s+/g, 'function ')
  .replace(/export\s+default\s+class\s+/g, 'class ')
  .replace(/export\s+default\s+([A-Za-z0-9_]+);?/g, 'window.__MainComponent = $1;')
  .replace(/export\s+{[^}]+};?/g, '')
  .replace(/export\s+(const|let|var|function|class)\s+/g, '$1 ');

cleaned += '\nif (typeof App !== "undefined") { window.__MainComponent = App; }';
cleaned += '\nelse if (typeof Main !== "undefined") { window.__MainComponent = Main; }';

const result = Babel.transform(cleaned, {
  presets: [['react', { runtime: 'classic' }]],
  filename: 'app.jsx'
});

console.log("Transpiled Code Output Preview:\n", result.code.substring(0, 350) + "...\n");
console.log("✓ Classic React.createElement output length:", result.code.length);
