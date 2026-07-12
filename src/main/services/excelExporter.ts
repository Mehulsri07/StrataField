/**
 * Excel Exporter Service.
 * Compiles borewell records into styled Excel workbooks using xlsx.
 */

import * as xlsx from 'xlsx';
import { borewellRepository } from '../database/borewellRepository';
import { strataRepository } from '../database/strataRepository';
import { pipeRepository } from '../database/pipeRepository';
import type { Borewell } from '../../shared/types';

export const excelExporter = {
  async exportRecords(
    borewellIds: string[],
    savePath: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    try {
      const workbook = xlsx.utils.book_new();

      // 1. Create a global Summary Sheet
      const summaryRows: any[][] = [
        ['STRATAFIELD GEOLOGICAL LOGS — BUNDLED EXPORT SUMMARY'],
        ['Export Date:', new Date().toLocaleDateString()],
        [],
        [
          'Borewell ID',
          'Owner Name',
          'Date Logged',
          'City',
          'Area / Locality',
          'Drilled Depth (ft)',
          'Bore Dia (in)',
          'Pipe Dia (in)',
          'Static Water Level (ft)',
          'Latitude',
          'Longitude',
          'Remarks'
        ]
      ];

      const borewellsData: Borewell[] = [];

      for (const id of borewellIds) {
        const borewell = borewellRepository.getById(id);
        if (!borewell) continue;
        borewellsData.push(borewell);

        summaryRows.push([
          borewell.borewellId,
          borewell.ownerName,
          new Date(borewell.date).toLocaleDateString(),
          borewell.city,
          borewell.area || 'N/A',
          borewell.totalDepth || 'N/A',
          borewell.boreDia || 'N/A',
          borewell.pipeDia || 'N/A',
          borewell.waterLevel || 'N/A',
          borewell.latitude || 'N/A',
          borewell.longitude || 'N/A',
          borewell.remarks || ''
        ]);
      }

      const summarySheet = xlsx.utils.aoa_to_sheet(summaryRows);
      
      // Auto-set column widths for summary sheet
      summarySheet['!cols'] = [
        { wch: 15 }, // ID
        { wch: 20 }, // Owner
        { wch: 12 }, // Date
        { wch: 15 }, // City
        { wch: 18 }, // Area
        { wch: 16 }, // Depth
        { wch: 12 }, // Bore Dia
        { wch: 12 }, // Pipe Dia
        { wch: 20 }, // Water Level
        { wch: 12 }, // Lat
        { wch: 12 }, // Lng
        { wch: 30 }  // Remarks
      ];

      xlsx.utils.book_append_sheet(workbook, summarySheet, 'Export Summary');

      // 2. Create individual detailed sheets for each borewell
      let currentIdx = 0;
      for (const borewell of borewellsData) {
        if (onProgress) {
          onProgress(currentIdx, borewellsData.length);
        }
        const strata = strataRepository.getByBorewellId(borewell.id);
        const pipes = pipeRepository.getByBorewellId(borewell.id);

        const detailRows: any[][] = [];

        // Borewell Header Info
        detailRows.push([`GEOLOGICAL LOG & WELL CASING Lowering DESIGN: ${borewell.borewellId}`]);
        detailRows.push(['Owner Name:', borewell.ownerName, '', 'Date Logged:', new Date(borewell.date).toLocaleDateString()]);
        detailRows.push(['City:', borewell.city, '', 'Area:', borewell.area || 'N/A']);
        detailRows.push(['Latitude:', borewell.latitude || 'N/A', '', 'Longitude:', borewell.longitude || 'N/A']);
        detailRows.push(['Site Address:', borewell.address || 'N/A']);
        detailRows.push([]); // blank

        // Specs block
        detailRows.push(['TECHNICAL SPECIFICATIONS']);
        detailRows.push(['Bore Diameter:', borewell.boreDia ? `${borewell.boreDia} inches` : 'N/A', '', 'Pipe Casing Diameter:', borewell.pipeDia ? `${borewell.pipeDia} inches` : 'N/A']);
        detailRows.push(['Total Drilled Depth:', borewell.totalDepth ? `${borewell.totalDepth} feet` : 'N/A', '', 'Static Water Level:', borewell.waterLevel ? `${borewell.waterLevel} feet` : 'N/A']);
        detailRows.push(['Driller Remarks:', borewell.remarks || 'No technical remarks entered.']);
        detailRows.push([]); // blank
        detailRows.push([]); // blank

        // Column Titles
        detailRows.push([
          'STRATA LOGGING DETAILS', '', '', '', '', '', '', 
          'CASING Lowering CONFIGURATION'
        ]);

        detailRows.push([
          'Layer #', 
          'Start Depth (ft)', 
          'End Depth (ft)', 
          'Thickness (ft)', 
          'Material Type', 
          'Color (Hex)', 
          'Remarks',
          '', // column divider gap
          'Segment #', 
          'Start Depth (ft)', 
          'End Depth (ft)', 
          'Segment Length (ft)',
          'Pipe Type (Casing)'
        ]);

        const maxRows = Math.max(strata.length, pipes.length);
        for (let i = 0; i < maxRows; i++) {
          const row: any[] = [];
          
          // Add Strata details
          if (i < strata.length) {
            const s = strata[i];
            row.push(
              i + 1,
              s.startDepth,
              s.endDepth,
              s.endDepth - s.startDepth,
              s.material,
              s.color,
              s.remarks || ''
            );
          } else {
            row.push('', '', '', '', '', '', '');
          }

          // Gap column
          row.push('');

          // Add Pipe segments
          if (i < pipes.length) {
            const p = pipes[i];
            row.push(
              i + 1,
              p.startDepth,
              p.endDepth,
              p.endDepth - p.startDepth,
              p.pipeType === 'slotted' ? 'SLOTTED (SCREEN)' : 'PLAIN (CASING)'
            );
          } else {
            row.push('', '', '', '', '');
          }

          detailRows.push(row);
        }

        const detailSheet = xlsx.utils.aoa_to_sheet(detailRows);

        // Adjust widths
        detailSheet['!cols'] = [
          { wch: 10 }, // Layer #
          { wch: 16 }, // Strata Start
          { wch: 16 }, // Strata End
          { wch: 16 }, // Thickness
          { wch: 18 }, // Material
          { wch: 12 }, // Color
          { wch: 25 }, // Strata Remarks
          { wch: 4  }, // Divider
          { wch: 12 }, // Pipe #
          { wch: 16 }, // Pipe Start
          { wch: 16 }, // Pipe End
          { wch: 20 }, // Length
          { wch: 22 }  // Type
        ];

        // Sheet name must not exceed 31 chars and contain restricted chars in Excel
        const sanitizedSheetName = borewell.borewellId.replace(/[\\/?:*[\]]/g, '_').substring(0, 31);
        xlsx.utils.book_append_sheet(workbook, detailSheet, sanitizedSheetName);
        currentIdx++;
      }

      if (onProgress) {
        onProgress(borewellsData.length, borewellsData.length);
      }

      // Write workbook file to target path
      xlsx.writeFile(workbook, savePath);
      console.log(`Successfully exported ${borewellIds.length} records to Excel: ${savePath}`);
    } catch (err) {
      console.error('Failed to generate Excel export:', err);
      throw err;
    }
  }
};
