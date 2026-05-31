/**
 * ImportPage — Excel import wizard.
 * Digitizes spreadsheets into structured geological database records.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { 
  FileUp, Info, ArrowLeft, ArrowRight, Check, AlertTriangle, 
  FileSpreadsheet, RefreshCw, Eye 
} from 'lucide-react';
import type { Borewell, StrataLayer, PipeSegment } from '@/shared/types';
import { validateBorewell, validateStrata, validatePipeSegments } from '@/shared/validation';
import { SCAN_KEYWORDS, DEFAULT_PROJECT } from '@/shared/constants';

type ImportStep = 'upload' | 'mapping' | 'preview' | 'complete';

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

  // Coordinates Mapping State
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

  // Table Mapping State
  const [tableStartRow, setTableStartRow] = useState<number>(6); // 1-indexed, usually row 6
  const [columnMap, setColumnMap] = useState<ColumnMap>({
    startDepth: -1,
    endDepth: -1,
    material: -1,
    remarks: -1,
    pipeType: -1,
  });

  // Parsing Summary State
  const [parsedBorewell, setParsedBorewell] = useState<Borewell | null>(null);
  const [parsedStrata, setParsedStrata] = useState<StrataLayer[]>([]);
  const [parsedPipes, setParsedPipes] = useState<PipeSegment[]>([]);
  const [isDuplicate, setIsDuplicate] = useState<Borewell | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  // Math to get cell coordinates (A2 -> B2 or A3)
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

  // Keyword scanner to auto-scan sheet cells
  const scanMetadataKeywords = (cells: Record<string, { v: any; w: string }>) => {
    const updatedCoords = { ...coordsMap };

    // Search keys for keywords matching
    Object.entries(cells).forEach(([key, cellObj]) => {
      const cellText = cellObj.w.toLowerCase().trim();
      const match = key.match(/^([A-Z]+)([0-9]+)$/);
      if (!match) return;

      const col = match[1];
      const row = parseInt(match[2], 10);

      // Check all fields
      Object.entries(SCAN_KEYWORDS).forEach(([field, keywords]) => {
        const fieldKey = field as keyof CellCoords;
        // Skip if already assigned
        if (updatedCoords[fieldKey]) return;

        // Loosely check match
        const isMatch = keywords.some(kw => cellText === kw || cellText.startsWith(kw + ':') || cellText.startsWith(kw + ' :'));
        if (isMatch) {
          // Look right: column increment
          const rightColNum = colLetterToNum(col) + 1;
          const rightCellKey = `${numToColLetter(rightColNum)}${row}`;
          
          // Look below: row increment
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

  // Handle uploading and reading file
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        setSelectedFile(file);
        
        // Electron file input provides path property
        const fileLoc = (file as any).path || file.name;
        setFilePath(fileLoc);

        // Clear previous states before parsing new file
        setParsedBorewell(null);
        setParsedStrata([]);
        setParsedPipes([]);
        setValidationErrors([]);
        setIsDuplicate(null);

        try {
          // Parse file from SQLite parser
          const result = await window.api.db.parseExcel(fileLoc);
          setExcelCells(result.cells);
          setExcelRows(result.rows);

          // Auto-scan coordinates
          scanMetadataKeywords(result.cells);

          // Auto-guess columns from row index 5 (6th row)
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
            } else if (valStr.includes('pipe') || valStr.includes('casing') || valStr.includes('screen') || valStr.includes('assembly')) {
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

  // Compile data and run validation previews
  const handleConfirmMapping = async () => {
    // Clear previous parsed states at the start of a re-parse attempt
    setParsedBorewell(null);
    setParsedStrata([]);
    setParsedPipes([]);
    setValidationErrors([]);
    setIsDuplicate(null);

    // 1. Verify required coordinate mappings
    if (!coordsMap.borewellId || !coordsMap.ownerName || !coordsMap.city) {
      addToast({ message: 'Coordinates mapping for ID, Owner, and City are mandatory.', type: 'error' });
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

    // Parse values
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
      boreDia: 8, // default
      pipeDia: 6, // default
      totalDepth: depth,
      waterLevel: water,
      remarks: remarks,
      date: drillDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      importSource: selectedFile?.name || 'Excel Spreadsheet',
      importMethod: 'excel',
      deletedAt: null
    };

    // 2. Parse Strata & Pipes Table
    const errorsList: string[] = [];
    const layers: StrataLayer[] = [];
    const pipes: PipeSegment[] = [];

    // Table rows start from tableStartRow (1-indexed, so row index in array is tableStartRow - 1)
    const startIdx = tableStartRow - 1;
    const tableRows = excelRows.slice(startIdx);

    tableRows.forEach((row) => {
      // Skip empty or header rows
      if (!row || row.length === 0) return;
      const startVal = row[columnMap.startDepth];
      const endVal = row[columnMap.endDepth];
      const matVal = row[columnMap.material];

      if (startVal === undefined || endVal === undefined || matVal === undefined) return;
      
      const start = parseFloat(startVal);
      const end = parseFloat(endVal);
      const matName = String(matVal).trim();

      if (isNaN(start) || isNaN(end) || !matName) return;

      // idxLabel unused

      // Resolve material dictionary synonym
      let resolvedMaterial = matName;
      let matchedColor = '#8D6E63'; // default clay color
      let matchedPattern = 'solid';

      const found = materials.find(m => m.name.toLowerCase() === matName.toLowerCase());
      if (found) {
        resolvedMaterial = found.name;
        matchedColor = found.color;
        matchedPattern = found.pattern;
      } else {
        // Fallback guess color based on keywords
        if (matName.toLowerCase().includes('sand')) {
          matchedColor = '#E0C097';
          matchedPattern = 'dots';
        } else if (matName.toLowerCase().includes('rock')) {
          matchedColor = '#616161';
          matchedPattern = 'diagonal';
        } else if (matName.toLowerCase().includes('gravel')) {
          matchedColor = '#9E9E9E';
          matchedPattern = 'circles';
        }
      }

      layers.push({
        id: crypto.randomUUID(),
        borewellId: compiledBorewell.id,
        startDepth: start,
        endDepth: end,
        material: resolvedMaterial,
        color: matchedColor,
        pattern: matchedPattern,
        remarks: String(row[columnMap.remarks] || '')
      });

      // Parse optional Pipe Casing columns
      if (columnMap.pipeType !== -1 && row[columnMap.pipeType] !== undefined) {
        const pipeVal = String(row[columnMap.pipeType]).toLowerCase().trim();
        if (pipeVal !== '') {
          let pipeType: 'plain' | 'slotted' = 'plain';
          if (pipeVal.includes('slot') || pipeVal.includes('screen') || pipeVal.includes('filter')) {
            pipeType = 'slotted';
          }
          pipes.push({
            id: crypto.randomUUID(),
            borewellId: compiledBorewell.id,
            startDepth: start,
            endDepth: end,
            pipeType
          });
        }
      }
    });

    // 3. Execute validations on compiled records
    const bErrors = validateBorewell(compiledBorewell);
    errorsList.push(...bErrors);

    const sErrors = validateStrata(layers, depth);
    errorsList.push(...sErrors);

    const pErrors = validatePipeSegments(pipes, depth);
    errorsList.push(...pErrors);

    setValidationErrors(errorsList);
    setParsedBorewell(compiledBorewell);
    setParsedStrata(layers);
    setParsedPipes(pipes);

    // 4. Duplicate Check
    try {
      const duplicate = await window.api.db.checkDuplicate(compiledBorewell.borewellId, compiledBorewell.project, compiledBorewell.date);
      setIsDuplicate(duplicate);
    } catch (e) {
      console.error(e);
    }

    setStep('preview');
  };

  // Perform transaction import save with duplicate handling
  const handleSaveImport = async (overwriteId?: string) => {
    if (!parsedBorewell) return;
    setImporting(true);

    // Setup borewell for save
    const borewellData = { ...parsedBorewell };
    if (overwriteId) {
      borewellData.id = overwriteId;
      // Remap strata and pipe foreign keys to the overwritten ID
      parsedStrata.forEach(s => s.borewellId = overwriteId);
      parsedPipes.forEach(p => p.borewellId = overwriteId);
    }

    try {
      // Call transactional import save handler
      const result = await window.api.db.importSave({
        borewell: borewellData,
        strata: parsedStrata,
        pipes: parsedPipes
      });

      if (result.success) {
        addToast({ message: 'Excel borewell record imported successfully into database!', type: 'success' });
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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 select-none">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="p-2 hover:bg-sf-surface-2 border border-sf-border text-txt-secondary hover:text-txt-primary rounded-lg transition-all cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-txt-primary">Excel Geological Import Wizard</h1>
          <p className="text-2xs text-txt-muted">Automate spreadsheet parsing, column mapping, and transactional logging.</p>
        </div>
      </div>

      {/* Stepper progress indicator */}
      <div className="flex items-center justify-between border border-sf-border bg-sf-surface rounded-xl p-4 shadow-sf text-xs">
        {['Upload Excel', 'Map Headers & Table', 'Verify & Validate Preview', 'Finished'].map((label, idx) => {
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
      <div className="sf-panel p-6 min-h-[360px] flex flex-col justify-between shadow-sf relative">
        {importing && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center rounded-xl z-50">
            <RefreshCw className="animate-spin text-accent mb-3" size={32} />
            <span className="text-sm font-bold text-txt-primary">Importing data...</span>
            <span className="text-3xs text-txt-muted">Running transaction, rollbacks on error.</span>
          </div>
        )}

        {/* STEP 1: Upload */}
        {step === 'upload' && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-4 flex-1">
            <div className="p-5 bg-accent/10 text-accent rounded-full animate-pulse">
              <FileUp size={36} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-txt-primary">Upload Borewell Sheet</h3>
              <p className="text-2xs text-txt-secondary mt-1 max-w-sm">
                Select your hydrogeological Excel spreadsheet. Auto-scan will attempt to locate header values and geological strata tables automatically.
              </p>
            </div>
            <label className="sf-btn-primary mt-2">
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

        {/* STEP 2: Mapping Configuration */}
        {step === 'mapping' && selectedFile && (
          <div className="space-y-6 flex-1 text-xs">
            <div className="flex items-center gap-2 font-bold text-txt-primary pb-2 border-b border-sf-border">
              <FileSpreadsheet size={16} className="text-accent" />
              <span>Configure Header Mappings for: {selectedFile.name}</span>
            </div>
 
            {/* Validation errors list callout */}
            {validationErrors.length > 0 && (
              <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 flex gap-3 text-danger animate-fadeIn">
                <AlertTriangle className="flex-shrink-0 mt-0.5" size={18} />
                <div className="space-y-1">
                  <span className="font-bold block">Geological Data Integrity Violations from last parse:</span>
                  <ul className="list-disc pl-4 space-y-1 text-txt-secondary">
                    {validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                  <span className="text-2xs text-txt-muted block pt-1">
                    Adjust the mappings below to correct these errors, then re-parse.
                  </span>
                </div>
              </div>
            )}

            {/* Coordinates Mappers */}
            <div className="space-y-3">
              <div className="flex items-center gap-1 text-accent font-semibold uppercase tracking-wider text-2xs">
                <span>1. Header Cells (e.g. A2, B3)</span>
                <span className="text-txt-muted capitalize normal-case">(Auto-scanned matching keywords)</span>
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
                  <label className="sf-label">Total Drilled Depth (ft)</label>
                  <input
                    type="text"
                    value={coordsMap.totalDepth}
                    onChange={(e) => setCoordsMap({ ...coordsMap, totalDepth: e.target.value })}
                    className="sf-input mt-1 uppercase"
                    placeholder="e.g. B7"
                  />
                </div>
                <div>
                  <label className="sf-label">Water Level Depth (ft)</label>
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
                <div>
                  <label className="sf-label">Latitude</label>
                  <input
                    type="text"
                    value={coordsMap.latitude}
                    onChange={(e) => setCoordsMap({ ...coordsMap, latitude: e.target.value })}
                    className="sf-input mt-1 uppercase"
                    placeholder="e.g. B10"
                  />
                </div>
                <div>
                  <label className="sf-label">Longitude</label>
                  <input
                    type="text"
                    value={coordsMap.longitude}
                    onChange={(e) => setCoordsMap({ ...coordsMap, longitude: e.target.value })}
                    className="sf-input mt-1 uppercase"
                    placeholder="e.g. B11"
                  />
                </div>
                <div>
                  <label className="sf-label">Remarks / Description</label>
                  <input
                    type="text"
                    value={coordsMap.remarks}
                    onChange={(e) => setCoordsMap({ ...coordsMap, remarks: e.target.value })}
                    className="sf-input mt-1 uppercase"
                    placeholder="e.g. B12"
                  />
                </div>
              </div>
            </div>

            {/* Strata Table Columns Mappers */}
            <div className="space-y-3 pt-4 border-t border-sf-border">
              <div className="flex justify-between items-center text-accent font-semibold uppercase tracking-wider text-2xs">
                <span>2. Strata Table Mappings</span>
                <div className="flex items-center gap-1.5 font-normal text-txt-secondary normal-case">
                  <span>Strata data starts at Row:</span>
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
                setIsDuplicate(null);
                setStep('upload');
              }} className="sf-btn-secondary">
                Back
              </button>
              <button onClick={handleConfirmMapping} className="sf-btn-primary">
                <span>Parse Excel Template</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Preview and Integrity Check Reports */}
        {step === 'preview' && parsedBorewell && (
          <div className="space-y-6 flex-1 text-xs">
            
            {/* Header info */}
            <div className="flex justify-between items-start pb-2 border-b border-sf-border">
              <div>
                <h3 className="font-bold text-txt-primary text-sm flex items-center gap-1.5">
                  <Eye size={16} className="text-accent" />
                  <span>Verify Parsed Geological Data & Validation Status</span>
                </h3>
                <p className="text-3xs text-txt-secondary mt-0.5">Please review geocodes, strata limits, and layers sequence validation status.</p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-3xs font-semibold bg-sf-surface border border-sf-border py-1 px-3.5 rounded-lg text-txt-primary shadow-inner">
                  Rows Parsed: <span className="font-bold text-accent">{parsedStrata.length}</span>
                </span>
                <span className={`text-3xs font-bold py-1 px-3.5 rounded-lg border shadow-inner ${
                  validationErrors.length === 0 
                    ? 'bg-success/15 border-success/30 text-success' 
                    : 'bg-danger/10 border-danger/20 text-danger'
                }`}>
                  {validationErrors.length === 0 ? 'Data Integrity: VALID' : `Integrity Errors: ${validationErrors.length}`}
                </span>
              </div>
            </div>

            {/* Validation errors list callout */}
            {validationErrors.length > 0 && (
              <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 flex gap-3 text-danger animate-fadeIn">
                <AlertTriangle className="flex-shrink-0 mt-0.5" size={18} />
                <div className="space-y-1">
                  <span className="font-bold block">Geological Data Integrity Violations:</span>
                  <ul className="list-disc pl-4 space-y-1 text-txt-secondary">
                    {validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                  <span className="text-2xs text-txt-muted block pt-1">
                    You cannot save this imported record because data validation rules failed. Click 'Back' to adjust row mappings or row headers.
                  </span>
                </div>
              </div>
            )}

            {/* Duplicate detected alert overlay box */}
            {isDuplicate && (
              <div className="bg-warning/15 border border-warning/35 rounded-xl p-4 flex gap-3 text-warning animate-fadeIn">
                <AlertTriangle className="flex-shrink-0 mt-0.5" size={18} />
                <div className="space-y-1">
                  <span className="font-bold block">Duplicate Record Warn:</span>
                  <p className="text-txt-secondary leading-relaxed">
                    A record with ID <strong className="text-txt-primary">"{parsedBorewell.borewellId}"</strong> in project <strong className="text-txt-primary">"{parsedBorewell.project}"</strong> on date <strong className="text-txt-primary">{parsedBorewell.date}</strong> already exists in SQLite.
                  </p>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleSaveImport(isDuplicate.id)}
                      className="sf-btn-secondary text-warning border-warning/30 hover:bg-warning/10 text-2xs py-1 px-3"
                    >
                      Overwrite Existing
                    </button>
                    <button
                      onClick={() => handleSaveImport()}
                      className="sf-btn-primary text-2xs py-1 px-3"
                    >
                      Save as New Copy
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Record details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* metadata specs card */}
              <div className="md:col-span-1 sf-panel bg-sf-surface-2 border border-sf-border p-4 space-y-3">
                <h4 className="font-bold text-txt-primary border-b border-sf-border pb-1">Borewell Header Metadata</h4>
                <div className="space-y-2">
                  <div>
                    <span className="text-3xs text-txt-muted block uppercase tracking-wider">Owner Name</span>
                    <span className="text-xs font-semibold text-txt-primary">{parsedBorewell.ownerName}</span>
                  </div>
                  <div>
                    <span className="text-3xs text-txt-muted block uppercase tracking-wider">Record ID</span>
                    <span className="text-xs font-bold text-txt-primary">{parsedBorewell.borewellId}</span>
                  </div>
                  <div>
                    <span className="text-3xs text-txt-muted block uppercase tracking-wider">Project Name</span>
                    <span className="text-xs font-bold text-txt-primary">{parsedBorewell.project}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-3xs text-txt-muted block uppercase tracking-wider">City</span>
                      <span className="text-2xs text-txt-primary">{parsedBorewell.city}</span>
                    </div>
                    <div>
                      <span className="text-3xs text-txt-muted block uppercase tracking-wider">Total Depth</span>
                      <span className="text-2xs text-accent font-bold">{parsedBorewell.totalDepth ? `${parsedBorewell.totalDepth} ft` : 'N/A'}</span>
                    </div>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-sf-border text-4xs">
                    <div>Lat: {parsedBorewell.latitude || 'N/A'}</div>
                    <div>Lng: {parsedBorewell.longitude || 'N/A'}</div>
                  </div>
                </div>
              </div>

              {/* parsed strata table preview list */}
              <div className="md:col-span-2 sf-panel bg-sf-surface-2 border border-sf-border p-4 space-y-3">
                <h4 className="font-bold text-txt-primary border-b border-sf-border pb-1">Parsed Strata Layers Sequence</h4>
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-sf-border/30 text-txt-muted font-bold text-3xs uppercase tracking-wider">
                        <th className="py-1">Start (ft)</th>
                        <th>End (ft)</th>
                        <th>Material</th>
                        <th>Remarks</th>
                        <th>Pipe Casing</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sf-border/20">
                      {parsedStrata.map((s, idx) => {
                        const pipe = parsedPipes.find(p => p.startDepth === s.startDepth && p.endDepth === s.endDepth);
                        return (
                          <tr key={idx}>
                            <td className="py-1 font-mono text-3xs text-txt-primary">{s.startDepth} ft</td>
                            <td className="font-mono text-3xs text-txt-primary">{s.endDepth} ft</td>
                            <td className="font-semibold text-txt-primary">{s.material}</td>
                            <td className="text-txt-secondary leading-none">{s.remarks || '—'}</td>
                            <td>
                              {pipe ? (
                                <span className={`text-4xs font-bold px-1.5 py-0.5 rounded-full ${
                                  pipe.pipeType === 'slotted' ? 'bg-steel text-white' : 'bg-sf-surface-3 text-txt-secondary'
                                }`}>
                                  {pipe.pipeType}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-sf-border">
              <button onClick={() => setStep('mapping')} className="sf-btn-secondary">
                Edit Mapping
              </button>
              <button 
                onClick={() => handleSaveImport()}
                disabled={validationErrors.length > 0 || !!isDuplicate}
                className="sf-btn-primary"
              >
                <Check size={16} />
                <span>Confirm & Import to DB</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Complete */}
        {step === 'complete' && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-4 flex-1">
            <div className="p-5 bg-success/15 text-success rounded-full">
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
                setIsDuplicate(null);
                setStep('upload');
              }} className="sf-btn-secondary">
                Import Another File
              </button>
              <button onClick={() => navigate('/')} className="sf-btn-primary">
                Return to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Info card */}
      <div className="p-4 bg-sf-surface border border-sf-border rounded-xl flex gap-3 text-xs text-txt-secondary select-none">
        <Info size={18} className="text-info flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-txt-primary">Supported Excel Format:</span>
          <p className="leading-relaxed">
            StrataField reads generic Excel sheets and lets you map columns dynamically. For standard borewell formats, it automatically detects geological strata tables and builds layers.
          </p>
        </div>
      </div>
    </div>
  );
}
export default ImportPage;
