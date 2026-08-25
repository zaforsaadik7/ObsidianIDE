import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

/**
 * Helper to strip ANSI color and formatting escape sequences for AI consumption
 */
export function stripAnsiCodes(str = '') {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * InteractiveTerminal — Full-Featured Integrated Terminal for ObsidianIDE.
 *
 * Provides:
 * - Live interactive STDIN/STDOUT (Python input(), Node readline, PowerShell, shell commands).
 * - Full ANSI 256-color & truecolor rendering.
 * - Ctrl+C process interruption, screen clearing, and session restart.
 * - Direct "Run Code in Terminal" integration.
 * - Live Terminal Output stream buffer for Agentic AI analysis.
 */
export const InteractiveTerminal = ({
  projectId,
  language = 'python',
  currentUser,
  currentCode = '',
  activeFilePath = 'src/main.py',
  isVisible = true,
  onTerminalReady,
  onOutput,
}) => {
  const terminalContainerRef = useRef(null);
  const xtermInstanceRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);
  const outputBufferRef = useRef('');

  const [sessionStatus, setSessionStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected' | 'error'
  const [lastRunTimestamp, setLastRunTimestamp] = useState(null);

  // ── 1. Initialize xterm.js ────────────────────────────────────────────────
  useEffect(() => {
    if (!terminalContainerRef.current) return;
    if (xtermInstanceRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#07080B',
        foreground: '#E0E7FF',
        cursor: '#38BDF8',
        cursorAccent: '#07080B',
        selectionBackground: '#38BDF833',
        selectionForeground: '#FFFFFF',
        black: '#18181B',
        red: '#F87171',
        green: '#34D399',
        yellow: '#FBBF24',
        blue: '#60A5FA',
        magenta: '#C084FC',
        cyan: '#38BDF8',
        white: '#E0E7FF',
        brightBlack: '#52525B',
        brightRed: '#FCA5A5',
        brightGreen: '#6EE7B7',
        brightYellow: '#FDE68A',
        brightBlue: '#93C5FD',
        brightMagenta: '#E9D5FF',
        brightCyan: '#7DD3FC',
        brightWhite: '#FFFFFF',
      },
      fontFamily: '"Fira Code", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      allowTransparency: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(terminalContainerRef.current);

    setTimeout(() => {
      try {
        fitAddon.fit();
      } catch {}
    }, 60);

    xtermInstanceRef.current = term;
    fitAddonRef.current = fitAddon;

    // Send user keystrokes to WebSocket
    term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    // ResizeObserver for auto-fitting
    const resizeObserver = new ResizeObserver(() => {
      try {
        if (fitAddonRef.current && xtermInstanceRef.current) {
          fitAddonRef.current.fit();
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const dims = fitAddonRef.current.proposeDimensions();
            if (dims) {
              wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
            }
          }
        }
      } catch {}
    });

    resizeObserver.observe(terminalContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (wsRef.current) {
        wsRef.current.close();
      }
      term.dispose();
      xtermInstanceRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // ── 2. Handle Tab Visibility & Resize ──────────────────────────────────────
  useEffect(() => {
    if (isVisible && fitAddonRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current.fit();
        } catch {}
      }, 80);
    }
  }, [isVisible]);

  // ── 3. Establish WebSocket Connection ──────────────────────────────────────
  const connectWebSocket = useCallback(async () => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setSessionStatus('connecting');
    const term = xtermInstanceRef.current;

    let token = '';
    try {
      if (currentUser?.getIdToken) {
        token = await currentUser.getIdToken(false);
      }
    } catch {}

    const rawBackendUrl = (import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || '').trim();
    let primaryWsUrl, fallbackWsUrl;
    const urlParams = `token=${encodeURIComponent(token)}&projectId=${encodeURIComponent(projectId || 'workspace')}`;

    if (rawBackendUrl) {
      const cleanWsUrl = rawBackendUrl.replace(/^http/, 'ws').replace(/\/$/, '');
      primaryWsUrl = `${cleanWsUrl}/ws/terminal?${urlParams}`;
      fallbackWsUrl = primaryWsUrl;
    } else {
      const isSecure = window.location.protocol === 'https:';
      const wsProto = isSecure ? 'wss:' : 'ws:';
      primaryWsUrl = `${wsProto}//${window.location.host}/ws/terminal?${urlParams}`;
      fallbackWsUrl = `${wsProto}//${window.location.hostname}:5000/ws/terminal?${urlParams}`;
    }

    const createSocket = (targetUrl, isFallback = false) => {
      const socket = new WebSocket(targetUrl);

      socket.onopen = () => {
        setSessionStatus('connected');
        try {
          fitAddonRef.current?.fit();
        } catch {}
      };

      socket.onmessage = (event) => {
        term?.write(event.data);
        try {
          const rawText = typeof event.data === 'string' ? event.data : '';
          if (rawText) {
            const cleanChunk = stripAnsiCodes(rawText);
            outputBufferRef.current = (outputBufferRef.current + cleanChunk).slice(-20000);
            if (onOutput) {
              onOutput(outputBufferRef.current);
            }
          }
        } catch {}
      };

      socket.onclose = (event) => {
        setSessionStatus('disconnected');
        wsRef.current = null;
      };

      socket.onerror = () => {
        if (!isFallback && window.location.port !== '5000') {
          createSocket(fallbackWsUrl, true);
        } else {
          setSessionStatus('error');
          term?.writeln(`\r\n\x1b[31m[Terminal connection failed at ${targetUrl}. Ensure backend server is active on port 5000.]\x1b[0m`);
          wsRef.current = null;
        }
      };

      wsRef.current = socket;
    };

    createSocket(primaryWsUrl);
  }, [currentUser, projectId, onOutput]);

  // ── Auto-Connect on Mount ──────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      connectWebSocket();
    }, 150);
    return () => clearTimeout(timer);
  }, [connectWebSocket]);

  // ── 4. Terminal Commands & Controller ──────────────────────────────────────
  const executeCodeInTerminal = useCallback((codeToRun = currentCode, targetPath = activeFilePath) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectWebSocket().then(() => {
        setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'run_code',
              code: codeToRun,
              filePath: targetPath,
            }));
            setLastRunTimestamp(new Date().toLocaleTimeString());
          }
        }, 600);
      });
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'run_code',
      code: codeToRun,
      filePath: targetPath,
    }));
    setLastRunTimestamp(new Date().toLocaleTimeString());
  }, [currentCode, activeFilePath, connectWebSocket]);

  const sendInterrupt = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
    }
  }, []);

  const clearScreen = useCallback(() => {
    xtermInstanceRef.current?.clear();
    outputBufferRef.current = '';
    if (onOutput) onOutput('');
  }, [onOutput]);

  const handleReconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setTimeout(() => {
      connectWebSocket();
    }, 200);
  };

  // Expose controller to parent
  useEffect(() => {
    if (onTerminalReady) {
      onTerminalReady({
        runCode: (code, path) => executeCodeInTerminal(code, path),
        interrupt: () => sendInterrupt(),
        clear: () => clearScreen(),
        reconnect: () => handleReconnect(),
        getOutput: () => outputBufferRef.current,
        clearOutput: () => { outputBufferRef.current = ''; if (onOutput) onOutput(''); }
      });
    }
  }, [onTerminalReady, executeCodeInTerminal, sendInterrupt, clearScreen, onOutput]);

  const statusConfig = {
    connected: { color: 'bg-emerald-400', glow: 'shadow-[0_0_8px_#34d399]', label: 'ONLINE' },
    connecting: { color: 'bg-amber-400', glow: 'animate-pulse', label: 'CONNECTING...' },
    error: { color: 'bg-rose-500', glow: 'shadow-[0_0_8px_#f43f5e]', label: 'FAILED' },
    disconnected: { color: 'bg-zinc-600', glow: '', label: 'OFFLINE' },
  }[sessionStatus];

  return (
    <div className="flex flex-col h-full bg-[#07080B] font-mono select-none">
      {/* ── Terminal Toolbar Strip ── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0D0E14] border-b border-white/[0.08] flex-shrink-0 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-black/40 px-2 py-0.5 rounded border border-white/5">
            <span className={`w-2 h-2 rounded-full ${statusConfig.color} ${statusConfig.glow}`} />
            <span className="text-[10px] font-bold tracking-wider text-slate-300">
              {statusConfig.label}
            </span>
          </div>

          <span className="text-[11px] text-zinc-400 font-medium hidden sm:inline">
            Interactive Shell & Runner
          </span>

          {lastRunTimestamp && (
            <span className="text-[10px] text-zinc-500 hidden md:inline">
              Last Executed: {lastRunTimestamp}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Run Code in Terminal */}
          <button
            onClick={() => executeCodeInTerminal()}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded text-[11px] font-bold transition-all shadow-[0_0_10px_rgba(16,185,129,0.2)] cursor-pointer"
            title="Execute active editor file in terminal"
          >
            <span className="material-symbols-outlined text-sm">play_arrow</span>
            <span>Run File</span>
          </button>

          {/* Interrupt (Ctrl+C) */}
          <button
            onClick={sendInterrupt}
            className="flex items-center gap-1 px-2 py-1 bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 rounded text-[11px] font-medium transition-all cursor-pointer"
            title="Terminate active script (Ctrl+C)"
          >
            <span className="material-symbols-outlined text-xs">stop</span>
            <span>Ctrl+C</span>
          </button>

          {/* Clear */}
          <button
            onClick={clearScreen}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-white/5 rounded transition-all cursor-pointer"
            title="Clear terminal screen"
          >
            <span className="material-symbols-outlined text-sm">clear_all</span>
          </button>

          {/* Reconnect */}
          <button
            onClick={handleReconnect}
            className="p-1 text-zinc-400 hover:text-cyan-300 hover:bg-white/5 rounded transition-all cursor-pointer"
            title="Restart terminal session"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
        </div>
      </div>

      {/* ── xterm.js Rendering Viewport ── */}
      <div
        ref={terminalContainerRef}
        className="flex-1 w-full h-full p-2 overflow-hidden"
        style={{ minHeight: '180px' }}
      />
    </div>
  );
};
export default InteractiveTerminal;
