import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BorewellRecord, StrataLayer } from "@strata/core";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { LayerDialog, type LayerSelection } from "./LayerDialog";

/**
 * Everything a screen needs to open the layer popup: call `showLayer` from any clicked layer,
 * and render `popup` once. Loads the borewell's pipes and layers if the screen does not have them.
 */
export function useLayerPopup({ canEdit = true }: { canEdit?: boolean } = {}) {
  const navigate = useNavigate();
  const [selection, setSelection] = useState<LayerSelection | null>(null);

  const showLayer = async (layer: StrataLayer, record?: BorewellRecord) => {
    try {
      const r = record ?? (await api.borewells.get(layer.borewellId));
      setSelection({ kind: "measured", layer, borewell: r.borewell, strata: r.strata, pipes: r.pipes });
    } catch (e) {
      toast.error(String(e));
    }
  };

  const popup = (
    <LayerDialog
      selection={selection}
      onClose={() => setSelection(null)}
      onOpenBorewell={(id) => { setSelection(null); navigate(`/borewell/${id}`); }}
      onEditLayers={canEdit ? (id) => { setSelection(null); navigate(`/borewell/${id}/layers`); } : undefined}
    />
  );

  return { showLayer, showSelection: setSelection, selection, popup };
}
