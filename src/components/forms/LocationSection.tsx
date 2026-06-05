import { useState } from 'react';
import { Compass, Info, AlertCircle, Map } from 'lucide-react';
import { MapPickerModal } from '../ui/MapPickerModal';

interface LocationSectionProps {
  formData: any;
  onChange: (e: any) => void;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
}

export function LocationSection({ formData, onChange, errors, touched }: LocationSectionProps) {
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);

  const getValidationClass = (name: string) => {
    if (!touched[name]) return '';
    return errors[name] ? 'sf-input-error' : 'sf-input-success';
  };

  const handleMapSelect = (lat: number, lng: number) => {
    onChange({ target: { name: 'latitude', value: lat.toString() } } as any);
    onChange({ target: { name: 'longitude', value: lng.toString() } } as any);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center border-b border-sf-border pb-1.5">
        <h2 className="text-sm font-semibold text-accent uppercase tracking-wider">
          Geographic Location
        </h2>
        <button 
          type="button" 
          onClick={() => setIsMapModalOpen(true)}
          className="text-xs font-bold text-accent hover:underline flex items-center gap-1.5 bg-accent/10 px-2 py-1 rounded"
        >
          <Map size={14} /> Pick from Map
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Latitude */}
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <Compass size={14} className="text-accent" /> Latitude *
          </label>
          <input
            type="number"
            step="any"
            name="latitude"
            required
            placeholder="e.g. 28.6139"
            value={formData.latitude || ''}
            onChange={onChange}
            className={`sf-input ${getValidationClass('latitude')}`}
          />
          {touched.latitude && errors.latitude && (
            <p className="sf-validation-message error">
              <AlertCircle size={10} /> {errors.latitude}
            </p>
          )}
        </div>

        {/* Longitude */}
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <Compass size={14} className="text-accent" /> Longitude *
          </label>
          <input
            type="number"
            step="any"
            name="longitude"
            required
            placeholder="e.g. 77.2090"
            value={formData.longitude || ''}
            onChange={onChange}
            className={`sf-input ${getValidationClass('longitude')}`}
          />
          {touched.longitude && errors.longitude && (
            <p className="sf-validation-message error">
              <AlertCircle size={10} /> {errors.longitude}
            </p>
          )}
        </div>
      </div>
      <div className="p-3 bg-sf-surface border border-sf-border rounded-xl flex gap-2.5 text-xs text-txt-secondary">
        <Info size={16} className="text-accent flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-txt-primary">Why log coordinates?</span> Latitude and Longitude are used to plot the borewell on the regional map for spatial searching and analysis.
        </div>
      </div>
      <MapPickerModal 
        isOpen={isMapModalOpen}
        onClose={() => setIsMapModalOpen(false)}
        onSelect={handleMapSelect}
        initialLat={formData.latitude}
        initialLng={formData.longitude}
      />
    </div>
  );
}
export default LocationSection;
