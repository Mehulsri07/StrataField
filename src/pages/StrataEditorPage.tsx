/**
 * StrataEditorPage — Redesigned Design Studio.
 * Visual geological profile editor, vertical ruler ticks,plain/slotted casings, and dynamic material properties.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { 
  ArrowLeft, Save, Plus, Trash2, Sliders, Layers, HelpCircle, 
  GripVertical, ChevronUp, ChevronDown, Check 
} from 'lucide-react';
import type { StrataLayer, PipeSegment } from '@shared/types';

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
  const addToast = useUIStore((s) => s.addToast);

  const borewell = borewells.find((b) => b.id === id);

  // Isolated states for sandbox edits
  const [layers, setLocalLayers] = useState<StrataLayer[]>([]);
  const [pipes, setLocalPipes] = useState<PipeSegment[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedPipeId, setSelectedPipeId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isLoaded, setIsLoaded] = useState(false);

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

  // Dynamic Ruler scale ticks based on depth
  const tickCount = 10;
  const tickStep = totalDepth / tickCount;
  const rulerTicks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round(i * tickStep));

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

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
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
        </aside>

        {/* Middle Panel: Visual CAD-Style Columns Canvas */}
        <main className="flex-1 p-6 overflow-y-auto flex gap-4 justify-center items-stretch bg-sf-void min-w-[500px]">
          {/* Vertical Depth Scale ticks */}
          <div className="w-14 flex flex-col justify-between py-2.5 border-r border-sf-border pr-2.5 text-right font-mono text-[10px] text-txt-muted select-none">
            {rulerTicks.map((t) => (
              <div key={t} className="h-0 flex items-center justify-end gap-1">
                <span>{t} ft</span>
                <span className="w-1.5 h-px bg-sf-border"></span>
              </div>
            ))}
          </div>

          {/* Strata Columns */}
          <div className="flex-1 max-w-[240px] flex flex-col">
            <div className="flex justify-between items-center mb-2 select-none">
              <span className="text-3xs font-bold text-txt-muted uppercase tracking-wider">Strata Layers</span>
              <button onClick={handleAddLayer} className="text-3xs text-accent font-bold hover:underline flex items-center gap-0.5">
                <Plus size={11} /> Add Layer
              </button>
            </div>
            
            <div className="flex-1 border border-sf-border rounded-xl overflow-hidden bg-sf-surface flex flex-col relative min-h-[400px]">
              {layers.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-4 text-center text-txt-muted text-xs gap-1 py-32">
                  <Layers size={24} className="text-txt-muted animate-pulse" />
                  <span>No layers defined</span>
                </div>
              ) : (
                layers.map((layer, idx) => {
                  const isSelected = selectedLayerId === layer.id;
                  const heightPercent = ((layer.endDepth - layer.startDepth) / totalDepth) * 100;
                  
                  return (
                    <div
                      key={layer.id}
                      onClick={() => {
                        setSelectedLayerId(layer.id);
                        setSelectedPipeId(null);
                      }}
                      style={{ 
                        height: `${heightPercent}%`, 
                        backgroundColor: layer.color,
                        minHeight: '64px' // Strata blocks minimum 64x24 px
                      }}
                      className={`
                        w-full flex flex-col justify-center items-center text-center p-3 relative hover:brightness-105 border-b border-black/10 last:border-b-0 cursor-pointer transition-all group
                        ${isSelected ? 'ring-2 ring-accent ring-inset shadow-md' : ''}
                      `}
                    >
                      {/* Hatch Pattern */}
                      <div className="absolute inset-0 opacity-20 pointer-events-none" style={getPatternOverlayStyle(layer.pattern)} />
                      
                      {/* Material Color Strip Indicator */}
                      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: layer.color }} />

                      {/* Depth Markings */}
                      <div className="absolute top-1 left-2 text-[9px] font-mono text-black/50 select-none drop-shadow">
                        {layer.startDepth} ft
                      </div>
                      <div className="absolute bottom-1 left-2 text-[9px] font-mono text-black/50 select-none drop-shadow">
                        {layer.endDepth} ft
                      </div>

                      {/* Reordering Controls overlay */}
                      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-0.5 bg-black/60 backdrop-blur rounded p-0.5 z-10">
                        <button 
                          onClick={(e) => { e.stopPropagation(); moveLayer(idx, 'up'); }}
                          disabled={idx === 0}
                          className="p-0.5 text-white/70 hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronUp size={12} />
                        </button>
                        <div className="text-white/40 cursor-grab flex items-center justify-center p-0.5">
                          <GripVertical size={10} />
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); moveLayer(idx, 'down'); }}
                          disabled={idx === layers.length - 1}
                          className="p-0.5 text-white/70 hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronDown size={12} />
                        </button>
                      </div>

                      {/* Text Badge (High Contrast Overlay) */}
                      <div className="bg-black/50 backdrop-blur-xs border border-white/10 rounded-md px-2 py-0.5 max-w-[90%] truncate shadow">
                        <span className="text-2xs font-extrabold text-white tracking-wide">{layer.material}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Pipe Lowering Column */}
          <div className="w-[140px] flex flex-col">
            <div className="flex justify-between items-center mb-2 select-none">
              <span className="text-3xs font-bold text-txt-muted uppercase tracking-wider">Pipe Lowering</span>
              <button onClick={handleAddPipe} className="text-3xs text-accent font-bold hover:underline flex items-center gap-0.5">
                <Plus size={11} /> Add Pipe
              </button>
            </div>
            
            <div className="flex-1 border border-sf-border rounded-xl overflow-hidden bg-sf-surface flex flex-col relative min-h-[400px]">
              {pipes.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-4 text-center text-txt-muted text-xs gap-1 py-32">
                  <Sliders size={20} className="text-txt-muted" />
                  <span>No pipes lowered</span>
                </div>
              ) : (
                pipes.map((pipe) => {
                  const isSelected = selectedPipeId === pipe.id;
                  const heightPercent = ((pipe.endDepth - pipe.startDepth) / totalDepth) * 100;
                  const isSlotted = pipe.pipeType === 'slotted';
                  
                  return (
                    <div
                      key={pipe.id}
                      onClick={() => {
                        setSelectedPipeId(pipe.id);
                        setSelectedLayerId(null);
                      }}
                      style={{ 
                        height: `${heightPercent}%`,
                        minHeight: '48px'
                      }}
                      className={`
                        w-full flex flex-col justify-center items-center text-center border-b border-sf-border/50 last:border-b-0 cursor-pointer transition-all relative
                        ${isSlotted 
                          ? 'bg-accent text-white font-black' 
                          : 'bg-white text-slate-800 font-extrabold border-l-[3px] border-r-[3px] border-slate-300'
                        }
                        ${isSelected ? 'ring-2 ring-emerald-500 ring-inset shadow' : ''}
                      `}
                    >
                      {/* Slotted Pattern overlay */}
                      {isSlotted && (
                        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
                          backgroundImage: 'repeating-linear-gradient(90deg, #fff 0, #fff 2px, transparent 0, transparent 8px)'
                        }} />
                      )}

                      {/* Depth Markings */}
                      <span className="absolute top-1 text-[8px] opacity-70 leading-none select-none">
                        {pipe.startDepth} ft
                      </span>
                      <span className="absolute bottom-1 text-[8px] opacity-70 leading-none select-none">
                        {pipe.endDepth} ft
                      </span>

                      {/* Labels */}
                      <span className="text-[10px] uppercase tracking-wider drop-shadow">{isSlotted ? 'Slotted' : 'Plain'}</span>
                      <span className="text-[8px] opacity-80 mt-0.5">{pipe.endDepth - pipe.startDepth} ft</span>
                    </div>
                  );
                })
              )}
            </div>
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
