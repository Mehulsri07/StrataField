import React from 'react';
import type { StrataLayer, PipeSegment } from '@shared/types';
import { ChevronUp, ChevronDown } from 'lucide-react';

// Grayscale-safe geological pattern definitions
export function getMaterialPatternStyle(pattern: string, color: string, isPrintPreview: boolean) {
  let bgColor = color;
  if (isPrintPreview) {
    if (pattern === 'lines' || pattern === 'horizontal' || pattern === 'clay') {
      bgColor = '#f8fafc'; // light clay gray
    } else if (pattern === 'dots' || pattern === 'sand') {
      bgColor = '#fafaf9'; // sand gray
    } else if (pattern === 'circles' || pattern === 'gravel') {
      bgColor = '#f1f5f9'; // gravel gray
    } else if (pattern === 'diagonal' || pattern === 'rock') {
      bgColor = '#e2e8f0'; // rock gray
    } else {
      bgColor = '#ffffff';
    }
  }

  const strokeColor = isPrintPreview ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.25)';

  let bgImage = 'none';
  if (pattern === 'lines' || pattern === 'horizontal' || pattern === 'clay') {
    bgImage = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='8'%3E%3Cline x1='0' y1='4' x2='10' y2='4' stroke='${encodeURIComponent(strokeColor)}' stroke-width='0.75'/%3E%3C/svg%3E")`;
  } else if (pattern === 'dots' || pattern === 'sand') {
    bgImage = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='6'%3E%3Ccircle cx='2' cy='2' r='0.6' fill='${encodeURIComponent(strokeColor)}'/%3E%3Ccircle cx='5' cy='5' r='0.6' fill='${encodeURIComponent(strokeColor)}'/%3E%3C/svg%3E")`;
  } else if (pattern === 'circles' || pattern === 'gravel') {
    bgImage = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Ccircle cx='4' cy='4' r='2.2' fill='none' stroke='${encodeURIComponent(strokeColor)}' stroke-width='0.75'/%3E%3Ccircle cx='12' cy='12' r='2.2' fill='none' stroke='${encodeURIComponent(strokeColor)}' stroke-width='0.75'/%3E%3C/svg%3E")`;
  } else if (pattern === 'diagonal' || pattern === 'rock') {
    bgImage = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Cpath d='M-1,1 L2,-2 M0,10 L10,0 M9,11 L11,9' stroke='${encodeURIComponent(strokeColor)}' stroke-width='0.75'/%3E%3C/svg%3E")`;
  }

  return {
    backgroundColor: bgColor,
    backgroundImage: bgImage,
    backgroundRepeat: 'repeat',
  };
}

export function getPipeStyle(pipeType: string, isPrintPreview: boolean) {
  if (isPrintPreview) {
    if (pipeType === 'slotted') {
      return {
        backgroundColor: '#e2e8f0',
        borderColor: '#000000',
        color: '#000000',
      };
    } else {
      return {
        backgroundColor: '#ffffff',
        borderColor: '#000000',
        color: '#000000',
      };
    }
  } else {
    if (pipeType === 'slotted') {
      return {
        backgroundColor: 'var(--pipe-slotted)',
        borderColor: 'var(--sf-border)',
        color: '#ffffff',
      };
    } else {
      return {
        backgroundColor: 'var(--pipe-plain)',
        borderColor: 'var(--sf-border)',
        color: 'var(--txt-primary)',
      };
    }
  }
}

interface BorewellProfileDrawingProps {
  borewell: any;
  layers: StrataLayer[];
  pipes: PipeSegment[];
  scaleFactor: number;
  isPrintPreview: boolean;
  hoveredStrataId: string | null;
  setHoveredStrataId: (id: string | null) => void;
  hoveredPipeId: string | null;
  setHoveredPipeId: (id: string | null) => void;
  selectedEntity: { type: 'strata' | 'pipe'; id: string } | null;
  setSelectedEntity: (entity: { type: 'strata' | 'pipe'; id: string } | null) => void;
  readOnly?: boolean;
  onMoveLayer?: (index: number, direction: 'up' | 'down') => void;
}

export const BorewellProfileDrawing: React.FC<BorewellProfileDrawingProps> = ({
  borewell,
  layers,
  pipes,
  scaleFactor,
  isPrintPreview,
  hoveredStrataId,
  setHoveredStrataId,
  hoveredPipeId,
  setHoveredPipeId,
  selectedEntity,
  setSelectedEntity,
  readOnly = false,
  onMoveLayer,
}) => {
  const totalDepth = borewell.totalDepth || 250;
  const drawingHeight = totalDepth * scaleFactor;

  // Generate tick steps of 10 ft (minor) and 20 ft (major)
  const minorStep = 10;
  const ticks = Array.from({ length: Math.floor(totalDepth / minorStep) + 1 }, (_, i) => i * minorStep);

  // Check if a layer intersects with the hovered pipe segment
  const isStrataIntersectingHoveredPipe = (layer: StrataLayer) => {
    if (!hoveredPipeId) return false;
    const activePipe = pipes.find((p) => p.id === hoveredPipeId);
    if (!activePipe) return false;
    // Intersection condition: Layer overlaps pipe range
    return layer.startDepth < activePipe.endDepth && layer.endDepth > activePipe.startDepth;
  };

  // Check if a tick matches the hovered strata range
  const isTickInHoveredStrata = (tick: number) => {
    if (!hoveredStrataId) return false;
    const activeLayer = layers.find((l) => l.id === hoveredStrataId);
    if (!activeLayer) return false;
    return tick >= activeLayer.startDepth && tick <= activeLayer.endDepth;
  };

  const handleSelectStrata = (e: React.MouseEvent, layer: StrataLayer) => {
    if (readOnly) return;
    e.stopPropagation();
    setSelectedEntity({ type: 'strata', id: layer.id });
  };

  const handleSelectPipe = (e: React.MouseEvent, segment: PipeSegment) => {
    if (readOnly) return;
    e.stopPropagation();
    setSelectedEntity({ type: 'pipe', id: segment.id });
  };

  const clearSelection = () => {
    if (readOnly) return;
    setSelectedEntity(null);
  };

  return (
    <div
      onClick={clearSelection}
      className={`relative flex select-none font-mono ${
        isPrintPreview ? 'bg-white text-black' : 'bg-sf-void text-txt-primary'
      }`}
      style={{ height: `${drawingHeight}px`, minWidth: '700px', width: '100%' }}
    >
      {/* 1. DEPTH SCALE RULER (Sticky Left) */}
      <div
        className={`sticky left-0 w-24 flex-shrink-0 z-30 border-r ${
          isPrintPreview
            ? 'bg-white border-black text-black'
            : 'bg-sf-base border-sf-border text-txt-secondary'
        }`}
        style={{ height: '100%' }}
      >
        {/* Hover Highlight Area on Ruler */}
        {hoveredStrataId && (() => {
          const l = layers.find((layer) => layer.id === hoveredStrataId);
          if (!l) return null;
          return (
            <div
              className={`absolute left-0 right-0 pointer-events-none opacity-10 ${
                isPrintPreview ? 'bg-black' : 'bg-accent'
              }`}
              style={{
                top: `${l.startDepth * scaleFactor}px`,
                height: `${(l.endDepth - l.startDepth) * scaleFactor}px`,
              }}
            />
          );
        })()}

        {/* Depth Ticks */}
        {ticks.map((tick) => {
          const isMajor = tick % 20 === 0;
          const isHighlighted = isTickInHoveredStrata(tick);
          return (
            <div
              key={tick}
              className="absolute left-0 right-0 flex items-center justify-end"
              style={{ top: `${tick * scaleFactor}px`, transform: 'translateY(-50%)' }}
            >
              <span
                className={`text-[9px] mr-2 transition-all ${
                  isHighlighted
                    ? 'font-extrabold text-accent scale-110'
                    : isMajor
                    ? 'font-bold opacity-100'
                    : 'opacity-60'
                }`}
              >
                {tick} ft
              </span>
              <div
                className={`h-px transition-all ${
                  isHighlighted ? 'bg-accent' : isPrintPreview ? 'bg-black' : 'bg-sf-border'
                }`}
                style={{ width: isMajor ? '12px' : '6px' }}
              />
            </div>
          );
        })}
      </div>

      {/* 2. BACKGROUND DEPTH GRID REFERENCE LINES (across columns) */}
      <div className="absolute left-24 right-0 top-0 bottom-0 pointer-events-none z-0">
        {ticks.map((tick) => {
          const isMajor = tick % 20 === 0;
          return (
            <div
              key={tick}
              className={`absolute left-0 right-0 border-t ${
                isMajor
                  ? isPrintPreview
                    ? 'border-black/20'
                    : 'border-sf-border/30'
                  : isPrintPreview
                  ? 'border-black/10 border-dashed'
                  : 'border-sf-border/15 border-dashed'
              }`}
              style={{ top: `${tick * scaleFactor}px` }}
            />
          );
        })}
      </div>

      {/* COLUMN CONTENT CONTAINER */}
      <div className="flex-1 flex relative z-10" style={{ paddingLeft: '24px' }}>
        {/* 3. GEOLOGICAL STRATA COLUMN */}
        <div
          className={`relative w-64 flex-shrink-0 border-r border-l ${
            isPrintPreview ? 'border-black bg-white' : 'border-sf-border bg-sf-base'
          }`}
          style={{ height: '100%' }}
        >
          {/* Header Title inside column block */}
          <div
            className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-extrabold tracking-wider z-20 ${
              isPrintPreview ? 'bg-white/80 border border-black' : 'bg-sf-surface/85 border border-sf-border'
            }`}
          >
            GEOLOGICAL STRATA
          </div>

          {layers.map((layer, idx) => {
            const isHovered = hoveredStrataId === layer.id;
            const isIntersecting = isStrataIntersectingHoveredPipe(layer);
            const isSelected = selectedEntity?.type === 'strata' && selectedEntity.id === layer.id;
            const height = (layer.endDepth - layer.startDepth) * scaleFactor;
            const isTooSmallForLabel = height < 36;

            const patternStyle = getMaterialPatternStyle(layer.pattern, layer.color, isPrintPreview);

            return (
              <div
                key={layer.id}
                onMouseEnter={() => setHoveredStrataId(layer.id)}
                onMouseLeave={() => setHoveredStrataId(null)}
                onClick={(e) => handleSelectStrata(e, layer)}
                style={{
                  top: `${layer.startDepth * scaleFactor}px`,
                  height: `${height}px`,
                  ...patternStyle,
                }}
                className={`absolute left-0 right-0 border-b flex flex-col justify-center items-center px-4 cursor-pointer transition-all group ${
                  isPrintPreview ? 'border-black text-black' : 'border-sf-border/40 text-white'
                } ${
                  isHovered || isIntersecting
                    ? isPrintPreview
                      ? 'ring-2 ring-black brightness-95'
                      : 'ring-2 ring-accent scale-[1.005] z-20 brightness-110 shadow-lg'
                    : ''
                } ${isSelected ? (isPrintPreview ? 'ring-2 ring-black font-extrabold' : 'ring-2 ring-accent bg-accent-muted/10') : ''}`}
                title={`${layer.material}: ${layer.startDepth}-${layer.endDepth} ft`}
              >
                {/* Reordering Controls overlay */}
                {onMoveLayer && !isPrintPreview && (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity flex flex-col gap-0.5 bg-black/75 backdrop-blur rounded p-0.5 z-30">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onMoveLayer(idx, 'up'); }}
                      disabled={idx === 0}
                      className="p-0.5 text-white/70 hover:text-white disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronUp size={11} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onMoveLayer(idx, 'down'); }}
                      disabled={idx === layers.length - 1}
                      className="p-0.5 text-white/70 hover:text-white disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronDown size={11} />
                    </button>
                  </div>
                )}

                {!isTooSmallForLabel && (
                  <div
                    className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase select-none text-center ${
                      isPrintPreview
                        ? 'bg-white/90 border border-black text-black'
                        : 'bg-black/60 border border-white/10 text-white'
                    }`}
                  >
                    <div>{layer.material}</div>
                    <div className="text-[7px] opacity-75">
                      {layer.startDepth} - {layer.endDepth} ft
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 4. PIPE LOWERING ASSEMBLY COLUMN */}
        <div
          className={`relative w-48 flex-shrink-0 border-r ${
            isPrintPreview ? 'border-black bg-white' : 'border-sf-border bg-sf-base'
          }`}
          style={{ height: '100%', marginLeft: '48px' }}
        >
          {/* Header Title inside column block */}
          <div
            className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-extrabold tracking-wider z-20 ${
              isPrintPreview ? 'bg-white/80 border border-black' : 'bg-sf-surface/85 border border-sf-border'
            }`}
          >
            PIPE ASSEMBLY (Dia: {borewell.pipeDia ? `${borewell.pipeDia}"` : 'N/A'})
          </div>

          {pipes.map((pipe) => {
            const isHovered = hoveredPipeId === pipe.id;
            const isSelected = selectedEntity?.type === 'pipe' && selectedEntity.id === pipe.id;
            const height = (pipe.endDepth - pipe.startDepth) * scaleFactor;
            const isSlotted = pipe.pipeType === 'slotted';
            const isTooSmallForLabel = height < 42;

            const pipeStyle = getPipeStyle(pipe.pipeType, isPrintPreview);

            return (
              <div
                key={pipe.id}
                onMouseEnter={() => setHoveredPipeId(pipe.id)}
                onMouseLeave={() => setHoveredPipeId(null)}
                onClick={(e) => handleSelectPipe(e, pipe)}
                style={{
                  top: `${pipe.startDepth * scaleFactor}px`,
                  height: `${height}px`,
                  ...pipeStyle,
                }}
                className={`absolute left-0 right-0 border-b border-l-4 border-r-4 flex flex-col justify-center items-center px-2 cursor-pointer transition-all ${
                  isPrintPreview ? 'border-black text-black' : 'border-sf-border/30 text-white'
                } ${
                  isSlotted
                    ? isPrintPreview
                      ? 'border-l-black border-r-black'
                      : 'border-l-blue-600 border-r-blue-600'
                    : isPrintPreview
                    ? 'border-l-gray-600 border-r-gray-600'
                    : 'border-l-gray-300 border-r-gray-300'
                } ${
                  isHovered
                    ? isPrintPreview
                      ? 'ring-2 ring-black brightness-95'
                      : 'ring-2 ring-success scale-[1.01] z-20 brightness-105 shadow-md'
                    : ''
                } ${isSelected ? (isPrintPreview ? 'ring-2 ring-black' : 'ring-2 ring-success') : ''}`}
                title={`${isSlotted ? 'Slotted Screen' : 'Plain Casing'}: ${pipe.startDepth}-${pipe.endDepth} ft`}
              >
                {/* Visual Slots drawing */}
                {isSlotted && (
                  <div className="absolute inset-0 opacity-15 pointer-events-none" style={{
                    backgroundImage: 'repeating-linear-gradient(90deg, currentColor 0, currentColor 2px, transparent 0, transparent 6px)'
                  }} />
                )}

                {/* Inner label (if space permits) */}
                {!isTooSmallForLabel ? (
                  <div className="flex flex-col items-center select-none text-center">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider">
                      {isSlotted ? 'Slotted' : 'Plain'}
                    </span>
                    <span className="text-[8px] opacity-90">
                      {pipe.startDepth} - {pipe.endDepth} ft
                    </span>
                    <span className="text-[8px] font-bold">
                      L = {pipe.endDepth - pipe.startDepth} ft
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* 5. LEADER LINE ANNOTATIONS LAYER (Stands to the right of casing column) */}
        <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: '380px', width: '280px' }}>
          {pipes.map((pipe) => {
            const height = (pipe.endDepth - pipe.startDepth) * scaleFactor;
            const isSlotted = pipe.pipeType === 'slotted';
            const isTooSmallForLabel = height < 42;

            if (!isTooSmallForLabel) return null;

            // Draw a leader line to the right of the short segment
            const midY = (pipe.startDepth + (pipe.endDepth - pipe.startDepth) / 2) * scaleFactor;
            return (
              <div
                key={pipe.id}
                className="absolute left-0 right-0 flex items-center"
                style={{ top: `${midY}px`, transform: 'translateY(-50%)' }}
              >
                {/* Horizontal pointer line */}
                <div
                  className={`w-12 h-px border-t ${
                    isPrintPreview ? 'border-black' : 'border-sf-border border-dashed'
                  }`}
                />
                
                {/* Text Bubble Callout */}
                <div
                  className={`ml-1.5 px-2 py-0.5 rounded text-[8px] font-bold border leading-none whitespace-nowrap ${
                    isPrintPreview
                      ? 'bg-white border-black text-black'
                      : isSlotted
                      ? 'bg-accent-muted/20 border-accent/30 text-accent-text'
                      : 'bg-sf-surface border-sf-border text-txt-secondary'
                  }`}
                >
                  {isSlotted ? 'SLOTTED' : 'PLAIN'}: {pipe.startDepth}-{pipe.endDepth} ft (L={pipe.endDepth - pipe.startDepth} ft)
                </div>
              </div>
            );
          })}

          {/* Strata small annotations if any (e.g. strata < 36px height) */}
          {layers.map((layer) => {
            const height = (layer.endDepth - layer.startDepth) * scaleFactor;
            const isTooSmallForLabel = height < 36;
            if (!isTooSmallForLabel) return null;

            const midY = (layer.startDepth + (layer.endDepth - layer.startDepth) / 2) * scaleFactor;

            return (
              <div
                key={layer.id}
                className="absolute flex items-center z-10"
                // Place it starting left pointing back to strata column (left: -80px)
                style={{ top: `${midY}px`, left: '-96px', transform: 'translateY(-50%)' }}
              >
                <div
                  className={`px-2 py-0.5 rounded text-[8px] font-bold border leading-none whitespace-nowrap ${
                    isPrintPreview
                      ? 'bg-white border-black text-black'
                      : 'bg-sf-surface border-sf-border text-txt-secondary'
                  }`}
                >
                  {layer.material}: {layer.startDepth}-{layer.endDepth} ft
                </div>
                <div
                  className={`w-6 h-px border-t ${
                    isPrintPreview ? 'border-black' : 'border-sf-border border-dashed'
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* 6. STATIC WATER LEVEL MARKER (across both strata and pipe columns) */}
        {borewell.waterLevel !== null && borewell.waterLevel !== undefined && (
          <div
            className="absolute left-0 pointer-events-none z-40 flex items-center justify-center"
            style={{
              top: `${borewell.waterLevel * scaleFactor}px`,
              width: '352px', // covers Strata (256px) + gap (48px) + Pipe (192px) - let's make it cover the entire width
              transform: 'translateY(-50%)',
            }}
          >
            {/* The cyan dashed line */}
            <div className="absolute inset-x-0 h-0.5 border-b-2 border-dashed border-cyan-500" />
            
            {/* The centered label */}
            <div className="relative px-2.5 py-0.5 rounded border border-cyan-500 bg-white dark:bg-sf-base text-cyan-600 dark:text-cyan-400 font-extrabold text-[9px] shadow-sm select-none z-10 uppercase tracking-wider">
              Static Water Level = {borewell.waterLevel} ft
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
