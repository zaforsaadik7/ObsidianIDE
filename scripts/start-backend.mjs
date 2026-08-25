import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = path.join(projectRoot, 'server', 'index.js');

console.log(`[ObsidianIDE] Backend root: ${projectRoot}`);
const child = spawn(process.execPath, [serverEntry], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
