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
import { Save, ArrowLeft, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { parse as parseExif } from 'exifr';
import type { Borewell } from '@/shared/types';
import { SCAN_KEYWORDS } from '@/shared/constants';
import { BorewellProfileDrawing } from '@/components/ui/BorewellProfileDrawing';

export function NewBorewellPage() {
  const navigate = useNavigate();
  const addBorewell = useBorewellStore((s) => s.addBorewell);
  const updateBorewell = useBorewellStore((s) => s.updateBorewell);
  const addToast = useUIStore((s) => s.addToast);

  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [parsedStrata, setParsedStrata] = useState<any[]>([]);
  const [parsedPipes, setParsedPipes] = useState<any[]>([]);
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

  // States for interactive selection & hover highlights of parsed preview strata/pipes
  const [previewHoverStrata, setPreviewHoverStrata] = useState<string | null>(null);
  const [previewHoverPipe, setPreviewHoverPipe] = useState<string | null>(null);
  const [previewSelectedEntity, setPreviewSelectedEntity] = useState<{ type: 'strata' | 'pipe'; id: string } | null>(null);

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
      case 'latitude': {
        if (value === '' || value === null || value === undefined) {
          return 'Latitude is a mandatory field.';
        }
        const lat = Number(value);
        if (isNaN(lat) || lat < -90 || lat > 90) return 'Latitude must be a valid number between -90 and 90 degrees.';
        return '';
      }
      case 'longitude': {
        if (value === '' || value === null || value === undefined) {
          return 'Longitude is a mandatory field.';
        }
        const lng = Number(value);
        if (isNaN(lng) || lng < -180 || lng > 180) return 'Longitude must be a valid number between -180 and 180 degrees.';
        return '';
      }
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

  const parseTableFromExcel = (rows: any[][], materialsList: any[]) => {
    const strata: any[] = [];
    const pipes: any[] = [];
    
    let currentStartDepth = 0;
    let startRowIndex = -1;
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const endVal = parseFloat(row[1]);
      const materialVal = String(row[3] || '').trim();
      if (!isNaN(endVal) && endVal > 0 && materialVal !== '') {
        startRowIndex = i;
        break;
      }
    }
    
    if (startRowIndex === -1) {
      return { strata, pipes };
    }
    
    for (let i = startRowIndex; i < rows.length; i++) {
      const row = rows[i] || [];
      const endVal = parseFloat(row[1]);
      const materialVal = String(row[3] || '').trim();
      
      if (isNaN(endVal) || materialVal === '') {
        continue;
      }
      
      if (endVal <= currentStartDepth) {
        continue;
      }
      
      let resolvedMaterial = materialVal;
      let color = '#8D6E63';
      let pattern = 'solid';
      
      const found = materialsList.find(m => m.name.toLowerCase() === materialVal.toLowerCase());
      if (found) {
        resolvedMaterial = found.name;
        color = found.color;
        pattern = found.pattern;
      } else {
        if (materialVal.toLowerCase().includes('sand')) {
          color = '#E0C097';
          pattern = 'dots';
        } else if (materialVal.toLowerCase().includes('rock') || materialVal.toLowerCase().includes('stone')) {
          color = '#616161';
          pattern = 'diagonal';
        } else if (materialVal.toLowerCase().includes('gravel')) {
          color = '#9E9E9E';
          pattern = 'circles';
        }
      }
      
      strata.push({
        id: crypto.randomUUID(),
        borewellId: '',
        startDepth: currentStartDepth,
        endDepth: endVal,
        material: resolvedMaterial,
        color,
        pattern,
        remarks: ''
      });
      
      const col4Val = String(row[4] || '').trim();
      const col5Val = String(row[5] || '').trim();
      const pipeStr = (col4Val || col5Val).toLowerCase();
      
      if (pipeStr !== '') {
        let pipeType: 'plain' | 'slotted' | null = null;
        if (pipeStr.includes('plain') || pipeStr.includes('pipe') || pipeStr.includes('casing')) {
          pipeType = 'plain';
        }
        if (pipeStr.includes('screen') || pipeStr.includes('slot') || pipeStr.includes('ribbed') || pipeStr.includes('filter')) {
          pipeType = 'slotted';
        }
        
        if (pipeType) {
          pipes.push({
            id: crypto.randomUUID(),
            borewellId: '',
            startDepth: currentStartDepth,
            endDepth: endVal,
            pipeType
          });
        }
      }
      
      currentStartDepth = endVal;
    }
    
    return { strata, pipes };
  };

  const scanMetadataFromExcel = (cells: Record<string, { v: any; w: string }>, parsedStrataLayers?: any[]) => {
    const newFormData = { ...formData };
    
    const parseCustomDate = (dateStr: string): string | null => {
      const clean = dateStr.trim();
      const match = clean.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
      if (match) {
        let day = parseInt(match[1], 10);
        let month = parseInt(match[2], 10);
        let year = parseInt(match[3], 10);
        if (year < 100) year += 2000;
        if (month > 12 && day <= 12) {
          const temp = day;
          day = month;
          month = temp;
        }
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
      const matchIso = clean.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
      if (matchIso) {
        const year = parseInt(matchIso[1], 10);
        const month = parseInt(matchIso[2], 10);
        const day = parseInt(matchIso[3], 10);
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      const parsed = Date.parse(clean);
      if (!isNaN(parsed)) {
        return new Date(parsed).toISOString().split('T')[0];
      }
      return null;
    };

    // Extract values from cells by scanning for keyword/regex patterns
    Object.entries(cells).forEach(([key, cellObj]) => {
      if (!cellObj || !cellObj.w) return;
      const cellText = cellObj.w.trim();

      // 1. Water Level
      const wlMatch = cellText.match(/(?:water\s*level|swl)\s*(?:depth)?\s*[:=]\s*([0-9.]+)/i);
      if (wlMatch) {
        newFormData.waterLevel = wlMatch[1];
      }

      // 2. Bore Dia & Total Depth
      const bdMatch = cellText.match(/bore\s*(?:dia|diameter)\s*[:=]\s*([0-9.]+)/i);
      if (bdMatch) {
        newFormData.boreDia = bdMatch[1];
        
        const tdMatch = cellText.match(/\/[-/\s]*([0-9.]+)\s*(?:ft|feet|m|meter)/i);
        if (tdMatch) {
          newFormData.totalDepth = tdMatch[1];
        }
      }

      // 3. Pipe Casing Diameter
      const pdMatch = cellText.match(/(?:tube\s*well|pipe\s*dia|casing\s*dia|casing\s*diameter|pipe\s*diameter)\s*[:=]\s*([0-9.]+)/i);
      if (pdMatch) {
        newFormData.pipeDia = pdMatch[1];
      }

      // 4. Date
      const dateMatch = cellText.match(/date\s*[:=]\s*([0-9\-/.]+)/i);
      if (dateMatch) {
        const parsedDate = parseCustomDate(dateMatch[1]);
        if (parsedDate) {
          newFormData.date = parsedDate;
        }
      }
    });

    // 5. Look for Site Name, Address, and City
    Object.entries(cells).forEach(([key, cellObj]) => {
      if (!cellObj || !cellObj.w) return;
      const cellTextLower = cellObj.w.toLowerCase().trim();
      const match = key.match(/^([A-Z]+)([0-9]+)$/);
      if (!match) return;

      const col = match[1];
      const row = parseInt(match[2], 10);

      if (cellTextLower === 'site:' || cellTextLower === 'site') {
        const siteNameCell = cells[`${col}${row + 1}`];
        const addressCell = cells[`${col}${row + 2}`];
        const cityCell = cells[`${col}${row + 3}`];

        if (siteNameCell && siteNameCell.w.trim() !== '') {
          const ownerNameVal = siteNameCell.w.trim();
          newFormData.ownerName = ownerNameVal;
          
          if (!newFormData.borewellId || newFormData.borewellId.trim() === '') {
            newFormData.borewellId = ownerNameVal;
          }
          if (!newFormData.project || newFormData.project.trim() === '' || newFormData.project === 'Default Project') {
            newFormData.project = ownerNameVal;
          }
        }

        if (addressCell && addressCell.w.trim() !== '') {
          newFormData.area = addressCell.w.trim();
        }

        if (cityCell && cityCell.w.trim() !== '') {
          newFormData.city = cityCell.w.trim().replace(/\.$/, '');
        }

        if (newFormData.area && newFormData.city) {
          newFormData.address = `${newFormData.area}, ${newFormData.city}`;
        } else if (newFormData.area) {
          newFormData.address = newFormData.area;
        } else if (newFormData.city) {
          newFormData.address = newFormData.city;
        }
      }
    });

    // Fallback keyword scanning
    if (!newFormData.ownerName || !newFormData.city) {
      const colLetterToNum = (val: string): number => {
        let num = 0;
        for (let i = 0; i < val.length; i++) {
          num = num * 26 + (val.charCodeAt(i) - 64);
        }
        return num - 1;
      };

      const numToColLetter = (num: number): string => {
        let temp = '';
        let idx = num;
        while (idx >= 0) {
          temp = String.fromCharCode((idx % 26) + 65) + temp;
          idx = Math.floor(idx / 26) - 1;
        }
        return temp;
      };

      const assignedFields: Record<string, boolean> = {};

      Object.entries(cells).forEach(([key, cellObj]) => {
        const cellText = cellObj.w.toLowerCase().trim();
        const match = key.match(/^([A-Z]+)([0-9]+)$/);
        if (!match) return;

        const col = match[1];
        const row = parseInt(match[2], 10);

        Object.entries(SCAN_KEYWORDS).forEach(([field, keywords]) => {
          if (assignedFields[field]) return;

          const isMatch = keywords.some(kw => 
            cellText === kw || 
            cellText.startsWith(kw + ':') || 
            cellText.startsWith(kw + ' :') ||
            cellText.startsWith(kw + '-') ||
            cellText.startsWith(kw + ' -')
          );

          if (isMatch) {
            const rightColNum = colLetterToNum(col) + 1;
            const rightCellKey = `${numToColLetter(rightColNum)}${row}`;
            const belowCellKey = `${col}${row + 1}`;

            let targetValue = '';
            if (cells[rightCellKey] && String(cells[rightCellKey].v || '').trim() !== '') {
              targetValue = String(cells[rightCellKey].v);
            } else if (cells[belowCellKey] && String(cells[belowCellKey].v || '').trim() !== '') {
              targetValue = String(cells[belowCellKey].v);
            }

            if (targetValue) {
              if (field === 'borewellId' && !newFormData.borewellId) newFormData.borewellId = targetValue;
              else if (field === 'project' && (!newFormData.project || newFormData.project === 'Default Project')) newFormData.project = targetValue;
              else if (field === 'ownerName' && !newFormData.ownerName) newFormData.ownerName = targetValue;
              else if (field === 'city' && !newFormData.city) newFormData.city = targetValue;
              else if (field === 'address' && !newFormData.address) newFormData.address = targetValue;
              else if (field === 'latitude' && !newFormData.latitude) newFormData.latitude = targetValue;
              else if (field === 'longitude' && !newFormData.longitude) newFormData.longitude = targetValue;
              else if (field === 'totalDepth' && !newFormData.totalDepth) newFormData.totalDepth = targetValue;
              else if (field === 'waterLevel' && !newFormData.waterLevel) newFormData.waterLevel = targetValue;
              else if (field === 'remarks' && !newFormData.remarks) newFormData.remarks = targetValue;
              else if (field === 'date' && !newFormData.date) {
                const parsedDate = parseCustomDate(targetValue);
                if (parsedDate) {
                  newFormData.date = parsedDate;
                } else {
                  newFormData.date = targetValue;
                }
              }
              assignedFields[field] = true;
            }
          }
        });
      });
    }

    if (parsedStrataLayers && parsedStrataLayers.length > 0) {
      const maxEndDepth = Math.max(...parsedStrataLayers.map(l => l.endDepth));
      if (maxEndDepth > 0 && (!newFormData.totalDepth || parseFloat(String(newFormData.totalDepth)) === 0 || String(newFormData.totalDepth).trim() === '')) {
        newFormData.totalDepth = maxEndDepth;
      }
    }

    setFormData(newFormData);

    const newErrors = { ...errors };
    Object.keys(newFormData).forEach((key) => {
      const err = validateField(key, (newFormData as any)[key]);
      newErrors[key] = err;
    });
    setErrors(newErrors);
  };

  const handleFileAttachClick = async () => {
    try {
      const res = await window.api.dialog.openFile({
        title: 'Select Reference Document',
        properties: ['openFile'],
        filters: [{ name: 'Reference Documents', extensions: ['xlsx', 'xls', 'pdf'] }]
      });

      if (res.canceled || res.filePaths.length === 0) return;
      const filePath = res.filePaths[0];
      const fileName = filePath.split(/[\\/]/).pop() || 'document';
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

      const customFile = {
        name: fileName,
        path: filePath,
        size: 0
      };

      setAttachedFile(customFile as any);

      if (isExcel) {
        try {
          addToast({ message: 'Parsing attached Excel sheet...', type: 'info' });
          const result = await window.api.db.parseExcel(filePath);
          if (result && result.cells) {
            const materialsList = useBorewellStore.getState().materials;
            const { strata, pipes } = parseTableFromExcel(result.rows || [], materialsList);
            setParsedStrata(strata);
            setParsedPipes(pipes);
            scanMetadataFromExcel(result.cells, strata);
            addToast({ message: 'Auto-filled form fields and parsed strata/casing profiles!', type: 'success' });
          }
        } catch (err: any) {
          console.error('Failed to parse Excel reference:', err);
          addToast({ message: `Reference attachment loaded, but failed to auto-fill fields: ${err?.message || String(err)}`, type: 'warning' });
        }
      } else {
        addToast({ message: `Attached reference document: ${fileName}`, type: 'success' });
      }
    } catch (err) {
      console.error('Failed to trigger open file dialog:', err);
      addToast({ message: 'Failed to open file selector dialog.', type: 'error' });
    }
  };

  const handleFileRemove = () => {
    setAttachedFile(null);
    setParsedStrata([]);
    setParsedPipes([]);
    addToast({ message: 'Removed attached reference document.', type: 'info' });
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
        const newRecord = buildBorewellRecord();
        await addBorewell(newRecord);
        if (parsedStrata.length > 0) {
          const strataToSave = parsedStrata.map(s => ({ ...s, borewellId: newRecord.id }));
          await window.api.db.saveStrata(newRecord.id, strataToSave);
        }
        if (parsedPipes.length > 0) {
          const pipesToSave = parsedPipes.map(p => ({ ...p, borewellId: newRecord.id }));
          await window.api.db.savePipes(newRecord.id, pipesToSave);
        }
        if (attachedFile) {
          const isExcel = attachedFile.name.endsWith('.xlsx') || attachedFile.name.endsWith('.xls');
          const fileData = {
            excelPath: isExcel ? (attachedFile as any).path : null,
            pdfPath: !isExcel ? (attachedFile as any).path : null
          };
          await window.api.db.saveFiles(newRecord.id, fileData);
        }
        addToast({ message: 'Borewell record saved successfully!', type: 'success' });
        navigate('/borewells');
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
        if (parsedStrata.length > 0) {
          const strataToSave = parsedStrata.map(s => ({ ...s, borewellId: existing.id }));
          await window.api.db.saveStrata(existing.id, strataToSave);
        }
        if (parsedPipes.length > 0) {
          const pipesToSave = parsedPipes.map(p => ({ ...p, borewellId: existing.id }));
          await window.api.db.savePipes(existing.id, pipesToSave);
        }
        if (attachedFile) {
          const isExcel = attachedFile.name.endsWith('.xlsx') || attachedFile.name.endsWith('.xls');
          const fileData = {
            excelPath: isExcel ? (attachedFile as any).path : null,
            pdfPath: !isExcel ? (attachedFile as any).path : null
          };
          await window.api.db.saveFiles(existing.id, fileData);
        }
        addToast({ message: 'Existing record overwritten successfully!', type: 'success' });
      } else {
        const copy = buildBorewellRecord(undefined, true);
        await addBorewell(copy);
        if (parsedStrata.length > 0) {
          const strataToSave = parsedStrata.map(s => ({ ...s, borewellId: copy.id }));
          await window.api.db.saveStrata(copy.id, strataToSave);
        }
        if (parsedPipes.length > 0) {
          const pipesToSave = parsedPipes.map(p => ({ ...p, borewellId: copy.id }));
          await window.api.db.savePipes(copy.id, pipesToSave);
        }
        if (attachedFile) {
          const isExcel = attachedFile.name.endsWith('.xlsx') || attachedFile.name.endsWith('.xls');
          const fileData = {
            excelPath: isExcel ? (attachedFile as any).path : null,
            pdfPath: !isExcel ? (attachedFile as any).path : null
          };
          await window.api.db.saveFiles(copy.id, fileData);
        }
        addToast({ message: 'Saved as a new record copy.', type: 'success' });
      }
      navigate('/borewells');
    } catch (err: any) {
      console.error(err);
      addToast({ message: err.message || 'Failed to resolve duplicate.', type: 'error' });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form inputs */}
        <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-6">
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
            <AdditionalInfoSection
              formData={formData}
              onChange={handleChange}
              onPhotoAdd={handlePhotoAdd}
              onFileAttachClick={handleFileAttachClick}
              onFileRemove={handleFileRemove}
              attachedFile={attachedFile}
              errors={errors}
              touched={touched}
              parsedStrataCount={parsedStrata.length}
              parsedPipesCount={parsedPipes.length}
            />
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

        {/* Right Column: Live geological preview */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-6">
          <div className="sf-panel p-4 bg-sf-surface border border-sf-border shadow-sf space-y-3">
            <h3 className="text-xs font-bold text-txt-primary uppercase tracking-wider border-b border-sf-border pb-2">
              Parsed Geological Profile Preview
            </h3>
            {parsedStrata.length > 0 || parsedPipes.length > 0 ? (
              <div className="border border-sf-border bg-sf-base rounded-xl overflow-auto p-4 flex justify-center" style={{ height: '550px' }}>
                <BorewellProfileDrawing
                  borewell={{
                    totalDepth: Number(formData.totalDepth) || 250,
                    pipeDia: Number(formData.pipeDia) || 6,
                    waterLevel: formData.waterLevel !== '' ? Number(formData.waterLevel) : null,
                  }}
                  layers={parsedStrata}
                  pipes={parsedPipes}
                  scaleFactor={1.5}
                  hoveredStrataId={previewHoverStrata}
                  setHoveredStrataId={setPreviewHoverStrata}
                  hoveredPipeId={previewHoverPipe}
                  setHoveredPipeId={setPreviewHoverPipe}
                  selectedEntity={previewSelectedEntity}
                  setSelectedEntity={setPreviewSelectedEntity}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center border border-dashed border-sf-border rounded-xl p-8 text-center text-txt-muted min-h-[300px]">
                <FileSpreadsheet size={32} className="text-txt-muted opacity-40 mb-3" />
                <span className="text-2xs font-bold uppercase tracking-wider block mb-1">No Profile Loaded</span>
                <p className="text-3xs text-txt-muted max-w-[200px] leading-relaxed">
                  Attach an Excel template spreadsheet under "Additional Details" to parse and preview the CAD chart instantly.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

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
