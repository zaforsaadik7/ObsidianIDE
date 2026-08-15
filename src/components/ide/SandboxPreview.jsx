import React, { useMemo } from 'react';
import * as Babel from '@babel/standalone';

/**
 * SandboxPreview — Live Web & React (.jsx, .tsx, .html, .svg) Preview Engine for ObsidianIDE.
 *
 * Supports:
 * - Live HTML / CSS / JS DOM rendering
 * - Instant in-client React JSX/TSX transpilation via bundled Babel Standalone
 * - Zero-delay interactive component mounting in an isolated iframe
 * - Live SVG rendering
 */
export const SandboxPreview = ({ 
  content = '', 
  activeFilePath = '', 
  onClose,
  width = 340 
}) => {
  const lowerPath = (activeFilePath || '').toLowerCase();
  const isPhp = lowerPath.endsWith('.php');
  const isHtml = lowerPath.endsWith('.html') || lowerPath.endsWith('.htm');
  const isSvg = lowerPath.endsWith('.svg');
  const isReact = lowerPath.endsWith('.jsx') || lowerPath.endsWith('.tsx');
  const isWebFile = isHtml || isSvg || isReact || isPhp;

  const generatedSrcDoc = useMemo(() => {
    if (!content) return '';

    if (isHtml) {
      return content;
    }

    if (isPhp) {
      // Strip server-side PHP tags so client-side HTML, CSS, and JS render smoothly
      const cleanedPhp = content
        .replace(/<\?php[\s\S]*?\?>/gi, '')
        .replace(/<\?[\s\S]*?\?>/gi, '');
      return cleanedPhp || content;
    }

    if (isSvg) {
      return `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#07080B;">${content}</body></html>`;
    }

    if (isReact) {
      try {
        // 1. Clean import / export statements for browser standalone execution
        let cleaned = content
          .replace(/import\s+.*?from\s+['"].*?['"];?/g, '')
          .replace(/import\s+['"].*?['"];?/g, '')
          .replace(/export\s+default\s+function\s+/g, 'function ')
          .replace(/export\s+default\s+class\s+/g, 'class ')
          .replace(/export\s+default\s+([A-Za-z0-9_]+);?/g, 'window.__MainComponent = $1;')
          .replace(/export\s+{[^}]+};?/g, '')
          .replace(/export\s+(const|let|var|function|class)\s+/g, '$1 ');

        // Auto-assign top-level component
        cleaned += '\nif (typeof App !== "undefined") { window.__MainComponent = App; }';
        cleaned += '\nelse if (typeof Main !== "undefined") { window.__MainComponent = Main; }';

        // 2. Transpile JSX -> pure React.createElement JS instantly on client
        const transpiled = Babel.transform(cleaned, {
          presets: [['react', { runtime: 'classic' }]],
          filename: 'sandbox.jsx'
        }).code;

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #07080B; color: #E0E7FF; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow-x: hidden; }
  </style>
</head>
<body>
  <div id="root"></div>

  <script>
    (function() {
      const rootEl = document.getElementById('root');
      try {
        if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
          rootEl.innerHTML = '<div style="padding:20px;color:#38BDF8;font-family:monospace;text-align:center;">⌛ Loading React Runtime...</div>';
          return;
        }

        // Expose React hooks globally
        const { useState, useEffect, useRef, useMemo, useCallback, useContext, useReducer } = React;
        window.useState = useState;
        window.useEffect = useEffect;
        window.useRef = useRef;
        window.useMemo = useMemo;
        window.useCallback = useCallback;
        window.useContext = useContext;
        window.useReducer = useReducer;

        // Execute Transpiled User Component Code
        ${transpiled}

        const Target = window.__MainComponent || (typeof App !== 'undefined' ? App : (typeof Main !== 'undefined' ? Main : null));
        if (Target) {
          const root = ReactDOM.createRoot(rootEl);
          root.render(React.createElement(Target));
        } else {
          rootEl.innerHTML = '<div style="padding:24px;color:#38BDF8;font-family:monospace;background:#0D1117;border:1px solid #30363D;border-radius:10px;margin:20px;text-align:center;font-size:12px;">✓ React Sandbox Active: Define a component function named <code>App()</code> or <code>export default function App()</code>.</div>';
        }
      } catch (err) {
        rootEl.innerHTML = '<div style="padding:16px;margin:16px;background:#180A0A;border:1px solid #DC2626;border-radius:10px;color:#FCA5A5;font-family:monospace;font-size:11px;"><strong>⚠️ React Runtime Notice:</strong><br/><pre style="margin-top:8px;white-space:pre-wrap;color:#F87171;line-height:1.4;">' + err.message + '</pre></div>';
      }
    })();
  </script>
</body>
</html>`;
      } catch (compileErr) {
        // Babel syntax error caught immediately
        return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { background: #07080B; color: #FCA5A5; font-family: monospace; padding: 20px; font-size: 11px; }
    .box { background: #1C0C0C; border: 1px solid #DC2626; border-radius: 10px; padding: 16px; }
    h3 { color: #EF4444; margin: 0 0 8px 0; font-size: 13px; }
    pre { white-space: pre-wrap; line-height: 1.4; color: #F87171; }
  </style>
</head>
<body>
  <div class="box">
    <h3>⚠️ React Syntax Compilation Error</h3>
    <pre>${compileErr.message}</pre>
  </div>
</body>
</html>`;
      }
    }

    return '';
  }, [content, isHtml, isSvg, isReact]);

  return (
    <section 
      style={{ width: `${width}px` }}
      className="bg-[#0A0A0D] flex flex-col h-full overflow-hidden shrink-0 border-l border-white/[0.07] font-mono text-xs select-none relative"
    >
      {/* Sandbox Header */}
      <div className="h-9 px-3 flex items-center justify-between border-b border-white/[0.06] bg-[#0D0E14] text-[10px] text-zinc-400 uppercase tracking-wider select-none">
        <span className="flex items-center gap-1.5 font-bold">
          <span className={`w-2 h-2 rounded-full ${isWebFile ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400'}`}></span>
          {isReact ? 'React Live Preview' : isPhp ? 'PHP / Web Live Preview' : isHtml ? 'Web Live Preview' : 'Live Sandbox'}
        </span>
        
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 font-mono">
            {activeFilePath ? activeFilePath.split('/').pop() : 'No file'}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="p-0.5 hover:bg-white/10 hover:text-red-400 text-zinc-400 rounded transition-colors cursor-pointer"
              title="Close Live Sandbox Panel"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Sandbox Body / Frame */}
      <div className="flex-1 bg-[#07080A] relative overflow-auto">
        {isWebFile ? (
          <iframe
            key={activeFilePath}
            title="Sandbox Live Preview"
            srcDoc={generatedSrcDoc || '<div style="color:#38BDF8;font-family:monospace;padding:20px;text-align:center;">[ Live Sandbox Ready ]</div>'}
            sandbox="allow-scripts allow-modals allow-same-origin"
            className="w-full h-full border-none bg-transparent"
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-zinc-400 gap-3">
            <span className="material-symbols-outlined text-4xl text-cyan-400">preview</span>
            <div className="text-xs font-bold text-slate-200">Interactive Multi-Lang Workspace</div>
            <p className="text-[11px] leading-relaxed text-zinc-400">
              Live Web Preview activates automatically for <code className="text-cyan-300">.html</code>, <code className="text-purple-300">.jsx</code>, <code className="text-blue-300">.tsx</code>, and <code className="text-emerald-300">.svg</code> files.
            </p>
            <div className="text-[10px] text-emerald-300/90 bg-emerald-950/30 p-2.5 rounded border border-emerald-800/40 text-left w-full space-y-1">
              <div><strong>▶ Run Code</strong> button executes:</div>
              <div className="text-slate-300 font-mono">
                • C (<code className="text-cyan-300">.c</code>) / C++ (<code className="text-cyan-300">.cpp</code>)<br/>
                • Java (<code className="text-amber-300">.java</code>)<br/>
                • C# (<code className="text-purple-300">.cs</code>)<br/>
                • Python (<code className="text-yellow-300">.py</code>)<br/>
                • Node.js (<code className="text-green-300">.js</code>)<br/>
                • Bash (<code className="text-blue-300">.sh</code>)
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default SandboxPreview;
