import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export const ProfilePage = () => {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState({
    displayName: userProfile?.displayName || 'Md. Emam Zafor Saadik',
    email: currentUser?.email || 'zafor@bubt.edu.bd',
    studentId: '22235103581',
    designation: 'Full-Stack Lead Architect',
    clearanceLevel: 'L5_UNRESTRICTED',
    storageStrategy: 'FIREBASE_PERSONAL',
    allocatedStorageMb: 1024,
    usedStorageMb: 0.42,
    usagePercentage: 0.04,
    mainApiKeyMasked: '****************************3F1Z',
    lastLogin: new Date().toUTCString(),
    ipOrigin: '192.168.1.104 [VPN]',
    sessionTtl: 'ACTIVE: 14:22:01',
    projects: [
      {
        projectId: 'quantum-router-01',
        title: 'Quantum_Router',
        role: 'OWNER',
        languageEnv: 'RUST_1.75',
        updatedAt: new Date(Date.now() - 7200000).toISOString()
      },
      {
        projectId: 'nexus-graph-db-02',
        title: 'Nexus_Graph_DB',
        role: 'REVIEWER',
        languageEnv: 'GO_1.21',
        updatedAt: new Date(Date.now() - 86400000).toISOString()
      }
    ],
    totalProjectsCount: 2
  });

  const [rotatingKey, setRotatingKey] = useState(false);
  const [rotationMsg, setRotationMsg] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStudentId, setEditStudentId] = useState('');
  const [editDesignation, setEditDesignation] = useState('');

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const res = await fetch(`/api/users/profile?email=${encodeURIComponent(currentUser?.email || '')}`);
        const data = await res.json();
        if (res.ok && data.profile) {
          setProfile(prev => ({ ...prev, ...data.profile }));
          setEditName(data.profile.displayName);
          setEditStudentId(data.profile.studentId);
          setEditDesignation(data.profile.designation);
        }
      } catch (err) {
        console.warn("Profile fetch notice, using active profile:", err);
      }
    };
    fetchProfileData();
  }, [currentUser]);

  const handleRotateKey = async () => {
    setRotatingKey(true);
    setRotationMsg('');

    try {
      const res = await fetch('/api/users/rotate-key', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setProfile(prev => ({ ...prev, mainApiKeyMasked: data.newMaskedKey }));
        setRotationMsg('API key rotated successfully. Previous sessions invalidated.');
      }
    } catch (err) {
      setRotationMsg('Failed to rotate API key.');
    } finally {
      setRotatingKey(false);
    }
  };

  const handleSaveProfileEdit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: profile.email,
          displayName: editName,
          studentId: editStudentId,
          designation: editDesignation
        })
      });
      if (res.ok) {
        setProfile(prev => ({
          ...prev,
          displayName: editName,
          studentId: editStudentId,
          designation: editDesignation
        }));
        setIsEditModalOpen(false);
      }
    } catch (err) {
      console.error("Error updating profile:", err);
    }
  };

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6 font-sans">
      {/* Header Identity Strip */}
      <div className="flex justify-between items-end border-b border-outline-variant/30 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-tint font-headline">DEVELOPER_PROFILE</h1>
          <p className="font-mono text-xs text-on-surface-variant mt-1">
            ID: NS-ARC-9912 // SYSTEM_ADMIN_ACCESS
          </p>
        </div>
        <div className="flex gap-2 font-mono text-xs">
          <button 
            onClick={() => setIsEditModalOpen(true)}
            className="px-4 py-1.5 bg-surface-container-high text-on-surface border border-outline-variant hover:border-surface-tint transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">edit</span> EDIT_PROFILE
          </button>
          <button className="px-4 py-1.5 bg-surface-tint text-neutral-900 font-bold hover:bg-cyan-400 transition-all cursor-pointer">
            SAVE_CONFIG
          </button>
        </div>
      </div>

      {/* Dual-Pane Admin Card */}
      <div className="flex flex-col md:flex-row border border-outline-variant bg-surface-container-low/60 overflow-hidden rounded-lg">
        {/* Left Pane: Identity (Fixed Width) */}
        <div className="w-full md:w-80 bg-surface-container-lowest/80 border-r border-outline-variant p-8 flex flex-col items-center gap-6">
          <div className="relative group">
            <div className="w-32 h-32 border-2 border-surface-tint p-1 bg-surface-slate overflow-hidden flex items-center justify-center">
              <span className="material-symbols-outlined text-6xl text-surface-tint">
                account_circle
              </span>
            </div>
            <div className="absolute -bottom-1 -right-1 bg-neon-green w-4 h-4 rounded-full border-2 border-surface-container-low" title="System Online"></div>
          </div>

          <div className="text-center w-full space-y-3">
            <div>
              <h2 className="text-lg font-bold text-on-surface font-headline">{profile.displayName}</h2>
              <span className="font-mono text-[10px] text-surface-tint bg-cyan-950/60 px-2 py-0.5 mt-1 border border-cyan-800/40 inline-block uppercase">
                {profile.designation}
              </span>
            </div>

            <div className="pt-4 space-y-3 border-t border-outline-variant/40 text-left font-mono text-xs">
              <div className="flex flex-col">
                <span className="text-[9px] text-on-surface-variant uppercase">Academic Email</span>
                <span className="text-on-surface truncate">{profile.email}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-on-surface-variant uppercase">Student Identifier</span>
                <span className="text-on-surface">{profile.studentId}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-on-surface-variant uppercase">Clearance Level</span>
                <span className="text-neon-green font-bold">{profile.clearanceLevel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Pane: Configuration & Storage Inspector */}
        <div className="flex-1 bg-surface-dark p-8 space-y-8 font-mono">
          {/* Storage Strategy Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-surface-tint">database</span>
              <h3 className="font-bold text-xs uppercase tracking-wider text-on-surface">STORAGE_STRATEGY</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-surface-slate border border-surface-tint p-4 flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-xs text-on-surface font-bold">Personal Firebase</span>
                  <span className="text-[10px] text-on-surface-variant">US-East Spark Plan Free Instance</span>
                </div>
                <span className="material-symbols-outlined text-neon-green">check_circle</span>
              </div>

              <div className="bg-surface-container-high/40 border border-outline-variant p-4 flex justify-between items-center opacity-50">
                <div className="flex flex-col">
                  <span className="text-xs text-on-surface">Obsidian Shared Cloud</span>
                  <span className="text-[10px] text-on-surface-variant">Managed Replica Shards</span>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant">radio_button_unchecked</span>
              </div>
            </div>
          </section>

          {/* User Projects Portfolio Section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-surface-tint">folder_special</span>
                <h3 className="font-bold text-xs uppercase tracking-wider text-on-surface">PROJECTS_PORTFOLIO ({profile.totalProjectsCount || profile.projects?.length || 0})</h3>
              </div>
              <span className="text-[10px] text-on-surface-variant">USER_CONTRIBUTIONS</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {profile.projects && profile.projects.length > 0 ? (
                profile.projects.map((proj) => (
                  <div 
                    key={proj.projectId}
                    onClick={() => navigate(`/ide/${proj.projectId}`)}
                    className="bg-surface-container-low p-3 border border-outline-variant hover:border-surface-tint transition-all cursor-pointer flex justify-between items-center group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-surface-tint text-sm">terminal</span>
                      <span className="text-xs text-on-surface font-bold group-hover:text-surface-tint transition-colors">
                        {proj.title}
                      </span>
                      <span className="text-[9px] font-mono text-cyan-400 border border-cyan-800 px-1.5 py-0.2 rounded uppercase">
                        {proj.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-on-surface-variant">
                      <span>{proj.languageEnv}</span>
                      <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-on-surface-variant p-3 bg-surface-container-low border border-outline-variant">
                  No projects initialized yet.
                </div>
              )}
            </div>
          </section>

          {/* Quota & Metrics Inspector */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-surface-tint">pie_chart</span>
              <h3 className="font-bold text-xs uppercase tracking-wider text-on-surface">SYSTEM_QUOTA</h3>
            </div>

            <div className="bg-surface-container-low p-5 border border-outline-variant space-y-3">
              <div className="flex justify-between items-end text-xs">
                <span className="text-on-surface-variant">ALLOCATED_STORAGE</span>
                <span className="text-surface-tint font-bold">{profile.usedStorageMb} MB / {profile.allocatedStorageMb} MB ({profile.usagePercentage}%)</span>
              </div>
              <div className="w-full h-1.5 bg-surface-container-highest overflow-hidden">
                <div className="h-full bg-surface-tint w-[1%] min-w-[4px]"></div>
              </div>
              <p className="text-[11px] text-on-surface-variant/80 font-sans leading-relaxed">
                Storage usage is calculated in real-time based on persistent project file payloads inside Cloud Firestore. Assets exceeding the 1024 MB threshold offload to cold storage.
              </p>
            </div>
          </section>

          {/* API Secret Management */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-surface-tint">key</span>
              <h3 className="font-bold text-xs uppercase tracking-wider text-on-surface">SECRET_MANAGEMENT</h3>
            </div>

            <div className="bg-surface-slate border border-outline-variant p-5 space-y-4">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="flex-1 w-full">
                  <span className="text-[9px] text-on-surface-variant block mb-1">MAIN_API_KEY</span>
                  <div className="flex items-center bg-surface-dark border border-outline-variant px-3 py-2 text-xs font-mono text-on-surface">
                    <span>{profile.mainApiKeyMasked}</span>
                  </div>
                </div>

                <button 
                  onClick={handleRotateKey}
                  disabled={rotatingKey}
                  className="md:mt-4 px-4 py-2 bg-red-950 text-red-300 font-bold border border-red-800 hover:bg-red-900 transition-colors flex items-center gap-2 text-xs cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">sync</span>
                  {rotatingKey ? 'ROTATING...' : 'ROTATE_KEY'}
                </button>
              </div>

              {rotationMsg && (
                <div className="text-[11px] text-neon-green font-mono">
                  ✓ {rotationMsg}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Information Density Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
        <div className="bg-surface-container-low p-4 border border-outline-variant flex flex-col gap-1">
          <span className="text-[9px] text-on-surface-variant uppercase">LAST_LOGIN</span>
          <span className="text-on-surface">{profile.lastLogin}</span>
        </div>
        <div className="bg-surface-container-low p-4 border border-outline-variant flex flex-col gap-1">
          <span className="text-[9px] text-on-surface-variant uppercase">IP_ORIGIN</span>
          <span className="text-on-surface">{profile.ipOrigin}</span>
        </div>
        <div className="bg-surface-container-low p-4 border border-outline-variant flex flex-col gap-1">
          <span className="text-[9px] text-on-surface-variant uppercase">SESSION_TTL</span>
          <span className="text-neon-green">{profile.sessionTtl}</span>
        </div>
      </div>

      {/* Inline Profile Edit Modal Overlay */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 shadow-2xl flex flex-col gap-4 bg-surface-container-low border border-outline-variant rounded-lg font-mono">
            <div className="flex justify-between items-center border-b border-outline-variant/40 pb-3">
              <h2 className="text-sm font-bold text-surface-tint flex items-center gap-2 font-headline">
                <span className="material-symbols-outlined text-sm">edit</span> Edit Developer Profile Metadata
              </h2>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-on-surface-variant hover:text-red-400"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveProfileEdit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-on-surface-variant uppercase">Display Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-[#1A1A1C] border border-outline-variant p-2 text-xs text-on-surface focus:outline-none focus:border-surface-tint"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-on-surface-variant uppercase">Student ID / Identifier</label>
                <input
                  type="text"
                  value={editStudentId}
                  onChange={(e) => setEditStudentId(e.target.value)}
                  className="bg-[#1A1A1C] border border-outline-variant p-2 text-xs text-on-surface focus:outline-none focus:border-surface-tint"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-on-surface-variant uppercase">Designation Tag</label>
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
                  className="text-xs text-on-surface-variant hover:underline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-surface-tint text-neutral-900 px-4 py-1.5 text-xs font-bold hover:bg-cyan-400 cursor-pointer"
                >
                  Save Profile Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default ProfilePage;
