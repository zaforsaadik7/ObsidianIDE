import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';

export const MainLayout = ({ showSidebar = true }) => {
  return (
    <div className="app-shell min-h-screen flex flex-col text-neutral-900 dark:text-[#e4e2e4] transition-colors duration-150">
      <Header />
      
      <div className="flex-1 flex pt-12 pb-8 h-[calc(100vh)] overflow-hidden">
        {showSidebar && <Sidebar />}
        <main className="flex-1 overflow-y-auto relative p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <Footer />
    </div>
  );
};
