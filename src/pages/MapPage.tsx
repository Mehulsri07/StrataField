/**
 * MapPage — Spatial visualization of borewells.
 * Integrates Leaflet map with dynamic Dark/Light map tiles synced with the app theme.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { MapPin, ArrowRight, Navigation, Search, Layers } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export function MapPage() {
  const navigate = useNavigate();
  const borewells = useBorewellStore((s) => s.borewells);
  const theme = useUIStore((s) => s.theme);

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersGroup = useRef<L.LayerGroup | null>(null);
  
  const [selectedBorewell, setSelectedBorewell] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Layer Settings
  const [showDepthLabels, setShowDepthLabels] = useState(true);
  const [showWaterTable, setShowWaterTable] = useState(true);

  // Filter list of borewells that actually have valid coordinates
  const mappedBorewells = borewells.filter((b) => b.latitude !== null && b.longitude !== null);

  // Apply search query filter
  const filteredBorewells = mappedBorewells.filter((b) => {
    const q = searchQuery.toLowerCase();
    return (
      b.ownerName.toLowerCase().includes(q) ||
      b.borewellId.toLowerCase().includes(q) ||
      (b.city && b.city.toLowerCase().includes(q)) ||
      (b.project && b.project.toLowerCase().includes(q))
    );
  });

  // 1. Initialize Map
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    const centerLat = mappedBorewells.length > 0 ? (mappedBorewells[0].latitude as number) : 28.6139;
    const centerLon = mappedBorewells.length > 0 ? (mappedBorewells[0].longitude as number) : 77.2090;

    leafletMap.current = L.map(mapRef.current, {
      zoomControl: false,
    }).setView([centerLat, centerLon], 8);

    // Add zoom control at bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(leafletMap.current);

    markersGroup.current = L.layerGroup().addTo(leafletMap.current);

    // Initial render of markers
    renderMarkers();

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []);

  // 2. Sync Map Tile URL based on App Theme
  useEffect(() => {
    if (!leafletMap.current) return;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    // CartoDB Dark Matter / Positron maps
    const tileUrl = theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

    tileLayerRef.current = L.tileLayer(tileUrl, { attribution });
    tileLayerRef.current.addTo(leafletMap.current);
  }, [theme]);

  // 3. Re-render markers when filter, depth labels, water table, theme, or selection state change
  const markersFingerprint = JSON.stringify(
    filteredBorewells.map((b) => ({
      id: b.id,
      lat: b.latitude,
      lng: b.longitude,
      depth: b.totalDepth,
      ownerName: b.ownerName,
      selected: selectedBorewell?.id === b.id,
    }))
  );

  useEffect(() => {
    renderMarkers();
  }, [markersFingerprint, showDepthLabels, showWaterTable, theme]);

  const renderMarkers = () => {
    if (!leafletMap.current || !markersGroup.current) return;

    const group = markersGroup.current;
    group.clearLayers();

    filteredBorewells.forEach((b) => {
      if (b.latitude === null || b.longitude === null) return;

      const isSelected = selectedBorewell?.id === b.id;
      const markerColor = theme === 'dark' ? '#4D8DFF' : '#2563EB';

      // Design technical pinpoint marker SVG
      const customIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div class="relative w-8 h-8 flex items-center justify-center">
            <div class="absolute w-8 h-8 rounded-full animate-ping opacity-25" style="background-color: ${markerColor}"></div>
            <div class="relative w-6 h-6 rounded-full border border-white flex items-center justify-center shadow-md text-white transition-all duration-150" 
                 style="background-color: ${isSelected ? '#2DBF7A' : markerColor}; transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'}">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            </div>
            ${showDepthLabels && b.totalDepth ? `
              <div class="absolute top-7 bg-sf-surface border border-sf-border text-txt-primary font-bold text-[9px] px-1.5 py-0.5 rounded shadow-sf whitespace-nowrap select-none pointer-events-none">
                ${b.totalDepth} ft
              </div>
            ` : ''}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([b.latitude, b.longitude], { icon: customIcon });

      marker.on('click', () => {
        setSelectedBorewell(b);
        leafletMap.current?.setView([b.latitude as number, b.longitude as number], 12);
      });

      group.addLayer(marker);
    });
  };

  const focusBorewell = (b: any) => {
    if (b.latitude === null || b.longitude === null) return;
    setSelectedBorewell(b);
    leafletMap.current?.setView([b.latitude, b.longitude], 12);
  };

  return (
    <div className="h-[calc(100vh-76px)] flex overflow-hidden">
      {/* Left panel: Search & List */}
      <div className="w-[320px] bg-sf-surface border-r border-sf-border flex flex-col flex-shrink-0 z-10 select-none">
        {/* Search */}
        <div className="p-4 border-b border-sf-border space-y-3">
          <h2 className="text-sm font-bold text-txt-primary flex items-center gap-1.5">
            <Navigation size={16} className="text-accent animate-pulse" />
            <span>Map Records ({filteredBorewells.length})</span>
          </h2>
          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-txt-muted">
              <Search size={14} />
            </div>
            <input
              type="text"
              placeholder="Search map records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-sf-base border border-sf-border rounded-lg text-xs text-txt-primary placeholder-txt-muted outline-none transition-all focus:border-accent"
            />
          </div>
        </div>

        {/* Map Layers Options */}
        <div className="px-4 py-3 border-b border-sf-border space-y-2.5">
          <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wider flex items-center gap-1">
            <Layers size={11} /> Map Layer Settings
          </span>
          <div className="flex flex-col gap-1.5 text-xs text-txt-secondary">
            <label className="flex items-center gap-2 cursor-pointer hover:text-txt-primary">
              <input
                type="checkbox"
                checked={showDepthLabels}
                onChange={(e) => setShowDepthLabels(e.target.checked)}
                className="rounded border-sf-border accent-accent bg-sf-base text-white"
              />
              <span>Show Depth Indicators</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer hover:text-txt-primary">
              <input
                type="checkbox"
                checked={showWaterTable}
                onChange={(e) => setShowWaterTable(e.target.checked)}
                className="rounded border-sf-border accent-accent bg-sf-base text-white"
              />
              <span>Highlight Static Water Levels</span>
            </label>
          </div>
        </div>

        {/* Mapped Records List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filteredBorewells.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-txt-muted text-xs gap-1 border border-dashed border-sf-border rounded-xl m-2 py-16">
              <MapPin size={22} className="text-txt-muted" />
              <span>No coordinates matches</span>
              <span className="text-3xs text-txt-muted">Log location in form or attach geotagged photo.</span>
            </div>
          ) : (
            filteredBorewells.map((b) => (
              <div
                key={b.id}
                onClick={() => focusBorewell(b)}
                className={`
                  p-3 rounded-lg border transition-all cursor-pointer text-left
                  ${selectedBorewell?.id === b.id
                    ? 'bg-accent/10 border-accent text-accent-text'
                    : 'bg-sf-base border-sf-border hover:border-sf-border-2 text-txt-secondary hover:text-txt-primary'}
                `}
              >
                <div className="flex justify-between items-start gap-1">
                  <h4 className="text-xs font-bold truncate leading-tight">{b.ownerName}</h4>
                  <span className="text-3xs font-semibold px-1.5 py-0.5 rounded bg-sf-surface border border-sf-border flex-shrink-0">
                    {b.totalDepth ? `${b.totalDepth} ft` : ''}
                  </span>
                </div>
                <p className="text-3xs text-txt-muted mt-1 font-mono truncate">{b.borewellId}</p>
                <p className="text-3xs text-txt-muted mt-0.5 truncate">{b.area}, {b.city}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main panel: Map canvas */}
      <div className="flex-1 relative h-full bg-sf-void">
        <div ref={mapRef} className="w-full h-full z-0" />

        {/* Selected Borewell overlay card */}
        {selectedBorewell && (
          <div className="absolute top-4 left-4 z-10 w-80 bg-sf-surface/90 backdrop-blur border border-sf-border rounded-xl p-4 shadow-lg animate-slide-up select-none">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold text-txt-primary">{selectedBorewell.ownerName}</h3>
                <span className="sf-badge-accent mt-1">{selectedBorewell.borewellId}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-txt-primary block">
                  {selectedBorewell.totalDepth ? `${selectedBorewell.totalDepth} ft` : 'N/A'}
                </span>
                <span className="text-3xs text-txt-muted block">Depth</span>
              </div>
            </div>

            <div className="border-t border-sf-border my-3 pt-3 space-y-2 text-2xs">
              <div className="flex justify-between">
                <span className="text-txt-muted">Location:</span>
                <span className="text-txt-primary truncate max-w-[180px]">{selectedBorewell.city}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-txt-muted">Log Date:</span>
                <span className="text-txt-primary">{new Date(selectedBorewell.date).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-txt-muted">Bore/Pipe Dia:</span>
                <span className="text-txt-primary">
                  {selectedBorewell.boreDia || 'N/A'}" / {selectedBorewell.pipeDia || 'N/A'}"
                </span>
              </div>
              {showWaterTable && selectedBorewell.waterLevel && (
                <div className="flex justify-between text-water-level font-bold">
                  <span>Water Table:</span>
                  <span>{selectedBorewell.waterLevel} ft</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4 pt-1">
              <button
                onClick={() => setSelectedBorewell(null)}
                className="flex-1 sf-btn-secondary text-2xs py-1.5"
              >
                Close
              </button>
              <button
                onClick={() => navigate(`/borewell/${selectedBorewell.id}`)}
                className="flex-1 sf-btn-primary text-2xs py-1.5 flex items-center justify-center gap-1"
              >
                <span>View Details</span>
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default MapPage;
