/**
 * DataCleanupPage — Quality check utility.
 * Helps map raw free-text material names in strata layers to canonical material dictionary IDs.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { 
  ArrowLeft, CheckCircle2, AlertTriangle, Layers, Database, 
  Sparkles, RefreshCw, ChevronRight, Check
} from 'lucide-react';
import type { UnmappedMaterial } from '@/shared/types';

export function DataCleanupPage() {
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);
  const materials = useBorewellStore((s) => s.materials);
  const fetchMaterials = useBorewellStore((s) => s.fetchMaterials);

  const [unmappedList, setUnmappedList] = useState<UnmappedMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMappings, setSelectedMappings] = useState<Record<string, string>>({});
  const [remappingInProgress, setRemappingInProgress] = useState<string | null>(null);

  // States for inline custom material creation
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [targetUnmappedText, setTargetUnmappedText] = useState('');
  const [customName, setCustomName] = useState('');
  const [customColor, setCustomColor] = useState('#8D6E63');
  const [customPattern, setCustomPattern] = useState('solid');
  const [customClass, setCustomClass] = useState('OTHER');
  const [customFamily, setCustomFamily] = useState('OTHER');

  const loadUnmapped = async () => {
    setLoading(true);
    try {
      await fetchMaterials();
      const list = await window.api.db.getUnmappedMaterials();
      setUnmappedList(list);

      // Pre-populate with suggested matches if they exist
      const initialMap: Record<string, string> = {};
      list.forEach((item) => {
        if (item.suggestedMatchId) {
          initialMap[item.material] = item.suggestedMatchId;
        } else {
          // If no direct suggested match, default to first sand or clay or other based on fuzzy keywords
          const text = item.material.toLowerCase();
          let guessedId = '';
          if (text.includes('sand')) {
            guessedId = 'medium_sand';
          } else if (text.includes('clay')) {
            guessedId = 'clay';
          } else if (text.includes('gravel')) {
            guessedId = 'gravel';
          } else if (text.includes('kankar')) {
            guessedId = 'kankar';
          } else if (materials.length > 0) {
            guessedId = materials[0].id;
          }
          if (guessedId) {
            initialMap[item.material] = guessedId;
          }
        }
      });
      setSelectedMappings(initialMap);
    } catch (err) {
      console.error(err);
      addToast({ message: 'Failed to load unmapped materials.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUnmapped();
  }, []);

  const handleRemap = async (oldMaterial: string) => {
    const targetId = selectedMappings[oldMaterial];
    if (!targetId) {
      addToast({ message: 'Please select a canonical material to remap to.', type: 'warning' });
      return;
    }

    setRemappingInProgress(oldMaterial);
    try {
      const updatedCount = await window.api.db.remapMaterial(oldMaterial, targetId);
      addToast({ 
        message: `Successfully remapped '${oldMaterial}' → ${materials.find(m => m.id === targetId)?.name || targetId} (${updatedCount} layers affected).`,
        type: 'success'
      });
      
      // Refresh list
      const list = await window.api.db.getUnmappedMaterials();
      setUnmappedList(list);
    } catch (err: any) {
      console.error(err);
      addToast({ message: `Remap failed: ${err.message || String(err)}`, type: 'error' });
    } finally {
      setRemappingInProgress(null);
    }
  };

  const handleBulkRemapAll = async () => {
    const targets = Object.entries(selectedMappings);
    if (targets.length === 0) {
      addToast({ message: 'No mappings configured to apply.', type: 'warning' });
      return;
    }

    if (!confirm(`Are you sure you want to bulk-remap all ${targets.length} materials? This will modify the SQLite database.`)) {
      return;
    }

    setLoading(true);
    let successCount = 0;
    let totalAffected = 0;

    for (const [oldMaterial, targetId] of targets) {
      // Only map if it's still in the unmapped list
      if (!unmappedList.some(item => item.material === oldMaterial)) continue;
      try {
        const count = await window.api.db.remapMaterial(oldMaterial, targetId);
        totalAffected += count;
        successCount++;
      } catch (err) {
        console.error(`Failed to map ${oldMaterial}:`, err);
      }
    }

    addToast({ 
      message: `Bulk cleanup complete. Remapped ${successCount} unique values across ${totalAffected} strata layers.`,
      type: 'success'
    });
    
    loadUnmapped();
  };

  const openCustomModal = (unmappedText: string) => {
    setTargetUnmappedText(unmappedText);
    setCustomName(unmappedText);
    setCustomColor('#8D6E63');
    setCustomPattern('solid');
    setCustomClass('OTHER');
    setCustomFamily('OTHER');
    setIsCreatingCustom(true);
  };

  const handleCreateCustomMaterial = async () => {
    if (!customName.trim()) {
      addToast({ message: 'Material name is required', type: 'error' });
      return;
    }

    const newId = `custom_${customName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
    const newMat = {
      id: newId,
      name: customName.trim(),
      color: customColor,
      pattern: customPattern,
      isCustom: true,
      lithologyClass: customClass as any,
      lithologyFamily: customFamily as any
    };

    try {
      await window.api.db.createMaterial(newMat);
      await fetchMaterials();
      
      // Auto-select this new material for our current unmapped item
      setSelectedMappings(prev => ({
        ...prev,
        [targetUnmappedText]: newId
      }));

      setIsCreatingCustom(false);
      addToast({ message: `Custom material "${newMat.name}" created and mapped inline!`, type: 'success' });
    } catch (err: any) {
      console.error(err);
      addToast({ message: `Failed to create custom material: ${err.message || String(err)}`, type: 'error' });
    }
  };

  const totalAffectedLayers = unmappedList.reduce((sum, item) => sum + item.layerCount, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 select-none animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="p-2 hover:bg-sf-surface-2 border border-sf-border text-txt-secondary hover:text-txt-primary rounded-lg transition-all cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-txt-primary flex items-center gap-2">
            <Database size={20} className="text-accent" />
            <span>Geological Data Integrity Cleanup</span>
          </h1>
          <p className="text-2xs text-txt-muted">Remap raw free-text Excel material strings to authoritative dictionary classes.</p>
        </div>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="sf-panel p-4 bg-sf-surface border border-sf-border flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
            <Layers size={20} />
          </div>
          <div>
            <span className="text-[10px] text-txt-muted uppercase font-bold font-mono">Unmapped Materials</span>
            <h3 className="text-lg font-black text-txt-primary mt-0.5">{unmappedList.length} Unique</h3>
          </div>
        </div>

        <div className="sf-panel p-4 bg-sf-surface border border-sf-border flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-center text-warning">
            <AlertTriangle size={20} />
          </div>
          <div>
            <span className="text-[10px] text-txt-muted uppercase font-bold font-mono">Affected Strata Layers</span>
            <h3 className="text-lg font-black text-txt-primary mt-0.5">{totalAffectedLayers} Layers</h3>
          </div>
        </div>

        <div className="sf-panel p-4 bg-sf-surface border border-sf-border flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-success/15 border border-success/25 flex items-center justify-center text-success">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <span className="text-[10px] text-txt-muted uppercase font-bold font-mono">Dictionary Size</span>
            <h3 className="text-lg font-black text-txt-primary mt-0.5">{materials.length} Materials</h3>
          </div>
        </div>
      </div>

      {/* Main mapping list panel */}
      <div className="sf-panel p-5 bg-sf-surface border border-sf-border space-y-4">
        <div className="flex justify-between items-center pb-2.5 border-b border-sf-border">
          <span className="text-xs font-bold text-txt-primary">Unmapped Free-Text Entries ({unmappedList.length})</span>
          {unmappedList.length > 0 && (
            <button 
              onClick={handleBulkRemapAll}
              disabled={loading}
              className="sf-btn-primary py-1.5 px-3 flex items-center gap-1.5 text-2xs cursor-pointer"
            >
              <Check size={13} />
              <span>Apply Mappings ({unmappedList.length})</span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-16 text-center text-txt-muted text-xs space-y-2.5 flex flex-col items-center">
            <RefreshCw className="animate-spin text-accent" size={24} />
            <span>Syncing database strata records...</span>
          </div>
        ) : unmappedList.length === 0 ? (
          <div className="py-16 text-center text-txt-muted text-xs space-y-2 flex flex-col items-center">
            <CheckCircle2 className="text-success" size={28} />
            <span className="font-bold text-txt-primary text-xs">All Strata Layers Canonicalised!</span>
            <p className="text-3xs text-txt-muted leading-relaxed max-w-sm mt-1">
              Zero unmapped free-text strata entries found. All database logs are bound to the authoritative taxonomy dictionary.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-sf-border/30 text-txt-muted font-bold text-[10px] uppercase tracking-wider">
                  <th className="py-2.5 w-1/4">Raw String</th>
                  <th className="py-2.5 w-1/12 text-center">Layers</th>
                  <th className="py-2.5 w-1/3">Remap To Canonical Dictionary</th>
                  <th className="py-2.5 w-1/4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sf-border/20">
                {unmappedList.map((item) => {
                  const hasSuggested = !!item.suggestedMatchId;
                  const isCurrentRemapping = remappingInProgress === item.material;

                  return (
                    <tr key={item.material} className="hover:bg-sf-surface-2 transition-all">
                      {/* Raw free text */}
                      <td className="py-3 font-mono font-bold text-txt-primary">
                        {item.material}
                      </td>

                      {/* Occurrences count */}
                      <td className="py-3 text-center font-bold text-txt-secondary font-mono">
                        {item.layerCount}
                      </td>

                      {/* Selection dropdown */}
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={selectedMappings[item.material] || ''}
                            onChange={(e) => setSelectedMappings({
                              ...selectedMappings,
                              [item.material]: e.target.value
                            })}
                            className="sf-input text-xs py-1"
                          >
                            <option value="">— Select Target Material —</option>
                            {materials.map((mat) => (
                              <option key={mat.id} value={mat.id}>
                                {mat.name} {mat.lithologyFamily ? `[${mat.lithologyFamily}]` : ''}
                              </option>
                            ))}
                          </select>
                          {hasSuggested && (
                            <button
                              onClick={() => {
                                setSelectedMappings({
                                  ...selectedMappings,
                                  [item.material]: item.suggestedMatchId || ''
                                });
                                addToast({ message: `Suggested match "${item.suggestedMatch}" selected.`, type: 'info' });
                              }}
                              className="p-1.5 bg-accent/10 text-accent rounded hover:bg-accent/20 transition-all cursor-pointer"
                              title={`Auto-match suggestion: ${item.suggestedMatch}`}
                            >
                              <Sparkles size={13} />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Individual Action buttons */}
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRemap(item.material)}
                            disabled={!selectedMappings[item.material] || isCurrentRemapping}
                            className="sf-btn-primary py-1 px-3 text-3xs flex items-center gap-1 cursor-pointer"
                          >
                            {isCurrentRemapping ? (
                              <RefreshCw size={11} className="animate-spin" />
                            ) : (
                              <ChevronRight size={11} />
                            )}
                            <span>Apply</span>
                          </button>
                          
                          <button
                            onClick={() => openCustomModal(item.material)}
                            className="sf-btn-secondary py-1 px-3 text-3xs cursor-pointer"
                          >
                            + Add Custom
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inline Custom Material Form Modal */}
      {isCreatingCustom && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-sf-surface border border-sf-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-sf animate-scale-in">
            <div className="pb-2 border-b border-sf-border">
              <span className="font-bold text-txt-primary block text-sm">Create Canonical Material Inline</span>
              <p className="text-3xs text-txt-muted mt-0.5">Define a dictionary entry to map raw text "{targetUnmappedText}" to.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="sf-label">Material Name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="sf-input text-xs"
                  placeholder="e.g. Medium Sand"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="sf-label">Hatch Color</label>
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    className="w-full h-8 rounded border border-sf-border cursor-pointer bg-transparent"
                  />
                </div>
                <div>
                  <label className="sf-label">Hatch Pattern</label>
                  <select
                    value={customPattern}
                    onChange={(e) => setCustomPattern(e.target.value)}
                    className="sf-input text-xs"
                  >
                    <option value="solid">Solid</option>
                    <option value="dots">Dots</option>
                    <option value="lines">Lines</option>
                    <option value="crosses">Crosses</option>
                    <option value="bricks">Bricks</option>
                    <option value="diagonal">Diagonal</option>
                    <option value="circles">Circles</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="sf-label">Lithology Class</label>
                  <select
                    value={customClass}
                    onChange={(e) => setCustomClass(e.target.value)}
                    className="sf-input text-xs"
                  >
                    <option value="OTHER">Other</option>
                    <option value="CLAY">Clay</option>
                    <option value="SILTY_CLAY">Silty Clay</option>
                    <option value="SANDY_CLAY">Sandy Clay</option>
                    <option value="SILT">Silt</option>
                    <option value="KANKAR">Kankar</option>
                    <option value="FINE_SAND">Fine Sand</option>
                    <option value="MEDIUM_SAND">Medium Sand</option>
                    <option value="COARSE_SAND">Coarse Sand</option>
                    <option value="YELLOW_SAND">Yellow Sand</option>
                    <option value="GRAVEL">Gravel</option>
                    <option value="SANDY_GRAVEL">Sandy Gravel</option>
                    <option value="FILL">Fill</option>
                    <option value="ROCK">Rock</option>
                  </select>
                </div>
                <div>
                  <label className="sf-label">Lithology Family</label>
                  <select
                    value={customFamily}
                    onChange={(e) => setCustomFamily(e.target.value)}
                    className="sf-input text-xs"
                  >
                    <option value="OTHER">Other</option>
                    <option value="CLAY">Clay</option>
                    <option value="SAND">Sand</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsCreatingCustom(false)}
                className="sf-btn-secondary py-1.5 px-3.5 text-2xs font-mono font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCustomMaterial}
                className="sf-btn-primary py-1.5 px-3.5 text-2xs font-mono font-bold cursor-pointer"
              >
                Create Dictionary Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataCleanupPage;
