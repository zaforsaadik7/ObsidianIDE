import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const run = (label, args, env = {}) => {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...env }
  });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`[ObsidianIDE] ${label} stopped with exit code ${code}.`);
  });
  return child;
};

console.log('═══════════════════════════════════════════════════════════════');
console.log('🚀 ObsidianIDE Combined Development Server');
console.log('   Backend  → http://localhost:5000 (Express REST + WebSockets)');
console.log('   Frontend → http://localhost:3000 (Vite HMR Dev Server - LATEST VERSION)');
console.log('═══════════════════════════════════════════════════════════════');

// Start backend (Express + REST API + WebSockets on port 5000)
// NODE_ENV is intentionally NOT set to 'production' so dist/ is never served
const backend = run('Backend', [path.join(root, 'server', 'index.js')], {
  NODE_ENV: 'development'
});

// Start frontend Vite dev server (always serves latest src/, not dist/)
const frontend = run('Frontend', [path.join(root, 'server', 'devFrontendServer.js')]);

const stop = () => {
  backend.kill('SIGTERM');
  frontend.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
