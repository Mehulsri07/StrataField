/**
 * StrataField — Root Application Component.
 * Sets up routing and the main layout shell.
 */

import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { StatusBar } from './components/layout/StatusBar';
import { useUIStore } from './stores/uiStore';
import { DashboardPage } from './pages/DashboardPage';
import { NewBorewellPage } from './pages/NewBorewellPage';
import { BorewellsPage } from './pages/BorewellsPage';
import { MapPage } from './pages/MapPage';
import { ImportPage } from './pages/ImportPage';
import { ExportPage } from './pages/ExportPage';
import { SettingsPage } from './pages/SettingsPage';
import { BorewellDetailPage } from './pages/BorewellDetailPage';
import { StrataEditorPage } from './pages/StrataEditorPage';
import { ToastContainer } from './components/ui/ToastContainer';
import { useEffect } from 'react';
import { useBorewellStore } from './stores/borewellStore';

function KeyboardShortcutsManager() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in form controls
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'n':
            e.preventDefault();
            navigate('/new');
            break;
          case 'f':
            e.preventDefault();
            navigate('/borewells');
            break;
          case 'h':
            e.preventDefault();
            navigate('/');
            break;
          case 'i':
            e.preventDefault();
            navigate('/import');
            break;
          case 'e':
            e.preventDefault();
            navigate('/export');
            break;
          case ',':
            e.preventDefault();
            navigate('/settings');
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return null;
}

export default function App() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const fetchAll = useBorewellStore((s) => s.fetchAll);
  const fetchTrash = useBorewellStore((s) => s.fetchTrash);

  useEffect(() => {
    fetchAll();
    fetchTrash();
  }, [fetchAll, fetchTrash]);

  return (
    <HashRouter>
      <KeyboardShortcutsManager />
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-sf-base">
        {/* Top Bar */}
        <Topbar />

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <Sidebar />

          {/* Workspace */}
          <main
            className="flex-1 overflow-auto transition-all duration-300"
            style={{ marginLeft: sidebarCollapsed ? 72 : 260 }}
          >
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/new" element={<NewBorewellPage />} />
              <Route path="/borewells" element={<BorewellsPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/export" element={<ExportPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/borewell/:id" element={<BorewellDetailPage />} />
              <Route path="/borewell/:id/strata" element={<StrataEditorPage />} />
            </Routes>
          </main>
        </div>

        {/* Status Bar */}
        <StatusBar />

        {/* Toast Notifications */}
        <ToastContainer />
      </div>
    </HashRouter>
  );
}
