/**
 * SearchPage — Search and filter borewell records.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { Search, SlidersHorizontal, MapPin, Calendar, FileText, ArrowRight, Eye, Trash2, Layers } from 'lucide-react';
import type { SearchField } from '@shared/types';

export function SearchPage() {
  const navigate = useNavigate();
  const searchResults = useBorewellStore((s) => s.searchResults);
  const searchFilters = useBorewellStore((s) => s.searchFilters);
  const setSearchFilters = useBorewellStore((s) => s.setSearchFilters);
  const searchBorewells = useBorewellStore((s) => s.searchBorewells);
  const deleteBorewell = useBorewellStore((s) => s.deleteBorewell);
  const addToast = useUIStore((s) => s.addToast);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

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

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this borewell record?')) {
      deleteBorewell(id);
      addToast({ message: 'Record deleted successfully.', type: 'info' });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-txt-primary">Search Borewell Records</h1>
        <p className="text-2xs text-txt-muted">Search through logged borewells and view detailed logs.</p>
      </div>

      {/* Search Bar & Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-txt-muted">
              <Search size={16} />
            </div>
            <input
              type="text"
              placeholder="Search by keywords..."
              value={searchFilters.query}
              onChange={handleQueryChange}
              className="w-full pl-9 pr-4 py-2 bg-sf-surface border border-sf-border rounded-md text-sm text-txt-primary placeholder-txt-muted transition-all focus:border-accent focus:ring-1 focus:ring-accent/20 outline-none"
            />
          </div>

          <select
            value={searchFilters.field}
            onChange={handleFieldChange}
            className="px-3 py-2 bg-sf-surface border border-sf-border rounded-md text-sm text-txt-primary focus:border-accent focus:ring-1 focus:ring-accent/20 outline-none"
          >
            <option value="all">Search All Fields</option>
            <option value="borewellId">Borewell Record ID</option>
            <option value="ownerName">Owner Name</option>
            <option value="city">City</option>
            <option value="area">Area</option>
          </select>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`sf-btn-secondary ${showFilters ? 'bg-accent/15 border-accent text-accent-text' : ''}`}
          >
            <SlidersHorizontal size={16} />
            <span>Filters</span>
          </button>
        </div>

        {/* Extended Filters */}
        {showFilters && (
          <div className="sf-panel p-4 grid grid-cols-1 md:grid-cols-3 gap-4 animate-slide-down">
            <div>
              <label className="sf-label">Filter by City</label>
              <input
                type="text"
                placeholder="e.g. New Delhi"
                className="sf-input"
                onChange={(e) => {
                  setSearchFilters({ city: e.target.value });
                  searchBorewells(searchFilters.query);
                }}
              />
            </div>
            <div>
              <label className="sf-label">From Date</label>
              <input
                type="date"
                className="sf-input"
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
                className="sf-input"
                onChange={(e) => {
                  setSearchFilters({ dateTo: e.target.value });
                  searchBorewells(searchFilters.query);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Search Results */}
      <div className="space-y-4">
        {searchResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-sf-border rounded-lg text-txt-muted text-sm gap-2">
            <span>No matching records found</span>
            <span className="text-2xs">Try checking spelling or choosing a different filter.</span>
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
                  ${isExpanded ? 'border-accent shadow-sf' : 'border-sf-border hover:border-sf-border-2'}
                `}
              >
                {/* Header info (Always Visible) */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-sf-surface-2 border border-sf-border flex items-center justify-center text-accent">
                      <FileText size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-txt-primary">{b.ownerName}</h3>
                        <span className="sf-badge-accent">{b.borewellId}</span>
                      </div>
                      <div className="flex items-center gap-3 text-2xs text-txt-secondary mt-0.5">
                        <span className="flex items-center gap-1">
                          <MapPin size={12} /> {b.area || 'N/A'}, {b.city}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-sf-border" />
                        <span className="flex items-center gap-1">
                          <Calendar size={12} /> {new Date(b.date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-stretch md:self-auto justify-between border-t md:border-t-0 border-sf-border pt-2 md:pt-0">
                    <div className="text-left md:text-right">
                      <span className="text-sm font-bold text-txt-primary block">
                        {b.totalDepth ? `${b.totalDepth} ft` : 'No Depth Logged'}
                      </span>
                      <span className="text-3xs text-txt-muted">
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
                        className="p-1.5 text-txt-secondary hover:text-accent hover:bg-sf-surface-2 rounded transition-all"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={(e) => handleDelete(b.id, e)}
                        title="Delete Record"
                        className="p-1.5 text-txt-muted hover:text-danger hover:bg-danger/10 rounded transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className="border-t border-sf-border pt-4 mt-1 grid grid-cols-1 md:grid-cols-2 gap-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
                    <div className="space-y-3">
                      <div>
                        <span className="text-3xs font-semibold text-txt-muted uppercase tracking-wider block">Remarks / Notes</span>
                        <p className="text-xs text-txt-secondary mt-1 bg-sf-surface-2 border border-sf-border rounded p-2.5 leading-relaxed font-sans">
                          {b.remarks || 'No notes or remarks logged for this borewell.'}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-2xs">
                        <div className="bg-sf-surface-2 border border-sf-border rounded p-2 text-txt-secondary">
                          <span className="block text-txt-muted mb-0.5">Water Table</span>
                          <span className="font-semibold text-txt-primary">{b.waterLevel ? `${b.waterLevel} ft` : 'N/A'}</span>
                        </div>
                        <div className="bg-sf-surface-2 border border-sf-border rounded p-2 text-txt-secondary">
                          <span className="block text-txt-muted mb-0.5">Coordinates</span>
                          <span className="font-semibold text-txt-primary">
                            {b.latitude && b.longitude ? `${b.latitude.toFixed(4)}, ${b.longitude.toFixed(4)}` : 'No GPS logs'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-sf-surface-2 border border-sf-border rounded-lg p-3 flex flex-col justify-between items-center text-center">
                      <div className="flex flex-col items-center gap-1.5 py-4 text-txt-muted">
                        <Layers size={24} className="text-accent/50 animate-pulse-accent" />
                        <span className="text-xs font-semibold text-txt-primary mt-1">Geological Strata Chart & Pipe Layout</span>
                        <span className="text-3xs">Edit and visualize the physical properties of this borehole.</span>
                      </div>
                      <button
                        onClick={() => navigate(`/borewell/${b.id}`)}
                        className="w-full sf-btn-secondary flex items-center justify-center gap-2 py-1.5"
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
