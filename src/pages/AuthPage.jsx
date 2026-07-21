import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export const AuthPage = () => {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login';
  const [isRegister, setIsRegister] = useState(initialMode === 'register');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, register } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const isLoginValid = email.includes('@') && password.length >= 4;
  const isRegisterValid = 
    email.includes('@') && 
    password.length >= 8 && 
    password === confirmPass && 
    displayName.trim().length > 0 &&
    termsAccepted;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (isRegister) {
        await register(email, password, displayName);
        navigate('/onboarding');
      } else {
        await login(email, password);
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Authentication Error:', err);
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-light dark:bg-[#0A0A0B] text-neutral-900 dark:text-[#e4e2e4] flex flex-col justify-between relative overflow-hidden font-sans">
      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 h-12 bg-surface-container-low/80 dark:bg-surface-dark/80 backdrop-blur-xl border-b border-outline-variant">
        <Link to="/" className="text-xl font-bold text-surface-tint tracking-tighter font-headline">
          ObsidianIDE
        </Link>
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleTheme}
            className="p-2 rounded text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-xl">
              {isDark ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
        </div>
      </header>

      {/* Main Content Card */}
      <main className="flex-1 flex items-center justify-center p-6 pt-16 relative z-10">
        <div className="w-full max-w-md">
          <div className="glass-panel p-8 rounded-lg shadow-2xl flex flex-col gap-6 bg-surface-container-low/70 dark:bg-surface-container/60 border border-outline-variant/40">
            
            {/* Header Identity */}
            <div className="text-center">
              <h1 className="text-2xl font-bold text-surface-tint tracking-tight mb-1 font-headline">
                ObsidianIDE
              </h1>
              <p className="text-xs font-mono uppercase tracking-widest text-on-surface-variant">
                {isRegister ? 'New Node Deployment' : 'Access Validation'}
              </p>
            </div>

            {/* Error Message Display */}
            {error && (
              <div className="p-3 bg-red-950/40 border border-red-800/50 text-red-300 text-xs font-mono rounded">
                ⚠️ {error}
              </div>
            )}

            {/* Login / Register Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {isRegister && (
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-mono text-on-surface-variant flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">badge</span> Full Name
                  </label>
                  <input 
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface-slate text-on-surface border-b-2 border-outline-variant focus:border-surface-tint focus:outline-none font-sans"
                    placeholder="Md. Emam Zafor Saadik"
                    required={isRegister}
                  />
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-mono text-on-surface-variant flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">mail</span> Academic Email
                </label>
                <input 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-surface-slate text-on-surface border-b-2 border-outline-variant focus:border-surface-tint focus:outline-none font-sans"
                  placeholder="name@bubt.edu.bd"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-mono text-on-surface-variant flex items-center gap-2 justify-between">
                  <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">key</span> Passphrase</span>
                  {!isRegister && <span className="text-[10px] text-surface-tint/70 hover:underline cursor-pointer">Forgot?</span>}
                </label>
                <input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-surface-slate text-on-surface border-b-2 border-outline-variant focus:border-surface-tint focus:outline-none font-sans"
                  placeholder="••••••••••••"
                  required
                />
              </div>

              {isRegister && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-mono text-on-surface-variant flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">lock</span> Confirm Passphrase
                    </label>
                    <input 
                      type="password"
                      value={confirmPass}
                      onChange={(e) => setConfirmPass(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-surface-slate text-on-surface border-b-2 border-outline-variant focus:border-surface-tint focus:outline-none font-sans"
                      placeholder="••••••••••••"
                      required
                    />
                  </div>

                  <div className="flex items-center gap-2 text-xs text-on-surface-variant mt-1">
                    <input 
                      type="checkbox"
                      id="termsCheck"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="bg-neutral-800 border-outline-variant text-surface-tint rounded-none"
                    />
                    <label htmlFor="termsCheck" className="cursor-pointer">
                      Accept baseline <span className="text-surface-tint underline">Terms & Security Protocol</span>
                    </label>
                  </div>
                </>
              )}

              <button 
                type="submit"
                disabled={isSubmitting || (isRegister ? !isRegisterValid : !isLoginValid)}
                className={`mt-3 py-3 text-xs font-mono font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${
                  (isRegister ? isRegisterValid : isLoginValid) && !isSubmitting
                    ? 'bg-surface-tint text-neutral-900 hover:bg-cyan-400 cursor-pointer shadow-lg'
                    : 'bg-surface-container-high text-on-surface-variant/50 cursor-not-allowed opacity-60'
                }`}
              >
                {isSubmitting ? (
                  <span>AUTHENTICATING...</span>
                ) : isRegister ? (
                  <>Deploy Account <span className="material-symbols-outlined text-sm">rocket_launch</span></>
                ) : (
                  <>Initialize Session <span className="material-symbols-outlined text-sm">login</span></>
                )}
              </button>
            </form>

            {/* Mode Switch Button */}
            <div className="text-center pt-2 border-t border-outline-variant/30">
              <button 
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError('');
                }}
                className="text-xs font-mono text-on-surface-variant hover:text-surface-tint underline transition-colors"
              >
                {isRegister ? 'Already have credentials? Return to Login' : 'New developer? Deploy Account'}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-2 border-t border-outline-variant text-[11px] font-mono text-on-surface-variant flex justify-between items-center bg-surface-container-lowest/80">
        <div>© 2026 Obsidian Systems. All instances functional.</div>
        <div className="flex gap-4">
          <span className="text-surface-tint font-bold">SYSTEM_READY</span>
        </div>
      </footer>
    </div>
  );
};
export default AuthPage;
