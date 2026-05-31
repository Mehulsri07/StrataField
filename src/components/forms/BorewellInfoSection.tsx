import { Settings2, ArrowDownCircle, Waves, AlertCircle } from 'lucide-react';

interface BorewellInfoProps {
  formData: any;
  onChange: (e: any) => void;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
}

export function BorewellInfoSection({ formData, onChange, errors, touched }: BorewellInfoProps) {
  const getValidationClass = (name: string) => {
    if (!touched[name]) return '';
    return errors[name] ? 'sf-input-error' : 'sf-input-success';
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-accent uppercase tracking-wider border-b border-sf-border pb-1.5">
        Borewell Engineering Specifications
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Bore Diameter */}
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <Settings2 size={14} className="text-txt-muted" /> Bore Diameter (in)
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

        {/* Pipe Diameter */}
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <Settings2 size={14} className="text-txt-muted" /> Pipe Diameter (in)
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

        {/* Total Depth */}
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <ArrowDownCircle size={14} className="text-accent" /> Total Depth (ft)
          </label>
          <input
            type="number"
            step="any"
            name="totalDepth"
            placeholder="e.g. 250"
            value={formData.totalDepth || ''}
            onChange={onChange}
            className={`sf-input ${getValidationClass('totalDepth')}`}
          />
          {touched.totalDepth && errors.totalDepth && (
            <p className="sf-validation-message error">
              <AlertCircle size={10} /> {errors.totalDepth}
            </p>
          )}
        </div>

        {/* Water Level */}
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <Waves size={14} className="text-water-level" /> Water Level (ft)
          </label>
          <input
            type="number"
            step="any"
            name="waterLevel"
            placeholder="e.g. 80"
            value={formData.waterLevel || ''}
            onChange={onChange}
            className={`sf-input ${getValidationClass('waterLevel')}`}
          />
          {touched.waterLevel && errors.waterLevel && (
            <p className="sf-validation-message error">
              <AlertCircle size={10} /> {errors.waterLevel}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
export default BorewellInfoSection;
