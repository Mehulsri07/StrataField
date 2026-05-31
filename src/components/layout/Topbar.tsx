/**
 * Topbar — Global application header.
 * Provides quick actions, theme toggle, and search.
 */

import { Sun, Moon, Plus, Search } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUIStore } from '@/stores/uiStore';
import { useBorewellStore } from '@/stores/borewellStore';

export function Topbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const searchQuery = useBorewellStore((s) => s.searchFilters.query);
  const setSearchFilters = useBorewellStore((s) => s.setSearchFilters);
  const searchBorewells = useBorewellStore((s) => s.searchBorewells);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path === '/new') return 'New Borewell';
    if (path === '/borewells') return 'Borewells';
    if (path === '/map') return 'Map View';
    if (path === '/import') return 'Import Excel';
    if (path === '/export') return 'Export Reports';
    if (path === '/settings') return 'Settings';
    if (path.startsWith('/borewell/') && path.endsWith('/strata')) return 'Edit Strata Chart';
    if (path.startsWith('/borewell/')) return 'Borewell Detail';
    return 'StrataField';
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchFilters({ query: value });
    searchBorewells(value);
    if (location.pathname !== '/borewells') {
      navigate('/borewells');
    }
  };

  return (
    <header className="h-[48px] border-b border-sf-border bg-sf-surface flex items-center justify-between px-4 z-40 select-none">
      {/* Title / Breadcrumb */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-accent uppercase tracking-wider">Workspace</span>
        <span className="text-txt-muted text-xs">/</span>
        <span className="text-sm font-semibold text-txt-primary">{getPageTitle()}</span>
      </div>

      {/* Global Search Bar */}
      <div className="flex-1 max-w-md mx-8 relative">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-txt-muted">
          <Search size={16} />
        </div>
        <input
          type="text"
          placeholder="Quick search (Ctrl+F)..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="w-full pl-9 pr-4 py-1 bg-sf-base border border-sf-border rounded-md text-sm text-txt-primary placeholder-txt-muted transition-all focus:border-accent focus:ring-1 focus:ring-accent/20 outline-none"
        />
      </div>

      {/* Action Buttons & Theme Toggle */}
      <div className="flex items-center gap-2">
        {/* Quick actions */}
        <button
          onClick={() => navigate('/new')}
          title="Create New Borewell Record"
          className="flex items-center gap-1.5 px-3 py-1 bg-accent/10 border border-accent/20 hover:bg-accent/20 text-accent-text text-xs font-medium rounded transition-all cursor-pointer"
        >
          <Plus size={14} className="text-accent" />
          <span>New Borewell</span>
        </button>


        <div className="h-4 w-px bg-sf-border mx-1" />

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-1.5 text-txt-secondary hover:text-txt-primary hover:bg-sf-surface-2 rounded-md transition-all cursor-pointer"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
