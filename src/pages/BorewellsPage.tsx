/**
 * BorewellsPage — Redesigned Borewells Hub.
 * Search, filter, view, edit, and delete borewell records in one consolidated page.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { APP_DEFAULTS } from '@shared/constants';
import { 
  Search, SlidersHorizontal, MapPin, Calendar, FileText, ArrowRight, Eye, 
  Trash2, Layers, FolderGit, X, Star, ChevronDown, ChevronUp, Edit3,
  CheckSquare, Square, Download
} from 'lucide-react';
import type { SearchField } from '@shared/types';

export function BorewellsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const borewells = useBorewellStore((s) => s.borewells);
  const searchResults = useBorewellStore((s) => s.searchResults);
  const searchFilters = useBorewellStore((s) => s.searchFilters);
  const setSearchFilters = useBorewellStore((s) => s.setSearchFilters);
  const searchBorewells = useBorewellStore((s) => s.searchBorewells);
  const deleteBorewell = useBorewellStore((s) => s.deleteBorewell);
  const addToast = useUIStore((s) => s.addToast);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Debounce ref for search
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Bulk select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isBulkMode = selectedIds.size > 0;

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Dynamic projects list extracted from active records
  const uniqueProjects = Array.from(
    new Set(borewells.map((b) => b.project || 'Default Project'))
  ).filter(Boolean).sort();

  // Quick Saved Search Templates
  const SAVED_SEARCHES = [
    { label: 'All Records', query: '', filters: { field: 'all' as SearchField, project: '', city: '', material: '', dateFrom: '', dateTo: '', minDepth: undefined as number | undefined, maxDepth: undefined as number | undefined } },
    { label: 'Deep Borewells (>200ft)', query: '', filters: { field: 'all' as SearchField, project: '', city: '', material: '', dateFrom: '', dateTo: '', minDepth: 200, maxDepth: undefined as number | undefined } },
    { label: 'Clay Stratum Logs', query: '', filters: { field: 'all' as SearchField, project: '', city: '', material: 'clay', dateFrom: '', dateTo: '', minDepth: undefined as number | undefined, maxDepth: undefined as number | undefined } },
    { label: 'Recent Active Site', query: '', filters: { field: 'all' as SearchField, project: 'Default Project', city: '', material: '', dateFrom: '', dateTo: '', minDepth: undefined as number | undefined, maxDepth: undefined as number | undefined } }
  ];

  // Sync state navigation (e.g. if loaded from dashboard with predefined project/query)
  useEffect(() => {
    if (location.state?.focusProject || location.state?.projectFilter) {
      const proj = location.state?.projectFilter || '';
      setShowFilters(true);
      setSearchFilters({ project: proj, field: 'all' as SearchField });
      searchBorewells(searchFilters.query);
    }
  }, [location.state]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchFilters({ query: value });
    // Debounced search — prevents a full SQLite query on every keystroke
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      searchBorewells(value);
    }, APP_DEFAULTS.SEARCH_DEBOUNCE_MS);
  };

  const handleFieldChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const field = e.target.value as SearchField;
    setSearchFilters({ field });
    searchBorewells(searchFilters.query);
  };

  const applySavedSearch = (saved: typeof SAVED_SEARCHES[0]) => {
    setSearchFilters({ query: saved.query, ...saved.filters });
    searchBorewells(saved.query);
    addToast({ message: `Loaded saved template: ${saved.label}`, type: 'success' });
  };

  const clearFilter = (key: keyof typeof searchFilters) => {
    const fresh: any = {};
    fresh[key] = key === 'minDepth' || key === 'maxDepth' ? undefined : '';
    setSearchFilters(fresh);
    searchBorewells(searchFilters.query);
  };

  const handleDelete = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget({ id, name });
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteBorewell(deleteTarget.id);
      addToast({ message: 'Record moved to Recycle Bin.', type: 'info' });
      setDeleteTarget(null);
    }
  };

  // Bulk select helpers
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === searchResults.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(searchResults.map(b => b.id)));
    }
  };

  const handleBulkExport = () => {
    const ids = Array.from(selectedIds);
    navigate('/export', { state: { preselectedIds: ids } });
  };

  // Check if any advanced filters are active
  const hasActiveFilters = 
    searchFilters.project || 
    searchFilters.city || 
    searchFilters.material || 
    searchFilters.dateFrom || 
    searchFilters.dateTo ||
    searchFilters.minDepth != null ||
    searchFilters.maxDepth != null;

  return (
    <div className="p-6 max-w-[100rem] mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-txt-primary">Borewell Records</h1>
        <p className="text-2xs text-txt-muted">Search, filter, view, edit, or delete borewell installations and strata logs.</p>
      </div>

      {/* Saved Searches / Shortcuts */}
      <div className="flex flex-wrap items-center gap-2 text-2xs select-none">
        <span className="text-txt-muted font-bold flex items-center gap-1">
          <Star size={12} className="text-amber-500 fill-amber-500" />
          <span>Quick Views:</span>
        </span>
        {SAVED_SEARCHES.map((saved) => (
          <button
            key={saved.label}
            onClick={() => applySavedSearch(saved)}
            className="px-2.5 py-1 rounded bg-sf-surface border border-sf-border text-txt-secondary hover:text-txt-primary hover:border-sf-border-2 transition-all cursor-pointer font-semibold"
          >
            {saved.label}
          </button>
        ))}
      </div>

      {/* Prominent Search Bar & Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {/* Main search box */}
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-txt-muted">
              <Search size={18} />
            </div>
            <input
              type="text"
              placeholder="Search by ID, owner, city, project, remarks, or soil materials..."
              value={searchFilters.query}
              onChange={handleQueryChange}
              className="w-full pl-11 pr-4 py-3 bg-sf-surface border border-sf-border rounded-xl text-sm text-txt-primary placeholder-txt-muted transition-all focus:border-accent focus:ring-2 focus:ring-accent-muted outline-none shadow-sm"
            />
          </div>

          <select
            value={searchFilters.field}
            onChange={handleFieldChange}
            className="px-4 py-3 bg-sf-surface border border-sf-border rounded-xl text-xs font-semibold text-txt-primary focus:border-accent focus:ring-2 focus:ring-accent-muted outline-none cursor-pointer"
          >
            <option value="all">All Fields</option>
            <option value="borewellId">Borewell ID</option>
            <option value="ownerName">Owner Name</option>
            <option value="project">Project</option>
            <option value="city">City</option>
            <option value="area">Area</option>
          </select>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              showFilters || hasActiveFilters 
                ? 'bg-accent/10 border-accent text-accent' 
                : 'bg-sf-surface border-sf-border text-txt-secondary hover:text-txt-primary hover:border-sf-border-2'
            }`}
          >
            <SlidersHorizontal size={14} />
            <span>Filters</span>
          </button>
        </div>

        {/* Extended Filters */}
        {showFilters && (
          <div className="sf-panel p-5 grid grid-cols-1 md:grid-cols-5 gap-4 animate-slide-down text-xs">
            <div>
              <label className="sf-label">Filter by Project</label>
              <select
                value={searchFilters.project || ''}
                className="sf-input mt-1.5 cursor-pointer font-semibold"
                onChange={(e) => {
                  setSearchFilters({ project: e.target.value });
                  searchBorewells(searchFilters.query);
                }}
              >
                <option value="">All Projects</option>
                {uniqueProjects.map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="sf-label">Filter by City</label>
              <input
                type="text"
                placeholder="e.g. New Delhi"
                value={searchFilters.city || ''}
                className="sf-input mt-1.5"
                onChange={(e) => {
                  setSearchFilters({ city: e.target.value });
                  searchBorewells(searchFilters.query);
                }}
              />
            </div>
            <div>
              <label className="sf-label">Filter by Soil Material</label>
              <input
                type="text"
                placeholder="e.g. clay"
                value={searchFilters.material || ''}
                className="sf-input mt-1.5"
                onChange={(e) => {
                  setSearchFilters({ material: e.target.value });
                  searchBorewells(searchFilters.query);
                }}
              />
            </div>
            <div>
              <label className="sf-label">From Date</label>
              <input
                type="date"
                value={searchFilters.dateFrom || ''}
                className="sf-input mt-1.5"
                onChange={(e) => {
                  setSearchFilters({ dateFrom: e.target.value });
                  searchBorewells(searchFilters.query);
                }}
              />
            </div>
            <div>
              <label className="sf-label">To Date</label>
              <input
                type="date"
                value={searchFilters.dateTo || ''}
                className="sf-input mt-1.5"
                onChange={(e) => {
                  setSearchFilters({ dateTo: e.target.value });
                  searchBorewells(searchFilters.query);
                }}
              />
            </div>
            {/* Depth Range Filters */}
            <div>
              <label className="sf-label">Min Depth (ft)</label>
              <input
                type="number"
                placeholder="e.g. 100"
                value={searchFilters.minDepth ?? ''}
                className="sf-input mt-1.5"
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  setSearchFilters({ minDepth: val });
                  searchBorewells(searchFilters.query);
                }}
              />
            </div>
            <div>
              <label className="sf-label">Max Depth (ft)</label>
              <input
                type="number"
                placeholder="e.g. 500"
                value={searchFilters.maxDepth ?? ''}
                className="sf-input mt-1.5"
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  setSearchFilters({ maxDepth: val });
                  searchBorewells(searchFilters.query);
                }}
              />
            </div>
          </div>
        )}

        {/* Filter Chips Pills */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 mt-1 animate-fade-in text-3xs select-none">
            <span className="text-txt-muted font-bold">Active Filters:</span>
            {searchFilters.project && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-muted text-accent font-bold">
                Project: {searchFilters.project}
                <button onClick={() => clearFilter('project')} className="hover:text-txt-primary cursor-pointer"><X size={10} /></button>
              </span>
            )}
            {searchFilters.city && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-muted text-accent font-bold">
                City: {searchFilters.city}
                <button onClick={() => clearFilter('city')} className="hover:text-txt-primary cursor-pointer"><X size={10} /></button>
              </span>
            )}
            {searchFilters.material && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-muted text-accent font-bold">
                Soil: {searchFilters.material}
                <button onClick={() => clearFilter('material')} className="hover:text-txt-primary cursor-pointer"><X size={10} /></button>
              </span>
            )}
            {searchFilters.dateFrom && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-muted text-accent font-bold">
                From: {searchFilters.dateFrom}
                <button onClick={() => clearFilter('dateFrom')} className="hover:text-txt-primary cursor-pointer"><X size={10} /></button>
              </span>
            )}
            {searchFilters.dateTo && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-muted text-accent font-bold">
                To: {searchFilters.dateTo}
                <button onClick={() => clearFilter('dateTo')} className="hover:text-txt-primary cursor-pointer"><X size={10} /></button>
              </span>
            )}
            {searchFilters.minDepth != null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-muted text-accent font-bold">
                Min Depth: {searchFilters.minDepth}ft
                <button onClick={() => clearFilter('minDepth')} className="hover:text-txt-primary cursor-pointer"><X size={10} /></button>
              </span>
            )}
            {searchFilters.maxDepth != null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-muted text-accent font-bold">
                Max Depth: {searchFilters.maxDepth}ft
                <button onClick={() => clearFilter('maxDepth')} className="hover:text-txt-primary cursor-pointer"><X size={10} /></button>
              </span>
            )}
            <button
              onClick={() => {
                setSearchFilters({ project: '', city: '', material: '', dateFrom: '', dateTo: '', minDepth: undefined, maxDepth: undefined });
                searchBorewells(searchFilters.query);
              }}
              className="text-txt-muted hover:text-danger font-bold cursor-pointer"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* Bulk Select Toolbar */}
      {isBulkMode && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-accent/10 border border-accent/30 rounded-xl animate-slide-down text-xs select-none">
          <button onClick={toggleSelectAll} className="text-accent font-bold hover:underline cursor-pointer">
            {selectedIds.size === searchResults.length ? 'Deselect All' : 'Select All'}
          </button>
          <span className="text-txt-secondary font-semibold">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <button
            onClick={handleBulkExport}
            className="sf-btn-primary py-1.5 px-3 text-2xs flex items-center gap-1.5"
          >
            <Download size={12} />
            <span>Export Selected</span>
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-txt-muted hover:text-txt-primary cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Search Results */}
      <div className="space-y-4">
        {searchResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-sf-border rounded-xl text-txt-muted text-xs gap-1 bg-sf-surface/50">
            <span>No matching borewell records found</span>
            <span className="text-3xs text-txt-muted">Check spelling or clear active advanced filter fields.</span>
          </div>
        ) : (
          searchResults.map((b) => {
            const isExpanded = expandedId === b.id;
            const isSelected = selectedIds.has(b.id);
            return (
              <div
                key={b.id}
                onClick={() => setExpandedId(isExpanded ? null : b.id)}
                className={`
                  sf-card flex flex-col gap-4 border transition-all cursor-pointer select-none
                  ${isExpanded ? 'border-accent ring-1 ring-accent-muted shadow-md' : isSelected ? 'border-accent/50 bg-accent/5' : 'border-sf-border hover:border-sf-border-2'}
                `}
              >
                {/* Header info (Always Visible) */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div className="flex items-center gap-3">
                    {/* Bulk select checkbox */}
                    <button
                      onClick={(e) => toggleSelect(b.id, e)}
                      className="p-0.5 text-txt-muted hover:text-accent transition-colors cursor-pointer flex-shrink-0"
                      title="Select for bulk export"
                    >
                      {isSelected ? <CheckSquare size={16} className="text-accent" /> : <Square size={16} />}
                    </button>
                    <div className="w-10 h-10 rounded-xl bg-sf-surface-2 border border-sf-border flex items-center justify-center text-accent">
                      <FileText size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-txt-primary">{b.ownerName}</h3>
                        <span className="sf-badge-accent">{b.borewellId}</span>
                        <span className="sf-badge-accent bg-accent-muted border border-accent/15 flex items-center gap-1 font-bold text-accent">
                          <FolderGit size={10} />
                          <span>{b.project || 'Default Project'}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-txt-secondary mt-1 font-medium">
                        <span className="flex items-center gap-1">
                          <MapPin size={12} className="text-txt-muted" /> {b.area || 'N/A'}, {b.city}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-sf-border" />
                        <span className="flex items-center gap-1">
                          <Calendar size={12} className="text-txt-muted" /> {new Date(b.date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-stretch md:self-auto justify-between border-t md:border-t-0 border-sf-border/50 pt-3 md:pt-0">
                    <div className="text-left md:text-right">
                      <span className="text-sm font-bold text-txt-primary block">
                        {b.totalDepth ? `${b.totalDepth} ft` : 'No Depth Logged'}
                      </span>
                      <span className="text-[10px] text-txt-muted font-bold uppercase tracking-wider block mt-0.5">
                        Bore: {b.boreDia ? `${b.boreDia}"` : 'N/A'} | Pipe: {b.pipeDia ? `${b.pipeDia}"` : 'N/A'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* View Action */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/borewell/${b.id}`);
                        }}
                        title="View Details & Profile"
                        className="p-2 text-txt-secondary hover:text-accent hover:bg-sf-surface-2 rounded-lg transition-all cursor-pointer"
                      >
                        <Eye size={15} />
                      </button>

                      {/* Edit Action */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/borewell/${b.id}`, { state: { editMetadata: true } });
                        }}
                        title="Edit Metadata"
                        className="p-2 text-txt-secondary hover:text-accent hover:bg-sf-surface-2 rounded-lg transition-all cursor-pointer"
                      >
                        <Edit3 size={15} />
                      </button>

                      {/* Delete Action */}
                      <button
                        onClick={(e) => handleDelete(b.id, b.ownerName, e)}
                        title="Delete Record"
                        className="p-2 text-txt-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-all cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                      <div className="text-txt-muted pl-1">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className="border-t border-sf-border/50 pt-4 mt-1 grid grid-cols-1 md:grid-cols-2 gap-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
                    <div className="space-y-3">
                      <div>
                        <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wider block">Remarks / Notes</span>
                        <p className="text-xs text-txt-secondary mt-1 bg-sf-surface-3 border border-sf-border rounded-lg p-3 leading-relaxed font-sans min-h-16">
                          {b.remarks || 'No notes or remarks logged for this borewell.'}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-2xs">
                        <div className="bg-sf-surface border border-sf-border rounded-lg p-2.5">
                          <span className="block text-txt-muted font-bold uppercase tracking-wider mb-0.5">Water Table</span>
                          <span className="text-xs font-bold text-txt-primary">{b.waterLevel ? `${b.waterLevel} ft` : 'N/A'}</span>
                        </div>
                        <div className="bg-sf-surface border border-sf-border rounded-lg p-2.5">
                          <span className="block text-txt-muted font-bold uppercase tracking-wider mb-0.5">Coordinates</span>
                          <span className="text-xs font-bold text-txt-primary">
                            {b.latitude && b.longitude ? `${b.latitude.toFixed(5)}, ${b.longitude.toFixed(5)}` : 'No GPS logs'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-sf-surface border border-sf-border rounded-xl p-4 flex flex-col justify-between items-center text-center">
                      <div className="flex flex-col items-center gap-1.5 py-4 text-txt-muted">
                        <Layers size={22} className="text-accent" />
                        <span className="text-xs font-bold text-txt-primary mt-1">Geological Strata Chart & Pipe Layout</span>
                        <span className="text-3xs text-txt-muted leading-normal max-w-xs">Visual design studio canvas. Modify soil layers depth, casing pipes, or export reports.</span>
                      </div>
                      <button
                        onClick={() => navigate(`/borewell/${b.id}`)}
                        className="w-full sf-btn-secondary flex items-center justify-center gap-2 py-2"
                      >
                        <span>Open Design Canvas</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Delete Borewell Record"
        message={`Are you sure you want to delete the record for "${deleteTarget?.name}"? It will be moved to the Recycle Bin.`}
        confirmLabel="Move to Recycle Bin"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default BorewellsPage;
