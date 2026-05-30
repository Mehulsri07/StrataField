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
import { Save, ArrowLeft } from 'lucide-react';
import { parse as parseExif } from 'exifr';

export function NewBorewellPage() {
  const navigate = useNavigate();
  const addBorewell = useBorewellStore((s) => s.addBorewell);
  const addToast = useUIStore((s) => s.addToast);

  const [geocoding, setGeocoding] = useState(false);
  const [formData, setFormData] = useState({
    borewellId: '',
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
      // Offline fallback check
      if (!navigator.onLine) {
        throw new Error('Offline');
      }

      const result = await window.api.geocode.address(queryParts.join(', '));

      if (result) {
        setFormData((prev) => ({
          ...prev,
          latitude: result.latitude,
          longitude: result.longitude,
        }));
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.borewellId || !formData.ownerName || !formData.city) {
      addToast({ message: 'Please fill in all required fields.', type: 'error' });
      return;
    }

    const newId = crypto.randomUUID();
    const newBorewell = {
      id: newId,
      borewellId: formData.borewellId,
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
    };

    addBorewell(newBorewell);
    addToast({ message: 'Borewell record saved successfully!', type: 'success' });
    navigate('/');
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
          <BasicInfoSection formData={formData} onChange={handleChange} />
          <AddressSection
            formData={formData}
            onChange={handleChange}
            onGeocode={handleGeocode}
            geocoding={geocoding}
          />
          <LocationSection formData={formData} onChange={handleChange} />
          <BorewellInfoSection formData={formData} onChange={handleChange} />
          <AdditionalInfoSection formData={formData} onChange={handleChange} onPhotoAdd={handlePhotoAdd} />
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
    </div>
  );
}
export default NewBorewellPage;
