/**
 * BorewellDetailPage — Complete record details and visualization canvas.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { ArrowLeft, Edit3, Trash2, MapPin, Compass, Settings2, FileText, AlertTriangle, Layers, FolderGit, Share2 } from 'lucide-react';
import type { StrataLayer, PipeSegment } from '@shared/types';
import { validateStrata, validatePipeSegments } from '@/shared/validation';

export function BorewellDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const borewells = useBorewellStore((s) => s.borewells);
  const deleteBorewell = useBorewellStore((s) => s.deleteBorewell);
  const strataStore = useBorewellStore((s) => s.strataLayers);
  const pipeStore = useBorewellStore((s) => s.pipeSegments);
  const setStrataLayers = useBorewellStore((s) => s.setStrataLayers);
  const setPipeSegments = useBorewellStore((s) => s.setPipeSegments);
  const fetchStrata = useBorewellStore((s) => s.fetchStrata);
  const fetchPipes = useBorewellStore((s) => s.fetchPipes);
  const addToast = useUIStore((s) => s.addToast);

  const borewell = borewells.find((b) => b.id === id);
  const [isLoaded, setIsLoaded] = useState(false);

  const layers = id ? strataStore[id] || [] : [];
  const pipes = id ? pipeStore[id] || [] : [];

  // Fetch strata and pipes from DB on mount/ID change
  useEffect(() => {
    async function loadData() {
      if (id) {
        setIsLoaded(false);
        await Promise.all([
          fetchStrata(id),
          fetchPipes(id),
        ]);
        setIsLoaded(true);
      }
    }
    loadData();
  }, [id, fetchStrata, fetchPipes]);

  // Seed default layers only after data is loaded and verified empty
  useEffect(() => {
    if (id && borewell && isLoaded) {
      const dbLayers = strataStore[id] || [];
      const dbPipes = pipeStore[id] || [];

      if (dbLayers.length === 0) {
        const seedLayers: StrataLayer[] = [
          { id: 'l1', borewellId: id, startDepth: 0, endDepth: 40, material: 'Clay', color: '#8D6E63', pattern: 'bricks', remarks: 'Brown sticky clay' },
          { id: 'l2', borewellId: id, startDepth: 40, endDepth: 110, material: 'Sand', color: '#E0C097', pattern: 'dots', remarks: 'Fine sand with water trace' },
          { id: 'l3', borewellId: id, startDepth: 110, endDepth: 180, material: 'Gravel', color: '#9E9E9E', pattern: 'circles', remarks: 'Coarse water-bearing gravel' },
          { id: 'l4', borewellId: id, startDepth: 180, endDepth: (borewell.totalDepth || 250), material: 'Rock', color: '#616161', pattern: 'diagonal', remarks: 'Hard granite bedrock' },
        ];
        setStrataLayers(id, seedLayers);
      }

      if (dbPipes.length === 0) {
        const seedPipes: PipeSegment[] = [
          { id: 'p1', borewellId: id, startDepth: 0, endDepth: 110, pipeType: 'plain' },
          { id: 'p2', borewellId: id, startDepth: 110, endDepth: 180, pipeType: 'slotted' },
          { id: 'p3', borewellId: id, startDepth: 180, endDepth: (borewell.totalDepth || 250), pipeType: 'plain' },
        ];
        setPipeSegments(id, seedPipes);
      }
    }
  }, [id, borewell, isLoaded, strataStore, pipeStore]);

  if (!borewell) {
    return (
      <div className="p-6 text-center text-txt-muted text-sm space-y-4">
        <p>Borewell record not found or has been deleted.</p>
        <button onClick={() => navigate('/')} className="sf-btn-primary">Return to Dashboard</button>
      </div>
    );
  }

  // Run shared data integrity validation
  const strataErrors = validateStrata(layers, borewell.totalDepth);
  const pipeErrors = validatePipeSegments(pipes, borewell.totalDepth);
  const integrityErrors = [...strataErrors, ...pipeErrors];

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this borewell record? It will be moved to the Recycle Bin.')) {
      deleteBorewell(borewell.id);
      addToast({ message: 'Record moved to Recycle Bin.', type: 'info' });
      navigate('/');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-none">
      {/* Detail Page Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-sf-surface-2 border border-sf-border text-txt-secondary hover:text-txt-primary rounded-lg transition-all cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-txt-primary">{borewell.ownerName}</h1>
              <span className="sf-badge-accent">{borewell.borewellId}</span>
            </div>
            <p className="text-2xs text-txt-muted mt-0.5">
              Logged on {new Date(borewell.date).toLocaleDateString()} | Created {new Date(borewell.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/borewell/${borewell.id}/strata`)}
            className="sf-btn-primary flex items-center gap-1.5"
          >
            <Edit3 size={14} />
            <span>Edit Design Chart</span>
          </button>

          <button
            onClick={handleDelete}
            className="sf-btn-danger flex items-center gap-1.5"
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Data Integrity Warning Banner */}
      {integrityErrors.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex gap-3 text-xs text-warning animate-fadeIn">
          <AlertTriangle className="flex-shrink-0 mt-0.5" size={18} />
          <div className="space-y-1">
            <span className="font-bold block">Geological Data Integrity Issues Detected:</span>
            <ul className="list-disc pl-4 space-y-1 text-txt-secondary">
              {integrityErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
            <span className="text-2xs text-txt-muted block pt-1">
              Please click "Edit Design Chart" to correct these depths or material issues.
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Columns: Metadata Details */}
        <div className="lg:col-span-1 space-y-6">
          {/* Specs Sheet */}
          <div className="sf-panel p-5 space-y-4 shadow-sf">
            <h2 className="text-sm font-bold text-txt-primary pb-1.5 border-b border-sf-border flex items-center gap-1.5">
              <Settings2 size={16} className="text-accent" />
              <span>Technical Specifications</span>
            </h2>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-sf-surface-2 border border-sf-border rounded p-2.5 col-span-2 flex items-center gap-2">
                <FolderGit size={14} className="text-accent" />
                <div className="flex-1">
                  <span className="text-3xs text-txt-muted block uppercase tracking-wider">Project Name</span>
                  <span className="text-xs font-bold text-txt-primary mt-0.5">{borewell.project || 'Default Project'}</span>
                </div>
              </div>
              
              <div className="bg-sf-surface-2 border border-sf-border rounded p-2.5">
                <span className="text-3xs text-txt-muted block uppercase tracking-wider">Bore Diameter</span>
                <span className="text-sm font-bold text-txt-primary mt-0.5">{borewell.boreDia ? `${borewell.boreDia}"` : 'N/A'}</span>
              </div>
              <div className="bg-sf-surface-2 border border-sf-border rounded p-2.5">
                <span className="text-3xs text-txt-muted block uppercase tracking-wider">Pipe Lowering Dia</span>
                <span className="text-sm font-bold text-txt-primary mt-0.5">{borewell.pipeDia ? `${borewell.pipeDia}"` : 'N/A'}</span>
              </div>
              <div className="bg-sf-surface-2 border border-sf-border rounded p-2.5">
                <span className="text-3xs text-txt-muted block uppercase tracking-wider">Total Drilled Depth</span>
                <span className="text-sm font-bold text-accent mt-0.5">{borewell.totalDepth ? `${borewell.totalDepth} ft` : 'N/A'}</span>
              </div>
              <div className="bg-sf-surface-2 border border-sf-border rounded p-2.5">
                <span className="text-3xs text-txt-muted block uppercase tracking-wider">Static Water Table</span>
                <span className="text-sm font-bold text-txt-primary mt-0.5">{borewell.waterLevel ? `${borewell.waterLevel} ft` : 'N/A'}</span>
              </div>

              <div className="bg-sf-surface-2 border border-sf-border rounded p-2.5 col-span-2 flex items-center gap-2">
                <Share2 size={14} className="text-success" />
                <div className="flex-1">
                  <span className="text-3xs text-txt-muted block uppercase tracking-wider">Import Details</span>
                  <span className="text-2xs font-semibold text-txt-secondary mt-0.5">
                    {borewell.importMethod === 'excel'
                      ? `Imported from Excel (${borewell.importSource})`
                      : 'Manually logged in-app'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Location & Address */}
          <div className="sf-panel p-5 space-y-3 shadow-sf">
            <h2 className="text-sm font-bold text-txt-primary pb-1.5 border-b border-sf-border flex items-center gap-1.5">
              <MapPin size={16} className="text-accent" />
              <span>Location Details</span>
            </h2>
            <div className="text-xs space-y-2.5">
              <div>
                <span className="text-txt-muted block text-3xs font-semibold uppercase tracking-wider">City</span>
                <span className="text-txt-primary font-medium">{borewell.city}</span>
              </div>
              <div>
                <span className="text-txt-muted block text-3xs font-semibold uppercase tracking-wider">Area/Locality</span>
                <span className="text-txt-primary font-medium">{borewell.area || 'Not Logged'}</span>
              </div>
              <div>
                <span className="text-txt-muted block text-3xs font-semibold uppercase tracking-wider">Site Address</span>
                <span className="text-txt-secondary font-medium leading-relaxed">{borewell.address || 'N/A'}</span>
              </div>
              <div className="pt-2 border-t border-sf-border flex justify-between text-2xs">
                <div className="flex items-center gap-1"><Compass size={12} className="text-txt-muted" /> Latitude: <span>{borewell.latitude?.toFixed(5) || 'N/A'}</span></div>
                <div className="flex items-center gap-1"><Compass size={12} className="text-txt-muted" /> Longitude: <span>{borewell.longitude?.toFixed(5) || 'N/A'}</span></div>
              </div>
            </div>
          </div>

          {/* Geological Remarks */}
          <div className="sf-panel p-5 space-y-2 shadow-sf">
            <h2 className="text-sm font-bold text-txt-primary pb-1.5 border-b border-sf-border flex items-center gap-1.5">
              <FileText size={16} className="text-accent" />
              <span>Driller's Logging Remarks</span>
            </h2>
            <p className="text-xs text-txt-secondary leading-relaxed font-sans bg-sf-surface-2 border border-sf-border rounded p-3">
              {borewell.remarks || 'No logging remarks entered for this borewell.'}
            </p>
          </div>
        </div>

        {/* Right Column: Geological Visual Layout */}
        <div className="lg:col-span-2 space-y-4">
          <div className="sf-panel p-5 shadow-sf flex flex-col min-h-[500px]">
            <h2 className="text-sm font-bold text-txt-primary pb-2 border-b border-sf-border flex items-center gap-1.5 mb-4">
              <Layers size={16} className="text-accent" />
              <span>Physical Profile (Strata Chart & Pipe lowering side-by-side)</span>
            </h2>

            {/* Visual Canvas Container */}
            <div className="flex-1 flex gap-6 select-none overflow-x-auto min-w-[450px] bg-sf-void p-4 border border-sf-border rounded-xl">
              {/* Depth Scale Ruler */}
              <div className="w-14 flex flex-col justify-between py-2 border-r border-sf-border pr-2 font-mono text-[10px] text-txt-muted text-right select-none">
                {Array.from({ length: 11 }, (_, i) => Math.round(i * ((borewell.totalDepth || 250) / 10))).map((t) => (
                  <div key={t} className="h-0 flex items-center justify-end gap-1">
                    <span>{t} ft</span>
                  </div>
                ))}
              </div>

              {/* Strata Column Visual */}
              <div className="flex-1 flex flex-col gap-1 py-1 max-w-[240px]">
                <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wider text-center block mb-1">Geological Strata</span>
                <div className="flex-1 border border-sf-border rounded-xl overflow-hidden flex flex-col bg-sf-surface">
                  {layers.length === 0 ? (
                    <div className="flex items-center justify-center flex-1 text-2xs text-txt-muted">No layers defined</div>
                  ) : (
                    layers.map((layer) => {
                      const totalD = borewell.totalDepth || 250;
                      const heightPercent = ((layer.endDepth - layer.startDepth) / totalD) * 100;
                      const patternStyle = {
                        backgroundImage: layer.pattern === 'dots'
                          ? 'radial-gradient(rgba(0, 0, 0, 0.25) 15%, transparent 16%)'
                          : layer.pattern === 'lines'
                          ? 'linear-gradient(90deg, rgba(0, 0, 0, 0.2) 1px, transparent 0)'
                          : layer.pattern === 'diagonal'
                          ? 'linear-gradient(45deg, rgba(0, 0, 0, 0.2) 25%, transparent 25%, transparent 50%, rgba(0, 0, 0, 0.2) 50%, rgba(0, 0, 0, 0.2) 75%, transparent 75%, transparent)'
                          : layer.pattern === 'bricks'
                          ? 'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.2) 0, rgba(0, 0, 0, 0.2) 1px, transparent 0, transparent 8px)'
                          : layer.pattern === 'circles'
                          ? 'radial-gradient(circle, rgba(0,0,0,0.15) 30%, transparent 40%)'
                          : 'none',
                        backgroundSize: '10px 10px'
                      };
                      return (
                        <div
                          key={layer.id}
                          style={{ height: `${heightPercent}%`, backgroundColor: layer.color, minHeight: '64px' }}
                          className="w-full flex flex-col justify-center items-center text-center p-3 relative border-b border-black/10 last:border-b-0 hover:brightness-105 transition-all"
                          title={`${layer.material}: ${layer.startDepth}-${layer.endDepth} ft`}
                        >
                          <div className="absolute inset-0 opacity-20 pointer-events-none" style={patternStyle} />
                          <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: layer.color }} />
                          <div className="absolute top-1 left-2 text-[9px] font-mono text-black/50 select-none drop-shadow">
                            {layer.startDepth} ft
                          </div>
                          <div className="absolute bottom-1 left-2 text-[9px] font-mono text-black/50 select-none drop-shadow">
                            {layer.endDepth} ft
                          </div>
                          <div className="bg-black/50 backdrop-blur-xs border border-white/10 rounded-md px-2 py-0.5 max-w-[90%] truncate shadow z-10">
                            <span className="text-2xs font-extrabold text-white tracking-wide">{layer.material}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Pipe Column Visual */}
              <div className="w-[140px] flex flex-col gap-1 py-1">
                <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wider text-center block mb-1">Pipe Assembly</span>
                <div className="flex-1 border border-sf-border rounded-xl overflow-hidden bg-sf-surface flex flex-col relative">
                  {pipes.length === 0 ? (
                    <div className="flex items-center justify-center flex-1 text-2xs text-txt-muted">No assembly lowered</div>
                  ) : (
                    pipes.map((pipe) => {
                      const totalD = borewell.totalDepth || 250;
                      const heightPercent = ((pipe.endDepth - pipe.startDepth) / totalD) * 100;
                      const isSlotted = pipe.pipeType === 'slotted';
                      return (
                        <div
                          key={pipe.id}
                          style={{ height: `${heightPercent}%`, minHeight: '48px' }}
                          className={`
                            w-full flex flex-col justify-center items-center text-center relative border-b border-sf-border/50 last:border-b-0
                            ${isSlotted 
                              ? 'bg-accent text-white font-black' 
                              : 'bg-white text-slate-800 font-extrabold border-l-[3px] border-r-[3px] border-slate-300'
                            }
                          `}
                          title={`${isSlotted ? 'Slotted Screen' : 'Plain Casing'}: ${pipe.startDepth}-${pipe.endDepth} ft`}
                        >
                          {isSlotted && (
                            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
                              backgroundImage: 'repeating-linear-gradient(90deg, #fff 0, #fff 2px, transparent 0, transparent 8px)'
                            }} />
                          )}
                          <span className="absolute top-1 text-[8px] opacity-70 leading-none select-none">
                            {pipe.startDepth} ft
                          </span>
                          <span className="absolute bottom-1 text-[8px] opacity-70 leading-none select-none">
                            {pipe.endDepth} ft
                          </span>
                          <span className="text-[10px] uppercase tracking-wider drop-shadow">{isSlotted ? 'Slotted' : 'Plain'}</span>
                          <span className="text-[8px] opacity-80 mt-0.5">{pipe.endDepth - pipe.startDepth} ft</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default BorewellDetailPage;
