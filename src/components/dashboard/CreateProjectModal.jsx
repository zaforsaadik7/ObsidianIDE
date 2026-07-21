import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export const CreateProjectModal = ({ isOpen, onClose, onProjectCreated }) => {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [languageEnv, setLanguageEnv] = useState('RUST_1.75');
  const [collabEmail, setCollabEmail] = useState('');
  const [collabRole, setCollabRole] = useState('EDITOR');
  const [collaborators, setCollaborators] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleAddCollaborator = () => {
    if (collabEmail && collabEmail.includes('@')) {
      setCollaborators([...collaborators, { email: collabEmail.trim(), role: collabRole }]);
      setCollabEmail('');
    }
  };

  const handleRemoveCollaborator = (index) => {
    setCollaborators(collaborators.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    setError('');

    // Format collaborators map
    const collabMap = {};
    collaborators.forEach((c) => {
      collabMap[c.email] = c.role;
    });

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          languageEnv,
          ownerEmail: currentUser?.email || 'admin@bubt.edu.bd',
          collaborators: collabMap
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize project');
      }

      onProjectCreated(data.project);
      onClose();
    } catch (err) {
      console.error('Error in project creation:', err);
      setError(err.message || 'Server error initializing project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm">
      <div className="relative glass-panel w-full max-w-md p-6 shadow-2xl flex flex-col gap-5 bg-surface-container-low border border-outline-variant rounded-lg">
        <div className="flex justify-between items-center border-b border-outline-variant/40 pb-3">
          <h2 className="text-base font-bold text-surface-tint flex items-center gap-2 font-headline">
            <span className="material-symbols-outlined text-sm">add_box</span> Initialize New Project Instance
          </h2>
          <button 
            onClick={onClose}
            className="text-on-surface-variant hover:text-red-400 transition-colors"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-xs font-mono">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-mono text-on-surface-variant uppercase tracking-wider">
              Repository Reference Title
            </label>
            <input 
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#1A1A1C] border-0 border-b border-outline-variant p-2.5 text-xs text-on-surface focus:border-surface-tint focus:outline-none font-mono"
              placeholder="e.g. quantum-router"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-mono text-on-surface-variant uppercase tracking-wider">
              Language Environment
            </label>
            <select 
              value={languageEnv}
              onChange={(e) => setLanguageEnv(e.target.value)}
              className="w-full bg-[#1A1A1C] border-0 border-b border-outline-variant p-2.5 text-xs text-on-surface focus:border-surface-tint focus:outline-none font-mono"
            >
              <option value="RUST_1.75">RUST 1.75 / gRPC</option>
              <option value="PYTHON_3.11">PYTHON 3.11 / PyTorch</option>
              <option value="TYPESCRIPT_5.0">TYPESCRIPT 5.0 / Node</option>
              <option value="GO_1.21">GOLANG 1.21 / Redis</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-mono text-on-surface-variant uppercase tracking-wider">
              Authorize Team Collaborators (Google Docs Permission Style)
            </label>
            <div className="flex gap-2">
              <input 
                type="email"
                value={collabEmail}
                onChange={(e) => setCollabEmail(e.target.value)}
                className="flex-1 bg-[#1A1A1C] border-0 border-b border-outline-variant p-2.5 text-xs text-on-surface focus:border-surface-tint focus:outline-none font-mono"
                placeholder="samia@bubt.edu, sadia@bubt.edu"
              />
              <select 
                value={collabRole}
                onChange={(e) => setCollabRole(e.target.value)}
                className="bg-neutral-800 border border-outline-variant text-[11px] font-mono text-on-surface px-2 focus:outline-none"
              >
                <option value="EDITOR">Editor (Live Typing)</option>
                <option value="REVIEWER">Reviewer (Patch Approval)</option>
                <option value="OWNER">Owner (Full Access)</option>
              </select>
              <button
                type="button"
                onClick={handleAddCollaborator}
                className="bg-surface-container-high border border-outline-variant px-3 text-xs font-mono text-surface-tint hover:bg-surface-tint hover:text-black transition-colors"
              >
                Add
              </button>
            </div>

            {/* Collaborator Roster Pill List */}
            {collaborators.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {collaborators.map((c, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1.5 px-2 py-1 bg-surface-slate border border-outline-variant text-[10px] font-mono text-on-surface">
                    {c.email} ({c.role})
                    <button type="button" onClick={() => handleRemoveCollaborator(idx)} className="hover:text-red-400 ml-1">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-outline-variant/40 mt-2">
            <button 
              type="button" 
              onClick={onClose}
              className="text-xs font-mono text-on-surface-variant hover:underline"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="bg-surface-tint text-neutral-900 px-4 py-2 font-mono text-xs font-bold hover:bg-cyan-400 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Deploying...' : 'Deploy Repository Space'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
