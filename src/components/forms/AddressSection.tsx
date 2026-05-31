import { Search, AlertCircle } from 'lucide-react';

interface AddressSectionProps {
  formData: any;
  onChange: (e: any) => void;
  onGeocode: () => Promise<void>;
  geocoding: boolean;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
}

export function AddressSection({ formData, onChange, onGeocode, geocoding, errors, touched }: AddressSectionProps) {
  const getValidationClass = (name: string) => {
    if (!touched[name]) return '';
    return errors[name] ? 'sf-input-error' : 'sf-input-success';
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-accent uppercase tracking-wider border-b border-sf-border pb-1.5">
        Address Details
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* House / Plot No. */}
        <div>
          <label className="sf-label">House / Plot No.</label>
          <input
            type="text"
            name="houseNo"
            placeholder="e.g. Shop No 4, Block B"
            value={formData.houseNo || ''}
            onChange={onChange}
            className="sf-input"
          />
        </div>

        {/* Area / Locality */}
        <div>
          <label className="sf-label">Area / Locality</label>
          <input
            type="text"
            name="area"
            placeholder="e.g. Sector 15"
            value={formData.area || ''}
            onChange={onChange}
            className="sf-input"
          />
        </div>

        {/* City */}
        <div>
          <label className="sf-label">City *</label>
          <input
            type="text"
            name="city"
            required
            placeholder="e.g. New Delhi"
            value={formData.city || ''}
            onChange={onChange}
            className={`sf-input ${getValidationClass('city')}`}
          />
          {touched.city && errors.city && (
            <p className="sf-validation-message error">
              <AlertCircle size={10} /> {errors.city}
            </p>
          )}
        </div>
      </div>

      {/* Full Address */}
      <div>
        <label className="sf-label">Full Address / Landmark</label>
        <div className="flex gap-2">
          <input
            type="text"
            name="address"
            placeholder="Enter full address details"
            value={formData.address || ''}
            onChange={onChange}
            className="sf-input flex-1"
          />
          <button
            type="button"
            onClick={onGeocode}
            disabled={geocoding}
            className="sf-btn-secondary whitespace-nowrap"
          >
            <Search size={14} />
            <span>{geocoding ? 'Resolving...' : 'Geocode'}</span>
          </button>
        </div>
        <p className="text-[10px] text-txt-muted mt-1 leading-normal font-medium">
          Geocoding retrieves coordinates using OpenStreetMap's Nominatim service. Requires active network connection.
        </p>
      </div>
    </div>
  );
}
export default AddressSection;
