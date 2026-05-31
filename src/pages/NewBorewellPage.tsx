/**
 * NewBorewellPage — Form page to record new borewell details.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { BasicInfoSection } from '@/components/forms/BasicInfoSection';
import { AddressSection } from '@/components/forms/AddressSection';
import { LocationSection } from '@/components/forms/LocationSection';
import { BorewellInfoSection } from '@/components/forms/BorewellInfoSection';
import { AdditionalInfoSection } from '@/components/forms/AdditionalInfoSection';
import { Save, ArrowLeft, AlertTriangle } from 'lucide-react';
import { parse as parseExif } from 'exifr';
import type { Borewell } from '@/shared/types';

export function NewBorewellPage() {
  const navigate = useNavigate();
  const addBorewell = useBorewellStore((s) => s.addBorewell);
  const updateBorewell = useBorewellStore((s) => s.updateBorewell);
  const addToast = useUIStore((s) => s.addToast);

  const [geocoding, setGeocoding] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<{
    isOpen: boolean;
    existingRecord: Borewell;
  } | null>(null);

  const [formData, setFormData] = useState({
    borewellId: '',
    project: 'Default Project',
    ownerName: '',
    houseNo: '',
    area: '',
    city: '',
    address: '',
    latitude: '' as string | number,
    longitude: '' as string | number,
    boreDia: '' as string | number,
    pipeDia: '' as string | number,
    totalDepth: '' as string | number,
    waterLevel: '' as string | number,
    remarks: '',
    date: new Date().toISOString().split('T')[0],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const validateField = (name: string, value: any): string => {
    switch (name) {
      case 'borewellId':
        return !value || String(value).trim() === '' ? 'Borewell Name/ID is a mandatory field.' : '';
      case 'project':
        return !value || String(value).trim() === '' ? 'Project Name is a mandatory field.' : '';
      case 'ownerName':
        return !value || String(value).trim() === '' ? 'Owner / Client Name is a mandatory field.' : '';
      case 'city':
        return !value || String(value).trim() === '' ? 'City / District is a mandatory field.' : '';
      case 'latitude':
        if (value !== '' && value !== null && value !== undefined) {
          const lat = Number(value);
          if (isNaN(lat) || lat < -90 || lat > 90) return 'Latitude must be a valid number between -90 and 90 degrees.';
        }
        return '';
      case 'longitude':
        if (value !== '' && value !== null && value !== undefined) {
          const lng = Number(value);
          if (isNaN(lng) || lng < -180 || lng > 180) return 'Longitude must be a valid number between -180 and 180 degrees.';
        }
        return '';
      case 'totalDepth':
        if (value !== '' && value !== null && value !== undefined) {
          const depth = Number(value);
          if (isNaN(depth) || depth < 0) return 'Total depth cannot be a negative value.';
        }
        return '';
      case 'waterLevel':
        if (value !== '' && value !== null && value !== undefined) {
          const wl = Number(value);
          if (isNaN(wl) || wl < 0) return 'Water level depth cannot be a negative value.';
          if (formData.totalDepth !== '' && wl > Number(formData.totalDepth)) {
            return 'Water level depth cannot exceed the total borewell depth.';
          }
        }
        return '';
      default:
        return '';
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setTouched((prev) => ({ ...prev, [name]: true }));

    const err = validateField(name, value);
    setErrors((prev) => ({ ...prev, [name]: err }));

    if (name === 'totalDepth' && formData.waterLevel !== '') {
      const depthVal = value !== '' ? Number(value) : null;
      const wlVal = Number(formData.waterLevel);
      if (depthVal !== null && wlVal > depthVal) {
        setErrors((prev) => ({ ...prev, waterLevel: 'Water level depth cannot exceed the total borewell depth.' }));
      } else {
        setErrors((prev) => ({ ...prev, waterLevel: '' }));
      }
    }
  };

  const handleGeocode = async () => {
    const { houseNo, area, city, address } = formData;
    const queryParts = [houseNo, area, city, address].filter(Boolean);
    if (queryParts.length === 0) {
      addToast({ message: 'Please enter address details before geocoding.', type: 'warning' });
      return;
    }

    setGeocoding(true);
    try {
      const result = await window.api.geocode.address(queryParts.join(', '));

      if (result) {
        setFormData((prev) => ({
          ...prev,
          latitude: result.latitude,
          longitude: result.longitude,
        }));
        setTouched((prev) => ({ ...prev, latitude: true, longitude: true }));
        setErrors((prev) => ({ ...prev, latitude: '', longitude: '' }));
        addToast({ message: 'Coordinates resolved successfully.', type: 'success' });
      } else {
        addToast({ message: 'Could not resolve coordinates for this address.', type: 'warning' });
      }
    } catch (err) {
      console.error(err);
      addToast({
        message: 'Geocoding failed. Please verify connection or enter manually.',
        type: 'error',
      });
    } finally {
      setGeocoding(false);
    }
  };

  const handlePhotoAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      try {
        const exif = await parseExif(file);
        if (exif) {
          const { latitude, longitude, DateTimeOriginal } = exif;
          const updates: any = {};
          if (latitude !== undefined && longitude !== undefined) {
            updates.latitude = latitude;
            updates.longitude = longitude;
            setTouched((prev) => ({ ...prev, latitude: true, longitude: true }));
            setErrors((prev) => ({ ...prev, latitude: '', longitude: '' }));
            addToast({ message: 'GPS coordinates extracted from geotagged photo!', type: 'success' });
          }
          if (DateTimeOriginal) {
            const dateStr = new Date(DateTimeOriginal).toISOString().split('T')[0];
            updates.date = dateStr;
            addToast({ message: `Drill date extracted from photo: ${dateStr}`, type: 'info' });
          }
          setFormData((prev) => ({ ...prev, ...updates }));
        } else {
          addToast({ message: 'Photo loaded, but no EXIF metadata was found.', type: 'info' });
        }
      } catch (err) {
        console.error('Failed to parse EXIF data:', err);
        addToast({ message: 'Failed to read photo metadata.', type: 'error' });
      }
    }
  };

  const buildBorewellRecord = (customId?: string, isCopy = false): Borewell => {
    return {
      id: customId || crypto.randomUUID(),
      borewellId: isCopy ? `${formData.borewellId} (Copy)` : formData.borewellId,
      project: formData.project || 'Default Project',
      ownerName: formData.ownerName,
      houseNo: formData.houseNo,
      area: formData.area,
      city: formData.city,
      address: formData.address,
      latitude: formData.latitude !== '' ? Number(formData.latitude) : null,
      longitude: formData.longitude !== '' ? Number(formData.longitude) : null,
      boreDia: formData.boreDia !== '' ? Number(formData.boreDia) : null,
      pipeDia: formData.pipeDia !== '' ? Number(formData.pipeDia) : null,
      totalDepth: formData.totalDepth !== '' ? Number(formData.totalDepth) : null,
      waterLevel: formData.waterLevel !== '' ? Number(formData.waterLevel) : null,
      remarks: formData.remarks,
      date: formData.date,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      importSource: null,
      importMethod: 'manual',
      deletedAt: null
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields
    const allErrors: Record<string, string> = {};
    const newTouched: Record<string, boolean> = {};
    Object.keys(formData).forEach((key) => {
      const err = validateField(key, (formData as any)[key]);
      if (err) allErrors[key] = err;
      newTouched[key] = true;
    });
    setErrors(allErrors);
    setTouched(newTouched);

    if (Object.keys(allErrors).length > 0) {
      addToast({ message: 'Please correct the validation errors in the form.', type: 'error' });
      return;
    }

    try {
      // 2. Duplicate Detection
      const duplicate = await window.api.db.checkDuplicate(
        formData.borewellId,
        formData.project,
        formData.date
      );

      if (duplicate) {
        setDuplicateModal({ isOpen: true, existingRecord: duplicate });
      } else {
        await addBorewell(buildBorewellRecord());
        addToast({ message: 'Borewell record saved successfully!', type: 'success' });
        navigate('/');
      }
    } catch (err: any) {
      console.error(err);
      addToast({ message: err.message || 'Failed to save record.', type: 'error' });
    }
  };

  const handleDuplicateResolve = async (action: 'overwrite' | 'keep_both') => {
    if (!duplicateModal) return;
    const existing = duplicateModal.existingRecord;
    setDuplicateModal(null);

    try {
      if (action === 'overwrite') {
        const updates = buildBorewellRecord(existing.id);
        await updateBorewell(existing.id, updates);
        addToast({ message: 'Existing record overwritten successfully!', type: 'success' });
      } else {
        const copy = buildBorewellRecord(undefined, true);
        await addBorewell(copy);
        addToast({ message: 'Saved as a new record copy.', type: 'success' });
      }
      navigate('/');
    } catch (err: any) {
      console.error(err);
      addToast({ message: err.message || 'Failed to resolve duplicate.', type: 'error' });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-sf-surface-2 border border-sf-border text-txt-secondary hover:text-txt-primary rounded-lg transition-all cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-txt-primary">Create New Borewell Record</h1>
          <p className="text-2xs text-txt-muted">Fields marked with * are mandatory</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="sf-panel p-6 space-y-6 shadow-sf">
          <BasicInfoSection formData={formData} onChange={handleChange} errors={errors} touched={touched} />
          <AddressSection
            formData={formData}
            onChange={handleChange}
            onGeocode={handleGeocode}
            geocoding={geocoding}
            errors={errors}
            touched={touched}
          />
          <LocationSection formData={formData} onChange={handleChange} errors={errors} touched={touched} />
          <BorewellInfoSection formData={formData} onChange={handleChange} errors={errors} touched={touched} />
          <AdditionalInfoSection formData={formData} onChange={handleChange} onPhotoAdd={handlePhotoAdd} errors={errors} touched={touched} />
        </div>

        {/* Submit Bar */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="sf-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="sf-btn-primary"
          >
            <Save size={16} />
            <span>Save Record</span>
          </button>
        </div>
      </form>

      {/* Duplicate Modal Dialog */}
      {duplicateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-sf-surface border border-sf-border rounded-xl p-6 max-w-md w-full shadow-sf space-y-4 select-none">
            <h3 className="text-base font-bold text-txt-primary flex items-center gap-2">
              <AlertTriangle className="text-warning" size={20} />
              <span>Duplicate Record Detected</span>
            </h3>
            <p className="text-xs text-txt-secondary leading-relaxed">
              A borewell record with the ID <strong className="text-txt-primary">"{formData.borewellId}"</strong> already exists in project <strong className="text-txt-primary">"{formData.project}"</strong> on the date <strong className="text-txt-primary">{formData.date}</strong>.
            </p>
            <p className="text-2xs text-txt-muted">
              Choose "Overwrite" to update the existing record on disk, "Keep Both" to save it as a separate record, or "Cancel" to abort.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDuplicateModal(null)}
                className="sf-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDuplicateResolve('overwrite')}
                className="sf-btn-secondary text-warning border-warning/35 hover:bg-warning/10"
              >
                Overwrite Existing
              </button>
              <button
                type="button"
                onClick={() => handleDuplicateResolve('keep_both')}
                className="sf-btn-primary"
              >
                Keep Both (Copy)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default NewBorewellPage;
