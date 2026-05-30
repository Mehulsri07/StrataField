/**
 * MapPage — Spatial visualization of borewells.
 * Integrates Leaflet map for local/offline visualization.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { MapPin, ArrowRight, Navigation } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export function MapPage() {
  const navigate = useNavigate();
  const borewells = useBorewellStore((s) => s.borewells);

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markersGroup = useRef<L.LayerGroup | null>(null);
  const [selectedBorewell, setSelectedBorewell] = useState<any>(null);

  // Filter list of borewells that actually have valid coordinates
  const mappedBorewells = borewells.filter((b) => b.latitude !== null && b.longitude !== null);

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    // Initialize Leaflet map
    // Centered in India as default, or first borewell's coordinate if available
    const centerLat = mappedBorewells.length > 0 ? (mappedBorewells[0].latitude as number) : 28.6139;
    const centerLon = mappedBorewells.length > 0 ? (mappedBorewells[0].longitude as number) : 77.2090;

    leafletMap.current = L.map(mapRef.current, {
      zoomControl: false,
    }).setView([centerLat, centerLon], 8);

    // Standard OpenStreetMap tiles (works online; offline defaults to grid if not cached)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(leafletMap.current);

    // Add zoom control at bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(leafletMap.current);

    markersGroup.current = L.layerGroup().addTo(leafletMap.current);

    // Initial load of markers
    renderMarkers();

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []);

  // Sync markers when data changes
  useEffect(() => {
    renderMarkers();
  }, [borewells]);

  const renderMarkers = () => {
    if (!leafletMap.current || !markersGroup.current) return;

    const group = markersGroup.current;

    // Clear old markers
    group.clearLayers();

    mappedBorewells.forEach((b) => {
      if (b.latitude === null || b.longitude === null) return;

      // Premium engineering-style pin using Leaflet DivIcon
      const customIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div class="relative w-8 h-8 flex items-center justify-center">
            <div class="absolute w-8 h-8 bg-accent/25 border-2 border-accent rounded-full animate-ping opacity-60"></div>
            <div class="relative w-5 h-5 bg-accent border border-white rounded-full shadow-sf flex items-center justify-center text-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-navigation"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([b.latitude, b.longitude], { icon: customIcon });

      // Click event
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
      {/* Left panel: List of geocoded borewells */}
      <div className="w-[320px] bg-sf-surface border-r border-sf-border flex flex-col flex-shrink-0 z-10 select-none">
        <div className="p-4 border-b border-sf-border">
          <h2 className="text-sm font-bold text-txt-primary flex items-center gap-1.5">
            <Navigation size={16} className="text-accent" />
            <span>Map Records ({mappedBorewells.length})</span>
          </h2>
          <p className="text-3xs text-txt-muted mt-1 leading-normal">
            Borewell records listed here are resolved with GPS coordinates.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {mappedBorewells.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-4 text-center text-txt-muted text-xs gap-1 py-20 border border-dashed border-sf-border rounded m-2">
              <MapPin size={20} />
              <span>No mapped records</span>
              <span className="text-3xs">Use New Borewell to add coordinates.</span>
            </div>
          ) : (
            mappedBorewells.map((b) => (
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
                  <span className="text-3xs font-semibold px-1 py-0.5 rounded bg-sf-surface border border-sf-border flex-shrink-0">
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
          <div className="absolute top-4 left-4 z-10 w-80 bg-sf-surface/90 backdrop-blur border border-sf-border rounded-xl p-4 shadow-sf-lg animate-slide-up select-none">
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
            </div>

            <div className="flex gap-2 mt-4 pt-1">
              <button
                onClick={() => setSelectedBorewell(null)}
                className="flex-1 sf-btn-secondary text-2xs py-1"
              >
                Close
              </button>
              <button
                onClick={() => navigate(`/borewell/${selectedBorewell.id}`)}
                className="flex-1 sf-btn-primary text-2xs py-1 flex items-center justify-center gap-1"
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
