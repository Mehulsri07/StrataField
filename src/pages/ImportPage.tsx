/**
 * ImportPage — Excel import wizard.
 * Digitizes spreadsheets into structured geological database records.
 * Supports smart auto-parsing and interactive manual editing of records/strata before import.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { 
  FileUp, Info, ArrowLeft, ArrowRight, Check, AlertTriangle, 
  FileSpreadsheet, RefreshCw, Eye, Trash2, Plus, Drill, Ruler
} from 'lucide-react';
import type { Borewell, StrataLayer, PipeSegment, ParseAnomaly } from '@/shared/types';
import { validateBorewell, validateStrata, validatePipeSegments } from '@/shared/validation';
import { SCAN_KEYWORDS, DEFAULT_PROJECT, colLetterToNum, numToColLetter } from '@/shared/constants';
import { BorewellProfileDrawing } from '@/components/ui/BorewellProfileDrawing';

type ImportStep = 'upload' | 'mapping' | 'preview' | 'complete';
type PreviewTab = 'metadata' | 'strata' | 'pipes';

interface CellCoords {
  borewellId: string;
  project: string;
  ownerName: string;
  city: string;
  address: string;
  latitude: string;
  longitude: string;
  totalDepth: string;
  waterLevel: string;
  remarks: string;
  date: string;
}

interface ColumnMap {
  startDepth: number;
  endDepth: number;
  material: number;
  remarks: number;
  pipeType: number; // optional
}

export function ImportPage() {
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);
  const materials = useBorewellStore((s) => s.materials);
  const fetchMaterials = useBorewellStore((s) => s.fetchMaterials);

  // Wizard State
  const [step, setStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [, setFilePath] = useState<string>('');
  
  // Excel Cell Map & Rows
  const [excelCells, setExcelCells] = useState<Record<string, { v: any; w: string }>>({});
  const [excelRows, setExcelRows] = useState<any[][]>([]);

  // Coordinates Mapping State (Fallback Mode)
  const [coordsMap, setCoordsMap] = useState<CellCoords>({
    borewellId: '',
    project: '',
    ownerName: '',
    city: '',
    address: '',
    latitude: '',
    longitude: '',
    totalDepth: '',
    waterLevel: '',
    remarks: '',
    date: '',
  });

  // Table Mapping State (Fallback Mode)
  const [tableStartRow, setTableStartRow] = useState<number>(6);
  const [columnMap, setColumnMap] = useState<ColumnMap>({
    startDepth: -1,
    endDepth: -1,
    material: -1,
    remarks: -1,
    pipeType: -1,
  });

  // Smart Parser Anomalies State
  const [smartParseAnomalies, setSmartParseAnomalies] = useState<ParseAnomaly[]>([]);

  // Parsing Summary State
  const [parsedBorewell, setParsedBorewell] = useState<Borewell | null>(null);
  const [parsedStrata, setParsedStrata] = useState<StrataLayer[]>([]);
  const [parsedPipes, setParsedPipes] = useState<PipeSegment[]>([]);
  const [isDuplicate, setIsDuplicate] = useState<Borewell | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  // Preview step sub-tab
  const [previewTab, setPreviewTab] = useState<PreviewTab>('metadata');

  // States for interactive selection & hover highlights of parsed preview strata/pipes
  const [previewHoverStrata, setPreviewHoverStrata] = useState<string | null>(null);
  const [previewHoverPipe, setPreviewHoverPipe] = useState<string | null>(null);
  const [previewSelectedEntity, setPreviewSelectedEntity] = useState<{ type: 'strata' | 'pipe'; id: string } | null>(null);

  // States for inline custom material creation form in preview step
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [targetLayerIdx, setTargetLayerIdx] = useState<number | null>(null);
  const [customMatName, setCustomMatName] = useState('');
  const [customMatColor, setCustomMatColor] = useState('#8D6E63');
  const [customMatPattern, setCustomMatPattern] = useState('solid');
  const [customMatClass, setCustomMatClass] = useState('OTHER');
  const [customMatFamily, setCustomMatFamily] = useState('OTHER');

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  // Keyword scanner to auto-scan sheet cells for fallback manual mapping wizard
  const scanMetadataKeywords = (cells: Record<string, { v: any; w: string }>) => {
    const updatedCoords = { ...coordsMap };

    Object.entries(cells).forEach(([key, cellObj]) => {
      const cellText = cellObj.w.toLowerCase().trim();
      const match = key.match(/^([A-Z]+)([0-9]+)$/);
      if (!match) return;

      const col = match[1];
      const row = parseInt(match[2], 10);

      Object.entries(SCAN_KEYWORDS).forEach(([field, keywords]) => {
        const fieldKey = field as keyof CellCoords;
        if (updatedCoords[fieldKey]) return;

        const isMatch = keywords.some(kw => cellText === kw || cellText.startsWith(kw + ':') || cellText.startsWith(kw + ' :'));
        if (isMatch) {
          const rightColNum = colLetterToNum(col) + 1;
          const rightCellKey = `${numToColLetter(rightColNum)}${row}`;
          const belowCellKey = `${col}${row + 1}`;

          if (cells[rightCellKey] && cells[rightCellKey].w.trim() !== '') {
            updatedCoords[fieldKey] = rightCellKey;
          } else if (cells[belowCellKey] && cells[belowCellKey].w.trim() !== '') {
            updatedCoords[fieldKey] = belowCellKey;
          }
        }
      });
    });

    setCoordsMap(updatedCoords);
    addToast({ message: 'Auto-scan completed: Mapped common header cells.', type: 'info' });
  };

  // Handle uploading and reading file (first attempts Smart Auto-Parser)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        setSelectedFile(file);
        
        const fileLoc = (file as any).path || file.name;
        setFilePath(fileLoc);

        // Clear previous state
        setParsedBorewell(null);
        setParsedStrata([]);
        setParsedPipes([]);
        setValidationErrors([]);
        setIsDuplicate(null);
        setSmartParseAnomalies([]);
        setPreviewTab('metadata');

        try {
          // 1. Attempt smart auto-parsing first
          const smartResult = await window.api.db.smartParseExcel(fileLoc);
          
          if (smartResult.success && !smartResult.requiresManualReview) {
            // Build Borewell object from smart parser metadata
            const compiledBorewell: Borewell = {
              id: crypto.randomUUID(),
              borewellId: smartResult.metadata.ownerName ? `BW-${smartResult.metadata.ownerName.toUpperCase().replace(/[^A-Z0-9]/g, '-')}` : 'BW-IMPORTED',
              project: DEFAULT_PROJECT,
              ownerName: smartResult.metadata.ownerName || 'Imported Owner',
              houseNo: '',
              area: '',
              city: smartResult.metadata.city || 'Imported City',
              address: smartResult.metadata.address || '',
              latitude: null,
              longitude: null,
              boreDia: smartResult.metadata.boreDia || 8,
              pipeDia: smartResult.metadata.pipeDia || 6,
              totalDepth: smartResult.metadata.totalDepth,
              waterLevel: smartResult.metadata.waterLevel,
              remarks: '',
              date: smartResult.metadata.date || new Date().toISOString().split('T')[0],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              importSource: file.name,
              importMethod: 'excel',
              deletedAt: null,
              drillingMethod: 'UNKNOWN',
              depthUnit: smartResult.metadata.detectedUnit || 'ft',
            };

            // Map strata layers
            const layers: StrataLayer[] = smartResult.strata.map(s => ({
              id: crypto.randomUUID(),
              borewellId: compiledBorewell.id,
              startDepth: s.startDepth,
              endDepth: s.endDepth,
              material: s.material,
              materialId: s.materialId,
              color: s.color,
              pattern: s.pattern,
              remarks: '',
            }));

            // Map pipe segments
            const pipes: PipeSegment[] = smartResult.pipes.map(p => ({
              id: crypto.randomUUID(),
              borewellId: compiledBorewell.id,
              startDepth: p.startDepth,
              endDepth: p.endDepth,
              pipeType: p.pipeType,
              pipeSubtype: p.pipeSubtype || 'PLAIN',
            }));

            setParsedBorewell(compiledBorewell);
            setParsedStrata(layers);
            setParsedPipes(pipes);
            setSmartParseAnomalies(smartResult.anomalies);
            runValidation(compiledBorewell, layers, pipes);

            // Duplicate Check
            try {
              const duplicate = await window.api.db.checkDuplicate(compiledBorewell.borewellId, compiledBorewell.project, compiledBorewell.date);
              setIsDuplicate(duplicate);
            } catch (e) {
              console.error(e);
            }

            addToast({ message: 'Smart auto-parser successfully parsed standard template.', type: 'success' });
            setStep('preview');
            return;
          }

          // 2. Fall back to manual mapping if smart parse failed or requires review
          addToast({ message: 'Standard template layout not detected. Initializing manual column mapping wizard.', type: 'info' });
          const result = await window.api.db.parseExcel(fileLoc);
          setExcelCells(result.cells);
          setExcelRows(result.rows);

          if (smartResult.anomalies.length > 0) {
            setSmartParseAnomalies(smartResult.anomalies);
          }

          // Auto-scan coordinates
          scanMetadataKeywords(result.cells);

          // Auto-guess columns
          const guessHeaderRow = result.rows[5] || [];
          const guessedMap = { ...columnMap };
          guessHeaderRow.forEach((val: any, idx: number) => {
            const valStr = String(val).toLowerCase().trim();
            if (valStr.includes('start') || valStr.includes('from') || valStr === 'depth start') {
              guessedMap.startDepth = idx;
            } else if (valStr.includes('end') || valStr.includes('to') || valStr === 'depth end') {
              guessedMap.endDepth = idx;
            } else if (valStr.includes('material') || valStr.includes('soil') || valStr.includes('strata') || valStr.includes('type')) {
              guessedMap.material = idx;
            } else if (valStr.includes('remark') || valStr.includes('description') || valStr.includes('comment')) {
              guessedMap.remarks = idx;
            } else if (valStr.includes('pipe') || valStr.includes('casing') || valStr.includes('screen')) {
              guessedMap.pipeType = idx;
            }
          });
          setColumnMap(guessedMap);
          setStep('mapping');

        } catch (err) {
          console.error(err);
          addToast({ message: 'Failed to read Excel worksheet.', type: 'error' });
        }
      } else {
        addToast({ message: 'Invalid file format. Please upload an Excel sheet.', type: 'error' });
      }
    }
  };

  const getCellValue = (coord: string, defaultVal: any = null): any => {
    const clean = coord.trim().toUpperCase();
    return excelCells[clean] ? excelCells[clean].v : defaultVal;
  };

  // Run validation utility on the current preview records
  const runValidation = (b: Borewell, s: StrataLayer[], p: PipeSegment[]) => {
    const bErrors = validateBorewell(b);
    const sErrors = validateStrata(s, b.totalDepth);
    const pErrors = validatePipeSegments(p, b.totalDepth);
    setValidationErrors([...bErrors, ...sErrors, ...pErrors]);
  };

  // Compile data from manual mapping step
  const handleConfirmMapping = async () => {
    setParsedBorewell(null);
    setParsedStrata([]);
    setParsedPipes([]);
    setValidationErrors([]);
    setIsDuplicate(null);

    // Mappings validation
    if (!coordsMap.borewellId || !coordsMap.ownerName || !coordsMap.city) {
      addToast({ message: 'Mappings for ID, Owner, and City are mandatory.', type: 'error' });
      return;
    }

    if (columnMap.startDepth === -1 || columnMap.endDepth === -1 || columnMap.material === -1) {
      addToast({ message: 'Strata columns mapping (Start Depth, End Depth, and Material) are mandatory.', type: 'error' });
      return;
    }

    // Extract metadata values
    const bId = String(getCellValue(coordsMap.borewellId, '')).trim();
    const proj = String(getCellValue(coordsMap.project, DEFAULT_PROJECT)).trim() || DEFAULT_PROJECT;
    const owner = String(getCellValue(coordsMap.ownerName, '')).trim();
    const city = String(getCellValue(coordsMap.city, '')).trim();
    const address = String(getCellValue(coordsMap.address, '')).trim();
    const latRaw = getCellValue(coordsMap.latitude, null);
    const lngRaw = getCellValue(coordsMap.longitude, null);
    const depthRaw = getCellValue(coordsMap.totalDepth, null);
    const waterRaw = getCellValue(coordsMap.waterLevel, null);
    const remarks = String(getCellValue(coordsMap.remarks, '')).trim();
    const dateRaw = String(getCellValue(coordsMap.date, '')).trim();

    const lat = latRaw !== null ? parseFloat(latRaw) : null;
    const lng = lngRaw !== null ? parseFloat(lngRaw) : null;
    const depth = depthRaw !== null ? parseFloat(depthRaw) : null;
    const water = waterRaw !== null ? parseFloat(waterRaw) : null;

    let drillDate = dateRaw;
    if (dateRaw && !isNaN(Date.parse(dateRaw))) {
      drillDate = new Date(dateRaw).toISOString().split('T')[0];
    } else {
      drillDate = new Date().toISOString().split('T')[0];
    }

    const compiledBorewell: Borewell = {
      id: crypto.randomUUID(),
      borewellId: bId || 'BW-IMPORTED',
      project: proj,
      ownerName: owner || 'Imported Owner',
      houseNo: '',
      area: '',
      city: city || 'Imported City',
      address: address,
      latitude: lat,
      longitude: lng,
      boreDia: 8,
      pipeDia: 6,
      totalDepth: depth,
      waterLevel: water,
      remarks: remarks,
      date: drillDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      importSource: selectedFile?.name || 'Excel Spreadsheet',
      importMethod: 'excel',
      deletedAt: null,
      drillingMethod: 'UNKNOWN',
      depthUnit: 'ft', // default to feet on manual mapping
    };

    // Parse Strata & Pipes Table
    const layers: StrataLayer[] = [];
    const pipes: PipeSegment[] = [];
    const startIdx = tableStartRow - 1;
    const tableRows = excelRows.slice(startIdx);

    tableRows.forEach((row) => {
      if (!row || row.length === 0) return;
      const startVal = row[columnMap.startDepth];
      const endVal = row[columnMap.endDepth];
      const matVal = row[columnMap.material];

      if (startVal === undefined || endVal === undefined || matVal === undefined) return;
      
      const start = parseFloat(startVal);
      const end = parseFloat(endVal);
      const matName = String(matVal).trim();

      if (isNaN(start) || isNaN(end) || !matName) return;

      // Resolve material dictionary synonym
      let resolvedMaterial = matName;
      let matchedColor = '#8D6E63';
      let matchedPattern = 'solid';
      let matchedId: string | null = null;

      const found = materials.find(m => m.name.toLowerCase() === matName.toLowerCase());
      if (found) {
        resolvedMaterial = found.name;
        matchedColor = found.color;
        matchedPattern = found.pattern;
        matchedId = found.id;
      } else {
        if (matName.toLowerCase().includes('sand')) {
          matchedColor = '#D4B862';
          matchedPattern = 'dots';
          matchedId = 'medium_sand';
        } else if (matName.toLowerCase().includes('clay')) {
          matchedColor = '#8D6E63';
          matchedPattern = 'solid';
          matchedId = 'clay';
        } else if (matName.toLowerCase().includes('gravel')) {
          matchedColor = '#B0BEC5';
          matchedPattern = 'circles';
          matchedId = 'gravel';
        }
      }

      layers.push({
        id: crypto.randomUUID(),
        borewellId: compiledBorewell.id,
        startDepth: start,
        endDepth: end,
        material: resolvedMaterial,
        materialId: matchedId,
        color: matchedColor,
        pattern: matchedPattern,
        remarks: String(row[columnMap.remarks] || '')
      });

      // Parse optional Casing Pipe
      if (columnMap.pipeType !== -1 && row[columnMap.pipeType] !== undefined) {
        const pipeVal = String(row[columnMap.pipeType]).toLowerCase().trim();
        if (pipeVal !== '') {
          let pipeType: 'plain' | 'slotted' = 'plain';
          let pipeSubtype: any = 'PLAIN';
          if (pipeVal.includes('slot') || pipeVal.includes('screen') || pipeVal.includes('filter') || pipeVal.includes('ribbed')) {
            pipeType = 'slotted';
            pipeSubtype = 'RIBBED_SCREEN';
          }
          pipes.push({
            id: crypto.randomUUID(),
            borewellId: compiledBorewell.id,
            startDepth: start,
            endDepth: end,
            pipeType,
            pipeSubtype
          });
        }
      }
    });

    setParsedBorewell(compiledBorewell);
    setParsedStrata(layers);
    setParsedPipes(pipes);
    runValidation(compiledBorewell, layers, pipes);

    // Duplicate Check
    try {
      const duplicate = await window.api.db.checkDuplicate(compiledBorewell.borewellId, compiledBorewell.project, compiledBorewell.date);
      setIsDuplicate(duplicate);
    } catch (e) {
      console.error(e);
    }

    setStep('preview');
  };

  // Update Borewell metadata state
  const handleUpdateBorewell = (updates: Partial<Borewell>) => {
    if (!parsedBorewell) return;
    const nextBorewell = { ...parsedBorewell, ...updates };
    setParsedBorewell(nextBorewell);
    runValidation(nextBorewell, parsedStrata, parsedPipes);
  };

  // Add strata layer in preview step
  const handleAddStrataLayer = () => {
    if (!parsedBorewell) return;
    const lastLayer = parsedStrata[parsedStrata.length - 1];
    const start = lastLayer ? lastLayer.endDepth : 0;
    const end = start + 10;
    const defaultMat = materials[0] || { name: 'Sand', id: 'medium_sand', color: '#D4B862', pattern: 'dots' };
    
    const newLayer: StrataLayer = {
      id: crypto.randomUUID(),
      borewellId: parsedBorewell.id,
      startDepth: start,
      endDepth: end,
      material: defaultMat.name,
      materialId: defaultMat.id,
      color: defaultMat.color,
      pattern: defaultMat.pattern,
      remarks: '',
    };
    const nextStrata = [...parsedStrata, newLayer];
    setParsedStrata(nextStrata);
    runValidation(parsedBorewell, nextStrata, parsedPipes);
  };

  // Update strata layer in preview step
  const handleUpdateStrataLayer = (idx: number, updates: Partial<StrataLayer>) => {
    if (!parsedBorewell) return;
    const nextStrata = parsedStrata.map((s, i) => i === idx ? { ...s, ...updates } : s);
    setParsedStrata(nextStrata);
    runValidation(parsedBorewell, nextStrata, parsedPipes);
  };

  // Delete strata layer in preview step
  const handleDeleteStrataLayer = (idx: number) => {
    if (!parsedBorewell) return;
    const nextStrata = parsedStrata.filter((_, i) => i !== idx);
    setParsedStrata(nextStrata);
    runValidation(parsedBorewell, nextStrata, parsedPipes);
  };

  // Add pipe segment in preview step
  const handleAddPipeSegment = () => {
    if (!parsedBorewell) return;
    const lastPipe = parsedPipes[parsedPipes.length - 1];
    const start = lastPipe ? lastPipe.endDepth : 0;
    const end = start + 10;

    const newPipe: PipeSegment = {
      id: crypto.randomUUID(),
      borewellId: parsedBorewell.id,
      startDepth: start,
      endDepth: end,
      pipeType: 'plain',
      pipeSubtype: 'PLAIN',
    };
    const nextPipes = [...parsedPipes, newPipe];
    setParsedPipes(nextPipes);
    runValidation(parsedBorewell, parsedStrata, nextPipes);
  };

  // Update pipe segment in preview step
  const handleUpdatePipeSegment = (idx: number, updates: Partial<PipeSegment>) => {
    if (!parsedBorewell) return;
    const nextPipes = parsedPipes.map((p, i) => i === idx ? { ...p, ...updates } : p);
    setParsedPipes(nextPipes);
    runValidation(parsedBorewell, parsedStrata, nextPipes);
  };

  // Delete pipe segment in preview step
  const handleDeletePipeSegment = (idx: number) => {
    if (!parsedBorewell) return;
    const nextPipes = parsedPipes.filter((_, i) => i !== idx);
    setParsedPipes(nextPipes);
    runValidation(parsedBorewell, parsedStrata, nextPipes);
  };

  // Open the inline custom material popup from preview strata list
  const openCustomMaterialForm = (layerIdx: number, currentText: string) => {
    setTargetLayerIdx(layerIdx);
    setCustomMatName(currentText);
    setCustomMatColor('#8D6E63');
    setCustomMatPattern('solid');
    setCustomMatClass('OTHER');
    setCustomMatFamily('OTHER');
    setIsCreatingCustom(true);
  };

  // Create custom material and bind to the layer in preview
  const handleSaveCustomMaterial = async () => {
    if (!customMatName.trim() || targetLayerIdx === null) return;
    
    const newId = `custom_${customMatName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
    const newMat = {
      id: newId,
      name: customMatName.trim(),
      color: customMatColor,
      pattern: customMatPattern,
      isCustom: true,
      lithologyClass: customMatClass as any,
      lithologyFamily: customMatFamily as any,
    };

    try {
      await window.api.db.createMaterial(newMat);
      await fetchMaterials();
      
      // Update targeted strata layer in preview with new canonical material details
      handleUpdateStrataLayer(targetLayerIdx, {
        material: newMat.name,
        materialId: newMat.id,
        color: newMat.color,
        pattern: newMat.pattern,
      });

      setIsCreatingCustom(false);
      addToast({ message: `Custom material "${newMat.name}" created and applied inline!`, type: 'success' });
    } catch (err: any) {
      console.error(err);
      addToast({ message: `Failed to create custom material: ${err.message || String(err)}`, type: 'error' });
    }
  };

  // Perform transaction import save with duplicate handling
  const handleSaveImport = async (overwriteId?: string) => {
    if (!parsedBorewell) return;
    setImporting(true);

    const borewellData = { ...parsedBorewell };
    if (overwriteId) {
      borewellData.id = overwriteId;
      // Use map() — never mutate state arrays directly
      const remappedStrata = parsedStrata.map(s => ({ ...s, borewellId: overwriteId }));
      const remappedPipes  = parsedPipes.map(p => ({ ...p, borewellId: overwriteId }));
      setParsedStrata(remappedStrata);
      setParsedPipes(remappedPipes);
    }

    try {
      const result = await window.api.db.importSave({
        borewell: borewellData,
        strata: parsedStrata,
        pipes: parsedPipes
      });

      if (result.success) {
        addToast({ message: 'Excel borewell record imported successfully into SQLite!', type: 'success' });
        setStep('complete');
      } else {
        addToast({ message: 'Import failed due to database transaction rollback.', type: 'error' });
      }
    } catch (err: any) {
      console.error(err);
      addToast({ message: `Import transactional save failed: ${err.message || String(err)}`, type: 'error' });
    } finally {
      setImporting(false);
      setIsDuplicate(null);
    }
  };

  const unitLabel = parsedBorewell?.depthUnit || 'ft';

  return (
    <div className="p-6 max-w-[100rem] mx-auto space-y-6 select-none animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="p-2 hover:bg-sf-surface-2 border border-sf-border text-txt-secondary hover:text-txt-primary rounded-lg transition-all cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-txt-primary flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-accent" />
            <span>Excel Geological Import Studio</span>
          </h1>
          <p className="text-2xs text-txt-muted">Automate spreadsheet parsing with smart taxon matching, anomalies checker, and inline blueprint logs editor.</p>
        </div>
      </div>

      {/* Stepper progress indicator */}
      <div className="flex items-center justify-between border border-sf-border bg-sf-surface rounded-xl p-4 shadow-sf text-xs">
        {['Upload Excel', 'Map Headers & Table', 'Verify & Edit Blueprint', 'Finished'].map((label, idx) => {
          const stepKeys: ImportStep[] = ['upload', 'mapping', 'preview', 'complete'];
          const activeIndex = stepKeys.indexOf(step);
          const isActive = idx === activeIndex;
          const isDone = idx < activeIndex;

          return (
            <div key={idx} className="flex items-center gap-2">
              <div
                className={`
                  w-6 h-6 rounded-full flex items-center justify-center font-bold transition-all
                  ${isDone ? 'bg-success text-white' : isActive ? 'bg-accent text-white shadow-sf-glow' : 'bg-sf-surface-3 border border-sf-border text-txt-muted'}
                `}
              >
                {isDone ? <Check size={12} /> : idx + 1}
              </div>
              <span className={`font-semibold ${isActive ? 'text-txt-primary' : 'text-txt-secondary'}`}>
                {label}
              </span>
              {idx < 3 && <div className="w-12 h-px bg-sf-border mx-2 hidden md:block" />}
            </div>
          );
        })}
      </div>

      {/* Main wizard body */}
      <div className="sf-panel p-6 min-h-[420px] flex flex-col justify-between shadow-sf relative">
        {importing && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center rounded-xl z-50 animate-fade-in">
            <RefreshCw className="animate-spin text-accent mb-3" size={32} />
            <span className="text-sm font-bold text-txt-primary">Importing geological record...</span>
            <span className="text-3xs text-txt-muted">Executing transactional database sync.</span>
          </div>
        )}

        {/* STEP 1: Upload */}
        {step === 'upload' && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-4 flex-1">
            <div className="p-5 bg-accent/10 text-accent rounded-full animate-pulse">
              <FileUp size={36} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-txt-primary">Upload Hydrogeological Sheet</h3>
              <p className="text-2xs text-txt-secondary mt-1 max-w-sm">
                Select your drilling Excel log. The smart parser will check template headers, auto-configure units, map soil materials to the taxonomy dictionary, and scan for depth/interval anomalies.
              </p>
            </div>
            <label className="sf-btn-primary mt-2 cursor-pointer">
              <span>Choose spreadsheet (.xlsx / .xls)</span>
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* STEP 2: Fallback Manual Mapping Configuration */}
        {step === 'mapping' && selectedFile && (
          <div className="space-y-6 flex-1 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-sf-border">
              <div className="flex items-center gap-2 font-bold text-txt-primary">
                <FileSpreadsheet size={16} className="text-accent" />
                <span>Configure Manual Mapping: {selectedFile.name}</span>
              </div>
              {smartParseAnomalies.some(a => a.code === 'NON_STANDARD_FORMAT') && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-danger bg-danger/10 border border-danger/25 px-2.5 py-0.5 rounded-full">
                  <AlertTriangle size={11} /> Smart Parser: Non-Standard Layout
                </span>
              )}
            </div>
 
            {validationErrors.length > 0 && (
              <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 flex gap-3 text-danger animate-fadeIn">
                <AlertTriangle className="flex-shrink-0 mt-0.5" size={18} />
                <div className="space-y-1">
                  <span className="font-bold block">Geological Data Integrity Violations:</span>
                  <ul className="list-disc pl-4 space-y-1 text-txt-secondary text-3xs font-mono">
                    {validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Coordinates Mappers */}
            <div className="space-y-3">
              <div className="flex items-center gap-1 text-accent font-semibold uppercase tracking-wider text-2xs">
                <span>1. Header Cells (e.g. A2, B3)</span>
                <span className="text-txt-muted capitalize normal-case">(Locate metadata fields)</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="sf-label">Borewell Name / ID *</label>
                  <input
                    type="text"
                    value={coordsMap.borewellId}
                    onChange={(e) => setCoordsMap({ ...coordsMap, borewellId: e.target.value })}
                    className="sf-input mt-1 uppercase"
                    placeholder="e.g. B2"
                  />
                </div>
                <div>
                  <label className="sf-label">Project Name *</label>
                  <input
                    type="text"
                    value={coordsMap.project}
                    onChange={(e) => setCoordsMap({ ...coordsMap, project: e.target.value })}
                    className="sf-input mt-1 uppercase"
                    placeholder="e.g. B3"
                  />
                </div>
                <div>
                  <label className="sf-label">Owner Name *</label>
                  <input
                    type="text"
                    value={coordsMap.ownerName}
                    onChange={(e) => setCoordsMap({ ...coordsMap, ownerName: e.target.value })}
                    className="sf-input mt-1 uppercase"
                    placeholder="e.g. B4"
                  />
                </div>
                <div>
                  <label className="sf-label">City/District *</label>
                  <input
                    type="text"
                    value={coordsMap.city}
                    onChange={(e) => setCoordsMap({ ...coordsMap, city: e.target.value })}
                    className="sf-input mt-1 uppercase"
                    placeholder="e.g. B5"
                  />
                </div>
                <div>
                  <label className="sf-label">Address Location</label>
                  <input
                    type="text"
                    value={coordsMap.address}
                    onChange={(e) => setCoordsMap({ ...coordsMap, address: e.target.value })}
                    className="sf-input mt-1 uppercase"
                    placeholder="e.g. B6"
                  />
                </div>
                <div>
                  <label className="sf-label">Total Depth (ft)</label>
                  <input
                    type="text"
                    value={coordsMap.totalDepth}
                    onChange={(e) => setCoordsMap({ ...coordsMap, totalDepth: e.target.value })}
                    className="sf-input mt-1 uppercase"
                    placeholder="e.g. B7"
                  />
                </div>
                <div>
                  <label className="sf-label">Water Table Depth (ft)</label>
                  <input
                    type="text"
                    value={coordsMap.waterLevel}
                    onChange={(e) => setCoordsMap({ ...coordsMap, waterLevel: e.target.value })}
                    className="sf-input mt-1 uppercase"
                    placeholder="e.g. B8"
                  />
                </div>
                <div>
                  <label className="sf-label">Log Date</label>
                  <input
                    type="text"
                    value={coordsMap.date}
                    onChange={(e) => setCoordsMap({ ...coordsMap, date: e.target.value })}
                    className="sf-input mt-1 uppercase"
                    placeholder="e.g. B9"
                  />
                </div>
              </div>
            </div>

            {/* Strata Table Columns Mappers */}
            <div className="space-y-3 pt-4 border-t border-sf-border">
              <div className="flex justify-between items-center text-accent font-semibold uppercase tracking-wider text-2xs">
                <span>2. Strata Table Mappings</span>
                <div className="flex items-center gap-1.5 font-normal text-txt-secondary normal-case">
                  <span>Data starts at Row:</span>
                  <input
                    type="number"
                    min={1}
                    value={tableStartRow}
                    onChange={(e) => setTableStartRow(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-12 py-0.5 px-1 bg-sf-surface-2 border border-sf-border text-center rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="sf-label">Start Depth Column *</label>
                  <select
                    value={columnMap.startDepth}
                    onChange={(e) => setColumnMap({ ...columnMap, startDepth: parseInt(e.target.value) })}
                    className="sf-input mt-1"
                  >
                    <option value={-1}>-- Select Column --</option>
                    {(excelRows[tableStartRow - 2] || []).map((val, idx) => (
                      <option key={idx} value={idx}>Col {numToColLetter(idx)} ({String(val)})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="sf-label">End Depth Column *</label>
                  <select
                    value={columnMap.endDepth}
                    onChange={(e) => setColumnMap({ ...columnMap, endDepth: parseInt(e.target.value) })}
                    className="sf-input mt-1"
                  >
                    <option value={-1}>-- Select Column --</option>
                    {(excelRows[tableStartRow - 2] || []).map((val, idx) => (
                      <option key={idx} value={idx}>Col {numToColLetter(idx)} ({String(val)})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="sf-label">Soil / Material Column *</label>
                  <select
                    value={columnMap.material}
                    onChange={(e) => setColumnMap({ ...columnMap, material: parseInt(e.target.value) })}
                    className="sf-input mt-1"
                  >
                    <option value={-1}>-- Select Column --</option>
                    {(excelRows[tableStartRow - 2] || []).map((val, idx) => (
                      <option key={idx} value={idx}>Col {numToColLetter(idx)} ({String(val)})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="sf-label">Remarks Column</label>
                  <select
                    value={columnMap.remarks}
                    onChange={(e) => setColumnMap({ ...columnMap, remarks: parseInt(e.target.value) })}
                    className="sf-input mt-1"
                  >
                    <option value={-1}>-- Select Column --</option>
                    {(excelRows[tableStartRow - 2] || []).map((val, idx) => (
                      <option key={idx} value={idx}>Col {numToColLetter(idx)} ({String(val)})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="sf-label">Pipe lowering Column (Optional)</label>
                  <select
                    value={columnMap.pipeType}
                    onChange={(e) => setColumnMap({ ...columnMap, pipeType: parseInt(e.target.value) })}
                    className="sf-input mt-1"
                  >
                    <option value={-1}>-- Unmapped / None --</option>
                    {(excelRows[tableStartRow - 2] || []).map((val, idx) => (
                      <option key={idx} value={idx}>Col {numToColLetter(idx)} ({String(val)})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-sf-border">
              <button onClick={() => {
                setSelectedFile(null);
                setExcelCells({});
                setExcelRows([]);
                setParsedBorewell(null);
                setParsedStrata([]);
                setParsedPipes([]);
                setValidationErrors([]);
                setSmartParseAnomalies([]);
                setIsDuplicate(null);
                setStep('upload');
              }} className="sf-btn-secondary">
                Back
              </button>
              <button onClick={handleConfirmMapping} className="sf-btn-primary">
                <span>Process Excel Log</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Preview and Interactive Editor step */}
        {step === 'preview' && parsedBorewell && (
          <div className="space-y-6 flex-1 text-xs">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-2 border-b border-sf-border gap-2">
              <div>
                <h3 className="font-bold text-txt-primary text-sm flex items-center gap-1.5">
                  <Eye size={16} className="text-accent" />
                  <span>Interactive Verification & Blueprints Validation</span>
                </h3>
                <p className="text-3xs text-txt-secondary mt-0.5">Edit metadata, strata layers, and casing assemblies inline. Updates render instantly on the drawing chart.</p>
              </div>

              <div className="flex items-center gap-2.5">
                <span className={`text-[10px] font-bold py-1 px-3 rounded-lg border shadow-inner ${
                  validationErrors.length === 0 
                    ? 'bg-success/15 border-success/35 text-success' 
                    : 'bg-danger/10 border-danger/25 text-danger animate-pulse'
                }`}>
                  {validationErrors.length === 0 ? 'Data Integrity: VALID' : `Integrity Errors: ${validationErrors.length}`}
                </span>
              </div>
            </div>

            {/* Smart Parser Warnings list callout */}
            {smartParseAnomalies.length > 0 && (
              <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex gap-3 text-warning animate-fadeIn">
                <AlertTriangle className="flex-shrink-0 mt-0.5" size={18} />
                <div className="space-y-1">
                  <span className="font-bold block">Geological Observations & Warnings:</span>
                  <ul className="list-disc pl-4 space-y-1 text-txt-secondary text-3xs font-mono">
                    {smartParseAnomalies.map((err, idx) => (
                      <li key={idx} className={err.severity === 'critical' ? 'text-danger font-bold' : ''}>
                        {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Validation errors list callout */}
            {validationErrors.length > 0 && (
              <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 flex gap-3 text-danger animate-fadeIn">
                <AlertTriangle className="flex-shrink-0 mt-0.5" size={18} />
                <div className="space-y-1">
                  <span className="font-bold block">Geological Validation Errors:</span>
                  <ul className="list-disc pl-4 space-y-1 text-txt-secondary font-mono text-3xs">
                    {validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                  <span className="text-2xs text-txt-muted block pt-1">
                    Fix the issues in the tabs below before importing the record.
                  </span>
                </div>
              </div>
            )}

            {/* Duplicate detected alert overlay box */}
            {isDuplicate && (
              <div className="bg-warning/15 border border-warning/35 rounded-xl p-4 flex gap-3 text-warning animate-fadeIn">
                <AlertTriangle className="flex-shrink-0 mt-0.5" size={18} />
                <div className="space-y-1">
                  <span className="font-bold block">Duplicate Record Found in SQLite:</span>
                  <p className="text-txt-secondary leading-relaxed">
                    A record with ID <strong className="text-txt-primary">"{parsedBorewell.borewellId}"</strong> in project <strong className="text-txt-primary">"{parsedBorewell.project}"</strong> on date <strong className="text-txt-primary">{parsedBorewell.date}</strong> already exists.
                  </p>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleSaveImport(isDuplicate.id)}
                      className="sf-btn-secondary text-warning border-warning/30 hover:bg-warning/10 text-2xs py-1 px-3 cursor-pointer"
                    >
                      Overwrite Existing
                    </button>
                    <button
                      onClick={() => handleSaveImport()}
                      className="sf-btn-primary text-2xs py-1 px-3 cursor-pointer"
                    >
                      Save as New Copy
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Record details */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Left Column: tabbed blueprint log editor */}
              <div className="lg:col-span-7 space-y-4">
                
                {/* Tab Switcher */}
                <div className="flex border-b border-sf-border gap-1">
                  {(['metadata', 'strata', 'pipes'] as PreviewTab[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPreviewTab(t)}
                      className={`px-4 py-2 border-b-2 font-bold text-2xs uppercase tracking-wider transition-all cursor-pointer ${
                        previewTab === t 
                          ? 'border-accent text-accent' 
                          : 'border-transparent text-txt-secondary hover:text-txt-primary'
                      }`}
                    >
                      {t === 'metadata' ? 'Borewell Specs' : t === 'strata' ? `Strata Layers (${parsedStrata.length})` : `Pipe Assemblies (${parsedPipes.length})`}
                    </button>
                  ))}
                </div>

                {/* Sub-tab 1: Metadata specs editor form */}
                {previewTab === 'metadata' && (
                  <div className="sf-panel bg-sf-surface border border-sf-border p-4 space-y-4 animate-fade-in">
                    <h4 className="font-bold text-txt-primary border-b border-sf-border pb-1">Borewell Specs Blueprint</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="sf-label">Borewell Name / ID *</label>
                        <input
                          type="text"
                          value={parsedBorewell.borewellId}
                          onChange={(e) => handleUpdateBorewell({ borewellId: e.target.value })}
                          className="sf-input text-xs"
                        />
                      </div>
                      <div>
                        <label className="sf-label">Owner Name *</label>
                        <input
                          type="text"
                          value={parsedBorewell.ownerName}
                          onChange={(e) => handleUpdateBorewell({ ownerName: e.target.value })}
                          className="sf-input text-xs"
                        />
                      </div>
                      <div>
                        <label className="sf-label">Project Name *</label>
                        <input
                          type="text"
                          value={parsedBorewell.project}
                          onChange={(e) => handleUpdateBorewell({ project: e.target.value })}
                          className="sf-input text-xs"
                        />
                      </div>
                      <div>
                        <label className="sf-label">City *</label>
                        <input
                          type="text"
                          value={parsedBorewell.city}
                          onChange={(e) => handleUpdateBorewell({ city: e.target.value })}
                          className="sf-input text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-sf-border">
                      <div>
                        <label className="sf-label flex items-center gap-1.5">
                          <Drill size={13} className="text-txt-muted" /> Drilling Method
                        </label>
                        <select
                          value={parsedBorewell.drillingMethod || ''}
                          onChange={(e) => handleUpdateBorewell({ drillingMethod: e.target.value as any })}
                          className="sf-input text-xs"
                        >
                          <option value="UNKNOWN">UNKNOWN</option>
                          <option value="ROTARY">ROTARY</option>
                          <option value="DTH">DTH</option>
                          <option value="MANUAL">MANUAL</option>
                        </select>
                      </div>
                      <div>
                        <label className="sf-label flex items-center gap-1.5">
                          <Ruler size={13} className="text-txt-muted" /> Depth Unit
                        </label>
                        <div className="flex rounded-md border border-sf-border overflow-hidden mt-0.5">
                          {['ft', 'm'].map((u) => (
                            <button
                              key={u}
                              type="button"
                              onClick={() => handleUpdateBorewell({ depthUnit: u as any })}
                              className={`flex-1 py-1.5 text-3xs font-bold transition-all cursor-pointer ${
                                parsedBorewell.depthUnit === u 
                                  ? 'bg-accent text-white' 
                                  : 'bg-sf-surface-2 text-txt-secondary hover:bg-sf-surface-3'
                              }`}
                            >
                              {u === 'm' ? 'Meters (m)' : 'Feet (ft)'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-sf-border">
                      <div>
                        <label className="sf-label">Total Depth ({unitLabel})</label>
                        <input
                          type="number"
                          value={parsedBorewell.totalDepth || ''}
                          onChange={(e) => handleUpdateBorewell({ totalDepth: e.target.value !== '' ? Number(e.target.value) : null })}
                          className="sf-input text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="sf-label">Water Level ({unitLabel})</label>
                        <input
                          type="number"
                          value={parsedBorewell.waterLevel || ''}
                          onChange={(e) => handleUpdateBorewell({ waterLevel: e.target.value !== '' ? Number(e.target.value) : null })}
                          className="sf-input text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="sf-label">Bore Dia (in)</label>
                        <input
                          type="number"
                          value={parsedBorewell.boreDia || ''}
                          onChange={(e) => handleUpdateBorewell({ boreDia: e.target.value !== '' ? Number(e.target.value) : null })}
                          className="sf-input text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="sf-label">Casing Dia (in)</label>
                        <input
                          type="number"
                          value={parsedBorewell.pipeDia || ''}
                          onChange={(e) => handleUpdateBorewell({ pipeDia: e.target.value !== '' ? Number(e.target.value) : null })}
                          className="sf-input text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <label className="sf-label">Address Location</label>
                        <input
                          type="text"
                          value={parsedBorewell.address}
                          onChange={(e) => handleUpdateBorewell({ address: e.target.value })}
                          className="sf-input text-xs"
                        />
                      </div>
                      <div>
                        <label className="sf-label">Logging Date</label>
                        <input
                          type="date"
                          value={parsedBorewell.date}
                          onChange={(e) => handleUpdateBorewell({ date: e.target.value })}
                          className="sf-input text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="sf-label">Latitude</label>
                        <input
                          type="number"
                          step="any"
                          value={parsedBorewell.latitude || ''}
                          onChange={(e) => handleUpdateBorewell({ latitude: e.target.value !== '' ? Number(e.target.value) : null })}
                          className="sf-input text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="sf-label">Longitude</label>
                        <input
                          type="number"
                          step="any"
                          value={parsedBorewell.longitude || ''}
                          onChange={(e) => handleUpdateBorewell({ longitude: e.target.value !== '' ? Number(e.target.value) : null })}
                          className="sf-input text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="sf-label">General Technical Remarks</label>
                      <textarea
                        rows={3}
                        value={parsedBorewell.remarks}
                        onChange={(e) => handleUpdateBorewell({ remarks: e.target.value })}
                        className="sf-input text-xs"
                        placeholder="Drilling method notes, tools, and overall geological remarks..."
                      />
                    </div>
                  </div>
                )}

                {/* Sub-tab 2: Strata layers editor table */}
                {previewTab === 'strata' && (
                  <div className="sf-panel bg-sf-surface border border-sf-border p-4 space-y-4 animate-fade-in">
                    <div className="flex justify-between items-center border-b border-sf-border pb-2">
                      <span className="font-bold text-txt-primary">Edit Strata Sequence</span>
                      <button
                        type="button"
                        onClick={handleAddStrataLayer}
                        className="sf-btn-secondary py-1 px-3 flex items-center gap-1 text-3xs cursor-pointer"
                      >
                        <Plus size={11} />
                        <span>Add Layer</span>
                      </button>
                    </div>

                    <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                      {parsedStrata.length === 0 ? (
                        <div className="text-center py-8 text-txt-muted text-xs">No strata layers parsed yet. Click "+ Add Layer" to start manually.</div>
                      ) : (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-sf-border/30 text-txt-muted font-bold text-4xs uppercase tracking-wider">
                              <th className="py-1.5 w-1/6">Start ({unitLabel})</th>
                              <th className="py-1.5 w-1/6">End ({unitLabel})</th>
                              <th className="py-1.5 w-1/3">Material</th>
                              <th className="py-1.5 w-1/4">Remarks</th>
                              <th className="py-1.5 w-[50px] text-center">Delete</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-sf-border/20">
                            {parsedStrata.map((s, idx) => (
                              <tr key={s.id} className="hover:bg-sf-surface-2 transition-all">
                                <td className="py-2 pr-2">
                                  <input
                                    type="number"
                                    value={s.startDepth}
                                    onChange={(e) => handleUpdateStrataLayer(idx, { startDepth: Number(e.target.value) })}
                                    className="sf-input text-2xs py-1 px-1.5 font-mono text-center"
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <input
                                    type="number"
                                    value={s.endDepth}
                                    onChange={(e) => handleUpdateStrataLayer(idx, { endDepth: Number(e.target.value) })}
                                    className="sf-input text-2xs py-1 px-1.5 font-mono text-center"
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <div className="flex items-center gap-1">
                                    <select
                                      value={s.material}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '__create_custom_inline__') {
                                          openCustomMaterialForm(idx, s.material);
                                          return;
                                        }
                                        const mat = materials.find(m => m.name === val);
                                        if (mat) {
                                          handleUpdateStrataLayer(idx, {
                                            material: mat.name,
                                            materialId: mat.id,
                                            color: mat.color,
                                            pattern: mat.pattern
                                          });
                                        } else {
                                          handleUpdateStrataLayer(idx, { material: val });
                                        }
                                      }}
                                      className="sf-input text-2xs py-1 px-1.5"
                                    >
                                      {!materials.some(m => m.name === s.material) && (
                                        <option value={s.material}>{s.material} (unmapped)</option>
                                      )}
                                      {materials.map(m => (
                                        <option key={m.id} value={m.name}>
                                          {m.name} {m.lithologyFamily ? `[${m.lithologyFamily}]` : ''}
                                        </option>
                                      ))}
                                      <option value="__create_custom_inline__">+ Add Custom...</option>
                                    </select>
                                  </div>
                                </td>
                                <td className="py-2 pr-2">
                                  <input
                                    type="text"
                                    value={s.remarks || ''}
                                    onChange={(e) => handleUpdateStrataLayer(idx, { remarks: e.target.value })}
                                    className="sf-input text-2xs py-1 px-1.5"
                                    placeholder="Remarks"
                                  />
                                </td>
                                <td className="py-2 text-center">
                                  <button
                                    onClick={() => handleDeleteStrataLayer(idx)}
                                    className="p-1 hover:bg-danger/10 text-txt-muted hover:text-danger rounded transition-all cursor-pointer"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}

                {/* Sub-tab 3: Pipe segments editor table */}
                {previewTab === 'pipes' && (
                  <div className="sf-panel bg-sf-surface border border-sf-border p-4 space-y-4 animate-fade-in">
                    <div className="flex justify-between items-center border-b border-sf-border pb-2">
                      <span className="font-bold text-txt-primary">Edit Casing Assembly</span>
                      <button
                        type="button"
                        onClick={handleAddPipeSegment}
                        className="sf-btn-secondary py-1 px-3 flex items-center gap-1 text-3xs cursor-pointer"
                      >
                        <Plus size={11} />
                        <span>Add Segment</span>
                      </button>
                    </div>

                    <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                      {parsedPipes.length === 0 ? (
                        <div className="text-center py-8 text-txt-muted text-xs">No pipe casings mapped. Click "+ Add Segment" to start manually.</div>
                      ) : (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-sf-border/30 text-txt-muted font-bold text-4xs uppercase tracking-wider">
                              <th className="py-1.5 w-1/5">Start ({unitLabel})</th>
                              <th className="py-1.5 w-1/5">End ({unitLabel})</th>
                              <th className="py-1.5 w-1/4">Pipe Type</th>
                              <th className="py-1.5 w-1/4">Subtype</th>
                              <th className="py-1.5 w-[50px] text-center">Delete</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-sf-border/20">
                            {parsedPipes.map((p, idx) => (
                              <tr key={p.id} className="hover:bg-sf-surface-2 transition-all">
                                <td className="py-2 pr-2">
                                  <input
                                    type="number"
                                    value={p.startDepth}
                                    onChange={(e) => handleUpdatePipeSegment(idx, { startDepth: Number(e.target.value) })}
                                    className="sf-input text-2xs py-1 px-1.5 font-mono text-center"
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <input
                                    type="number"
                                    value={p.endDepth}
                                    onChange={(e) => handleUpdatePipeSegment(idx, { endDepth: Number(e.target.value) })}
                                    className="sf-input text-2xs py-1 px-1.5 font-mono text-center"
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <select
                                    value={p.pipeType}
                                    onChange={(e) => handleUpdatePipeSegment(idx, { pipeType: e.target.value as any })}
                                    className="sf-input text-2xs py-1 px-1.5"
                                  >
                                    <option value="plain">Plain Casing</option>
                                    <option value="slotted">Slotted Screen</option>
                                  </select>
                                </td>
                                <td className="py-2 pr-2">
                                  <select
                                    value={p.pipeSubtype || 'PLAIN'}
                                    onChange={(e) => handleUpdatePipeSegment(idx, { pipeSubtype: e.target.value as any })}
                                    className="sf-input text-2xs py-1 px-1.5"
                                  >
                                    <option value="PLAIN">PLAIN</option>
                                    <option value="RIBBED_SCREEN">RIBBED SCREEN</option>
                                    <option value="SLOTTED">SLOTTED</option>
                                    <option value="MS_SLOTTED">MS SLOTTED</option>
                                  </select>
                                </td>
                                <td className="py-2 text-center">
                                  <button
                                    onClick={() => handleDeletePipeSegment(idx)}
                                    className="p-1 hover:bg-danger/10 text-txt-muted hover:text-danger rounded transition-all cursor-pointer"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Dynamic drawing profile preview */}
              <div className="lg:col-span-5 space-y-3 lg:sticky lg:top-4">
                <div className="sf-panel bg-sf-surface-2 border border-sf-border p-4 space-y-3">
                  <h4 className="font-bold text-txt-primary border-b border-sf-border pb-1">Dynamic Design Preview</h4>
                  <div className="border border-sf-border bg-sf-base rounded-xl overflow-auto p-4 flex justify-center" style={{ height: '420px' }}>
                    <BorewellProfileDrawing
                      borewell={{
                        totalDepth: parsedBorewell.totalDepth || 250,
                        pipeDia: parsedBorewell.pipeDia || 6,
                        waterLevel: parsedBorewell.waterLevel,
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
                </div>
              </div>

            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-sf-border">
              <button onClick={() => setStep('mapping')} className="sf-btn-secondary">
                Back to Manual mapping
              </button>
              <button 
                onClick={() => handleSaveImport()}
                disabled={validationErrors.length > 0 || !!isDuplicate}
                className="sf-btn-primary"
              >
                <Check size={16} />
                <span>Save Record & Sync to DB</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Complete */}
        {step === 'complete' && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-4 flex-1">
            <div className="p-5 bg-success/15 text-success rounded-full animate-fade-in">
              <Check size={36} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-txt-primary">Import Process Complete</h3>
              <p className="text-2xs text-txt-secondary mt-1">
                Your Excel geological strata record has been safely parsed, validated, and saved into the SQLite database in one transaction.
              </p>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => {
                setSelectedFile(null);
                setExcelCells({});
                setExcelRows([]);
                setParsedBorewell(null);
                setParsedStrata([]);
                setParsedPipes([]);
                setValidationErrors([]);
                setSmartParseAnomalies([]);
                setIsDuplicate(null);
                setStep('upload');
              }} className="sf-btn-secondary cursor-pointer">
                Import Another File
              </button>
              <button onClick={() => navigate('/')} className="sf-btn-primary cursor-pointer">
                Return to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Inline custom material creation popup (Step 3 - Strata editor) */}
      {isCreatingCustom && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-sf-surface border border-sf-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-sf animate-scale-in">
            <div className="pb-2 border-b border-sf-border">
              <span className="font-bold text-txt-primary block text-sm">Add New Custom Material Inline</span>
              <p className="text-3xs text-txt-muted mt-0.5">Register a custom material in dictionary and bind it to this layer.</p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="sf-label">Material Name</label>
                <input
                  type="text"
                  value={customMatName}
                  onChange={(e) => setCustomMatName(e.target.value)}
                  className="sf-input text-xs"
                  placeholder="e.g. Fine Yellow Sand"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="sf-label">Hatch Color</label>
                  <input
                    type="color"
                    value={customMatColor}
                    onChange={(e) => setCustomMatColor(e.target.value)}
                    className="w-full h-8 rounded border border-sf-border cursor-pointer bg-transparent"
                  />
                </div>
                <div>
                  <label className="sf-label">Hatch Pattern</label>
                  <select
                    value={customMatPattern}
                    onChange={(e) => setCustomMatPattern(e.target.value)}
                    className="sf-input text-xs"
                  >
                    <option value="solid">Solid</option>
                    <option value="dots">Dots</option>
                    <option value="lines">Lines</option>
                    <option value="crosses">Crosses</option>
                    <option value="bricks">Bricks</option>
                    <option value="diagonal">Diagonal</option>
                    <option value="circles">Circles</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="sf-label">Lithology Class</label>
                  <select
                    value={customMatClass}
                    onChange={(e) => setCustomMatClass(e.target.value)}
                    className="sf-input text-xs"
                  >
                    <option value="OTHER">Other</option>
                    <option value="CLAY">Clay</option>
                    <option value="SILTY_CLAY">Silty Clay</option>
                    <option value="SANDY_CLAY">Sandy Clay</option>
                    <option value="SILT">Silt</option>
                    <option value="KANKAR">Kankar</option>
                    <option value="FINE_SAND">Fine Sand</option>
                    <option value="MEDIUM_SAND">Medium Sand</option>
                    <option value="COARSE_SAND">Coarse Sand</option>
                    <option value="YELLOW_SAND">Yellow Sand</option>
                    <option value="GRAVEL">Gravel</option>
                    <option value="SANDY_GRAVEL">Sandy Gravel</option>
                    <option value="FILL">Fill</option>
                    <option value="ROCK">Rock</option>
                  </select>
                </div>
                <div>
                  <label className="sf-label">Lithology Family</label>
                  <select
                    value={customMatFamily}
                    onChange={(e) => setCustomMatFamily(e.target.value)}
                    className="sf-input text-xs"
                  >
                    <option value="OTHER">Other</option>
                    <option value="CLAY">Clay</option>
                    <option value="SAND">Sand</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsCreatingCustom(false)}
                className="sf-btn-secondary py-1.5 px-3.5 text-2xs font-mono font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCustomMaterial}
                className="sf-btn-primary py-1.5 px-3.5 text-2xs font-mono font-bold cursor-pointer"
              >
                Register & Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info card */}
      <div className="p-4 bg-sf-surface border border-sf-border rounded-xl flex gap-3 text-xs text-txt-secondary select-none">
        <Info size={18} className="text-info flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-txt-primary">Supported Excel Formats:</span>
          <p className="leading-relaxed">
            Upload files matching the standard format to skip mapping entirely. If the file structure deviates, use the fallback manual mapping screen to link coordinates and strata tables.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ImportPage;
