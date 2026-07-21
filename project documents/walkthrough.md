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
* Verified clean production build (`dist/`) compiling in **2.35s with 0 errors**.

---

## 🛠️ Implemented Architectural Optimizations Checklist

- [x] **Optimization 1 (Multi-File Template Seeding)**: Seeds 3–4 starter files (`src/main.rs`, `Cargo.toml`, etc.) on project creation (`server/routes/fileRoutes.js`).
- [x] **Optimization 2 (Inline Edit Profile Modal)**: Inline modal overlay allowing developers to update display name, student ID, and designation (`src/pages/ProfilePage.jsx`).
- [x] **Optimization 3 (Reviewer Save Interception)**: Reviewer save actions automatically submit deltas to `pending_patches` queue (`src/pages/IDEWorkspacePage.jsx`).
- [x] **Optimization 4 (Notification Pulse Badge)**: Glowing purple pulse dot (`animate-pulse shadow`) on header Review Actions button when patches exist (`src/pages/IDEWorkspacePage.jsx`).
- [x] **Optimization 5 (Direct Invite Link Copying)**: Quick `INVITE` buttons on cards and IDE toolbar that copy `/invite/{projectId}` straight to clipboard (`src/components/dashboard/ProjectCard.jsx`).
- [x] **Optimization 6 (Chat History & Key Persistence)**: Persists AI chat thread into `localStorage` per `projectId` (`obsidian_ai_chat_${projectId}`) and stores custom API keys securely (`src/components/ide/AgenticAIChatSidebar.jsx`).
- [x] **Optimization 7 (Rollup Manual Chunks Code-Splitting)**: Configured `manualChunks` in `vite.config.js` (`monaco-vendor`, `firebase-vendor`, `react-vendor`), reducing build time to 2.35s with 0 chunk size warnings.

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
2. **Demonstrate Linear Patch Collaboration**: Show how project `OWNER`s retain complete merge authority while `REVIEWER`s submit text deltas into a clean review drawer.
3. **Demonstrate Agentic AI Integration**: Open the top-right **AI Assistant** drawer, show the masked password API key vault, select `Gemini 1.5 Flash`, and demonstrate how the agent uses project file manifest context to generate refactored code and apply it directly to the editor canvas with one click!
