# SDP 4: ObsidianIDE — Step-by-Step Atomized Master Development Roadmap

> **Project Reference**: Web-Based Multi-Accessible IDE for Team Projects (BUBT SDP 4)  
> **Target**: 100% Full-Stack Execution, Testing, and Academic Deployment  

---

## 🏗️ Module 0: Project Architecture & Environment Initialization
*Goal: Establish clean frontend and backend project boilerplates.*

- [x] **Task 0.1**: Initialize React Single Page Application (Vite + React.js + Tailwind CSS) in root directory.
- [x] **Task 0.2**: Initialize Node.js + Express.js REST API server framework in `server/`.
- [x] **Task 0.3**: Configure Firebase Admin SDK (Server) and Firebase Web SDK (Client) credentials with `.env` key protection.
- [x] **Task 0.4**: Establish global state management with Context Providers (`AuthContext`, `ThemeContext`).

---

## 🎨 Module 1: Design System & SPA Routing Setup
*Goal: Connect all views into a single unified client-side router with the "Obsidian Flux" theme.*

- [x] **Task 1.1**: Install dependencies: `react-router-dom`, `@monaco-editor/react`, `lucide-react`, Material Symbols, `@xterm/xterm`, `jszip`.
- [x] **Task 1.2**: Create universal UI layout components: `Header.jsx`, `Sidebar.jsx`, `ThemeToggle.jsx`, `Footer.jsx`, `MainLayout.jsx`.
- [x] **Task 1.3**: Configure Client-Side Router (`BrowserRouter`) for all views:
  - `/` -> `LandingPage.jsx`
  - `/auth` -> `AuthPage.jsx`
  - `/onboarding` -> `OnboardingWizardPage.jsx`
  - `/dashboard` -> `DashboardPage.jsx`
  - `/profile` -> `ProfilePage.jsx`
  - `/ide/:projectId` -> `IDEWorkspacePage.jsx`
  - `/invite/:inviteId` -> `InvitePortalPage.jsx`

---

## 🔐 Module 2: Authentication & Onboarding Flow
*Goal: Implement user registration, login verification, and database tier onboarding.*

- [x] **Task 2.1**: Implement `LandingPage.jsx` with responsive feature cards and interactive launcher.
- [x] **Task 2.2**: Implement `AuthPage.jsx` with Firebase Auth (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, and Google OAuth).
- [x] **Task 2.3**: Build Express Backend JWT Middleware (`authMiddleware.js`) verifying Firebase Bearer tokens on protected API routes.
- [x] **Task 2.4**: Implement `OnboardingWizardPage.jsx` with personal database linking and Firebase project binding.

---

## 📂 Module 3: Central Workspace Dashboard & Project Management
*Goal: Build project creation, list filtering, and Google Docs-style collaborator management.*

- [x] **Task 3.1**: Implement `DashboardPage.jsx` with search filter, tabbed status filters, and 3-dot project contextual menus.
- [x] **Task 3.2**: Implement Express API Controller `POST /api/projects` (Initializes project, sets creator as `OWNER`, mirrors collaborator profiles).
- [x] **Task 3.3**: Implement Express API Controller `GET /api/projects` (Queries project metadata across user profiles and Firestore).
- [x] **Task 3.4**: Build "Create New Project" Modal component (`CreateProjectModal.jsx`) with inputs for Title, Language Stack, and Collaborator Emails + Roles.
- [x] **Task 3.5**: Implement Express API Controller `POST /api/projects/:id/invite` (Appends email & role, dispatches invitation emails).

---

## 👤 Module 4: Developer Profile & System Configuration
*Goal: Build identity settings, student ID verification, and storage quota inspection.*

- [x] **Task 4.1**: Implement `ProfilePage.jsx` with account info, role badge, and quota telemetry.
- [x] **Task 4.2**: Implement Express API Endpoint `GET /api/users/profile` returning profile metrics and storage quota utilization.
- [x] **Task 4.3**: Implement API Key Rotation Controller `POST /api/users/rotate-key`.

---

## 💻 Module 5: Core Web IDE Workspace Engine
*Goal: Build 3-pane split editor with Monaco integration, flat directory parser, and live sandbox.*

- [x] **Task 5.1**: Implement `IDEWorkspacePage.jsx` (3-pane split container with explorer, editor, preview, and bottom terminal).
- [x] **Task 5.2**: **Flat Directory Parser**: Built `parseFlatArrayToTreeNodes()` in `flatTreeParser.js` converting flat Firestore files into a rich hierarchical file explorer (`FileExplorer.jsx`).
- [x] **Task 5.3**: **Monaco Editor Canvas**: Mount `@monaco-editor/react`, bind editor value, and register custom `obsidian-dark` theme with high-contrast syntax tokens.
- [x] **Task 5.4**: **Atomic Save-and-Sync**: Direct Firestore `setDoc` persistence and backend sandbox file sync.
- [x] **Task 5.5**: **Live Preview Sandbox**: Embedded iframe preview supporting HTML, CSS, JavaScript, and dynamic Babel Standalone React component transpilation.
- [x] **Task 5.6**: **Google Meet Integration**: Link Meet session trigger in header toolbar.

---

## 🔀 Module 6: Linear Patch Collaboration & Review Drawer
*Goal: Implement Google Docs-style reviewer queue and patch approval flow.*

- [x] **Task 6.1**: Implement `ReviewDrawer.jsx` slide-out drawer overlay.
- [x] **Task 6.2**: Implement `POST /api/patches` staging patch proposals from `EDITOR` and `REVIEWER` roles.
- [x] **Task 6.3**: Build text-delta diff renderer (Red strikethrough for removals, green highlights for additions).
- [x] **Task 6.4**: Implement `POST /api/projects/resolve-patch` allowing Project Owners to **APPROVE** or **REJECT** code patches.

---

## ✉️ Module 7: Teammate Invite Acceptance Portal
*Goal: Allow invited teammates to accept invitations and auto-join workspace.*

- [x] **Task 7.1**: Implement `InvitePortalPage.jsx` with dynamic URL token extraction and role preview.
- [x] **Task 7.2**: Implement `GET /api/projects/:projectId` and `POST /api/projects/:id/invite` with automatic collaborator document linking.

---

## 🤖 Module 8: Agentic AI Smart Review Integration (Gemini API)
*Goal: Implement server-side AI code error fixing inside the workspace.*

- [x] **Task 8.1**: Implement Express Endpoint `POST /api/ai-agent/chat` and `POST /api/ai-diagnostics` using `@google/generative-ai` SDK.
- [x] **Task 8.2**: Build IDE "AI Diagnostics" drawer tab and `AgenticAIChatSidebar.jsx` with one-click code injection triggers.

---

## 🧪 Module 9: System Testing, QA & Quota Safety Audit
*Goal: Validate complete system reliability and ensure zero Firebase quota overuse.*

- [x] **Task 9.1**: Perform End-to-End User Flow Tests (Landing -> Register -> Onboarding -> Create Project -> Edit -> Save -> Review Patch).
- [x] **Task 9.2**: Perform Firebase Spark Plan Audit (Zero continuous memory leaks, on-demand REST operations).
- [x] **Task 9.3**: Perform Security Audit (JWT token validation, 403 Forbidden guards on unauthorized access).

---

## 🚀 Module 10: Production Bundling & Academic Deployment Readiness
*Goal: Optimize bundle performance and finalize BUBT project defense documentation.*

- [x] **Task 10.1**: Configure Rollup `manualChunks` code-splitting (`vite.config.js`).
- [x] **Task 10.2**: Verify production build (`npm run build` completed cleanly in 3.44s).
- [x] **Task 10.3**: Maintain full academic documentation in `project documents/`.

---

## 💻 Module 11: Real-Time Interactive Multi-Language Terminal Engine
*Goal: Implement interactive terminal with live stdin/stdout and multi-language compilation.*

- [x] **Task 11.1**: Build WebSocket terminal server on `/ws/terminal` (`server/routes/terminalRoutes.js`).
- [x] **Task 11.2**: Implement auto-compilation and execution pipelines for C (`gcc`), C++ (`g++`), Java (`java`), C# (`csc`), Python (`python -u`), Node.js (`node`), and Bash (`bash`).
- [x] **Task 11.3**: Integrate `@xterm/xterm` with FitAddon in `InteractiveTerminal.jsx` with Ctrl+C interrupt signals.

---

## 🎨 Module 12: Monaco Multi-Language Syntax Highlighting & Theme Sync
*Goal: Synchronize syntax coloring and dark mode palettes across all supported languages.*

- [x] **Task 12.1**: Map file extensions for C++, C, Java, C#, Python, Bash, Go, SQL, YAML, XML, and Markdown.
- [x] **Task 12.2**: Register custom `obsidian-dark` theme with high-contrast color tokens and `#07080B` background.

---

## 🛡️ Module 13: Terminal Identity, Permissions & System Credential Protection
*Goal: Enforce security boundaries and identity verification inside the terminal.*

- [x] **Task 13.1**: Implement `whoami` and `auth`/`permissions` shell inspection commands.
- [x] **Task 13.2**: Build security guard blocking unauthorized inspection of `.env`, server configurations, and database keys.

---

## 📁 Module 14: VS Code File Management, 3-Dot Menus & Owner ZIP Archiving
*Goal: Full-featured file/folder management in top menu and directory tree.*

- [x] **Task 14.1**: Top File Menu (New File, New Folder, Save & Sync, Save As, and Owner-Only ZIP download).
- [x] **Task 14.2**: JSZip packaging preserving folder hierarchies for Project Owners (`src/utils/fileExporter.js`).
- [x] **Task 14.3**: 3-dot contextual action menus on files (multi-format export .txt/.md/.doc/original, cut, copy, copy path, rename, delete) and folders (new file/subfolder, paste, cut, copy, rename, delete).

---

## 🤖 Module 15: Real-Time Inline AI Suggestions & Suggestive Writing Engine
*Goal: Implement inline ghost text completions and interactive suggestive writing in Monaco Editor.*

- [x] **Task 15.1**: Remove legacy static AI Review drawer panel and toolbar button.
- [x] **Task 15.2**: Register Monaco inline completions provider (`provideInlineCompletions`) for real-time ghost text with `Tab` accept.
- [x] **Task 15.3**: Build interactive AI suggestive writing prompt widget (`Ctrl+I` / `Cmd+I`) with instant code insertion.
- [x] **Task 15.4**: Create server-side `/api/ai/inline-suggest` and `/api/ai/suggestive-write` endpoints with Gemini AI and smart heuristics.

---

## 📐 Module 16: Live Sandbox View Menu Toggle & 3-Partition Splitter Resizing
*Goal: Move Live Sandbox to View menu and enable draggable 3-pane resizing.*

- [x] **Task 16.1**: Move Live Sandbox into top "View" menu as a toggleable option (`[✓ ON / OFF]`).
- [x] **Task 16.2**: Add `onClose` dismiss button (`✕`) in SandboxPreview header.
- [x] **Task 16.3**: Implement draggable vertical splitters with custom min/max bounds and `localStorage` persistence.
- [x] **Task 16.4**: Verify HTML and React JSX mini webpage compilation and rendering in Live Sandbox.

---

## ⚛️ Module 17: In-Browser React Transpiler & Scope Binding Engine
*Goal: Fix React JSX transpilation, hook scoping, and error handling in Live Sandbox.*

- [x] **Task 17.1**: Bind standard React hooks (`useState`, `useEffect`, `useRef`, etc.) to global scope in sandbox runtime.
- [x] **Task 17.2**: Encode React component source via `JSON.stringify` to prevent nested backtick template string collision.
- [x] **Task 17.3**: Integrate Babel Standalone with `presets: ['react', 'env']` and visual error boundary card.

---

## 📦 Module 18: Local File/Folder/ZIP Import & Drag-Move Tree Reorganization
*Goal: Import files/folders/ZIPs with constraint validation and enable cursor drag-and-drop tree reorganization.*

- [x] **Task 18.1**: Build `fileImporter.js` for single/multi files, directory projects, and ZIP extraction via `JSZip`.
- [x] **Task 18.2**: Implement `ImportAnalysisModal.jsx` for pre-import constraint validation and batch size safety analysis.
- [x] **Task 18.3**: Enable HTML5 `draggable` on all files and folders in `FileExplorer.jsx` with circular move protection and root dropzone.
- [x] **Task 18.4**: Synchronize imported and moved file hierarchies to Firestore database (`projects/${projectId}` and `files`).
- [x] **Task 18.5**: Implement backend `/api/projects/update-files` endpoint with automated QA test suite.

---

## 🛡️ Module 19: Role-Based Personal DB Isolation & Owner-Gated Master Merge Engine
*Goal: Isolate collaborator edits, imports, and file operations to personal database drafts until Owner review & approval.*

- [x] **Task 19.1**: Gate all Save, Save & Sync, Create File/Folder, Delete, Move, and Batch Import operations behind `isProjectOwner`.
- [x] **Task 19.2**: Save collaborator actions exclusively to `users/${uid}/projects/${projectId}` (`draft_files` in Firestore).
- [x] **Task 19.3**: Auto-generate structured proposal patches (`POST /api/projects/save-and-sync`) for `MODIFY_FILE`, `CREATE_FILE`, `DELETE_FILE`, `MOVE_ITEM`, and `IMPORT_BATCH`.
- [x] **Task 19.4**: Upgrade `ReviewDrawer.jsx` to render all proposal types with visual diffs, manifest inspectors, and 1-click Approve/Reject buttons.
- [x] **Task 19.5**: Extend `POST /api/projects/resolve-patch` to atomically merge approved patches into canonical master `project_files`.
- [x] **Task 19.6**: Build and execute comprehensive automated QA test suite `test_role_based_save_and_review.js` verifying 100% pass rate.

---

## 🐙 Module 20: GitHub App Manifest Integration & 1-Click Code Push Engine
*Goal: Implement OAuth App Manifest integration, token exchange, and automatic GitHub repository export.*

- [x] **Task 20.1**: Build GitHub App Manifest generator (`server/routes/githubRoutes.js`) with configured `callback_urls` and `setup_url`.
- [x] **Task 20.2**: Implement GitHub App installation redirect flow (`/apps/{slug}/installations/new`).
- [x] **Task 20.3**: Build uninitialized / empty repository push engine using GitHub Contents API fallback (`PUT /repos/{owner}/{repo}/contents/{path}`).
- [x] **Task 20.4**: Implement `ExportToGitHubModal.jsx` and `ConnectGitHubPage.jsx` for 1-click project export and OAuth linking.

---

## 👤 Module 21: Developer Profile Avatar Persistence & Real-Time Storage Telemetry
*Goal: Persist user profile pictures across auth lifecycles and calculate real-time workspace storage utilization.*

- [x] **Task 21.1**: Store profile avatars in Firestore `users/{cleanDocId}` (`info.avatarUrl`) with `PUT /api/users/profile` synchronization.
- [x] **Task 21.2**: Preserve and restore avatars across logout, login, and page refresh sessions in `AuthContext.jsx`.
- [x] **Task 21.3**: Implement dynamic storage quota calculation summing UTF-8 byte sizes across all user projects.
- [x] **Task 21.4**: Build unified project portfolio counter dynamically querying owned and collaborated repositories.

---

## 🤖 Module 22: Agentic AI Assistant Gemini Engine, Dynamic Discovery & Codebase Vision
*Goal: Upgrade Agentic AI Assistant with dynamic model discovery, whole codebase context, and @-mention file referencing.*

- [x] **Task 22.1**: Implement dynamic Google Gemini model discovery (`GET /api/ai-agent/models`) filtering out deprecated 404 models and validating active models.
- [x] **Task 22.2**: Build live API key validator (`POST /api/ai-agent/validate-key`) for in-vault key testing and model sync.
- [x] **Task 22.3**: Inject whole-codebase context (`POST /api/ai-agent/chat`) formatting full file tree and source code into system prompt.
- [x] **Task 22.4**: Implement multi-session chat history (`localStorage`) with `+ New Chat` and history drawer in `AgenticAIChatSidebar.jsx`.
- [x] **Task 22.5**: Build interactive floating `@` file mention autocomplete picker with keyboard navigation (Up/Down/Enter/Tab/Escape) and click insertion.
- [x] **Task 22.6**: Provide unrestricted API Key Vault allowing free copy-pasting of custom API keys.

---

## ⚡ Module 23: Agentic AI File Modification Engine & Monaco Editor Live Sync
*Goal: Seamlessly apply AI-proposed file edits into the workspace and synchronize active Monaco Editor buffers.*

- [x] **Task 23.1**: Upgrade `handleApplyAIModifications` in `IDEWorkspacePage.jsx` with flexible path and suffix matching (`src/main.py` vs `main.py`).
- [x] **Task 23.2**: Add Monaco editor dynamic model synchronization `useEffect` in `MonacoEditorCanvas.jsx` to update buffer immediately when external content changes.
- [x] **Task 23.3**: Provide visual status confirmation (`✅ EDITS APPLIED TO WORKSPACE`) and `⚡ Apply All` batch modification button in `AgenticAIChatSidebar.jsx`.

---

## 🧭 Module 24: Universal Top-Level Brand Navigation & Routing Optimization
*Goal: Ensure the ObsidianIDE brand logo provides 1-click return to Dashboard from any view across the platform.*

- [x] **Task 24.1**: Wrap ObsidianIDE brand logo in `IDEWorkspacePage.jsx` with React Router `<Link to="/dashboard">` and navigation fallback.
- [x] **Task 24.2**: Standardize brand logo in `Header.jsx` and `TermsPage.jsx` with gradient icon and direct `<Link to="/dashboard">`.
- [x] **Task 24.3**: Verify production build (`npm run build` completed cleanly with 0 errors).

