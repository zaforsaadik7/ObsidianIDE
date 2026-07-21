import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';

export const MainLayout = ({ showSidebar = true }) => {
  return (
    <div className="min-h-screen flex flex-col bg-surface-light dark:bg-[#0A0A0B] text-neutral-900 dark:text-[#e4e2e4] transition-colors duration-150">
      <Header />
      
      <div className="flex-1 flex pt-12 pb-8 h-[calc(100vh)] overflow-hidden">
        {showSidebar && <Sidebar />}
        <main className="flex-1 overflow-y-auto relative p-6">
          <Outlet />
        </main>
      </div>

      <Footer />
    </div>
  );
};
