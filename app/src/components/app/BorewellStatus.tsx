import type { Borewell, StrataLayer } from "@strata/core";
import { missingDetails } from "@strata/core";
import { Chip } from "./Chip";

/** What a record still lacks ("No location, owner"), or that it is complete. */
export function BorewellStatus({ borewell: b, strata }: { borewell: Borewell; strata: StrataLayer[] }) {
  const missing = [
    ...(b.latitude == null || b.longitude == null ? ["location"] : []),
    ...(strata.length === 0 ? ["layers"] : []),
    ...missingDetails(b),
  ];
  if (missing.length > 0) return <Chip tone="warn" className="whitespace-normal">No {missing.join(", ")}</Chip>;
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
