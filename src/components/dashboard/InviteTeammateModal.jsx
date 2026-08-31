import React, { useState } from 'react';
import { getFirebaseIdToken } from '../../firebase';

export const InviteTeammateModal = ({ isOpen, onClose, project, currentUser }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('EDITOR');
  const [isSending, setIsSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen || !project) return null;

  const inviteUrl = `${window.location.origin}/invite/${project.projectId}?role=${role}&email=${encodeURIComponent(email || '')}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setIsSending(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const token = await getFirebaseIdToken();
      const res = await fetch(`/api/projects/${project.projectId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ email: email.trim(), role })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(data.emailDispatched
          ? `Invitation accepted by the mail server for ${email} as ${role}.`
          : `Collaborator added, but the invitation was not accepted by the mail server.`);
        setEmail('');
        setTimeout(() => {
          setSuccessMsg('');
        }, 4000);
      } else {
        setErrorMsg(data.error || 'Failed to send invitation.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Network error.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm font-sans animate-fade-in select-none">
      <div className="relative glass-panel w-full max-w-md p-6 shadow-2xl flex flex-col gap-4 bg-surface-container-low border border-outline-variant rounded-xl text-xs">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-outline-variant/40 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-surface-tint text-lg">person_add</span>
            <h2 className="text-sm font-bold text-on-surface font-headline uppercase tracking-wider">
              Invite Collaborators
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="text-on-surface-variant hover:text-red-400 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Project Target */}
        <div className="p-3 bg-black/40 rounded-lg border border-white/5 font-mono text-[11px] flex justify-between items-center">
          <span className="text-slate-400">Target Repository:</span>
          <span className="text-cyan-300 font-bold">{project.title}</span>
        </div>

        {/* Form */}
        <form onSubmit={handleSendInvite} className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-bold text-on-surface mb-1 uppercase tracking-wider font-mono">
              Teammate Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. colleague@university.edu"
              className="w-full px-3 py-2 bg-black/50 border border-outline-variant rounded text-xs text-on-surface font-mono focus:border-cyan-400 focus:outline-none placeholder:text-zinc-600"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-on-surface mb-1 uppercase tracking-wider font-mono">
              Access Role & Permission
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 bg-black/50 border border-outline-variant rounded text-xs text-on-surface font-mono focus:border-cyan-400 focus:outline-none"
            >
              <option value="EDITOR">EDITOR (Read, Write, and Sandbox Execution)</option>
              <option value="REVIEWER">REVIEWER (Read, Sandbox, and Patch Proposals)</option>
              <option value="OWNER">CO-OWNER (Full Administrative Control)</option>
            </select>
          </div>

          {/* Shareable Link Box */}
          <div className="p-3 bg-surface-tint/5 border border-surface-tint/20 rounded-lg space-y-1.5">
            <span className="text-[10px] font-bold text-surface-tint tracking-wide block font-mono">
              Direct Shareable Link
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="flex-1 px-2.5 py-1 bg-black/60 border border-white/10 rounded text-[10px] font-mono text-zinc-400 select-all"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3 py-1 bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono font-bold text-[10px] rounded transition-all cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-xs">content_copy</span>
                {copied ? 'COPIED!' : 'COPY'}
              </button>
            </div>
          </div>

          {successMsg && (
            <div className="p-2.5 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs rounded font-mono">
              ✓ {successMsg}
            </div>
          )}

          {errorMsg && (
            <div className="p-2.5 bg-red-950/60 border border-red-500/40 text-red-300 text-xs rounded font-mono">
              ✗ {errorMsg}
            </div>
          )}

          {/* Submit Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/40">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-neutral-800 text-zinc-300 hover:bg-neutral-700 text-xs font-mono rounded transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="px-4 py-1.5 bg-surface-tint hover:bg-cyan-300 text-neutral-950 font-bold font-mono text-xs rounded transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">{isSending ? 'sync' : 'send'}</span>
              <span>{isSending ? 'Sending...' : 'Send Invitation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
