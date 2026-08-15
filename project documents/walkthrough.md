# 🏆 ObsidianIDE (NEURAL_IDE / Obsidian Flux) — Master Project Walkthrough & Presentation Guide

**Academic Institution**: Bangladesh University of Business and Technology (BUBT) — Department of CSE  
**Course Code**: SDP 4 (Software Development Project 4)  
**Project Title**: ObsidianIDE — A Web-Based Multi-Accessible IDE for Team Projects  

### 👨‍💻 Student Developer Roster
* **Md. Emam Zafor Saadik** (ID: `22235103581`) — *Lead Full-Stack Architect & Backend Developer*
* **Samia Sultana** (ID: `22235103292`) — *Frontend UI Engineer*
* **Halima Tus Sadia** (ID: `22235103557`) — *Database & QA Engineer*

---

## 🛠️ Full-Stack Technology Stack & Architecture

ObsidianIDE is built following a clean, linear, high-performance architecture:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        OBSIDIANIDE SYSTEM ARCHITECTURE                 │
├───────────────────────────────────┬────────────────────────────────────┤
│ Component Layer                   │ Technology Stack                   │
├───────────────────────────────────┼────────────────────────────────────┤
│ Frontend Single Page App (SPA)    │ React 19.0 + Vite 6.4 + Tailwind   │
│ Code Canvas Engine                │ Monaco Editor (@monaco-editor/react)│
│ Backend REST API Server           │ Node.js v20 + Express.js 4.21      │
│ Database & User Authentication    │ Cloud Firestore + Firebase Auth 11 │
│ Agentic AI Engine                 │ Google Generative AI (Gemini SDK)  │
│ Production Bundler                │ Rollup with Manual Vendor Chunks   │
└───────────────────────────────────┴────────────────────────────────────┘
```

---

## 📦 Master Module Implementation Summary

### Module 0: Architecture & Environment Initialization (`100% COMPLETE`)
* Initialized React 19 SPA, Vite 6, Tailwind CSS 3, Express 4 REST server, and Firebase SDK 11.
* Programmatically registered Web App `ObsidianIDE Web` (`1:760717239168:web:ec973488753109c8a0d765`) under Firebase Project `obsidianide-1606f`.

### Module 1: Design System & SPA Routing Setup (`100% COMPLETE`)
* Built layout components ([Header.jsx](file:///f:/SDP%204/src/components/layout/Header.jsx), [Sidebar.jsx](file:///f:/SDP%204/src/components/layout/Sidebar.jsx), [Footer.jsx](file:///f:/SDP%204/src/components/layout/Footer.jsx), [ThemeToggle.jsx](file:///f:/SDP%204/src/components/layout/ThemeToggle.jsx), [MainLayout.jsx](file:///f:/SDP%204/src/components/layout/MainLayout.jsx)).
* Configured SPA routing in [App.jsx](file:///f:/SDP%204/src/App.jsx) with `ProtectedRoute` authorization guards.

### Module 2: Authentication & Onboarding Flow (`100% COMPLETE`)
* Built dual-state login and registration card component ([AuthPage.jsx](file:///f:/SDP%204/src/pages/AuthPage.jsx)).
* Built deployment strategy selector ([OnboardingWizardPage.jsx](file:///f:/SDP%204/src/pages/OnboardingWizardPage.jsx)) syncing storage strategies in Cloud Firestore.

### Module 3: Central Workspace Dashboard & Project CRUD (`100% COMPLETE`)
* Built Express project management router ([server/routes/projectRoutes.js](file:///f:/SDP%204/server/routes/projectRoutes.js)).
* Built interactive project cards ([ProjectCard.jsx](file:///f:/SDP%204/src/components/dashboard/ProjectCard.jsx)), launcher modal ([CreateProjectModal.jsx](file:///f:/SDP%204/src/components/dashboard/CreateProjectModal.jsx)), and central workspace page ([DashboardPage.jsx](file:///f:/SDP%204/src/pages/DashboardPage.jsx)).

### Module 4: Developer Profile & System Configuration (`100% COMPLETE`)
* Built profile router ([server/routes/userRoutes.js](file:///f:/SDP%204/server/routes/userRoutes.js)) and developer profile page ([ProfilePage.jsx](file:///f:/SDP%204/src/pages/ProfilePage.jsx)).
* Features identity cards, BUBT Student ID `22235103581`, storage quota progress bar (`0.42 MB / 1024 MB`), API key rotation, and user projects portfolio.

### Module 5: Core Web IDE Workspace Engine (`100% COMPLETE`)
* Built 3-pane split web IDE workspace page ([IDEWorkspacePage.jsx](file:///f:/SDP%204/src/pages/IDEWorkspacePage.jsx)).
* Built flat path string tree parser ([src/utils/flatTreeParser.js](file:///f:/SDP%204/src/utils/flatTreeParser.js)), left pane explorer ([FileExplorer.jsx](file:///f:/SDP%204/src/components/ide/FileExplorer.jsx)), center Monaco canvas ([MonacoEditorCanvas.jsx](file:///f:/SDP%204/src/components/ide/MonacoEditorCanvas.jsx)), and right live preview sandbox ([SandboxPreview.jsx](file:///f:/SDP%204/src/components/ide/SandboxPreview.jsx)).

### Module 6: Linear Patch Collaboration & Review Drawer (`100% COMPLETE`)
* Built reviewer patch queue router ([server/routes/patchRoutes.js](file:///f:/SDP%204/server/routes/patchRoutes.js)) and slide-out drawer ([ReviewDrawer.jsx](file:///f:/SDP%204/src/components/ide/ReviewDrawer.jsx)).
* Includes reviewer text delta interception and stacked diff rendering (red strikethroughs `-` / green highlights `+`).

### Module 7: Teammate Invite Acceptance Portal (`100% COMPLETE`)
* Built teammate invite handshake page ([InvitePortalPage.jsx](file:///f:/SDP%204/src/pages/InvitePortalPage.jsx)) with direct workspace entry.

### Module 8: Agentic AI Smart Review & Chatbot Assistant (`100% COMPLETE`)
* Built Express agentic AI router ([server/routes/aiAgentRoutes.js](file:///f:/SDP%204/server/routes/aiAgentRoutes.js)) and right-side slide-out chatbot drawer ([AgenticAIChatSidebar.jsx](file:///f:/SDP%204/src/components/ide/AgenticAIChatSidebar.jsx)).
* Injects project file index manifest + active file context, handles multi-model selection (`gemini-1.5-flash`, `gemini-1.5-pro`, `gpt-4o`, `claude-3-5-sonnet`), and provides an interactive **"APPLY EDITS TO WORKSPACE"** trigger button.

### Module 9: System Testing, QA & Quota Safety Audit (`100% COMPLETE`)
* Generated formal Lead QA Audit Report artifact ([system_testing_qa_audit.md](file:///C:/Users/zafor/.gemini/antigravity-ide/brain/ef963ef7-7356-408a-bc1f-1ac224e00255/system_testing_qa_audit.md)).
* Executed **24 Black-Box & White-Box Test Cases** (`100% Pass Rate`).
* Verified Firebase Spark plan read-quota safety through strict on-demand HTTP REST triggers.

### Module 10: Final Deployment & BUBT Academic Presentation (`100% COMPLETE`)
* Optimized Rollup manual chunks code-splitting in [vite.config.js](file:///f:/SDP%204/vite.config.js).
* Verified clean production build (`dist/`) compiling cleanly with 0 errors.

### Module 11: Real-Time Interactive Multi-Language Terminal Engine (`100% COMPLETE`)
* Built WebSocket terminal engine (`/ws/terminal`) supporting live stdin/stdout and multi-language compilation (C, C++, Java, C#, Python, Node.js, Bash).
* Integrated `@xterm/xterm` with FitAddon in [InteractiveTerminal.jsx](file:///f:/SDP%204/src/components/ide/InteractiveTerminal.jsx) with Ctrl+C interrupt signals.

### Module 12: Monaco Multi-Language Syntax Highlighting & Theme Sync (`100% COMPLETE`)
* Mapped file extensions for 15+ languages and registered custom `obsidian-dark` theme with high-contrast color tokens and `#07080B` background.

### Module 13: Terminal Identity, Permissions & System Credential Protection (`100% COMPLETE`)
* Implemented `whoami` and `auth`/`permissions` commands with security boundary guards blocking unauthorized inspection of `.env`, server configs, and database keys.

### Module 14: VS Code File Operations, 3-Dot Menus & Owner ZIP Archiving (`100% COMPLETE`)
* Implemented top File menu (New File, New Folder, Save, Save As, Owner-Only ZIP download), 3-dot contextual menus on files (export as .txt/.md/.doc/original, cut, copy, rename, delete) and folders.

### Module 15: Real-Time Inline AI Suggestions & Suggestive Writing Engine (`100% COMPLETE`)
* Registered Monaco inline completions provider for real-time ghost text with `Tab` accept and interactive AI suggestive writing prompt widget (`Ctrl+I` / `Cmd+I`).

### Module 16: Live Sandbox View Menu Toggle & 3-Partition Splitter Resizing (`100% COMPLETE`)
* Moved Live Sandbox to View menu with state toggle and close action; implemented draggable cyan glow splitters allowing full resizing for left explorer, center editor, and right sandbox/chat.

### Module 17: In-Browser React Transpiler & Scope Binding Engine (`100% COMPLETE`)
* Fixed React blank screen in SandboxPreview by binding standard React hooks globally, encoding JSX with `JSON.stringify`, and adding reliable Babel transpilation.

### Module 18: Local File/Folder/ZIP Import & Drag-Move Tree Reorganization (`100% COMPLETE`)
* Added full file/folder/ZIP import with constraint validation modal and enabled cursor grab-and-drag file moving across folders and root level with automatic path remapping.

### Module 19: Role-Based Personal DB Isolation & Owner-Gated Master Merge Engine (`100% COMPLETE`)
* Enforced strict isolation where collaborator edits save exclusively to the collaborator's personal database record and submit proposal patches for Owner review, while Master repository commits require Owner approval.

### Module 20: GitHub App Manifest Integration & 1-Click Code Push Engine (`100% COMPLETE`)
* Built GitHub App Manifest flow, OAuth token exchange, and automatic push to GitHub repositories with intelligent fallback to GitHub Contents API for uninitialized / empty repositories.

### Module 21: Developer Profile Avatar Persistence & Real-Time Storage Telemetry (`100% COMPLETE`)
* Persisted Base64 profile avatars in Firestore (`users/${cleanDocId}`) across login sessions and dynamically computed real-time project storage byte sizes.

### Module 22: Agentic AI Assistant Gemini Engine, Dynamic Discovery & Codebase Vision (`100% COMPLETE`)
* Built dynamic model discovery querying Google Gemini API live for active models (`gemini-3.6-flash`, etc.), formatted the whole codebase into system prompt context, added multi-session chat history drawer, and implemented floating `@` mention file autocomplete picker.

### Module 23: Agentic AI File Modification Engine & Monaco Editor Live Sync (`100% COMPLETE`)
* Enabled flexible path/suffix matching (`src/main.py` vs `main.py`), added Monaco buffer sync `useEffect`, and provided visual confirmation (`✅ EDITS APPLIED TO WORKSPACE`) with `⚡ Apply All`.

### Module 24: Universal Top-Level Brand Navigation & Routing Optimization (`100% COMPLETE`)
* Standardized ObsidianIDE brand logo across all application headers with `<Link to="/dashboard">` for guaranteed 1-click return to the central workspace dashboard.

---

## 🛠️ Implemented Architectural Optimizations Checklist

- [x] **Optimization 1 (Multi-File Template Seeding)**: Seeds starter files on project creation (`server/routes/fileRoutes.js`).
- [x] **Optimization 2 (Inline Edit Profile Modal)**: Inline modal overlay allowing developers to update display name, student ID, and designation (`src/pages/ProfilePage.jsx`).
- [x] **Optimization 3 (Reviewer Save Interception)**: Reviewer save actions automatically submit deltas to `pending_patches` queue (`src/pages/IDEWorkspacePage.jsx`).
- [x] **Optimization 4 (Notification Pulse Badge)**: Glowing purple pulse dot on header Review Actions button when patches exist (`src/pages/IDEWorkspacePage.jsx`).
- [x] **Optimization 5 (Direct Invite Link Copying)**: Quick `INVITE` buttons on cards and IDE toolbar that copy `/invite/{projectId}` straight to clipboard.
- [x] **Optimization 6 (Multi-Session Chat History & Key Persistence)**: Persists AI chat sessions in `localStorage` per `projectId` and stores custom API keys securely.
- [x] **Optimization 7 (Rollup Manual Chunks Code-Splitting)**: Configured `manualChunks` in `vite.config.js` (`monaco-vendor`, `firebase-vendor`, `react-vendor`), producing clean production builds.
- [x] **Optimization 8 (Multi-Language Sandbox Terminal)**: Real-time compiler pipelines for C, C++, Java, C#, Python, Node.js, and Bash (`server/routes/terminalRoutes.js`).
- [x] **Optimization 9 (GitHub App Manifest 1-Click Push)**: Direct export and code commit push to GitHub repositories (`server/routes/githubRoutes.js`).
- [x] **Optimization 10 (Dynamic Whole-Codebase AI Vision & @-Mentions)**: Real-time Gemini API integration, active model filtering, whole project context, and `@` file picker autocomplete (`server/routes/aiAgentRoutes.js`, `AgenticAIChatSidebar.jsx`).
- [x] **Optimization 11 (Instant AI Code Application & Monaco Sync)**: 1-click application of AI-generated edits into workspace files and Monaco editor buffers (`IDEWorkspacePage.jsx`, `MonacoEditorCanvas.jsx`).
- [x] **Optimization 12 (Universal Dashboard Logo Routing)**: 1-click navigation to Dashboard via brand logo links across all pages (`IDEWorkspacePage.jsx`, `Header.jsx`, `TermsPage.jsx`).

---

## 🚀 How to Run the Project Locally

### 1. Start Express Backend Server
```bash
cd "f:/SDP 4"
node server/index.js
# Backend listening on http://localhost:5000
```

### 2. Start Vite Frontend Server
```bash
cd "f:/SDP 4"
npm run dev
# Frontend dev server running on http://localhost:3000
```

### 3. Build for Production Deployment
```bash
cd "f:/SDP 4"
npm run build
# Production dist bundle compiled in dist/
```

---

## 🎓 Guidance for BUBT Academic Defense Presentation

When presenting **ObsidianIDE** to the faculty defense board at BUBT:

1. **Highlight Flat File Path Mapping**: Explain how storing files as flat relative path strings (`filePath: "src/utils/parser.rs"`) in Cloud Firestore eliminates recursive database subcollection reads, guaranteeing fast operations while preserving free Firebase Spark quotas.
2. **Demonstrate Linear Patch Collaboration & Governance**: Show how project `OWNER`s retain complete merge authority while `EDITOR`s/`REVIEWER`s submit changes safely without overwriting master code.
3. **Demonstrate GitHub App 1-Click Cloud Push**: Show how an entire multi-file workspace can be pushed directly to GitHub, automatically initializing new repositories or updating existing branches.
4. **Demonstrate Dynamic Agentic AI Assistant**: Open the top-right **AI Assistant** drawer, test an API key, select an active Gemini model, type `@` to reference a file, ask the AI to refactor code across the repository, and click **"APPLY EDITS TO WORKSPACE"** to watch the code and Monaco editor update live!
