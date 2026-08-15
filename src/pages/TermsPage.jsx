import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

export const TermsPage = () => {
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface-light dark:bg-[#0A0A0B] text-neutral-900 dark:text-[#e4e2e4] flex flex-col justify-between font-sans">
      {/* Header Bar */}
      <header className="sticky top-0 z-50 flex justify-between items-center px-6 h-14 bg-surface-container-low/90 dark:bg-surface-dark/90 backdrop-blur-xl border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-xs font-mono text-on-surface-variant hover:text-surface-tint transition-colors bg-surface-container-high/40 px-2.5 py-1.5 rounded"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span> Back
          </button>
          <Link to="/dashboard" className="text-xl font-bold text-surface-tint tracking-tighter font-headline">
            ObsidianIDE
          </Link>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-tint/10 text-surface-tint border border-surface-tint/30">
            SECURITY_PROTOCOL v2.4
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link 
            to="/auth?mode=register"
            className="px-4 py-1.5 text-xs font-mono font-bold bg-surface-tint text-neutral-900 hover:bg-cyan-400 rounded transition-all"
          >
            Return to Signup
          </Link>
        </div>
      </header>

      {/* Main Legal & Security Document Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-10 my-6 animate-fade-in">
        <div className="glass-panel p-8 md:p-12 rounded-xl shadow-2xl bg-surface-container-low/70 dark:bg-surface-container/60 border border-outline-variant/40 space-y-10">
          
          {/* Header Banner */}
          <div className="border-b border-outline-variant/40 pb-6">
            <div className="flex items-center gap-2 text-surface-tint font-mono text-xs uppercase tracking-widest mb-2">
              <span className="material-symbols-outlined text-base">verified_user</span> 
              Official Platform Policy & Cryptographic Governance
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight font-headline text-surface-tint">
              Terms of Service & Security Protocol
            </h1>
            <p className="text-sm text-on-surface-variant mt-2">
              Effective Date: July 2026 • Applies to all ObsidianIDE cloud instances and developer nodes.
            </p>
          </div>

          {/* Section 1: Introduction */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold font-headline text-on-surface flex items-center gap-2">
              <span className="text-surface-tint font-mono">01.</span> Account & Identity Governance
            </h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              By creating an account on ObsidianIDE, you agree to maintain valid developer identity credentials including a unique username, valid academic/professional email address, and accurate professional designation. Each account is bound to a single user identity across collaborative workspace nodes.
            </p>
          </section>

          {/* Section 2: Password & Authentication Protocol */}
          <section className="space-y-4 bg-surface-slate/40 p-6 rounded-lg border border-outline-variant/30">
            <h2 className="text-lg font-bold font-headline text-on-surface flex items-center gap-2">
              <span className="text-surface-tint font-mono">02.</span> Cryptographic Password Protection & Zero-Trust Auth
            </h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              ObsidianIDE adheres to strict Zero-Trust cryptographic authentication standards. Your plain-text password is <strong className="text-surface-tint">NEVER stored, transmitted in cleartext, or written to our application databases</strong>.
            </p>
            
            <div className="grid md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3 bg-surface-container-high/60 rounded border border-outline-variant/40 space-y-1">
                <div className="text-surface-tint font-bold flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">lock</span> Hashed on Firebase Auth
                </div>
                <p className="text-on-surface-variant text-[11px]">
                  Passwords are processed directly on Google Firebase Authentication cloud infrastructure using salted <code className="text-cyan-300">scrypt</code> key derivation.
                </p>
              </div>

              <div className="p-3 bg-surface-container-high/60 rounded border border-outline-variant/40 space-y-1">
                <div className="text-surface-tint font-bold flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">database</span> Isolated Profile Metadata
                </div>
                <p className="text-on-surface-variant text-[11px]">
                  Only non-sensitive user metadata (username, profession, email) is persisted to Cloud Firestore for team discovery and role assignment.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3: Data Security & Project Integrity */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold font-headline text-on-surface flex items-center gap-2">
              <span className="text-surface-tint font-mono">03.</span> Code Privacy & Real-Time Sync Security
            </h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              All project source code, file trees, and real-time operational transformation patches generated in the IDE are transmitted over encrypted TLS 1.3 channels. Project access controls are strictly enforced via custom security rules preventing unauthorized data extraction.
            </p>
          </section>

          {/* Section 4: Acceptable Use & AI Code Assistance */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold font-headline text-on-surface flex items-center gap-2">
              <span className="text-surface-tint font-mono">04.</span> Acceptable Use & Automated AI Agents
            </h2>
            <ul className="list-disc list-inside text-sm text-on-surface-variant space-y-2 leading-relaxed pl-2">
              <li>Users must not run malicious code, automated network scanning tools, or unauthorized denial-of-service scripts within backend container environments.</li>
              <li>AI agent endpoints provided by ObsidianIDE are designed for code syntax analysis, refactoring, and bug detection. Prompts sent to AI engines exclude credentials or environment keys.</li>
              <li>Workspace owners reserve the right to manage teammate roles, grant code review permissions, or terminate shared session instances.</li>
            </ul>
          </section>

          {/* Section 5: Terms Update & Contact */}
          <section className="space-y-3 border-t border-outline-variant/40 pt-6">
            <h2 className="text-lg font-bold font-headline text-on-surface flex items-center gap-2">
              <span className="text-surface-tint font-mono">05.</span> Agreement & Protocol Compliance
            </h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              By checking the agreement box during account registration, you confirm that you have read, understood, and consented to these security protocols. Continued use of ObsidianIDE signifies acceptance of any updated protocol revisions.
            </p>
          </section>

          {/* Footer Actions */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-4 border-t border-outline-variant/40">
            <div className="text-xs font-mono text-on-surface-variant">
              🔒 SSL/TLS Encrypted • Firebase Security Compliant
            </div>
            <Link 
              to="/auth?mode=register"
              className="w-full md:w-auto px-6 py-2.5 text-xs font-mono font-bold tracking-widest uppercase bg-surface-tint text-neutral-900 hover:bg-cyan-400 rounded text-center transition-all shadow-lg"
            >
              I Accept — Proceed to Signup
            </Link>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-3 border-t border-outline-variant text-[11px] font-mono text-on-surface-variant flex justify-between items-center bg-surface-container-lowest/80">
        <div>© 2026 Obsidian Systems. Terms & Security Protocol.</div>
        <div className="flex gap-4">
          <span className="text-surface-tint font-bold">SECURE_NODE</span>
        </div>
      </footer>
    </div>
  );
};

export default TermsPage;
