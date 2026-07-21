import React from 'react';
import { Link } from 'react-router-dom';

export const LandingPage = () => {
  return (
    <div className="max-w-7xl mx-auto py-12 px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
      <div className="flex flex-col gap-6">
        <span className="inline-flex items-center self-start px-3 py-1 rounded-full bg-surface-container-high text-xs text-surface-tint font-mono border border-outline-variant/30">
          v3.0 Production Architecture
        </span>
        <h1 className="text-5xl font-bold font-headline leading-tight">
          Distributed Cloud Workspaces for <br />
          <span className="text-surface-tint">Academic Engineering</span> Teams.
        </h1>
        <p className="text-base text-on-surface-variant leading-relaxed">
          Centralized, zero-configuration cloud workspace wrappers engineered for student project execution squads. Track directories atomically inside flat Firestore models and preview layouts via local browser compilers.
        </p>
        <div className="flex items-center gap-6 mt-4">
          <Link 
            to="/auth" 
            className="bg-surface-tint text-neutral-900 px-8 py-4 font-semibold shadow-lg hover:bg-cyan-400 transition-colors flex items-center gap-2 text-sm font-mono"
          >
            Launch Environment <span className="material-symbols-outlined">terminal</span>
          </Link>
          <Link 
            to="/auth?mode=register" 
            className="border border-outline-variant px-6 py-4 font-semibold text-sm hover:border-surface-tint transition-colors font-mono"
          >
            Create Free Account
          </Link>
        </div>
      </div>

      <div className="hidden lg:block w-full">
        <div className="glass-panel w-full max-w-[500px] mx-auto rounded-lg shadow-2xl flex flex-col overflow-hidden border border-outline-variant/30 bg-surface-container-low/60 p-6 font-mono text-xs text-on-surface-variant leading-relaxed">
          <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-3 mb-4">
            <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500/40"></div><div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40"></div><div className="w-2.5 h-2.5 rounded-full bg-green-500/40"></div></div>
            <span className="text-[11px] text-surface-tint ml-2">flat_schema_parser.rs</span>
          </div>
          <pre className="text-xs font-mono text-cyan-400">
{`pub fn parse_firestore_flat_tree(rows: Vec<FileRow>) -> DirectoryNode {
    let mut root = DirectoryNode::new("root");
    for row in rows {
        root.inject_relative_path(&row.path_string, row.payload);
    }
    root
}`}
          </pre>
        </div>
      </div>
    </div>
  );
};
export default LandingPage;
