/**
 * Sidebar — Main navigation panel.
 * Collapsible with icon-only mode. ArcGIS Pro / VS Code inspired design.
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
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/',        label: 'Dashboard',      icon: <LayoutDashboard size={20} />, section: 'main' },
  { path: '/new',     label: 'New Borewell',   icon: <PlusCircle size={20} />,      section: 'main' },
  { path: '/search',  label: 'Search Records', icon: <Search size={20} />,          section: 'main' },
  { path: '/map',     label: 'Map View',       icon: <Map size={20} />,             section: 'main' },
  { path: '/import',  label: 'Import',         icon: <FileUp size={20} />,          section: 'data' },
  { path: '/export',  label: 'Export',         icon: <FileDown size={20} />,        section: 'data' },
  { path: '/settings',label: 'Settings',       icon: <Settings size={20} />,        section: 'system' },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      className={`
        fixed left-0 top-[48px] bottom-[28px] z-30
        flex flex-col
        bg-sf-surface border-r border-sf-border
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-[56px]' : 'w-[280px]'}
      `}
    >
      {/* Brand / Logo Area */}
      <div className={`
        flex items-center h-14 px-4 border-b border-sf-border
        ${collapsed ? 'justify-center px-2' : ''}
      `}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
            <Layers size={18} className="text-accent" />
          </div>
          {!collapsed && (
            <div className="animate-fade-in">
              <h1 className="text-sm font-bold text-txt-primary tracking-wide">
                STRATA<span className="text-accent">FIELD</span>
              </h1>
              <p className="text-2xs text-txt-muted -mt-0.5">v1.0</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {/* Main Section */}
        {!collapsed && (
          <p className="text-2xs font-semibold text-txt-muted uppercase tracking-wider px-3 py-2">
            Navigation
          </p>
        )}
        {NAV_ITEMS.filter((i) => i.section === 'main').map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            title={collapsed ? item.label : undefined}
            className={`
              w-full flex items-center gap-3 rounded-md text-sm font-medium
              transition-all duration-150 cursor-pointer
              ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}
              ${
                isActive(item.path)
                  ? 'bg-accent/10 text-accent-text'
                  : 'text-txt-secondary hover:bg-sf-surface-2 hover:text-txt-primary'
              }
            `}
          >
            <span className={isActive(item.path) ? 'text-accent' : ''}>{item.icon}</span>
            {!collapsed && <span className="animate-fade-in">{item.label}</span>}
            {isActive(item.path) && !collapsed && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent" />
            )}
          </button>
        ))}

        {/* Data Section */}
        {!collapsed && (
          <p className="text-2xs font-semibold text-txt-muted uppercase tracking-wider px-3 py-2 mt-4">
            Data
          </p>
        )}
        {collapsed && <div className="my-2 mx-2 border-t border-sf-border" />}
        {NAV_ITEMS.filter((i) => i.section === 'data').map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            title={collapsed ? item.label : undefined}
            className={`
              w-full flex items-center gap-3 rounded-md text-sm font-medium
              transition-all duration-150 cursor-pointer
              ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}
              ${
                isActive(item.path)
                  ? 'bg-accent/10 text-accent-text'
                  : 'text-txt-secondary hover:bg-sf-surface-2 hover:text-txt-primary'
              }
            `}
          >
            <span className={isActive(item.path) ? 'text-accent' : ''}>{item.icon}</span>
            {!collapsed && <span className="animate-fade-in">{item.label}</span>}
          </button>
        ))}

        {/* System Section */}
        {collapsed && <div className="my-2 mx-2 border-t border-sf-border" />}
      </nav>

      {/* Bottom: Settings + Collapse */}
      <div className="border-t border-sf-border px-2 py-2 space-y-0.5">
        {NAV_ITEMS.filter((i) => i.section === 'system').map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            title={collapsed ? item.label : undefined}
            className={`
              w-full flex items-center gap-3 rounded-md text-sm font-medium
              transition-all duration-150 cursor-pointer
              ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}
              ${
                isActive(item.path)
                  ? 'bg-accent/10 text-accent-text'
                  : 'text-txt-secondary hover:bg-sf-surface-2 hover:text-txt-primary'
              }
            `}
          >
            <span className={isActive(item.path) ? 'text-accent' : ''}>{item.icon}</span>
            {!collapsed && <span className="animate-fade-in">{item.label}</span>}
          </button>
        ))}

        {/* Collapse Toggle */}
        <button
          onClick={toggle}
          className="w-full flex items-center gap-3 rounded-md text-sm font-medium
            text-txt-muted hover:bg-sf-surface-2 hover:text-txt-secondary
            transition-all duration-150 cursor-pointer
            px-3 py-2"
          style={{ justifyContent: collapsed ? 'center' : undefined }}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span className="animate-fade-in">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
