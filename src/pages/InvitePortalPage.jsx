import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export const InvitePortalPage = () => {
  const { inviteId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const [invite, setInvite] = useState({
    targetRepository: 'QUANTUM_LATTICE_01',
    sentBy: 'Md. Emam Zafor Saadik',
    assignedRole: 'REVIEWER',
    projectId: 'quantum-router-01'
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if inviteId carries custom params
    if (inviteId && inviteId !== 'demo-invite') {
      setInvite(prev => ({
        ...prev,
        targetRepository: inviteId.toUpperCase()
      }));
    }
  }, [inviteId]);

  const handleAccept = () => {
    if (currentUser) {
      navigate(`/ide/${invite.projectId}`);
    } else {
      navigate(`/auth?redirect=/ide/${invite.projectId}`);
    }
  };

  return (
    <div className="min-h-screen bg-surface-light dark:bg-[#0A0A0B] text-neutral-900 dark:text-white font-sans flex flex-col justify-between p-4">
      {/* Top Navbar */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 h-12 bg-surface-container-low/80 dark:bg-surface-dark/80 backdrop-blur-xl border-b border-outline-variant font-mono">
        <span className="text-xl font-bold text-surface-tint tracking-tighter font-headline">ObsidianIDE</span>
        <button 
          onClick={toggleTheme}
          className="p-1 rounded text-on-surface-variant hover:text-surface-tint"
        >
          <span className="material-symbols-outlined text-lg">{isDark ? 'light_mode' : 'dark_mode'}</span>
        </button>
      </header>

      {/* Centered Invite Card */}
      <main className="flex-1 flex items-center justify-center p-4 pt-16">
        <div className="max-w-md w-full bg-white dark:bg-surface-container border border-[#3a494a] p-8 shadow-2xl rounded-none font-mono">
          <div className="text-center mb-8">
            <span className="text-surface-tint tracking-widest text-xs uppercase block">SECURE_INVITATION</span>
            <h1 className="text-2xl font-bold font-headline mt-2 text-on-surface">Workspace Access Granted</h1>
          </div>
          
          <div className="bg-gray-100 dark:bg-[#131314] border border-[#3a494a] p-4 text-sm mb-6 space-y-2">
            <p className="text-on-surface-variant">
              &gt; Target_Repository: <span className="text-black dark:text-white font-bold">{invite.targetRepository}</span>
            </p>
            <p className="text-on-surface-variant">
              &gt; Sent_By: <span className="text-black dark:text-white font-bold">{invite.sentBy}</span>
            </p>
            <p className="text-on-surface-variant">
              &gt; Assigned_Role: <span className="text-surface-tint font-bold uppercase">{invite.assignedRole}</span>
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={handleAccept}
              className="w-full bg-surface-tint text-neutral-900 font-bold py-3 hover:bg-[#39FF14] transition-colors cursor-pointer"
            >
              ACCEPT & ENTER WORKSPACE
            </button>
            <button 
              onClick={() => navigate('/auth?mode=register')}
              className="w-full border border-[#3a494a] text-on-surface-variant py-3 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
            >
              CREATE ACCOUNT TO JOIN
            </button>
          </div>
        </div>
      </main>

      {/* Footer Status Bar */}
      <footer className="px-6 py-2 border-t border-outline-variant text-[11px] font-mono text-on-surface-variant flex justify-between items-center bg-surface-container-lowest/80">
        <div>© 2026 Obsidian Systems. Built via agile workspace methodology layers.</div>
        <div className="text-surface-tint font-bold">SYSTEM_READY</div>
      </footer>
    </div>
  );
};
export default InvitePortalPage;
