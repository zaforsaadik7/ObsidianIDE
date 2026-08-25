import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../firebase';
import { GithubAuthProvider, linkWithPopup, signInWithPopup } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

export const ConnectGitHubPage = () => {
  const { currentUser, userProfile, setUserProfile } = useAuth();
  const navigate = useNavigate();

  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [isTokenLoading, setIsTokenLoading] = useState(false);
  const [deviceFlow, setDeviceFlow] = useState(null);
  const [isCopiedCode, setIsCopiedCode] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenFallback, setShowTokenFallback] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [connectedUser, setConnectedUser] = useState(null);
  const [successNotice, setSuccessNotice] = useState('');

  const userAccountEmail = currentUser?.email || 'user@example.com';
  const cleanDocId = (userAccountEmail.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_');

  const saveGitHubConnectionToProfile = async (githubData) => {
    // 1. Update In-Memory userProfile State
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
        info: {
          github: githubData
        },
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (fsErr) {
      console.warn("Client Firestore user github update notice:", fsErr);
    }

    // 3. Save to Backend REST API
    try {
      const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';
      await fetch('/api/github/connect-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          userEmail: userAccountEmail,
          accessToken: githubData.accessToken,
          githubUsername: githubData.username,
          githubAvatarUrl: githubData.avatarUrl,
          githubProfileUrl: githubData.profileUrl
        })
      });
    } catch (apiErr) {
      console.warn("Backend connect-user notice:", apiErr);
    }
  };

  const handleConnectDirectOAuth = () => {
    setIsOAuthLoading(true);
    const activeEmail = userAccountEmail;
    const backendBase = (import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    window.location.href = `${backendBase}/api/github/oauth/start?email=${encodeURIComponent(activeEmail)}&returnUrl=${encodeURIComponent(window.location.origin + '/dashboard?github_connected=true')}`;
  };

  // 1-Click Device Code Flow (VS Code Extension style)
  const handleStartDeviceFlow = async () => {
    setIsOAuthLoading(true);
    setErrorMessage('');
    setSuccessNotice('');

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

      if (data.userCode) {
        navigator.clipboard?.writeText(data.userCode).catch(() => {});
      }

      const targetEmail = userAccountEmail;
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
            setConnectedUser(pollData.github);
            await saveGitHubConnectionToProfile(pollData.github);
            setSuccessNotice(`🎉 Successfully connected GitHub account @${pollData.github.username}!`);
            setTimeout(() => {
              navigate('/dashboard');
            }, 1500);
          } else if (pollData.status === 'ERROR') {
            clearInterval(pollTimer);
            setDeviceFlow(null);
            setErrorMessage(pollData.error || 'GitHub authorization was declined.');
          }
        } catch (pollErr) {
          console.warn("Polling notice:", pollErr);
        }
      }, pollInterval);

      setTimeout(() => clearInterval(pollTimer), 15 * 60 * 1000);
    } catch (err) {
      console.error("Device flow error:", err);
      setErrorMessage(err.message || 'Failed to start GitHub login. Please try again.');
      setIsOAuthLoading(false);
    }
  };

  const [isVerifyingNow, setIsVerifyingNow] = useState(false);

  const handleCheckDeviceAuthNow = async () => {
    if (!deviceFlow?.deviceCode) return;
    setIsVerifyingNow(true);
    setErrorMessage('');

    try {
      const targetEmail = userAccountEmail;
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
        setConnectedUser(pollData.github);
        await saveGitHubConnectionToProfile(pollData.github);
        setSuccessNotice(`🎉 Successfully connected GitHub account @${pollData.github.username}!`);
        setTimeout(() => {
          navigate('/dashboard');
        }, 1500);
      } else if (pollData.status === 'PENDING') {
        setErrorMessage('GitHub has not completed authorization yet. Please ensure you clicked "Authorize" on GitHub, then click Verify again.');
      } else if (pollData.status === 'ERROR') {
        setErrorMessage(pollData.error || 'GitHub authorization declined.');
      }
    } catch (e) {
      setErrorMessage('Network error checking status: ' + e.message);
    } finally {
      setIsVerifyingNow(false);
    }
  };

  // 2. Connect via Personal Access Token
  const handleConnectToken = async (e) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setErrorMessage('Please enter a GitHub Personal Access Token.');
      return;
    }

    setIsTokenLoading(true);
    setErrorMessage('');
    setSuccessNotice('');

    try {
      const cleanToken = tokenInput.trim();
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

      setConnectedUser(githubData);
      await saveGitHubConnectionToProfile(githubData);

      setSuccessNotice(`🎉 Successfully connected GitHub account @${ghUser.login}!`);
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err) {
      console.error("Token verification error:", err);
      setErrorMessage(err.message || 'Failed to verify GitHub token. Please ensure it is valid and has "repo" scope.');
    } finally {
      setIsTokenLoading(false);
    }
  };

  const handleSkip = () => {
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0E] text-[#E3E2E6] flex flex-col justify-between select-none">
      {/* Header */}
      <header className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-[#101015]/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <span className="material-symbols-outlined text-white text-lg">code_blocks</span>
          </div>
          <div>
            <div className="font-bold tracking-wider text-sm text-white">OBSIDIAN IDE</div>
            <div className="text-[10px] text-cyan-400 font-mono">STEP 2 OF 2: GITHUB INTEGRATION</div>
          </div>
        </div>

        <button
          onClick={handleSkip}
          className="text-xs font-mono text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1"
        >
          <span>Skip for Now</span>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
        </button>
      </header>

      {/* Main Content Card */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-[#14141C]/90 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-2xl relative overflow-hidden">
          {/* Subtle Background Glow */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Icon & Title */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/15 flex items-center justify-center shadow-inner text-white">
              <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-wide">Connect Your GitHub Account</h1>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">Empower your ObsidianIDE projects with 1-click cloud sync</p>
            </div>
          </div>

          {/* Value Proposition Box */}
          <div className="bg-cyan-950/30 border border-cyan-500/30 rounded-xl p-4 mb-6 space-y-2">
            <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs">
              <span className="material-symbols-outlined text-base">cloud_sync</span>
              <span>Why Connect GitHub?</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              By connecting your GitHub account with ObsidianIDE, you will be able to <strong className="text-white">export, update, and push your projects directly to your GitHub repositories</strong> with a single click right from your workspace dashboard.
            </p>
            <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-mono text-cyan-200">
              <span className="bg-cyan-900/40 px-2 py-0.5 rounded border border-cyan-500/20">✓ Read & Write Repositories</span>
              <span className="bg-cyan-900/40 px-2 py-0.5 rounded border border-cyan-500/20">✓ 1-Click Code Push</span>
              <span className="bg-cyan-900/40 px-2 py-0.5 rounded border border-cyan-500/20">✓ Live Commit Sync</span>
            </div>
          </div>

          {/* Benefits Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-black/40 border border-white/5 rounded-xl space-y-1">
              <span className="material-symbols-outlined text-cyan-400 text-lg">cloud_upload</span>
              <div className="text-xs font-bold text-zinc-200 font-headline">1-Click Push</div>
              <p className="text-[11px] text-zinc-400 leading-normal">Push entire project trees directly to your GitHub repository.</p>
            </div>
            <div className="p-3.5 bg-black/40 border border-white/5 rounded-xl space-y-1">
              <span className="material-symbols-outlined text-purple-400 text-lg">sync_alt</span>
              <div className="text-xs font-bold text-zinc-200 font-headline">Auto-Linked Sync</div>
              <p className="text-[11px] text-zinc-400 leading-normal">Future pushes automatically sync to your saved repository.</p>
            </div>
            <div className="p-3.5 bg-black/40 border border-white/5 rounded-xl space-y-1">
              <span className="material-symbols-outlined text-emerald-400 text-lg">security</span>
              <div className="text-xs font-bold text-zinc-200 font-headline">Safe & Scoped</div>
              <p className="text-[11px] text-zinc-400 leading-normal">Access is strictly scoped to your authorized repositories.</p>
            </div>
          </div>

          {/* Alerts */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-950/40 border border-rose-500/50 rounded-xl text-xs text-rose-300 font-mono flex items-start gap-2 animate-fade-in">
              <span className="material-symbols-outlined text-rose-400 text-base shrink-0">error</span>
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {successNotice && (
            <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/50 rounded-xl text-xs text-emerald-300 font-mono flex items-center gap-2 animate-fade-in">
              <span className="material-symbols-outlined text-emerald-400 text-base">check_circle</span>
              <div className="flex-1 font-bold">{successNotice}</div>
            </div>
          )}

          {/* Action Options */}
          <div className="space-y-4">
            {/* Primary 1-Click Manifest Button */}
            <button
              onClick={() => {
                const activeEmail = userAccountEmail;
                const backendBase = (import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
                window.location.href = `${backendBase}/api/github/manifest/start?email=${encodeURIComponent(activeEmail)}&returnUrl=${encodeURIComponent(window.location.origin + '/dashboard?github_connected=true')}`;
              }}
              className="w-full py-4 px-5 bg-white hover:bg-zinc-200 text-neutral-950 font-bold text-sm rounded-xl transition-all shadow-xl flex items-center justify-center gap-3 cursor-pointer hover:scale-[1.01]"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
              <span>1-Click Connect via GitHub App (Recommended)</span>
            </button>

            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[10px] text-zinc-400 font-mono">OR CONNECT VIA TOKEN</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Personal Access Token Form */}
            <form onSubmit={handleConnectToken} className="p-4 bg-black/60 border border-cyan-500/30 rounded-2xl space-y-3.5 shadow-2xl animate-fade-in">
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
                <span className="material-symbols-outlined text-base">key</span>
                <span>Personal Access Token</span>
              </div>

              <p className="text-[11px] text-zinc-300 font-sans leading-relaxed">
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
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="ghp_... or github_pat_..."
                  className="flex-1 px-3.5 py-2.5 bg-zinc-950 border border-white/20 focus:border-cyan-400 rounded-xl text-xs font-mono text-white placeholder-zinc-600 focus:outline-none transition-colors shadow-inner"
                />
                <button
                  type="submit"
                  disabled={isTokenLoading || !tokenInput.trim()}
                  className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shrink-0"
                >
                  {isTokenLoading && <div className="w-3.5 h-3.5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />}
                  <span>{isTokenLoading ? 'Verifying...' : 'Save Token'}</span>
                </button>
              </div>
            </form>

            {/* Skip Option */}
            <div className="pt-2 flex justify-between items-center text-xs font-mono">
              <span className="text-zinc-500">You can also connect anytime from your Profile page.</span>
              <button
                type="button"
                onClick={handleSkip}
                className="text-zinc-400 hover:text-white transition-colors cursor-pointer font-bold flex items-center gap-1"
              >
                <span>Skip</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-3 border-t border-white/10 text-center text-xs font-mono text-zinc-500 bg-[#101015]/80">
        ObsidianIDE Cloud Sync • Secure OAuth 2.0 & Token Authorization
      </footer>
    </div>
  );
};

export default ConnectGitHubPage;
