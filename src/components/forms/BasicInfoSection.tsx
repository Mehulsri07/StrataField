import { Calendar, User, Hash, FolderGit, AlertCircle } from 'lucide-react';

interface BasicInfoProps {
  formData: any;
  onChange: (e: any) => void;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
}

export function BasicInfoSection({ formData, onChange, errors, touched }: BasicInfoProps) {
  const getValidationClass = (name: string) => {
    if (!touched[name]) return '';
    return errors[name] ? 'sf-input-error' : 'sf-input-success';
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-accent uppercase tracking-wider border-b border-sf-border pb-1.5">
        Basic Information
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Record ID */}
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
            className={`sf-input ${getValidationClass('borewellId')}`}
          />
          {touched.borewellId && errors.borewellId && (
            <p className="sf-validation-message error">
              <AlertCircle size={10} /> {errors.borewellId}
            </p>
          )}
        </div>

        {/* Project Name */}
        <div>
          <label className="sf-label flex items-center gap-1.5">
            <FolderGit size={14} /> Project Name *
          </label>
          <input
            type="text"
            name="project"
            required
            placeholder="e.g. Metro Site A"
            value={formData.project || ''}
            onChange={onChange}
            className={`sf-input ${getValidationClass('project')}`}
          />
          {touched.project && errors.project && (
            <p className="sf-validation-message error">
              <AlertCircle size={10} /> {errors.project}
            </p>
          )}
        </div>

        {/* Owner Name */}
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
            className={`sf-input ${getValidationClass('ownerName')}`}
          />
          {touched.ownerName && errors.ownerName && (
            <p className="sf-validation-message error">
              <AlertCircle size={10} /> {errors.ownerName}
            </p>
          )}
        </div>

        {/* Date */}
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
            className={`sf-input ${getValidationClass('date')}`}
          />
          {touched.date && errors.date && (
            <p className="sf-validation-message error">
              <AlertCircle size={10} /> {errors.date}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
export default BasicInfoSection;
