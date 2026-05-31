/**
 * SearchPage — Redesigned Search and Filter Center.
 * High-performance search, filter chips, saved quick-searches, and collapsible logs details.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { 
  Search, SlidersHorizontal, MapPin, Calendar, FileText, ArrowRight, Eye, 
  Trash2, Layers, FolderGit, X, Star, ChevronDown, ChevronUp
} from 'lucide-react';
import type { SearchField } from '@shared/types';

export function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchResults = useBorewellStore((s) => s.searchResults);
  const searchFilters = useBorewellStore((s) => s.searchFilters);
  const setSearchFilters = useBorewellStore((s) => s.setSearchFilters);
  const searchBorewells = useBorewellStore((s) => s.searchBorewells);
  const deleteBorewell = useBorewellStore((s) => s.deleteBorewell);
  const addToast = useUIStore((s) => s.addToast);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const projectInputRef = useRef<HTMLInputElement>(null);

  // Quick Saved Search Templates
  const SAVED_SEARCHES = [
    { label: 'All Records', query: '', filters: { field: 'all' as SearchField, project: '', city: '', material: '', dateFrom: '', dateTo: '' } },
    { label: 'Deep Borewells (>200ft)', query: '', filters: { field: 'all' as SearchField, project: '', city: '', material: '', dateFrom: '', dateTo: '' } },
    { label: 'Clay Stratum Logs', query: '', filters: { field: 'all' as SearchField, project: '', city: '', material: 'clay', dateFrom: '', dateTo: '' } },
    { label: 'Recent Active Site', query: '', filters: { field: 'all' as SearchField, project: 'Default Project', city: '', material: '', dateFrom: '', dateTo: '' } }
  ];

  // Sync state navigation
  useEffect(() => {
    if (location.state?.focusProject) {
      setShowFilters(true);
      setSearchFilters({ field: 'project' });
      searchBorewells(searchFilters.query);
      setTimeout(() => {
        projectInputRef.current?.focus();
      }, 150);
    }
  }, [location.state]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchFilters({ query: value });
    searchBorewells(value);
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
    fresh[key] = '';
    setSearchFilters(fresh);
    searchBorewells(searchFilters.query);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this borewell record? It will be moved to the Recycle Bin.')) {
      deleteBorewell(id);
      addToast({ message: 'Record moved to Recycle Bin.', type: 'info' });
    }
  };

  // Check if any advanced filters are active
  const hasActiveFilters = 
    searchFilters.project || 
    searchFilters.city || 
    searchFilters.material || 
    searchFilters.dateFrom || 
    searchFilters.dateTo;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-txt-primary">Search Borewell Records</h1>
        <p className="text-2xs text-txt-muted">Real-time matching, advanced spatial filters, and strata profile exports.</p>
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
              placeholder="Type to search by owner name, record ID, or location..."
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
              <input
                type="text"
                ref={projectInputRef}
                placeholder="e.g. Metro Site A"
                value={searchFilters.project || ''}
                className="sf-input mt-1.5"
                onChange={(e) => {
                  setSearchFilters({ project: e.target.value });
                  searchBorewells(searchFilters.query);
                }}
              />
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
            <button
              onClick={() => {
                setSearchFilters({ project: '', city: '', material: '', dateFrom: '', dateTo: '' });
                searchBorewells(searchFilters.query);
              }}
              className="text-txt-muted hover:text-danger font-bold cursor-pointer"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

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
            return (
              <div
                key={b.id}
                onClick={() => setExpandedId(isExpanded ? null : b.id)}
                className={`
                  sf-card flex flex-col gap-4 border transition-all cursor-pointer select-none
                  ${isExpanded ? 'border-accent ring-1 ring-accent-muted shadow-md' : 'border-sf-border hover:border-sf-border-2'}
                `}
              >
                {/* Header info (Always Visible) */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div className="flex items-center gap-3">
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/borewell/${b.id}`);
                        }}
                        title="View Full Record"
                        className="p-2 text-txt-secondary hover:text-accent hover:bg-sf-surface-2 rounded-lg transition-all cursor-pointer"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={(e) => handleDelete(b.id, e)}
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
    </div>
  );
}
export default SearchPage;
