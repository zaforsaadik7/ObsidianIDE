import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Memory cache for discovered & validated models per API key hash
const modelDiscoveryCache = new Map();

// Helper to sanitize model names
const cleanModelId = (name = '') => name.replace(/^models\//, '');

// Fetch and verify operable Gemini models for a given API key
const discoverWorkingModels = async (apiKey) => {
  if (!apiKey) return [];

  const cacheKey = apiKey.slice(-10);
  if (modelDiscoveryCache.has(cacheKey)) {
    const cached = modelDiscoveryCache.get(cacheKey);
    // Cache valid for 15 minutes
    if (Date.now() - cached.timestamp < 15 * 60 * 1000) {
      return cached.models;
    }
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Failed to list models (HTTP ${res.status})`);
    }

    const data = await res.json();
    const rawModels = data.models || [];

    // Filter models that support content generation
    const generateContentModels = rawModels.filter(m => 
      Array.isArray(m.supportedGenerationMethods) && 
      m.supportedGenerationMethods.includes('generateContent')
    );

    // Prioritized official working Gemini models (universal standard models first)
    const priorityNames = [
      'gemini-1.5-flash',
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-1.5-pro',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash-8b',
      'gemini-pro'
    ];

    const discoveredMap = new Map();
    generateContentModels.forEach(m => {
      const id = cleanModelId(m.name);
      // Exclude specialized non-chat / vision-only / image-gen / embedding models
      if (
        !id.includes('image') && 
        !id.includes('tts') && 
        !id.includes('robotics') && 
        !id.includes('video-understanding') &&
        !id.includes('customtools') &&
        !id.includes('embedding') &&
        !id.includes('aqa')
      ) {
        discoveredMap.set(id, {
          id,
          name: m.displayName || id,
          description: m.description || 'Google Gemini Language & Coding Model'
        });
      }
    });

    const finalModels = [];
    // 1. Add priority matches that exist in discovered models
    priorityNames.forEach(pName => {
      if (discoveredMap.has(pName)) {
        finalModels.push(discoveredMap.get(pName));
      }
    });

    // 2. Add other discovered gemini models
    discoveredMap.forEach((val, id) => {
      if (id.startsWith('gemini-') && !finalModels.some(m => m.id === id) && finalModels.length < 6) {
        finalModels.push(val);
      }
    });

    // 3. Robust fallback if listing endpoint returned empty
    if (finalModels.length === 0) {
      finalModels.push(
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Recommended)', description: 'Fast, reliable code & reasoning model' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Next-gen high-speed model' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Deep multi-file reasoning' }
      );
    }

    modelDiscoveryCache.set(cacheKey, {
      models: finalModels,
      timestamp: Date.now()
    });

    return finalModels;
  } catch (error) {
    console.warn('[AI Model Discovery] Error querying models:', error.message);
    return [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Recommended)', description: 'Fast, reliable code & reasoning model' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Next-gen high-speed model' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Deep multi-file reasoning' }
    ];
  }
};

// GET /api/ai-agent/models: Dynamically list and verify active working models for the API key
router.get('/models', async (req, res) => {
  try {
    const { apiKey } = req.query;
    const effectiveApiKey = (apiKey || process.env.GEMINI_API_KEY || '').trim();

    if (!effectiveApiKey) {
      return res.json({
        status: 'SUCCESS',
        hasKey: false,
        models: [
          { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Recommended)', description: 'Fast, reliable code & reasoning model' },
          { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Next-gen high-speed model' },
          { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Deep multi-file reasoning' }
        ]
      });
    }

    const workingModels = await discoverWorkingModels(effectiveApiKey);

    res.json({
      status: 'SUCCESS',
      hasKey: true,
      count: workingModels.length,
      models: workingModels
    });
  } catch (error) {
    console.error('Error in /api/ai-agent/models:', error);
    res.status(500).json({ error: 'Failed to discover models', details: error.message });
  }
});

// POST /api/ai-agent/validate-key: Test an API key and return working models
router.post('/validate-key', async (req, res) => {
  try {
    const { apiKey } = req.body;
    const keyToTest = (apiKey || process.env.GEMINI_API_KEY || '').trim();

    if (!keyToTest) {
      return res.status(400).json({ valid: false, error: 'API key is required.' });
    }

    try {
      const genAI = new GoogleGenerativeAI(keyToTest);
      const workingModels = await discoverWorkingModels(keyToTest);

      if (workingModels.length === 0) {
        return res.status(400).json({
          valid: false,
          error: 'API key was accepted by Google, but no working generateContent models were found.'
        });
      }

      // Quick generation test with the working models
      let testText = '';
      let activeModelId = workingModels[0].id;
      let lastTestErr = null;

      for (const m of workingModels) {
        try {
          const testModel = genAI.getGenerativeModel({ model: m.id });
          const testPing = await testModel.generateContent('Say "OK" in 1 word.');
          testText = testPing.response.text();
          activeModelId = m.id;
          lastTestErr = null;
          break;
        } catch (err) {
          lastTestErr = err;
        }
      }

      if (lastTestErr && !testText) {
        throw lastTestErr;
      }

      res.json({
        valid: true,
        status: 'SUCCESS',
        message: `API Key validated successfully! ${workingModels.length} operable model(s) discovered.`,
        pingResponse: (testText || 'OK').trim(),
        primaryModel: activeModelId,
        workingModels
      });
    } catch (testErr) {
      console.warn('[AI Key Validation] Failed:', testErr.message);
      res.status(400).json({
        valid: false,
        error: `Google Gemini API rejected this key: ${testErr.message}`
      });
    }
  } catch (error) {
    console.error('Error in /validate-key:', error);
    res.status(500).json({ valid: false, error: error.message });
  }
});

// POST /api/ai-agent/chat: Agentic AI Chatbot with Full Project Codebase, Terminal & GitHub Context
router.post('/chat', verifyToken, async (req, res) => {
  try {
    const { 
      prompt, 
      activeFilePath = '', 
      activeFileContent = '', 
      fileManifest = [], 
      apiKey, 
      selectedModel,
      mentionedFiles = [],
      terminalOutput = '',
      githubInfo = null,
      projectInfo = null
    } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'User prompt is required.' });
    }

    const effectiveApiKey = (apiKey || process.env.GEMINI_API_KEY || '').trim();

    if (!effectiveApiKey) {
      return res.status(400).json({
        error: 'NO_API_KEY',
        message: 'No Google Gemini API Key configured. Please enter your API key in the AI Key Vault panel.'
      });
    }

    const genAI = new GoogleGenerativeAI(effectiveApiKey);

    // Resolve working model name
    let chosenModel = selectedModel;
    if (!chosenModel || chosenModel.includes('gpt-') || chosenModel.includes('claude-') || chosenModel.includes('gemini-3')) {
      chosenModel = 'gemini-1.5-flash';
    }

    // Build Whole-Project Full Source Code Context
    let codebaseContextSection = '';
    if (Array.isArray(fileManifest) && fileManifest.length > 0) {
      const filesWithContent = fileManifest.map((f, i) => {
        const path = f.filePath || f.fileName || `file_${i}`;
        const content = f.content !== undefined ? String(f.content) : '';
        const isMentioned = Array.isArray(mentionedFiles) && mentionedFiles.includes(path);
        const tag = isMentioned ? ' [⭐ USER MENTIONED FILE]' : '';
        return `========================================================\nFILE [${i + 1}/${fileManifest.length}]: ${path}${tag}\n========================================================\n${content}\n`;
      }).join('\n');

      codebaseContextSection = `
PROJECT CODEBASE - COMPLETE SOURCE CODE REPOSITORY (${fileManifest.length} files):
The developer has provided the full contents of all project workspace files below:
${filesWithContent}
`;
    }

    // Build Integrated Terminal Output Context
    let terminalContextSection = '';
    if (terminalOutput && typeof terminalOutput === 'string' && terminalOutput.trim().length > 0) {
      const cleanTerminal = terminalOutput.trim().slice(-15000); // Last ~15KB of runtime output
      terminalContextSection = `
========================================================
LATEST INTEGRATED TERMINAL EXECUTION OUTPUT & SYSTEM LOGS:
========================================================
\`\`\`terminal
${cleanTerminal}
\`\`\`
NOTE: The terminal output above contains the latest runtime execution logs, stdout/stderr, tracebacks, print outputs, or test results from the workspace terminal. Use this to diagnose errors, answer user questions about their output, or fix reported runtime issues.
`;
    }

    // Build Connected GitHub Account & Repository Context
    const ghConnected = Boolean(githubInfo && (githubInfo.connected || githubInfo.username));
    const ghUsername = githubInfo?.username || '';
    const linkedRepoUrl = (projectInfo?.githubRepoUrl || '').trim();

    // Check if the user mentioned a GitHub repo URL in the prompt
    const repoMatchInPrompt = prompt.match(/https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i)
      || prompt.match(/\b([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\b/);
    const discoveredRepoUrl = repoMatchInPrompt
      ? (repoMatchInPrompt[0].startsWith('http') ? repoMatchInPrompt[0] : `https://github.com/${repoMatchInPrompt[1]}/${repoMatchInPrompt[2]}`)
      : (linkedRepoUrl || '');

    const githubContextSection = `
========================================================
CONNECTED GITHUB & REPOSITORY UPLOAD CONTEXT:
========================================================
- Connected GitHub User: ${ghConnected ? `@${ghUsername} (Connected)` : 'No GitHub account connected yet (user can connect in Profile or specify repo)'}
- Project Linked Repository: ${linkedRepoUrl ? linkedRepoUrl : 'Not yet linked'}
- Discovered Repository Target: ${discoveredRepoUrl ? discoveredRepoUrl : 'None provided'}
- GitHub Push Capability: DIRECTLY AVAILABLE. You have the full capability to commit and upload/push project files to GitHub!

GITHUB INSTRUCTIONS:
If the user asks to push, upload, sync, or commit this project/code to GitHub:
1. If a repository is already linked (${linkedRepoUrl || 'None'}) OR if the user provides a repository URL or name in their prompt (e.g. ${discoveredRepoUrl || 'https://github.com/username/repo'}):
   - Confirm you are uploading the project.
   - Include a "githubAction" object inside the \`\`\`json\`\`\` code fence with:
\`\`\`json
{
  "githubAction": {
    "type": "push",
    "repoUrl": "${discoveredRepoUrl || 'https://github.com/username/repo'}",
    "commitMessage": "ObsidianIDE: Update project files",
    "branch": "main"
  }
}
\`\`\`
2. If no repository is linked and no URL was provided by the user:
   - Ask the user to provide their repository link (e.g. https://github.com/username/repo).
   - You can also include a "githubAction": { "type": "prompt_repo_url" } in the JSON block so an interactive repository connection input appears immediately in the chat.
`;

    const mentionedSummary = (Array.isArray(mentionedFiles) && mentionedFiles.length > 0)
      ? `\nDEVELOPER FOCUSED MENTIONS:\nThe developer explicitly tagged these files with @: ${mentionedFiles.join(', ')}\n`
      : '';

    const systemPrompt = `You are Antigravity-AI, the advanced autonomous agentic coding assistant embedded in ObsidianIDE.
You have COMPLETE access and vision over the user's entire project workspace, source files, live terminal execution output, and GitHub integration.

${codebaseContextSection}
${mentionedSummary}
${terminalContextSection}
${githubContextSection}
${activeFilePath ? `ACTIVE OPEN BUFFER (${activeFilePath}):\n\`\`\`\n${activeFileContent}\n\`\`\`\n` : ''}

USER INSTRUCTION:
${prompt}
RESPONSE GUIDELINES:
1. Provide a comprehensive, clear, and professional response. Explain any code analysis, bugs, terminal errors/tracebacks, architecture, or solutions clearly.
2. If code modifications or new files are needed across the workspace, you MUST include a clean JSON block at the very end of your response inside a \`\`\`json\`\`\` code fence formatted EXACTLY as follows:
\`\`\`json
{
  "modifications": [
    {
      "filePath": "path/to/file.ext",
      "newContent": "COMPLETE updated source code for this file"
    }
  ],
  "commands": [
    "python src/main.py"
  ],
  "runScript": {
    "filePath": "src/main.py",
    "command": "python src/main.py"
  },
  "githubAction": {
    "type": "push",
    "repoUrl": "https://github.com/username/repo",
    "commitMessage": "ObsidianIDE: Update project",
    "branch": "main"
  }
}
\`\`\`
3. The user has an interactive integrated terminal directly connected. If terminal commands or scripts are recommended to test, build, run, or verify the solution, include them in the "commands" array or "runScript" object.
4. If the user asks to push or upload to GitHub, always populate the "githubAction" object.
5. If no file modifications, commands, or GitHub actions are needed, just provide your full answer without the JSON block.
6. FILE GENERATION & DIRECTORY ORGANIZATION: ObsidianIDE automatically detects and captures all files and plots generated when code is executed in the terminal (such as PNG/JPG plots from Matplotlib/Seaborn/SHAP/XAI, CSV/JSON datasets, reports, or model binaries) and syncs them in real-time into the left-hand Workspace Directory Explorer. When generating or modifying code that saves output files:
   - Always ensure scripts create the target directory if needed (e.g. \`import os; os.makedirs('outputs', exist_ok=True)\` or \`os.makedirs('plots', exist_ok=True)\`).
   - Use clean, structured relative paths (e.g. \`shap_summary.png\` or \`outputs/shap_summary.png\` or \`plots/xai_analysis.png\`) and clearly document in your explanation which files are generated and their exact folder locations so everyone on the team understands where each file is saved.
`;

    // Attempt generation with chosen model and auto-fallback to alternate verified models
    let result = null;
    let actualModelUsed = chosenModel;
    const fallbackCandidates = [
      chosenModel,
      'gemini-1.5-flash',
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-1.5-pro',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash-8b',
      'gemini-pro'
    ];

    let lastError = null;
    for (const modelCandidate of [...new Set(fallbackCandidates)]) {
      try {
        const modelInstance = genAI.getGenerativeModel({ model: modelCandidate });
        result = await modelInstance.generateContent(systemPrompt);
        actualModelUsed = modelCandidate;
        break;
      } catch (genErr) {
        lastError = genErr;
        console.warn(`[AI Chat] Model ${modelCandidate} failed (${genErr.message}), trying fallback...`);
      }
    }

    if (!result) {
      return res.status(500).json({
        error: 'AI_GENERATION_FAILED',
        message: `Gemini AI failed to respond: ${lastError?.message || 'Unknown error'}. Please check your API key and model selection.`
      });
    }

    const rawResponseText = result.response.text();
    let displayText = rawResponseText;
    let fileModifications = [];
    let terminalCommands = [];
    let runScript = null;
    let githubAction = null;

    // Parse any structured modifications JSON code block from response
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
    let match;
    while ((match = jsonBlockRegex.exec(rawResponseText)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.modifications && Array.isArray(parsed.modifications)) {
          fileModifications = parsed.modifications;
        }
        if (parsed.commands && Array.isArray(parsed.commands)) {
          terminalCommands = parsed.commands;
        }
        if (parsed.runScript && typeof parsed.runScript === 'object') {
          runScript = parsed.runScript;
        }
        if (parsed.githubAction && typeof parsed.githubAction === 'object') {
          githubAction = parsed.githubAction;
        }
        displayText = displayText.replace(match[0], '').trim();
      } catch (e) {}
    }

    // Fallback: If user asked to upload/push to GitHub and a repo exists or was provided in prompt, but AI missed the JSON tag
    if (!githubAction && /(upload|push|sync|commit).*github|github.*(upload|push|sync|commit)/i.test(prompt)) {
      if (discoveredRepoUrl) {
        githubAction = {
          type: 'push',
          repoUrl: discoveredRepoUrl,
          commitMessage: `Update from ObsidianIDE AI Agent (${new Date().toLocaleDateString()})`,
          branch: 'main'
        };
      } else {
        githubAction = {
          type: 'prompt_repo_url'
        };
      }
    }

    res.json({
      status: 'SUCCESS',
      response: {
        text: displayText || rawResponseText,
        fileModifications,
        terminalCommands,
        runScript,
        githubAction,
        modelUsed: actualModelUsed,
        filesIndexedCount: Array.isArray(fileManifest) ? fileManifest.length : 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error in agentic AI chat handler:', error);
    res.status(500).json({
      error: 'AI_CHAT_ERROR',
      message: error.message || 'Failed to process AI chat request'
    });
  }
});

export default router;

