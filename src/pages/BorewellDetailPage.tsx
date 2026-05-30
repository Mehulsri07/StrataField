/**
 * BorewellDetailPage — Complete record details and visualization canvas.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBorewellStore } from '@/stores/borewellStore';
import { useUIStore } from '@/stores/uiStore';
import { ArrowLeft, Edit3, Trash2, MapPin, Calendar, Compass, Settings2, FileText, Plus, Eye, Layers } from 'lucide-react';
import type { StrataLayer, PipeSegment } from '@shared/types';

export function BorewellDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const borewells = useBorewellStore((s) => s.borewells);
  const deleteBorewell = useBorewellStore((s) => s.deleteBorewell);
  const strataStore = useBorewellStore((s) => s.strataLayers);
  const pipeStore = useBorewellStore((s) => s.pipeSegments);
  const setStrataLayers = useBorewellStore((s) => s.setStrataLayers);
  const setPipeSegments = useBorewellStore((s) => s.setPipeSegments);
  const addToast = useUIStore((s) => s.addToast);

  const borewell = borewells.find((b) => b.id === id);

  // Load strata and pipe segments from store or seed sample data
  const layers = id ? strataStore[id] || [] : [];
  const pipes = id ? pipeStore[id] || [] : [];

  useEffect(() => {
    if (id && borewell) {
      // Seed default mock layers if none exist to demonstrate the visual layout
      if (layers.length === 0) {
        const seedLayers: StrataLayer[] = [
          { id: 'l1', borewellId: id, startDepth: 0, endDepth: 40, material: 'Clay', color: '#8D6E63', pattern: 'bricks', remarks: 'Brown sticky clay' },
          { id: 'l2', borewellId: id, startDepth: 40, endDepth: 110, material: 'Sand', color: '#E0C097', pattern: 'dots', remarks: 'Fine sand with water trace' },
          { id: 'l3', borewellId: id, startDepth: 110, endDepth: 180, material: 'Gravel', color: '#9E9E9E', pattern: 'circles', remarks: 'Coarse water-bearing gravel' },
          { id: 'l4', borewellId: id, startDepth: 180, endDepth: (borewell.totalDepth || 250), material: 'Rock', color: '#616161', pattern: 'diagonal', remarks: 'Hard granite bedrock' },
        ];
        setStrataLayers(id, seedLayers);
      }

      if (pipes.length === 0) {
        const seedPipes: PipeSegment[] = [
          { id: 'p1', borewellId: id, startDepth: 0, endDepth: 110, pipeType: 'plain' },
          { id: 'p2', borewellId: id, startDepth: 110, endDepth: 180, pipeType: 'slotted' },
          { id: 'p3', borewellId: id, startDepth: 180, endDepth: (borewell.totalDepth || 250), pipeType: 'plain' },
        ];
        setPipeSegments(id, seedPipes);
      }
    }
  }, [id, borewell]);

  if (!borewell) {
    return (
      <div className="p-6 text-center text-txt-muted text-sm space-y-4">
        <p>Borewell record not found or has been deleted.</p>
        <button onClick={() => navigate('/')} className="sf-btn-primary">Return to Dashboard</button>
      </div>
    );
  }

  const handleDelete = () => {
    if (confirm('Are you sure you want to permanently delete this borewell record?')) {
      deleteBorewell(borewell.id);
      addToast({ message: 'Record deleted.', type: 'info' });
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
            <div className="flex-1 flex gap-8 select-none overflow-x-auto min-w-[450px]">
              {/* Depth Scale Ruler */}
              <div className="w-12 flex flex-col justify-between py-2 border-r border-sf-border pr-2 font-mono text-3xs text-txt-muted text-right select-none">
                <div>0 ft</div>
                <div>50 ft</div>
                <div>100 ft</div>
                <div>150 ft</div>
                <div>200 ft</div>
                <div>{borewell.totalDepth || 250} ft</div>
              </div>

              {/* Strata Column Visual */}
              <div className="flex-1 flex flex-col gap-1 py-1">
                <span className="text-3xs font-semibold text-txt-muted uppercase tracking-wider text-center block mb-1">Geological Strata Layers</span>
                <div className="flex-1 border border-sf-border rounded-lg overflow-hidden flex flex-col">
                  {layers.map((layer) => {
                    const totalD = borewell.totalDepth || 250;
                    const heightPercent = ((layer.endDepth - layer.startDepth) / totalD) * 100;
                    return (
                      <div
                        key={layer.id}
                        style={{ height: `${heightPercent}%`, backgroundColor: layer.color }}
                        className="w-full flex flex-col justify-center items-center text-center p-2 relative min-h-[48px] hover:brightness-110 transition-all border-b border-white/10 last:border-b-0"
                        title={`${layer.material}: ${layer.startDepth}-${layer.endDepth} ft`}
                      >
                        <span className="text-xs font-bold text-white drop-shadow-md">{layer.material}</span>
                        <span className="text-3xs text-white/80 drop-shadow-md">{layer.startDepth} - {layer.endDepth} ft</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pipe Column Visual */}
              <div className="w-[120px] flex flex-col gap-1 py-1">
                <span className="text-3xs font-semibold text-txt-muted uppercase tracking-wider text-center block mb-1">Pipe lowering</span>
                <div className="flex-1 border border-sf-border rounded-lg overflow-hidden flex flex-col bg-sf-void relative">
                  {pipes.map((pipe) => {
                    const totalD = borewell.totalDepth || 250;
                    const heightPercent = ((pipe.endDepth - pipe.startDepth) / totalD) * 100;
                    const isSlotted = pipe.pipeType === 'slotted';
                    return (
                      <div
                        key={pipe.id}
                        style={{ height: `${heightPercent}%` }}
                        className={`
                          w-full flex flex-col justify-center items-center text-center relative border-b border-sf-border last:border-b-0
                          ${isSlotted ? 'bg-steel text-white' : 'bg-white text-txt-inverse'}
                        `}
                      >
                        {isSlotted && (
                          <div className="absolute inset-0 opacity-15 pointer-events-none" style={{
                            backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 2px, transparent 0, transparent 8px)'
                          }} />
                        )}
                        <span className="text-2xs font-extrabold leading-none">{isSlotted ? 'Slotted' : 'Plain'}</span>
                        <span className="text-4xs opacity-80 leading-none mt-0.5">{pipe.startDepth} - {pipe.endDepth} ft</span>
                      </div>
                    );
                  })}
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
