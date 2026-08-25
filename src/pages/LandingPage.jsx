import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPublicUserCount } from '../services/publicUserStats';

export const LandingPage = () => {
  const [systemStatus, setSystemStatus] = useState('ONLINE');
  const [totalUsers, setTotalUsers] = useState(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        if (data && data.status) {
          setSystemStatus(data.status);
        }
      } catch (err) {
        console.warn('Backend health check warning:', err);
      }
    };
    checkHealth();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadUserCount = () => {
      getPublicUserCount()
        .then((count) => {
          if (isMounted && count !== null) setTotalUsers(count);
        })
        .catch(() => {});
    };

    loadUserCount();
    const refreshTimer = window.setInterval(loadUserCount, 10 * 1000);

    return () => {
      isMounted = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  return (
    <div className="max-w-7xl mx-auto min-h-[calc(100vh-8rem)] py-10 sm:py-16 px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1.08fr_.92fr] gap-10 lg:gap-16 items-center animate-fade-in">
      <div className="flex flex-col gap-7">
        <span className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-lg bg-[#15191d] text-[10px] text-slate-300 font-mono border border-[#303842] shadow-sm">
          <span className="status-dot w-2 h-2 rounded-full bg-neon-green animate-pulse"></span>
          System {systemStatus} <span className="text-slate-600">/</span> workspace platform
        </span>
        <div className="space-y-4">
          <p className="eyebrow">One workspace. Every project.</p>
          <h1 className="max-w-3xl text-4xl sm:text-5xl lg:text-6xl font-bold font-headline leading-[1.02] tracking-[-.045em] text-slate-100">
            A calmer control room for <span className="text-cyan-200">serious project work.</span>
          </h1>
        </div>
        <p className="max-w-2xl text-base sm:text-lg text-slate-400 leading-relaxed">
          Build, coordinate, and review academic engineering projects in a focused cloud workspace made for small teams.
        </p>
        <p className="max-w-2xl text-sm text-slate-300 leading-relaxed font-mono border-l border-cyan-300/70 pl-4" aria-live="polite">
          Used by <span className="font-bold text-cyan-200">{totalUsers ?? '—'}</span> {totalUsers === 1 ? 'builder' : 'builders'} collaborating on projects today.
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-2">
          <Link to="/auth" className="accent-button px-6 py-3.5 font-semibold transition-all flex items-center justify-center gap-2 text-sm rounded-xl">
            Open workspace <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </Link>
          <Link to="/auth?mode=register" className="subtle-button px-6 py-3.5 font-semibold text-sm transition-all text-center rounded-xl">
            Create an account
          </Link>
        </div>
      </div>

      <div className="w-full">
        <div className="control-panel animate-fade-in w-full max-w-[540px] mx-auto rounded-2xl overflow-hidden font-mono text-xs text-slate-400 leading-relaxed">
          <div className="flex items-center justify-between gap-2 border-b border-[#2a3037] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-300/10 border border-cyan-300/20 flex items-center justify-center text-cyan-200"><span className="material-symbols-outlined text-base">terminal</span></div>
              <div><div className="text-slate-200 font-bold">Workspace monitor</div><div className="text-[10px] text-slate-500">project / signal / live</div></div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-300"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> synced</span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-[#2a3037] border-b border-[#2a3037]">
            <div className="p-4"><div className="eyebrow">Projects</div><div className="mt-1 text-xl font-bold text-slate-100">12</div></div>
            <div className="p-4"><div className="eyebrow">Members</div><div className="mt-1 text-xl font-bold text-slate-100">06</div></div>
            <div className="p-4"><div className="eyebrow">Status</div><div className="mt-1 text-xl font-bold text-cyan-200">Good</div></div>
          </div>
          <div className="p-5 sm:p-6"><div className="flex items-center justify-between mb-4"><span className="text-slate-200 font-bold">Recent activity</span><span className="text-[10px] text-slate-600">JUST NOW</span></div><pre className="text-xs font-mono text-cyan-200 overflow-x-auto">{`pub fn parse_firestore_flat_tree(rows: Vec<FileRow>) -> DirectoryNode {
    let mut root = DirectoryNode::new("root");
    for row in rows { root.inject_relative_path(&row.path_string, row.payload); }
    root
}`}</pre></div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
