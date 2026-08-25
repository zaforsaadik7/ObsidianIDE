import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');

console.log(`[ObsidianIDE] Preview root: ${projectRoot}`);
const build = spawn(process.execPath, [viteBin, 'build'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false
});

build.on('exit', (code) => {
  if (code !== 0) process.exit(code ?? 1);
  const preview = spawn(process.execPath, [viteBin, 'preview'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false
  });
  preview.on('exit', (previewCode) => process.exit(previewCode ?? 0));
});
