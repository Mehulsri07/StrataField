import { MapPin, Search } from 'lucide-react';
import { useState } from 'react';

interface AddressSectionProps {
  formData: any;
  onChange: (e: any) => void;
  onGeocode: () => Promise<void>;
  geocoding: boolean;
}

export function AddressSection({ formData, onChange, onGeocode, geocoding }: AddressSectionProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-accent uppercase tracking-wider border-b border-sf-border pb-1">
        Address Details
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        <div>
          <label className="sf-label">City *</label>
          <input
            type="text"
            name="city"
            required
            placeholder="e.g. New Delhi"
            value={formData.city || ''}
            onChange={onChange}
            className="sf-input"
          />
        </div>
      </div>
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
            <Search size={16} />
            <span>{geocoding ? 'Resolving...' : 'Geocode'}</span>
          </button>
        </div>
        <p className="text-3xs text-txt-muted mt-1">
          Geocoding retrieves coordinates using OpenStreetMap's Nominatim service. Requires internet.
        </p>
      </div>
    </div>
  );
}
export default AddressSection;
