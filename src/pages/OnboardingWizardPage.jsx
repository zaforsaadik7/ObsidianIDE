import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const OnboardingWizardPage = () => {
  const [provisioning, setProvisioning] = useState(false);
  const [statusText, setStatusText] = useState('');
  const { currentUser, userProfile } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleSelectStrategy = async (strategyCode) => {
    setProvisioning(true);
    const strategyName = strategyCode === 'A' ? 'FIREBASE_PERSONAL' : 'OBSIDIAN_CLOUD';

    const steps = [
      `Handshaking with ${strategyName}_GATEWAY...`,
      'Allocating isolated Obsidian memory shards...',
      'Configuring TLS 1.3 handshake protocols...',
      'Environment stable. Finalizing UI injection...'
    ];

    for (let i = 0; i < steps.length; i++) {
      setStatusText(steps[i]);
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    try {
      if (currentUser?.uid) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userDocRef, { storageStrategy: strategyName });
      }
    } catch (err) {
      console.warn("Storage strategy save notice:", err);
    }

    setStatusText("REDIRECTING_TO_WORKSPACE...");
    setTimeout(() => {
      navigate('/dashboard');
    }, 600);
  };

  return (
    <div className="min-h-screen bg-surface-light dark:bg-[#0A0A0B] text-neutral-900 dark:text-[#e4e2e4] flex flex-col justify-between font-sans">
      {/* Top Navbar */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 h-12 bg-surface-container-low/80 dark:bg-surface-dark/80 backdrop-blur-xl border-b border-outline-variant">
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold text-surface-tint tracking-tighter font-headline">ObsidianIDE</span>
          <span className="text-[10px] font-mono px-2 py-0.5 bg-surface-container-high text-on-surface-variant border border-outline-variant/30">
            Storage Deployment Strategy
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <button 
            onClick={toggleTheme}
            className="p-1.5 rounded hover:bg-surface-container-high text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-lg">{isDark ? 'light_mode' : 'dark_mode'}</span>
          </button>
          <span>Step 1 of 2</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full px-6 pt-20 pb-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold font-headline mb-2 text-on-surface">Connect Project Storage Stratum</h1>
          <p className="text-sm text-on-surface-variant max-w-xl mx-auto font-sans">
            Select the primary database engine layout to handle your team's plaintext workspace document array.
          </p>
        </div>

        {!provisioning ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            {/* Tier A: Individual Firebase Spark */}
            <div 
              onClick={() => handleSelectStrategy('A')}
              className="glass-panel rounded-lg p-6 cursor-pointer flex flex-col justify-between h-72 relative border border-outline-variant/40 hover:border-surface-tint transition-all bg-surface-container-low/60 group"
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
                  Perform a direct, secure token integration mapping document syncs straight into your personal Firebase Spark quota collections ($0/Free).
                </p>
              </div>
              <button className="w-full bg-surface-container-high text-xs font-mono font-medium py-2.5 text-on-surface mt-4 border border-outline-variant group-hover:bg-surface-tint group-hover:text-neutral-900 transition-colors">
                Link Personal Spark Plan ($0/Free)
              </button>
            </div>

            {/* Tier B: Shared Infrastructure Cluster */}
            <div 
              onClick={() => handleSelectStrategy('B')}
              className="glass-panel rounded-lg p-6 cursor-pointer flex flex-col justify-between h-72 relative border border-outline-variant/40 hover:border-purple-400 transition-all bg-surface-container-low/60 group"
            >
              <span className="material-symbols-outlined text-3xl text-purple-400 absolute top-4 right-4 opacity-40 group-hover:opacity-100 transition-opacity">
                cloud
              </span>
              <div>
                <span className="text-[10px] font-mono text-purple-400 bg-purple-950/40 px-2.5 py-0.5 border border-purple-800/40 inline-block mb-3">
                  Shared Infrastructure Cluster
                </span>
                <h2 className="text-lg font-bold text-on-surface mb-1 font-headline">Obsidian Shared Cloud</h2>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Simulated central subscription pipeline leveraging dedicated server space partitions for distributed engineering squads ($0.004/req).
                </p>
              </div>
              <button className="w-full bg-purple-950 text-purple-200 text-xs font-mono font-semibold py-2.5 mt-4 border border-purple-800 group-hover:bg-purple-600 group-hover:text-white transition-colors">
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

      {/* Footer Status Bar */}
      <footer className="px-6 py-2 border-t border-outline-variant text-[11px] font-mono text-on-surface-variant flex justify-between items-center bg-surface-container-lowest/80">
        <div>© 2026 Obsidian Systems. Built via agile workspace methodology.</div>
        <div className="text-surface-tint font-bold">SYSTEM_READY</div>
      </footer>
    </div>
  );
};
export default OnboardingWizardPage;
