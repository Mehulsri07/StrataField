/**
 * DashboardPage — Redesigned information-rich dashboard.
 * Features a global search, dynamic map preview, recent records, imports, and exports logs.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { 
  Search, MapPin, PlusCircle, Database, FileSpreadsheet, 
  FileDown, FileUp, ArrowRight, ExternalLink, Calendar, History 
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export function DashboardPage() {
  const navigate = useNavigate();
  const borewells = useBorewellStore((s) => s.borewells);
  const theme = useUIStore((s) => s.theme);
  const setSearchFilters = useBorewellStore((s) => s.setSearchFilters);
  const searchBorewells = useBorewellStore((s) => s.searchBorewells);

  const [searchQuery, setSearchQuery] = useState('');
  const [recentExports, setRecentExports] = useState<any[]>([]);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  // Load recent exports from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('recent_exports') || '[]';
      setRecentExports(JSON.parse(raw).slice(0, 5));
    } catch (err) {
      console.error('Failed to load recent exports:', err);
    }
  }, []);

  // Filter borewells with valid coordinates for the map preview
  const mappedBorewells = borewells.filter((b) => b.latitude !== null && b.longitude !== null);

  // Initialize and Sync Mini Map Preview
  useEffect(() => {
    if (borewells.length === 0 || !mapContainerRef.current) return;

    // Destroy existing map if any
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    // Set center coordinates: use first geotagged record or fallback to India center
    const centerLat = mappedBorewells.length > 0 ? (mappedBorewells[0].latitude as number) : 28.6139;
    const centerLon = mappedBorewells.length > 0 ? (mappedBorewells[0].longitude as number) : 77.2090;
    const zoomLevel = mappedBorewells.length > 0 ? 8 : 4;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([centerLat, centerLon], zoomLevel);

    // Apply CartoDB Dark/Light Tiles depending on App Theme
    const tileUrl = theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    const attribution = '&copy; OpenStreetMap contributors &copy; CARTO';

    L.tileLayer(tileUrl, { attribution }).addTo(map);

    // Render Markers for Geotagged Borewells
    mappedBorewells.forEach((b) => {
      if (b.latitude === null || b.longitude === null) return;
      const markerColor = theme === 'dark' ? '#4D8DFF' : '#2563EB';

      const customIcon = L.divIcon({
        className: 'custom-map-marker-preview',
        html: `
          <div class="relative w-4 h-4 flex items-center justify-center">
            <div class="absolute w-4 h-4 rounded-full animate-ping opacity-25" style="background-color: ${markerColor}"></div>
            <div class="relative w-3.5 h-3.5 rounded-full border border-white flex items-center justify-center shadow-md text-white transition-all duration-150" 
                 style="background-color: ${markerColor}">
            </div>
          </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      const marker = L.marker([b.latitude, b.longitude], { icon: customIcon }).addTo(map);
      
      // Bind descriptive popup and click handler
      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 11px; padding: 2px;">
          <strong style="color: var(--txt-primary);">${b.ownerName}</strong><br/>
          <span style="color: var(--accent); font-weight: bold;">${b.borewellId}</span><br/>
          <span style="color: var(--txt-secondary);">${b.city}</span>
        </div>
      `);

      marker.on('click', () => {
        map.setView([b.latitude as number, b.longitude as number], 10);
      });
    });

    mapInstance.current = map;

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [borewells, theme]);

  // Group active imported borewells by filename (importSource)
  const importsGrouped = borewells.reduce((acc, b) => {
    if (b.importSource) {
      const key = b.importSource;
      if (!acc[key]) {
        acc[key] = {
          filename: key,
          recordCount: 0,
          date: b.createdAt || b.date,
        };
      }
      acc[key].recordCount += 1;
      if (new Date(b.createdAt || b.date) > new Date(acc[key].date)) {
        acc[key].date = b.createdAt || b.date;
      }
    }
    return acc;
  }, {} as Record<string, { filename: string; recordCount: number; date: string }>);

  const recentImports = Object.values(importsGrouped).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  ).slice(0, 5);

  const handleGlobalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchFilters({ query: searchQuery, field: 'all' });
    searchBorewells(searchQuery);
    navigate('/borewells');
  };

  const formatDisplayDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return 'N/A';
    }
  };

  // ─── EMPTY STATE BANNER ────────────────────────────────────────────────────
  if (borewells.length === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto h-[calc(100vh-76px)] flex flex-col items-center justify-center text-center space-y-6 select-none">
        <div className="w-20 h-20 rounded-3xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent animate-pulse">
          <Database size={40} />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-txt-primary tracking-tight">Welcome to StrataField</h1>
          <p className="text-sm text-txt-secondary max-w-md leading-relaxed">
            StrataField is a custom utility for managing borewell logs, strata formations, and pipe layouts. Start by logging your first record.
          </p>
        </div>
        <button
          onClick={() => navigate('/new')}
          className="sf-btn-primary px-6 py-3 text-sm flex items-center gap-2 rounded-xl shadow-sf-glow hover:scale-105 active:scale-95 transition-all cursor-pointer"
        >
          <PlusCircle size={18} />
          <span>Add your first record</span>
        </button>
      </div>
    );
  }

  // ─── ACTIVE DASHBOARD VIEW ─────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-none">
      {/* 1. Global Search Box */}
      <form onSubmit={handleGlobalSearchSubmit} className="relative w-full">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-txt-muted">
          <Search size={20} />
        </div>
        <input
          type="text"
          placeholder="Global Search (ID, Owner, Location, Project, Remarks, or Material Types)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-28 py-3.5 bg-sf-surface border border-sf-border rounded-2xl text-sm text-txt-primary placeholder-txt-muted transition-all focus:border-accent focus:ring-2 focus:ring-accent-muted outline-none shadow-sf"
        />
        <button
          type="submit"
          className="absolute right-2 top-2 bottom-2 px-4 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
        >
          Search
        </button>
      </form>

      {/* 2. Project Map Preview */}
      <div className="sf-panel p-5 space-y-3 shadow-sf">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-sm font-bold text-txt-primary flex items-center gap-2">
              <MapPin size={16} className="text-accent" />
              <span>Project Map Preview</span>
            </h2>
            <p className="text-3xs text-txt-muted">Visual distribution of geotagged records</p>
          </div>
          <button
            onClick={() => navigate('/map')}
            className="text-xs text-accent hover:underline flex items-center gap-1 font-semibold cursor-pointer"
          >
            <span>Open Map View</span>
            <ExternalLink size={12} />
          </button>
        </div>

        {mappedBorewells.length === 0 ? (
          <div className="h-[280px] bg-sf-surface border border-dashed border-sf-border rounded-xl flex flex-col items-center justify-center text-txt-muted text-xs gap-1.5 p-6 text-center">
            <MapPin size={28} className="text-txt-muted animate-bounce" />
            <span className="font-bold">No Geotagged Records Found</span>
            <span className="text-3xs text-txt-muted max-w-xs leading-normal">
              Borewell locations will appear on this preview once coordinate latitude/longitude coordinates are logged.
            </span>
          </div>
        ) : (
          <div 
            ref={mapContainerRef} 
            className="h-[280px] w-full rounded-xl border border-sf-border overflow-hidden z-10" 
          />
        )}
      </div>

      {/* 3. Three-Column Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Column A: Recent Borewells */}
        <div className="sf-panel p-5 flex flex-col justify-between shadow-sf h-[380px]">
          <div>
            <div className="flex justify-between items-center pb-3 border-b border-sf-border mb-3">
              <h3 className="text-xs font-black uppercase text-txt-secondary tracking-wider flex items-center gap-1.5">
                <Database size={14} className="text-accent" />
                <span>Recent Borewells</span>
              </h3>
              <button 
                onClick={() => navigate('/borewells')} 
                className="text-[10px] text-accent hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
              >
                <span>View All</span>
                <ArrowRight size={10} />
              </button>
            </div>

            <div className="space-y-2.5 overflow-y-auto max-h-[290px] pr-1">
              {borewells.slice(0, 5).map((b) => (
                <div
                  key={b.id}
                  onClick={() => navigate(`/borewell/${b.id}`)}
                  className="p-3 bg-sf-surface border border-sf-border hover:border-sf-border-2 rounded-xl flex justify-between items-center cursor-pointer transition-all hover:translate-x-0.5"
                >
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-txt-primary truncate block leading-tight">
                      {b.ownerName}
                    </span>
                    <span className="text-[10px] text-txt-muted font-semibold truncate block mt-0.5">
                      {b.borewellId} | {b.city}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0 pl-2">
                    <span className="text-xs font-bold text-accent block">
                      {b.totalDepth ? `${b.totalDepth} ft` : 'N/A'}
                    </span>
                    <span className="text-3xs text-txt-muted block mt-0.5">
                      {new Date(b.date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Column B: Recent Imports */}
        <div className="sf-panel p-5 flex flex-col justify-between shadow-sf h-[380px]">
          <div>
            <div className="flex justify-between items-center pb-3 border-b border-sf-border mb-3">
              <h3 className="text-xs font-black uppercase text-txt-secondary tracking-wider flex items-center gap-1.5">
                <FileUp size={14} className="text-success" />
                <span>Recent Imports</span>
              </h3>
              <button 
                onClick={() => navigate('/import')} 
                className="text-[10px] text-accent hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
              >
                <span>Import Excel</span>
                <ArrowRight size={10} />
              </button>
            </div>

            <div className="space-y-2.5 overflow-y-auto max-h-[290px] pr-1">
              {recentImports.length === 0 ? (
                <div className="h-[260px] flex flex-col items-center justify-center text-txt-muted text-xs gap-1 border border-dashed border-sf-border rounded-xl p-4 text-center">
                  <span>No recent imports</span>
                  <span className="text-3xs text-txt-muted">Excel sheet imports will be logged here.</span>
                </div>
              ) : (
                recentImports.map((imp) => (
                  <div
                    key={imp.filename}
                    onClick={() => navigate('/borewells', { state: { projectFilter: '', focusProject: false, query: '' } })}
                    className="p-3 bg-sf-surface border border-sf-border hover:border-sf-border-2 rounded-xl flex justify-between items-center cursor-pointer transition-all hover:translate-x-0.5"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-txt-primary truncate block leading-tight" title={imp.filename}>
                        {imp.filename}
                      </span>
                      <span className="text-[10px] text-success font-semibold block mt-0.5">
                        {imp.recordCount} Borewell{imp.recordCount > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0 pl-2">
                      <span className="text-3xs text-txt-muted font-bold block">
                        {formatDisplayDate(imp.date)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Column C: Recent Exports */}
        <div className="sf-panel p-5 flex flex-col justify-between shadow-sf h-[380px]">
          <div>
            <div className="flex justify-between items-center pb-3 border-b border-sf-border mb-3">
              <h3 className="text-xs font-black uppercase text-txt-secondary tracking-wider flex items-center gap-1.5">
                <FileDown size={14} className="text-warning" />
                <span>Recent Exports</span>
              </h3>
              <button 
                onClick={() => navigate('/export')} 
                className="text-[10px] text-accent hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
              >
                <span>Export Bundle</span>
                <ArrowRight size={10} />
              </button>
            </div>

            <div className="space-y-2.5 overflow-y-auto max-h-[290px] pr-1">
              {recentExports.length === 0 ? (
                <div className="h-[260px] flex flex-col items-center justify-center text-txt-muted text-xs gap-1 border border-dashed border-sf-border rounded-xl p-4 text-center">
                  <span>No recent exports</span>
                  <span className="text-3xs text-txt-muted">Excel and PDF reports exported will be logged here.</span>
                </div>
              ) : (
                recentExports.map((exp, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-sf-surface border border-sf-border rounded-xl flex justify-between items-center"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-txt-primary truncate block leading-tight" title={exp.filename}>
                        {exp.filename}
                      </span>
                      <span className="text-[10px] text-txt-muted font-semibold block mt-0.5">
                        {exp.recordCount} Record{exp.recordCount > 1 ? 's' : ''} ({exp.format.toUpperCase()})
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0 pl-2">
                      <span className="text-3xs text-txt-muted font-bold block">
                        {formatDisplayDate(exp.date)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default DashboardPage;
