/**
 * Sidebar — Redesigned Navigation Panel.
 * Collapsible with 72px collapsed and 260px expanded modes.
 * Premium engineering aesthetics, custom active page highlight.
 */

import { useLocation, useNavigate } from 'react-router-dom';
import { useUIStore } from '@/stores/uiStore';
import {
  LayoutDashboard,
  PlusCircle,
  Search,
  Map,
  FileUp,
  FileDown,
  Settings,
  ChevronLeft,
  ChevronRight,
  Layers,
  Database,
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  section: 'main' | 'data' | 'system';
  state?: any;
  isActive: (pathname: string, state: any) => boolean;
}

// Moved outside component — NAV_ITEMS is static and was recreated on every render inside
const NAV_ITEMS: NavItem[] = [
  {
    path: '/',
    label: 'Dashboard',
    icon: <LayoutDashboard size={18} />,
    section: 'main',
    isActive: (p) => p === '/',
  },
  {
    path: '/new',
    label: 'New Borewell',
    icon: <PlusCircle size={18} />,
    section: 'main',
    isActive: (p) => p === '/new',
  },
  {
    path: '/borewells',
    label: 'Borewells',
    icon: <Search size={18} />,
    section: 'main',
    isActive: (p) => p === '/borewells',
  },
  {
    path: '/map',
    label: 'Map',
    icon: <Map size={18} />,
    section: 'main',
    isActive: (p) => p === '/map',
  },
  {
    path: '/settings',
    label: 'Materials',
    icon: <Layers size={18} />,
    section: 'data',
    state: { tab: 'materials' },
    isActive: (p, s) => p === '/settings' && s?.tab === 'materials',
  },
  {
    path: '/import',
    label: 'Import',
    icon: <FileUp size={18} />,
    section: 'data',
    isActive: (p) => p === '/import',
  },
  {
    path: '/cleanup',
    label: 'Data Cleanup',
    icon: <Database size={18} />,
    section: 'data',
    isActive: (p) => p === '/cleanup',
  },
  {
    path: '/export',
    label: 'Export',
    icon: <FileDown size={18} />,
    section: 'data',
    isActive: (p) => p === '/export',
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: <Settings size={18} />,
    section: 'system',
    state: { tab: 'general' },
    isActive: (p, s) => p === '/settings' && (!s?.tab || s?.tab === 'general'),
  },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);

  const handleNavigate = (item: NavItem) => {
    navigate(item.path, { state: item.state });
  };

  const renderNavGroup = (section: 'main' | 'data' | 'system', label: string) => {
    const items = NAV_ITEMS.filter((i) => i.section === section);
    return (
      <div className="space-y-1">
        {!collapsed && (
          <p className="text-[10px] font-bold text-txt-muted uppercase tracking-wider px-3 py-1.5 mt-2">
            {label}
          </p>
        )}
        {collapsed && section !== 'main' && (
          <div className="my-2 mx-3 border-t border-sf-border" />
        )}
        {items.map((item) => {
          const active = item.isActive(location.pathname, location.state);
          return (
            <button
              key={item.label}
              onClick={() => handleNavigate(item)}
              title={collapsed ? item.label : undefined}
              className={`
                w-full flex items-center gap-3.5 rounded-lg text-xs font-semibold
                transition-all duration-150 cursor-pointer outline-none group relative
                ${collapsed ? 'justify-center py-3' : 'px-3 py-2.5'}
                ${
                  active
                    ? 'bg-accent/10 text-accent-text border-l-4 border-accent rounded-l-none'
                    : 'text-txt-secondary hover:bg-sf-surface-2 hover:text-txt-primary'
                }
              `}
            >
              <span className={`transition-transform duration-150 group-hover:scale-105 ${active ? 'text-accent' : ''}`}>
                {item.icon}
              </span>
              {!collapsed && (
                <span className="truncate animate-fade-in">{item.label}</span>
              )}
              {active && !collapsed && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <aside
      className={`
        fixed left-0 top-[48px] bottom-[28px] z-30
        flex flex-col select-none
        bg-sf-surface border-r border-sf-border
        transition-all duration-200 ease-in-out
        ${collapsed ? 'w-[72px]' : 'w-[260px]'}
      `}
    >
      {/* Brand / Logo Area */}
      <div className={`
        flex items-center h-14 border-b border-sf-border
        ${collapsed ? 'justify-center px-2' : 'px-4'}
      `}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
            <Layers size={18} className="text-accent" />
          </div>
          {!collapsed && (
            <div className="animate-fade-in">
              <h1 className="text-xs font-black text-txt-primary tracking-wider leading-none">
                STRATA<span className="text-accent">FIELD</span>
              </h1>
              <p className="text-[10px] text-txt-muted mt-1 leading-none font-medium">Desktop Suite</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-3">
        {renderNavGroup('main', 'Navigation')}
        {renderNavGroup('data', 'Project & Data')}
        {renderNavGroup('system', 'System Configuration')}
      </nav>

      {/* Bottom: Collapse Button */}
      <div className="border-t border-sf-border px-2 py-2">
        <button
          onClick={toggle}
          className="w-full flex items-center gap-3.5 rounded-lg text-xs font-semibold
            text-txt-muted hover:bg-sf-surface-2 hover:text-txt-secondary
            transition-all duration-150 cursor-pointer outline-none
            px-3 py-2.5"
          style={{ justifyContent: collapsed ? 'center' : undefined }}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span className="animate-fade-in">Collapse Panel</span>}
        </button>
      </div>
    </aside>
  );
}
