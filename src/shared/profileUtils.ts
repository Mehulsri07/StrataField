import type { StrataLayer, PipeSegment } from './types';

/**
 * Merges consecutive strata layers with the same material (case-insensitive).
 * Combines remarks if they are non-empty and unique.
 */
export function mergeStrataLayers(layers: StrataLayer[]): StrataLayer[] {
  if (layers.length === 0) return [];
  
  // Sort layers by startDepth to ensure sequential matching
  const sorted = [...layers].sort((a, b) => a.startDepth - b.startDepth);
  const merged: StrataLayer[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const isConsecutive = next.startDepth === current.endDepth;
    const isSameMaterial = next.material.toLowerCase().trim() === current.material.toLowerCase().trim();

    if (isConsecutive && isSameMaterial) {
      current.endDepth = next.endDepth;
      // Handle combining remarks
      if (next.remarks && next.remarks.trim() !== '') {
        if (current.remarks && current.remarks.trim() !== '') {
          if (!current.remarks.toLowerCase().includes(next.remarks.toLowerCase().trim())) {
            current.remarks = `${current.remarks}; ${next.remarks.trim()}`;
          }
        } else {
          current.remarks = next.remarks.trim();
        }
      }
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
}

/**
 * Merges consecutive pipe segments with the same casing type.
 */
export function mergePipeSegments(pipes: PipeSegment[]): PipeSegment[] {
  if (pipes.length === 0) return [];
  
  // Sort pipe segments by startDepth
  const sorted = [...pipes].sort((a, b) => a.startDepth - b.startDepth);
  const merged: PipeSegment[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const isConsecutive = next.startDepth === current.endDepth;
    const isSameType = next.pipeType === current.pipeType;

    if (isConsecutive && isSameType) {
      current.endDepth = next.endDepth;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
}
