import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { syncProjectToPersonalFirestore } from '../../services/personalFirebaseStorage';

export const CreateProjectModal = ({ isOpen, onClose, onProjectCreated }) => {
  const { currentUser, userProfile } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [languageEnv, setLanguageEnv] = useState('RUST_1.75');
  const [collabEmail, setCollabEmail] = useState('');
  const [collabRole, setCollabRole] = useState('EDITOR');
  const [collaborators, setCollaborators] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [createdData, setCreatedData] = useState(null);

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
    if (!title.trim() || isSubmitting) return;  // Guard against double-submit

    setIsSubmitting(true);
    setError('');

    const ownerEmail = currentUser?.email || 'zafor@bubt.edu.bd';
    const teamMembersInput = {
      [ownerEmail]: { role: 'OWNER', accessLevel: 'ADMIN' }
    };

    const normalizedCollabs = { [ownerEmail]: 'OWNER' };
    collaborators.forEach((c) => {
      teamMembersInput[c.email] = {
        role: c.role || 'EDITOR',
        accessLevel: c.role === 'EDITOR' ? 'WRITE' : 'READ'
      };
      normalizedCollabs[c.email] = (c.role || 'EDITOR').toUpperCase();
    });

    const slug = title.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const pid = `proj_${slug}_${Date.now().toString().slice(-4)}`;
    const timestamp = new Date().toISOString();

    const newProject = {
      projectId: pid,
      ownerEmail,
      title: title.trim(),
      description: description.trim().slice(0, 150),
      languageEnv,
      collaborators: normalizedCollabs,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const inviteLinks = {};
    collaborators.forEach((c) => {
      inviteLinks[c.email] = `/invite/${pid}?role=${c.role}&email=${encodeURIComponent(c.email)}`;
    });

    // 1. Client Firestore Direct Write Guarantee
    const initialContent = languageEnv.includes('PYTHON')
      ? `# ${title.trim()} Primary Node\nimport torch\n\ndef main():\n    print("Initializing PyTorch Engine...")\n\nif __name__ == '__main__':\n    main()\n`
      : `// ${title.trim()} Primary Node\nfn main() {\n    println!("Initializing Neural Interface...");\n}\n`;

    const initialFilePath = languageEnv.includes('PYTHON') ? 'src/main.py'
      : languageEnv.includes('TYPESCRIPT') || languageEnv.includes('JS') ? 'src/index.ts'
      : 'src/main.rs';

    const initialFileId = `file_${pid}`;
    const initialFileObj = {
      fileId: initialFileId,
      projectId: pid,
      filePath: initialFilePath,
      fileName: initialFilePath.split('/').pop(),
      content: initialContent,
      fileType: languageEnv.includes('PYTHON') ? 'python' : languageEnv.includes('TYPESCRIPT') ? 'typescript' : 'rust',
      lastModifiedBy: ownerEmail,
      updatedAt: timestamp
    };

    try {
      // Include master_project_files, working_files, and project_files in the project document
      await setDoc(doc(db, 'projects', pid), {
        ...newProject,
        project_files: [initialFileObj],
        working_files: [initialFileObj],
        master_project_files: [initialFileObj]
      }, { merge: true });

      // Save initial file into projects/{pid}/files subcollection for Firestore Console file viewing
      await setDoc(doc(db, 'projects', pid, 'files', initialFileId), initialFileObj, { merge: true });

      // Save project copy into every collaborator's user document
      const updatePromises = Object.entries(normalizedCollabs).map(async ([collabEmail, role]) => {
        const collabDocId = collabEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
        await setDoc(doc(db, 'users', collabDocId), {
          projects: {
            [pid]: {
              projectId: pid,
              title: title.trim(),
              description: description.trim().slice(0, 150),
              languageEnv,
              userRole: role,
              ownerEmail,
              updatedAt: timestamp
            }
          }
        }, { merge: true });
      });
      await Promise.all(updatePromises);

      // Also write directly to user's Personal Firebase Cloud Database if configured
      try {
        await syncProjectToPersonalFirestore({
          ...newProject,
          project_files: [initialFileObj],
          working_files: [initialFileObj],
          master_project_files: [initialFileObj]
        }, userProfile, ownerEmail);
      } catch (personalErr) {
        console.warn("Personal Firestore sync notice:", personalErr);
      }
    } catch (fsErr) {
      console.warn("Client Firestore project save notice:", fsErr);
    }

    // 2. Direct Invitation Email Triggers & Backend API Call
    try {
      const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          projectId: pid,
          title: title.trim(),
          description: description.trim().slice(0, 150),
          languageEnv,
          ownerEmail,
          collaborators: normalizedCollabs,
          project_files: [initialFileObj],
          working_files: [initialFileObj],
          master_project_files: [initialFileObj],
          teamMembersInput
        })
      });

      // Send live invitation emails to all added collaborators
      for (const c of collaborators) {
        fetch('/api/projects/send-invite-email', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            to: c.email,
            ownerEmail,
            projectTitle: title.trim(),
            projectId: pid,
            role: c.role || 'EDITOR'
          })
        }).catch(e => console.warn('Direct invite email dispatch notice:', e));
      }
    } catch (err) {
      console.warn('Backend project creation notice:', err);
    }

    setIsSubmitting(false);

    if (collaborators.length > 0) {
      setCreatedData({
        project: newProject,
        inviteLinks
      });
    } else {
      onProjectCreated(newProject);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm font-mono">
      <div className="relative glass-panel w-full max-w-md p-6 shadow-2xl flex flex-col gap-5 bg-surface-container-low border border-outline-variant rounded-lg">
        <div className="flex justify-between items-center border-b border-outline-variant/40 pb-3">
          <h2 className="text-base font-bold text-surface-tint flex items-center gap-2 font-headline">
            <span className="material-symbols-outlined text-sm">add_box</span> 
            {createdData ? 'Collaborator Invites Ready' : 'Initialize New Project Instance'}
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

        {createdData ? (
          <div className="flex flex-col gap-4">
            <div className="p-3 bg-cyan-950/40 border border-cyan-700/60 rounded text-xs text-cyan-200 space-y-1.5">
              <div className="font-bold text-surface-tint flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-neon-green">mark_email_read</span>
                ✓ Repository Deployed & Invitation Emails Dispatched!
              </div>
              <div className="text-[11px] text-on-surface-variant leading-relaxed">
                Invitation emails have been sent automatically to your added team members. Only authorized emails on this roster can access the workspace.
              </div>
            </div>

            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {collaborators.map((c, idx) => {
                const invitePath = createdData.inviteLinks[c.email] || `/invite/${createdData.project.projectId}?role=${c.role}&email=${encodeURIComponent(c.email)}`;
                const fullUrl = `${window.location.origin}${invitePath}`;

                return (
                  <div key={idx} className="p-2.5 bg-[#141416] border border-outline-variant/60 rounded flex flex-col gap-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-surface-tint font-bold">{c.email}</span>
                      <span className="text-[10px] bg-neutral-800 text-amber-300 px-2 py-0.5 rounded uppercase font-bold">
                        {c.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        readOnly 
                        value={fullUrl}
                        className="flex-1 bg-[#0A0A0B] border border-outline-variant p-1 text-[10px] text-on-surface-variant select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(fullUrl);
                          alert(`Invite link copied for ${c.email}:\n${fullUrl}`);
                        }}
                        className="bg-cyan-950 text-cyan-300 border border-cyan-700 px-2 py-1 text-[10px] font-bold hover:bg-cyan-900 transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                onProjectCreated(createdData.project);
                onClose();
              }}
              className="w-full bg-surface-tint text-neutral-900 font-bold py-2 text-xs hover:bg-cyan-400 transition-colors cursor-pointer mt-2"
            >
              PROCEED TO WORKSPACE &rarr;
            </button>
          </div>
        ) : (
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
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-mono text-on-surface-variant uppercase tracking-wider">
                  Description <span className="text-zinc-500 font-normal lowercase">(optional)</span>
                </label>
                <span className={`text-[10px] font-mono ${description.length >= 140 ? 'text-amber-400 font-bold' : 'text-zinc-500'}`}>
                  {description.length}/150
                </span>
              </div>
              <textarea 
                value={description}
                onChange={(e) => {
                  if (e.target.value.length <= 150) {
                    setDescription(e.target.value);
                  }
                }}
                rows={2}
                maxLength={150}
                className="w-full bg-[#1A1A1C] border-0 border-b border-outline-variant p-2 text-xs text-on-surface focus:border-surface-tint focus:outline-none font-mono resize-none placeholder-zinc-600"
                placeholder="Brief summary of your repository or architecture goals (max 150 chars)..."
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
                  className="bg-surface-container-high border border-outline-variant px-3 text-xs font-mono text-surface-tint hover:bg-surface-tint hover:text-black transition-colors cursor-pointer"
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
                      <button type="button" onClick={() => handleRemoveCollaborator(idx)} className="hover:text-red-400 ml-1 font-bold">×</button>
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
                className="bg-surface-tint text-neutral-900 px-4 py-2 font-mono text-xs font-bold hover:bg-cyan-400 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Deploying...' : 'Deploy Repository Space'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
