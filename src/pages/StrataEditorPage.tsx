/**
 * StrataEditorPage — Redesigned Design Studio.
 * Visual geological profile editor, vertical ruler ticks,plain/slotted casings, and dynamic material properties.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { 
  ArrowLeft, Save, Plus, Trash2, Sliders, Layers, HelpCircle, Check 
} from 'lucide-react';
import type { StrataLayer, PipeSegment } from '@shared/types';
import { BorewellProfileDrawing } from '@/components/ui/BorewellProfileDrawing';

export function StrataEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const borewells = useBorewellStore((s) => s.borewells);
  const strataStore = useBorewellStore((s) => s.strataLayers);
  const pipeStore = useBorewellStore((s) => s.pipeSegments);
  const setStrataLayers = useBorewellStore((s) => s.setStrataLayers);
  const setPipeSegments = useBorewellStore((s) => s.setPipeSegments);
  const fetchStrata = useBorewellStore((s) => s.fetchStrata);
  const fetchPipes = useBorewellStore((s) => s.fetchPipes);
  const materials = useBorewellStore((s) => s.materials);
  const fetchMaterials = useBorewellStore((s) => s.fetchMaterials);
  const addMaterial = useBorewellStore((s) => s.addMaterial);
  const addToast = useUIStore((s) => s.addToast);

  const borewell = borewells.find((b) => b.id === id);

  // Isolated states for sandbox edits
  const [layers, setLocalLayers] = useState<StrataLayer[]>([]);
  const [pipes, setLocalPipes] = useState<PipeSegment[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedPipeId, setSelectedPipeId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isLoaded, setIsLoaded] = useState(false);
  const [hoveredStrataId, setHoveredStrataId] = useState<string | null>(null);
  const [hoveredPipeId, setHoveredPipeId] = useState<string | null>(null);

  // States for creating custom material types inline
  const [isCreatingMaterial, setIsCreatingMaterial] = useState(false);
  const [newMatName, setNewMatName] = useState('');
  const [newMatColor, setNewMatColor] = useState('#8D6E63');
  const [newMatPattern, setNewMatPattern] = useState('dots');

  const handleCreateCustomMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatName.trim()) {
      addToast({ message: 'Please enter a name for the custom material.', type: 'warning' });
      return;
    }
    const exists = materials.some(m => m.name.toLowerCase() === newMatName.trim().toLowerCase());
    if (exists) {
      addToast({ message: 'A material with this name already exists.', type: 'warning' });
      return;
    }

    const newMat = {
      id: `mat-${Date.now()}`,
      name: newMatName.trim(),
      color: newMatColor,
      pattern: newMatPattern,
      isCustom: true
    };

    try {
      await addMaterial(newMat);
      addToast({ message: `Custom material '${newMat.name}' added to dictionary.`, type: 'success' });
      setNewMatName('');
      setIsCreatingMaterial(false);
      
      // Auto apply if a layer is selected
      if (selectedLayerId) {
        setLocalLayers(prev => 
          prev.map(l => l.id === selectedLayerId ? { ...l, material: newMat.name, color: newMat.color, pattern: newMat.pattern } : l)
        );
      }
    } catch (err) {
      addToast({ message: 'Failed to create material.', type: 'error' });
    }
  };

  // Load database entities
  useEffect(() => {
    async function loadData() {
      if (id) {
        await Promise.all([
          fetchStrata(id),
          fetchPipes(id),
          fetchMaterials(),
        ]);
      }
    }
    loadData();
  }, [id, fetchStrata, fetchPipes, fetchMaterials]);

  // Sync to local states
  useEffect(() => {
    if (id && !isLoaded) {
      const layersFromStore = strataStore[id];
      const pipesFromStore = pipeStore[id];
      if (layersFromStore !== undefined && pipesFromStore !== undefined) {
        setLocalLayers(layersFromStore);
        setLocalPipes(pipesFromStore);
        setIsLoaded(true);
      }
    }
  }, [id, strataStore, pipeStore, isLoaded]);

  // Debounced auto-save (1.5s delay)
  useEffect(() => {
    if (!id || !isLoaded || (layers.length === 0 && pipes.length === 0)) return;

    for (const layer of layers) {
      if (layer.startDepth >= layer.endDepth) return;
    }

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await setStrataLayers(id, layers);
        await setPipeSegments(id, pipes);
        setSaveStatus('saved');
      } catch (err) {
        console.error('Auto-save failed:', err);
        setSaveStatus('idle');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [layers, pipes, id, isLoaded]);

  useEffect(() => {
    if (saveStatus === 'saved') {
      const timer = setTimeout(() => setSaveStatus('idle'), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  if (!borewell) {
    return (
      <div className="p-6 text-center text-txt-muted text-sm space-y-4">
        <p>Borewell record not found.</p>
        <button onClick={() => navigate('/')} className="sf-btn-primary">Return to Dashboard</button>
      </div>
    );
  }

  const selectedLayer = layers.find((l) => l.id === selectedLayerId);
  const selectedPipe = pipes.find((p) => p.id === selectedPipeId);
  const totalDepth = borewell.totalDepth || 250;

  // Save manual button click
  const handleSave = async () => {
    if (id) {
      for (const layer of layers) {
        if (layer.startDepth >= layer.endDepth) {
          addToast({ message: `Layer '${layer.material}' has invalid depths: start must be less than end.`, type: 'error' });
          return;
        }
      }

      try {
        setSaveStatus('saving');
        await setStrataLayers(id, layers);
        await setPipeSegments(id, pipes);
        setSaveStatus('saved');
        addToast({ message: 'Profile designs saved to local database.', type: 'success' });
        navigate(`/borewell/${id}`);
      } catch (err) {
        addToast({ message: 'Failed to save changes.', type: 'error' });
        setSaveStatus('idle');
      }
    }
  };

  // Strata Layer Helpers
  const handleAddLayer = () => {
    const start = layers.length > 0 ? layers[layers.length - 1].endDepth : 0;
    const end = Math.min(start + 50, totalDepth);

    const newLayer: StrataLayer = {
      id: `layer-${Date.now()}`,
      borewellId: id || '',
      startDepth: start,
      endDepth: end,
      material: 'Sand',
      color: '#E0C097',
      pattern: 'dots',
      remarks: '',
    };

    setLocalLayers((prev) => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
    setSelectedPipeId(null);
  };

  const handleUpdateLayer = (updates: Partial<StrataLayer>) => {
    if (!selectedLayerId) return;
    setLocalLayers((prev) =>
      prev.map((l) => (l.id === selectedLayerId ? { ...l, ...updates } : l))
    );
  };

  const handleDeleteLayer = (layerId: string) => {
    setLocalLayers((prev) => prev.filter((l) => l.id !== layerId));
    setSelectedLayerId(null);
  };

  const moveLayer = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === layers.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const list = [...layers];
    
    // Swap layers
    const temp = list[index];
    list[index] = list[newIndex];
    list[newIndex] = temp;

    // Recalculate continuity starting from 0
    let currentDepth = 0;
    const updated = list.map((layer) => {
      const duration = layer.endDepth - layer.startDepth;
      const nextLayer = {
        ...layer,
        startDepth: currentDepth,
        endDepth: currentDepth + duration
      };
      currentDepth += duration;
      return nextLayer;
    });

    setLocalLayers(updated);
  };

  // Pipe Assembly Helpers
  const handleAddPipe = () => {
    const start = pipes.length > 0 ? pipes[pipes.length - 1].endDepth : 0;
    const end = Math.min(start + 50, totalDepth);

    const newPipe: PipeSegment = {
      id: `pipe-${Date.now()}`,
      borewellId: id || '',
      startDepth: start,
      endDepth: end,
      pipeType: 'plain',
    };

    setLocalPipes((prev) => [...prev, newPipe]);
    setSelectedPipeId(newPipe.id);
    setSelectedLayerId(null);
  };

  const handleUpdatePipe = (updates: Partial<PipeSegment>) => {
    if (!selectedPipeId) return;
    setLocalPipes((prev) =>
      prev.map((p) => (p.id === selectedPipeId ? { ...p, ...updates } : p))
    );
  };

  const handleDeletePipe = (pipeId: string) => {
    setLocalPipes((prev) => prev.filter((p) => p.id !== pipeId));
    setSelectedPipeId(null);
  };

  // Hatch Pattern Styling Overlay
  const getPatternOverlayStyle = (pattern: string) => {
    if (pattern === 'solid') return {};
    return {
      backgroundImage: pattern === 'dots'
        ? 'radial-gradient(rgba(0, 0, 0, 0.25) 15%, transparent 16%)'
        : pattern === 'lines'
        ? 'linear-gradient(90deg, rgba(0, 0, 0, 0.2) 1px, transparent 0)'
        : pattern === 'diagonal'
        ? 'linear-gradient(45deg, rgba(0, 0, 0, 0.2) 25%, transparent 25%, transparent 50%, rgba(0, 0, 0, 0.2) 50%, rgba(0, 0, 0, 0.2) 75%, transparent 75%, transparent)'
        : pattern === 'bricks'
        ? 'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.2) 0, rgba(0, 0, 0, 0.2) 1px, transparent 0, transparent 8px)'
        : pattern === 'circles'
        ? 'radial-gradient(circle, rgba(0,0,0,0.15) 30%, transparent 40%)'
        : 'none',
      backgroundSize: '10px 10px'
    };
  };
  return (
    <div className="h-[calc(100vh-76px)] flex flex-col select-none overflow-hidden bg-sf-void">
      {/* Editor Header */}
      <header className="h-14 border-b border-sf-border bg-sf-surface px-6 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/borewell/${id}`)}
            className="p-1.5 hover:bg-sf-surface-2 border border-sf-border text-txt-secondary hover:text-txt-primary rounded transition-all cursor-pointer"
          >
            <ArrowLeft size={14} />
          </button>
          <div>
            <h1 className="text-xs font-bold text-txt-primary flex items-center gap-2">
              <span>Strata Design Studio</span>
              <span className="text-txt-muted">|</span>
              <span className="text-accent">{borewell.ownerName}</span>
              {saveStatus === 'saving' && (
                <span className="text-[10px] text-txt-secondary bg-sf-surface-2 border border-sf-border px-1.5 py-0.5 rounded animate-pulse font-semibold">Autosaving...</span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                  <Check size={10} /> Saved
                </span>
              )}
            </h1>
          </div>
        </div>

        <button onClick={handleSave} className="sf-btn-primary py-1.5 px-4 text-xs">
          <Save size={14} />
          <span>Save Profile</span>
        </button>
      </header>

      {/* Editor Body: Three-Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Material Dictionary Swatches */}
        <aside className="w-[200px] border-r border-sf-border bg-sf-surface p-4 flex flex-col flex-shrink-0">
          <h3 className="text-3xs font-bold text-txt-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Layers size={12} className="text-accent" />
            <span>Material Swatches</span>
          </h3>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 mb-3">
            {materials.map((mat) => (
              <button
                key={mat.id || mat.name}
                onClick={() => {
                  if (selectedLayerId) {
                    handleUpdateLayer({
                      material: mat.name,
                      color: mat.color,
                      pattern: mat.pattern,
                    });
                  } else {
                    addToast({ message: 'Select a layer in the visual column to apply this material.', type: 'info' });
                  }
                }}
                className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left text-2xs transition-all cursor-pointer ${
                  selectedLayer?.material === mat.name
                    ? 'border-accent bg-accent-muted text-accent'
                    : 'bg-sf-base border-sf-border hover:border-sf-border-2 text-txt-secondary hover:text-txt-primary'
                }`}
              >
                <div
                  className="w-4 h-4 rounded border border-white/10 flex-shrink-0 relative overflow-hidden"
                  style={{ backgroundColor: mat.color }}
                >
                  <div className="absolute inset-0 opacity-25" style={getPatternOverlayStyle(mat.pattern)} />
                </div>
                <span className="truncate leading-none font-semibold">{mat.name}</span>
              </button>
            ))}
          </div>

          {/* Add custom type inline form */}
          {isCreatingMaterial ? (
            <form onSubmit={handleCreateCustomMaterial} className="p-2.5 border border-sf-border bg-sf-base rounded-lg space-y-2 text-[10px]">
              <div>
                <label className="block text-[8px] font-bold text-txt-muted uppercase mb-1">Name</label>
                <input
                  type="text"
                  placeholder="e.g. Fine Gravel"
                  value={newMatName}
                  onChange={(e) => setNewMatName(e.target.value)}
                  className="w-full px-2 py-1 border border-sf-border rounded bg-sf-surface text-[10px] text-txt-primary outline-none"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[8px] font-bold text-txt-muted uppercase mb-1">Color</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="color"
                      value={newMatColor}
                      onChange={(e) => setNewMatColor(e.target.value)}
                      className="w-5 h-5 rounded border border-sf-border cursor-pointer bg-transparent"
                    />
                    <span className="text-[8px] font-mono text-txt-muted uppercase truncate w-10">{newMatColor}</span>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-[8px] font-bold text-txt-muted uppercase mb-1">Pattern</label>
                  <select
                    value={newMatPattern}
                    onChange={(e) => setNewMatPattern(e.target.value)}
                    className="w-full px-1 py-0.5 border border-sf-border rounded bg-sf-surface text-[9px] text-txt-primary outline-none"
                  >
                    <option value="solid">Solid</option>
                    <option value="dots">Dots (Sand)</option>
                    <option value="lines">Lines (Clay)</option>
                    <option value="crosses">Cross (Kankar)</option>
                    <option value="bricks">Bricks</option>
                    <option value="diagonal">Diagonal (Rock)</option>
                    <option value="circles">Circles (Gravel)</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-1.5 pt-1">
                <button
                  type="submit"
                  className="flex-1 py-1 bg-accent text-white font-bold rounded text-[9px] text-center"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingMaterial(false)}
                  className="flex-1 py-1 bg-sf-surface-2 border border-sf-border text-txt-secondary font-bold rounded text-[9px] text-center"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsCreatingMaterial(true)}
              className="w-full py-2 bg-sf-base border border-dashed border-sf-border hover:border-accent text-accent font-bold rounded-lg text-2xs text-center cursor-pointer transition-all flex items-center justify-center gap-1"
            >
              <Plus size={11} />
              <span>Add Custom Type</span>
            </button>
          )}
        </aside>

        {/* Middle Panel: Visual CAD-Style Columns Canvas */}
        <main className="flex-1 p-6 overflow-y-auto flex flex-col items-center bg-sf-void min-w-[500px]">
          <div className="w-full max-w-2xl flex justify-between items-center mb-4 select-none font-mono text-xs">
            <span className="text-[10px] font-extrabold text-txt-muted uppercase tracking-wider">Drawing Board Canvas</span>
            <div className="flex gap-2">
              <button onClick={handleAddLayer} className="text-3xs text-accent font-bold hover:underline flex items-center gap-0.5">
                <Plus size={11} /> Add Layer
              </button>
              <span className="text-txt-muted text-3xs">|</span>
              <button onClick={handleAddPipe} className="text-3xs text-accent font-bold hover:underline flex items-center gap-0.5">
                <Plus size={11} /> Add Casing Pipe
              </button>
            </div>
          </div>
          
          <div className="border border-sf-border bg-sf-base rounded-xl overflow-auto p-4 flex justify-center w-full" style={{ height: '650px' }}>
            <BorewellProfileDrawing
              borewell={borewell}
              layers={layers}
              pipes={pipes}
              scaleFactor={Math.max(2, Math.min(8, 600 / totalDepth))}
              isPrintPreview={false}
              hoveredStrataId={hoveredStrataId}
              setHoveredStrataId={setHoveredStrataId}
              hoveredPipeId={hoveredPipeId}
              setHoveredPipeId={setHoveredPipeId}
              selectedEntity={
                selectedLayerId 
                  ? { type: 'strata', id: selectedLayerId } 
                  : selectedPipeId 
                  ? { type: 'pipe', id: selectedPipeId } 
                  : null
              }
              setSelectedEntity={(entity) => {
                if (!entity) {
                  setSelectedLayerId(null);
                  setSelectedPipeId(null);
                } else if (entity.type === 'strata') {
                  setSelectedLayerId(entity.id);
                  setSelectedPipeId(null);
                } else if (entity.type === 'pipe') {
                  setSelectedPipeId(entity.id);
                  setSelectedLayerId(null);
                }
              }}
              onMoveLayer={moveLayer}
            />
          </div>
        </main>

        {/* Right Panel: Properties Editor */}
        <aside className="w-[320px] border-l border-sf-border bg-sf-surface p-5 flex flex-col flex-shrink-0">
          <h3 className="text-3xs font-bold text-txt-muted uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <Sliders size={12} className="text-accent" />
            <span>Properties Panel</span>
          </h3>

          <div className="flex-1 space-y-4">
            {/* Selected Layer Info */}
            {selectedLayer && (
              <div className="space-y-4 animate-slide-up">
                <div className="flex justify-between items-center border-b border-sf-border pb-2.5">
                  <span className="text-xs font-bold text-txt-primary">Edit Strata Layer</span>
                  <button onClick={() => handleDeleteLayer(selectedLayer.id)} className="p-1.5 hover:bg-danger/10 text-txt-muted hover:text-danger rounded-lg transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>

                <div>
                  <label className="sf-label">Material Name</label>
                  <input
                    type="text"
                    value={selectedLayer.material}
                    onChange={(e) => handleUpdateLayer({ material: e.target.value })}
                    className="sf-input text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="sf-label">Start Depth (ft)</label>
                    <input
                      type="number"
                      value={selectedLayer.startDepth}
                      onChange={(e) => handleUpdateLayer({ startDepth: Number(e.target.value) })}
                      className="sf-input text-xs"
                    />
                  </div>
                  <div>
                    <label className="sf-label">End Depth (ft)</label>
                    <input
                      type="number"
                      value={selectedLayer.endDepth}
                      onChange={(e) => handleUpdateLayer({ endDepth: Number(e.target.value) })}
                      className="sf-input text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="sf-label">Color Hex</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedLayer.color}
                      onChange={(e) => handleUpdateLayer({ color: e.target.value })}
                      className="w-9 h-9 rounded border border-sf-border cursor-pointer bg-transparent"
                    />
                    <span className="text-xs font-mono text-txt-muted uppercase font-bold">{selectedLayer.color}</span>
                  </div>
                </div>

                <div>
                  <label className="sf-label">Layer Observations / Remarks</label>
                  <textarea
                    rows={4}
                    placeholder="Enter observation notes..."
                    value={selectedLayer.remarks || ''}
                    onChange={(e) => handleUpdateLayer({ remarks: e.target.value })}
                    className="sf-input text-xs font-sans leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* Selected Pipe Info */}
            {selectedPipe && (
              <div className="space-y-4 animate-slide-up">
                <div className="flex justify-between items-center border-b border-sf-border pb-2.5">
                  <span className="text-xs font-bold text-txt-primary">Edit Pipe Segment</span>
                  <button onClick={() => handleDeletePipe(selectedPipe.id)} className="p-1.5 hover:bg-danger/10 text-txt-muted hover:text-danger rounded-lg transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>

                <div>
                  <label className="sf-label">Pipe Casing Type</label>
                  <select
                    value={selectedPipe.pipeType}
                    onChange={(e) => handleUpdatePipe({ pipeType: e.target.value as 'plain' | 'slotted' })}
                    className="sf-input text-xs"
                  >
                    <option value="plain">Plain Pipe (Casing)</option>
                    <option value="slotted">Slotted Screen Pipe</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="sf-label">Start Depth (ft)</label>
                    <input
                      type="number"
                      value={selectedPipe.startDepth}
                      onChange={(e) => handleUpdatePipe({ startDepth: Number(e.target.value) })}
                      className="sf-input text-xs"
                    />
                  </div>
                  <div>
                    <label className="sf-label">End Depth (ft)</label>
                    <input
                      type="number"
                      value={selectedPipe.endDepth}
                      onChange={(e) => handleUpdatePipe({ endDepth: Number(e.target.value) })}
                      className="sf-input text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Selection Empty State */}
            {!selectedLayer && !selectedPipe && (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-txt-muted text-xs gap-1.5 pt-24">
                <HelpCircle size={22} className="text-txt-muted" />
                <span className="font-bold text-txt-secondary">No Element Selected</span>
                <p className="text-3xs text-txt-muted leading-relaxed max-w-xs">
                  Click on any strata block or pipe segment in the canvas column to inspect and modify properties.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
export default StrataEditorPage;
