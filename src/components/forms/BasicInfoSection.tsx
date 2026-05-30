import { Calendar, User, Hash } from 'lucide-react';

interface BasicInfoProps {
  formData: any;
  onChange: (e: any) => void;
}

export function BasicInfoSection({ formData, onChange }: BasicInfoProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-accent uppercase tracking-wider border-b border-sf-border pb-1">
        Basic Information
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <Hash size={14} /> Borewell Record ID *
          </label>
          <input
            type="text"
            name="borewellId"
            required
            placeholder="e.g. BW-2024-001"
            value={formData.borewellId || ''}
            onChange={onChange}
            className="sf-input"
          />
        </div>
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <User size={14} /> Owner Name *
          </label>
          <input
            type="text"
            name="ownerName"
            required
            placeholder="e.g. John Doe"
            value={formData.ownerName || ''}
            onChange={onChange}
            className="sf-input"
          />
        </div>
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <Calendar size={14} /> Log Date *
          </label>
          <input
            type="date"
            name="date"
            required
            value={formData.date || ''}
            onChange={onChange}
            className="sf-input"
          />
        </div>
      </div>
    </div>
  );
}
export default BasicInfoSection;
