import { useUIStore } from '@/stores/uiStore';
import type { Borewell, StrataLayer, PipeSegment } from '@/shared/types';
import { getMaterialPatternStyle } from '@/components/ui/BorewellProfileDrawing';
import { mergeStrataLayers, mergePipeSegments } from '@/shared/profileUtils';

export function usePngExport(
  borewell: Borewell,
  layers: StrataLayer[],
  pipes: PipeSegment[]
) {
  const addToast = useUIStore((s) => s.addToast);
  const isPrintPreview = false;

  const exportPNG = async () => {
    try {
      const mergedLayers = mergeStrataLayers(layers);
      const mergedPipes = mergePipeSegments(pipes);

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
        ctx.font = isMajor ? 'bold 11px monospace' : '9px monospace';
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
      mergedLayers.forEach((layer) => {
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
        } else if (layer.pattern === 'bricks') {
          // Horizontal brick lines
          for (let py = ly; py <= ly + lh; py += 10) {
            ctx.beginPath(); ctx.moveTo(strataX, py); ctx.lineTo(strataX + strataW, py); ctx.stroke();
          }
          // Vertical offset brick lines
          let row = 0;
          for (let py = ly; py < ly + lh; py += 10) {
            const shift = (row % 2) * 12;
            for (let px = strataX + shift; px < strataX + strataW; px += 24) {
              ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, Math.min(py + 10, ly + lh)); ctx.stroke();
            }
            row++;
          }
        } else if (layer.pattern === 'crosses' || layer.pattern === 'kankar') {
          // Crosses
          for (let px = strataX + 8; px < strataX + strataW; px += 16) {
            for (let py = ly + 8; py < ly + lh; py += 16) {
              ctx.beginPath();
              // vertical line
              ctx.moveTo(px + (py % 32 ? 4 : 0), py - 3);
              ctx.lineTo(px + (py % 32 ? 4 : 0), py + 3);
              // horizontal line
              ctx.moveTo(px + (py % 32 ? 4 : 0) - 3, py);
              ctx.lineTo(px + (py % 32 ? 4 : 0) + 3, py);
              ctx.stroke();
            }
          }
        }
        ctx.restore();

        // Separate Border
        ctx.strokeStyle = '#000000';
        ctx.beginPath(); ctx.moveTo(strataX, ly + lh); ctx.lineTo(strataX + strataW, ly + lh); ctx.stroke();

        // Label Badge
        if (lh >= 48) {
          const labelText = layer.material.toUpperCase();
          const depthText = `${layer.startDepth} - ${layer.endDepth} ft`;
          const thicknessText = `Thickness: ${layer.endDepth - layer.startDepth} ft`;
          ctx.font = 'bold 11px monospace';
          const badgeW = Math.max(
            ctx.measureText(labelText).width, 
            ctx.measureText(depthText).width,
            ctx.measureText(thicknessText).width
          ) + 20;

          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          const bx = strataX + (strataW - badgeW) / 2;
          const by = ly + lh / 2 - 23;
          ctx.fillRect(bx, by, badgeW, 46);
          ctx.strokeRect(bx, by, badgeW, 46);

          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.font = 'bold 11px monospace';
          ctx.fillText(labelText, strataX + strataW / 2, by + 13);
          ctx.font = '9.5px monospace';
          ctx.fillText(depthText, strataX + strataW / 2, by + 25);
          ctx.fillText(thicknessText, strataX + strataW / 2, by + 37);
        } else if (lh >= 36) {
          const labelText = layer.material.toUpperCase();
          const depthText = `${layer.startDepth} - ${layer.endDepth} ft`;
          ctx.font = 'bold 11px monospace';
          const badgeW = Math.max(ctx.measureText(labelText).width, ctx.measureText(depthText).width) + 20;

          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          const bx = strataX + (strataW - badgeW) / 2;
          const by = ly + lh / 2 - 16;
          ctx.fillRect(bx, by, badgeW, 32);
          ctx.strokeRect(bx, by, badgeW, 32);

          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.font = 'bold 11px monospace';
          ctx.fillText(labelText, strataX + strataW / 2, by + 13);
          ctx.font = '9.5px monospace';
          ctx.fillText(depthText, strataX + strataW / 2, by + 25);
        } else {
          // Left leader callout
          const midY = ly + lh / 2;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(strataX, midY); ctx.lineTo(strataX - 16, midY); ctx.stroke();
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'right';
          ctx.fillText(`${layer.material} (${layer.startDepth}-${layer.endDepth} ft)`, strataX - 20, midY + 3);
        }
      });

      // Draw Pipe Casing Outer Border
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(pipeX, drawY, pipeW, drawingH);

      // Render Casing segments
      mergedPipes.forEach((pipe) => {
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
          const textType = isSlotted ? 'SLOTTED PIPE' : 'PLAIN PIPE';
          const textRange = `${pipe.startDepth} - ${pipe.endDepth} ft`;
          const textLength = `Length: ${pipe.endDepth - pipe.startDepth} ft`;

          ctx.fillStyle = isSlotted && !isPrintPreview ? '#ffffff' : '#000000';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(textType, pipeX + pipeW / 2, py + ph / 2 - 11);
          ctx.font = '9.5px monospace';
          ctx.fillText(textRange, pipeX + pipeW / 2, py + ph / 2 + 2);
          ctx.fillText(textLength, pipeX + pipeW / 2, py + ph / 2 + 13);
        } else {
          // Right leader callout
          const midY = py + ph / 2;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(pipeX + pipeW - 4, midY); ctx.lineTo(pipeX + pipeW + 24, midY); ctx.stroke();
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(
            `${isSlotted ? 'SLOTTED' : 'PLAIN'}: ${pipe.startDepth}-${pipe.endDepth} ft (L=${pipe.endDepth - pipe.startDepth} ft)`,
            pipeX + pipeW + 28,
            midY + 3
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
        ctx.font = 'bold 11px monospace';
        const labelW = ctx.measureText(labelText).width + 16;

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#00AEEF';
        ctx.lineWidth = 1;
        const bx = strataX + (pipeX + pipeW - strataX - labelW) / 2;
        ctx.fillRect(bx, wly - 10, labelW, 20);
        ctx.strokeRect(bx, wly - 10, labelW, 20);

        ctx.fillStyle = '#00AEEF';
        ctx.textAlign = 'center';
        ctx.fillText(labelText, strataX + (pipeX + pipeW - strataX) / 2, wly + 4);
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

  return { exportPNG };
}
