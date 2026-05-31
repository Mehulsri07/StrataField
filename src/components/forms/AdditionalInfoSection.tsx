import { FileText, Camera, Paperclip } from 'lucide-react';

interface AdditionalInfoProps {
  formData: any;
  onChange: (e: any) => void;
  onPhotoAdd?: (e: any) => void;
  onFileAttach?: (e: any) => void;
  errors?: any;
  touched?: any;
}

export function AdditionalInfoSection({ formData, onChange, onPhotoAdd, onFileAttach }: AdditionalInfoProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-accent uppercase tracking-wider border-b border-sf-border pb-1.5">
        Additional Details & Attachments
      </h2>
      <div>
        <label className="sf-label flex items-center gap-1.5">
          <FileText size={14} className="text-txt-secondary" /> Geological / Drilling Observations
        </label>
        <textarea
          name="remarks"
          rows={4}
          placeholder="Enter drill details, soil hardness transitions, mud details, water yield, or general notes..."
          value={formData.remarks || ''}
          onChange={onChange}
          className="sf-input font-sans leading-relaxed"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {/* Photo Upload Box */}
        <div className="flex flex-col gap-2">
          <span className="sf-label flex items-center gap-1.5">
            <Camera size={14} className="text-txt-secondary" /> Site Photos
          </span>
          <label className="border border-dashed border-sf-border hover:border-accent hover:bg-accent/5 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all">
            <Camera size={22} className="text-txt-muted" />
            <span className="text-xs text-txt-secondary font-semibold">Add Photo (EXIF GPS will be read)</span>
            <span className="text-[10px] text-txt-muted font-medium">Supports JPG, PNG with geotag metadata</span>
            <input
              type="file"
              accept="image/*"
              onChange={onPhotoAdd}
              className="hidden"
            />
          </label>
        </div>

        {/* File Attach Box */}
        <div className="flex flex-col gap-2">
          <span className="sf-label flex items-center gap-1.5">
            <Paperclip size={14} className="text-txt-secondary" /> Design Documents & Reports
          </span>
          <label className="border border-dashed border-sf-border hover:border-info hover:bg-info/5 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all">
            <Paperclip size={22} className="text-txt-muted" />
            <span className="text-xs text-txt-secondary font-semibold">Attach PDF / Excel Sheet</span>
            <span className="text-[10px] text-txt-muted font-medium">For project records reference</span>
            <input
              type="file"
              accept=".xlsx,.xls,.pdf"
              onChange={onFileAttach}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
export default AdditionalInfoSection;
