import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ Vite Dev Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.warn('⚠️ Vite Dev Uncaught Exception:', err);
});

async function start() {
  try {
    const app = express();
    
    const vite = await createViteServer({
      configFile: './vite.config.js',
      server: {
        middlewareMode: true
      },
      appType: 'spa'
    });

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

    const port = 3000;
    app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Express + Vite Middleware Dev Server listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error('Failed to initialize Express + Vite server:', err);
  }
}

start();
