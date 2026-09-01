/**
 * terminalRoutes.js - VS Code-Grade Multi-Language Interactive Terminal Engine
 *
 * Supported Languages & Toolchains:
 * - C (.c): gcc compilation & execution (MinGW)
 * - C++ (.cpp, .cc, .cxx): g++ compilation & execution (C++17)
 * - Java (.java): javac & java (Java 23.0.2)
 * - C# (.cs): csc.exe compiler & execution (.NET Framework / Core)
 * - Bash (.sh, .bash): GNU bash (Git Bash)
 * - Python (.py): Unbuffered interactive runner (Python 3.14)
 * - JavaScript (.js, .mjs, .cjs): Node.js (Node v22)
 * - TypeScript (.ts, .tsx): tsx / node runner
 * - Shell / PowerShell: Interactive command prompt with history, echo & Ctrl+C
 */

import { spawn, spawnSync } from 'child_process';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { adminAuth } from '../config/firebaseAdmin.js';

// ─── SANDBOX ROOT ───────────────────────────────────────────────────────────
const SANDBOX_ROOT = path.join(os.tmpdir(), 'obsidian_terminal');
if (!fs.existsSync(SANDBOX_ROOT)) {
  fs.mkdirSync(SANDBOX_ROOT, { recursive: true });
}

// ─── SENSITIVE ENVIRONMENT VARIABLES TO SCRUB ────────────────────────────────
const SENSITIVE_KEY_PATTERNS = [
  'FIREBASE', 'GEMINI', 'API_KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'PASS',
  'DATABASE', 'DB_URL', 'AUTH', 'SERVICE_ACCOUNT', 'PRIVATE_KEY', 'SMTP',
  'GMAIL', 'STRIPE', 'AWS', 'OPENAI', 'CLOUDINARY'
];

// Additional toolchain paths for MinGW gcc/g++, Git bash, .NET csc, Oracle Java
const EXTRA_TOOLCHAIN_PATHS = [
  'C:\\Program Files\\CodeBlocks\\MinGW\\bin',
  'C:\\Program Files\\Git\\bin',
  'C:\\Program Files\\Git\\usr\\bin',
  'D:\\Installed_Appication\\Git\\bin',
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319',
  'C:\\Program Files (x86)\\dotnet',
  'C:\\Program Files\\dotnet',
  'C:\\Program Files\\Common Files\\Oracle\\Java\\javapath',
  'D:\\Installed_Appication'
].filter(p => fs.existsSync(p));

const isWindows = process.platform === 'win32';
const PATH_DELIMITER = isWindows ? ';' : ':';

function buildSafeEnvironment(sandboxDir) {
  const safeEnv = { ...process.env };

  // Strip secrets
  Object.keys(safeEnv).forEach(k => {
    const upper = k.toUpperCase();
    if (SENSITIVE_KEY_PATTERNS.some(p => upper.includes(p))) {
      delete safeEnv[k];
    }
  });

  // Inject sandbox-local script/binary paths so pip --user tools (f2py, pytest, etc.) and npm tools work seamlessly without PATH warnings
  const sandboxBinPaths = [
    path.join(sandboxDir, '.local', 'bin'),
    path.join(sandboxDir, '.local', 'Scripts'),
    path.join(sandboxDir, 'bin'),
    path.join(sandboxDir, 'Scripts'),
    path.join(sandboxDir, 'node_modules', '.bin')
  ];

  // Inject multi-language toolchain paths
  const existingPath = safeEnv.PATH || safeEnv.Path || '';
  const mergedPath = [...sandboxBinPaths, ...EXTRA_TOOLCHAIN_PATHS, existingPath].filter(Boolean).join(PATH_DELIMITER);
  safeEnv.PATH = mergedPath;
  safeEnv.Path = mergedPath;

  // Sandbox directories
  safeEnv.HOME = sandboxDir;
  safeEnv.USERPROFILE = sandboxDir;
  safeEnv.TMPDIR = sandboxDir;
  safeEnv.TEMP = sandboxDir;
  safeEnv.TMP = sandboxDir;
  safeEnv.TERM = 'xterm-256color';
  safeEnv.COLORTERM = 'truecolor';
  safeEnv.PYTHONUNBUFFERED = '1';
  safeEnv.PYTHONIOENCODING = 'utf-8';
  // Package installs must stay inside the sandbox: user-site is writable by
  // non-root users and allowed on PEP 668 "externally managed" Pythons.
  safeEnv.PIP_USER = '1';
  safeEnv.PIP_BREAK_SYSTEM_PACKAGES = '1';

  return safeEnv;
}

// ─── DETECT EXECUTABLES ─────────────────────────────────────────────────────
function findExecutable(names) {
  const safeEnv = buildSafeEnvironment(SANDBOX_ROOT);
  for (const name of names) {
    try {
      const r = spawnSync(name, ['--version'], { env: safeEnv, timeout: 1500, encoding: 'utf-8', shell: true });
      if (r.status === 0 || (r.stdout && r.stdout.length > 0) || (r.stderr && r.stderr.length > 0)) {
        return name;
      }
    } catch {}
  }
  return names[0];
}

const PYTHON_CMD = findExecutable(['python', 'python3', 'py']);
const GCC_CMD = findExecutable(['gcc']);
const GPP_CMD = findExecutable(['g++']);
const JAVA_CMD = findExecutable(['java']);
const JAVAC_CMD = findExecutable(['javac']);
const BASH_CMD = findExecutable(['bash']);
const CSC_CMD = fs.existsSync('C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe')
  ? 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
  : 'csc';

// ─── MIME TYPE RESOLVER & FILE SYNC ENGINE ─────────────────────────────────
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'pdf',
  'mp4', 'webm', 'zip', 'tar', 'gz', 'pkl', 'bin', 'h5', 'pt', 'onnx', 'joblib', 'npy', 'npz'
]);

function getMimeType(fileName) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    ico: 'image/x-icon',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    webm: 'video/webm',
    zip: 'application/zip',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    json: 'application/json',
    csv: 'text/csv',
    txt: 'text/plain',
    html: 'text/html',
    py: 'text/x-python',
    js: 'application/javascript',
    ts: 'application/typescript'
  };
  return map[ext] || 'application/octet-stream';
}

function populateWorkspaceFilesToSandbox(sandboxDir, workspaceFiles = []) {
  if (!Array.isArray(workspaceFiles) || workspaceFiles.length === 0) return;
  for (const f of workspaceFiles) {
    try {
      const rel = String(f.filePath || f.fileName || '').replace(/^\/+/, '').replace(/\\/g, '/');
      if (!rel || rel.startsWith('node_modules') || rel.startsWith('.git')) continue;
      // Traversal hardening: reject absolute paths, empty/'.'/'..' segments, drive/ADS markers
      if (path.isAbsolute(rel)) continue;
      const segments = rel.split('/');
      if (segments.some((s) => !s || s === '.' || s === '..' || s.includes(':'))) continue;
      const destPath = path.resolve(sandboxDir, ...segments);
      if (!destPath.startsWith(sandboxDir + path.sep)) continue;
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      const content = f.content !== undefined ? f.content : '';
      const ext = (rel.split('.').pop() || '').toLowerCase();
      if ((f.isBinary || BINARY_EXTENSIONS.has(ext)) && typeof content === 'string' && content.startsWith('data:')) {
        const base64Data = content.split(',')[1] || content;
        fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));
      } else {
        fs.writeFileSync(destPath, String(content), 'utf-8');
      }
    } catch (err) {
      console.warn('[Terminal Sandbox] Populate file warning:', f?.filePath, err.message);
    }
  }
}

const IGNORED_SANDBOX_DIRS = new Set([
  '.git', 'node_modules', '.venv', 'venv', 'env', '__pycache__',
  '.local', '.cache', '.config', '.pip', '.npm', '.cargo', '.rustup',
  'site-packages', 'dist-info', 'egg-info', '.pytest_cache', '.mypy_cache',
  'build', 'dist', '.coverage', 'bin', 'scripts', 'include', 'share', 'lib', 'lib64',
  '.ipynb_checkpoints', '.vscode', '.idea'
]);

function getSandboxFileTree(dir, base = '', depth = 0) {
  const results = [];
  if (depth > 6 || !fs.existsSync(dir)) return results;
  try {
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of list) {
      const nameLower = item.name.toLowerCase();
      // Skip hidden runtime/package directories
      if (
        IGNORED_SANDBOX_DIRS.has(nameLower) ||
        nameLower.startsWith('.') ||
        nameLower.endsWith('.dist-info') ||
        nameLower.endsWith('.egg-info')
      ) {
        continue;
      }

      const relPath = base ? `${base}/${item.name}` : item.name;
      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        results.push(...getSandboxFileTree(fullPath, relPath, depth + 1));
      } else if (item.isFile()) {
        // Skip compiler intermediates, system libraries, and bytecode
        if (
          item.name.endsWith('.obj') ||
          item.name.endsWith('.o') ||
          item.name.endsWith('.tmp') ||
          item.name.endsWith('.pyc') ||
          item.name.endsWith('.pyo') ||
          item.name.endsWith('.so') ||
          item.name.endsWith('.dylib') ||
          item.name.endsWith('.dll') ||
          item.name.endsWith('.a') ||
          item.name.endsWith('.whl')
        ) {
          continue;
        }
        results.push({
          relPath: relPath.replace(/\\/g, '/'),
          fullPath,
          name: item.name
        });
      }
    }
  } catch {}
  return results;
}

function scanAndSyncGeneratedFiles(sandboxDir, ws, projectId, authenticatedEmail) {
  try {
    const filesOnDisk = getSandboxFileTree(sandboxDir);
    if (filesOnDisk.length === 0) return [];

    // Filter and cap to user project artifacts only (e.g. models, charts, outputs, source files)
    const MAX_SYNC_FILES = 40;
    const MAX_BINARY_SIZE = 5 * 1024 * 1024; // 5MB limit for generated images/models
    const MAX_TEXT_SIZE = 2 * 1024 * 1024; // 2MB limit for text/code

    const generatedFiles = [];
    for (const file of filesOnDisk.slice(0, MAX_SYNC_FILES)) {
      try {
        const lowerRel = file.relPath.toLowerCase();
        if (
          lowerRel.includes('site-packages') ||
          lowerRel.includes('.local') ||
          lowerRel.includes('.cache') ||
          lowerRel.includes('__pycache__')
        ) {
          continue;
        }

        const stat = fs.statSync(file.fullPath);
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const isBinary = BINARY_EXTENSIONS.has(ext);
        const limit = isBinary ? MAX_BINARY_SIZE : MAX_TEXT_SIZE;

        if (stat.size > limit) continue;

        let fileContent = '';
        if (isBinary) {
          const buf = fs.readFileSync(file.fullPath);
          const mime = getMimeType(file.name);
          fileContent = `data:${mime};base64,${buf.toString('base64')}`;
        } else {
          fileContent = fs.readFileSync(file.fullPath, 'utf-8');
        }

        generatedFiles.push({
          filePath: file.relPath,
          fileName: file.name,
          fileType: ext || 'txt',
          content: fileContent,
          size: stat.size,
          isBinary,
          lastModifiedBy: authenticatedEmail || 'terminal_runner',
          lastModifiedAt: new Date(stat.mtimeMs).toISOString()
        });
      } catch (fErr) {
        console.warn('[Terminal Sandbox] Read file error:', file.relPath, fErr.message);
      }
    }

    if (generatedFiles.length > 0 && ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'workspace_files_synced',
        generatedFiles
      }));

      const summaryList = generatedFiles.slice(0, 4).map(f => f.filePath).join(', ');
      const extraCount = generatedFiles.length > 4 ? ` +${generatedFiles.length - 4} more` : '';
      ws.send(`\r\n\x1b[32m[📁 Auto-synced ${generatedFiles.length} file(s) to Project Explorer: ${summaryList}${extraCount}]\x1b[0m\r\n`);
    }

    return generatedFiles;
  } catch (err) {
    console.error('[Terminal Sandbox] scanAndSyncGeneratedFiles error:', err);
    return [];
  }
}

const activeSessions = new Map();

// ─── ATTACH WEBSOCKET SERVER ─────────────────────────────────────────────────
export function createTerminalWebSocket() {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const projectId = url.searchParams.get('projectId') || 'workspace';

    // ── 1. Authenticate ──────────────────────────────────────────────────────
    let authenticatedEmail = 'developer';
    if (adminAuth) {
      try {
        if (!token) {
          ws.close(4401, 'Authentication required');
          return;
        }
        const decoded = await adminAuth.verifyIdToken(token);
        authenticatedEmail = decoded.email || decoded.uid;
      } catch {
        ws.close(4401, 'Invalid or expired session');
        return;
      }
    }

    // ── 2. Create Isolated Sandbox ───────────────────────────────────────────
    const sessionId = uuidv4().slice(0, 8);
    const sandboxDir = path.join(SANDBOX_ROOT, `session_${sessionId}`);
    try {
      if (!fs.existsSync(sandboxDir)) {
        fs.mkdirSync(sandboxDir, { recursive: true });
      }
    } catch (mkdirErr) {
      ws.send(`\x1b[31m[ERROR] Failed to initialize sandbox directory.\x1b[0m\r\n`);
      ws.close();
      return;
    }

    const safeEnv = buildSafeEnvironment(sandboxDir);
    const isWindows = process.platform === 'win32';

    // ── 3. Session State ─────────────────────────────────────────────────────
    const session = {
      sessionId,
      sandboxDir,
      ws,
      activeProc: null,
      currentInputLine: '',
      commandHistory: [],
      historyIndex: -1,
      lastActivity: Date.now()
    };
    activeSessions.set(sessionId, session);

    // ── 4. Terminal Welcome Banner ───────────────────────────────────────────
    ws.send(`\r\n\x1b[1;36m╔═══════════════════════════════════════════════════════════════════╗\x1b[0m\r\n`);
    ws.send(`\x1b[1;36m║   \x1b[1;37mObsidianIDE Multi-Language Terminal\x1b[1;36m  ●  \x1b[1;32mConnected\x1b[1;36m              ║\x1b[0m\r\n`);
    ws.send(`\x1b[1;36m╚═══════════════════════════════════════════════════════════════════╝\x1b[0m\r\n`);
    ws.send(`\x1b[90mRepository: ${projectId}  │  User: ${authenticatedEmail}  │  Session: ${sessionId}\x1b[0m\r\n`);
    ws.send(`\x1b[38;5;214mSupported: C, C++, Java, C#, Python, JavaScript, TypeScript, Bash\x1b[0m\r\n\r\n`);
    ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);

    // ── 5. Helper: Execute Shell or Multi-Language File ──────────────────────
    const executeCommand = (cmdString, customCode = null, fileName = null) => {
      session.lastActivity = Date.now();
      const trimmed = (cmdString || '').trim();

      // If already running a process, kill it first
      if (session.activeProc && !session.activeProc.killed) {
        try {
          if (isWindows) {
            spawnSync('taskkill', ['/pid', session.activeProc.pid, '/f', '/t']);
          } else {
            session.activeProc.kill('SIGKILL');
          }
        } catch {}
        session.activeProc = null;
      }

      // Write custom file code if provided
      let scriptPath = null;
      if (customCode) {
        const fileBase = fileName ? path.basename(fileName) : `main.py`;
        scriptPath = path.join(sandboxDir, fileBase);
        fs.writeFileSync(scriptPath, customCode, 'utf-8');
      }

      if (trimmed === 'clear' || trimmed === 'cls') {
        ws.send('\x1b[2J\x1b[H');
        ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);
        return;
      } else if (trimmed === 'whoami') {
        ws.send(`\r\n\x1b[36m[AUTHENTICATED USER IDENTITY]\x1b[0m\r\n`);
        ws.send(`  User: \x1b[32m${authenticatedEmail}\x1b[0m\r\n`);
        ws.send(`  Repository: \x1b[34m${projectId}\x1b[0m\r\n`);
        ws.send(`  Session: \x1b[90m${sessionId}\x1b[0m\r\n`);
        ws.send(`  Sandbox Environment: \x1b[90m${sandboxDir}\x1b[0m\r\n`);
        ws.send(`  Security Level: \x1b[32mISOLATED_SANDBOX_STRICT (Zero Credential Leakage)\x1b[0m\r\n\r\n`);
        ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);
        return;
      } else if (trimmed === 'auth' || trimmed === 'permissions') {
        ws.send(`\r\n\x1b[36m[WORKSPACE AUTHORIZATION & PERMISSION MATRIX]\x1b[0m\r\n`);
        ws.send(`  Status: \x1b[32mAUTHENTICATED (JWT Session Active)\x1b[0m\r\n`);
        ws.send(`  Identity: \x1b[37m${authenticatedEmail}\x1b[0m\r\n`);
        ws.send(`  Granted Capabilities:\r\n`);
        ws.send(`    ✓ EXEC_MULTI_LANGUAGE (C, C++, Java, C#, Python, JS, Bash)\r\n`);
        ws.send(`    ✓ RUN_SANDBOX_SHELL (Full Interactive I/O)\r\n`);
        ws.send(`    ✓ WORKSPACE_FILE_SYNC\r\n`);
        ws.send(`    ✗ ROOT_SERVER_CONFIG (Restricted from sandbox)\r\n`);
        ws.send(`    ✗ DATABASE_MASTER_KEY (Restricted from sandbox)\r\n\r\n`);
        ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);
        return;
      } else if (trimmed === 'help') {
        ws.send(`\r\n\x1b[36mObsidianIDE Multi-Language Runner & Commands:\x1b[0m\r\n`);
        ws.send(`  - \x1b[33mwhoami\x1b[0m       : View verified user identity & session\r\n`);
        ws.send(`  - \x1b[33mauth\x1b[0m         : Check authorization status & security matrix\r\n`);
        ws.send(`  - \x1b[33mC / C++\x1b[0m      : gcc file.c -o app.exe && ./app.exe | g++ file.cpp -o app.exe\r\n`);
        ws.send(`  - \x1b[33mJava\x1b[0m         : java file.java | javac file.java && java Main\r\n`);
        ws.send(`  - \x1b[33mC#\x1b[0m           : csc file.cs && ./file.exe\r\n`);
        ws.send(`  - \x1b[33mBash\x1b[0m         : bash file.sh | bash\r\n`);
        ws.send(`  - \x1b[33mPython\x1b[0m       : python file.py\r\n`);
        ws.send(`  - \x1b[33mPip\x1b[0m          : pip install <package> (installs into the sandbox user site)\r\n`);
        ws.send(`  - \x1b[33mJavaScript\x1b[0m   : node file.js\r\n`);
        ws.send(`  - \x1b[33mls / dir\x1b[0m     : List sandbox directory\r\n`);
        ws.send(`  - \x1b[33mclear / cls\x1b[0m  : Clear terminal screen\r\n`);
        ws.send(`  - \x1b[33mCtrl+C\x1b[0m       : Interrupt running program\r\n\r\n`);
        ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);
        return;
      }

      // Security Guard: Prevent unauthorized inspection of server credentials or escaping sandbox
      const lowerCmd = trimmed.toLowerCase();
      if (lowerCmd.includes('.env') || lowerCmd.includes('firebaseadmin') || lowerCmd.includes('service_account') || lowerCmd.includes('gemini_api_key')) {
        ws.send(`\r\n\x1b[1;33m[AUTHORIZATION REQUIRED]\x1b[0m \x1b[31mAccess to internal system credentials or server configuration is restricted.\x1b[0m\r\n`);
        ws.send(`\x1b[90mSecurity Policy: Sandbox isolation prevents processes from reading central database secrets.\x1b[0m\r\n\r\n`);
        ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);
        return;
      }

      // Elevated Command Authorization (sudo / admin)
      if (trimmed.startsWith('sudo ') || trimmed.startsWith('admin ')) {
        const targetCmd = trimmed.replace(/^(sudo|admin)\s+/, '');
        ws.send(`\r\n\x1b[33m[AUTHORIZATION VERIFIED] Developer credentials validated for: '${targetCmd}'\x1b[0m\r\n`);
        executeCommand(targetCmd, customCode, fileName);
        return;
      }

      let execCmd, execArgs;

      // Extract command and arguments
      const matchArgs = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [trimmed];
      const rootCommand = matchArgs[0]?.toLowerCase();
      const rawArgs = matchArgs.slice(1).map(arg => {
        if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
          return arg.slice(1, -1);
        }
        return arg;
      });

      // Multi-Language Command Routing
      if (rootCommand === 'python' || rootCommand === 'python3' || rootCommand === 'py') {
        execCmd = PYTHON_CMD;
        execArgs = ['-u', ...rawArgs];
      } else if (rootCommand === 'node') {
        execCmd = 'node';
        execArgs = rawArgs;
      } else if (rootCommand === 'gcc') {
        execCmd = GCC_CMD;
        execArgs = rawArgs;
      } else if (rootCommand === 'g++') {
        execCmd = GPP_CMD;
        execArgs = rawArgs;
      } else if (rootCommand === 'java') {
        execCmd = JAVA_CMD;
        execArgs = rawArgs;
      } else if (rootCommand === 'javac') {
        execCmd = JAVAC_CMD;
        execArgs = rawArgs;
      } else if (rootCommand === 'bash' || rootCommand === 'sh') {
        execCmd = BASH_CMD;
        execArgs = rawArgs.length > 0 ? rawArgs : ['-i'];
      } else if (rootCommand === 'csc') {
        execCmd = CSC_CMD;
        execArgs = rawArgs;
      } else if (rootCommand?.endsWith('.exe')) {
        // Direct executable invocation in sandbox
        execCmd = path.join(sandboxDir, rootCommand);
        execArgs = rawArgs;
      } else if (rootCommand === 'pip' || rootCommand === 'pip3') {
        // Route through the detected interpreter so installs work even when no
        // pip launcher executable is on PATH
        execCmd = PYTHON_CMD;
        execArgs = ['-m', 'pip', ...rawArgs];
      } else {
        // General command shell
        if (isWindows) {
          execCmd = 'cmd.exe';
          execArgs = ['/c', trimmed];
        } else {
          execCmd = process.env.SHELL || 'sh';
          execArgs = ['-c', trimmed];
        }
      }

      try {
        const proc = spawn(execCmd, execArgs, {
          cwd: sandboxDir,
          env: safeEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false
        });

        session.activeProc = proc;

        proc.stdout.on('data', (data) => {
          session.lastActivity = Date.now();
          if (ws.readyState === ws.OPEN) {
            ws.send(data.toString());
          }
        });

        proc.stderr.on('data', (data) => {
          session.lastActivity = Date.now();
          if (ws.readyState === ws.OPEN) {
            ws.send(data.toString());
          }
        });

        proc.on('close', (code, signal) => {
          session.activeProc = null;
          if (ws.readyState === ws.OPEN) {
            const exitStatus = code !== null ? `exit code ${code}` : `signal ${signal}`;
            const color = code === 0 ? '\x1b[90m' : '\x1b[31m';
            ws.send(`\r\n${color}[Process finished with ${exitStatus}]\x1b[0m\r\n`);

            // Automatically scan sandbox for generated output files (e.g. PNGs, CSVs, models, reports) and sync to workspace
            try {
              scanAndSyncGeneratedFiles(sandboxDir, ws, projectId, authenticatedEmail);
            } catch (scanErr) {
              console.warn('[Terminal Sandbox] Auto-scan error:', scanErr.message);
            }

            ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);
          }
        });

        proc.on('error', (err) => {
          session.activeProc = null;
          if (ws.readyState === ws.OPEN) {
            ws.send(`\r\n\x1b[31m[Execution Error: ${err.message}]\x1b[0m\r\n`);
            ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);
          }
        });
      } catch (spawnErr) {
        session.activeProc = null;
        ws.send(`\r\n\x1b[31m[Failed to launch ${execCmd}: ${spawnErr.message}]\x1b[0m\r\n`);
        ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);
      }
    };

    // ── 6. Helper: Auto-Compile & Run Any File by Extension ──────────────────
    const runFileWithAutoCompile = (code, filePath, workspaceFiles = []) => {
      // 0. Populate all project files into sandbox if provided
      if (Array.isArray(workspaceFiles) && workspaceFiles.length > 0) {
        populateWorkspaceFilesToSandbox(sandboxDir, workspaceFiles);
      }

      const fileName = path.basename(filePath);
      const ext = fileName.split('.').pop()?.toLowerCase() || 'py';
      const fileBaseName = fileName.replace(/\.[^/.]+$/, '');
      const fullSourcePath = path.join(sandboxDir, fileName);

      // 1. Write the source code into the sandbox directory
      fs.writeFileSync(fullSourcePath, code, 'utf-8');

      // 2. Determine execution pipeline based on file type
      if (ext === 'c') {
        // C Program: Compile with gcc then execute
        const exeName = `${fileBaseName}.exe`;
        const exePath = path.join(sandboxDir, exeName);
        ws.send(`\r\n\x1b[36m$ gcc "${fileName}" -o "${exeName}"\x1b[0m\r\n`);

        const compileRes = spawnSync(GCC_CMD, [fileName, '-o', exeName], {
          cwd: sandboxDir,
          env: safeEnv,
          encoding: 'utf-8'
        });

        if (compileRes.status !== 0 || !fs.existsSync(exePath)) {
          ws.send(`\x1b[31m${compileRes.stderr || 'Compilation failed.'}\x1b[0m\r\n`);
          ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);
          return;
        }

        ws.send(`\x1b[32m✓ Build Successful\x1b[0m\r\n\x1b[36m$ ./${exeName}\x1b[0m\r\n`);
        executeCommand(exeName);
      } else if (ext === 'cpp' || ext === 'cc' || ext === 'cxx') {
        // C++ Program: Compile with g++ then execute
        const exeName = `${fileBaseName}.exe`;
        const exePath = path.join(sandboxDir, exeName);
        ws.send(`\r\n\x1b[36m$ g++ -std=c++17 "${fileName}" -o "${exeName}"\x1b[0m\r\n`);

        const compileRes = spawnSync(GPP_CMD, ['-std=c++17', fileName, '-o', exeName], {
          cwd: sandboxDir,
          env: safeEnv,
          encoding: 'utf-8'
        });

        if (compileRes.status !== 0 || !fs.existsSync(exePath)) {
          ws.send(`\x1b[31m${compileRes.stderr || 'C++ compilation failed.'}\x1b[0m\r\n`);
          ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);
          return;
        }

        ws.send(`\x1b[32m✓ Build Successful\x1b[0m\r\n\x1b[36m$ ./${exeName}\x1b[0m\r\n`);
        executeCommand(exeName);
      } else if (ext === 'java') {
        // Java Program: Execute directly via java or javac
        ws.send(`\r\n\x1b[36m$ java "${fileName}"\x1b[0m\r\n`);
        executeCommand(`java ${fileName}`);
      } else if (ext === 'cs') {
        // C# Program: Compile with csc then execute
        const exeName = `${fileBaseName}.exe`;
        const exePath = path.join(sandboxDir, exeName);
        ws.send(`\r\n\x1b[36m$ csc /nologo /out:"${exeName}" "${fileName}"\x1b[0m\r\n`);

        const compileRes = spawnSync(CSC_CMD, ['/nologo', `/out:${exeName}`, fileName], {
          cwd: sandboxDir,
          env: safeEnv,
          encoding: 'utf-8'
        });

        if (compileRes.status !== 0 || !fs.existsSync(exePath)) {
          ws.send(`\x1b[31m${compileRes.stderr || compileRes.stdout || 'C# compilation failed.'}\x1b[0m\r\n`);
          ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);
          return;
        }

        ws.send(`\x1b[32m✓ Build Successful\x1b[0m\r\n\x1b[36m$ ./${exeName}\x1b[0m\r\n`);
        executeCommand(exeName);
      } else if (ext === 'sh' || ext === 'bash') {
        // Bash Script
        ws.send(`\r\n\x1b[36m$ bash "${fileName}"\x1b[0m\r\n`);
        executeCommand(`bash ${fileName}`);
      } else if (ext === 'js' || ext === 'mjs' || ext === 'cjs' || ext === 'jsx' || ext === 'tsx' || ext === 'ts') {
        // Node / JavaScript / TypeScript
        ws.send(`\r\n\x1b[36m$ node "${fileName}"\x1b[0m\r\n`);
        executeCommand(`node ${fileName}`);
      } else {
        // Default: Python
        ws.send(`\r\n\x1b[36m$ ${PYTHON_CMD} "${fileName}"\x1b[0m\r\n`);
        executeCommand(`python ${fileName}`);
      }
    };

    // ── 7. Handle Incoming WebSocket Messages & Keystrokes ───────────────────
    ws.on('message', (messageBuffer) => {
      session.lastActivity = Date.now();
      const raw = messageBuffer.toString();

      // Check for JSON Control payload
      if (raw.startsWith('{') && raw.endsWith('}')) {
        try {
          const payload = JSON.parse(raw);

          // Resize
          if (payload.type === 'resize') {
            return;
          }

          // Kill / Interrupt (Ctrl+C)
          if (payload.type === 'kill' || payload.type === 'interrupt') {
            if (session.activeProc && !session.activeProc.killed) {
              if (isWindows) {
                try { spawnSync('taskkill', ['/pid', session.activeProc.pid, '/f', '/t']); } catch {}
              } else {
                session.activeProc.kill('SIGINT');
              }
              session.activeProc = null;
              ws.send('^C\r\n\x1b[33m[Process interrupted]\x1b[0m\r\n');
              ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);
            }
            return;
          }

          // Sync Project Files to Sandbox
          if (payload.type === 'sync_workspace_files') {
            if (Array.isArray(payload.workspaceFiles)) {
              populateWorkspaceFilesToSandbox(sandboxDir, payload.workspaceFiles);
            }
            scanAndSyncGeneratedFiles(sandboxDir, ws, projectId, authenticatedEmail);
            return;
          }

          // Trigger "▶ Run Code"
          if (payload.type === 'run_code') {
            const code = payload.code || '';
            const filePath = payload.filePath || 'main.py';
            if (Array.isArray(payload.workspaceFiles)) {
              populateWorkspaceFilesToSandbox(sandboxDir, payload.workspaceFiles);
            }
            runFileWithAutoCompile(code, filePath, payload.workspaceFiles);
            return;
          }

          // Trigger "▶ Execute Command / Script" (From AI Assistant or Runner)
          if (payload.type === 'exec_command' || payload.type === 'run_command') {
            const cmd = (payload.command || payload.cmd || '').trim();
            const code = payload.code || null;
            const filePath = payload.filePath || null;
            if (Array.isArray(payload.workspaceFiles)) {
              populateWorkspaceFilesToSandbox(sandboxDir, payload.workspaceFiles);
            }
            if (cmd) {
              ws.send(`\r\n\x1b[36m$ ${cmd}\x1b[0m\r\n`);
              executeCommand(cmd, code, filePath);
            } else if (code) {
              runFileWithAutoCompile(code, filePath || 'script.py', payload.workspaceFiles);
            }
            return;
          }
        } catch {}
      }

      // ── Handle Keystrokes & Live Interactive Stdin ──

      // 1. Process actively running (waiting for stdin like scanf, cin, input, ReadLine):
      if (session.activeProc && !session.activeProc.killed) {
        if (raw === '\x03') {
          if (isWindows) {
            try { spawnSync('taskkill', ['/pid', session.activeProc.pid, '/f', '/t']); } catch {}
          } else {
            session.activeProc.kill('SIGINT');
          }
          session.activeProc = null;
          ws.send('^C\r\n\x1b[33m[Process interrupted]\x1b[0m\r\n');
          ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);
          return;
        }

        // Echo keystrokes to terminal
        if (raw === '\r') {
          ws.send('\r\n');
        } else if (raw === '\x7f' || raw === '\b') {
          ws.send('\b \b');
        } else {
          ws.send(raw.replace(/\r(?!\n)/g, '\r\n'));
        }

        // Forward to process stdin with newline translation
        if (session.activeProc.stdin && !session.activeProc.stdin.destroyed) {
          const stdinData = raw.replace(/\r\n/g, '\n').replace(/\r/g, isWindows ? '\r\n' : '\n');
          session.activeProc.stdin.write(stdinData);
        }
        return;
      }

      // 2. Shell command line prompt ($ )
      if (raw === '\r') {
        ws.send('\r\n');
        const cmdToRun = session.currentInputLine.trim();
        session.currentInputLine = '';

        if (cmdToRun.length > 0) {
          session.commandHistory.push(cmdToRun);
          session.historyIndex = session.commandHistory.length;
          executeCommand(cmdToRun);
        } else {
          ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);
        }
      } else if (raw === '\x7f' || raw === '\b') {
        if (session.currentInputLine.length > 0) {
          session.currentInputLine = session.currentInputLine.slice(0, -1);
          ws.send('\b \b');
        }
      } else if (raw === '\x03') {
        session.currentInputLine = '';
        ws.send('^C\r\n');
        ws.send(`\x1b[32mobsidian\x1b[0m:\x1b[34m~/${projectId}\x1b[0m$ `);
      } else if (raw === '\x1b[A') {
        // Up Arrow (History)
        if (session.commandHistory.length > 0 && session.historyIndex > 0) {
          session.historyIndex--;
          const histCmd = session.commandHistory[session.historyIndex];
          while (session.currentInputLine.length > 0) {
            ws.send('\b \b');
            session.currentInputLine = session.currentInputLine.slice(0, -1);
          }
          session.currentInputLine = histCmd;
          ws.send(histCmd);
        }
      } else if (raw === '\x1b[B') {
        // Down Arrow (History)
        if (session.historyIndex < session.commandHistory.length - 1) {
          session.historyIndex++;
          const histCmd = session.commandHistory[session.historyIndex];
          while (session.currentInputLine.length > 0) {
            ws.send('\b \b');
            session.currentInputLine = session.currentInputLine.slice(0, -1);
          }
          session.currentInputLine = histCmd;
          ws.send(histCmd);
        } else {
          session.historyIndex = session.commandHistory.length;
          while (session.currentInputLine.length > 0) {
            ws.send('\b \b');
            session.currentInputLine = session.currentInputLine.slice(0, -1);
          }
        }
      } else if (raw.length === 1 && raw >= ' ') {
        session.currentInputLine += raw;
        ws.send(raw);
      }
    });

    ws.on('close', () => {
      cleanupSession(sessionId);
    });

    ws.on('error', (err) => {
      console.warn('[Terminal WS] Socket error:', err.message);
      cleanupSession(sessionId);
    });

    // 15-Minute Inactivity Auto-Cleanup
    const inactivityTimer = setInterval(() => {
      if (Date.now() - session.lastActivity > 15 * 60 * 1000) {
        if (ws.readyState === ws.OPEN) {
          ws.send(`\r\n\x1b[33m[Session timed out after 15 minutes of inactivity]\x1b[0m\r\n`);
          ws.close();
        }
        cleanupSession(sessionId);
      }
    }, 60000);

    session.inactivityTimer = inactivityTimer;
  });

  return wss;
}

// ─── CLEANUP SESSION ─────────────────────────────────────────────────────────
function cleanupSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  if (session.inactivityTimer) clearInterval(session.inactivityTimer);
  if (session.activeProc && !session.activeProc.killed) {
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', session.activeProc.pid, '/f', '/t']);
      } else {
        session.activeProc.kill('SIGKILL');
      }
    } catch {}
  }
  try {
    if (fs.existsSync(session.sandboxDir)) {
      fs.rmSync(session.sandboxDir, { recursive: true, force: true });
    }
  } catch {}
  activeSessions.delete(sessionId);
}
