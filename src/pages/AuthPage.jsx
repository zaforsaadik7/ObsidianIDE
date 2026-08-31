import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export const AuthPage = () => {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login';
  const [isRegister, setIsRegister] = useState(initialMode === 'register');

  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'register') {
      setIsRegister(true);
    } else if (mode === 'login') {
      setIsRegister(false);
    }
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  const [email, setEmail] = useState(() => searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [profession, setProfession] = useState('Student');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const getFriendlyErrorMessage = (err) => {
    const code = err?.code || '';
    const msg = err?.message || '';

    if (code === 'auth/user-not-registered') {
      return '⚠️ No registered account found with this email. Please switch to "Sign Up" above to create your account.';
    }
    if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') {
      return '⚠️ Google Sign-In is not enabled yet in your Firebase Project (obsidianide-1606f). Please enable "Google" under Firebase Console > Authentication > Sign-in method.';
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return 'Google sign-in popup was closed or cancelled.';
    }
    if (code === 'auth/popup-blocked') {
      return 'Google sign-in popup was blocked by your browser. Please allow popups for this site.';
    }
    if (code === 'auth/unauthorized-domain') {
      return 'This domain is not authorized in Firebase Console. Add your domain under Authentication > Settings > Authorized domains.';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return 'No registered account found with these credentials. Please check your credentials or switch to Sign Up.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'An account with this email address already exists. Please sign in instead.';
    }
    if (code === 'auth/weak-password') {
      return 'Password is too weak. Please use at least 8 characters with numbers or symbols.';
    }
    if (code === 'auth/invalid-email') {
      return 'Please enter a valid email address.';
    }
    if (code === 'auth/user-disabled') {
      return 'This user account has been disabled. Contact support for assistance.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Access to this account has been temporarily disabled due to many failed attempts.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Network error occurred. Please check your internet connection.';
    }

    return msg || 'Authentication failed. Please check your credentials.';
  };

  const handleAvatarFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('⚠️ Image size exceeds 2MB limit. Please choose a smaller image.');
      return;
    }

    setAvatarError('');
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { currentUser, login, register, signInWithGoogle } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const professionOptions = [
    'Student',
    'Software Engineer',
    'Full-Stack Developer',
    'Data Scientist / AI Engineer',
    'UI/UX Designer',
    'Educator / Researcher',
    'DevOps / Cloud Engineer',
    'Technical Project Manager',
    'Other'
  ];

  const isLoginValid = email.includes('@') && password.length >= 4;
  const isRegisterValid = 
    email.includes('@') && 
    password.length >= 8 && 
    password === confirmPass && 
    displayName.trim().length > 0 &&
    username.trim().length > 0 &&
    profession.trim().length > 0 &&
    termsAccepted;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const redirectTarget = searchParams.get('redirect');

    try {
      if (isRegister) {
        const formattedUsername = username.trim().startsWith('@') 
          ? username.trim() 
          : `@${username.trim()}`;

        await register(email, password, {
          displayName: displayName.trim(),
          username: formattedUsername,
          profession,
          avatarUrl
        });
        navigate(redirectTarget || '/onboarding/github');
      } else {
        await login(email, password);
        navigate(redirectTarget || '/dashboard');
      }
    } catch (err) {
      console.error('Authentication Error:', err);
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError('');
    setIsSubmitting(true);
    const redirectTarget = searchParams.get('redirect');

    try {
      const result = await signInWithGoogle(isRegister);
      if (isRegister || result?.isNewUser) {
        navigate(redirectTarget || '/onboarding/github');
      } else {
        navigate(redirectTarget || '/dashboard');
      }
    } catch (err) {
      console.error('Google Auth Error:', err);
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-light dark:bg-[#0A0A0B] text-neutral-900 dark:text-[#e4e2e4] flex flex-col justify-between relative overflow-hidden font-sans">
      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 h-12 bg-surface-container-low/80 dark:bg-surface-dark/80 backdrop-blur-xl border-b border-outline-variant">
        <Link 
          to={currentUser ? "/dashboard" : "/"} 
          className="flex items-center gap-2.5 text-xl font-bold text-surface-tint tracking-tighter font-headline hover:opacity-90 transition-opacity no-underline"
          title={currentUser ? "Go to Dashboard" : "Go to Home"}
        >
          <img 
            src="/logo.png" 
            alt="ObsidianIDE Logo" 
            className="w-7 h-7 rounded-full object-cover border border-cyan-400/40 shadow-[0_0_10px_rgba(0,220,229,0.3)]" 
          />
          <span>ObsidianIDE</span>
        </Link>
      </header>

      {/* Main Content Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 pt-16 relative z-10">
        <div className="w-full max-w-md my-8">
          <div className="glass-panel animate-fade-in p-6 sm:p-8 rounded-lg shadow-2xl flex flex-col gap-6 bg-surface-container-low/70 dark:bg-surface-container/60 border border-outline-variant/40">
            
            {/* Header Identity */}
            <div className="text-center flex flex-col items-center">
              <Link to={currentUser ? "/dashboard" : "/"} className="no-underline">
                <img 
                  src="/logo.png" 
                  alt="ObsidianIDE Logo" 
                  className="w-14 h-14 rounded-full object-cover border-2 border-cyan-400/50 shadow-[0_0_15px_rgba(0,220,229,0.4)] mb-2 hover:scale-105 transition-transform" 
                />
              </Link>
              <h1 className="text-2xl font-bold text-surface-tint tracking-tight mb-1 font-headline">
                ObsidianIDE
              </h1>
              <p className="text-xs font-mono uppercase tracking-widest text-on-surface-variant">
                {isRegister ? 'New Developer Identity Provisioning' : 'Access Validation'}
              </p>
            </div>

            {/* Error Message Display */}
            {error && (
              <div className="p-3.5 bg-red-950/50 border border-red-800/60 text-red-300 text-xs font-mono rounded flex items-start gap-2.5 animate-fade-in shadow-md">
                <span className="material-symbols-outlined text-base text-red-400 shrink-0 mt-0.5">error_outline</span>
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {/* Google Authentication Trigger Button */}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleGoogleAuth}
              className="w-full py-2.5 px-4 bg-[#1E1F22] hover:bg-[#2B2D31] text-white border border-[#3F4147] rounded text-xs font-mono font-medium flex items-center justify-center gap-3 transition-colors shadow cursor-pointer disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              {isSubmitting ? 'Authenticating with Google...' : isRegister ? 'Sign up with Google' : 'Sign in with Google'}
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px bg-outline-variant/40 flex-1"></div>
              <span className="text-[10px] font-mono text-on-surface-variant uppercase">OR EMAIL CREDENTIALS</span>
              <div className="h-px bg-outline-variant/40 flex-1"></div>
            </div>

            {/* Standard Email / Password Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {isRegister && (
                <>
                  {/* Full Name */}
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

                  {/* Username & Profession Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-mono text-on-surface-variant flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">alternate_email</span> Username
                      </label>
                      <input 
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-surface-slate text-on-surface border-b-2 border-outline-variant focus:border-surface-tint focus:outline-none font-mono"
                        placeholder="zafor_dev"
                        required={isRegister}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-mono text-on-surface-variant flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">work</span> Profession / Role
                      </label>
                      <select
                        value={profession}
                        onChange={(e) => setProfession(e.target.value)}
                        className="w-full px-2 py-2 text-sm bg-surface-slate text-on-surface border-b-2 border-outline-variant focus:border-surface-tint focus:outline-none font-sans"
                        required={isRegister}
                      >
                        {professionOptions.map((opt) => (
                          <option key={opt} value={opt} className="bg-neutral-900 text-neutral-100">
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Profile Picture Upload Field */}
                  <div className="flex flex-col gap-1.5 p-3 bg-surface-slate/40 border border-outline-variant/40 rounded">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-mono text-on-surface-variant flex items-center gap-1.5 font-bold">
                        <span className="material-symbols-outlined text-sm text-surface-tint">account_circle</span>
                        Upload Profile Image
                      </label>
                      <span className="text-[10px] text-amber-300 font-mono">
                        Max size: 2MB (JPG, PNG, WebP)
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar Preview" className="w-10 h-10 rounded-full border border-surface-tint object-cover shadow" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-surface-container-high border border-outline-variant flex items-center justify-center text-on-surface-variant">
                          <span className="material-symbols-outlined text-lg">add_a_photo</span>
                        </div>
                      )}
                      <input 
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleAvatarFileChange}
                        className="text-xs text-on-surface file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-mono file:bg-surface-tint file:text-neutral-950 file:font-bold hover:file:bg-cyan-300 cursor-pointer"
                      />
                    </div>
                    {avatarError && (
                      <span className="text-[10px] text-rose-400 font-mono">{avatarError}</span>
                    )}
                  </div>
                </>
              )}

              {/* Academic Email */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-mono text-on-surface-variant flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">mail</span> Academic / Primary Email
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

              {/* Password */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-mono text-on-surface-variant flex items-center gap-2 justify-between">
                  <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">key</span> Password</span>
                  {!isRegister && <span className="text-[10px] text-surface-tint/70 hover:underline cursor-pointer">Forgot?</span>}
                </label>
                <div className="relative flex items-center">
                  <input 
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 text-sm bg-surface-slate text-on-surface border-b-2 border-outline-variant focus:border-surface-tint focus:outline-none font-sans"
                    placeholder="••••••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowPassword(prev => !prev);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant hover:text-surface-tint transition-colors focus:outline-none z-10 cursor-pointer"
                    title={showPassword ? 'Hide Password' : 'Show Password'}
                  >
                    <span className="material-symbols-outlined text-lg select-none">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Registration Extra Fields */}
              {isRegister && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-mono text-on-surface-variant flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">lock</span> Confirm Password
                    </label>
                    <div className="relative flex items-center">
                      <input 
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPass}
                        onChange={(e) => setConfirmPass(e.target.value)}
                        className="w-full px-3 py-2 pr-10 text-sm bg-surface-slate text-on-surface border-b-2 border-outline-variant focus:border-surface-tint focus:outline-none font-sans"
                        placeholder="••••••••••••"
                        required
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowConfirmPassword(prev => !prev);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant hover:text-surface-tint transition-colors focus:outline-none z-10 cursor-pointer"
                        title={showConfirmPassword ? 'Hide Confirm Password' : 'Show Confirm Password'}
                      >
                        <span className="material-symbols-outlined text-lg select-none">
                          {showConfirmPassword ? 'visibility_off' : 'visibility'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 text-xs text-on-surface-variant mt-1.5 p-2 bg-surface-slate/30 rounded border border-outline-variant/30">
                    <input 
                      type="checkbox"
                      id="termsCheck"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-0.5 bg-neutral-800 border-outline-variant text-surface-tint rounded-none cursor-pointer"
                    />
                    <label htmlFor="termsCheck" className="cursor-pointer leading-snug">
                      I accept the baseline{' '}
                      <Link 
                        to="/terms" 
                        target="_blank" 
                        className="text-surface-tint font-bold underline hover:text-cyan-300"
                      >
                        Terms & Security Protocol
                      </Link>
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
                  <span>PROVISIONING ACCOUNT...</span>
                ) : isRegister ? (
                  <>Deploy Developer Account <span className="material-symbols-outlined text-sm">rocket_launch</span></>
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
                className="text-xs font-mono text-on-surface-variant hover:text-surface-tint underline transition-colors cursor-pointer"
              >
                {isRegister ? 'Already registered? Return to Login' : 'New developer? Create an Account'}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-2 border-t border-outline-variant text-[11px] font-mono text-on-surface-variant flex justify-between items-center bg-surface-container-lowest/80">
        <div>© 2026 Obsidian Systems. All instances functional.</div>
        <div className="flex gap-4">
          <Link to="/terms" className="hover:text-surface-tint transition-colors">Terms & Security</Link>
          <span className="text-surface-tint font-bold">SYSTEM_READY</span>
        </div>
      </footer>
    </div>
  );
};

export default AuthPage;
