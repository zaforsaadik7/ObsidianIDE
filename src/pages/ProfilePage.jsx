import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db, getFirebaseIdToken } from '../firebase';
import { GithubAuthProvider, getAdditionalUserInfo, linkWithPopup, signInWithPopup } from 'firebase/auth';
import { getProjectDisplayTitle, resolveProjectUserRoleAndMembership } from '../utils/projectTitle';
import { getUserDocId } from '../context/AuthContext';
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore';

const getAvatarCacheKey = (email) => `obsidian_profile_avatar_${(email || 'user').trim().toLowerCase()}`;

export const ProfilePage = () => {
  const { currentUser, userProfile, setUserProfile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [githubRefresh, setGithubRefresh] = useState(0);

  const devicePollTimerRef = useRef(null);
  const devicePollTimeoutRef = useRef(null);
  useEffect(() => () => {
    if (devicePollTimerRef.current) clearInterval(devicePollTimerRef.current);
    if (devicePollTimeoutRef.current) clearTimeout(devicePollTimeoutRef.current);
  }, []);

  const [profile, setProfile] = useState({
    displayName: userProfile?.info?.fullName || currentUser?.displayName || 'Md. Emam Zafor Saadik',
    email: userProfile?.info?.email || currentUser?.email || 'zafor@bubt.edu.bd',
    designation: userProfile?.info?.profession || 'Full-Stack Lead Architect',
    avatarUrl: userProfile?.info?.avatarUrl || currentUser?.photoURL || localStorage.getItem(getAvatarCacheKey(currentUser?.email || userProfile?.info?.email)) || '',
    clearanceLevel: 'L5_UNRESTRICTED',
    storageStrategy: 'FIREBASE_CLOUD',
    allocatedStorageMb: 1024,
    usedStorageMb: 0,
    usagePercentage: 0,
    lastLogin: new Date().toUTCString(),
    github: userProfile?.info?.github || null,
    projects: userProfile?.projects ? Object.values(userProfile.projects) : [],
    totalProjectsCount: userProfile?.projects ? Object.keys(userProfile.projects).length : 0
  });

  const [avatarError, setAvatarError] = useState('');
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDesignation, setEditDesignation] = useState('');

  // GitHub Connection State & Modal
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
  const [ghTokenInput, setGhTokenInput] = useState('');
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [isTokenLoading, setIsTokenLoading] = useState(false);
  const [deviceFlow, setDeviceFlow] = useState(null);
  const [isCopiedCode, setIsCopiedCode] = useState(false);
  const [ghError, setGhError] = useState('');
  const [ghSuccess, setGhSuccess] = useState('');
  const [showGhTokenInput, setShowGhTokenInput] = useState(false);
  const [portfolioNotice, setPortfolioNotice] = useState('');

  // Firestore remains the source of truth, while this small cache prevents a
  // valid saved avatar from flashing away during profile/network hydration.
  useEffect(() => {
    const email = currentUser?.email || userProfile?.info?.email;
    if (!email) return;
    try {
      const cachedAvatar = localStorage.getItem(getAvatarCacheKey(email));
      if (cachedAvatar) setProfile(prev => ({ ...prev, avatarUrl: prev.avatarUrl || cachedAvatar }));
    } catch (error) {}
  }, [currentUser?.email, userProfile?.info?.email]);

  // Detect ?github_connected=true redirect from GitHub App Manifest callback
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('github_connected') === 'true') {
      const ghUser = params.get('gh_user') || '';
      const ghAvatar = params.get('gh_avatar') || '';
      const ghProfileUrl = params.get('gh_profile') || `https://github.com/${ghUser}`;
      const ghConnectedAt = params.get('gh_connected_at') || new Date().toISOString();
      const hasToken = params.get('gh_has_token') === 'true';

      // Remove the params from URL without reload
      navigate('/profile', { replace: true });

      if (ghUser) {
        const basicGithubData = {
          connected: true,
          username: ghUser,
          avatarUrl: ghAvatar,
          profileUrl: ghProfileUrl,
          connectedAt: ghConnectedAt,
          method: 'github_app_manifest'
        };

        // Immediately update UI so user sees they're connected
        setProfile(prev => ({ ...prev, github: basicGithubData }));

        const persistGitHubData = async () => {
          try {
            const activeEmail = currentUser?.email || profile.email;
            if (!activeEmail) return;
            const cleanDocId = (activeEmail.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_');

            let dataToSave = basicGithubData;

            // If we have a token, fetch the full data from backend (includes accessToken in memory)
            if (hasToken) {
              try {
                const idToken = await getFirebaseIdToken();
                const fullRes = await fetch(
                  `/api/github/connection-status?email=${encodeURIComponent(activeEmail)}&_t=${Date.now()}`,
                  { headers: { ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}), 'Cache-Control': 'no-cache' } }
                );
                const fullData = await fullRes.json();
                if (fullRes.ok && fullData.connected && fullData.github) {
                  dataToSave = { ...dataToSave, ...fullData.github, connected: true };
                  setProfile(prev => ({ ...prev, github: dataToSave }));
                }
              } catch (e) {
                console.warn('[GitHub] Full data fetch failed, using basic data:', e);
              }
            }

            // Persist to Firestore via client SDK
            const { setDoc: fsSetDoc, doc: fsDoc } = await import('firebase/firestore');
            await fsSetDoc(
              fsDoc(db, 'users', cleanDocId),
              { info: { github: dataToSave }, updatedAt: new Date().toISOString() },
              { merge: true }
            );
            // Also update userProfile context so export modal picks it up
            if (setUserProfile) {
              setUserProfile(prev => ({ ...prev, info: { ...(prev?.info || {}), github: dataToSave } }));
            }
            console.log('[GitHub] Saved to Firestore for', activeEmail, '| hasToken:', hasToken);
          } catch (e) {
            console.warn('[GitHub] Persist failed:', e);
          }
        };
        persistGitHubData();
      }

      // Force a fresh status re-fetch
      setGithubRefresh(n => n + 1);
    }
  }, [location.search]);

  useEffect(() => {
    const fetchProfileData = async () => {
      const activeEmail = currentUser?.email || profile.email;
      if (!activeEmail) return;
      const userEmailNorm = activeEmail.trim().toLowerCase();
      const cleanDocId = userEmailNorm.split('@')[0].replace(/[^a-z0-9_]/g, '_');

      const projectMap = {};
      const hiddenProjectIds = new Set(Object.keys(userProfile?.hiddenProjects || {}));

      const calculateFilesBytes = (files) => {
        if (!Array.isArray(files)) return 0;
        let bytes = 0;
        files.forEach(f => {
          if (f && f.content !== undefined) {
            const content = f.content;
            if (typeof content === 'string') {
              if (content.startsWith('data:')) {
                const b64 = content.split(',')[1] || '';
                bytes += Math.floor((b64.length * 3) / 4);
              } else {
                bytes += new Blob([content]).size;
              }
            } else if (f.size) {
              bytes += Number(f.size);
            }
          }
        });
        return bytes;
      };

      const getCanonicalProjectKey = (p, fallbackId) => {
        const pid = (p?.projectId || p?.id || fallbackId || '').trim();
        const title = (p?.title || '').trim().toLowerCase();
        const owner = (p?.ownerEmail || '').trim().toLowerCase();
        if (title && owner) {
          return `owner::${owner}::title::${title}`;
        }
        return `pid::${pid || title}`;
      };

      const upsertProject = (p, fallbackId) => {
        if (!p) return;
        const pid = p.projectId || p.id || fallbackId;
        if (!pid) return;
        if (hiddenProjectIds.has(pid)) return;

        const membership = resolveProjectUserRoleAndMembership(p, userEmailNorm, currentUser?.uid, currentUser?.displayName);
        if (!membership.isMember) return;

        const canonicalKey = getCanonicalProjectKey(p, pid);
        const existing = projectMap[canonicalKey] || {};

        const chosenPid = (p.projectId && String(p.projectId).startsWith('proj_'))
          ? p.projectId
          : (existing.projectId && String(existing.projectId).startsWith('proj_'))
            ? existing.projectId
            : pid;
        const incomingTitle = String(p.title || '').trim();
        const existingTitle = String(existing.title || '').trim();
        const resolvedTitle = incomingTitle && incomingTitle !== pid
          ? incomingTitle
          : (existingTitle && existingTitle !== chosenPid
            ? existingTitle
            : getProjectDisplayTitle(p, chosenPid));

        const files = (p.working_files && p.working_files.length > 0)
          ? p.working_files
          : (p.master_project_files && p.master_project_files.length > 0)
            ? p.master_project_files
            : (p.project_files && p.project_files.length > 0)
              ? p.project_files
              : (existing.working_files || existing.project_files || []);

        const projectBytes = calculateFilesBytes(files);

        projectMap[canonicalKey] = {
          ...existing,
          ...p,
          projectId: chosenPid,
          title: resolvedTitle,
          languageEnv: p.languageEnv || existing.languageEnv || 'PYTHON_3.11',
          userRole: membership.role,
          ownerEmail: p.ownerEmail || existing.ownerEmail,
          collaborators: p.collaborators || existing.collaborators || {},
          working_files: files,
          storageBytes: projectBytes,
          createdAt: p.createdAt || existing.createdAt || new Date().toISOString(),
          updatedAt: p.updatedAt || existing.updatedAt || new Date().toISOString()
        };
      };

      // 1. Load from AuthContext userProfile state
      if (userProfile?.projects) {
        Object.entries(userProfile.projects).forEach(([key, p]) => upsertProject(p, key));
      }

      // 2. Read directly from Client Firestore user documents (candidate doc IDs)
      try {
        const { getDoc: fsGetDoc, doc: fsDoc } = await import('firebase/firestore');
        const candidateDocIds = new Set([
          cleanDocId,
          getUserDocId(currentUser?.email, currentUser?.displayName),
          currentUser?.uid
        ]);

        for (const candidateId of candidateDocIds) {
          if (!candidateId) continue;
          try {
            const docSnap = await fsGetDoc(fsDoc(db, 'users', candidateId));
            if (docSnap.exists()) {
              const fsData = docSnap.data();
              const fsInfo = fsData?.info || {};
              Object.keys(fsData?.hiddenProjects || {}).forEach((projectId) => hiddenProjectIds.add(projectId));
              if (fsInfo.avatarUrl || fsInfo.fullName || fsInfo.profession) {
                setProfile(prev => ({
                  ...prev,
                  displayName: fsInfo.fullName || prev.displayName,
                  email: fsInfo.email || prev.email,
                  designation: fsInfo.profession || prev.designation,
                  avatarUrl: fsInfo.avatarUrl || prev.avatarUrl,
                  github: fsInfo.github || prev.github
                }));
                if (setUserProfile) {
                  setUserProfile(prev => ({
                    ...prev,
                    ...fsData,
                    info: { ...(prev?.info || {}), ...fsInfo }
                  }));
                }
              }
              if (fsData.projects) {
                Object.entries(fsData.projects).forEach(([key, p]) => upsertProject(p, key));
              }
            }
          } catch (innerErr) {}
        }
      } catch (fsErr) {
        console.warn('Client Firestore profile fetch notice:', fsErr);
      }

      // 3. Query specific candidate project documents directly
      try {
        const { getDoc: fsGetDoc, doc: fsDoc } = await import('firebase/firestore');
        const knownIds = new Set();
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('obsidian_draft_')) {
            const parts = k.replace('obsidian_draft_', '').split('_');
            const pidCandidate = parts.slice(0, -1).join('_') || parts[0];
            if (pidCandidate) knownIds.add(pidCandidate);
          }
        }
        try {
          const storedIds = JSON.parse(localStorage.getItem('obsidian_known_project_ids') || '[]');
          if (Array.isArray(storedIds)) storedIds.forEach(id => knownIds.add(id));
        } catch (e) {}

        for (const pid of knownIds) {
          if (!pid) continue;
          try {
            const pSnap = await fsGetDoc(fsDoc(db, 'projects', pid));
            if (pSnap.exists()) {
              upsertProject(pSnap.data(), pSnap.id);
            }
          } catch (pGetErr) {}
        }
      } catch (knownErr) {}

      // 4. Fetch from Client Firestore 'projects' collection
      try {
        const { getDocs: fsGetDocs, collection: fsCollection } = await import('firebase/firestore');
        const projectsSnap = await fsGetDocs(fsCollection(db, 'projects'));
        projectsSnap.forEach(docSnap => {
          const p = docSnap.data();
          if (p) {
            upsertProject(p, docSnap.id);
          }
        });
      } catch (colErr) {
        console.warn("Client Firestore projects collection lookup notice:", colErr);
      }

      // 5. Fetch from Backend /api/projects REST API (with direct Render fallback)
      try {
        const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';
        const apiUrls = [
          `/api/projects?email=${encodeURIComponent(activeEmail)}`,
          `https://obsidianide.onrender.com/api/projects?email=${encodeURIComponent(activeEmail)}`
        ];

        for (const url of apiUrls) {
          try {
            const pRes = await fetch(url, {
              headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
            });
            if (pRes.ok) {
              const pData = await pRes.json();
              if (pData.projects && Array.isArray(pData.projects)) {
                pData.projects.forEach(p => upsertProject(p, p.projectId));
                break;
              }
            }
          } catch (apiErr) {}
        }
      } catch (err) {
        console.warn("Backend /api/projects fetch notice:", err);
      }

      // 5. Fetch from Backend /api/users/profile REST API
      try {
        const token = await getFirebaseIdToken();
        const res = await fetch(`/api/users/profile?email=${encodeURIComponent(activeEmail)}`, {
          headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          }
        });
        const data = await res.json();
        if (res.ok && data.profile) {
          const infoData = data.profile.info || {};
          setProfile(prev => ({
            ...prev,
            displayName: infoData.fullName || data.profile.displayName || prev.displayName,
            email: infoData.email || data.profile.email || prev.email,
            designation: infoData.profession || data.profile.designation || prev.designation,
            avatarUrl: infoData.avatarUrl || prev.avatarUrl,
            github: infoData.github || prev.github
          }));
          setEditName(infoData.fullName || data.profile.displayName || '');
          setEditEmail(infoData.email || activeEmail);
          setEditDesignation(infoData.profession || data.profile.designation || '');

          if (data.profile.projects) {
            Object.entries(data.profile.projects).forEach(([key, p]) => upsertProject(p, key));
          }
        }
      } catch (err) {
        console.warn('Profile fetch notice, using active profile:', err);
      }

      // Calculate total storage bytes and update state
      const mergedList = Object.values(projectMap).filter((project) => !hiddenProjectIds.has(project.projectId || project.id));
      mergedList.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

      let calculatedStorageBytes = 0;
      mergedList.forEach(p => {
        calculatedStorageBytes += (p.storageBytes || 0);
      });

      const usedMb = Number((calculatedStorageBytes / (1024 * 1024)).toFixed(2));
      const allocatedMb = 1024;
      const usagePct = Number(((usedMb / allocatedMb) * 100).toFixed(2));

      setProfile(prev => ({
        ...prev,
        projects: mergedList,
        totalProjectsCount: mergedList.length,
        usedStorageMb: usedMb,
        allocatedStorageMb: allocatedMb,
        usagePercentage: usagePct
      }));

      // Check GitHub Connection Status — cache-busted to avoid stale 304 responses
      try {
        const ghToken = await getFirebaseIdToken();
        const cacheBust = `&_t=${Date.now()}`;
        const ghRes = await fetch(
          `/api/github/connection-status?email=${encodeURIComponent(activeEmail)}${cacheBust}`,
          {
            headers: {
              ...(ghToken ? { 'Authorization': `Bearer ${ghToken}` } : {}),
              'Cache-Control': 'no-cache'
            }
          }
        );
        const ghData = await ghRes.json();
        if (ghRes.ok && ghData.connected && ghData.github) {
          setProfile(prev => ({
            ...prev,
            github: { ...ghData.github, connected: true }
          }));
        }
      } catch (ghErr) {
        console.warn('GitHub status fetch notice:', ghErr);
      }
    };

    fetchProfileData();
  }, [currentUser, githubRefresh]);

  const saveGitHubData = async (githubData) => {
    const activeEmail = currentUser?.email || profile.email;
    const cleanDocId = (activeEmail.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_');

    // 1. Update In-Memory State
    setProfile(prev => ({ ...prev, github: githubData }));
    if (setUserProfile) {
      setUserProfile(prev => ({
        ...prev,
        info: {
          ...(prev?.info || {}),
          github: githubData
        }
      }));
    }

    // 2. Save directly to Client Firestore
    try {
      const userDocRef = doc(db, 'users', cleanDocId);
      await setDoc(userDocRef, {
        info: { github: githubData },
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {}

    // 3. Save to Backend REST API
    try {
      const token = await getFirebaseIdToken();
      await fetch('/api/github/connect-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          userEmail: activeEmail,
          accessToken: githubData.accessToken,
          githubUsername: githubData.username,
          githubAvatarUrl: githubData.avatarUrl,
          githubProfileUrl: githubData.profileUrl
        })
      });
    } catch (e) {}
  };

  const handleConnectDirectOAuth = () => {
    setIsOAuthLoading(true);
    const activeEmail = currentUser?.email || profile.email;
    const backendBase = (import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    window.location.href = `${backendBase}/api/github/oauth/start?email=${encodeURIComponent(activeEmail)}&returnUrl=${encodeURIComponent(window.location.origin + '/profile?github_connected=true')}`;
  };

  // This uses the browser/Firebase OAuth popup rather than routing GitHub
  // authorization through the local Express server. It therefore continues to
  // work when a local development server cannot make outbound HTTPS requests.
  const handleConnectWithFirebase = async () => {
    setIsOAuthLoading(true);
    setGhError('');
    setGhSuccess('');
    try {
      const provider = new GithubAuthProvider();
      provider.addScope('repo');
      provider.addScope('read:user');
      provider.addScope('user:email');
      const result = currentUser
        ? await linkWithPopup(auth.currentUser, provider)
        : await signInWithPopup(auth, provider);
      const credential = GithubAuthProvider.credentialFromResult(result);
      const githubProfile = getAdditionalUserInfo(result)?.profile || {};
      const username = githubProfile.login || result.user?.displayName || result.user?.email?.split('@')[0] || 'github_user';
      await saveGitHubData({
        connected: true,
        username,
        avatarUrl: githubProfile.avatar_url || result.user?.photoURL || '',
        profileUrl: githubProfile.html_url || `https://github.com/${username}`,
        accessToken: credential?.accessToken || '',
        connectedAt: new Date().toISOString(),
        permissions: ['repo', 'read:user', 'user:email'],
        method: 'firebase_github_oauth'
      });
      setGhSuccess(`Connected to GitHub as @${username}.`);
      setTimeout(() => setIsGitHubModalOpen(false), 1200);
    } catch (error) {
      console.error('Firebase GitHub sign-in error:', error);
      setGhError(error.code === 'auth/operation-not-allowed'
        ? 'GitHub sign-in must be enabled in Firebase Authentication before it can be used.'
        : error.message || 'GitHub sign-in could not be completed.');
    } finally {
      setIsOAuthLoading(false);
    }
  };

  // 1-Click Device Code Flow (VS Code Extension style)
  const handleStartDeviceFlow = async () => {
    setIsOAuthLoading(true);
    setGhError('');
    setGhSuccess('');

    try {
      const res = await fetch('/api/github/device/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to initialize GitHub login');
      }

      setDeviceFlow(data);
      setIsOAuthLoading(false);

      // Copy user code to clipboard automatically
      if (data.userCode) {
        navigator.clipboard?.writeText(data.userCode).catch(() => {});
      }

      // Automatically start background polling
      const targetEmail = currentUser?.email || profile.email;
      const pollInterval = (data.interval || 5) * 1000;

      const pollTimer = setInterval(async () => {
        try {
          const pollRes = await fetch('/api/github/device/poll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deviceCode: data.deviceCode,
              userEmail: targetEmail
            })
          });
          const pollData = await pollRes.json();

          if (pollData.status === 'SUCCESS' && pollData.github) {
            clearInterval(pollTimer);
            setDeviceFlow(null);
            await saveGitHubData(pollData.github);
            setGhSuccess(`🎉 Connected to GitHub as @${pollData.github.username}!`);
            setTimeout(() => {
              setIsGitHubModalOpen(false);
              setGhSuccess('');
            }, 1500);
          } else if (pollData.status === 'ERROR') {
            clearInterval(pollTimer);
            setDeviceFlow(null);
            setGhError(pollData.error || 'GitHub authorization was declined.');
          }
        } catch (pollErr) {
          console.warn("Polling notice:", pollErr);
        }
      }, pollInterval);

      devicePollTimerRef.current = pollTimer;
      devicePollTimeoutRef.current = setTimeout(() => clearInterval(pollTimer), 15 * 60 * 1000);
    } catch (err) {
      console.error("Device flow error:", err);
      setGhError(err.message || 'Failed to start GitHub login. Please try again.');
      setIsOAuthLoading(false);
    }
  };

  const [isVerifyingNow, setIsVerifyingNow] = useState(false);

  const handleCheckDeviceAuthNow = async () => {
    if (!deviceFlow?.deviceCode) return;
    setIsVerifyingNow(true);
    setGhError('');

    try {
      const targetEmail = currentUser?.email || profile.email;
      const pollRes = await fetch('/api/github/device/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceCode: deviceFlow.deviceCode,
          userEmail: targetEmail
        })
      });
      const pollData = await pollRes.json();

      if (pollData.status === 'SUCCESS' && pollData.github) {
        setDeviceFlow(null);
        await saveGitHubData(pollData.github);
        setGhSuccess(`🎉 Connected to GitHub as @${pollData.github.username}!`);
        setTimeout(() => {
          setIsGitHubModalOpen(false);
          setGhSuccess('');
        }, 1500);
      } else if (pollData.status === 'PENDING') {
        setGhError('GitHub has not completed authorization yet. Please ensure you clicked "Authorize" on GitHub, then click Verify again.');
      } else if (pollData.status === 'ERROR') {
        setGhError(pollData.error || 'GitHub authorization declined.');
      }
    } catch (e) {
      setGhError('Network error checking status: ' + e.message);
    } finally {
      setIsVerifyingNow(false);
    }
  };

  const handleConnectGitHubToken = async (e) => {
    e.preventDefault();
    if (!ghTokenInput.trim()) {
      setGhError('Please enter a GitHub Personal Access Token.');
      return;
    }

    setIsTokenLoading(true);
    setGhError('');
    setGhSuccess('');

    try {
      const cleanToken = ghTokenInput.trim();
      const res = await fetch('/api/github/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: cleanToken })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details || data.error || 'Invalid GitHub Token');
      }

      const ghUser = data.user;
      const githubData = {
        connected: true,
        username: ghUser.login,
        avatarUrl: ghUser.avatarUrl || '',
        profileUrl: ghUser.htmlUrl || `https://github.com/${ghUser.login}`,
        accessToken: cleanToken,
        connectedAt: new Date().toISOString(),
        permissions: ghUser.scopes && ghUser.scopes.length > 0 ? ghUser.scopes : ['repo']
      };

      await saveGitHubData(githubData);
      setGhSuccess(`🎉 Connected to GitHub as @${ghUser.login}!`);
      setGhTokenInput('');
      setTimeout(() => {
        setIsGitHubModalOpen(false);
        setGhSuccess('');
      }, 1500);
    } catch (err) {
      console.error("Token verification error:", err);
      setGhError(err.message || 'Failed to verify GitHub token. Make sure it has "repo" scope.');
    } finally {
      setIsTokenLoading(false);
    }
  };

  const handleDisconnectGitHub = async () => {
    if (!window.confirm('Are you sure you want to disconnect your GitHub account from ObsidianIDE?')) {
      return;
    }

    const activeEmail = currentUser?.email || profile.email;
    const cleanDocId = (activeEmail.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_');

    // 1. Update State
    setProfile(prev => ({ ...prev, github: null }));
    if (setUserProfile) {
      setUserProfile(prev => ({
        ...prev,
        info: {
          ...(prev?.info || {}),
          github: { connected: false }
        }
      }));
    }

    // 2. Firestore
    try {
      const userDocRef = doc(db, 'users', cleanDocId);
      await setDoc(userDocRef, {
        info: { github: { connected: false, disconnectedAt: new Date().toISOString() } },
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {}

    // 3. Backend
    try {
      const token = await getFirebaseIdToken();
      await fetch('/api/github/disconnect-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ userEmail: activeEmail })
      });
    } catch (e) {}
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/auth');
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const handleProfileAvatarChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // Firestore documents are limited to 1 MiB and Base64 adds roughly 33%.
    // Keeping uploads below 500 KiB leaves room for the rest of the profile.
    if (file.size > 500 * 1024) {
      setAvatarError('Choose an image smaller than 500 KB so it can be saved to your profile.');
      setUploadSuccessMsg('');
      return;
    }

    setAvatarError('');
    setUploadSuccessMsg('');
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result;
      if (typeof base64Data !== 'string' || base64Data.length > 800000) {
        setAvatarError('This image is too large after processing. Please choose a smaller image.');
        return;
      }
      const activeEmail = currentUser?.email || profile.email;
      const cleanDocId = (activeEmail.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_');
      
      // Show immediately and retain it in the authenticated session.
      setProfile(prev => ({ ...prev, avatarUrl: base64Data }));
      try {
        localStorage.setItem(getAvatarCacheKey(activeEmail), base64Data);
      } catch (storageError) {
        console.warn('[Profile] Avatar cache notice:', storageError);
      }

      // 2. Update AuthContext state for whole app (Sidebar, Header, etc.)
      if (setUserProfile) {
        setUserProfile(prev => ({
          ...prev,
          info: {
            ...(prev?.info || {}),
            avatarUrl: base64Data
          }
        }));
      }

      // Persist to Firestore directly. Do not report a save that was rejected.
      let firestoreSaved = false;
      try {
        const { setDoc: fsSetDoc, doc: fsDoc } = await import('firebase/firestore');
        await fsSetDoc(
          fsDoc(db, 'users', cleanDocId),
          {
            info: {
              avatarUrl: base64Data,
              fullName: profile.displayName,
              email: activeEmail,
              profession: profile.designation
            },
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        );
        firestoreSaved = true;
        console.log('[Profile] Saved avatar to Firestore for', activeEmail);
      } catch (fsErr) {
        console.warn('[Profile] Firestore avatar save error:', fsErr);
      }

      // 4. Save to backend API
      try {
        const token = await getFirebaseIdToken();
        const profileResponse = await fetch('/api/users/profile', {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            email: activeEmail,
            displayName: profile.displayName,
            designation: profile.designation,
            avatarUrl: base64Data
          })
        });
        if (!profileResponse.ok && !firestoreSaved) {
          throw new Error('The profile service could not save the image.');
        }

        setUploadSuccessMsg('Profile picture saved successfully.');
        setTimeout(() => setUploadSuccessMsg(''), 4000);
      } catch (err) {
        console.warn("Avatar save notice:", err);
        if (!firestoreSaved) {
          setAvatarError('The profile picture could not be saved. Please try again.');
          try { localStorage.removeItem(getAvatarCacheKey(activeEmail)); } catch (storageError) {}
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfileEdit = async (e) => {
    e.preventDefault();
    const activeEmail = currentUser?.email || profile.email;
    const cleanDocId = (activeEmail.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_');

    // 1. Update UI
    setProfile(prev => ({
      ...prev,
      displayName: editName,
      email: editEmail,
      designation: editDesignation
    }));
    setIsEditModalOpen(false);

    // 2. Update AuthContext
    if (setUserProfile) {
      setUserProfile(prev => ({
        ...prev,
        info: {
          ...(prev?.info || {}),
          fullName: editName,
          email: editEmail,
          profession: editDesignation
        }
      }));
    }

    // 3. Persist to Firestore
    try {
      const { setDoc: fsSetDoc, doc: fsDoc } = await import('firebase/firestore');
      await fsSetDoc(
        fsDoc(db, 'users', cleanDocId),
        {
          info: {
            fullName: editName,
            email: editEmail,
            profession: editDesignation
          },
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("Save profile Firestore error:", e);
    }

    // 4. Update Backend API
    try {
      const token = await getFirebaseIdToken();
      await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          email: editEmail,
          displayName: editName,
          designation: editDesignation,
          avatarUrl: profile.avatarUrl
        })
      });
    } catch (err) {
      console.error("Error updating profile:", err);
    }
  };

  // Removes a portfolio entry from this signed-in user's profile only. The
  // shared project, its files, and every collaborator's membership remain intact.
  const handleRemovePortfolioProject = async (project) => {
    const projectId = project?.projectId || project?.id;
    if (!projectId) return;
    if (!window.confirm(`Remove '${project.title || projectId}' from your personal portfolio? Other collaborators will keep access.`)) return;

    const activeEmail = currentUser?.email || profile.email;
    const cleanDocId = (activeEmail?.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const removedAt = new Date().toISOString();

    try {
      // Keep the website profile from adding the shared project back after refresh.
      try {
        await updateDoc(doc(db, 'users', cleanDocId), {
          [`projects.${projectId}`]: deleteField(),
          [`hiddenProjects.${projectId}`]: { removedAt }
        });
      } catch (firestoreError) {
        console.warn('Portfolio personal-profile removal notice:', firestoreError);
      }

      try {
        const token = await getFirebaseIdToken();
        await fetch(`/api/projects/${projectId}/remove-from-profile`, {
          method: 'DELETE',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(activeEmail ? { 'X-User-Email': activeEmail } : {})
          }
        });
      } catch (apiError) {
        console.warn('Portfolio server removal notice:', apiError);
      }

      setProfile((previous) => {
        const projects = (previous.projects || []).filter((item) => (item.projectId || item.id) !== projectId);
        return { ...previous, projects, totalProjectsCount: projects.length };
      });
      setUserProfile?.((previous) => {
        if (!previous) return previous;
        const projects = { ...(previous.projects || {}) };
        const hiddenProjects = { ...(previous.hiddenProjects || {}) };
        delete projects[projectId];
        hiddenProjects[projectId] = { removedAt };
        return { ...previous, projects, hiddenProjects };
      });
      setPortfolioNotice(`Removed '${project.title || projectId}' from your portfolio.`);
      setTimeout(() => setPortfolioNotice(''), 4000);
    } catch (error) {
      console.error('Portfolio removal error:', error);
      alert(`Could not remove this project from your portfolio: ${error.message}`);
    }
  };

  return (
    <div className="profile-page max-w-6xl mx-auto flex flex-col gap-6 font-sans animate-fade-in pb-8">
      <div className="control-panel rounded-2xl flex flex-col sm:flex-row justify-between sm:items-end p-5 sm:p-6 gap-4">
        <div>
          <p className="eyebrow mb-2">Account</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 font-headline tracking-tight">Your profile</h1>
          <p className="font-mono text-xs text-slate-500 mt-2">
            {profile.email}
          </p>
        </div>
        <div className="flex gap-2 font-mono text-xs">
          <button 
            onClick={() => {
              setEditName(profile.displayName);
              setEditEmail(profile.email);
              setEditDesignation(profile.designation);
              setIsEditModalOpen(true);
            }}
            className="subtle-button px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">edit</span> Edit profile
          </button>
        </div>
      </div>

      {/* Dual-Pane Admin Card */}
      <div className="control-panel flex flex-col md:flex-row overflow-hidden rounded-2xl">
        {/* Left Pane: Identity (Fixed Width) */}
        <div className="profile-identity w-full md:w-80 border-r border-[#2a3037] p-8 flex flex-col items-center gap-6">
          
          {/* Avatar Profile Picture Box & Change Button */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative group">
              <div className="w-32 h-32 border border-cyan-300/50 p-1 bg-[#1a1f23] overflow-hidden flex items-center justify-center rounded-2xl shadow-[0_0_35px_rgba(36,212,208,.12)]">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover rounded" onError={() => setProfile(prev => ({ ...prev, avatarUrl: '' }))} />
                ) : (
                  <span className="material-symbols-outlined text-6xl text-surface-tint">
                    account_circle
                  </span>
                )}
              </div>
              <div className="status-dot absolute -bottom-1 -right-1 bg-neon-green w-4 h-4 rounded-full border-2 border-[#101215]" title="System Online"></div>
            </div>

            {/* Change Profile Picture Option */}
            <label className="cursor-pointer text-[11px] font-mono text-surface-tint hover:text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 px-3 py-1 rounded flex items-center gap-1.5 transition-colors mt-1 shadow-sm">
              <span className="material-symbols-outlined text-xs">add_a_photo</span>
              <span>Change Profile Picture</span>
              <input 
                type="file" 
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleProfileAvatarChange}
                className="hidden" 
              />
            </label>

            {/* Upload Notification Messages */}
            {uploadSuccessMsg && (
              <span className="text-[10px] text-emerald-400 font-mono text-center bg-emerald-950/50 border border-emerald-500/40 px-2.5 py-1 rounded animate-fade-in">
                {uploadSuccessMsg}
              </span>
            )}
            {avatarError && <span className="text-[10px] text-rose-400 font-mono text-center">{avatarError}</span>}
          </div>

          <div className="text-center w-full space-y-3">
            <div>
              <h2 className="text-lg font-bold text-on-surface font-headline">{profile.displayName}</h2>
              <span className="text-[11px] text-surface-tint bg-cyan-950/40 px-2 py-0.5 mt-1 border border-cyan-800/40 inline-block rounded-full capitalize">
                {profile.designation}
              </span>
            </div>

            <div className="pt-4 space-y-3 border-t border-outline-variant/40 text-left font-mono text-xs">
              <div className="flex flex-col">
                <span className="profile-meta-label text-on-surface-variant">Email</span>
                <span className="text-on-surface truncate">{profile.email}</span>
              </div>
              <div className="flex flex-col">
                <span className="profile-meta-label text-on-surface-variant">Access level</span>
                <span className="text-neon-green font-bold">{profile.clearanceLevel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Pane: Configuration & Storage Inspector */}
        <div className="flex-1 bg-[#121417]/75 p-6 sm:p-8 space-y-8">
          {/* Storage Strategy Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-surface-tint">database</span>
              <h3 className="profile-section-title text-on-surface">Storage</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-surface-slate border border-surface-tint p-4 flex justify-between items-center rounded">
                <div className="flex flex-col">
                  <span className="text-xs text-on-surface font-bold">ObsidianIDE Cloud</span>
                  <span className="text-[10px] text-on-surface-variant mt-0.5">All projects are stored in ObsidianIDE's secure cloud database</span>
                </div>
                <span className="material-symbols-outlined text-neon-green">check_circle</span>
              </div>
            </div>
          </section>

          {/* GitHub Integration Section */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 fill-cyan-400" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
                <h3 className="profile-section-title text-on-surface">GitHub</h3>
              </div>
              {profile.github?.connected && (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded">
                  Connected
                </span>
              )}
            </div>

            {profile.github?.connected ? (
              <div className="bg-surface-container-low border border-cyan-500/30 p-4 rounded space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    {profile.github.avatarUrl ? (
                      <img src={profile.github.avatarUrl} alt="GH" className="w-10 h-10 rounded-full border border-cyan-400" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white font-bold">GH</div>
                    )}
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>@{profile.github.username}</span>
                        <a href={profile.github.profileUrl || `https://github.com/${profile.github.username}`} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300">
                          <span className="material-symbols-outlined text-xs">open_in_new</span>
                        </a>
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">Connected: {new Date(profile.github.connectedAt || Date.now()).toLocaleDateString()}</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsGitHubModalOpen(true)}
                      className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono rounded border border-white/10 transition-colors cursor-pointer"
                    >
                      Update Token
                    </button>
                    <button
                      onClick={handleDisconnectGitHub}
                      className="px-3 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-mono rounded border border-rose-500/30 transition-colors cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-zinc-400 border-t border-white/10 pt-2 flex items-center justify-between">
                  <span>Scope: <code className="text-cyan-300">repo, read:user, user:email</code></span>
                  <span className="text-emerald-400 font-mono">1-Click Export Active</span>
                </div>
              </div>
            ) : (
              <div className="bg-surface-container-low border border-outline-variant p-4 rounded flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-white">No GitHub Account Linked</div>
                  <div className="text-[11px] text-zinc-400 leading-normal">
                    Connect your GitHub account to enable 1-click project export and synchronization directly from your IDE dashboard.
                  </div>
                </div>
                <button
                  onClick={() => {
                    setDeviceFlow(null);
                    setIsGitHubModalOpen(true);
                    setGhError('');
                    setGhSuccess('');
                  }}
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-neutral-950 text-xs font-bold rounded transition-colors cursor-pointer flex items-center gap-2 shrink-0 shadow"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                  </svg>
                  <span>Connect GitHub</span>
                </button>
              </div>
            )}
          </section>

          {/* User Projects Portfolio Section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-surface-tint">folder_special</span>
                <h3 className="profile-section-title text-on-surface">Projects ({profile.totalProjectsCount || profile.projects?.length || 0})</h3>
              </div>
              <span className="text-[11px] text-on-surface-variant">Your workspaces</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {portfolioNotice && (
                <div className="text-[11px] text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 rounded px-3 py-2">
                  {portfolioNotice}
                </div>
              )}
              {profile.projects && profile.projects.length > 0 ? (
                profile.projects.map((proj, idx) => (
                  <div 
                    key={proj.projectId || idx}
                    onClick={() => navigate(`/ide/${proj.projectId}`)}
                    className="profile-project p-3 transition-all cursor-pointer flex justify-between items-start gap-3 group"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="material-symbols-outlined text-surface-tint text-sm mt-0.5">terminal</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-on-surface font-bold group-hover:text-surface-tint transition-colors">
                            {proj.title}
                          </span>
                          <span className="profile-project-role text-cyan-400 border border-cyan-800 px-1.5 py-0.5 rounded-full">
                            {(proj.userRole || proj.role || 'OWNER').toLowerCase()}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-on-surface-variant line-clamp-2">
                          {proj.description?.trim() || `Cloud workspace configured for ${proj.languageEnv || 'RUST_1.75'}.`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-on-surface-variant shrink-0">
                      <span className="hidden sm:inline">{proj.languageEnv || 'RUST_1.75'}</span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRemovePortfolioProject(proj);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Remove from my portfolio"
                        aria-label={`Remove ${proj.title} from my portfolio`}
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                        <span className="hidden sm:inline">Remove</span>
                      </button>
                      <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-on-surface-variant p-3 bg-surface-container-low border border-outline-variant rounded">
                  No projects initialized yet.
                </div>
              )}
            </div>
          </section>

          {/* Quota & Metrics Inspector */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-surface-tint">pie_chart</span>
              <h3 className="profile-section-title text-on-surface">Storage usage</h3>
            </div>

            {(() => {
              const usedMb = profile.usedStorageMb !== undefined ? profile.usedStorageMb : 0;
              const totalMb = profile.allocatedStorageMb || 1024;
              const calcPct = profile.usagePercentage !== undefined
                ? profile.usagePercentage
                : Number(((usedMb / totalMb) * 100).toFixed(2));
              // Keep the visual indicator mathematically aligned with the
              // displayed percentage. The previous 1.5% minimum made tiny
              // values such as 0.01% look far larger than they really were.
              const barWidthPct = Math.max(0, Math.min(100, Number(calcPct)));

              return (
                <div className="bg-surface-container-low p-5 border border-outline-variant space-y-3 rounded">
                  <div className="flex justify-between items-end text-xs font-mono">
                    <span className="text-on-surface-variant">Storage used</span>
                    <span className="text-surface-tint font-bold">
                      {usedMb} MB / {totalMb} MB ({calcPct}%)
                    </span>
                  </div>
                  
                  {/* Dynamic Fullness Progress Bar */}
                  <div className="w-full h-2.5 bg-surface-container-highest rounded-full overflow-hidden border border-outline-variant/30 p-0.5">
                    <div 
                      className="h-full bg-surface-tint rounded-full transition-all duration-500 shadow-sm"
                      style={{ width: `${barWidthPct}%` }}
                      role="progressbar"
                      aria-valuemin="0"
                      aria-valuemax={totalMb}
                      aria-valuenow={Math.min(usedMb, totalMb)}
                      aria-label={`${usedMb} MB of ${totalMb} MB used`}
                    ></div>
                  </div>

                  <p className="text-[11px] text-on-surface-variant/80 font-sans leading-relaxed">
                    Estimated from the content of projects currently available to this account. The value is recalculated when this profile loads; no automatic cold-storage offload is configured.
                  </p>
                </div>
              );
            })()}
          </section>
        </div>
      </div>

      {/* Information Density Cards & Single Logout Action */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
        <div className="control-card p-4 flex flex-col gap-1">
          <span className="profile-meta-label text-on-surface-variant">Last sign-in</span>
          <span className="text-on-surface">{profile.lastLogin}</span>
        </div>
        <div className="control-card p-4 flex flex-col gap-1 justify-between">
          <span className="profile-meta-label text-on-surface-variant">Account</span>
          <button 
            onClick={handleLogout}
            className="text-rose-400 hover:text-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer w-fit"
          >
            <span className="material-symbols-outlined text-sm">logout</span> Sign Out of Account
          </button>
        </div>
      </div>

      {/* Inline Profile Edit Modal Overlay */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 shadow-2xl flex flex-col gap-4 bg-surface-container-low border border-outline-variant rounded-lg font-mono">
            <div className="flex justify-between items-center border-b border-outline-variant/40 pb-3">
              <h2 className="text-sm font-bold text-surface-tint flex items-center gap-2 font-headline">
                <span className="material-symbols-outlined text-sm">edit</span> Edit Account Information
              </h2>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-on-surface-variant hover:text-red-400 cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveProfileEdit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-on-surface-variant uppercase">Full Name / Display Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-[#1A1A1C] border border-outline-variant p-2 text-xs text-on-surface focus:outline-none focus:border-surface-tint"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-on-surface-variant uppercase">Account Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="bg-[#1A1A1C] border border-outline-variant p-2 text-xs text-on-surface focus:outline-none focus:border-surface-tint"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-on-surface-variant uppercase">Profession / Role Tag</label>
                <input
                  type="text"
                  value={editDesignation}
                  onChange={(e) => setEditDesignation(e.target.value)}
                  className="bg-[#1A1A1C] border border-outline-variant p-2 text-xs text-on-surface focus:outline-none focus:border-surface-tint"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-outline-variant/40">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-xs text-on-surface-variant hover:underline cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-surface-tint text-neutral-900 px-4 py-1.5 text-xs font-bold hover:bg-cyan-400 cursor-pointer"
                >
                  Save Account Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GitHub Integration Modal */}
      {isGitHubModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#14141C] border border-cyan-500/30 p-6 rounded-xl max-w-md w-full shadow-2xl space-y-4 font-mono select-none animate-fade-in relative overflow-hidden">
            <div className="flex justify-between items-center pb-3 border-t-0 border-b border-outline-variant/40">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
                <h3 className="font-bold text-sm text-white">Connect GitHub Account</h3>
              </div>
              <button 
                onClick={() => setIsGitHubModalOpen(false)}
                className="text-on-surface-variant hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <p className="text-xs text-zinc-300 font-sans leading-relaxed">
              Authorize ObsidianIDE to access your GitHub repositories to enable 1-click code push, commit synchronization, and branch export directly from your project dashboard.
            </p>

            {ghSuccess && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded text-emerald-300 text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                <span>{ghSuccess}</span>
              </div>
            )}

            {ghError && (
              <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded text-rose-300 text-xs flex items-start gap-2">
                <span className="material-symbols-outlined text-sm mt-0.5">error</span>
                <span className="leading-tight">{ghError}</span>
              </div>
            )}

            <div className="space-y-3.5 pt-1">
              {/* Seamless browser OAuth: redirects straight to GitHub and returns
                  to this profile after authorization. */}
              <button
                type="button"
                onClick={handleConnectDirectOAuth}
                disabled={isOAuthLoading}
                className="w-full py-3.5 px-4 bg-white hover:bg-zinc-200 text-neutral-950 font-bold text-xs rounded-xl transition-all shadow-lg flex items-center justify-center gap-2.5 cursor-pointer hover:scale-[1.01]"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
                <span>{isOAuthLoading ? 'Redirecting to GitHub…' : 'Connect GitHub Securely (Recommended)'}</span>
              </button>

              {deviceFlow && (
                <div className="p-3.5 bg-cyan-950/30 border border-cyan-500/40 rounded-xl space-y-3 text-xs">
                  <div className="font-bold text-cyan-200">Authorize ObsidianIDE on GitHub</div>
                  <div className="text-zinc-300 leading-relaxed">
                    Open GitHub, enter this one-time code, and approve access. This window will finish connecting automatically.
                  </div>
                  <a
                    href={deviceFlow.verificationUri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex text-cyan-300 underline font-bold"
                  >
                    Open GitHub authorization ↗
                  </a>
                  <div className="flex items-center justify-between gap-2 bg-black/50 border border-cyan-500/25 rounded-lg px-3 py-2">
                    <code className="text-base tracking-[0.18em] text-white font-bold">{deviceFlow.userCode}</code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(deviceFlow.userCode)}
                      className="text-[10px] text-cyan-300 hover:text-cyan-100 font-bold"
                    >
                      Copy
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckDeviceAuthNow}
                    disabled={isVerifyingNow}
                    className="w-full py-2 border border-cyan-400/50 text-cyan-200 hover:bg-cyan-950/50 rounded-lg font-bold disabled:opacity-50"
                  >
                    {isVerifyingNow ? 'Checking…' : 'I Have Authorized — Check Now'}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3 py-0.5">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[10px] text-zinc-400 font-mono">OR CONNECT VIA TOKEN</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Personal Access Token Form */}
              <form onSubmit={handleConnectGitHubToken} className="p-3.5 bg-black/60 border border-cyan-500/25 rounded-xl space-y-3 shadow-xl">
                <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400">
                  <span className="material-symbols-outlined text-sm">key</span>
                  <span>Personal Access Token</span>
                </div>

                <p className="text-[10px] text-zinc-300 font-sans leading-relaxed">
                  Generate a token with <code className="text-cyan-300">repo</code> scope on{' '}
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo,read:user,user:email&description=ObsidianIDE"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 underline font-bold"
                  >
                    github.com/settings/tokens ↗
                  </a>
                </p>

                <div className="flex gap-2">
                  <input
                    type="password"
                    value={ghTokenInput}
                    onChange={(e) => setGhTokenInput(e.target.value)}
                    placeholder="ghp_... or github_pat_..."
                    className="flex-1 px-3 py-2 bg-zinc-950 border border-white/20 focus:border-cyan-400 rounded-lg text-xs font-mono text-white placeholder-zinc-600 focus:outline-none transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={isTokenLoading || !ghTokenInput.trim()}
                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 shadow"
                  >
                    {isTokenLoading && <div className="w-3 h-3 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />}
                    <span>{isTokenLoading ? 'Verifying...' : 'Save'}</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="flex justify-end pt-2 border-t border-outline-variant/40">
              <button
                type="button"
                onClick={() => setIsGitHubModalOpen(false)}
                className="px-4 py-1 text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
