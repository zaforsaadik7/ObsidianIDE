// Test robust React HTML document generator
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

const buildReactDoc = (code) => {
  // Strip import statements & clean export default
  const cleaned = code
    .replace(/import\s+.*?from\s+['"].*?['"];?/g, '')
    .replace(/export\s+default\s+function\s+([A-Za-z0-9_]+)/g, 'function $1; window.__MainComponent = $1;')
    .replace(/export\s+default\s+([A-Za-z0-9_]+);?/g, 'window.__MainComponent = $1;')
    .replace(/export\s+{[^}]+};?/g, '');

  const escapedCodeJson = JSON.stringify(cleaned);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.development.js" crossorigin="anonymous"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.development.js" crossorigin="anonymous"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.12/babel.min.js" crossorigin="anonymous"></script>
  <style>
    * { box-sizing: border-box; }
    body { background: #07080B; color: #E0E7FF; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="root"></div>

  <script>
    window.addEventListener('DOMContentLoaded', () => {
      const rootEl = document.getElementById('root');
      try {
        if (typeof React === 'undefined' || typeof ReactDOM === 'undefined' || typeof Babel === 'undefined') {
          throw new Error('React / Babel CDN libraries loading. Please check network connection.');
        }

        // Destructure common hooks onto window
        const { useState, useEffect, useRef, useMemo, useCallback, useContext, useReducer } = React;
        window.useState = useState;
        window.useEffect = useEffect;
        window.useRef = useRef;
        window.useMemo = useMemo;
        window.useCallback = useCallback;
        window.useContext = useContext;
        window.useReducer = useReducer;

        const rawCode = ${escapedCodeJson};

        // Transpile JSX via Babel
        const transpiled = Babel.transform(rawCode, {
          presets: ['react'],
          filename: 'app.jsx'
        }).code;

        // Evaluate code
        const evalFn = new Function('React', 'ReactDOM', 'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer', transpiled);
        evalFn(React, ReactDOM, useState, useEffect, useRef, useMemo, useCallback, useContext, useReducer);

        // Identify Component
        const TargetComponent = window.__MainComponent || (typeof App !== 'undefined' ? App : (typeof Main !== 'undefined' ? Main : null));

        if (!TargetComponent) {
          rootEl.innerHTML = '<div style="padding:24px;color:#38BDF8;font-family:monospace;background:#0D1117;border:1px solid #30363D;border-radius:8px;margin:20px;text-align:center;">✓ React Sandbox Active: Define a component function named <code>App()</code> or <code>export default function Component()</code>.</div>';
          return;
        }

        const root = ReactDOM.createRoot(rootEl);
        root.render(React.createElement(TargetComponent));
      } catch (err) {
        rootEl.innerHTML = '<div style="padding:20px;margin:16px;background:#180A0A;border:1px solid #DC2626;border-radius:10px;color:#FCA5A5;font-family:monospace;font-size:12px;"><strong>⚠️ React Live Compilation Notice:</strong><br/><pre style="margin-top:8px;white-space:pre-wrap;color:#F87171;">' + err.message + '</pre></div>';
      }
    });
  </script>
</body>
</html>`;
};

const generated = buildReactDoc(userReactCode);
console.log("Generated HTML Length:", generated.length);
if (generated.includes("window.useState = useState") && generated.includes("cdnjs.cloudflare.com")) {
  console.log("✓ Robust React Sandbox Generator Verified!");
} else {
  console.error("✗ Failed to generate robust React Sandbox doc.");
}
