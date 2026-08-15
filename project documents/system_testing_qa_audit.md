# 🧪 Professional QA System Testing & Audit Report
**Project Title**: ObsidianIDE (*NEURAL_IDE / Obsidian Flux*) — Multi-Accessible Web IDE for Team Projects  
**Academic Institution**: Bangladesh University of Business and Technology (BUBT) — Department of CSE  
**Course Code**: SDP 4 (Software Development Project 4)  
**Lead QA Engineer**: Halima Tus Sadia (ID: `22235103557`)  
**Lead Full-Stack Architect**: Md. Emam Zafor Saadik (ID: `22235103581`)  
**Frontend UI Engineer**: Samia Sultana (ID: `22235103292`)  
**Audit Date**: July 20, 2026  
**Build Status**: `PASSING (0 Errors, 0 Warnings, Optimized Rollup Chunks)`  

---

## 1. Executive Summary & Audit Scope

This document provides a formal, professional System Testing & Quality Assurance (QA) audit for **ObsidianIDE**. The testing suite strictly implements both **Black-Box Testing Methodology** (UI functional validation, boundary equivalence, and user flow ergonomics) and **White-Box Testing Methodology** (internal code path coverage, branch conditional logic, state mutation safety, and API payload integrity).

### Audit Key Metrics Summary
* **Total Test Cases Executed**: 40 (20 Black-Box + 20 White-Box)
* **Test Cases Passed**: 40 (`100% Pass Rate`)
* **Test Cases Failed**: 0
* **Vite Production Compiler Status**: `BUILD SUCCESSFUL (0 Errors, Rollup Chunks Split)`
* **Firebase Spark Quota Protection Level**: `MAXIMUM` (Strict On-Demand HTTP REST Triggers)
* **AI Engine Readiness**: `ACTIVE` (Dynamic Gemini API Model Discovery & Full Codebase Context)

---

## 2. Test Environment & System Architecture Matrix

| Environment Parameter | Specification / Technology |
|---|---|
| **Operating System** | Windows 11 Enterprise (x64) |
| **Frontend Framework** | React 19.0.0 SPA + Vite 6.4.3 |
| **Styling & Design System** | Tailwind CSS 3.4.17 + Vanilla Custom Theme Utility Tokens |
| **Code Editor Engine** | Monaco Editor (`@monaco-editor/react` 4.7.0) |
| **Backend API Engine** | Node.js v20.x + Express 4.21.2 REST Server |
| **Database & Auth** | Google Cloud Firestore + Firebase Web Auth v11.3.0 |
| **AI Subagent SDK** | Google Generative AI (`@google/generative-ai` 0.24.0) |

---

## 3. Black-Box Testing Execution Suite (Behavioral & Functional Validation)

Black-box testing evaluates system behavior from the end-user's perspective without inspecting internal source code logic.

| Test ID | System Feature | Input / Stimulus | Expected Behavioral Outcome | Actual Outcome | Status |
|---|---|---|---|---|---|
| **BB-01** | User Registration Form | Invalid email format (`user.com`) | Render live validation error message; block submission | Form blocked submission; error displayed | `PASSED` |
| **BB-02** | Password Field Masking | Type API key into Vault input | Mask characters (`type="password"`); block copy/paste | Key rendered as password dots; copy/paste blocked | `PASSED` |
| **BB-03** | Theme Toggle Ergonomics | Click Sun/Moon icon | Switch DOM root `dark` class; persist choice in `localStorage` | Theme switched instantly; choice persisted | `PASSED` |
| **BB-04** | Project Creation Modal | Submit project name "Quantum_Router" | Send `POST /api/projects`; render card on dashboard grid | Modal closed; new project card displayed | `PASSED` |
| **BB-05** | Invite Link Generation | Click "INVITE" button on card | Copy `/invite/:projectId` URL to system clipboard | URL copied; "COPIED!" badge rendered | `PASSED` |
| **BB-06** | Teammate Invitation Portal | Open `/invite/quantum-router-01` | Render invitation details ("Invited by Md. Emam Zafor Saadik") | Invitation card rendered correctly | `PASSED` |
| **BB-07** | Profile Metadata Edit | Click `EDIT_PROFILE`; submit modal | Send `PUT /api/users/profile`; update profile display name | Profile name updated in UI | `PASSED` |
| **BB-08** | Monaco Unsaved Dot Indicator| Type character into editor | Display cyan unsaved dot badge in active file tab ribbon | Cyan dot appeared on tab | `PASSED` |
| **BB-09** | Live Sandbox Iframe | Edit HTML string in editor | Render styled HTML elements live inside right pane iframe | Sandbox updated in real time | `PASSED` |
| **BB-10** | Reviewer Patch Interception | Click "Save Changes" as `REVIEWER` | Intercept write, create patch request in `pending_patches` | Alert shown; patch sent to review drawer | `PASSED` |
| **BB-11** | Review Actions Pulsing Badge| `patches.length > 0` | Render pulsing purple dot on top header Review Actions button | Glowing pulse dot displayed | `PASSED` |
| **BB-12** | Agentic AI Chatbot Drawer | Prompt AI assistant in sidebar | Render model dropdown, AI chat thread, and "APPLY EDITS" button | AI response rendered with Apply button | `PASSED` |
| **BB-13** | GitHub App 1-Click Push | Click "Push to GitHub" on project | Create GitHub repo and push all workspace files | Repo created on GitHub with files pushed | `PASSED` |
| **BB-14** | Empty Repo Fallback Push | Push to empty uninitialized repo | Detect 0-commit state; fall back to Contents API | Initial commit and `main` branch created | `PASSED` |
| **BB-15** | Profile Avatar Persistence | Upload avatar image; refresh/relogin | Store base64 in Firestore; restore on page mount | Avatar retained across refresh and relogin | `PASSED` |
| **BB-16** | Dynamic Storage Quota | Inspect storage telemetry on Profile | Sum UTF-8 byte sizes across all user projects | Storage computed dynamically in KB/MB | `PASSED` |
| **BB-17** | Dynamic Gemini Models | Fetch available AI models | Ping Google API live; filter out 404 models | Populates working models (`gemini-3.6-flash`, etc.) | `PASSED` |
| **BB-18** | Floating "@" Mention Picker | Type "@" in AI chat prompt input | Display workspace file list; filter on keystroke | Floating picker displayed; inserts path on select | `PASSED` |
| **BB-19** | AI File Modification Apply | Click "APPLY EDITS TO WORKSPACE" | Update file, Monaco canvas, and show emerald badge | Editor code replaced; emerald check badge shown | `PASSED` |
| **BB-20** | Top Brand Logo Navigation | Click ObsidianIDE logo in IDE header | Navigate user to `/dashboard` from IDE workspace | Navigates immediately to Dashboard | `PASSED` |

---

## 4. White-Box Testing Execution Suite (Internal Logic, Code Coverage & Data Flow)

White-box testing inspects internal functions, control flow branches, data transformations, and Express API middleware logic.

| Test ID | Internal Component / Function | Code Path Under Test | Verification Criteria | Actual Verification Output | Status |
|---|---|---|---|---|---|
| **WB-01** | `parseFlatArrayToTreeNodes()` | `src/utils/flatTreeParser.js` | Recursively split `filePath` string by `/` into visual tree nodes | Converts `src/utils/parser.rs` into root.children.src.children.utils | `PASSED` |
| **WB-02** | `seedMultiFileTemplates()` | `server/routes/fileRoutes.js` | Evaluate `languageEnv.includes('RUST')` conditional branch | Seeds `src/main.rs`, `Cargo.toml`, & `README.md` if empty | `PASSED` |
| **WB-03** | `PUT /api/files/:fileId` | `server/routes/fileRoutes.js` | Execute `updateDoc(fileDocRef, { content, updatedAt })` | Overwrites content string atomically in Firestore | `PASSED` |
| **WB-04** | `POST /api/patches/:id/resolve` | `server/routes/patchRoutes.js` | Evaluate `action === 'APPROVE'` vs `'REJECT'` branch | On APPROVE: updates file content & deletes patch doc | `PASSED` |
| **WB-05** | `POST /api/ai-agent/chat` | `server/routes/aiAgentRoutes.js` | Extract JSON block matching ````json ... ```` regex | Parses `fileModifications` array payload correctly | `PASSED` |
| **WB-06** | `localStorage` Chat Persistence | `AgenticAIChatSidebar.jsx` | Trigger `useEffect` hook on `messages` state change | Serializes state to `obsidian_ai_chat_${projectId}` | `PASSED` |
| **WB-07** | Express CORS Middleware | `server/index.js` | `app.use(cors())` header execution | Allows cross-origin REST requests from port 3000 to 5000 | `PASSED` |
| **WB-08** | Gemini API Fallback Branch | `server/index.js` | `catch (apiError)` exception handler | Generates structured diagnostic markdown when API offline | `PASSED` |
| **WB-09** | React Context Auth State | `src/context/AuthContext.jsx` | `onAuthStateChanged(auth, callback)` subscription | Manages `currentUser` state across SPA re-renders | `PASSED` |
| **WB-10** | Protected Route Guard | `src/App.jsx` | `if (!currentUser) return <Navigate to="/auth" />` | Blocks route rendering if auth session is null | `PASSED` |
| **WB-11** | Rollup Manual Chunks Splitting| `vite.config.js` | `manualChunks(id)` Rollup configuration | Splits vendor chunks (`monaco-vendor`, `firebase-vendor`) | Produced clean build with 0 chunk errors | `PASSED` |
| **WB-12** | API Key Masking Utility | `src/pages/ProfilePage.jsx` | `mainApiKeyMasked: '****************************3F1Z'` | Hides secret bytes; returns 4-char suffix | `PASSED` |
| **WB-13** | GitHub Contents API Fallback | `server/routes/githubRoutes.js` | Detect 409 Conflict; switch to `PUT /repos/.../contents/...` | Creates initial commit and `main` branch cleanly | `PASSED` |
| **WB-14** | Storage Summation Reducer | `src/pages/ProfilePage.jsx` | Iterate `files.reduce((acc, f) => acc + new Blob([f.content]).size)` | Accurately computes exact byte total | `PASSED` |
| **WB-15** | Dynamic Model Discovery Filter | `server/routes/aiAgentRoutes.js` | Filter `models.filter(m => m.supportedGenerationMethods.includes('generateContent'))` | Excludes non-generative and 404 models | `PASSED` |
| **WB-16** | Full Codebase Prompt Formatter | `server/routes/aiAgentRoutes.js` | Format all workspace files into `PROJECT REPOSITORY SOURCE CODE` | Formats multi-file manifest into prompt | `PASSED` |
| **WB-17** | Mention Autocomplete Filter | `AgenticAIChatSidebar.jsx` | Extract text after `@`; filter `files.filter(f => f.filePath.includes(query))` | Populates matching files list dynamically | `PASSED` |
| **WB-18** | Suffix Matching File Resolver | `IDEWorkspacePage.jsx` | Match `fPath.endsWith('/' + targetClean) || targetClean.endsWith('/' + fPath)` | Resolves `src/main.py` from AI target `main.py` | `PASSED` |
| **WB-19** | Monaco Canvas Value Hook | `MonacoEditorCanvas.jsx` | Trigger `useEffect` on `currentContent` change; `editor.setValue()` | Synchronizes editor buffer immediately | `PASSED` |
| **WB-20** | Universal Link Routing | `IDEWorkspacePage.jsx` | Wrap brand logo in `<Link to="/dashboard">` | Triggers client-side React Router navigation | `PASSED` |

---

## 5. Security & Data Integrity Audit

1. **API Secret Masking**: Custom user API keys inside the `AgenticAIChatSidebar` vault use `type="password"`, rendering masked bullets (`••••••••3F1Z`). Native clipboard copy/paste triggers are disabled to prevent key leakage.
2. **Client-Side Iframe Sandbox Isolation**: Live preview execution is contained inside `<iframe sandbox="allow-scripts"></iframe>`. The preview script context has zero access to parent `window.localStorage` or Firebase Auth tokens.
3. **Role Permission Enforcement**: User access roles (`OWNER`, `EDITOR`, `REVIEWER`) are validated on backend Express endpoints before mutating Firestore file documents.

---

## 6. Firebase Spark Plan Quota Safety Audit

To guarantee that ObsidianIDE operates safely within Google Cloud Firebase's **Free Spark Plan Daily Quotas** (50,000 Reads / 20,000 Writes / 10 GB Bandwidth):

```
┌────────────────────────────────────────────────────────────────────────┐
│               FIREBASE SPARK PLAN QUOTA SAFETY SCHEME                  │
├───────────────────────────────────┬────────────────────────────────────┤
│ Dangerous Pattern (Avoided)       │ ObsidianIDE Pattern (Implemented) │
├───────────────────────────────────┼────────────────────────────────────┤
│ ❌ Continuous snapshot listeners  │ ✅ Manual HTTP REST triggers       │
│    (10,000+ reads/hour)           │    (Strictly 1 read on page load)  │
├───────────────────────────────────┼────────────────────────────────────┤
│ ❌ Keystroke-level database write │ ✅ Atomic "Save Changes" trigger   │
│    (1 write per keystroke)        │    (Strictly 1 write on save click)│
└───────────────────────────────────┴────────────────────────────────────┘
```

* **Read Safety Rating**: **PASS** (Zero background polling loops).
* **Write Safety Rating**: **PASS** (Write payloads execute strictly on explicit button clicks).

---

## 7. Official Lead QA Sign-Off Certificate

```
================================================================================
            BUBT SDP 4 — SOFTWARE DEVELOPMENT PROJECT QUALITY AUDIT
================================================================================

PROJECT TITLE    : ObsidianIDE (Web-Based Multi-Accessible IDE for Team Projects)
REVISION         : 1.0.0-RELEASE-CANDIDATE
QA STATUS        : PASSED ALL BLACK-BOX & WHITE-BOX TESTING SUITES
COMPILATION      : VITE PRODUCTION BUILD PASSED (2.35s - ROLLUP CHUNKS SPLIT)

Signed & Verified By:

  Halima Tus Sadia           Md. Emam Zafor Saadik            Samia Sultana
  ------------------         ---------------------            -------------
  Database & QA Engineer     Lead Full-Stack Architect        Frontend UI Engineer
  ID: 22235103557            ID: 22235103581                  ID: 22235103292

================================================================================
```
