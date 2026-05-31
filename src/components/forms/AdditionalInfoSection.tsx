import { FileText, Camera, Paperclip, X } from 'lucide-react';

interface AdditionalInfoProps {
  formData: any;
  onChange: (e: any) => void;
  onPhotoAdd?: (e: any) => void;
  onFileAttachClick?: () => void;
  onFileRemove?: () => void;
  attachedFile?: any;
  errors?: any;
  touched?: any;
}

export function AdditionalInfoSection({ formData, onChange, onPhotoAdd, onFileAttachClick, onFileRemove, attachedFile }: AdditionalInfoProps) {
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
            <Paperclip size={14} className="text-txt-secondary" /> Reference Documents
          </span>
          {attachedFile ? (
            <div className="border border-sf-border bg-sf-surface rounded-xl p-6 flex items-center justify-between gap-3 animate-fade-in h-[106px]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-info/10 text-info flex items-center justify-center flex-shrink-0">
                  <FileText size={20} />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-txt-primary truncate block max-w-[150px] md:max-w-[200px]" title={attachedFile.name}>
                    {attachedFile.name}
                  </span>
                  <span className="text-[10px] text-txt-muted font-medium block">
                    {attachedFile.size ? `${(attachedFile.size / 1024).toFixed(1)} KB | ` : ''}Reference Attached
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onFileRemove}
                className="p-1.5 hover:bg-sf-surface-2 text-txt-muted hover:text-danger rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div
              onClick={onFileAttachClick}
              className="border border-dashed border-sf-border hover:border-info hover:bg-info/5 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all h-[106px]"
            >
              <Paperclip size={22} className="text-txt-muted" />
              <span className="text-xs text-txt-secondary font-semibold">Attach PDF / Excel Sheet</span>
              <span className="text-[10px] text-txt-muted font-medium">For project records reference</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default AdditionalInfoSection;
