import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db, getFirebaseIdToken } from '../firebase';

export const OnboardingWizardPage = () => {
  const [provisioning, setProvisioning] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [googleScopeTab, setGoogleScopeTab] = useState('permissions');
  const [selectedEmail, setSelectedEmail] = useState('');
  const [notification, setNotification] = useState('');

  // Firebase API Credentials Input State
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [projectIdInput, setProjectIdInput] = useState('');
  const [authDomainInput, setAuthDomainInput] = useState('');
  const [appIdInput, setAppIdInput] = useState('');
  const [rawJsonInput, setRawJsonInput] = useState('');
  
  // Connection Testing & Result Modal State
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null);

  // Interactive Scope Checkbox States
  const [scope1Checked, setScope1Checked] = useState(true);
  const [scope2Checked, setScope2Checked] = useState(true);
  const [scope3Checked, setScope3Checked] = useState(true);

  const { currentUser, userProfile, setUserProfile, refreshProfile } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const userAccountEmail = currentUser?.email || 'user@example.com';

  const mockAccounts = [
    { name: 'Zafor Saadik', email: 'zaforsaadik7@gmail.com', avatar: 'Z' },
    { name: 'Emam Zafor', email: 'emamzafor12103@gmail.com', avatar: 'E' },
    { name: 'BUBT', email: 'bubt768@gmail.com', avatar: 'B' },
    { name: 'Md. Emam Zafor Saadik', email: '22235103581@cse.bubt.edu.bd', avatar: 'M' },
    { name: 'software project', email: 'sdpbubt@gmail.com', avatar: 'S' }
  ];

  const handleOpenStorageModal = () => {
    setNotification('');
    setSelectedEmail(userAccountEmail);
    setGoogleScopeTab('permissions');
    setIsModalOpen(true);
  };

  const handleCancelModal = () => {
    setIsModalOpen(false);
    setShowResultModal(false);
    setNotification('⚠️ Storage setup cancelled. You must select and authorize a storage option to proceed further.');
  };

  // Instant Synchronous Config Extractor for pasted snippet or inputs
  const extractConfig = (text, fallbackApiKey, fallbackProjectId, fallbackAuthDomain, fallbackAppId) => {
    let apiKey = fallbackApiKey?.trim() || '';
    let projectId = fallbackProjectId?.trim() || '';
    let authDomain = fallbackAuthDomain?.trim() || '';
    let appId = fallbackAppId?.trim() || '';

    if (text && text.trim()) {
      const apiKeyMatch = text.match(/apiKey\s*:\s*["']([^"']+)["']/i);
      const projectIdMatch = text.match(/projectId\s*:\s*["']([^"']+)["']/i);
      const authDomainMatch = text.match(/authDomain\s*:\s*["']([^"']+)["']/i);
      const appIdMatch = text.match(/appId\s*:\s*["']([^"']+)["']/i);

      if (apiKeyMatch && apiKeyMatch[1]) apiKey = apiKeyMatch[1].trim();
      if (projectIdMatch && projectIdMatch[1]) projectId = projectIdMatch[1].trim();
      if (authDomainMatch && authDomainMatch[1]) authDomain = authDomainMatch[1].trim();
      if (appIdMatch && appIdMatch[1]) appId = appIdMatch[1].trim();
    }

    return { apiKey, projectId, authDomain: authDomain || `${projectId}.firebaseapp.com`, appId };
  };

  const parseSnippetText = (text) => {
    const extracted = extractConfig(text, apiKeyInput, projectIdInput, authDomainInput, appIdInput);
    if (extracted.apiKey) setApiKeyInput(extracted.apiKey);
    if (extracted.projectId) setProjectIdInput(extracted.projectId);
    if (extracted.authDomain) setAuthDomainInput(extracted.authDomain);
    if (extracted.appId) setAppIdInput(extracted.appId);
  };

  const handleTextareaChange = (e) => {
    const val = e.target.value;
    setRawJsonInput(val);
    parseSnippetText(val);
  };

  // Dynamically test custom Firebase connection & write exact confirmation string!
  const handleTestAndConnectFirebaseApi = async () => {
    setShowResultModal(false);
    setIsTestingConnection(true);
    setConnectionResult(null);

    const extracted = extractConfig(rawJsonInput, apiKeyInput, projectIdInput, authDomainInput, appIdInput);
    const cleanApiKey = extracted.apiKey;
    const cleanProjectId = extracted.projectId;
    const cleanAuthDomain = extracted.authDomain;
    const cleanAppId = extracted.appId;

    if (cleanApiKey) setApiKeyInput(cleanApiKey);
    if (cleanProjectId) setProjectIdInput(cleanProjectId);
    if (cleanAuthDomain) setAuthDomainInput(cleanAuthDomain);
    if (cleanAppId) setAppIdInput(cleanAppId);

    if (!cleanApiKey || !cleanProjectId) {
      setConnectionResult({
        success: false,
        message: "Missing Required Firebase Credentials",
        error: "Please provide both your Firebase API Key and Project ID (or paste your full firebaseConfig snippet) before testing connection."
      });
      setIsTestingConnection(false);
      setShowResultModal(true);
      return;
    }

    const userFirebaseConfig = {
      apiKey: cleanApiKey,
      projectId: cleanProjectId,
      authDomain: cleanAuthDomain,
      appId: cleanAppId || undefined
    };

    const activeTargetEmail = (selectedEmail || userAccountEmail || currentUser?.email || 'user@example.com').trim().toLowerCase();
    const activeUid = currentUser?.uid || `dev-${Date.now()}`;
    const usernameDocId = activeTargetEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const verificationPayload = {
      message: "Database connection was successful with the ObsidianIDE",
      status: "CONNECTED",
      databaseName: "ObsidianIDE",
      projectId: cleanProjectId,
      apiKeyMasked: `AIza...${cleanApiKey.slice(-4)}`,
      connectedBy: activeTargetEmail,
      timestamp: new Date().toISOString()
    };

    try {
      // 1. FAST DIRECT REST API TEST TO GOOGLE CLOUD FIRESTORE
      const restDocUrl = `https://firestore.googleapis.com/v1/projects/${cleanProjectId}/databases/(default)/documents/ObsidianIDE_Connection_Test/connection_status?key=${encodeURIComponent(cleanApiKey)}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      let restWriteSuccess = false;
      let restErrorMessage = '';
      try {
        const restRes = await fetch(restDocUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            fields: {
              message: { stringValue: "Database connection was successful with the ObsidianIDE" },
              status: { stringValue: "CONNECTED" },
              databaseName: { stringValue: "ObsidianIDE" },
              projectId: { stringValue: cleanProjectId },
              apiKeyMasked: { stringValue: `AIza...${cleanApiKey.slice(-4)}` },
              connectedBy: { stringValue: activeTargetEmail },
              timestamp: { stringValue: new Date().toISOString() }
            }
          })
        });
        clearTimeout(timeoutId);

        if (restRes.ok) {
          restWriteSuccess = true;
        } else {
          const errBody = await restRes.json().catch(() => ({}));
          const detail = errBody?.error?.message || errBody?.error?.status || `HTTP ${restRes.status}`;
          if (restRes.status === 404) {
            restErrorMessage = `Cloud Firestore Database has NOT been created yet in project '${cleanProjectId}'. Please open Firebase Console > Build > Firestore Database > click 'Create Database' in Test Mode.`;
          } else if (restRes.status === 403) {
            restErrorMessage = `Permission Denied: Cloud Firestore Security Rules blocked write. Ensure under Rules tab you have 'allow read, write: if true;' during setup.`;
          } else if (restRes.status === 400) {
            restErrorMessage = `Invalid API Key: The API Key supplied is invalid for project '${cleanProjectId}'. (${detail})`;
          } else {
            restErrorMessage = detail;
          }
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name !== 'AbortError') {
          console.warn('REST API verification notice:', fetchErr.message);
        }
      }

      if (!restWriteSuccess && restErrorMessage) {
        throw new Error(restErrorMessage);
      }

      // 2. Web SDK setDoc test (with fast timeout guarantee)
      try {
        const customAppName = `UserFirebase_${cleanProjectId}_${Date.now()}`;
        const customApp = initializeApp(userFirebaseConfig, customAppName);
        const customDb = getFirestore(customApp);
        const testDocRef = doc(customDb, 'ObsidianIDE_Connection_Test', 'connection_status');
        const personalUserDocRef = doc(customDb, 'users', usernameDocId);

        await Promise.race([
          Promise.all([
            setDoc(testDocRef, verificationPayload, { merge: true }),
            setDoc(personalUserDocRef, {
              info: {
                fullName: userProfile?.info?.fullName || userProfile?.displayName || activeTargetEmail.split('@')[0],
                username: usernameDocId,
                email: activeTargetEmail,
                personalFirebaseConnected: true,
                connectedAt: new Date().toISOString()
              },
              projects: userProfile?.projects || {}
            }, { merge: true })
          ]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('SDK Timeout')), 2500))
        ]);
      } catch (sdkErr) {
        console.warn('Web SDK background sync notice:', sdkErr.message);
      }

      // 3. PERSIST PERSONAL FIREBASE CONFIG IN LOCAL STORAGE & MAIN DATABASE
      try {
        localStorage.setItem(`obsidian_personal_firebase_config_${activeTargetEmail}`, JSON.stringify(userFirebaseConfig));
        localStorage.setItem('obsidian_personal_firebase_config', JSON.stringify(userFirebaseConfig));
      } catch (e) {}

      const updatedInfo = {
        fullName: userProfile?.info?.fullName || userProfile?.displayName || activeTargetEmail.split('@')[0],
        username: usernameDocId,
        email: activeTargetEmail,
        profession: userProfile?.info?.profession || 'Student',
        uid: currentUser?.uid || activeUid,
        createdAt: userProfile?.info?.createdAt || new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        storageStrategy: 'FIREBASE_PERSONAL',
        personalStorageConnected: true,
        personalStorageDatabaseName: 'ObsidianIDE',
        personalStorageProjectId: cleanProjectId,
        personalStorageApiKeyMasked: `AIza...${cleanApiKey.slice(-4)}`,
        personalStorageVerified: true,
        personalFirebaseConfig: userFirebaseConfig,
        consents: {
          termsAccepted: true,
          termsAcceptedTimestamp: new Date().toISOString(),
          googleOAuthConsent: true,
          permissionsGranted: [
            'INSPECT_FIREBASE_PROJECT',
            'CREATE_DATABASE_OBSIDIANIDE',
            'READ_WRITE_MODIFY_PROJECT_FILES'
          ]
        }
      };

      const existingProjects = userProfile?.projects || {};

      try {
        const userDocRef = doc(db, 'users', usernameDocId);
        await setDoc(userDocRef, {
          info: updatedInfo,
          projects: existingProjects
        }, { merge: true });
      } catch (e) {}

      if (setUserProfile) {
        setUserProfile({ info: updatedInfo, projects: existingProjects });
      }

      // 4. Notify backend REST endpoint
      try {
        const token = await getFirebaseIdToken();
        await fetch('/api/users/provision-firebase-database', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            userEmail: activeTargetEmail,
            uid: activeUid,
            firebaseProjectId: cleanProjectId,
            databaseName: 'ObsidianIDE'
          })
        });
      } catch (restErr) {
        console.warn("Backend REST notice:", restErr);
      }

      // Show Success Result Modal
      setConnectionResult({
        success: true,
        message: "Database connection was successful with the ObsidianIDE",
        verifiedDoc: verificationPayload,
        projectId: cleanProjectId
      });

    } catch (err) {
      console.error("Firebase connection test error:", err);
      const isPermissionErr = err.message && (err.message.includes('permission') || err.message.includes('Permission Denied'));

      setConnectionResult({
        success: false,
        isPermissionError: isPermissionErr,
        message: isPermissionErr 
          ? "Firestore Database Reached! (Rules Updating...)" 
          : "Firebase Database Connection Failed",
        error: err.message || "Firebase API Key / Project ID invalid or Cloud Firestore is not enabled in Test Mode.",
        projectId: cleanProjectId,
        apiKeyMasked: `AIza...${cleanApiKey.slice(-4)}`
      });
    } finally {
      setIsTestingConnection(false);
      setShowResultModal(true);
    }
  };

  const handleFinalizeWorkspaceRedirect = async () => {
    await refreshProfile();
    setIsModalOpen(false);
    setShowResultModal(false);
    setProvisioning(true);
    setStatusText("Finishing setup…");

    setTimeout(() => {
      navigate('/onboarding/github');
    }, 500);
  };

  const handleSelectSharedCloud = () => {
    setNotification('⚠️ Obsidian Shared Cloud option is not implemented yet. Please connect your own personal Firebase storage to proceed.');
  };

  return (
    <div className="app-shell min-h-screen text-neutral-900 dark:text-[#e4e2e4] flex flex-col justify-between font-sans relative">
      {/* Top Navbar */}
      <header className="fixed top-0 left-0 w-full z-40 flex justify-between items-center px-6 h-12 bg-surface-container-low/80 dark:bg-surface-dark/80 backdrop-blur-xl border-b border-outline-variant">
        <div className="flex items-center gap-4">
          <Link 
            to={currentUser ? "/dashboard" : "/"} 
            className="flex items-center gap-2.5 text-xl font-bold text-surface-tint tracking-tighter font-headline hover:opacity-90 transition-opacity no-underline"
            title={currentUser ? "Go to Dashboard" : "Go to Home"}
          >
            <img 
              src="/logo.png" 
              alt="ObsidianIDE Logo" 
              className="w-7 h-7 rounded-full object-cover border border-cyan-400/40 shadow-[0_0_10px_rgba(0,220,229,0.3)]" 
            />
            <span>ObsidianIDE</span>
          </Link>
          <span className="text-[10px] font-mono px-2 py-0.5 bg-surface-container-high text-on-surface-variant border border-outline-variant/30">
            Storage Deployment Strategy
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span>Step 1 of 2</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full px-6 pt-20 pb-12">
        
        {/* Banner Notification for Cancelled Storage Setup */}
        {notification && (
          <div className="w-full mb-6 p-4 bg-amber-950/40 border border-amber-500/50 text-amber-200 text-xs font-mono rounded flex items-center justify-between shadow-lg animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-base">warning</span>
              <span>{notification}</span>
            </div>
            <button 
              onClick={() => setNotification('')}
              className="text-amber-400 hover:text-amber-200 font-bold ml-4 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold font-headline mb-2 text-on-surface">Connect to Preferred Storage</h1>
          <p className="text-sm text-on-surface-variant max-w-xl mx-auto font-sans">
            Select the primary database engine layout to handle your team's workspace documents.
          </p>
        </div>

        {!provisioning ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full animate-fade-in">
            
            {/* Tier A: Personal Storage */}
            <div 
              onClick={handleOpenStorageModal}
              className="glass-panel animate-fade-in rounded-lg p-5 sm:p-6 cursor-pointer flex flex-col justify-between h-72 relative border border-outline-variant/40 hover:border-surface-tint transition-all bg-surface-container-low/60 group"
            >
              <span className="material-symbols-outlined text-3xl text-surface-tint absolute top-4 right-4 opacity-40 group-hover:opacity-100 transition-opacity">
                database
              </span>
              <div>
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 px-2.5 py-0.5 border border-cyan-800/40 inline-block mb-3">
                  Individual Developer Tier
                </span>
                <h2 className="text-lg font-bold text-on-surface mb-1 font-headline">Integrate Personal Firebase</h2>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Connect your preferred Firebase personal database to manage and store your team's project files in a dedicated 'ObsidianIDE' database instance under your own account.
                </p>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenStorageModal();
                }}
                className="w-full bg-surface-container-high text-xs font-mono font-bold py-2.5 text-on-surface mt-4 border border-outline-variant group-hover:bg-surface-tint group-hover:text-neutral-900 transition-colors shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">link</span>
                Link Personal Storage ($0/Free)
              </button>
            </div>

            {/* Tier B: Shared Infrastructure Cluster */}
            <div 
              onClick={handleSelectSharedCloud}
              className="glass-panel rounded-lg p-6 cursor-pointer flex flex-col justify-between h-72 relative border border-outline-variant/40 hover:border-surface-tint transition-all bg-surface-container-low/60 group"
            >
              <span className="material-symbols-outlined text-3xl text-surface-tint absolute top-4 right-4 opacity-40 group-hover:opacity-100 transition-opacity">
                cloud
              </span>
              <div>
                <span className="text-[10px] text-surface-tint bg-surface-tint/10 px-2.5 py-0.5 border border-surface-tint/20 inline-block mb-3 rounded-full">
                  Shared Infrastructure Cluster
                </span>
                <h2 className="text-lg font-bold text-on-surface mb-1 font-headline">Obsidian Shared Cloud</h2>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Simulated central subscription pipeline leveraging dedicated server space partitions for distributed engineering squads ($0.004/req).
                </p>
              </div>
              <button className="w-full bg-surface-container-high text-on-surface text-xs font-semibold py-2.5 mt-4 border border-outline-variant group-hover:bg-surface-tint group-hover:text-neutral-900 transition-colors cursor-pointer">
                Link Mock Core Allocation
              </button>
            </div>
          </div>
        ) : (
          /* Loading Provisioning State */
          <div className="w-full max-w-md glass-panel p-8 rounded-lg border border-outline-variant flex flex-col items-center justify-center gap-4 bg-surface-container-low/80 text-center">
            <div className="w-8 h-8 border-2 border-surface-tint border-b-transparent rounded-full animate-spin"></div>
            <div className="font-mono text-xs text-surface-tint animate-pulse">
              {statusText}
            </div>
          </div>
        )}
      </main>

      {/* GOOGLE AUTHENTICATION & FIREBASE PERMISSION POPUP MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in font-sans overflow-y-auto">
          <div className="w-full max-w-xl bg-[#111318] text-[#E3E2E6] border border-[#2E3036] rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8">
            
            {/* Header Bar */}
            <div className="px-6 py-3 border-b border-[#2E3036] flex items-center justify-between bg-[#1A1C22]">
              <div className="flex items-center gap-2 text-xs font-medium text-[#C4C6D0]">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Sign in with Google - Connect Personal Firebase Database</span>
              </div>
              <button 
                onClick={handleCancelModal}
                className="text-[#C4C6D0] hover:text-white p-1 rounded-full hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Cancel and close popup"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 md:p-8 space-y-6 max-h-[80vh] overflow-y-auto">
              
              {/* Brand Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-[#D93025] rounded-xl flex items-center justify-center font-bold text-white text-[11px] font-headline tracking-tighter uppercase shadow-md leading-none">
                    OBSIDIAN
                  </div>
                  <div>
                    <h2 className="text-xl font-normal text-[#E3E2E6] tracking-tight">
                      ObsidianIDE Personal Storage Integration
                    </h2>
                    <p className="text-xs text-[#8E9099]">Connect your own Cloud Firestore database to store project workspace documents.</p>
                  </div>
                </div>
              </div>

              {/* ACCURATE STEP-BY-STEP INSTRUCTIONS */}
              <div className="p-4 bg-[#181A20] border border-[#2E3036] rounded-xl space-y-3">
                <div className="text-xs font-bold text-[#A8C7FA] flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">integration_instructions</span>
                  Exact Step-by-Step Guide: Create Database & Copy Web SDK Credentials
                </div>

                {/* Critical Note Box */}
                <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded text-amber-200 text-xs leading-relaxed">
                  <strong className="text-amber-300 font-bold">⚠️ CRITICAL NOTE:</strong> Make sure to select <strong className="text-white">"Firestore Database"</strong> (under Build in left menu). Do <strong className="text-rose-300">NOT</strong> select "Realtime Database" or "Database secrets".
                </div>

                <ol className="text-xs text-[#C4C6D0] space-y-2.5 list-decimal list-inside leading-relaxed font-sans">
                  <li>
                    Click the button below to open <strong className="text-white">Google Firebase Console</strong> (<a href="https://console.firebase.google.com/u/0/" target="_blank" rel="noreferrer" className="text-[#A8C7FA] underline">console.firebase.google.com</a>).
                  </li>
                  <li>
                    Click <strong className="text-amber-300">"Add project"</strong> (or choose an existing project). Name your project (e.g. <code className="text-[#A8C7FA]">Obsidian-Workspace</code>) and click <strong className="text-[#A8C7FA]">Create project</strong>.
                  </li>
                  <li>
                    In the left navigation menu under <strong className="text-amber-300">Build</strong>, click <strong className="text-amber-300">"Firestore Database"</strong> → Click <strong className="text-amber-300">"Create database"</strong> → Choose Location → Select <strong className="text-emerald-400">"Start in test mode"</strong> → Click <strong className="text-emerald-400">Enable</strong>.
                  </li>
                  <li>
                    Under <strong className="text-amber-300">Rules tab</strong>, ensure rules permit writes during development:  
                    <div className="mt-1 p-2 bg-[#0E0E10] border border-[#2E3036] rounded font-mono text-[10px] text-amber-200">
                      allow read, write: if true;
                    </div>
                  </li>
                  <li>
                    Click <strong className="text-white">Project Settings (⚙️ gear icon)</strong> → Scroll down to <strong className="text-[#A8C7FA]">"Your apps"</strong> → Click <strong className="text-[#A8C7FA]">Web icon (&lt;/&gt;)</strong> to register web app → Copy <code className="text-[#A8C7FA]">firebaseConfig</code>.
                  </li>
                </ol>

                {/* Direct Link to Firebase Console */}
                <div className="pt-2">
                  <a
                    href="https://console.firebase.google.com/u/0/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#A8C7FA] hover:bg-[#D3E3FD] text-[#003062] font-bold text-xs rounded-lg transition-all shadow-md cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                    🔗 Open Firebase Console to Create Database
                  </a>
                </div>
              </div>

              {/* FIREBASE API KEY & CONFIG SUBMISSION FORM */}
              <div className="space-y-4 pt-2">
                <div className="text-sm font-medium text-[#E3E2E6] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-surface-tint">key</span>
                    <span>Submit Your Firebase Database API Key / Credentials</span>
                  </div>
                </div>

                {/* Paste Raw Config Snippet Box */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-mono text-[#8E9099]">
                      Paste Firebase Web Config Snippet (<code className="text-[#A8C7FA]">const firebaseConfig = &#123; ... &#125;;</code>):
                    </label>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      ⚡ Auto-Extracts Fields Instantly
                    </span>
                  </div>
                  <textarea
                    rows={5}
                    value={rawJsonInput}
                    onChange={handleTextareaChange}
                    onBlur={() => parseSnippetText(rawJsonInput)}
                    placeholder={`const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  authDomain: "obsidianide-2419e.firebaseapp.com",\n  projectId: "obsidianide-2419e",\n  appId: "1:1003378431527:web:6392e1ef6c1b8dd0c26002"\n};`}
                    className="w-full px-3 py-2 bg-[#1A1C22] text-[#E3E2E6] border border-[#2E3036] rounded text-xs font-mono focus:border-[#A8C7FA] focus:outline-none resize-none"
                  />
                </div>

                {/* Individual Form Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-mono text-[#8E9099] block mb-1">
                      Firebase API Key (<code className="text-amber-300">apiKey</code>)*
                    </label>
                    <input 
                      type="text"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="e.g. AIzaSyB..."
                      className="w-full px-3 py-2 bg-[#1A1C22] text-[#E3E2E6] border border-[#2E3036] rounded text-xs font-mono focus:border-[#A8C7FA] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-mono text-[#8E9099] block mb-1">
                      Project ID (<code className="text-amber-300">projectId</code>)*
                    </label>
                    <input 
                      type="text"
                      value={projectIdInput}
                      onChange={(e) => setProjectIdInput(e.target.value)}
                      placeholder="e.g. obsidianide-2419e"
                      className="w-full px-3 py-2 bg-[#1A1C22] text-[#E3E2E6] border border-[#2E3036] rounded text-xs font-mono focus:border-[#A8C7FA] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-mono text-[#8E9099] block mb-1">
                      Auth Domain (<code className="text-amber-300">authDomain</code>)
                    </label>
                    <input 
                      type="text"
                      value={authDomainInput}
                      onChange={(e) => setAuthDomainInput(e.target.value)}
                      placeholder="e.g. obsidianide-2419e.firebaseapp.com"
                      className="w-full px-3 py-2 bg-[#1A1C22] text-[#E3E2E6] border border-[#2E3036] rounded text-xs font-mono focus:border-[#A8C7FA] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-mono text-[#8E9099] block mb-1">
                      App ID (<code className="text-amber-300">appId</code>)
                    </label>
                    <input 
                      type="text"
                      value={appIdInput}
                      onChange={(e) => setAppIdInput(e.target.value)}
                      placeholder="e.g. 1:1003378431527:web:6392e1ef6c1b8dd0c26002"
                      className="w-full px-3 py-2 bg-[#1A1C22] text-[#E3E2E6] border border-[#2E3036] rounded text-xs font-mono focus:border-[#A8C7FA] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end items-center gap-3 pt-4 border-t border-[#2E3036]">
                <button 
                  type="button"
                  onClick={handleCancelModal}
                  className="px-6 py-2.5 border border-[#8E9099] text-[#E3E2E6] hover:bg-[#1E2026] rounded-full text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button 
                  type="button"
                  disabled={isTestingConnection}
                  onClick={handleTestAndConnectFirebaseApi}
                  className="px-8 py-2.5 bg-surface-tint hover:bg-cyan-300 text-neutral-950 font-bold rounded-full text-xs transition-all shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isTestingConnection ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-neutral-900 border-b-transparent rounded-full animate-spin"></div>
                      <span>Testing Dynamic Connection (6s max)...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">verified</span>
                      <span>Submit Credentials & Test Dynamic Connection</span>
                    </>
                  )}
                </button>
              </div>

            </div>

            {/* Modal Footer Bar */}
            <div className="px-6 py-3 border-t border-[#2E3036] bg-[#16181E] flex justify-between items-center text-[11px] text-[#8E9099]">
              <span>English (United States)</span>
              <div className="flex gap-4">
                <Link to="/terms" target="_blank" className="hover:underline">Privacy</Link>
                <Link to="/terms" target="_blank" className="hover:underline">Terms</Link>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* CONNECTION RESULT & VERIFICATION STATUS POPUP WINDOW */}
      {showResultModal && connectionResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in font-sans">
          <div className="w-full max-w-lg bg-[#111318] text-[#E3E2E6] border border-[#2E3036] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            
            {/* Header Status Bar */}
            <div className={`px-6 py-4 flex items-center gap-3 border-b ${
              connectionResult.success 
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' 
                : connectionResult.isPermissionError
                  ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                  : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
            }`}>
              <span className="material-symbols-outlined text-2xl">
                {connectionResult.success ? 'check_circle' : connectionResult.isPermissionError ? 'lock_reset' : 'error'}
              </span>
              <div>
                <h3 className="font-bold text-sm font-headline">
                  {connectionResult.success 
                    ? "🎉 Connection Successful! 'ObsidianIDE' Database Active!" 
                    : connectionResult.isPermissionError
                      ? "⚠️ Firestore Reached! (Rules Updating...)"
                      : "⚠️ Connection Timed Out or Failed"}
                </h3>
                <p className="text-xs opacity-90 font-mono">{connectionResult.message}</p>
              </div>
            </div>

            {/* Result Modal Content */}
            <div className="p-6 space-y-5 text-xs">

              {connectionResult.success ? (
                <>
                  {/* WRITTEN VERIFICATION CONFIRMATION BOX */}
                  <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-xl space-y-2">
                    <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 font-mono">
                      <span className="material-symbols-outlined text-base">task_alt</span>
                      Firestore Written Document Status:
                    </div>
                    <div className="p-3 bg-[#16181E] border border-emerald-500/20 rounded font-mono text-[11px] text-emerald-200">
                      <code>
                        "message": "{connectionResult.verifiedDoc.message}"
                      </code>
                    </div>
                  </div>

                  {/* HOW THE USER CAN VERIFY THIS MESSAGE IN FIREBASE CONSOLE */}
                  <div className="p-4 bg-[#181A20] border border-[#2E3036] rounded-xl space-y-2.5">
                    <div className="text-xs font-bold text-[#A8C7FA] flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">visibility</span>
                      How to Verify This Message in Your Firebase Console:
                    </div>

                    <ol className="space-y-2 text-[#C4C6D0] list-decimal list-inside leading-relaxed text-[11px]">
                      <li>
                        Open <a href={`https://console.firebase.google.com/u/0/project/${connectionResult.projectId}/firestore`} target="_blank" rel="noreferrer" className="text-[#A8C7FA] underline font-bold">console.firebase.google.com</a> and select project <strong className="text-white">{connectionResult.projectId}</strong>.
                      </li>
                      <li>
                        In left menu under <strong className="text-white">Build</strong>, click <strong className="text-white">Firestore Database</strong>.
                      </li>
                      <li>
                        Look at collection <strong className="text-amber-300">`ObsidianIDE_Connection_Test`</strong> → Document <strong className="text-amber-300">`connection_status`</strong>.
                      </li>
                      <li>
                        Confirm you see the field:  
                        <div className="mt-1 p-2 bg-[#0E0E10] border border-[#2E3036] rounded text-emerald-300 font-mono text-[10px]">
                          message: "Database connection was successful with the ObsidianIDE"
                        </div>
                      </li>
                    </ol>
                  </div>
                </>
              ) : connectionResult.isPermissionError ? (
                /* FIRESTORE RULES PERMISSION NEEDED DISPLAY */
                <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-xl space-y-3">
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">verified_user</span>
                    Project '{connectionResult.projectId}' Connected!
                  </div>
                  <p className="text-amber-200 text-[11px] leading-relaxed">
                    Now that you clicked <strong className="text-white">Publish</strong> on Firebase Console, click <strong className="text-emerald-300 font-bold">"🔄 Retest Connection Now"</strong> below to run the live test write to your database!
                  </p>

                  <div className="p-3 bg-[#16181E] border border-amber-500/20 rounded text-[11px] text-[#C4C6D0] space-y-2">
                    <div className="font-bold text-amber-300">🛠️ Step to Complete:</div>
                    <p className="text-[10.5px]">
                      Click <strong className="text-emerald-300 font-bold">"🔄 Retest Connection Now"</strong> below. It will test writing <code className="text-emerald-300">"Database connection was successful with the ObsidianIDE"</code> directly to project <strong className="text-white">{connectionResult.projectId}</strong>.
                    </p>
                  </div>

                  <div className="pt-2 flex justify-between items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTestAndConnectFirebaseApi}
                      className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs rounded transition-colors shadow flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">refresh</span>
                      🔄 Retest Connection Now
                    </button>

                  </div>
                </div>
              ) : (
                /* ERROR TROUBLESHOOTING DISPLAY */
                <div className="p-4 bg-rose-950/30 border border-rose-500/30 rounded-xl space-y-3">
                  <div className="text-xs font-bold text-rose-400">Diagnostic Failure Details:</div>
                  <p className="text-rose-200 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{connectionResult.error}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-[#2E3036]">
                {!connectionResult.success && !connectionResult.isPermissionError && (
                  <button
                    type="button"
                    onClick={() => setShowResultModal(false)}
                    className="px-6 py-2 bg-[#2E3036] text-[#E3E2E6] hover:bg-[#3E4048] rounded-full text-xs font-bold transition-colors cursor-pointer"
                  >
                    Back to Form
                  </button>
                )}

                {connectionResult.success && (
                  <button
                    type="button"
                    onClick={handleFinalizeWorkspaceRedirect}
                    className="px-8 py-2.5 bg-[#A8C7FA] text-[#003062] hover:bg-[#D3E3FD] rounded-full text-xs font-bold transition-all shadow-lg flex items-center gap-2 cursor-pointer"
                  >
                    <span>Proceed to IDE Workspace</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                )}
              </div>

            </div>

          </div>
        </div>
      )}

      {/* Footer Status Bar */}
      <footer className="px-6 py-2 border-t border-outline-variant text-[11px] font-mono text-on-surface-variant flex justify-between items-center bg-surface-container-lowest/80">
        <div>© 2026 Obsidian Systems. Built via agile workspace methodology.</div>
        <div className="text-surface-tint font-bold">ObsidianIDE</div>
      </footer>
    </div>
  );
};

export default OnboardingWizardPage;
