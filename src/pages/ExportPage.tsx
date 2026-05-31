/**
 * ExportPage — Global report export utility.
 * Allows bundling multiple records to PDF and Excel.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { FileDown, ArrowLeft, CheckSquare, Square, FileText, FileSpreadsheet, Download, Search, X } from 'lucide-react';
import type { ExportFormat } from '@shared/types';

export function ExportPage() {
  const navigate = useNavigate();
  const borewells = useBorewellStore((s) => s.borewells);
  const addToast = useUIStore((s) => s.addToast);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!exporting) {
      setProgress(null);
      return;
    }

    const unsubscribe = window.api.export.onProgress((current, total) => {
      setProgress({ current, total });
    });

    return () => {
      unsubscribe();
    };
  }, [exporting]);

  const filteredBorewells = borewells.filter((b) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      b.ownerName?.toLowerCase().includes(query) ||
      b.borewellId?.toLowerCase().includes(query) ||
      b.city?.toLowerCase().includes(query) ||
      b.project?.toLowerCase().includes(query) ||
      b.area?.toLowerCase().includes(query)
    );
  });

  const toggleSelectAll = () => {
    if (filteredBorewells.length === 0) return;
    const allFilteredSelected = filteredBorewells.every((b) => selectedIds.includes(b.id));
    if (allFilteredSelected) {
      const filteredIds = filteredBorewells.map((b) => b.id);
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      const filteredIds = filteredBorewells.map((b) => b.id);
      setSelectedIds((prev) => {
        const next = [...prev];
        filteredIds.forEach((id) => {
          if (!next.includes(id)) {
            next.push(id);
          }
        });
        return next;
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleExport = async () => {
    if (selectedIds.length === 0) {
      addToast({ message: 'Please select at least one record to export.', type: 'warning' });
      return;
    }

    const defaultName = format === 'pdf'
      ? (selectedIds.length === 1 
          ? `Borewell_Report_${borewells.find(b => b.id === selectedIds[0])?.borewellId || 'Record'}.pdf`
          : `Borewell_Bundle_Report_${new Date().toISOString().split('T')[0]}.pdf`)
      : (selectedIds.length === 1
          ? `Borewell_Data_${borewells.find(b => b.id === selectedIds[0])?.borewellId || 'Record'}.xlsx`
          : `Borewell_Bundle_Data_${new Date().toISOString().split('T')[0]}.xlsx`);

    const filters = format === 'pdf'
      ? [{ name: 'PDF Documents', extensions: ['pdf'] }]
      : [{ name: 'Excel Workbooks', extensions: ['xlsx'] }];

    try {
      const dialogRes = await window.api.dialog.saveFile({
        title: format === 'pdf' ? 'Save PDF Report' : 'Save Excel Spreadsheet',
        defaultPath: defaultName,
        filters
      });

      if (dialogRes.canceled || !dialogRes.filePath) {
        return;
      }

      setExporting(true);

      const exportFunc = format === 'pdf' ? window.api.export.pdf : window.api.export.excel;
      const result = await exportFunc(selectedIds, dialogRes.filePath);

      if (result.success) {
        addToast({
          message: `Successfully exported ${selectedIds.length} record(s) as ${format.toUpperCase()}`,
          type: 'success',
        });
        setSelectedIds([]);
      } else {
        addToast({
          message: `Export failed: ${result.error || 'Unknown error'}`,
          type: 'error',
        });
      }
    } catch (err: any) {
      console.error('Export handling failed:', err);
      addToast({
        message: `System error: ${err.message || String(err)}`,
        type: 'error',
      });
    } finally {
      setExporting(false);
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
          <h1 className="text-xl font-bold text-txt-primary">Export Geological Reports</h1>
          <p className="text-2xs text-txt-muted">Compile and download professional borewell PDFs or Excel spreadsheets.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Side: Configuration Options */}
        <div className="md:col-span-1 space-y-4">
          <div className="sf-panel p-5 space-y-4 shadow-sf">
            <h2 className="text-sm font-bold text-txt-primary pb-2 border-b border-sf-border flex items-center gap-1.5">
              <FileDown size={16} className="text-accent" />
              <span>Export Format</span>
            </h2>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`
                  p-3 rounded-lg border text-left flex items-center gap-3 transition-all cursor-pointer
                  ${format === 'pdf'
                    ? 'border-accent bg-accent/5 text-accent-text'
                    : 'border-sf-border bg-sf-base text-txt-secondary hover:text-txt-primary'}
                `}
              >
                <div className={`p-2 rounded ${format === 'pdf' ? 'bg-accent/15' : 'bg-sf-surface-2'}`}>
                  <FileText size={20} />
                </div>
                <div>
                  <span className="text-xs font-bold block">PDF Document</span>
                  <span className="text-3xs text-txt-muted">Includes chart visualizations</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('excel')}
                className={`
                  p-3 rounded-lg border text-left flex items-center gap-3 transition-all cursor-pointer
                  ${format === 'excel'
                    ? 'border-accent bg-accent/5 text-accent-text'
                    : 'border-sf-border bg-sf-base text-txt-secondary hover:text-txt-primary'}
                `}
              >
                <div className={`p-2 rounded ${format === 'excel' ? 'bg-accent/15' : 'bg-sf-surface-2'}`}>
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <span className="text-xs font-bold block">Excel Spreadsheet</span>
                  <span className="text-3xs text-txt-muted">Includes raw strata tables</span>
                </div>
              </button>
            </div>

            <div className="pt-2">
              <button
                onClick={handleExport}
                disabled={exporting || selectedIds.length === 0}
                className="w-full sf-btn-primary flex items-center justify-center gap-2 py-2.5"
              >
                <Download size={16} />
                <span>{exporting ? 'Compiling...' : `Export Selected (${selectedIds.length})`}</span>
              </button>
            </div>

            {exporting && progress && (
              <div className="mt-4 p-3 bg-sf-base border border-sf-border rounded-lg space-y-2">
                <div className="flex justify-between text-3xs font-semibold text-txt-secondary">
                  <span>
                    {progress.current >= progress.total
                      ? 'Saving file...'
                      : `Compiling record ${progress.current + 1} of ${progress.total}...`}
                  </span>
                  <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-sf-surface border border-sf-border rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-accent h-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Records List */}
        <div className="md:col-span-2 space-y-4">
          <div className="sf-panel p-5 flex flex-col h-[500px] shadow-sf">
            <div className="flex justify-between items-center pb-3 border-b border-sf-border mb-3">
              <h2 className="text-sm font-bold text-txt-primary">Select Records to Include</h2>
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 text-xs text-accent hover:underline font-semibold"
              >
                {filteredBorewells.length > 0 && filteredBorewells.every((b) => selectedIds.includes(b.id)) ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {/* Search Bar */}
            <div className="mb-3 relative select-text">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-txt-muted">
                <Search size={15} />
              </div>
              <input
                type="text"
                placeholder="Search by owner, ID, city, project, area..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-sf-base border border-sf-border rounded-lg text-xs text-txt-primary placeholder-txt-muted transition-all focus:border-accent focus:ring-1 focus:ring-accent-muted outline-none shadow-2xs select-text"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-3 flex items-center text-txt-muted hover:text-txt-primary"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredBorewells.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-txt-muted text-xs gap-1 border border-dashed border-sf-border rounded-lg py-20">
                  <Search size={24} />
                  <span>No matching records found</span>
                </div>
              ) : (
                filteredBorewells.map((b) => {
                  const isSelected = selectedIds.includes(b.id);
                  return (
                    <div
                      key={b.id}
                      onClick={() => toggleSelect(b.id)}
                      className={`
                        p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all
                        ${isSelected ? 'bg-sf-surface-2 border-accent' : 'bg-sf-base border-sf-border hover:border-sf-border-2'}
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <button className="text-accent">
                          {isSelected ? <CheckSquare size={18} /> : <Square size={18} className="text-txt-muted" />}
                        </button>
                        <div>
                          <span className="text-xs font-bold text-txt-primary block leading-tight">
                            {b.ownerName}
                          </span>
                          <span className="text-3xs text-txt-muted">
                            ID: {b.borewellId} | {b.city}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-semibold text-txt-primary block">
                          {b.totalDepth ? `${b.totalDepth} ft` : 'N/A'}
                        </span>
                        <span className="text-3xs text-txt-muted">
                          {new Date(b.date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default ExportPage;
