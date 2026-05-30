import { Compass, Info } from 'lucide-react';

interface LocationSectionProps {
  formData: any;
  onChange: (e: any) => void;
}

export function LocationSection({ formData, onChange }: LocationSectionProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-accent uppercase tracking-wider border-b border-sf-border pb-1">
        Geographic Location
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <Compass size={14} className="text-steel-light" /> Latitude
          </label>
          <input
            type="number"
            step="any"
            name="latitude"
            placeholder="e.g. 28.6139"
            value={formData.latitude || ''}
            onChange={onChange}
            className="sf-input"
          />
        </div>
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <Compass size={14} className="text-steel-light" /> Longitude
          </label>
          <input
            type="number"
            step="any"
            name="longitude"
            placeholder="e.g. 77.2090"
            value={formData.longitude || ''}
            onChange={onChange}
            className="sf-input"
          />
        </div>
      </div>
      <div className="p-3 bg-sf-surface-2 border border-sf-border rounded-lg flex gap-2 text-2xs text-txt-secondary">
        <Info size={14} className="text-info flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-txt-primary">Why log coordinates?</span> Latitude and Longitude are used to plot the borewell on the regional map for spatial searching and analysis.
        </div>
      </div>
    </div>
  );
}
export default LocationSection;
