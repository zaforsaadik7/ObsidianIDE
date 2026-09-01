import 'dotenv/config';
import dns from 'dns';
import express from 'express';
import cors from 'cors';

// Force IPv4 First DNS Resolution to eliminate cloud container ENETUNREACH errors on Render/AWS/Docker
try {
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch (dnsErr) {}

// Global Unhandled Exception & Rejection Handlers
process.on('unhandledRejection', (reason, promise) => {
  console.warn('⚠️ Server Unhandled Rejection notice:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.warn('⚠️ Server Uncaught Exception notice:', err?.message || err);
});
import { GoogleGenerativeAI } from '@google/generative-ai';
import projectRoutes from './routes/projectRoutes.js';
import userRoutes from './routes/userRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import patchRoutes from './routes/patchRoutes.js';
import aiAgentRoutes from './routes/aiAgentRoutes.js';
import execRoutes from './routes/execRoutes.js';
import githubRoutes from './routes/githubRoutes.js';
import collaborationRoutes, { createCollaborationWebSocket } from './routes/collaborationRoutes.js';
import { createTerminalWebSocket } from './routes/terminalRoutes.js';
import { verifyToken } from './middleware/authMiddleware.js';
import rateLimit from 'express-rate-limit';
import { telemetryMiddleware } from './middleware/telemetryMiddleware.js';

const app = express();
const PORT = process.env.PORT || 5000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Global API Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // Generous limit for development & multi-suite testing
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
  message: {
    status: 429,
    error: 'Too many requests from this IP address, please try again after 15 minutes.'
  }
});

// CORS: only the app's own origins may call the API cross-origin
const corsAllowlist = (() => {
  const origins = new Set([
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'https://obsidian-ide.vercel.app'
  ]);
  for (const envKey of ['APP_DOMAIN', 'APP_URL', 'CLIENT_DOMAIN']) {
    const value = (process.env[envKey] || '').trim().replace(/\/+$/, '');
    if (value) origins.add(value);
  }
  return [...origins];
})();

// Middleware
app.use(cors({ origin: corsAllowlist }));
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ limit: '60mb', extended: true }));
app.use('/api/', apiLimiter);
app.use(telemetryMiddleware);

// Routes
app.use('/api/projects', projectRoutes);
app.use('/api/users', userRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/patches', patchRoutes);
app.use('/api/ai-agent', aiAgentRoutes);
app.use('/api/exec', execRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/collaboration', collaborationRoutes);

// Initialize Gemini AI SDK if key is provided
let genAI = null;
if (GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log('⚡ Gemini AI SDK initialized on backend server.');
  } catch (err) {
    console.error('⚠️ Failed to initialize Gemini AI SDK:', err.message);
  }
} else {
  console.warn('⚠️ GEMINI_API_KEY missing in .env file.');
}

// Root REST API Health & Status API
app.get('/api', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'ObsidianIDE Express REST API Engine',
    message: 'Backend server is running cleanly.',
    endpoints: ['/api/health', '/api/projects', '/api/files', '/api/users', '/api/patches', '/api/ai-agent'],
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    project: 'ObsidianIDE (NEURAL_IDE)',
    timestamp: new Date().toISOString(),
    aiEngineReady: Boolean(genAI),
  });
});

app.get('/api/secure-health', verifyToken, (req, res) => {
  res.json({
    status: 'Secure',
    message: 'Firebase JWT authentication middleware operational.',
    user: req.user?.email || 'authenticated-user',
    timestamp: new Date().toISOString()
  });
});

// ── Inline AI Code Completion & Suggestive Writing Endpoints ─────────────────

// Contextual Intelligent Fallback Generator for Inline Code Completion
const generateFallbackInlineCompletion = (prefix, language, currentLine) => {
  const line = (currentLine || '').trim();
  const lang = (language || '').toLowerCase();

  // Python patterns
  if (lang.includes('py')) {
    if (line.includes('def factorial') || line.includes('factorial(')) {
      return '\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)';
    }
    if (line.includes('def binary_search') || line.includes('binary_search(')) {
      return '\n    low, high = 0, len(arr) - 1\n    while low <= high:\n        mid = (low + high) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            low = mid + 1\n        else:\n            high = mid - 1\n    return -1';
    }
    if (line.endsWith(':') && line.startsWith('def ')) {
      return '\n    """TODO: Implement function logic."""\n    pass';
    }
    if (line.startsWith('if ') && line.endsWith(':')) {
      return '\n    # Handle condition\n    pass';
    }
  }

  // C / C++ patterns
  if (lang.includes('cpp') || lang.includes('c')) {
    if (line.includes('int main()') || line.includes('int main(')) {
      return ' {\n    std::cout << "ObsidianIDE Online" << std::endl;\n    return 0;\n}';
    }
    if (line.includes('for (') || line.includes('for(')) {
      return 'int i = 0; i < n; i++) {\n        \n    }';
    }
    if (line.includes('#include')) {
      return ' <iostream>\n#include <vector>\n#include <string>';
    }
  }

  // JavaScript / TypeScript patterns
  if (lang.includes('js') || lang.includes('ts')) {
    if (line.includes('const fetch') || line.includes('async ()')) {
      return ' => {\n  try {\n    const response = await fetch("/api/data");\n    return await response.json();\n  } catch (err) {\n    console.error(err);\n  }\n};';
    }
    if (line.includes('useEffect(')) {
      return '() => {\n    // Component mount logic\n  }, []);';
    }
  }

  return '';
};

// 1. Ghost Text / Copilot Inline Autocompletion Provider
app.post('/api/ai/inline-suggest', verifyToken, async (req, res) => {
  try {
    const { prefix = '', suffix = '', language = 'javascript', currentLine = '' } = req.body;

    if (!prefix && !currentLine) {
      return res.json({ completion: '' });
    }

    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          generationConfig: {
            maxOutputTokens: 100,
            temperature: 0.2,
            topP: 0.8
          }
        });

        const prompt = `You are a high-speed inline code autocompletion engine (like GitHub Copilot).
Predict the immediate next few tokens or lines of code that complete the code at <CURSOR>.

LANGUAGE: ${language}

CODE BEFORE CURSOR:
${prefix.slice(-2000)}
<CURSOR>
CODE AFTER CURSOR:
${suffix.slice(0, 500)}

CRITICAL RULES:
- Return ONLY the exact code completion to insert at <CURSOR>.
- DO NOT wrap in markdown backticks or code fences.
- DO NOT include conversational filler, notes, or explanations.
- Output MUST be valid ${language} syntax matching the existing indentation.`;

        const result = await model.generateContent(prompt);
        let completion = result.response.text() || '';
        completion = completion.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');

        if (currentLine && completion.startsWith(currentLine)) {
          completion = completion.substring(currentLine.length);
        }

        if (completion.trim()) {
          return res.json({
            status: 'SUCCESS',
            completion: completion.trimEnd()
          });
        }
      } catch (geminiErr) {
        console.warn('Gemini Inline API notice, using smart local fallback:', geminiErr.message);
      }
    }

    // Smart Local Fallback
    const fallbackCompletion = generateFallbackInlineCompletion(prefix, language, currentLine);
    res.json({
      status: 'SUCCESS',
      completion: fallbackCompletion
    });
  } catch (error) {
    console.warn('Inline suggest error:', error.message);
    res.json({ status: 'FALLBACK', completion: '' });
  }
});

// 2. Interactive Suggestive Writing Endpoint (Ctrl+I / Inline Prompt)
app.post('/api/ai/suggestive-write', verifyToken, async (req, res) => {
  try {
    const { instruction, contextCode = '', language = 'javascript' } = req.body;

    if (!instruction) {
      return res.status(400).json({ error: 'Instruction prompt is required' });
    }

    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          generationConfig: {
            maxOutputTokens: 600,
            temperature: 0.3
          }
        });

        const prompt = `You are an expert AI suggestive code writer for ObsidianIDE.
Developer Instruction: "${instruction}"
Language: ${language}

Surrounding Code Context:
\`\`\`${language}
${contextCode.slice(0, 3000)}
\`\`\`

CRITICAL RULES:
- Return ONLY the generated code to fulfill the developer's instruction.
- DO NOT wrap in markdown backticks or code fences.
- DO NOT include conversational text, greetings, or explanations.
- Ensure indentation and syntax are 100% correct for ${language}.`;

        const result = await model.generateContent(prompt);
        let code = result.response.text() || '';
        code = code.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');

        return res.json({
          status: 'SUCCESS',
          code: code.trim()
        });
      } catch (geminiErr) {
        console.warn('Gemini Suggestive Write notice, using smart fallback:', geminiErr.message);
      }
    }

    // Contextual Smart Fallback Code Generator for Quick Prompts
    const promptLower = (instruction || '').toLowerCase();
    let generatedFallback = '';

    if (promptLower.includes('binary search')) {
      if (language === 'python') {
        generatedFallback = `def binary_search(arr, target):\n    low, high = 0, len(arr) - 1\n    while low <= high:\n        mid = (low + high) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            low = mid + 1\n        else:\n            high = mid - 1\n    return -1`;
      } else if (language === 'cpp' || language === 'c') {
        generatedFallback = `int binarySearch(const std::vector<int>& arr, int target) {\n    int low = 0, high = arr.size() - 1;\n    while (low <= high) {\n        int mid = low + (high - low) / 2;\n        if (arr[mid] == target) return mid;\n        if (arr[mid] < target) low = mid + 1;\n        else high = mid - 1;\n    }\n    return -1;\n}`;
      } else {
        generatedFallback = `function binarySearch(arr, target) {\n  let low = 0, high = arr.length - 1;\n  while (low <= high) {\n    const mid = Math.floor((low + high) / 2);\n    if (arr[mid] === target) return mid;\n    if (arr[mid] < target) low = mid + 1;\n    else high = mid - 1;\n  }\n  return -1;\n}`;
      }
    } else if (promptLower.includes('quicksort') || promptLower.includes('sort')) {
      if (language === 'python') {
        generatedFallback = `def quicksort(arr):\n    if len(arr) <= 1:\n        return arr\n    pivot = arr[len(arr) // 2]\n    left = [x for x in arr if x < pivot]\n    middle = [x for x in arr if x == pivot]\n    right = [x for x in arr if x > pivot]\n    return quicksort(left) + middle + quicksort(right)`;
      } else {
        generatedFallback = `function quickSort(arr) {\n  if (arr.length <= 1) return arr;\n  const pivot = arr[Math.floor(arr.length / 2)];\n  const left = arr.filter(x => x < pivot);\n  const mid = arr.filter(x => x === pivot);\n  const right = arr.filter(x => x > pivot);\n  return [...quickSort(left), ...mid, ...quickSort(right)];\n}`;
      }
    } else if (promptLower.includes('error') || promptLower.includes('try')) {
      generatedFallback = `try {\n  // Protected execution block\n} catch (error) {\n  console.error("Execution error encountered:", error);\n}`;
    } else {
      generatedFallback = `// Generated for: ${instruction}\n// Language: ${language}\nfunction executeTask() {\n  // Implementation details\n  return true;\n}`;
    }

    res.json({
      status: 'SUCCESS',
      code: generatedFallback
    });
  } catch (error) {
    console.error('Suggestive write error:', error);
    res.status(500).json({ error: 'Failed to generate suggestive code', details: error.message });
  }
});

// Serve static production frontend assets for React Web App
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');

// Serve static production frontend assets ONLY in explicit production mode.
// In development, the Vite dev server (port 3000) serves the latest source.
// NEVER serve the dist/ folder in dev mode — it would serve stale built assets.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
if (IS_PRODUCTION && fs.existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else if (!IS_PRODUCTION) {
  // In development: inform any accidental port-5000 browser hits
  app.get('/', (req, res) => {
    res.status(302).redirect('http://localhost:3000');
  });
}

import http from 'http';

// Create HTTP server
const httpServer = http.createServer(app);

// Instantiate WebSocket Servers
const terminalWss = createTerminalWebSocket();
const collaborationWss = createCollaborationWebSocket();

// Unified Clean Upgrade Router
httpServer.on('upgrade', (request, socket, head) => {
  try {
    const parsedUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    if (pathname.startsWith('/ws/collaboration')) {
      collaborationWss.handleUpgrade(request, socket, head, (ws) => {
        collaborationWss.emit('connection', ws, request);
      });
    } else if (pathname.startsWith('/ws/terminal') || pathname === '/ws') {
      terminalWss.handleUpgrade(request, socket, head, (ws) => {
        terminalWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  } catch (err) {
    console.error('WebSocket Upgrade Error:', err);
    socket.destroy();
  }
});

// Start HTTP + WebSocket Server on primary PORT (5000)
httpServer.on('error', (err) => {
  console.warn(`Port ${PORT} listener notice:`, err.message);
});
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ObsidianIDE Express REST Server listening on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Terminal available at ws://localhost:${PORT}/ws/terminal`);
  console.log(`👥 WebSocket Collaboration available at ws://localhost:${PORT}/ws/collaboration`);

  // ── Self-Ping to Prevent Render Free Tier Cold Sleep ─────────────────────
  // Render free plan shuts the server down after ~50s of no traffic.
  // Pinging /api/health every 10 minutes keeps the instance warm, preventing
  // the 30–60 second cold-start delay that causes terminal WebSocket failures.
  const selfPingUrl = process.env.RENDER_EXTERNAL_URL
    ? `${process.env.RENDER_EXTERNAL_URL}/api/health`
    : null;

  if (selfPingUrl && process.env.NODE_ENV === 'production') {
    setInterval(async () => {
      try {
        const res = await fetch(selfPingUrl, { signal: AbortSignal.timeout(10000) });
        console.log(`[Self-Ping] ${selfPingUrl} → ${res.status}`);
      } catch (pingErr) {
        console.warn('[Self-Ping] Keepalive ping failed:', pingErr.message);
      }
    }, 10 * 60 * 1000); // every 10 minutes
    console.log(`🏓 Self-ping keepalive active → ${selfPingUrl} (every 10 min)`);
  }
});

