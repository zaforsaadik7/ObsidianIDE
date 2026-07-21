# SDP 4: ObsidianIDE — Step-by-Step Atomized Master Development Roadmap

> **Project Reference**: Web-Based Multi-Accessible IDE for Team Projects (BUBT SDP 4)  
> **Target**: 100% Full-Stack Execution, Testing, and Academic Deployment  

---

## 🏗️ Module 0: Project Architecture & Environment Initialization
*Goal: Establish clean frontend and backend project boilerplates.*

- [ ] **Task 0.1**: Initialize React Single Page Application (Vite + React.js + Tailwind CSS) in `frontend/`.
- [ ] **Task 0.2**: Initialize Node.js + Express.js REST API server framework in `backend/`.
- [ ] **Task 0.3**: Configure Firebase Admin SDK (Server) and Firebase Web SDK (Client) credentials with `.env` key protection.
- [ ] **Task 0.4**: Establish global state management or Context Provider (`AuthContext`, `ProjectContext`).

---

## 🎨 Module 1: Design System & SPA Routing Setup
*Goal: Connect the 8 views into a single unified client-side router with the "Obsidian Flux" theme.*

- [ ] **Task 1.1**: Install dependencies: `react-router-dom`, `@monaco-editor/react`, `lucide-react` / Material Symbols.
- [ ] **Task 1.2**: Create universal UI components: `Header.jsx`, `Sidebar.jsx`, `ThemeToggle.jsx`, `Footer.jsx`.
- [ ] **Task 1.3**: Configure Client-Side Router (`BrowserRouter`) for all 8 views:
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

- [ ] **Task 2.1**: Convert `landing_page_academic_engineering/code.html` into `LandingPage.jsx`.
- [ ] **Task 2.2**: Convert `authentication_login_register/code.html` into `AuthPage.jsx` with Firebase Auth (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`).
- [ ] **Task 2.3**: Build Express Backend JWT Middleware (`authMiddleware.js`) verifying Firebase Bearer tokens on protected API routes.
- [ ] **Task 2.4**: Convert `database_onboarding_wizard/code.html` into `OnboardingWizardPage.jsx` (Save user `storageStrategy` in Firestore `users` collection).

---

## 📂 Module 3: Central Workspace Dashboard & Project Management
*Goal: Build project creation, list filtering, and Google Docs-style collaborator management.*

- [ ] **Task 3.1**: Convert `central_workspace_dashboard/code.html` into `DashboardPage.jsx`.
- [ ] **Task 3.2**: Implement Express API Controller `POST /api/projects` (Initializes project, sets creator as `OWNER`).
- [ ] **Task 3.3**: Implement Express API Controller `GET /api/projects` (Fetches project cards where user email exists in `collaborators` map).
- [ ] **Task 3.4**: Build "Create New Project" Modal component (`CreateProjectModal.jsx`) with inputs for Title, Language Stack, and Collaborator Emails + Roles (`OWNER`, `EDITOR`, `REVIEWER`).
- [ ] **Task 3.5**: Implement Express API Controller `POST /api/projects/:id/invite` (Appends email & role to project, generates invite link).

---

## 👤 Module 4: Developer Profile & System Configuration
*Goal: Build identity settings, student ID verification, and storage quota inspection.*

- [ ] **Task 4.1**: Convert `developer_profile_configuration/code.html` into `ProfilePage.jsx`.
- [ ] **Task 4.2**: Implement Express API Endpoint `GET /api/users/profile` returning profile metrics and storage quota utilization (`0.42 MB / 1024 MB`).
- [ ] **Task 4.3**: Implement API Key Rotation Controller `POST /api/users/rotate-key`.

---

## 💻 Module 5: Core Web IDE Workspace Engine (The Core Product)
*Goal: Build 3-pane split editor with Monaco integration, flat directory parser, and live sandbox.*

- [ ] **Task 5.1**: Convert `advanced_ide_quantum_lattice/code.html` into `IDEWorkspacePage.jsx` (3-pane split container).
- [ ] **Task 5.2**: **Flat Directory Parser**: Build frontend utility `parseFlatArrayToTreeNodes()` converting flat Firestore file array (`src/utils/parser.rs`) into a visual left-pane file explorer (`FileExplorer.jsx`).
- [ ] **Task 5.3**: **Monaco Editor Wrapper**: Mount `@monaco-editor/react` in center pane, bind editor value to local React state `currentFileContent`, and trigger static cyan unsaved dot indicator when local text differs from saved state.
- [ ] **Task 5.4**: **Atomic Save-and-Sync**:
  - Implement Express Controller `GET /api/files/:projectId` (Fetches flat array of file objects).
  - Implement Express Controller `PUT /api/files/:fileId` (Triggered **only** when clicking manual "Save Changes" button, updates Firestore record for `OWNER` or `EDITOR`).
- [ ] **Task 5.5**: **Client-Side Sandbox Preview**: Embed right-pane `<iframe srcDoc={currentFileContent} sandbox="allow-scripts"></iframe>` for instant HTML/JS execution.
- [ ] **Task 5.6**: **Google Meet Integration**: Wire "Link Google Meet" header button to open Google Calendar/Meet URL pre-filled with collaborator emails.

---

## 🔀 Module 6: Linear Patch Collaboration & Review Drawer
*Goal: Implement Google Docs-style reviewer queue and patch approval flow.*

- [ ] **Task 6.1**: Convert `collaboration_review_drawer/code.html` into `ReviewDrawer.jsx` slide-out drawer overlay.
- [ ] **Task 6.2**: Implement Express Controller `POST /api/patches` (When a `REVIEWER` user clicks "Save Changes", it pushes a delta object to `pending_patches` instead of mutating primary file).
- [ ] **Task 6.3**: Build text-delta diff renderer component (Red strikethrough for removed lines, green highlight for added lines).
- [ ] **Task 6.4**: Implement Express Controller `POST /api/patches/:patchId/resolve` (Owner approves atomic merge or rejects patch, updating badge counters).

---

## ✉️ Module 7: Teammate Invite Acceptance Portal
*Goal: Allow invited teammates to accept invitations and auto-join workspace.*

- [ ] **Task 7.1**: Convert `teammate_invite_acceptance_portal/code.html` into `InvitePortalPage.jsx`.
- [ ] **Task 7.2**: Implement Express Endpoint `GET /api/invites/:inviteId` to verify token details and auto-route user to `/ide/:projectId` upon accepting.

---

## 🤖 Module 8: Agentic AI Smart Review Integration (Gemini API)
*Goal: Implement server-side AI code error fixing inside the workspace.*

- [ ] **Task 8.1**: Implement Express Endpoint `POST /api/ai-review` using server-side `@google/generative-ai` SDK.
- [ ] **Task 8.2**: Build IDE "Run AI Diagnostics" menu button and bottom sliding terminal panel displaying Gemini bug analysis and code fixes.

---

## 🧪 Module 9: System Testing, QA & Quota Safety Audit
*Goal: Validate complete system reliability and ensure zero Firebase quota overuse.*

- [ ] **Task 9.1**: Perform End-to-End User Flow Test (Landing -> Register -> Onboarding -> Create Project -> Edit -> Save -> Review Patch).
- [ ] **Task 9.2**: Perform Firebase Spark Plan Audit (Confirm zero continuous `onSnapshot` listeners and zero memory leaks).
- [ ] **Task 9.3**: Perform Security Audit (Verify JWT token authentication on all Express endpoints and secret key protection).

---

## 🚀 Module 10: Final Deployment & BUBT Academic Presentation
*Goal: Deploy working application to production and finalize report presentation.*

- [ ] **Task 10.1**: Deploy Express Backend API to Render serverless host.
- [ ] **Task 10.2**: Deploy React Frontend to Vercel.
- [ ] **Task 10.3**: Finalize academic report screenshots, architecture diagrams, and slide deck for BUBT submission.
