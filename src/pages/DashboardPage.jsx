import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ProjectCard } from '../components/dashboard/ProjectCard';
import { CreateProjectModal } from '../components/dashboard/CreateProjectModal';

export const DashboardPage = () => {
  const { currentUser } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Mock initial seed projects if no custom projects exist yet
  const defaultProjects = [
    {
      projectId: 'quantum-router-01',
      title: 'Quantum_Router',
      languageEnv: 'RUST_1.75',
      userRole: 'OWNER',
      updatedAt: new Date(Date.now() - 7200000).toISOString()
    },
    {
      projectId: 'nexus-graph-db-02',
      title: 'Nexus_Graph_DB',
      languageEnv: 'GO_1.21',
      userRole: 'COLLABORATOR',
      updatedAt: new Date(Date.now() - 86400000).toISOString()
    }
  ];

  const fetchUserProjects = async () => {
    if (!currentUser?.email) return;
    try {
      const res = await fetch(`/api/projects?email=${encodeURIComponent(currentUser.email)}`);
      const data = await res.json();
      if (res.ok && data.projects) {
        setProjects(data.projects.length > 0 ? data.projects : defaultProjects);
      } else {
        setProjects(defaultProjects);
      }
    } catch (err) {
      console.warn("Failed to fetch user projects from backend, using seed projects:", err);
      setProjects(defaultProjects);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserProjects();
  }, [currentUser]);

  const handleProjectCreated = (newProject) => {
    setProjects([newProject, ...projects]);
  };

  const filteredProjects = projects.filter(p => 
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto font-sans">
      {/* Dashboard Global Header Strip */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-outline-variant/30 pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-3 font-headline">
            Workspace Central Launcher 
            <span className="bg-cyan-950/80 text-cyan-400 text-[10px] tracking-widest font-mono px-2 py-0.5 uppercase align-middle border border-cyan-800/50">
              Mesh Online
            </span>
          </h1>
          <p className="text-xs text-on-surface-variant mt-1 font-sans">
            Initialize clean workspaces or configure authorized collaboration repositories instantly.
          </p>
        </div>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-surface-tint text-neutral-900 px-4 py-2 font-mono text-xs font-bold flex items-center gap-1.5 hover:bg-cyan-400 transition-colors shadow-md cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">add_box</span> Create New Project
        </button>
      </div>

      {/* Simplified Collaboration Active Banner */}
      <div className="p-4 bg-surface-container-low border border-outline-variant text-xs text-on-surface-variant flex items-center gap-3">
        <span className="material-symbols-outlined text-purple-400 text-sm">group</span>
        <span>
          <strong>Simplified Collaboration Loop Active:</strong> Non-owners push localized text changes natively into Firestore. System Admins and Project Managers authorize text updates inside the IDE via a clean side review drawer.
        </span>
      </div>

      {/* Search Filter Bar */}
      <div className="flex justify-between items-center bg-surface-container-lowest p-3 border border-outline-variant/40">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <span className="material-symbols-outlined text-on-surface-variant text-sm">search</span>
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none focus:outline-none text-xs text-on-surface w-full font-mono placeholder:text-on-surface-variant/40"
            placeholder="Search active repository cards..."
          />
        </div>
        <span className="text-[11px] font-mono text-on-surface-variant">
          Active Repositories: {filteredProjects.length}
        </span>
      </div>

      {/* Project Cards Grid */}
      {loading ? (
        <div className="py-12 flex justify-center text-xs font-mono text-surface-tint">
          Loading workspace repositories...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <ProjectCard 
              key={project.projectId} 
              project={project} 
              userRole={project.userRole || 'OWNER'} 
            />
          ))}
        </div>
      )}

      {/* Create Project Modal Overlay */}
      <CreateProjectModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onProjectCreated={handleProjectCreated}
      />
    </div>
  );
};
export default DashboardPage;
