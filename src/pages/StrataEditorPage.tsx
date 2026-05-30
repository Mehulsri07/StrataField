/**
 * StrataEditorPage — Visual drag-and-drop designer for geological layers and pipes.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { DEFAULT_MATERIALS } from '@/shared/constants';
import { ArrowLeft, Save, Plus, Trash2, Sliders, Layers, HelpCircle } from 'lucide-react';
import type { StrataLayer, PipeSegment } from '@shared/types';

export function StrataEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const borewells = useBorewellStore((s) => s.borewells);
  const strataStore = useBorewellStore((s) => s.strataLayers);
  const pipeStore = useBorewellStore((s) => s.pipeSegments);
  const setStrataLayers = useBorewellStore((s) => s.setStrataLayers);
  const setPipeSegments = useBorewellStore((s) => s.setPipeSegments);
  const addToast = useUIStore((s) => s.addToast);

  const borewell = borewells.find((b) => b.id === id);

  // Local state for layers and pipes so edits are isolated until saved
  const [layers, setLocalLayers] = useState<StrataLayer[]>([]);
  const [pipes, setLocalPipes] = useState<PipeSegment[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedPipeId, setSelectedPipeId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isLoaded, setIsLoaded] = useState(false);

  // Sync from store on mount
  useEffect(() => {
    if (id) {
      setLocalLayers(strataStore[id] || []);
      setLocalPipes(pipeStore[id] || []);
      setIsLoaded(true);
    }
  }, [id]); // Only load once on mount or ID change

  // Debounced auto-save effect
  useEffect(() => {
    if (!id || !isLoaded || (layers.length === 0 && pipes.length === 0)) return;

    // Check if depths are valid before auto-saving
    for (const layer of layers) {
      if (layer.startDepth >= layer.endDepth) {
        return; // invalid, skip auto-saving
      }
    }

    setSaveStatus('saving');

    const timer = setTimeout(async () => {
      try {
        await setStrataLayers(id, layers);
        await setPipeSegments(id, pipes);
        setSaveStatus('saved');
      } catch (err) {
        console.error('Auto-save error:', err);
        setSaveStatus('idle');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [layers, pipes, id, isLoaded]);

  // Reset status badge text after 3 seconds
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
    const end = start + 50;

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

  // Pipe Lowering Helpers
  const handleAddPipe = () => {
    const start = pipes.length > 0 ? pipes[pipes.length - 1].endDepth : 0;
    const end = start + 50;

    const newPipe: PipeSegment = {
      id: `pipe-${Date.now()}`,
      borewellId: id || '',
      startDepth: start,
      endDepth: end,
      pipeType: 'plain',
    };

    setLocalPipes((prev) => [...prev, newPipe]);
    setSelectedPipeId(newPipe.id);
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

  return (
    <div className="h-[calc(100vh-76px)] flex flex-col select-none overflow-hidden">
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
                <span className="text-[10px] text-txt-secondary bg-sf-surface-2 border border-sf-border px-1.5 py-0.5 rounded animate-pulse">Saving...</span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">Saved</span>
              )}
            </h1>
          </div>
        </div>

        <button onClick={handleSave} className="sf-btn-primary py-1.5 px-4 text-xs">
          <Save size={14} />
          <span>Save Changes</span>
        </button>
      </header>

      {/* Editor Body: Three-Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Material Library */}
        <aside className="w-[200px] border-r border-sf-border bg-sf-surface p-4 flex flex-col flex-shrink-0">
          <h3 className="text-2xs font-bold text-txt-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Layers size={14} className="text-accent" />
            <span>Materials</span>
          </h3>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {DEFAULT_MATERIALS.map((mat) => (
              <button
                key={mat.name}
                onClick={() => {
                  if (selectedLayerId) {
                    handleUpdateLayer({
                      material: mat.name,
                      color: mat.color,
                      pattern: mat.pattern,
                    });
                  } else {
                    addToast({ message: 'Select a layer in the chart first to apply a material.', type: 'info' });
                  }
                }}
                className="w-full flex items-center gap-2 p-2 rounded bg-sf-base border border-sf-border hover:border-sf-border-2 transition-all text-left text-2xs text-txt-secondary hover:text-txt-primary cursor-pointer"
              >
                <div
                  className="w-3.5 h-3.5 rounded border border-white/10 flex-shrink-0"
                  style={{ backgroundColor: mat.color }}
                />
                <span className="truncate leading-none">{mat.name}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Middle Panel: Visual Profile Column View */}
        <main className="flex-1 bg-sf-void p-6 overflow-y-auto flex gap-6 justify-center items-stretch min-w-[500px]">
          {/* Strata Columns */}
          <div className="flex-1 max-w-[220px] flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <span className="text-3xs font-semibold text-txt-muted uppercase tracking-wider">Strata Layers</span>
              <button onClick={handleAddLayer} className="text-3xs text-accent font-bold hover:underline flex items-center gap-0.5">
                <Plus size={10} /> Add Layer
              </button>
            </div>
            <div className="flex-1 border border-sf-border rounded-lg overflow-hidden bg-sf-surface flex flex-col">
              {layers.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-4 text-center text-txt-muted text-xs gap-1">
                  <span>No layers defined</span>
                </div>
              ) : (
                layers.map((layer) => {
                  const isSelected = selectedLayerId === layer.id;
                  const totalD = borewell.totalDepth || 250;
                  const heightPercent = ((layer.endDepth - layer.startDepth) / totalD) * 100;
                  return (
                    <div
                      key={layer.id}
                      onClick={() => {
                        setSelectedLayerId(layer.id);
                        setSelectedPipeId(null);
                      }}
                      style={{ height: `${heightPercent}%`, backgroundColor: layer.color }}
                      className={`
                        w-full flex flex-col justify-center items-center text-center p-2 relative min-h-[48px] hover:brightness-110 transition-all border-b border-white/10 last:border-b-0 cursor-pointer
                        ${isSelected ? 'ring-2 ring-accent ring-inset shadow-sf-glow' : ''}
                      `}
                    >
                      <span className="text-2xs font-extrabold text-white drop-shadow-md">{layer.material}</span>
                      <span className="text-4xs text-white/80 drop-shadow-md">{layer.startDepth} - {layer.endDepth} ft</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Pipe Lowering Column */}
          <div className="w-[140px] flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <span className="text-3xs font-semibold text-txt-muted uppercase tracking-wider">Pipe Lowering</span>
              <button onClick={handleAddPipe} className="text-3xs text-steel-light font-bold hover:underline flex items-center gap-0.5">
                <Plus size={10} /> Add Pipe
              </button>
            </div>
            <div className="flex-1 border border-sf-border rounded-lg overflow-hidden bg-sf-surface flex flex-col">
              {pipes.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-4 text-center text-txt-muted text-xs gap-1">
                  <span>No pipes Lowered</span>
                </div>
              ) : (
                pipes.map((pipe) => {
                  const isSelected = selectedPipeId === pipe.id;
                  const totalD = borewell.totalDepth || 250;
                  const heightPercent = ((pipe.endDepth - pipe.startDepth) / totalD) * 100;
                  const isSlotted = pipe.pipeType === 'slotted';
                  return (
                    <div
                      key={pipe.id}
                      onClick={() => {
                        setSelectedPipeId(pipe.id);
                        setSelectedLayerId(null);
                      }}
                      style={{ height: `${heightPercent}%` }}
                      className={`
                        w-full flex flex-col justify-center items-center text-center border-b border-sf-border last:border-b-0 cursor-pointer transition-all
                        ${isSlotted ? 'bg-steel text-white' : 'bg-white text-txt-inverse'}
                        ${isSelected ? 'ring-2 ring-accent ring-inset' : ''}
                      `}
                    >
                      {isSlotted && (
                        <div className="absolute inset-0 opacity-15 pointer-events-none" style={{
                          backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 2px, transparent 0, transparent 8px)'
                        }} />
                      )}
                      <span className="text-3xs font-bold leading-none">{isSlotted ? 'Slotted' : 'Plain'}</span>
                      <span className="text-5xs opacity-80 leading-none mt-0.5">{pipe.startDepth} - {pipe.endDepth} ft</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </main>

        {/* Right Panel: Properties Config Editor */}
        <aside className="w-[300px] border-l border-sf-border bg-sf-surface p-4 flex flex-col flex-shrink-0">
          <h3 className="text-2xs font-bold text-txt-primary uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <Sliders size={14} className="text-accent" />
            <span>Properties Panel</span>
          </h3>

          <div className="flex-1 space-y-4">
            {/* Selected Strata Editor */}
            {selectedLayer && (
              <div className="space-y-4 animate-slide-up">
                <div className="flex justify-between items-center border-b border-sf-border pb-2">
                  <span className="text-2xs font-bold text-txt-primary">Edit Strata Layer</span>
                  <button onClick={() => handleDeleteLayer(selectedLayer.id)} className="p-1 hover:bg-danger/10 text-txt-muted hover:text-danger rounded">
                    <Trash2 size={14} />
                  </button>
                </div>

                <div>
                  <label className="sf-label text-3xs">Material Classification</label>
                  <input
                    type="text"
                    value={selectedLayer.material}
                    onChange={(e) => handleUpdateLayer({ material: e.target.value })}
                    className="sf-input text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="sf-label text-3xs">Start Depth (ft)</label>
                    <input
                      type="number"
                      value={selectedLayer.startDepth}
                      onChange={(e) => handleUpdateLayer({ startDepth: Number(e.target.value) })}
                      className="sf-input text-xs"
                    />
                  </div>
                  <div>
                    <label className="sf-label text-3xs">End Depth (ft)</label>
                    <input
                      type="number"
                      value={selectedLayer.endDepth}
                      onChange={(e) => handleUpdateLayer({ endDepth: Number(e.target.value) })}
                      className="sf-input text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="sf-label text-3xs">Color Swatch</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedLayer.color}
                      onChange={(e) => handleUpdateLayer({ color: e.target.value })}
                      className="w-8 h-8 rounded border border-sf-border cursor-pointer bg-transparent"
                    />
                    <span className="text-2xs font-mono text-txt-muted uppercase">{selectedLayer.color}</span>
                  </div>
                </div>

                <div>
                  <label className="sf-label text-3xs">Layer Observations / Remarks</label>
                  <textarea
                    rows={3}
                    placeholder="Enter observation notes..."
                    value={selectedLayer.remarks || ''}
                    onChange={(e) => handleUpdateLayer({ remarks: e.target.value })}
                    className="sf-input text-xs font-sans"
                  />
                </div>
              </div>
            )}

            {/* Selected Pipe Editor */}
            {selectedPipe && (
              <div className="space-y-4 animate-slide-up">
                <div className="flex justify-between items-center border-b border-sf-border pb-2">
                  <span className="text-2xs font-bold text-txt-primary">Edit Pipe Segment</span>
                  <button onClick={() => handleDeletePipe(selectedPipe.id)} className="p-1 hover:bg-danger/10 text-txt-muted hover:text-danger rounded">
                    <Trash2 size={14} />
                  </button>
                </div>

                <div>
                  <label className="sf-label text-3xs">Pipe Type</label>
                  <select
                    value={selectedPipe.pipeType}
                    onChange={(e) => handleUpdatePipe({ pipeType: e.target.value as 'plain' | 'slotted' })}
                    className="sf-input text-xs"
                  >
                    <option value="plain">Plain Pipe (Casing)</option>
                    <option value="slotted">Slotted Pipe (Screen)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="sf-label text-3xs">Start Depth (ft)</label>
                    <input
                      type="number"
                      value={selectedPipe.startDepth}
                      onChange={(e) => handleUpdatePipe({ startDepth: Number(e.target.value) })}
                      className="sf-input text-xs"
                    />
                  </div>
                  <div>
                    <label className="sf-label text-3xs">End Depth (ft)</label>
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

            {/* Empty State */}
            {!selectedLayer && !selectedPipe && (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-txt-muted text-2xs gap-1 pt-20">
                <HelpCircle size={20} />
                <span>Select a layer or pipe segment on the chart to customize its characteristics.</span>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
export default StrataEditorPage;
