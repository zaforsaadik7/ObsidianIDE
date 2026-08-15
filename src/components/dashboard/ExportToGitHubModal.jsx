import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const ExportToGitHubModal = ({
  isOpen,
  onClose,
  project,
  currentUser,
  userProfile,
  onProjectUpdated
}) => {
  if (!isOpen || !project) return null;

  const [repoUrlInput, setRepoUrlInput] = useState(project.githubRepoUrl || '');
  const [commitMessage, setCommitMessage] = useState(`Sync from ObsidianIDE: ${project.title || 'Project'}`);
  const [isPushing, setIsPushing] = useState(false);
  const [pushProgress, setPushProgress] = useState(0);
  const [statusStepText, setStatusStepText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successResult, setSuccessResult] = useState(null);
  const [isEditingRepoUrl, setIsEditingRepoUrl] = useState(!project.githubRepoUrl);

  const userEmail = (currentUser?.email || userProfile?.info?.email || '').trim().toLowerCase();
  const cleanDocId = (userEmail.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const githubInfo = userProfile?.info?.github || null;
  const isGitHubConnected = Boolean(githubInfo?.connected);
  // accessToken may come from PAT entry or from manifest+OAuth flow stored in Firestore
  const resolvedAccessToken = githubInfo?.accessToken || '';

  useEffect(() => {
    setRepoUrlInput(project.githubRepoUrl || '');
    setIsEditingRepoUrl(!project.githubRepoUrl);
    setErrorMessage('');
    setSuccessResult(null);
    setPushProgress(0);
    setStatusStepText('');
    setCommitMessage(`ObsidianIDE Sync: ${project.title || 'Project'} (${new Date().toLocaleDateString()})`);
  }, [project]);

  // Execute Project Push to GitHub
  const handlePushToGitHub = async (e) => {
    if (e) e.preventDefault();
    const targetUrl = (isEditingRepoUrl ? repoUrlInput : (project.githubRepoUrl || repoUrlInput)).trim();

    if (!targetUrl) {
      setErrorMessage('Please enter a valid GitHub repository URL (e.g. https://github.com/username/my-repo or username/my-repo)');
      return;
    }

    setIsPushing(true);
    setErrorMessage('');
    setSuccessResult(null);
    setPushProgress(10);
    setStatusStepText('Reading project files from ObsidianIDE repository...');

    try {
      // 1. Resolve Project Files (Prefer Firestore working_files > project_files)
      let filesToPush = project.working_files || project.master_project_files || project.project_files || [];
      
      try {
        const projRef = doc(db, 'projects', project.projectId);
        const pSnap = await getDoc(projRef);
        if (pSnap.exists()) {
          const pData = pSnap.data();
          filesToPush = pData.working_files || pData.master_project_files || pData.project_files || filesToPush;
        }
      } catch (e) {
        console.warn("Project fetch notice:", e);
      }

      if (!filesToPush || filesToPush.length === 0) {
        throw new Error('No files found in this project to push. Please open the project and create or save files first.');
      }

      setPushProgress(35);
      setStatusStepText('Authenticating with GitHub & verifying repository access...');

      // 2. Call Backend Push Endpoint
      const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';
      const pushRes = await fetch('/api/github/push-project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          projectId: project.projectId,
          userEmail,
          accessToken: resolvedAccessToken,
          repoUrl: targetUrl,
          commitMessage,
          branch: 'main',
          files: filesToPush
        })
      });

      setPushProgress(75);
      setStatusStepText('Building Git tree blobs and committing files to main branch...');

      const pushData = await pushRes.json();

      if (!pushRes.ok) {
        throw new Error(pushData.message || pushData.error || 'Failed to push files to GitHub');
      }

      setPushProgress(100);
      setStatusStepText('Push complete!');

      // 3. Save Linked Repo URL to Client Firestore Project Document
      try {
        const projDocRef = doc(db, 'projects', project.projectId);
        await setDoc(projDocRef, {
          githubRepoUrl: pushData.repoUrl || targetUrl,
          githubLastSyncedAt: pushData.syncedAt,
          githubLastCommitSha: pushData.commitSha,
          updatedAt: pushData.syncedAt
        }, { merge: true });
      } catch (fsErr) {
        console.warn("Save githubRepoUrl to client firestore notice:", fsErr);
      }

      // 4. Update user's projects in user doc if needed
      try {
        const userDocRef = doc(db, 'users', cleanDocId);
        await setDoc(userDocRef, {
          projects: {
            [project.projectId]: {
              ...(project || {}),
              githubRepoUrl: pushData.repoUrl || targetUrl,
              githubLastSyncedAt: pushData.syncedAt
            }
          }
        }, { merge: true });
      } catch (e) {}

      setSuccessResult(pushData);
      setIsEditingRepoUrl(false);
      onProjectUpdated?.({
        ...project,
        githubRepoUrl: pushData.repoUrl || targetUrl,
        githubLastSyncedAt: pushData.syncedAt
      });
    } catch (err) {
      console.error("Push to GitHub Error:", err);
      setErrorMessage(err.message || 'An unexpected error occurred while pushing to GitHub.');
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#12121A] border border-cyan-500/30 p-6 rounded-2xl max-w-lg w-full shadow-2xl space-y-5 font-mono select-none animate-fade-in relative overflow-hidden text-[#E3E2E6]">
        {/* Ambient Glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* ── Modal Header ── */}
        <div className="flex justify-between items-center pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/15 flex items-center justify-center text-white">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Export Project to GitHub</h3>
              <div className="text-[10px] text-cyan-400 font-mono">PROJECT: {project.title}</div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-zinc-400 hover:text-white cursor-pointer p-1 rounded hover:bg-white/5"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        {/* ── Condition 1: GitHub Account NOT Connected Notice ── */}
        {!isGitHubConnected ? (
          <div className="space-y-4 py-2">
            <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-xl space-y-2 text-amber-200">
              <div className="flex items-center gap-2 font-bold text-xs">
                <span className="material-symbols-outlined text-base">warning</span>
                <span>GitHub Account Not Connected</span>
              </div>
              <p className="text-xs text-zinc-300 font-sans leading-relaxed">
                To export or push this project directly to a GitHub repository, you must first connect your GitHub account with ObsidianIDE.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs text-zinc-400 hover:text-white cursor-pointer font-mono"
              >
                Cancel
              </button>
              <a
                href="/profile"
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold text-xs rounded transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">link</span>
                <span>Connect GitHub in Profile</span>
              </a>
            </div>
          </div>
        ) : (
          /* ── Condition 2: GitHub Account IS Connected ── */
          <div className="space-y-4">
            {/* Connected User Badge */}
            <div className="flex items-center justify-between p-2.5 bg-zinc-950/60 border border-white/10 rounded-xl text-xs">
              <div className="flex items-center gap-2.5">
                {githubInfo.avatarUrl ? (
                  <img src={githubInfo.avatarUrl} alt="Avatar" className="w-6 h-6 rounded-full border border-cyan-400" />
                ) : (
                  <span className="material-symbols-outlined text-sm text-cyan-400">account_circle</span>
                )}
                <span className="text-zinc-300">Connected as <strong className="text-white font-mono">@{githubInfo.username}</strong></span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
                ● AUTHORIZED
              </span>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 bg-rose-950/50 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-start gap-2 animate-fade-in">
                <span className="material-symbols-outlined text-sm text-rose-400 mt-0.5">error</span>
                <div className="leading-relaxed font-sans">{errorMessage}</div>
              </div>
            )}

            {/* Success Notice Banner */}
            {successResult && (
              <div className="p-4 bg-emerald-950/50 border border-emerald-500/40 rounded-xl space-y-2 animate-fade-in">
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs">
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  <span>Project Pushed to GitHub Successfully!</span>
                </div>
                <div className="text-[11px] text-zinc-300 font-sans leading-normal">
                  Pushed <strong className="text-white font-mono">{successResult.pushedFilesCount}</strong> files to branch <code className="text-cyan-300 font-mono">{successResult.branch || 'main'}</code>.
                </div>
                <div className="pt-1 flex gap-2">
                  <a
                    href={successResult.commitUrl || successResult.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>View on GitHub</span>
                    <span className="material-symbols-outlined text-xs">open_in_new</span>
                  </a>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* Push Progress Bar */}
            {isPushing && (
              <div className="p-4 bg-black/60 border border-cyan-500/40 rounded-xl space-y-2.5 animate-fade-in">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                    <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    <span>Pushing Project to GitHub...</span>
                  </span>
                  <span className="text-cyan-400 font-mono font-bold">{pushProgress}%</span>
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden border border-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-300"
                    style={{ width: `${pushProgress}%` }}
                  />
                </div>
                <div className="text-[11px] text-zinc-400 font-mono truncate">{statusStepText}</div>
              </div>
            )}

            {/* Repository Link & Push Form */}
            {!successResult && (
              <form onSubmit={handlePushToGitHub} className="space-y-3.5">
                {/* Linked Repository Display (If already linked from previous export) */}
                {project.githubRepoUrl && !isEditingRepoUrl ? (
                  <div className="p-3.5 bg-zinc-950/70 border border-cyan-500/30 rounded-xl space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-400">Linked Repository:</span>
                      <button
                        type="button"
                        onClick={() => setIsEditingRepoUrl(true)}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                      >
                        Change Repository Link
                      </button>
                    </div>
                    <div className="text-xs font-mono text-white flex items-center gap-2 truncate">
                      <span className="material-symbols-outlined text-sm text-cyan-400">source</span>
                      <span className="truncate">{project.githubRepoUrl}</span>
                    </div>
                    {project.githubLastSyncedAt && (
                      <div className="text-[10px] text-zinc-500 font-mono">
                        Last Synced: {new Date(project.githubLastSyncedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                ) : (
                  /* New Repository Input & Step-by-Step Instructions */
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                        <span>Target GitHub Repository Link or Slug</span>
                        {project.githubRepoUrl && (
                          <button
                            type="button"
                            onClick={() => setIsEditingRepoUrl(false)}
                            className="text-[10px] text-zinc-400 hover:text-white underline cursor-pointer"
                          >
                            Cancel Edit
                          </button>
                        )}
                      </label>
                      <input
                        type="text"
                        value={repoUrlInput}
                        onChange={(e) => setRepoUrlInput(e.target.value)}
                        placeholder="https://github.com/username/repo-name or username/repo-name"
                        className="w-full px-3 py-2 bg-black/60 border border-white/15 rounded-lg text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                        required
                        disabled={isPushing}
                      />
                    </div>

                    {/* Step-by-Step Instructions on How to Create a Repository */}
                    <div className="p-3.5 bg-cyan-950/20 border border-cyan-500/20 rounded-xl space-y-2 text-xs font-sans">
                      <div className="text-cyan-300 font-bold text-[11px] flex items-center gap-1.5 font-mono">
                        <span className="material-symbols-outlined text-sm">help</span>
                        <span>How to create a new repository on GitHub:</span>
                      </div>
                      <ol className="list-decimal list-inside space-y-1 text-[11px] text-zinc-300 leading-relaxed">
                        <li>
                          Open{' '}
                          <a
                            href="https://github.com/new"
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-400 hover:underline font-mono font-bold"
                          >
                            github.com/new ↗
                          </a>{' '}
                          in a new tab.
                        </li>
                        <li>Enter a repository name (e.g. <code className="text-cyan-300 bg-black/40 px-1 py-0.2 rounded font-mono">{project.title.toLowerCase().replace(/[^a-z0-9_]/g, '-')}</code>).</li>
                        <li>Choose <strong>Public</strong> or <strong>Private</strong>.</li>
                        <li>Click <strong>"Create repository"</strong>.</li>
                        <li>Copy the URL from your browser address bar and paste it above!</li>
                      </ol>
                    </div>
                  </div>
                )}

                {/* Commit Message Input */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 font-mono">Commit Message</label>
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="w-full px-3 py-1.5 bg-black/60 border border-white/15 rounded-lg text-xs font-mono text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
                    disabled={isPushing}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isPushing}
                    className="px-4 py-2 text-xs text-zinc-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPushing}
                    className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-neutral-950 font-bold text-xs rounded-lg transition-all shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-sm">publish</span>
                    <span>{isPushing ? 'Pushing...' : (project.githubRepoUrl && !isEditingRepoUrl ? 'Push Updates to GitHub' : 'Upload & Sync to GitHub')}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExportToGitHubModal;
