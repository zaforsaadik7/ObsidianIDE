import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MainLayout } from './components/layout/MainLayout';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import IDEWorkspacePage from './pages/IDEWorkspacePage';
import InvitePortalPage from './pages/InvitePortalPage';

import TermsPage from './pages/TermsPage';
import ConnectGitHubPage from './pages/ConnectGitHubPage';

const AuthLoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#0A0A0B]">
    <div className="text-cyan-400 font-mono text-sm animate-pulse">Loading...</div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  return currentUser ? children : <Navigate to="/auth" replace />;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public Landing View */}
      <Route element={<MainLayout showSidebar={false} />}>
        <Route path="/" element={<LandingPage />} />
      </Route>

      {/* Standalone Auth & Terms Views */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/onboarding" element={<Navigate to="/dashboard" replace />} />
      <Route path="/onboarding/github" element={<ProtectedRoute><ConnectGitHubPage /></ProtectedRoute>} />

      {/* Main Authenticated Dashboard & Profile Layout */}
      <Route element={
        <ProtectedRoute>
          <MainLayout showSidebar={true} />
        </ProtectedRoute>
      }>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* Standalone Core IDE Workspace View (Full Screen 3-Pane Split) */}
      <Route path="/ide/:projectId" element={
        <ProtectedRoute>
          <IDEWorkspacePage />
        </ProtectedRoute>
      } />

      {/* Teammate Invitation Handshake View */}
      <Route path="/invite/:inviteId" element={<InvitePortalPage />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
