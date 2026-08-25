import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (label, args) => {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false
  });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`${label} stopped with exit code ${code}.`);
  });
  return child;
};

console.log(`[ObsidianIDE] Combined development root: ${root}`);
const backend = run('Backend', [path.join(root, 'server', 'index.js')]);
const frontend = run('Frontend', [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')]);

const stop = () => {
  backend.kill('SIGTERM');
  frontend.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
