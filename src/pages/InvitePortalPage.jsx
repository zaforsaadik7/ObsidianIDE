import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const InvitePortalPage = () => {
  const { inviteId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, userProfile, logout, refreshProfile } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const queryParams = new URLSearchParams(location.search);
  const paramRole = (queryParams.get('role') || 'REVIEWER').toUpperCase();
  const paramEmail = (queryParams.get('email') || '').trim().toLowerCase();
  const paramTitle = (queryParams.get('title') || '').trim();
  const paramOwner = (queryParams.get('owner') || '').trim();

  const isStorageConnected = userProfile?.info?.personalStorageConnected === true;

  // Access States: 'LOADING' | 'UNAUTHENTICATED' | 'OWNER_VIEW' | 'ACCOUNT_MISMATCH' | 'AUTHORIZED' | 'ERROR'
  const [accessState, setAccessState] = useState('LOADING');
  const [authMessage, setAuthMessage] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [projectInfo, setProjectInfo] = useState({
    projectId: inviteId || '',
    title: paramTitle || inviteId || 'Project Workspace',
    ownerEmail: paramOwner || 'Project Owner',
    assignedRole: paramRole
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const evaluateAccess = async () => {
      if (!inviteId) {
        setAccessState('ERROR');
        setAuthMessage('Invalid invitation link: No project ID specified.');
        return;
      }

      let pData = null;

      // 1. Client Firestore Check
      try {
        const projDocRef = doc(db, 'projects', inviteId);
        const projSnap = await getDoc(projDocRef);
        if (projSnap.exists()) {
          pData = projSnap.data();
        }
      } catch (fsErr) {
        console.warn("Client Firestore invite lookup notice:", fsErr);
      }

      // 2. Fallback to REST API (with isInvite=true preview bypass)
      if (!pData) {
        try {
          const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';
          const res = await fetch(`/api/projects/${inviteId}?userEmail=${encodeURIComponent(currentUser?.email || paramEmail || '')}&isInvite=true`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
          });
          if (res.ok) {
            const resData = await res.json();
            pData = resData.project;
          }
        } catch (apiErr) {
          console.warn("API invite lookup notice:", apiErr);
        }
      }

      const projTitle = pData?.title || paramTitle || inviteId;
      const projOwner = pData?.ownerEmail || paramOwner || 'Project Owner';
      const userCollabRole = pData?.collaborators && currentUser?.email 
        ? (pData.collaborators[currentUser.email.toLowerCase()] || pData.collaborators[currentUser.email])
        : null;
      const effectiveRole = userCollabRole || paramRole;

      setProjectInfo({
        projectId: inviteId,
        title: projTitle,
        ownerEmail: projOwner,
        assignedRole: effectiveRole
      });

      // State 1: Visitor is NOT logged in (Incognito / Guest)
      if (!currentUser || !currentUser.email) {
        setAccessState('UNAUTHENTICATED');
        setAuthMessage(paramEmail 
          ? `Authentication is required. Please sign in or create an account with '${paramEmail}' to accept this invitation.`
          : 'Authentication is required. Please sign in to accept this invitation.');
        return;
      }

      const loggedEmail = currentUser.email.trim().toLowerCase();
      const ownerEmailNorm = (projOwner || '').trim().toLowerCase();

      // State 2: Logged-in user is the Repository Owner
      if (ownerEmailNorm && loggedEmail === ownerEmailNorm) {
        setAccessState('OWNER_VIEW');
        setAuthMessage(paramEmail
          ? `You are the owner of this repository. This invitation link is configured for '${paramEmail}' (${paramRole}).`
          : 'You are the owner of this repository. You already have full unrestricted administrative control.');
        return;
      }

      // State 3: Targeted Invitation has paramEmail, but logged-in user is a DIFFERENT account
      if (paramEmail && loggedEmail !== paramEmail && !userCollabRole) {
        setAccessState('ACCOUNT_MISMATCH');
        setAuthMessage(`This invitation was issued specifically for '${paramEmail}'. You are currently signed in as '${currentUser.email}'.`);
        return;
      }

      // State 4: Logged-in user matches target email OR is already on the collaborator roster
      setAccessState('AUTHORIZED');
      setAuthMessage(`Your account '${currentUser.email}' is authorized to join '${projTitle}' as ${effectiveRole}.`);
    };

    evaluateAccess();
  }, [inviteId, paramRole, paramEmail, currentUser]);

  const handleAccept = async () => {
    if (accessState !== 'AUTHORIZED') return;
    setLoading(true);

    const targetPid = projectInfo.projectId || inviteId;

    try {
      const userEmail = currentUser.email.toLowerCase();
      const cleanDocId = userEmail.split('@')[0].replace(/[^a-z0-9_]/g, '_');
      const assignedRole = (projectInfo.assignedRole || paramRole || 'EDITOR').toUpperCase();

      // 1. Update project document collaborators roster in Client Firestore
      const projRef = doc(db, 'projects', targetPid);
      const projSnap = await getDoc(projRef);
      const title = projSnap.exists() ? (projSnap.data().title || targetPid) : projectInfo.title;
      const ownerEmail = projSnap.exists() ? (projSnap.data().ownerEmail || projectInfo.ownerEmail) : projectInfo.ownerEmail;

      await setDoc(projRef, {
        collaborators: {
          [userEmail]: assignedRole
        }
      }, { merge: true });

      // 2. Save project reference into collaborator's user document
      await setDoc(doc(db, 'users', cleanDocId), {
        info: {
          personalStorageConnected: true,
          personalStorageDatabaseName: 'ObsidianIDE',
          storageStrategy: 'FIREBASE_PERSONAL'
        },
        projects: {
          [targetPid]: {
            projectId: targetPid,
            title,
            languageEnv: projSnap.exists() ? projSnap.data().languageEnv : 'PYTHON_3.11',
            userRole: assignedRole,
            ownerEmail,
            updatedAt: new Date().toISOString()
          }
        }
      }, { merge: true });
    } catch (fsErr) {
      console.warn("Client Firestore accept notice:", fsErr);
    }

    // 3. Call REST API
    try {
      const token = currentUser.getIdToken ? await currentUser.getIdToken() : '';
      await fetch(`/api/projects/${targetPid}/invite`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          email: currentUser.email,
          role: projectInfo.assignedRole || paramRole || 'EDITOR'
        })
      });

      await refreshProfile();
    } catch (err) {
      console.warn("Invite API handshake notice:", err);
    } finally {
      setLoading(false);
      navigate(`/ide/${targetPid}`);
    }
  };

  const handleSwitchAccount = async () => {
    try {
      await logout();
    } catch (e) {}
    const authUrl = `/auth?redirect=${encodeURIComponent(location.pathname + location.search)}${paramEmail ? `&email=${encodeURIComponent(paramEmail)}` : ''}`;
    navigate(authUrl);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="min-h-screen bg-surface-light dark:bg-[#0A0A0B] text-neutral-900 dark:text-white font-sans flex flex-col justify-between p-4">
      {/* Top Navbar */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 h-12 bg-surface-container-low/80 dark:bg-surface-dark/80 backdrop-blur-xl border-b border-outline-variant font-mono">
        <span 
          onClick={() => navigate('/')}
          className="text-xl font-bold text-surface-tint tracking-tighter font-headline cursor-pointer"
        >
          ObsidianIDE
        </span>
      </header>

      {/* Centered Invite Card */}
      <main className="flex-1 flex items-center justify-center p-4 pt-16">
        <div className="glass-panel animate-fade-in max-w-md w-full bg-surface-container-low/80 border border-outline-variant p-8 shadow-2xl rounded-xl font-mono">
          
          {/* Card Header Status */}
          <div className="text-center mb-6">
            <span className={`tracking-widest text-xs uppercase block font-bold ${
              accessState === 'AUTHORIZED' 
                ? 'text-emerald-400' 
                : accessState === 'OWNER_VIEW'
                  ? 'text-cyan-400'
                  : accessState === 'UNAUTHENTICATED'
                    ? 'text-amber-400'
                    : 'text-rose-400'
            }`}>
              {accessState === 'AUTHORIZED' && 'SECURE_INVITATION'}
              {accessState === 'OWNER_VIEW' && 'REPOSITORY_OWNER'}
              {accessState === 'UNAUTHENTICATED' && 'AUTHENTICATION_REQUIRED'}
              {accessState === 'ACCOUNT_MISMATCH' && 'ACCOUNT_MISMATCH'}
              {accessState === 'LOADING' && 'VERIFYING_CREDENTIALS...'}
              {accessState === 'ERROR' && 'SECURITY_ALERT'}
            </span>

            <h1 className="text-xl font-bold font-headline mt-2 text-on-surface">
              {accessState === 'AUTHORIZED' && 'Workspace Access Ready'}
              {accessState === 'OWNER_VIEW' && 'You Own This Repository'}
              {accessState === 'UNAUTHENTICATED' && 'Sign In to Accept Invitation'}
              {accessState === 'ACCOUNT_MISMATCH' && 'Invitation for Another Account'}
              {accessState === 'LOADING' && 'Checking Invitation Roster...'}
              {accessState === 'ERROR' && 'Invalid Invitation Link'}
            </h1>
          </div>

          {/* Context Notice Boxes */}
          {accessState === 'UNAUTHENTICATED' && (
            <div className="p-3.5 mb-5 bg-amber-950/40 border border-amber-500/50 rounded-lg text-amber-200 text-xs space-y-1.5">
              <div className="font-bold flex items-center gap-2 text-amber-300">
                <span className="material-symbols-outlined text-base">lock</span>
                <span>Sign-In Required</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-200/90">
                {paramEmail ? (
                  <>This invitation is targeted for <strong className="text-white underline">{paramEmail}</strong>. Please sign in or create an account to verify your identity and enter the project workspace.</>
                ) : (
                  <>Please sign in or register an account to accept this project invitation.</>
                )}
              </p>
            </div>
          )}

          {accessState === 'ACCOUNT_MISMATCH' && (
            <div className="p-3.5 mb-5 bg-rose-950/50 border border-rose-500/60 rounded-lg text-rose-200 text-xs space-y-1.5">
              <div className="font-bold flex items-center gap-2 text-rose-300">
                <span className="material-symbols-outlined text-base">gpp_bad</span>
                <span>Account Mismatch</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                This invitation was created for <strong className="text-white underline">{paramEmail}</strong>.
              </p>
              <p className="text-[11px] text-rose-200/80">
                You are currently signed in as <strong className="text-cyan-300">{currentUser?.email}</strong>. To accept this invitation, please switch to the invited account.
              </p>
            </div>
          )}

          {accessState === 'OWNER_VIEW' && (
            <div className="p-3.5 mb-5 bg-cyan-950/40 border border-cyan-500/40 rounded-lg text-cyan-200 text-xs space-y-1.5">
              <div className="font-bold flex items-center gap-2 text-cyan-300">
                <span className="material-symbols-outlined text-base">admin_panel_settings</span>
                <span>Repository Owner View</span>
              </div>
              <p className="text-[11px] leading-relaxed text-cyan-200/90">
                {paramEmail ? (
                  <>You created this shareable invitation link for <strong className="text-white">{paramEmail}</strong> as <strong className="text-cyan-300">{projectInfo.assignedRole}</strong>. You already have full unrestricted Owner permissions.</>
                ) : (
                  <>You are the owner of this repository and have unrestricted access.</>
                )}
              </p>
            </div>
          )}

          {/* Project Details Spec Box */}
          <div className="bg-neutral-900/90 border border-white/10 p-4 text-xs mb-6 rounded-lg space-y-2">
            <div className="flex justify-between items-center text-zinc-400">
              <span>&gt; Repository:</span>
              <span className="text-white font-bold font-mono">{projectInfo.title}</span>
            </div>
            <div className="flex justify-between items-center text-zinc-400">
              <span>&gt; Owner:</span>
              <span className="text-white font-mono">{projectInfo.ownerEmail}</span>
            </div>
            <div className="flex justify-between items-center text-zinc-400">
              <span>&gt; Assigned_Role:</span>
              <span className="text-cyan-300 font-bold uppercase font-mono">{projectInfo.assignedRole}</span>
            </div>
            {paramEmail && (
              <div className="flex justify-between items-center text-zinc-400">
                <span>&gt; Invited_Recipient:</span>
                <span className="text-purple-300 font-mono">{paramEmail}</span>
              </div>
            )}
            {currentUser?.email && (
              <div className="flex justify-between items-center text-zinc-400 pt-1 border-t border-white/5">
                <span>&gt; Active_Account:</span>
                <span className="text-cyan-300 font-bold font-mono">{currentUser.email}</span>
              </div>
            )}
          </div>

          {/* Dynamic Action Buttons */}
          <div className="flex flex-col gap-3">
            {/* 1. Authorized State: Accept Button */}
            {accessState === 'AUTHORIZED' && (
              <button 
                onClick={handleAccept}
                disabled={loading}
                className="w-full font-bold py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] cursor-pointer active:scale-98"
              >
                {loading ? 'CONNECTING TO WORKSPACE...' : 'ACCEPT INVITATION & ENTER IDE'}
              </button>
            )}

            {/* 2. Unauthenticated State: Sign In / Register Buttons */}
            {accessState === 'UNAUTHENTICATED' && (
              <>
                <button 
                  onClick={() => navigate(`/auth?redirect=${encodeURIComponent(location.pathname + location.search)}${paramEmail ? `&email=${encodeURIComponent(paramEmail)}` : ''}`)}
                  className="w-full font-bold py-3 bg-surface-tint hover:bg-cyan-400 text-neutral-950 rounded-lg transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">login</span>
                  <span>{paramEmail ? `Sign In as ${paramEmail}` : 'Sign In to Accept'}</span>
                </button>
                <button 
                  onClick={() => navigate(`/auth?mode=register&redirect=${encodeURIComponent(location.pathname + location.search)}${paramEmail ? `&email=${encodeURIComponent(paramEmail)}` : ''}`)}
                  className="w-full font-bold py-2.5 bg-neutral-800 hover:bg-neutral-700 text-zinc-200 border border-white/10 rounded-lg transition-colors cursor-pointer text-xs flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">person_add</span>
                  <span>Create New Account</span>
                </button>
              </>
            )}

            {/* 3. Account Mismatch State: Switch Account Button */}
            {accessState === 'ACCOUNT_MISMATCH' && (
              <button 
                onClick={handleSwitchAccount}
                className="w-full font-bold py-3 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-lg transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">sync_alt</span>
                <span>Switch Account (Sign in as {paramEmail})</span>
              </button>
            )}

            {/* 4. Owner View: Launch in IDE & Copy Link */}
            {accessState === 'OWNER_VIEW' && (
              <>
                <button 
                  onClick={() => navigate(`/ide/${projectInfo.projectId || inviteId}`)}
                  className="w-full font-bold py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">code</span>
                  <span>Launch Repository in IDE</span>
                </button>
                <button 
                  onClick={handleCopyLink}
                  className="w-full py-2 bg-neutral-900 border border-white/10 hover:border-cyan-400 text-cyan-300 rounded-lg transition-colors cursor-pointer text-xs flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">{copiedLink ? 'check' : 'content_copy'}</span>
                  <span>{copiedLink ? 'Invitation Link Copied!' : 'Copy Shareable Link'}</span>
                </button>
              </>
            )}

            {/* Return Navigation */}
            <button 
              onClick={() => navigate(currentUser ? '/dashboard' : '/')}
              className="w-full border border-white/10 text-on-surface-variant py-2.5 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer text-xs mt-1"
            >
              {currentUser ? 'RETURN TO DASHBOARD' : 'RETURN TO HOME'}
            </button>
          </div>
        </div>
      </main>

      {/* Footer Status Bar */}
      <footer className="px-6 py-2 border-t border-outline-variant text-[11px] font-mono text-on-surface-variant flex justify-between items-center bg-surface-container-lowest/80">
        <div>© 2026 Obsidian Systems. Built via agile workspace methodology layers.</div>
        <div className="text-surface-tint font-bold">INVITE_AUTH_V2_ACTIVE</div>
      </footer>
    </div>
  );
};
export default InvitePortalPage;
