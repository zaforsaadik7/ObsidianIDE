import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

// Automatically route all relative /api requests to VITE_BACKEND_URL in production/cloud deployments (e.g. Vercel)
if (import.meta.env.VITE_BACKEND_URL && typeof window !== 'undefined') {
  const backendBase = import.meta.env.VITE_BACKEND_URL.replace(/\/$/, '');
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    if (typeof input === 'string' && input.startsWith('/api')) {
      return nativeFetch(`${backendBase}${input}`, init);
    }
    return nativeFetch(input, init);
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
