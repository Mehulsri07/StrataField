import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { 
  ArrowLeft, Edit3, Trash2, AlertTriangle, 
  FileText, FileSpreadsheet, Image as ImageIcon, Eye, EyeOff, ExternalLink
} from 'lucide-react';
import type { StrataLayer, PipeSegment } from '@shared/types';
import { validateStrata, validatePipeSegments } from '@/shared/validation';
import { BorewellProfileDrawing } from '@/components/ui/BorewellProfileDrawing';
import { usePngExport } from '@/hooks/usePngExport';

export function BorewellDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const borewells = useBorewellStore((s) => s.borewells);
  const deleteBorewell = useBorewellStore((s) => s.deleteBorewell);
  const strataStore = useBorewellStore((s) => s.strataLayers);
  const pipeStore = useBorewellStore((s) => s.pipeSegments);
  const setStrataLayers = useBorewellStore((s) => s.setStrataLayers);
  const setPipeSegments = useBorewellStore((s) => s.setPipeSegments);
  const fetchStrata = useBorewellStore((s) => s.fetchStrata);
  const fetchPipes = useBorewellStore((s) => s.fetchPipes);
  const addToast = useUIStore((s) => s.addToast);

  const borewell = borewells.find((b) => b.id === id);
  const [isLoaded, setIsLoaded] = useState(false);

  // States for toolbar controls
  const [zoom, setZoom] = useState<'fit' | '50' | '100' | '200' | '1in_20ft' | '1in_40ft'>('fit');
  const [isPrintPreview, setIsPrintPreview] = useState(false);

  // States for interactive selection & hover highlights
  const [hoveredStrataId, setHoveredStrataId] = useState<string | null>(null);
  const [hoveredPipeId, setHoveredPipeId] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<{ type: 'strata' | 'pipe'; id: string } | null>(null);

  const layers = id ? strataStore[id] || [] : [];
  const pipes = id ? pipeStore[id] || [] : [];

  // Fetch strata and pipes from DB on mount/ID change
  useEffect(() => {
    async function loadData() {
      if (id) {
        setIsLoaded(false);
        await Promise.all([
          fetchStrata(id),
          fetchPipes(id),
        ]);
        setIsLoaded(true);
      }
    }
    loadData();
  }, [id, fetchStrata, fetchPipes]);

  // Auto-edit metadata if navigated from Borewells page with edit state
  useEffect(() => {
    if (location.state?.editMetadata && isLoaded && borewell) {
      handleEditMetadata();
    }
  }, [location.state, isLoaded, borewell]);

  const [attachedFile, setAttachedFile] = useState<any | null>(null);

  useEffect(() => {
    async function loadAttachedFiles() {
      if (id) {
        const fileRecord = await window.api.db.getFiles(id);
        setAttachedFile(fileRecord);
      }
    }
    loadAttachedFiles();
  }, [id]);

  // States for inline title block editing
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [metadataForm, setMetadataForm] = useState({
    project: '',
    ownerName: '',
    date: '',
    city: '',
    area: '',
    address: '',
    boreDia: '',
    pipeDia: '',
    totalDepth: '',
    waterLevel: '',
    remarks: '',
  });

  const handleEditMetadata = () => {
    if (!borewell) return;
    setMetadataForm({
      project: borewell.project || '',
      ownerName: borewell.ownerName || '',
      date: borewell.date || '',
      city: borewell.city || '',
      area: borewell.area || '',
      address: borewell.address || '',
      boreDia: borewell.boreDia !== null ? String(borewell.boreDia) : '',
      pipeDia: borewell.pipeDia !== null ? String(borewell.pipeDia) : '',
      totalDepth: borewell.totalDepth !== null ? String(borewell.totalDepth) : '',
      waterLevel: borewell.waterLevel !== null ? String(borewell.waterLevel) : '',
      remarks: borewell.remarks || '',
    });
    setIsEditingMetadata(true);
  };

  const handleSaveMetadata = async () => {
    if (!borewell) return;
    const updates = {
      project: metadataForm.project,
      ownerName: metadataForm.ownerName,
      date: metadataForm.date,
      city: metadataForm.city,
      area: metadataForm.area,
      address: metadataForm.address,
      boreDia: metadataForm.boreDia !== '' ? Number(metadataForm.boreDia) : null,
      pipeDia: metadataForm.pipeDia !== '' ? Number(metadataForm.pipeDia) : null,
      totalDepth: metadataForm.totalDepth !== '' ? Number(metadataForm.totalDepth) : null,
      waterLevel: metadataForm.waterLevel !== '' ? Number(metadataForm.waterLevel) : null,
      remarks: metadataForm.remarks,
    };

    const originalBorewell = { ...borewell };

    try {
      await useBorewellStore.getState().updateBorewell(borewell.id, updates);
      setIsEditingMetadata(false);
      addToast({ message: 'Title block blueprint metadata saved successfully.', type: 'success' });
    } catch (err: any) {
      console.error('Failed to update blueprint metadata:', err);
      addToast({ message: `Failed to save changes: ${err.message || String(err)}. Rolling back...`, type: 'error' });
      setMetadataForm({
        project: originalBorewell.project || '',
        ownerName: originalBorewell.ownerName || '',
        date: originalBorewell.date || '',
        city: originalBorewell.city || '',
        area: originalBorewell.area || '',
        address: originalBorewell.address || '',
        boreDia: originalBorewell.boreDia !== null ? String(originalBorewell.boreDia) : '',
        pipeDia: originalBorewell.pipeDia !== null ? String(originalBorewell.pipeDia) : '',
        totalDepth: originalBorewell.totalDepth !== null ? String(originalBorewell.totalDepth) : '',
        waterLevel: originalBorewell.waterLevel !== null ? String(originalBorewell.waterLevel) : '',
        remarks: originalBorewell.remarks || '',
      });
    }
  };

  const handleSeedDefaultData = async () => {
    if (!id || !borewell) return;
    const seedLayers: StrataLayer[] = [
      { id: `l1-${Date.now()}`, borewellId: id, startDepth: 0, endDepth: 40, material: 'clay', color: '#8D6E63', pattern: 'lines', remarks: 'Brown sticky clay' },
      { id: `l2-${Date.now()}`, borewellId: id, startDepth: 40, endDepth: 110, material: 'Sand', color: '#E0C097', pattern: 'dots', remarks: 'Fine sand with water trace' },
      { id: `l3-${Date.now()}`, borewellId: id, startDepth: 110, endDepth: 180, material: 'kankar', color: '#BCAAA4', pattern: 'crosses', remarks: 'Kankar layer' },
      { id: `l4-${Date.now()}`, borewellId: id, startDepth: 180, endDepth: (borewell.totalDepth || 250), material: 'clay kankar', color: '#6D4C41', pattern: 'bricks', remarks: 'Clay kankar mix bedrock' },
    ];
    const seedPipes: PipeSegment[] = [
      { id: `p1-${Date.now()}`, borewellId: id, startDepth: 0, endDepth: 110, pipeType: 'plain' },
      { id: `p2-${Date.now()}`, borewellId: id, startDepth: 110, endDepth: 180, pipeType: 'slotted' },
      { id: `p3-${Date.now()}`, borewellId: id, startDepth: 180, endDepth: (borewell.totalDepth || 250), pipeType: 'plain' },
    ];

    try {
      await setStrataLayers(id, seedLayers);
      await setPipeSegments(id, seedPipes);
      addToast({ message: 'Default strata layers and casing pipes seeded successfully.', type: 'success' });
    } catch (err: any) {
      console.error(err);
      addToast({ message: `Failed to seed data: ${err.message || String(err)}`, type: 'error' });
    }
  };

  const { exportPNG: drawAndExportPNG } = usePngExport(
    borewell || ({} as any),
    layers,
    pipes,
    isPrintPreview
  );

  if (!borewell) {
    return (
      <div className="p-6 text-center text-txt-muted text-sm space-y-4">
        <p>Borewell record not found or has been deleted.</p>
        <button onClick={() => navigate('/')} className="sf-btn-primary">Return to Dashboard</button>
      </div>
    );
  }

  // Run shared data integrity validation
  const strataErrors = validateStrata(layers, borewell.totalDepth);
  const pipeErrors = validatePipeSegments(pipes, borewell.totalDepth);
  const integrityErrors = [...strataErrors, ...pipeErrors];

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this borewell record? It will be moved to the Recycle Bin.')) {
      deleteBorewell(borewell.id);
      addToast({ message: 'Record moved to Recycle Bin.', type: 'info' });
      navigate('/');
    }
  };

  // Compute scaleFactor for drawing
  let scaleFactor = 3;
  if (zoom === '50') scaleFactor = 1.5;
  else if (zoom === '100') scaleFactor = 3;
  else if (zoom === '200') scaleFactor = 6;
  else if (zoom === '1in_20ft') scaleFactor = 4.8; // 96px = 1in, 1in = 20ft -> 4.8 px/ft
  else if (zoom === '1in_40ft') scaleFactor = 2.4; // 96px = 1in, 1in = 40ft -> 2.4 px/ft
  else if (zoom === 'fit') {
    const containerHeight = 580; // approximate drawing window height
    const calculated = containerHeight / (borewell.totalDepth || 250);
    // Bind fit scale limit
    scaleFactor = Math.max(1, Math.min(10, calculated));
  }

  const handleExportPDF = async () => {
    try {
      const dialogRes = await window.api.dialog.saveFile({
        title: 'Export PDF Report',
        defaultPath: `Borewell_Report_${borewell.borewellId}.pdf`,
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
      });

      if (dialogRes.canceled || !dialogRes.filePath) return;

      const saveRes = await window.api.export.pdf([borewell.id], dialogRes.filePath);
      if (saveRes.success) {
        try {
          const raw = localStorage.getItem('recent_exports') || '[]';
          const exportsList = JSON.parse(raw);
          const newEntry = {
            filename: dialogRes.filePath.split(/[\\/]/).pop() || dialogRes.filePath,
            recordCount: 1,
            format: 'pdf',
            date: new Date().toISOString(),
          };
          localStorage.setItem('recent_exports', JSON.stringify([newEntry, ...exportsList].slice(0, 10)));
        } catch (err) {
          console.error('Failed to log export:', err);
        }

        addToast({ message: 'Borewell PDF report generated successfully.', type: 'success' });
      } else {
        addToast({ message: `Failed to generate PDF: ${saveRes.error}`, type: 'error' });
      }
    } catch (err: any) {
      console.error(err);
      addToast({ message: `PDF Export error: ${err.message || String(err)}`, type: 'error' });
    }
  };

  const handleExportExcel = async () => {
    try {
      const dialogRes = await window.api.dialog.saveFile({
        title: 'Export Excel Spreadsheet',
        defaultPath: `Borewell_Data_${borewell.borewellId}.xlsx`,
        filters: [{ name: 'Excel Spreadsheets', extensions: ['xlsx'] }]
      });

      if (dialogRes.canceled || !dialogRes.filePath) return;

      const saveRes = await window.api.export.excel([borewell.id], dialogRes.filePath);
      if (saveRes.success) {
        try {
          const raw = localStorage.getItem('recent_exports') || '[]';
          const exportsList = JSON.parse(raw);
          const newEntry = {
            filename: dialogRes.filePath.split(/[\\/]/).pop() || dialogRes.filePath,
            recordCount: 1,
            format: 'excel',
            date: new Date().toISOString(),
          };
          localStorage.setItem('recent_exports', JSON.stringify([newEntry, ...exportsList].slice(0, 10)));
        } catch (err) {
          console.error('Failed to log export:', err);
        }

        addToast({ message: 'Strata Excel workbook compiled successfully.', type: 'success' });
      } else {
        addToast({ message: `Failed to compile Excel: ${saveRes.error}`, type: 'error' });
      }
    } catch (err: any) {
      console.error(err);
      addToast({ message: `Excel Export error: ${err.message || String(err)}`, type: 'error' });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-none">
      {/* Detail Page Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/borewells')}
            className="p-2 hover:bg-sf-surface-2 border border-sf-border text-txt-secondary hover:text-txt-primary rounded-lg transition-all cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-txt-primary">{borewell.ownerName}</h1>
              <span className="sf-badge-accent">{borewell.borewellId}</span>
            </div>
            <p className="text-2xs text-txt-muted mt-0.5 font-mono">
              Date: {new Date(borewell.date).toLocaleDateString()} | Project: {borewell.project || 'Default'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isEditingMetadata ? (
            <>
              <button
                onClick={handleSaveMetadata}
                className="sf-btn-primary flex items-center gap-1.5 py-2 cursor-pointer"
              >
                <span>Save Blueprint</span>
              </button>
              <button
                onClick={() => setIsEditingMetadata(false)}
                className="sf-btn-secondary flex items-center gap-1.5 py-2 cursor-pointer"
              >
                <span>Cancel</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleEditMetadata}
              className="sf-btn-secondary flex items-center gap-1.5 py-2 cursor-pointer"
            >
              <Edit3 size={14} />
              <span>Edit Blueprint</span>
            </button>
          )}

          <button
            onClick={() => navigate(`/borewell/${borewell.id}/strata`)}
            className="sf-btn-primary flex items-center gap-1.5 py-2 cursor-pointer"
          >
            <Edit3 size={14} />
            <span>Edit Design Chart</span>
          </button>

          <button
            onClick={handleDelete}
            className="sf-btn-danger flex items-center gap-1.5 py-2 cursor-pointer"
          >
            <Trash2 size={14} />
            <span>Delete Record</span>
          </button>
        </div>
      </div>

      {/* Visual Drawing empty state warning panel */}
      {isLoaded && layers.length === 0 && pipes.length === 0 && (
        <div className="bg-sf-surface border border-sf-border rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sf animate-fade-in">
          <div className="space-y-1">
            <span className="font-bold text-txt-primary block text-xs">No Strata Layers or Pipe Segments Defined</span>
            <p className="text-2xs text-txt-secondary leading-relaxed">
              This borewell profile has no strata layers or casing pipe segments defined. You can design it from scratch in the Design Studio, or seed default sample data.
            </p>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={handleSeedDefaultData}
              className="sf-btn-primary py-1.5 px-3.5 text-2xs font-mono font-bold cursor-pointer"
            >
              Seed Sample Data
            </button>
            <button
              onClick={() => navigate(`/borewell/${borewell.id}/strata`)}
              className="sf-btn-secondary py-1.5 px-3.5 text-2xs font-mono font-bold cursor-pointer"
            >
              Open Design Studio
            </button>
          </div>
        </div>
      )}

      {/* Data Integrity Warning Banner */}
      {integrityErrors.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex gap-3 text-xs text-warning animate-fadeIn">
          <AlertTriangle className="flex-shrink-0 mt-0.5" size={18} />
          <div className="space-y-1">
            <span className="font-bold block">Geological Data Integrity Issues Detected:</span>
            <ul className="list-disc pl-4 space-y-1 text-txt-secondary font-mono text-3xs">
              {integrityErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
            <span className="text-2xs text-txt-muted block pt-1 font-sans">
              Please click "Edit Design Chart" to correct these depths or material issues.
            </span>
          </div>
        </div>
      )}

      {/* ENGINEERING BLUEPRINT TITLE BLOCK HEADER PANEL */}
      <div className="border border-sf-border bg-sf-base rounded-xl overflow-hidden font-mono text-xs select-none">
        <table className="w-full text-left border-collapse">
          <tbody>
            <tr className="border-b border-sf-border">
              <td className="p-3 border-r border-sf-border w-1/3">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Project / Site Name</div>
                {isEditingMetadata ? (
                  <div className="flex gap-1.5 mt-1">
                    <input
                      type="text"
                      className="bg-sf-void border border-sf-border rounded p-1 w-1/2 text-txt-primary font-bold text-xs"
                      placeholder="Project"
                      value={metadataForm.project}
                      onChange={(e) => setMetadataForm({ ...metadataForm, project: e.target.value })}
                    />
                    <input
                      type="text"
                      className="bg-sf-void border border-sf-border rounded p-1 w-1/2 text-txt-primary font-bold text-xs"
                      placeholder="Owner Name"
                      value={metadataForm.ownerName}
                      onChange={(e) => setMetadataForm({ ...metadataForm, ownerName: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="font-extrabold text-txt-primary mt-1 text-xs">
                    {borewell.project || 'Default Project'} / {borewell.ownerName}
                  </div>
                )}
              </td>
              <td className="p-3 border-r border-sf-border w-1/3">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Site Location Address</div>
                {isEditingMetadata ? (
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="flex gap-1">
                      <input
                        type="text"
                        className="bg-sf-void border border-sf-border rounded p-1 w-1/2 text-txt-primary font-bold text-xs"
                        placeholder="City"
                        value={metadataForm.city}
                        onChange={(e) => setMetadataForm({ ...metadataForm, city: e.target.value })}
                      />
                      <input
                        type="text"
                        className="bg-sf-void border border-sf-border rounded p-1 w-1/2 text-txt-primary font-bold text-xs"
                        placeholder="Area"
                        value={metadataForm.area}
                        onChange={(e) => setMetadataForm({ ...metadataForm, area: e.target.value })}
                      />
                    </div>
                    <input
                      type="text"
                      className="bg-sf-void border border-sf-border rounded p-1 w-full text-txt-primary font-bold text-xs"
                      placeholder="Address"
                      value={metadataForm.address}
                      onChange={(e) => setMetadataForm({ ...metadataForm, address: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="font-extrabold text-txt-primary mt-1 text-xs truncate">
                    {borewell.city}, {borewell.area || 'N/A'} ({borewell.address || 'N/A'})
                  </div>
                )}
              </td>
              <td className="p-3 w-1/3">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Logging Date</div>
                {isEditingMetadata ? (
                  <input
                    type="date"
                    className="bg-sf-void border border-sf-border rounded p-1 mt-1 w-full text-txt-primary font-bold text-xs"
                    value={metadataForm.date ? metadataForm.date.split('T')[0] : ''}
                    onChange={(e) => setMetadataForm({ ...metadataForm, date: e.target.value })}
                  />
                ) : (
                  <div className="font-extrabold text-txt-primary mt-1 text-xs">
                    {new Date(borewell.date).toLocaleDateString()}
                  </div>
                )}
              </td>
            </tr>
            <tr className="border-b border-sf-border">
              <td className="p-3 border-r border-sf-border">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Borehole Diameter</div>
                {isEditingMetadata ? (
                  <input
                    type="number"
                    step="any"
                    className="bg-sf-void border border-sf-border rounded p-1 mt-1 w-full text-txt-primary font-bold text-xs"
                    placeholder="Bore diameter"
                    value={metadataForm.boreDia}
                    onChange={(e) => setMetadataForm({ ...metadataForm, boreDia: e.target.value })}
                  />
                ) : (
                  <div className="font-extrabold text-txt-primary mt-1 text-xs">
                    {borewell.boreDia ? `${borewell.boreDia}" Bore Diameter` : 'N/A'}
                  </div>
                )}
              </td>
              <td className="p-3 border-r border-sf-border">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Pipe Casing Diameter</div>
                {isEditingMetadata ? (
                  <input
                    type="number"
                    step="any"
                    className="bg-sf-void border border-sf-border rounded p-1 mt-1 w-full text-txt-primary font-bold text-xs"
                    placeholder="Casing diameter"
                    value={metadataForm.pipeDia}
                    onChange={(e) => setMetadataForm({ ...metadataForm, pipeDia: e.target.value })}
                  />
                ) : (
                  <div className="font-extrabold text-txt-primary mt-1 text-xs">
                    {borewell.pipeDia ? `${borewell.pipeDia}" Casing Pipe` : 'N/A'}
                  </div>
                )}
              </td>
              <td className="p-3">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Total Drilled Depth</div>
                {isEditingMetadata ? (
                  <input
                    type="number"
                    step="any"
                    className="bg-sf-void border border-sf-border rounded p-1 mt-1 w-full text-txt-primary font-bold text-xs"
                    placeholder="Total depth"
                    value={metadataForm.totalDepth}
                    onChange={(e) => setMetadataForm({ ...metadataForm, totalDepth: e.target.value })}
                  />
                ) : (
                  <div className="font-extrabold text-accent mt-1 text-xs">
                    {borewell.totalDepth ? `${borewell.totalDepth} ft` : 'N/A'}
                  </div>
                )}
              </td>
            </tr>
            <tr>
              <td className="p-3 border-r border-sf-border">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Static Water Table</div>
                {isEditingMetadata ? (
                  <input
                    type="number"
                    step="any"
                    className="bg-sf-void border border-sf-border rounded p-1 mt-1 w-full text-txt-primary font-bold text-xs"
                    placeholder="Water level"
                    value={metadataForm.waterLevel}
                    onChange={(e) => setMetadataForm({ ...metadataForm, waterLevel: e.target.value })}
                  />
                ) : (
                  <div className="font-extrabold text-cyan-500 mt-1 text-xs">
                    {borewell.waterLevel ? `${borewell.waterLevel} ft` : 'N/A'}
                  </div>
                )}
              </td>
              <td className="p-3 border-r border-sf-border">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Pump Lowering Depth</div>
                <div className="font-extrabold text-txt-primary mt-1 text-xs">
                  {metadataForm.waterLevel !== '' && !isNaN(Number(metadataForm.waterLevel)) 
                    ? `${Number(metadataForm.waterLevel) + 50} ft (Calculated)` 
                    : borewell.waterLevel 
                      ? `${borewell.waterLevel + 50} ft (Calculated)` 
                      : 'N/A'}
                </div>
              </td>
              <td className="p-3">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Lowered Pump Specs</div>
                <div className="font-extrabold text-txt-primary mt-1 text-xs">
                  3.0 HP Submersible / 12 Stage
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* DRAWING WORKSPACE CONTROLS & LOG SHEET */}
      <div className="flex flex-col gap-4">
        {/* Drawing Control Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-sf-base border border-sf-border rounded-xl">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold text-txt-muted uppercase tracking-wider font-mono mr-1">Ruler Zoom:</span>
            <div className="inline-flex rounded-lg border border-sf-border bg-sf-void p-0.5">
              {(['fit', '50', '100', '200'] as const).map((z) => (
                <button
                  key={z}
                  onClick={() => setZoom(z)}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-md font-mono cursor-pointer transition-all ${
                    zoom === z 
                      ? 'bg-sf-base text-accent shadow-sm border border-sf-border/30' 
                      : 'text-txt-secondary hover:text-txt-primary'
                  }`}
                >
                  {z === 'fit' ? 'Fit Screen' : `${z}%`}
                </button>
              ))}
            </div>

            <div className="inline-flex rounded-lg border border-sf-border bg-sf-void p-0.5">
              {(['1in_20ft', '1in_40ft'] as const).map((z) => (
                <button
                  key={z}
                  onClick={() => setZoom(z)}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-md font-mono cursor-pointer transition-all ${
                    zoom === z 
                      ? 'bg-sf-base text-accent shadow-sm border border-sf-border/30' 
                      : 'text-txt-secondary hover:text-txt-primary'
                  }`}
                  title={z === '1in_20ft' ? '1 inch = 20 ft print scale' : '1 inch = 40 ft print scale'}
                >
                  {z === '1in_20ft' ? '1" = 20\'' : '1" = 40\''}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Print Preview Toggle */}
            <button
              onClick={() => setIsPrintPreview(!isPrintPreview)}
              className={`sf-btn-secondary py-1.5 px-3 flex items-center gap-1.5 ${
                isPrintPreview ? 'bg-accent/10 border-accent text-accent-text' : ''
              }`}
            >
              {isPrintPreview ? <EyeOff size={13} /> : <Eye size={13} />}
              <span className="font-mono text-3xs font-bold uppercase">
                {isPrintPreview ? 'Exit Preview' : 'Print Preview'}
              </span>
            </button>

            {/* Export Dropdown Group */}
            <div className="flex items-center gap-1 border-l border-sf-border pl-3">
              <button
                onClick={handleExportPDF}
                className="sf-btn-secondary py-1.5 px-3 flex items-center gap-1 text-3xs font-mono font-bold cursor-pointer"
              >
                <FileText size={13} className="text-red-500" />
                <span>PDF</span>
              </button>

              <button
                onClick={drawAndExportPNG}
                className="sf-btn-secondary py-1.5 px-3 flex items-center gap-1 text-3xs font-mono font-bold cursor-pointer"
              >
                <ImageIcon size={13} className="text-amber-500" />
                <span>PNG</span>
              </button>

              <button
                onClick={handleExportExcel}
                className="sf-btn-secondary py-1.5 px-3 flex items-center gap-1 text-3xs font-mono font-bold cursor-pointer"
              >
                <FileSpreadsheet size={13} className="text-green-500" />
                <span>Excel</span>
              </button>
            </div>
          </div>
        </div>

        {/* Visual Drawing container */}
        <div className="border border-sf-border bg-sf-base rounded-xl overflow-auto p-4 flex justify-center" style={{ height: '650px' }}>
          <BorewellProfileDrawing
            borewell={borewell}
            layers={layers}
            pipes={pipes}
            scaleFactor={scaleFactor}
            isPrintPreview={isPrintPreview}
            hoveredStrataId={hoveredStrataId}
            setHoveredStrataId={setHoveredStrataId}
            hoveredPipeId={hoveredPipeId}
            setHoveredPipeId={setHoveredPipeId}
            selectedEntity={selectedEntity}
            setSelectedEntity={setSelectedEntity}
          />
        </div>

        {/* Detailed Bottom Inspector */}
        {selectedEntity && (
          <div className="sf-panel p-4 bg-sf-surface border border-sf-border animate-slide-up flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex-1">
              <h3 className="font-bold text-sm text-txt-primary flex items-center gap-2 uppercase font-mono mb-2">
                <span>Drawing Inspector:</span>
                <span className="text-accent">{selectedEntity.type === 'strata' ? 'Strata Layer Segment' : 'Assembly Casing segment'}</span>
              </h3>
              {selectedEntity.type === 'strata' && (() => {
                const layer = layers.find(l => l.id === selectedEntity.id);
                if (!layer) return null;
                return (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 font-mono text-[11px]">
                    <div>
                      <span className="text-txt-muted block uppercase text-[9px] font-bold">Material</span>
                      <span className="font-bold text-txt-primary">{layer.material}</span>
                    </div>
                    <div>
                      <span className="text-txt-muted block uppercase text-[9px] font-bold">Depth Range</span>
                      <span className="font-bold text-txt-primary">{layer.startDepth} - {layer.endDepth} ft</span>
                    </div>
                    <div>
                      <span className="text-txt-muted block uppercase text-[9px] font-bold">Layer Thickness</span>
                      <span className="font-bold text-accent">{layer.endDepth - layer.startDepth} ft</span>
                    </div>
                    <div>
                      <span className="text-txt-muted block uppercase text-[9px] font-bold">Hatch Type</span>
                      <span className="font-bold text-txt-primary uppercase">{layer.pattern}</span>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <span className="text-txt-muted block uppercase text-[9px] font-bold">Layer Observations / Remarks</span>
                      <span className="text-txt-secondary">{layer.remarks || 'No detailed observations recorded.'}</span>
                    </div>
                  </div>
                );
              })()}
              {selectedEntity.type === 'pipe' && (() => {
                const pipe = pipes.find(p => p.id === selectedEntity.id);
                if (!pipe) return null;
                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-[11px]">
                    <div>
                      <span className="text-txt-muted block uppercase text-[9px] font-bold">Casing Type</span>
                      <span className="font-bold text-txt-primary uppercase">{pipe.pipeType === 'slotted' ? 'Slotted Screen (Blue)' : 'Plain Casing (White)'}</span>
                    </div>
                    <div>
                      <span className="text-txt-muted block uppercase text-[9px] font-bold">Lowered Depth Range</span>
                      <span className="font-bold text-txt-primary">{pipe.startDepth} - {pipe.endDepth} ft</span>
                    </div>
                    <div>
                      <span className="text-txt-muted block uppercase text-[9px] font-bold">Casing Segment Length</span>
                      <span className="font-bold text-success">{pipe.endDepth - pipe.startDepth} ft</span>
                    </div>
                    <div>
                      <span className="text-txt-muted block uppercase text-[9px] font-bold">Casing Nominal Diameter</span>
                      <span className="font-bold text-txt-primary">{borewell.pipeDia ? `${borewell.pipeDia} inches` : 'N/A'}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button 
                onClick={() => navigate(`/borewell/${borewell.id}/strata`)}
                className="sf-btn-secondary py-1.5 px-3 flex items-center gap-1 text-2xs cursor-pointer"
              >
                <Edit3 size={11} /> 
                <span>Edit Design Chart</span>
              </button>
              <button 
                onClick={() => setSelectedEntity(null)}
                className="sf-btn-ghost py-1.5 px-3 text-2xs cursor-pointer"
              >
                <span>Close Inspector</span>
              </button>
            </div>
          </div>
        )}

        {/* Technical Remarks & Remarks box */}
        <div className="sf-panel p-5 font-mono text-xs select-none">
          <h2 className="text-xs font-bold text-txt-primary pb-2 border-b border-sf-border uppercase tracking-wider mb-3">
            Driller's Technical Remarks & Geological Observations
          </h2>
          {isEditingMetadata ? (
            <textarea
              className="w-full p-3 border border-sf-border bg-sf-void text-txt-primary rounded-lg font-mono leading-relaxed outline-none focus:border-accent"
              rows={4}
              value={metadataForm.remarks}
              onChange={(e) => setMetadataForm({ ...metadataForm, remarks: e.target.value })}
              placeholder="Enter overall driller observations/remarks..."
            />
          ) : (
            <div className="p-3 border border-sf-border bg-sf-void text-txt-secondary rounded-lg font-mono leading-relaxed whitespace-pre-wrap">
              {borewell.remarks || 'No overall observations logged for this borewell installation.'}
            </div>
          )}
        </div>

        {/* Reference Documents & Attachments Panel */}
        {attachedFile && (attachedFile.excelPath || attachedFile.pdfPath) && (
          <div className="sf-panel p-5 font-mono text-xs select-none animate-fade-in">
            <h2 className="text-xs font-bold text-txt-primary pb-2 border-b border-sf-border uppercase tracking-wider mb-3">
              Reference Documents & Attachments
            </h2>
            <div className="flex flex-wrap gap-4">
              {attachedFile.excelPath && (
                <div className="flex items-center justify-between gap-4 p-3 bg-sf-surface border border-sf-border rounded-xl min-w-[280px]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded bg-success/10 text-success">
                      <FileSpreadsheet size={18} />
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-xs text-txt-primary block truncate max-w-[180px]" title={attachedFile.excelPath}>
                        {attachedFile.excelPath.split(/[\\/]/).pop()}
                      </span>
                      <span className="text-[10px] text-txt-muted block">Attached Excel Reference</span>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const res = await window.api.db.openPath(attachedFile.excelPath);
                      if (res) addToast({ message: `Error opening document: ${res}`, type: 'error' });
                    }}
                    className="sf-btn-secondary py-1.5 px-3 flex items-center gap-1 text-[10px] cursor-pointer"
                  >
                    <span>Open File</span>
                    <ExternalLink size={10} />
                  </button>
                </div>
              )}
              {attachedFile.pdfPath && (
                <div className="flex items-center justify-between gap-4 p-3 bg-sf-surface border border-sf-border rounded-xl min-w-[280px]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded bg-danger/10 text-danger">
                      <FileText size={18} />
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-xs text-txt-primary block truncate max-w-[180px]" title={attachedFile.pdfPath}>
                        {attachedFile.pdfPath.split(/[\\/]/).pop()}
                      </span>
                      <span className="text-[10px] text-txt-muted block">Attached PDF Reference</span>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const res = await window.api.db.openPath(attachedFile.pdfPath);
                      if (res) addToast({ message: `Error opening document: ${res}`, type: 'error' });
                    }}
                    className="sf-btn-secondary py-1.5 px-3 flex items-center gap-1 text-[10px] cursor-pointer"
                  >
                    <span>Open File</span>
                    <ExternalLink size={10} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BorewellDetailPage;
