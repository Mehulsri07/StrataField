/**
 * DashboardPage — Main landing page.
 * Displays statistics and quick navigation links.
 */

import { PlusCircle, FileUp, Search, Map, Database, FolderGit, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useEffect } from 'react';

export function DashboardPage() {
  const navigate = useNavigate();
  const borewells = useBorewellStore((s) => s.borewells);
  const trash = useBorewellStore((s) => s.trash);
  const fetchAll = useBorewellStore((s) => s.fetchAll);
  const fetchTrash = useBorewellStore((s) => s.fetchTrash);

  useEffect(() => {
    fetchAll();
    fetchTrash();
  }, [fetchAll, fetchTrash]);

  // Extract unique active projects
  const uniqueProjects = Array.from(new Set(borewells.map((b) => b.project || 'Default Project')));

  const stats = [
    { label: 'Total Records', value: borewells.length, icon: <Database className="text-accent" size={24} />, desc: 'Active borewells logged' },
    { label: 'Active Projects', value: uniqueProjects.length, icon: <FolderGit className="text-steel-light" size={24} />, desc: 'Project sites' },
    { label: 'Recycle Bin', value: trash.length, icon: <Trash2 className="text-warning" size={24} />, desc: 'Deleted records' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-sf-surface border border-sf-border rounded-xl p-6 shadow-sf">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Welcome to StrataField</h1>
          <p className="text-txt-secondary mt-1">Geological data, strata logging, and pipe assembly designer.</p>
        </div>
        <button
          onClick={() => navigate('/new')}
          className="sf-btn-primary"
        >
          <PlusCircle size={16} />
          <span>New Borewell</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, idx) => (
          <div 
            key={idx} 
            className="sf-card flex items-start gap-4 hover:border-sf-border-hover transition-all cursor-pointer"
            onClick={() => {
              if (stat.label === 'Recycle Bin') {
                navigate('/settings'); // Settings has Recycle Bin tab
              } else if (stat.label === 'Active Projects' || stat.label === 'Total Records') {
                navigate('/search');
              }
            }}
          >
            <div className="p-3 bg-sf-surface-2 border border-sf-border rounded-lg">
              {stat.icon}
            </div>
            <div>
              <p className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">{stat.label}</p>
              <h3 className="text-3xl font-extrabold text-txt-primary mt-1">{stat.value}</h3>
              <p className="text-2xs text-txt-muted mt-0.5">{stat.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Access Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <button
          onClick={() => navigate('/new')}
          className="flex flex-col items-center justify-center p-6 bg-sf-surface border border-sf-border hover:border-accent hover:shadow-sf-glow rounded-xl gap-3 transition-all cursor-pointer text-center group"
        >
          <div className="p-4 bg-accent/10 text-accent rounded-full group-hover:scale-110 transition-transform">
            <PlusCircle size={24} />
          </div>
          <span className="font-semibold text-txt-primary text-sm">New Record</span>
          <span className="text-2xs text-txt-muted">Log a new borewell</span>
        </button>

        <button
          onClick={() => navigate('/search')}
          className="flex flex-col items-center justify-center p-6 bg-sf-surface border border-sf-border hover:border-steel hover:shadow-sf-glow rounded-xl gap-3 transition-all cursor-pointer text-center group"
        >
          <div className="p-4 bg-steel/10 text-steel-light rounded-full group-hover:scale-110 transition-transform">
            <Search size={24} />
          </div>
          <span className="font-semibold text-txt-primary text-sm">Search Records</span>
          <span className="text-2xs text-txt-muted">Search owner or ID</span>
        </button>

        <button
          onClick={() => navigate('/map')}
          className="flex flex-col items-center justify-center p-6 bg-sf-surface border border-sf-border hover:border-success hover:shadow-sf-glow rounded-xl gap-3 transition-all cursor-pointer text-center group"
        >
          <div className="p-4 bg-success/10 text-success rounded-full group-hover:scale-110 transition-transform">
            <Map size={24} />
          </div>
          <span className="font-semibold text-txt-primary text-sm">Map View</span>
          <span className="text-2xs text-txt-muted">View locations on map</span>
        </button>

        <button
          onClick={() => navigate('/import')}
          className="flex flex-col items-center justify-center p-6 bg-sf-surface border border-sf-border hover:border-warning hover:shadow-sf-glow rounded-xl gap-3 transition-all cursor-pointer text-center group"
        >
          <div className="p-4 bg-warning/10 text-warning rounded-full group-hover:scale-110 transition-transform">
            <FileUp size={24} />
          </div>
          <span className="font-semibold text-txt-primary text-sm">Import Excel</span>
          <span className="text-2xs text-txt-muted">Import Excel template</span>
        </button>
      </div>

      {/* Recent Records List */}
      <div className="sf-panel p-6">
        <h2 className="text-lg font-bold text-txt-primary mb-4">Recent Records</h2>
        {borewells.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 border border-dashed border-sf-border rounded-lg text-txt-muted text-sm gap-2">
            <span>No borewell records found</span>
            <button
              onClick={() => navigate('/new')}
              className="text-xs text-accent hover:underline font-semibold"
            >
              Add your first record
            </button>
          </div>
        ) : (
          <div className="divide-y divide-sf-border">
            {borewells.slice(0, 5).map((b) => (
              <div
                key={b.id}
                onClick={() => navigate(`/borewell/${b.id}`)}
                className="flex items-center justify-between py-3 hover:bg-sf-surface-2 px-2 rounded-md transition-all cursor-pointer"
              >
                <div>
                  <h4 className="text-sm font-semibold text-txt-primary">{b.ownerName}</h4>
                  <p className="text-2xs text-txt-muted">ID: {b.borewellId} | {b.city}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-accent">{b.totalDepth ? `${b.totalDepth} ft` : 'N/A'}</span>
                  <p className="text-2xs text-txt-muted">{new Date(b.date).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
export default DashboardPage;
