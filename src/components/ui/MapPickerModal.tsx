import { useEffect, useRef, useState } from 'react';
import { X, MapPin } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useUIStore } from '@/stores/uiStore';

interface MapPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (lat: number, lng: number) => void;
  initialLat?: number | string | null;
  initialLng?: number | string | null;
}

export function MapPickerModal({ isOpen, onClose, onSelect, initialLat, initialLng }: MapPickerModalProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const theme = useUIStore((s) => s.theme);
  
  const [currentLat, setCurrentLat] = useState<number>(Number(initialLat) || 28.6139);
  const [currentLng, setCurrentLng] = useState<number>(Number(initialLng) || 77.2090);

  useEffect(() => {
    if (isOpen) {
      const parsedLat = Number(initialLat);
      const parsedLng = Number(initialLng);
      setCurrentLat(isNaN(parsedLat) || parsedLat === 0 ? 28.6139 : parsedLat);
      setCurrentLng(isNaN(parsedLng) || parsedLng === 0 ? 77.2090 : parsedLng);
    }
  }, [isOpen, initialLat, initialLng]);

  useEffect(() => {
    if (!isOpen || !mapRef.current) return;

    // Give time for modal animation before initializing map to avoid rendering bugs
    const timer = setTimeout(() => {
      if (!mapRef.current) return;
      if (mapInstance.current) {
        mapInstance.current.remove();
      }

      const map = L.map(mapRef.current, {
        zoomControl: true,
      }).setView([currentLat, currentLng], initialLat ? 12 : 5);

      const tileUrl = theme === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
      L.tileLayer(tileUrl, { attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(map);

      const markerColor = theme === 'dark' ? '#4D8DFF' : '#2563EB';
      const customIcon = L.divIcon({
        className: 'custom-map-marker-preview',
        html: `
          <div class="relative w-6 h-6 flex items-center justify-center">
            <div class="absolute w-6 h-6 rounded-full animate-ping opacity-25" style="background-color: ${markerColor}"></div>
            <div class="relative w-4 h-4 rounded-full border-2 border-white flex items-center justify-center shadow-md text-white transition-all duration-150" 
                 style="background-color: ${markerColor}">
            </div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([currentLat, currentLng], { 
        icon: customIcon, 
        draggable: true 
      }).addTo(map);

      marker.on('dragend', (e) => {
        const position = e.target.getLatLng();
        setCurrentLat(position.lat);
        setCurrentLng(position.lng);
      });

      map.on('click', (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        setCurrentLat(e.latlng.lat);
        setCurrentLng(e.latlng.lng);
      });

      mapInstance.current = map;
      markerRef.current = marker;
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [isOpen, theme]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-fadeIn">
      <div className="bg-sf-surface border border-sf-border rounded-xl shadow-sf w-full max-w-2xl overflow-hidden flex flex-col h-[70vh] min-h-[500px]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-sf-border bg-sf-base flex-shrink-0">
          <div className="flex items-center gap-2 text-txt-primary">
            <MapPin size={18} className="text-accent" />
            <h2 className="text-sm font-bold">Pick Location from Map</h2>
          </div>
          <button onClick={onClose} className="text-txt-muted hover:text-txt-primary transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative bg-sf-void w-full h-full">
          <div ref={mapRef} className="absolute inset-0 z-0" />
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-sf-surface/90 backdrop-blur-sm border border-sf-border px-4 py-2 rounded-full shadow-lg pointer-events-none">
            <span className="text-xs font-semibold text-txt-primary">Click on the map or drag the pin</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-sf-border bg-sf-base flex items-center justify-between flex-shrink-0">
          <div className="text-xs font-mono text-txt-secondary">
            Lat: {currentLat.toFixed(5)}, Lng: {currentLng.toFixed(5)}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="sf-btn-secondary py-1.5 px-4 text-xs cursor-pointer">
              Cancel
            </button>
            <button 
              onClick={() => {
                onSelect(Number(currentLat.toFixed(6)), Number(currentLng.toFixed(6)));
                onClose();
              }} 
              className="sf-btn-primary py-1.5 px-4 text-xs cursor-pointer"
            >
              Confirm Location
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
