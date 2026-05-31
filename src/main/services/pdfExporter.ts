/**
 * PDF Exporter Service.
 * Compiles borewell records into styled A4 geological log reports using pdf-lib.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'node:fs';
import { borewellRepository } from '../database/borewellRepository';
import { strataRepository } from '../database/strataRepository';
import { pipeRepository } from '../database/pipeRepository';
import { mergeStrataLayers, mergePipeSegments } from '../../shared/profileUtils';


// Helper to parse hex color into pdf-lib rgb values
function parseHexColor(hex: string) {
  try {
    const clean = hex.replace('#', '');
    if (clean.length === 3) {
      const r = parseInt(clean[0] + clean[0], 16) / 255;
      const g = parseInt(clean[1] + clean[1], 16) / 255;
      const b = parseInt(clean[2] + clean[2], 16) / 255;
      return rgb(r, g, b);
    }
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    return rgb(
      isNaN(r) ? 0.5 : r,
      isNaN(g) ? 0.5 : g,
      isNaN(b) ? 0.5 : b
    );
  } catch {
    return rgb(0.5, 0.5, 0.5);
  }
}

// Helper to wrap text inside a given width
function wrapText(text: string, maxWidth: number, fontSize: number, font: any): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    if (width > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

export const pdfExporter = {
  async exportRecords(
    borewellIds: string[],
    savePath: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    try {
      const pdfDoc = await PDFDocument.create();

      // Embed standard fonts
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const courier = await pdfDoc.embedFont(StandardFonts.Courier);

      let pageIndex = 1;
      let currentIdx = 0;

      for (const id of borewellIds) {
        if (onProgress) {
          onProgress(currentIdx, borewellIds.length);
        }

        const borewell = borewellRepository.getById(id);
        if (!borewell) {
          currentIdx++;
          continue;
        }

        const rawStrata = strataRepository.getByBorewellId(id);
        const rawPipes = pipeRepository.getByBorewellId(id);

        const strata = mergeStrataLayers(rawStrata);
        const pipes = mergePipeSegments(rawPipes);

        // A4 page size: 595.27 x 841.89 points
        const page = pdfDoc.addPage([595.27, 841.89]);
        const { width, height } = page.getSize();

        // 1. Draw Page Border & Theme Outline
        page.drawRectangle({
          x: 20,
          y: 20,
          width: width - 40,
          height: height - 40,
          borderColor: rgb(0.85, 0.87, 0.9),
          borderWidth: 1,
        });

        // 2. Draw Top Header Banner (Deep Navy theme)
        page.drawRectangle({
          x: 25,
          y: height - 65,
          width: width - 50,
          height: 40,
          color: rgb(0.086, 0.106, 0.133), // Deep Navy
        });

        page.drawText('GEOLOGICAL BOREWELL LOG REPORT', {
          x: 40,
          y: height - 48,
          size: 13,
          font: helveticaBold,
          color: rgb(1, 1, 1),
        });

        page.drawText(`System Log: ${borewell.borewellId}`, {
          x: width - 200,
          y: height - 48,
          size: 10,
          font: helvetica,
          color: rgb(0.91, 0.48, 0.21), // Gold accent
        });

        // 3. Metadata Table Area (Box containing details)
        const tableY = height - 190;
        const tableH = 110;
        const tableW = width - 50;

        page.drawRectangle({
          x: 25,
          y: tableY,
          width: tableW,
          height: tableH,
          color: rgb(0.96, 0.97, 0.98),
          borderColor: rgb(0.85, 0.87, 0.9),
          borderWidth: 1,
        });

        // Draw horizontal grid lines inside metadata box
        page.drawLine({ start: { x: 25, y: tableY + 73 }, end: { x: 25 + tableW, y: tableY + 73 }, thickness: 0.8, color: rgb(0.85, 0.87, 0.9) });
        page.drawLine({ start: { x: 25, y: tableY + 36 }, end: { x: 25 + tableW, y: tableY + 36 }, thickness: 0.8, color: rgb(0.85, 0.87, 0.9) });

        // Draw vertical grid lines
        const col1 = 25 + 130;
        const col2 = 25 + 260;
        const col3 = 25 + 390;
        page.drawLine({ start: { x: col1, y: tableY }, end: { x: col1, y: tableY + tableH }, thickness: 0.8, color: rgb(0.85, 0.87, 0.9) });
        page.drawLine({ start: { x: col2, y: tableY }, end: { x: col2, y: tableY + tableH }, thickness: 0.8, color: rgb(0.85, 0.87, 0.9) });
        page.drawLine({ start: { x: col3, y: tableY }, end: { x: col3, y: tableY + tableH }, thickness: 0.8, color: rgb(0.85, 0.87, 0.9) });

        const drawCell = (xPos: number, yPos: number, title: string, value: string) => {
          page.drawText(title.toUpperCase(), { x: xPos + 8, y: yPos + 24, size: 7, font: helveticaBold, color: rgb(0.5, 0.5, 0.5) });
          const cleanedVal = value && value !== 'null' ? value : 'N/A';
          // Truncate value if it's too long
          const truncated = helvetica.widthOfTextAtSize(cleanedVal, 8.5) > 115 
            ? cleanedVal.substring(0, 18) + '...'
            : cleanedVal;
          page.drawText(truncated, { x: xPos + 8, y: yPos + 10, size: 8.5, font: helveticaBold, color: rgb(0.1, 0.12, 0.15) });
        };

        // Row 1 (y = tableY + 73)
        drawCell(25, tableY + 73, 'Owner Name', borewell.ownerName);
        drawCell(col1, tableY + 73, 'Borewell ID', borewell.borewellId);
        drawCell(col2, tableY + 73, 'Date', new Date(borewell.date).toLocaleDateString());
        drawCell(col3, tableY + 73, 'Bore Diameter', borewell.boreDia ? `${borewell.boreDia}"` : 'N/A');

        // Row 2 (y = tableY + 36)
        drawCell(25, tableY + 36, 'City', borewell.city);
        drawCell(col1, tableY + 36, 'Area / Locality', borewell.area);
        drawCell(col2, tableY + 36, 'Latitude', borewell.latitude?.toFixed(5) || 'N/A');
        drawCell(col3, tableY + 36, 'Longitude', borewell.longitude?.toFixed(5) || 'N/A');

        // Row 3 (y = tableY)
        drawCell(25, tableY, 'Lowering Dia', borewell.pipeDia ? `${borewell.pipeDia}"` : 'N/A');
        drawCell(col1, tableY, 'Drilled Depth', borewell.totalDepth ? `${borewell.totalDepth} ft` : 'N/A');
        drawCell(col2, tableY, 'Static Water Table', borewell.waterLevel ? `${borewell.waterLevel} ft` : 'N/A');
        drawCell(col3, tableY, 'Full Address', borewell.address);

        // 4. Section Header: Geological Profile & Casing Design
        const profileHeaderY = tableY - 25;
        page.drawText('PHYSICAL STRATA & CASING Lowering DESIGN', {
          x: 25,
          y: profileHeaderY,
          size: 9.5,
          font: helveticaBold,
          color: rgb(0.086, 0.106, 0.133),
        });

        page.drawLine({
          start: { x: 25, y: profileHeaderY - 4 },
          end: { x: width - 25, y: profileHeaderY - 4 },
          thickness: 1,
          color: rgb(0.91, 0.48, 0.21),
        });

        // 5. Drawing Visual Columns Canvas
        const chartTopY = profileHeaderY - 20;
        const chartH = 260; // vertical size of chart
        const totalDepth = borewell.totalDepth || 250;

        // Visual Layout limits:
        // Ruler at x = 30 to 70
        // Strata column at x = 75 to 205 (width 130)
        // Casing/Pipe column at x = 220 to 290 (width 70)
        // Detailed Layer Summary at x = 310 to 565 (width 255)

        // Ruler Line
        const rulerX = 65;
        page.drawLine({
          start: { x: rulerX, y: chartTopY },
          end: { x: rulerX, y: chartTopY - chartH },
          thickness: 0.8,
          color: rgb(0.5, 0.5, 0.5),
        });

        // Ruler Ticks (divided into 5 layers)
        const tickStep = totalDepth / 5;
        for (let i = 0; i <= 5; i++) {
          const depthVal = Math.round(i * tickStep);
          const valY = chartTopY - (depthVal / totalDepth) * chartH;
          
          // Tick line
          page.drawLine({
            start: { x: rulerX - 4, y: valY },
            end: { x: rulerX, y: valY },
            thickness: 0.8,
            color: rgb(0.5, 0.5, 0.5),
          });

          // Text label
          page.drawText(`${depthVal} ft`, {
            x: 25,
            y: valY - 2.5,
            size: 7.5,
            font: courier,
            color: rgb(0.4, 0.4, 0.4),
          });
        }

        // Strata Column
        const strataX = 75;
        const strataW = 130;

        // Draw Strata background/border box
        page.drawRectangle({
          x: strataX,
          y: chartTopY - chartH,
          width: strataW,
          height: chartH,
          borderColor: rgb(0.3, 0.3, 0.3),
          borderWidth: 1.2,
        });

        // Draw Strata layers
        strata.forEach((layer) => {
          const startRel = layer.startDepth / totalDepth;
          const endRel = layer.endDepth / totalDepth;
          
          const yStart = chartTopY - startRel * chartH;
          const yEnd = chartTopY - endRel * chartH;
          const lH = yStart - yEnd;

          if (lH <= 0) return;

          // Paint strata background
          page.drawRectangle({
            x: strataX + 0.5,
            y: yEnd,
            width: strataW - 1,
            height: lH,
            color: parseHexColor(layer.color),
          });

          // Draw bottom boundary separator
          page.drawLine({
            start: { x: strataX, y: yEnd },
            end: { x: strataX + strataW, y: yEnd },
            thickness: 0.6,
            color: rgb(1, 1, 1),
          });

          // Label inside layer (only if height is big enough)
          if (lH >= 24) {
            const labelStr = layer.material.toUpperCase();
            const rangeStr = `${layer.startDepth} - ${layer.endDepth} ft`;
            const thicknessStr = `Thickness: ${layer.endDepth - layer.startDepth} ft`;

            const textW1 = helveticaBold.widthOfTextAtSize(labelStr, 9.5);
            const textW2 = helvetica.widthOfTextAtSize(rangeStr, 8);
            const textW3 = helvetica.widthOfTextAtSize(thicknessStr, 8);
            
            page.drawText(labelStr, {
              x: strataX + (strataW - textW1) / 2,
              y: yEnd + lH / 2 + 7,
              size: 9.5,
              font: helveticaBold,
              color: rgb(1, 1, 1),
            });
            page.drawText(rangeStr, {
              x: strataX + (strataW - textW2) / 2,
              y: yEnd + lH / 2 - 2,
              size: 8,
              font: helvetica,
              color: rgb(0.95, 0.95, 0.95),
            });
            page.drawText(thicknessStr, {
              x: strataX + (strataW - textW3) / 2,
              y: yEnd + lH / 2 - 11,
              size: 8,
              font: helvetica,
              color: rgb(0.9, 0.9, 0.9),
            });
          } else if (lH >= 14) {
            const labelStr = `${layer.material} (${layer.startDepth}-${layer.endDepth} ft)`;
            const textW = helveticaBold.widthOfTextAtSize(labelStr, 9.5);
            page.drawText(labelStr, {
              x: strataX + (strataW - textW) / 2,
              y: yEnd + lH / 2 - 3.5,
              size: 9.5,
              font: helveticaBold,
              color: rgb(1, 1, 1),
            });
          }
        });

        // Pipe Lowering Column
        const pipeX = 220;
        const pipeW = 70;

        // Draw Pipe border box
        page.drawRectangle({
          x: pipeX,
          y: chartTopY - chartH,
          width: pipeW,
          height: chartH,
          color: rgb(0.05, 0.05, 0.08), // dark casing well background
          borderColor: rgb(0.3, 0.3, 0.3),
          borderWidth: 1.2,
        });

        pipes.forEach((segment) => {
          const startRel = segment.startDepth / totalDepth;
          const endRel = segment.endDepth / totalDepth;

          const yStart = chartTopY - startRel * chartH;
          const yEnd = chartTopY - endRel * chartH;
          const pH = yStart - yEnd;

          if (pH <= 0) return;

          const isSlotted = segment.pipeType === 'slotted';

          // Casing background
          page.drawRectangle({
            x: pipeX + 0.5,
            y: yEnd,
            width: pipeW - 1,
            height: pH,
            color: isSlotted ? rgb(0.18, 0.38, 0.58) : rgb(0.95, 0.95, 0.95), // Slate Blue or Plain Casing White
          });

          // Slotted Pipe hatch marks
          if (isSlotted) {
            const stripeStep = 6;
            for (let drawY = yEnd + 3; drawY < yStart - 3; drawY += stripeStep) {
              page.drawLine({
                start: { x: pipeX + 5, y: drawY },
                end: { x: pipeX + pipeW - 5, y: drawY + 2.5 },
                thickness: 0.8,
                color: rgb(1, 1, 1),
              });
            }
          }

          // Casing separator
          page.drawLine({
            start: { x: pipeX, y: yEnd },
            end: { x: pipeX + pipeW, y: yEnd },
            thickness: 0.6,
            color: rgb(0.3, 0.3, 0.3),
          });

          // Text label
          if (pH >= 26) {
            const labelStr = isSlotted ? 'SLOTTED PIPE' : 'PLAIN PIPE';
            const rangeStr = `${segment.startDepth} - ${segment.endDepth} ft`;
            const lengthStr = `Length: ${segment.endDepth - segment.startDepth} ft`;

            const textW1 = helveticaBold.widthOfTextAtSize(labelStr, 9);
            const textW2 = helvetica.widthOfTextAtSize(rangeStr, 7.5);
            const textW3 = helvetica.widthOfTextAtSize(lengthStr, 7.5);

            page.drawText(labelStr, {
              x: pipeX + (pipeW - textW1) / 2,
              y: yEnd + pH / 2 + 7,
              size: 9,
              font: helveticaBold,
              color: isSlotted ? rgb(1, 1, 1) : rgb(0.2, 0.2, 0.2),
            });
            page.drawText(rangeStr, {
              x: pipeX + (pipeW - textW2) / 2,
              y: yEnd + pH / 2 - 2,
              size: 7.5,
              font: helvetica,
              color: isSlotted ? rgb(0.9, 0.9, 0.9) : rgb(0.3, 0.3, 0.3),
            });
            page.drawText(lengthStr, {
              x: pipeX + (pipeW - textW3) / 2,
              y: yEnd + pH / 2 - 11,
              size: 7.5,
              font: helvetica,
              color: isSlotted ? rgb(0.9, 0.9, 0.9) : rgb(0.3, 0.3, 0.3),
            });
          } else if (pH >= 14) {
            const labelStr = isSlotted ? 'SLOTTED' : 'PLAIN';
            const textW = helveticaBold.widthOfTextAtSize(labelStr, 9);
            page.drawText(labelStr, {
              x: pipeX + (pipeW - textW) / 2,
              y: yEnd + pH / 2 - 3,
              size: 9,
              font: helveticaBold,
              color: isSlotted ? rgb(1, 1, 1) : rgb(0.2, 0.2, 0.2),
            });
          }
        });

        // Columns title label indicators
        page.drawText('GEOLOGICAL STRATA', { x: strataX + 15, y: chartTopY + 5, size: 7.5, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) });
        page.drawText('PIPE LOWERING', { x: pipeX + 5, y: chartTopY + 5, size: 7.5, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) });

        // 6. Geological Strata Legend (Right Panel layout)
        const summaryX = 305;
        const summaryW = width - 25 - summaryX;

        page.drawText('GEOLOGICAL STRATA LEGEND', {
          x: summaryX + 10,
          y: chartTopY + 5,
          size: 7.5,
          font: helveticaBold,
          color: rgb(0.4, 0.4, 0.4),
        });

        // Inner frame box for details
        page.drawRectangle({
          x: summaryX,
          y: chartTopY - chartH,
          width: summaryW,
          height: chartH,
          borderColor: rgb(0.85, 0.87, 0.9),
          borderWidth: 1,
        });

        // Compute unique materials and stats
        const uniqueMaterials: { material: string; color: string }[] = [];
        const seenMaterials = new Set<string>();
        const materialStats: Record<string, { totalThickness: number; layersCount: number }> = {};

        strata.forEach((layer) => {
          const key = layer.material.toLowerCase().trim();
          const thickness = layer.endDepth - layer.startDepth;

          if (!materialStats[key]) {
            materialStats[key] = { totalThickness: 0, layersCount: 0 };
          }
          materialStats[key].totalThickness += thickness;
          materialStats[key].layersCount += 1;

          if (!seenMaterials.has(key)) {
            seenMaterials.add(key);
            uniqueMaterials.push({
              material: layer.material.trim(),
              color: layer.color,
            });
          }
        });

        let legendItemY = chartTopY - 22;
        uniqueMaterials.forEach((item) => {
          if (legendItemY < chartTopY - chartH + 20) return; // avoid drawing past bottom boundary

          const key = item.material.toLowerCase().trim();
          const stats = materialStats[key];

          // Draw small color pill representation
          page.drawRectangle({
            x: summaryX + 12,
            y: legendItemY,
            width: 16,
            height: 11,
            color: parseHexColor(item.color),
            borderColor: rgb(0.3, 0.3, 0.3),
            borderWidth: 0.6,
          });

          // Material Name (bold, uppercase)
          page.drawText(item.material.toUpperCase(), {
            x: summaryX + 36,
            y: legendItemY + 3,
            size: 8.5,
            font: helveticaBold,
            color: rgb(0.1, 0.12, 0.15),
          });

          // Stats: total thickness & layer count
          const statsText = `Total Thickness: ${stats.totalThickness} ft (${stats.layersCount} layer${stats.layersCount > 1 ? 's' : ''})`;
          page.drawText(statsText, {
            x: summaryX + 36,
            y: legendItemY - 6,
            size: 7.5,
            font: helvetica,
            color: rgb(0.4, 0.42, 0.45),
          });

          legendItemY -= 26; // advance down for next item
        });

        // 7. Remarks Section
        const remarksHeaderY = chartTopY - chartH - 20;
        page.drawText("DRILLER'S TECHNICAL OBSERVATIONS / REMARKS", {
          x: 25,
          y: remarksHeaderY,
          size: 9.5,
          font: helveticaBold,
          color: rgb(0.086, 0.106, 0.133),
        });

        page.drawLine({
          start: { x: 25, y: remarksHeaderY - 4 },
          end: { x: width - 25, y: remarksHeaderY - 4 },
          thickness: 1,
          color: rgb(0.91, 0.48, 0.21),
        });

        const remarksBoxY = remarksHeaderY - 80;
        page.drawRectangle({
          x: 25,
          y: remarksBoxY,
          width: width - 50,
          height: 70,
          color: rgb(0.98, 0.98, 0.99),
          borderColor: rgb(0.85, 0.87, 0.9),
          borderWidth: 1,
        });

        const wrappedRemarks = wrapText(
          borewell.remarks || 'No detailed geological observation remarks were recorded for this borewell.',
          width - 80,
          8.5,
          helvetica
        );

        let remLineY = remarksBoxY + 54;
        wrappedRemarks.forEach((line) => {
          if (remLineY > remarksBoxY + 5) {
            page.drawText(line, {
              x: 38,
              y: remLineY,
              size: 8.5,
              font: helvetica,
              color: rgb(0.2, 0.22, 0.25),
            });
            remLineY -= 12;
          }
        });

        // 8. Footer Info
        page.drawLine({
          start: { x: 25, y: 40 },
          end: { x: width - 25, y: 40 },
          thickness: 0.6,
          color: rgb(0.85, 0.87, 0.9),
        });

        page.drawText('Generated by StrataField Geological Logs System', {
          x: 30,
          y: 28,
          size: 7.5,
          font: helvetica,
          color: rgb(0.5, 0.5, 0.5),
        });

        page.drawText(`Page ${pageIndex} of ${borewellIds.length}`, {
          x: width - 80,
          y: 28,
          size: 7.5,
          font: helvetica,
          color: rgb(0.5, 0.5, 0.5),
        });

        pageIndex++;
        currentIdx++;
      }

      if (onProgress) {
        onProgress(borewellIds.length, borewellIds.length);
      }

      // Serialize standard PDF document buffer and save
      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(savePath, pdfBytes);
      console.log(`Successfully exported ${borewellIds.length} records to PDF: ${savePath}`);
    } catch (err) {
      console.error('Failed to generate PDF export:', err);
      throw err;
    }
  }
};
