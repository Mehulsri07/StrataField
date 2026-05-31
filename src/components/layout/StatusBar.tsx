/**
 * StatusBar — Application status footer.
 * Displays database statistics, online/offline status, and loading indicators.
 */

import { useEffect, useState } from 'react';
import { Database, Wifi, WifiOff, CloudUpload } from 'lucide-react';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';

export function StatusBar() {
  const borewells = useBorewellStore((s) => s.borewells);
  const isLoading = useUIStore((s) => s.isLoading);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSaved] = useState<string>('All changes saved');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <footer className="h-[28px] border-t border-sf-border bg-sf-surface px-4 flex items-center justify-between text-2xs text-txt-secondary select-none z-40">
      {/* Left section: Database Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-success">
          <Database size={12} />
          <span className="font-semibold text-txt-primary">SQLite Connected</span>
        </div>
        <div className="h-3 w-px bg-sf-border" />
        <div>
          <span>Total Records: </span>
          <span className="font-semibold text-txt-primary">{borewells.length}</span>
        </div>
      </div>

      {/* Middle section: Autosave / Progress */}
      <div className="flex items-center gap-2">
        {isLoading ? (
          <div className="flex items-center gap-1.5 text-accent animate-pulse-accent">
            <CloudUpload size={12} />
            <span>Processing changes...</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-txt-secondary">
            <span>{lastSaved}</span>
          </div>
        )}
      </div>

      {/* Right section: Online / Offline status */}
      <div className="flex items-center gap-1.5">
        {isOnline ? (
          <div className="flex items-center gap-1 text-success">
            <Wifi size={12} />
            <span>Online</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-warning">
            <WifiOff size={12} />
            <span>Offline mode (Geocoding disabled)</span>
          </div>
        )}
      </div>
    </footer>
  );
}
