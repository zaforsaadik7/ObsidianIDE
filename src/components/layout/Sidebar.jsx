import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const Sidebar = () => {
  const location = useLocation();
  const { currentUser, userProfile } = useAuth();

  const avatarUrl = userProfile?.info?.avatarUrl || userProfile?.avatarUrl || currentUser?.photoURL || '';
  const isActive = (path) => location.pathname === path;

  return (
    <aside className="w-16 bg-surface-container-low border-r border-outline-variant flex flex-col items-center py-4 gap-4 shrink-0 h-[calc(100vh-48px)] transition-colors duration-150">
      <Link 
        to="/dashboard" 
        className={`w-10 h-10 flex items-center justify-center transition-colors ${
          isActive('/dashboard') 
            ? 'bg-secondary-container/20 text-secondary-fixed border-l-2 border-surface-tint' 
            : 'text-on-surface-variant hover:bg-surface-container-high'
        }`}
        title="Workspaces Management Home"
      >
        <span className="material-symbols-outlined">dashboard</span>
      </Link>

      <Link 
        to="/profile" 
        className={`w-10 h-10 flex items-center justify-center transition-colors overflow-hidden rounded ${
          isActive('/profile') 
            ? 'bg-secondary-container/20 text-secondary-fixed border-l-2 border-surface-tint' 
            : 'text-on-surface-variant hover:bg-surface-container-high'
        }`}
        title="Developer Profile & Settings"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="Profile" className="w-7 h-7 rounded-full object-cover border border-surface-tint/50" />
        ) : (
          <span className="material-symbols-outlined">account_circle</span>
        )}
      </Link>
    </aside>
  );
};
