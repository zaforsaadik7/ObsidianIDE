import express from 'express';
import { createServer as createViteServer } from 'vite';
import http from 'http';
import httpProxy from 'http-proxy';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on('unhandledRejection', (reason) => {
  // Ignore ECONNREFUSED during backend cold-start
  if (reason?.code === 'ECONNREFUSED') return;
  console.warn('⚠️ Vite Dev Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  if (err.code === 'ECONNREFUSED') return;
  console.warn('⚠️ Vite Dev Uncaught Exception:', err);
});

async function start() {
  try {
    const app = express();

    // ── Create proxy FIRST (used in both HTTP and WS handlers) ───────────────
    // CRITICAL FIX: Vite middleware mode disables the vite.config.js proxy section.
    // We must manually forward /api (REST) and /ws (WebSocket) to port 5000.
    const proxy = httpProxy.createProxyServer({ changeOrigin: true });
    proxy.on('error', () => {
      // Silently swallow — backend may not be ready during cold-start race
    });

    // ── Vite HMR Dev Server (middleware mode) ─────────────────────────────────
    const vite = await createViteServer({
      configFile: path.resolve(__dirname, '../vite.config.js'),
      server: {
        middlewareMode: true
      },
      appType: 'spa'
    });

    // ── REST API Proxy (/api → port 5000) ─────────────────────────────────────
    app.use('/api', (req, res) => {
      req.url = '/api' + req.url;
      proxy.web(req, res, { target: 'http://localhost:5000' }, (err) => {
        if (!res.headersSent) {
          res.status(502).json({ error: 'Backend not reachable', detail: err?.message });
        }
      });
    });

    // ── Vite HMR Middleware (serves latest src/) ───────────────────────────────
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });

    const httpServer = http.createServer(app);

    // ── WebSocket Proxy: /ws → port 5000 ─────────────────────────────────────
    // This is the PERMANENT fix for the terminal not connecting.
    // Without this, /ws/terminal and /ws/collaboration WebSocket upgrades would
    // fail because Vite middleware mode does not proxy WebSocket connections.
    httpServer.on('upgrade', (req, socket, head) => {
      if (req.url && req.url.startsWith('/ws')) {
        // Forward /ws/terminal and /ws/collaboration to backend on port 5000
        proxy.ws(req, socket, head, { target: 'http://localhost:5000' }, (err) => {
          if (socket.writable) socket.destroy();
        });
      } else {
        // Let Vite handle its own HMR WebSocket (__vite_hmr etc.)
        vite.hot?.server?.handleUpgrade(req, socket, head);
      }
    });

    const port = 3000;
    httpServer.listen(port, '0.0.0.0', () => {
      console.log(`🚀 ObsidianIDE Dev Server → http://localhost:${port}`);
      console.log(`   ↳ /api  → http://localhost:5000  (REST proxy)`);
      console.log(`   ↳ /ws   → ws://localhost:5000    (WebSocket: Terminal + Collaboration)`);
      console.log(`   ↳ /*    → Vite HMR               (always latest src/, never stale dist/)`);
    });
  } catch (err) {
    console.error('Failed to initialize dev server:', err);
  }
}

start();
