import { Compass, Info, AlertCircle } from 'lucide-react';

interface LocationSectionProps {
  formData: any;
  onChange: (e: any) => void;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
}

export function LocationSection({ formData, onChange, errors, touched }: LocationSectionProps) {
  const getValidationClass = (name: string) => {
    if (!touched[name]) return '';
    return errors[name] ? 'sf-input-error' : 'sf-input-success';
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-accent uppercase tracking-wider border-b border-sf-border pb-1.5">
        Geographic Location
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Latitude */}
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <Compass size={14} className="text-accent" /> Latitude
          </label>
          <input
            type="number"
            step="any"
            name="latitude"
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
            <Compass size={14} className="text-accent" /> Longitude
          </label>
          <input
            type="number"
            step="any"
            name="longitude"
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
    </div>
  );
}
export default LocationSection;
