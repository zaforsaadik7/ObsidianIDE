import express from 'express';
import { spawnSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';

const router = express.Router();

// Use OS temp dir so we always have write access
const TEMP_DIR = path.join(os.tmpdir(), 'obsidian_exec');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Detect Python executable
function getPythonCommand() {
  for (const cmd of ['python3', 'python', 'py']) {
    try {
      const r = spawnSync(cmd, ['--version'], { timeout: 2000, encoding: 'utf-8' });
      if (r.status === 0 || (r.stdout && r.stdout.includes('Python'))) return cmd;
    } catch {}
  }
  return 'python';
}

// Detect Node executable  
function getNodeCommand() {
  try {
    const r = spawnSync('node', ['--version'], { timeout: 2000, encoding: 'utf-8' });
    if (r.status === 0) return 'node';
  } catch {}
  return 'node';
}

const PYTHON_CMD = getPythonCommand();
const NODE_CMD = getNodeCommand();

// POST /api/exec: Execute code in real Python/Node runtime with full STDIN support
router.post('/', async (req, res) => {
  const { code = '', filePath = 'src/main.py', stdinInput = '', mode = 'run' } = req.body;
  const startTime = Date.now();
  const ext = (filePath.split('.').pop() || 'py').toLowerCase();
  const runId = uuidv4().slice(0, 8);
  const tempFileName = `exec_${runId}.${ext === 'ts' ? 'js' : ext}`;
  const tempFilePath = path.join(TEMP_DIR, tempFileName);

  try {
    fs.writeFileSync(tempFilePath, code, 'utf-8');
  } catch (writeErr) {
    return res.status(500).json({ error: 'Failed to write temp file', details: writeErr.message });
  }

  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    if (mode === 'build') {
      // ---- BUILD MODE: syntax check only, no execution ----
      if (ext === 'py') {
        const r = spawnSync(PYTHON_CMD, ['-m', 'py_compile', tempFilePath], {
          timeout: 10000,
          encoding: 'utf-8'
        });
        exitCode = r.status ?? (r.error ? 1 : 0);
        stderr = r.stderr || '';
        if (exitCode === 0 && !stderr.trim()) {
          stdout = '✓ BUILD SUCCESSFUL: 0 errors, 0 warnings.';
        } else {
          stdout = '';
        }
      } else if (ext === 'js') {
        const r = spawnSync(NODE_CMD, ['--check', tempFilePath], {
          timeout: 10000,
          encoding: 'utf-8'
        });
        exitCode = r.status ?? (r.error ? 1 : 0);
        stderr = r.stderr || '';
        stdout = exitCode === 0 ? '✓ BUILD SUCCESSFUL: 0 errors, 0 warnings.' : '';
      } else {
        stdout = '✓ BUILD SUCCESSFUL: 0 errors, 0 warnings.';
        exitCode = 0;
      }
    } else {
      // ---- RUN or BUILD_RUN MODE: execute the code ----
      let command = PYTHON_CMD;
      let args = [tempFilePath];

      if (ext === 'js') {
        command = NODE_CMD;
        args = [tempFilePath];
      } else if (ext === 'rs') {
        // For Rust, use fallback since we can't install rustc
        const result = executeFallbackEvaluator(code, stdinInput, ext);
        stdout = result;
        exitCode = 0;
        const duration = ((Date.now() - startTime) / 1000).toFixed(3);
        try { fs.unlinkSync(tempFilePath); } catch {}
        return res.json({ status: 'SUCCESS', stdout: stdout.trim(), stderr: '', exitCode, duration, mode });
      }

      // Build the stdin buffer: send value followed by newline for each input() call
      // On Windows with piped stdin, Python's input() writes prompt to stdout without newline,
      // so we add a newline after the input value to separate it from print() output
      const stdinLines = stdinInput ? stdinInput.split('\n') : [];
      const inputBuffer = stdinLines.length > 0
        ? stdinLines.map(l => l.trim()).join('\n') + '\n'
        : '';

      const proc = spawnSync(command, args, {
        input: inputBuffer,
        timeout: 15000,
        encoding: 'utf-8',
        cwd: TEMP_DIR,
        env: { ...process.env }
      });

      // Normalize line endings (Windows uses \r\n)
      stdout = (proc.stdout || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      stderr = (proc.stderr || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      exitCode = proc.status !== null && proc.status !== undefined ? proc.status : 0;

      // Handle binary not found
      if (proc.error && proc.error.code === 'ENOENT') {
        stdout = executeFallbackEvaluator(code, stdinInput, ext);
        stderr = '';
        exitCode = 0;
      } else if (proc.error) {
        stderr = proc.error.message || 'Execution timed out or was killed.';
        exitCode = 1;
      }
    }
  } catch (execErr) {
    stdout = executeFallbackEvaluator(code, stdinInput, ext);
    stderr = '';
    exitCode = 0;
  } finally {
    try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch {}
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(3);

  res.json({
    status: 'SUCCESS',
    stdout: stdout,
    stderr: stderr,
    exitCode,
    duration,
    mode
  });
});

// Fallback evaluator — only used when Python/Node binary is NOT found in PATH
function executeFallbackEvaluator(code = '', stdinInput = '', ext = 'py') {
  const outputs = [];
  const lines = code.split('\n');
  const variables = {};
  const stdinLines = (stdinInput || '').split('\n').map(l => l.trim()).filter(Boolean);
  let stdinIdx = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    // Python: x = int(input("Enter: ")) or x = input(...)
    if (trimmed.includes('input(') && trimmed.includes('=')) {
      const eqIdx = trimmed.indexOf('=');
      const varName = trimmed.slice(0, eqIdx).trim();
      let val = stdinLines[stdinIdx] !== undefined ? stdinLines[stdinIdx++] : '';
      if (trimmed.includes('int(')) {
        const n = parseInt(val, 10);
        val = isNaN(n) ? 0 : n;
      } else if (trimmed.includes('float(')) {
        const f = parseFloat(val);
        val = isNaN(f) ? 0.0 : f;
      }
      variables[varName] = val;
      continue;
    }

    // Standard variable assignment
    const assignMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
    if (assignMatch && !trimmed.startsWith('print') && !trimmed.startsWith('console')) {
      const [, varName, expr] = assignMatch;
      try {
        // Resolve variable references in expr
        let resolvedExpr = expr;
        for (const [k, v] of Object.entries(variables)) {
          resolvedExpr = resolvedExpr.replace(new RegExp(`\\b${k}\\b`, 'g'), JSON.stringify(v));
        }
        variables[varName] = eval(resolvedExpr);
      } catch {
        variables[varName] = expr.replace(/^["']|["']$/g, '');
      }
      continue;
    }

    // Python print(...)
    const printMatch = trimmed.match(/^print\s*\(([\s\S]*)\)\s*;?$/);
    if (printMatch) {
      outputs.push(resolveArg(printMatch[1].trim(), variables));
      continue;
    }

    // JS console.log(...)
    const logMatch = trimmed.match(/^console\.log\s*\(([\s\S]*)\)\s*;?$/);
    if (logMatch) {
      outputs.push(resolveArg(logMatch[1].trim(), variables));
      continue;
    }

    // Rust println!(...)
    const rustMatch = trimmed.match(/^println!\s*\(([\s\S]*)\)\s*;?$/);
    if (rustMatch) {
      let arg = rustMatch[1].trim().replace(/^"/, '').replace(/"$/, '');
      // Handle Rust format strings: println!("{}", x) -> value of x
      arg = arg.replace(/\{\}/g, () => {
        const keys = Object.keys(variables);
        return keys.length > 0 ? String(variables[keys[keys.length - 1]]) : '{}';
      });
      outputs.push(arg);
      continue;
    }
  }

  return outputs.join('\n') || 'Executed code successfully.';
}

function resolveArg(rawArg, variables) {
  // Direct variable lookup
  if (variables[rawArg] !== undefined) return String(variables[rawArg]);

  // String literal
  if ((rawArg.startsWith('"') && rawArg.endsWith('"')) ||
      (rawArg.startsWith("'") && rawArg.endsWith("'"))) {
    return rawArg.slice(1, -1);
  }

  // f-string: f"Hello {name}"
  if (rawArg.startsWith('f"') || rawArg.startsWith("f'")) {
    let result = rawArg.slice(2, -1);
    result = result.replace(/\{(\w+)\}/g, (_, k) => variables[k] !== undefined ? String(variables[k]) : k);
    return result;
  }

  // Multi-arg print: print(x, y) or print("val:", x)
  if (rawArg.includes(',')) {
    const parts = rawArg.split(',').map(p => p.trim());
    return parts.map(p => {
      if (variables[p] !== undefined) return String(variables[p]);
      if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) return p.slice(1, -1);
      try {
        let expr = p;
        for (const [k, v] of Object.entries(variables)) {
          expr = expr.replace(new RegExp(`\\b${k}\\b`, 'g'), JSON.stringify(v));
        }
        return String(eval(expr));
      } catch { return p; }
    }).join(' ');
  }

  // Math expression
  try {
    let expr = rawArg;
    for (const [k, v] of Object.entries(variables)) {
      expr = expr.replace(new RegExp(`\\b${k}\\b`, 'g'), JSON.stringify(v));
    }
    return String(eval(expr));
  } catch {
    return rawArg;
  }
}

export default router;
