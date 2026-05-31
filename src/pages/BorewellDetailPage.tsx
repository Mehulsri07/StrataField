import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { 
  ArrowLeft, Edit3, Trash2, AlertTriangle, 
  FileText, FileSpreadsheet, Image as ImageIcon, Eye, EyeOff 
} from 'lucide-react';
import type { StrataLayer, PipeSegment } from '@shared/types';
import { validateStrata, validatePipeSegments } from '@/shared/validation';
import { BorewellProfileDrawing, getMaterialPatternStyle } from '@/components/ui/BorewellProfileDrawing';

export function BorewellDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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

  // Seed default layers only after data is loaded and verified empty
  useEffect(() => {
    if (id && borewell && isLoaded) {
      const dbLayers = strataStore[id] || [];
      const dbPipes = pipeStore[id] || [];

      if (dbLayers.length === 0) {
        const seedLayers: StrataLayer[] = [
          { id: 'l1', borewellId: id, startDepth: 0, endDepth: 40, material: 'Clay', color: '#8D6E63', pattern: 'lines', remarks: 'Brown sticky clay' },
          { id: 'l2', borewellId: id, startDepth: 40, endDepth: 110, material: 'Sand', color: '#E0C097', pattern: 'dots', remarks: 'Fine sand with water trace' },
          { id: 'l3', borewellId: id, startDepth: 110, endDepth: 180, material: 'Gravel', color: '#9E9E9E', pattern: 'circles', remarks: 'Coarse water-bearing gravel' },
          { id: 'l4', borewellId: id, startDepth: 180, endDepth: (borewell.totalDepth || 250), material: 'Rock', color: '#616161', pattern: 'diagonal', remarks: 'Hard granite bedrock' },
        ];
        setStrataLayers(id, seedLayers);
      }

      if (dbPipes.length === 0) {
        const seedPipes: PipeSegment[] = [
          { id: 'p1', borewellId: id, startDepth: 0, endDepth: 110, pipeType: 'plain' },
          { id: 'p2', borewellId: id, startDepth: 110, endDepth: 180, pipeType: 'slotted' },
          { id: 'p3', borewellId: id, startDepth: 180, endDepth: (borewell.totalDepth || 250), pipeType: 'plain' },
        ];
        setPipeSegments(id, seedPipes);
      }
    }
  }, [id, borewell, isLoaded, strataStore, pipeStore]);

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

  // PNG Canvas Exporter helper
  const drawAndExportPNG = async () => {
    try {
      const totalD = borewell.totalDepth || 250;
      const exportScale = 4.5; // High resolution 4.5px/ft
      const headerH = 220;
      const footerH = 100;
      const drawingH = totalD * exportScale;
      const canvasW = 1000;
      const canvasH = headerH + drawingH + footerH;

      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        addToast({ message: 'Failed to initialize image drawing canvas context.', type: 'error' });
        return;
      }

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW, canvasH);

      // Outer Frame
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(18, 18, canvasW - 36, canvasH - 36);
      ctx.lineWidth = 0.5;
      ctx.strokeRect(22, 22, canvasW - 44, canvasH - 44);

      // Title & Subheader
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GEOLOGICAL BOREWELL LOG REPORT & CASING DRAWING', canvasW / 2, 50);
      ctx.font = '10px monospace';
      ctx.fillText(`RECORD ID: ${borewell.borewellId} | PROJECT ID: ${borewell.project || 'DEFAULT'}`, canvasW / 2, 70);

      // Title Block Table
      const tblX = 35;
      const tblY = 85;
      const tblW = 930;
      const tblH = 120;
      ctx.strokeRect(tblX, tblY, tblW, tblH);

      // Grid dividers
      const colW = tblW / 3;
      const rowH = tblH / 3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      // vertical
      ctx.moveTo(tblX + colW, tblY); ctx.lineTo(tblX + colW, tblY + tblH);
      ctx.moveTo(tblX + colW * 2, tblY); ctx.lineTo(tblX + colW * 2, tblY + tblH);
      // horizontal
      ctx.moveTo(tblX, tblY + rowH); ctx.lineTo(tblX + tblW, tblY + rowH);
      ctx.moveTo(tblX, tblY + rowH * 2); ctx.lineTo(tblX + tblW, tblY + rowH * 2);
      ctx.stroke();

      const drawCell = (colIdx: number, rowIdx: number, title: string, value: string) => {
        const cx = tblX + colIdx * colW;
        const cy = tblY + rowIdx * rowH;
        ctx.fillStyle = '#666666';
        ctx.font = 'bold 7.5px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(title.toUpperCase(), cx + 8, cy + 13);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(value || 'N/A', cx + 8, cy + 28);
      };

      drawCell(0, 0, 'Site Owner Name', borewell.ownerName);
      drawCell(1, 0, 'Site Location & Address', `${borewell.city}${borewell.area ? ', ' + borewell.area : ''}`);
      drawCell(2, 0, 'Logging Date', new Date(borewell.date).toLocaleDateString());

      drawCell(0, 1, 'Drill Hole Diameter', borewell.boreDia ? `${borewell.boreDia} inches` : 'N/A');
      drawCell(1, 1, 'Pipe Casing Diameter', borewell.pipeDia ? `${borewell.pipeDia} inches` : 'N/A');
      drawCell(2, 1, 'Total Drilled Depth', borewell.totalDepth ? `${borewell.totalDepth} feet` : 'N/A');

      drawCell(0, 2, 'Static Water Table', borewell.waterLevel ? `${borewell.waterLevel} feet` : 'N/A');
      drawCell(1, 2, 'Pump Lowering Depth (Calculated)', borewell.waterLevel ? `${borewell.waterLevel + 50} feet` : 'N/A');
      drawCell(2, 2, 'Lowered Pump Details', '3.0 HP Submersible / 12 Stage');

      // Drawing Columns Setup
      const drawY = headerH;
      const rulerX = 55;
      const strataX = 180;
      const strataW = 240;
      const pipeX = strataX + strataW + 64;
      const pipeW = 180;

      // Ruler Line
      ctx.strokeStyle = '#000000';
      ctx.beginPath();
      ctx.moveTo(rulerX + 60, drawY);
      ctx.lineTo(rulerX + 60, drawY + drawingH);
      ctx.stroke();

      // Draw Ticks & Reference Grid
      const minorStep = 10;
      const ticksCount = Math.floor(totalD / minorStep) + 1;
      for (let i = 0; i < ticksCount; i++) {
        const depthVal = i * minorStep;
        const ty = drawY + depthVal * exportScale;
        const isMajor = depthVal % 20 === 0;

        // Draw tick
        ctx.strokeStyle = '#000000';
        ctx.beginPath();
        ctx.moveTo(rulerX + (isMajor ? 48 : 54), ty);
        ctx.lineTo(rulerX + 60, ty);
        ctx.stroke();

        // Label
        ctx.fillStyle = '#000000';
        ctx.font = isMajor ? 'bold 9px monospace' : '7.5px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${depthVal} ft`, rulerX + 42, ty + 3);

        // Center Grid Line
        ctx.strokeStyle = isMajor ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.07)';
        if (!isMajor) ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(strataX, ty);
        ctx.lineTo(pipeX + pipeW, ty);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw Strata Box Outer Border
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(strataX, drawY, strataW, drawingH);

      // Render Strata Layers on Canvas
      layers.forEach((layer) => {
        const ly = drawY + layer.startDepth * exportScale;
        const lh = (layer.endDepth - layer.startDepth) * exportScale;
        if (lh <= 0) return;

        // Pattern styles helper
        const style = getMaterialPatternStyle(layer.pattern, layer.color, isPrintPreview);
        ctx.fillStyle = style.backgroundColor;
        ctx.fillRect(strataX, ly, strataW, lh);

        // Clip and Draw Pattern
        ctx.save();
        ctx.beginPath();
        ctx.rect(strataX, ly, strataW, lh);
        ctx.clip();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 0.75;

        if (layer.pattern === 'lines' || layer.pattern === 'horizontal' || layer.pattern === 'clay') {
          for (let py = ly + 4; py < ly + lh; py += 8) {
            ctx.beginPath(); ctx.moveTo(strataX, py); ctx.lineTo(strataX + strataW, py); ctx.stroke();
          }
        } else if (layer.pattern === 'dots' || layer.pattern === 'sand') {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          for (let px = strataX + 4; px < strataX + strataW; px += 6) {
            for (let py = ly + 4; py < ly + lh; py += 6) {
              ctx.fillRect(px + (py % 2 ? 3 : 0), py, 1, 1);
            }
          }
        } else if (layer.pattern === 'circles' || layer.pattern === 'gravel') {
          for (let px = strataX + 8; px < strataX + strataW; px += 16) {
            for (let py = ly + 8; py < ly + lh; py += 16) {
              ctx.beginPath(); ctx.arc(px + (py % 32 ? 6 : 0), py, 2, 0, Math.PI * 2); ctx.stroke();
            }
          }
        } else if (layer.pattern === 'diagonal' || layer.pattern === 'rock') {
          for (let py = ly - strataW; py < ly + lh; py += 10) {
            ctx.beginPath(); ctx.moveTo(strataX, py); ctx.lineTo(strataX + strataW, py + strataW); ctx.stroke();
          }
        }
        ctx.restore();

        // Separate Border
        ctx.strokeStyle = '#000000';
        ctx.beginPath(); ctx.moveTo(strataX, ly + lh); ctx.lineTo(strataX + strataW, ly + lh); ctx.stroke();

        // Label Badge
        if (lh >= 36) {
          const labelText = layer.material.toUpperCase();
          const depthText = `${layer.startDepth} - ${layer.endDepth} ft`;
          ctx.font = 'bold 9px monospace';
          const badgeW = Math.max(ctx.measureText(labelText).width, ctx.measureText(depthText).width) + 16;

          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          const bx = strataX + (strataW - badgeW) / 2;
          const by = ly + lh / 2 - 12;
          ctx.fillRect(bx, by, badgeW, 24);
          ctx.strokeRect(bx, by, badgeW, 24);

          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.font = 'bold 8px monospace';
          ctx.fillText(labelText, strataX + strataW / 2, by + 10);
          ctx.font = '7px monospace';
          ctx.fillText(depthText, strataX + strataW / 2, by + 20);
        } else {
          // Left leader callout
          const midY = ly + lh / 2;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(strataX, midY); ctx.lineTo(strataX - 16, midY); ctx.stroke();
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 7px monospace';
          ctx.textAlign = 'right';
          ctx.fillText(`${layer.material} (${layer.startDepth}-${layer.endDepth} ft)`, strataX - 20, midY + 2.5);
        }
      });

      // Draw Pipe Casing Outer Border
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(pipeX, drawY, pipeW, drawingH);

      // Render Casing segments
      pipes.forEach((pipe) => {
        const py = drawY + pipe.startDepth * exportScale;
        const ph = (pipe.endDepth - pipe.startDepth) * exportScale;
        if (ph <= 0) return;

        const isSlotted = pipe.pipeType === 'slotted';

        if (isPrintPreview) {
          ctx.fillStyle = isSlotted ? '#e2e8f0' : '#ffffff';
        } else {
          ctx.fillStyle = isSlotted ? '#00AEEF' : '#ffffff';
        }
        ctx.fillRect(pipeX + 4, py, pipeW - 8, ph);

        // Draw double pipes (CAD structure)
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(pipeX + 4, py, pipeW - 8, ph);
        ctx.strokeRect(pipeX + 8, py, pipeW - 16, ph);

        if (isSlotted) {
          ctx.strokeStyle = isPrintPreview ? 'rgba(0,0,0,0.6)' : '#ffffff';
          ctx.lineWidth = 1;
          for (let sy = py + 3; sy < py + ph - 2; sy += 6) {
            ctx.beginPath(); ctx.moveTo(pipeX + 12, sy); ctx.lineTo(pipeX + pipeW - 12, sy); ctx.stroke();
          }
        }

        // Horizontal dividers
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(pipeX, py + ph); ctx.lineTo(pipeX + pipeW, py + ph); ctx.stroke();

        // Label
        if (ph >= 42) {
          const textType = isSlotted ? 'SLOTTED CASING' : 'PLAIN CASING';
          const textRange = `${pipe.startDepth} - ${pipe.endDepth} ft`;
          const textLength = `L = ${pipe.endDepth - pipe.startDepth} ft`;

          ctx.fillStyle = isSlotted && !isPrintPreview ? '#ffffff' : '#000000';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(textType, pipeX + pipeW / 2, py + ph / 2 - 8);
          ctx.font = '7.5px monospace';
          ctx.fillText(textRange, pipeX + pipeW / 2, py + ph / 2 + 2);
          ctx.fillText(textLength, pipeX + pipeW / 2, py + ph / 2 + 12);
        } else {
          // Right leader callout
          const midY = py + ph / 2;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(pipeX + pipeW - 4, midY); ctx.lineTo(pipeX + pipeW + 24, midY); ctx.stroke();
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 7px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(
            `${isSlotted ? 'SLOTTED' : 'PLAIN'}: ${pipe.startDepth}-${pipe.endDepth} ft (L=${pipe.endDepth - pipe.startDepth} ft)`,
            pipeX + pipeW + 28,
            midY + 2.5
          );
        }
      });

      // Water Level Line overlay
      if (borewell.waterLevel !== null) {
        const wly = drawY + borewell.waterLevel * exportScale;
        ctx.strokeStyle = '#00AEEF';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(strataX, wly); ctx.lineTo(pipeX + pipeW, wly); ctx.stroke();
        ctx.setLineDash([]);

        const labelText = `STATIC WATER LEVEL = ${borewell.waterLevel} ft`;
        ctx.font = 'bold 8.5px monospace';
        const labelW = ctx.measureText(labelText).width + 12;

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#00AEEF';
        ctx.lineWidth = 1;
        const bx = strataX + (pipeX + pipeW - strataX - labelW) / 2;
        ctx.fillRect(bx, wly - 8, labelW, 16);
        ctx.strokeRect(bx, wly - 8, labelW, 16);

        ctx.fillStyle = '#00AEEF';
        ctx.textAlign = 'center';
        ctx.fillText(labelText, strataX + (pipeX + pipeW - strataX) / 2, wly + 3.5);
      }

      // Remarks Block at bottom
      const rx = 35;
      const ry = drawY + drawingH + 20;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(20, ry - 6); ctx.lineTo(canvasW - 20, ry - 6); ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 9.5px monospace';
      ctx.textAlign = 'left';
      ctx.fillText("DRILLER'S TECHNICAL OBSERVATIONS / REMARKS", rx, ry + 10);

      ctx.strokeRect(rx, ry + 16, tblW, 50);
      ctx.fillStyle = '#333333';
      ctx.font = '8.5px monospace';
      const remarksText = borewell.remarks || 'No observations logged for this geological profile.';

      const words = remarksText.split(' ');
      let textLine = '';
      let textLineY = ry + 28;
      for (let n = 0; n < words.length; n++) {
        const testLine = textLine + words[n] + ' ';
        if (ctx.measureText(testLine).width > 900 && n > 0) {
          ctx.fillText(textLine, rx + 10, textLineY);
          textLine = words[n] + ' ';
          textLineY += 12;
        } else {
          textLine = testLine;
        }
      }
      ctx.fillText(textLine, rx + 10, textLineY);

      // Footer
      ctx.fillStyle = '#666666';
      ctx.font = '7.5px monospace';
      ctx.fillText('Generated by StrataField Hydrogeological logs engine.', rx, canvasH - 30);
      ctx.textAlign = 'right';
      ctx.fillText(`Printed: ${new Date().toLocaleDateString()}`, canvasW - rx, canvasH - 30);

      const dataUrl = canvas.toDataURL('image/png');

      const dialogRes = await window.api.dialog.saveFile({
        title: 'Export PNG Geological Drawing',
        defaultPath: `Borewell_CAD_Sheet_${borewell.borewellId}.png`,
        filters: [{ name: 'PNG Images', extensions: ['png'] }]
      });

      if (dialogRes.canceled || !dialogRes.filePath) return;

      const saveRes = await window.api.export.png(dataUrl, dialogRes.filePath);
      if (saveRes.success) {
        addToast({ message: 'Successfully exported high-precision CAD drawing as PNG.', type: 'success' });
      } else {
        addToast({ message: `Failed to save PNG: ${saveRes.error}`, type: 'error' });
      }
    } catch (err: any) {
      console.error(err);
      addToast({ message: `PNG Export error: ${err.message || String(err)}`, type: 'error' });
    }
  };

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
            onClick={() => navigate('/')}
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
          <button
            onClick={() => navigate(`/borewell/${borewell.id}/strata`)}
            className="sf-btn-primary flex items-center gap-1.5 py-2"
          >
            <Edit3 size={14} />
            <span>Edit Design Chart</span>
          </button>

          <button
            onClick={handleDelete}
            className="sf-btn-danger flex items-center gap-1.5 py-2"
          >
            <Trash2 size={14} />
            <span>Delete Record</span>
          </button>
        </div>
      </div>

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
                <div className="font-extrabold text-txt-primary mt-1 text-xs">
                  {borewell.project || 'Default Project'} / {borewell.ownerName}
                </div>
              </td>
              <td className="p-3 border-r border-sf-border w-1/3">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Site Location Address</div>
                <div className="font-extrabold text-txt-primary mt-1 text-xs truncate">
                  {borewell.city}, {borewell.area || 'N/A'} ({borewell.address || 'N/A'})
                </div>
              </td>
              <td className="p-3 w-1/3">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Logging Date</div>
                <div className="font-extrabold text-txt-primary mt-1 text-xs">
                  {new Date(borewell.date).toLocaleDateString()}
                </div>
              </td>
            </tr>
            <tr className="border-b border-sf-border">
              <td className="p-3 border-r border-sf-border">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Borehole Diameter</div>
                <div className="font-extrabold text-txt-primary mt-1 text-xs">
                  {borewell.boreDia ? `${borewell.boreDia}" Bore Diameter` : 'N/A'}
                </div>
              </td>
              <td className="p-3 border-r border-sf-border">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Pipe Casing Diameter</div>
                <div className="font-extrabold text-txt-primary mt-1 text-xs">
                  {borewell.pipeDia ? `${borewell.pipeDia}" Casing Pipe` : 'N/A'}
                </div>
              </td>
              <td className="p-3">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Total Drilled Depth</div>
                <div className="font-extrabold text-accent mt-1 text-xs">
                  {borewell.totalDepth ? `${borewell.totalDepth} ft` : 'N/A'}
                </div>
              </td>
            </tr>
            <tr>
              <td className="p-3 border-r border-sf-border">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Static Water Table</div>
                <div className="font-extrabold text-cyan-500 mt-1 text-xs">
                  {borewell.waterLevel ? `${borewell.waterLevel} ft` : 'N/A'}
                </div>
              </td>
              <td className="p-3 border-r border-sf-border">
                <div className="text-[9px] uppercase text-txt-muted font-extrabold tracking-wider">Pump Lowering Depth</div>
                <div className="font-extrabold text-txt-primary mt-1 text-xs">
                  {borewell.waterLevel ? `${borewell.waterLevel + 50} ft (Calculated)` : 'N/A'}
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
                className="sf-btn-secondary py-1.5 px-3 flex items-center gap-1 text-3xs font-mono font-bold"
              >
                <FileText size={13} className="text-red-500" />
                <span>PDF</span>
              </button>

              <button
                onClick={drawAndExportPNG}
                className="sf-btn-secondary py-1.5 px-3 flex items-center gap-1 text-3xs font-mono font-bold"
              >
                <ImageIcon size={13} className="text-amber-500" />
                <span>PNG</span>
              </button>

              <button
                onClick={handleExportExcel}
                className="sf-btn-secondary py-1.5 px-3 flex items-center gap-1 text-3xs font-mono font-bold"
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

        {/* Detailed Bottom Inspector (Takes zero width, perfect for smaller screens) */}
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
                className="sf-btn-secondary py-1.5 px-3 flex items-center gap-1 text-2xs"
              >
                <Edit3 size={11} /> 
                <span>Edit Design Chart</span>
              </button>
              <button 
                onClick={() => setSelectedEntity(null)}
                className="sf-btn-ghost py-1.5 px-3 text-2xs"
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
          <div className="p-3 border border-sf-border bg-sf-void text-txt-secondary rounded-lg font-mono leading-relaxed whitespace-pre-wrap">
            {borewell.remarks || 'No overall observations logged for this borewell installation.'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default BorewellDetailPage;
