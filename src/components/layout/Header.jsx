import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import { useAuth } from '../../context/AuthContext';

export const Header = () => {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 left-0 w-full z-[200] flex justify-between items-center px-6 h-12 bg-surface-container-low/80 dark:bg-surface-dark/80 backdrop-blur-xl border-b border-outline-variant shadow-sm transition-colors duration-150">
      <div className="flex items-center gap-6">
        <Link 
          to="/dashboard" 
          className="text-xl font-bold text-surface-tint tracking-tighter hover:opacity-90 transition-opacity font-headline"
        >
          ObsidianIDE
        </Link>
        
        {currentUser && (
          <div className="relative hidden md:flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-sm">
              search
            </span>
            <input 
              className="h-7 pl-8 pr-4 text-xs bg-surface-slate text-on-surface w-56 placeholder:text-on-surface-variant/40 focus:outline-none focus:border-b-2 focus:border-surface-tint border-b border-transparent transition-colors font-mono"
              placeholder="Lookup global workspaces..." 
              type="text"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <ThemeToggle />

        {currentUser ? (
          <div 
            onClick={() => navigate('/profile')} 
            className="w-7 h-7 bg-surface-container-highest border border-outline-variant overflow-hidden cursor-pointer hover:border-surface-tint transition-colors flex items-center justify-center rounded-sm"
            title={userProfile?.displayName || currentUser.email}
          >
            <span className="material-symbols-outlined text-surface-tint text-lg">
              account_circle
            </span>
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
