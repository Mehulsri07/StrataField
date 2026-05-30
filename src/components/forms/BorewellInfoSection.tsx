import { Settings2, ArrowDownCircle, Waves } from 'lucide-react';

interface BorewellInfoProps {
  formData: any;
  onChange: (e: any) => void;
}

export function BorewellInfoSection({ formData, onChange }: BorewellInfoProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-accent uppercase tracking-wider border-b border-sf-border pb-1">
        Borewell Engineering Specifications
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <Settings2 size={14} /> Bore Diameter (in)
          </label>
          <input
            type="number"
            step="any"
            name="boreDia"
            placeholder="e.g. 8"
            value={formData.boreDia || ''}
            onChange={onChange}
            className="sf-input"
          />
        </div>
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <Settings2 size={14} /> Pipe Diameter (in)
          </label>
          <input
            type="number"
            step="any"
            name="pipeDia"
            placeholder="e.g. 6"
            value={formData.pipeDia || ''}
            onChange={onChange}
            className="sf-input"
          />
        </div>
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <ArrowDownCircle size={14} /> Total Depth (ft)
          </label>
          <input
            type="number"
            step="any"
            name="totalDepth"
            placeholder="e.g. 250"
            value={formData.totalDepth || ''}
            onChange={onChange}
            className="sf-input"
          />
        </div>
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <Waves size={14} /> Water Level (ft)
          </label>
          <input
            type="number"
            step="any"
            name="waterLevel"
            placeholder="e.g. 80"
            value={formData.waterLevel || ''}
            onChange={onChange}
            className="sf-input"
          />
        </div>
      </div>
    </div>
  );
}
export default BorewellInfoSection;
