import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export const ThemeToggle = () => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-surface-tint transition-colors duration-150 flex items-center justify-center"
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      <span className="material-symbols-outlined text-xl">
        {isDark ? 'light_mode' : 'dark_mode'}
      </span>
    </button>
  );
};
