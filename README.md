# ⚡ ObsidianIDE — Web-Based Multi-Accessible Team IDE

[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Monaco Editor](https://img.shields.io/badge/Monaco_Editor-0.52-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://microsoft.github.io/monaco-editor/)
[![Firebase](https://img.shields.io/badge/Firebase-11.6-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Express](https://img.shields.io/badge/Express-4.21-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)

> A modern, cloud-integrated web IDE designed for multi-user software engineering teams. Built on top of the custom **Obsidian Flux** cyber-dark design system, ObsidianIDE features real-time conflict-free collaboration via an **Asynchronous Linear Patch Review Flow**, flat-tree Cloud Firestore parsing, and an integrated **Agentic AI Assistant** powered by Google Gemini.

---

> [!NOTE]
> 🚧 **ACTIVE DEVELOPMENT / WORK IN PROGRESS (WIP)**  
> This project is currently under active development as part of academic coursework (BUBT SDP 4). Feature modules, backend server endpoints, and frontend scripts will receive continuous updates and iterations over time.

---

## 📌 Project Overview & Highlights

- 🖥️ **Monaco Code Canvas**: Full VS Code editing experience powered by `@monaco-editor/react` with multi-tab management, syntax highlighting, and custom dark mode themes.
- 🔀 **Linear Patch Review Flow**: Resolves file editing locking conflicts by allowing collaborators to submit non-blocking text diffs into a unified Review Drawer for owner merge approval.
- 🤖 **Agentic AI Assistant**: Built-in AI code diagnostics powered by **Google Gemini 1.5 Flash**. Scans project file manifests, explains code errors, and applies code refactoring directly into the editor with one click.
- ⚡ **Optimized Cloud Architecture**: Maps project directory trees as flat relative path strings (`src/index.js`) in Cloud Firestore, eliminating nested subcollection overhead and preserving free tier quotas.

---

## 🔐 Environment Configuration & API Keys

> [!IMPORTANT]
> All sensitive API keys and secrets have been removed from source control. You must configure your own environment keys before starting the project.

### Step 1: Copy Environment Template
In the root directory of `f:\SDP 4`, copy `.env.example` to create your local `.env` file:
```bash
cp .env.example .env
```

### Step 2: Add Your API Keys
Open `.env` and fill in your credentials:

```env
# 1. Firebase Web App Credentials (Get from Firebase Console -> Project Settings)
VITE_FIREBASE_API_KEY=ADD_YOUR_FIREBASE_API_KEY_HERE
VITE_FIREBASE_AUTH_DOMAIN=ADD_YOUR_FIREBASE_AUTH_DOMAIN_HERE
VITE_FIREBASE_PROJECT_ID=ADD_YOUR_FIREBASE_PROJECT_ID_HERE
VITE_FIREBASE_STORAGE_BUCKET=ADD_YOUR_FIREBASE_STORAGE_BUCKET_HERE
VITE_FIREBASE_MESSAGING_SENDER_ID=ADD_YOUR_FIREBASE_MESSAGING_SENDER_ID_HERE
VITE_FIREBASE_APP_ID=ADD_YOUR_FIREBASE_APP_ID_HERE
VITE_FIREBASE_MEASUREMENT_ID=ADD_YOUR_FIREBASE_MEASUREMENT_ID_HERE

# 2. Express Backend Port Configuration
PORT=5000
NODE_ENV=development

# 3. Google Gemini API Key (Get from Google AI Studio -> https://aistudio.google.com/)
GEMINI_API_KEY=ADD_YOUR_GEMINI_API_KEY_HERE
```

---

## 🛠️ Technology Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend Framework** | React 19 SPA, Vite 6, Tailwind CSS 3.4, Lucide React |
| **Code Editor Engine** | Monaco Editor (`@monaco-editor/react`) |
| **Backend REST API** | Node.js v20, Express 4.21, Cors, Dotenv |
| **Cloud Database & Auth** | Firebase Web SDK v11 (Authentication & Firestore) |
| **AI Review Engine** | `@google/generative-ai` (Gemini 1.5 Flash API) |

---

## 🚀 How to Run Locally

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Express Backend Server
```bash
npm run dev:backend
# Express REST server starts on http://localhost:5000
```

### 3. Run Vite Frontend Client
In a separate terminal window:
```bash
npm run dev
# Vite dev server starts on http://localhost:3000
```

### 4. Build for Production Deployment
```bash
npm run build
# Compiles optimized production bundle in dist/
```

---

## 🎓 Academic Attribution & Roster

**Academic Institution**: Bangladesh University of Business and Technology (BUBT) — Department of CSE  
**Course**: Software Development Project 4 (SDP 4)  

- **Md. Emam Zafor Saadik** (ID: `22235103581`) — *Lead Full-Stack Architect & Backend Engineer* ([@zaforsaadik7](https://github.com/zaforsaadik7))
- **Samia Sultana** (ID: `22235103292`) — *Frontend UI/UX Engineer*
- **Halima Tus Sadia** (ID: `22235103557`) — *Database & QA Engineer*

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
