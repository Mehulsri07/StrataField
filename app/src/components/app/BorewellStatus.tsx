import type { Borewell, StrataLayer } from "@strata/core";
import { missingDetails } from "@strata/core";
import { Chip } from "./Chip";

/** The single most useful thing to know about a record, shown as one chip. */
export function BorewellStatus({ borewell: b, strata }: { borewell: Borewell; strata: StrataLayer[] }) {
  if (b.latitude == null || b.longitude == null) return <Chip tone="warn">No location</Chip>;
  if (strata.length === 0) return <Chip tone="warn">No layers yet</Chip>;
  const missing = missingDetails(b);
  if (missing.length > 0) return <Chip tone="warn">No {missing.join(", ")}</Chip>;
  if (b.locationSource === "address") return <Chip>Approximate location</Chip>;
  return <Chip>Complete</Chip>;
}

/** Plain description of where a borewell's location came from. */
export function locationSourceText(source: Borewell["locationSource"]): string {
  switch (source) {
    case "gps": return "From GPS";
    case "photo": return "From a photo's GPS";
    case "map": return "Picked on the map";
    case "typed": return "Typed in";
    case "address": return "Approximate, from the address";
    case "imported": return "From an Excel file";
    default: return "Source not known";
  }
}
