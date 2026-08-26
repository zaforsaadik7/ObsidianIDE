import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const Header = () => {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const avatarUrl = userProfile?.info?.avatarUrl || userProfile?.avatarUrl || currentUser?.photoURL || '';

  return (
    <header className="fixed top-0 left-0 w-full z-[200] flex justify-between items-center px-6 h-12 bg-surface-container-low/80 dark:bg-surface-dark/80 backdrop-blur-xl border-b border-outline-variant shadow-sm transition-colors duration-150">
      <div className="flex items-center gap-6">
        <Link 
          to={currentUser ? "/dashboard" : "/"} 
          className="flex items-center gap-2.5 text-xl font-bold text-surface-tint tracking-tighter hover:opacity-90 transition-opacity font-headline group no-underline"
          title={currentUser ? "Return to Dashboard" : "Go to Home"}
        >
          <img 
            src="/logo.png" 
            alt="ObsidianIDE Logo" 
            className="w-7 h-7 rounded-full object-cover border border-cyan-400/40 shadow-[0_0_10px_rgba(0,220,229,0.3)] group-hover:scale-105 transition-transform" 
          />
          <span>ObsidianIDE</span>
        </Link>
      </div>

      <div className="flex items-center gap-4">

        {currentUser ? (
          <div 
            onClick={() => navigate('/profile')} 
            className="w-8 h-8 bg-surface-container-highest border border-outline-variant overflow-hidden cursor-pointer hover:border-surface-tint transition-colors flex items-center justify-center rounded-md p-0.5 shadow-sm"
            title={userProfile?.info?.fullName || userProfile?.displayName || currentUser.email}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="User Avatar" className="w-full h-full object-cover rounded-sm" />
            ) : (
              <span className="material-symbols-outlined text-surface-tint text-lg">
                account_circle
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 text-xs font-mono">
            <Link 
              to="/auth" 
              className="text-on-surface-variant hover:text-on-surface transition-colors px-2 py-1"
            >
              Sign In
            </Link>
            <Link 
              to="/auth?mode=register" 
              className="bg-surface-tint text-neutral-900 px-3 py-1 font-semibold flex items-center gap-1 hover:bg-cyan-400 transition-colors"
            >
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};
