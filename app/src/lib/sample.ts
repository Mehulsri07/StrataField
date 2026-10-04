/**
 * Sample data for the browser preview (design reviews and screenshots outside the app).
 * Real Lucknow localities, fictional owners and water levels. Never used inside the installed app.
 */
import type { Borewell, BorewellListItem, PipeSegment, StrataLayer } from "@strata/core";
import { DEFAULT_MATERIALS } from "@strata/core";

type Raw = [code: string, owner: string, area: string, zone: string, lat: number | null, lon: number | null, date: string, depth: number, water: number, source: "excel" | "manual"];

const RAW: Raw[] = [
  ["BW-2026-024", "Rakesh Srivastava", "Sector H, Aliganj", "Zone 3 · Trans-Gomti", 26.893, 80.942, "2026-09-22", 280, 92, "manual"],
  ["BW-2026-023", "Nidhi Awasthi", "Vibhuti Khand, Gomti Nagar", "Zone 4 · Gomti Nagar", 26.86, 81.008, "2026-09-15", 260, 78, "excel"],
  ["BW-2026-022", "Mohd. Shariq", "Chowk", "Zone 1 · Old City", 26.868, 80.911, "2026-09-06", 320, 116, "excel"],
  ["BW-2026-021", "Anjali Tripathi", "Sector 12, Indira Nagar", "Zone 3 · Trans-Gomti", 26.883, 80.999, "2026-08-28", 270, 84, "manual"],
  ["BW-2026-020", "Sunil Yadav", "Chinhat", "Zone 4 · Gomti Nagar", 26.884, 81.046, "2026-08-19", 200, 46, "excel"],
  ["BW-2026-019", "Pradeep Mishra", "Aminabad", "Zone 1 · Old City", 26.846, 80.927, "2026-08-08", 340, 124, "manual"],
  ["BW-2026-018", "Farah Naqvi", "Hazratganj", "Zone 1 · Old City", 26.851, 80.946, "2026-07-30", 310, 112, "excel"],
  ["BW-2026-017", "Deepak Verma", "Sector 6, Vikas Nagar", "Zone 3 · Trans-Gomti", 26.893, 80.964, "2026-07-21", 260, 86, "excel"],
  ["BW-2026-016", "Seema Pandey", "Sector C, Jankipuram", "Zone 7 · North", 26.927, 80.937, "2026-07-09", 240, 72, "manual"],
  ["BW-2026-015", "Arvind Kumar", "Rajajipuram", "Zone 6 · West", 26.843, 80.887, "2026-06-28", 300, 98, "excel"],
  ["BW-2026-014", "Kiran Bajpai", "Alambagh", "Zone 5 · South", 26.813, 80.903, "2026-06-17", 300, 102, "manual"],
  ["BW-2026-013", "Rahul Saxena", "Sector G, Ashiyana", "Zone 5 · South", 26.79, 80.923, "2026-06-05", 260, 82, "excel"],
  ["BW-2026-012", "Meera Dixit", "Gomti Nagar Extension", "Zone 4 · Gomti Nagar", 26.803, 81.024, "2026-05-26", 230, 58, "manual"],
  ["BW-2026-011", "Imran Siddiqui", "Dubagga", "Zone 6 · West", 26.869, 80.853, "2026-05-14", 210, 52, "excel"],
  ["BW-2026-010", "Vandana Shukla", "Sushant Golf City", "Zone 8 · South-East", 26.773, 80.987, "2026-05-02", 240, 54, "manual"],
  ["BW-2026-009", "Ashok Rastogi", "Mahanagar", "Zone 3 · Trans-Gomti", 26.878, 80.959, "2026-04-20", 270, 88, "excel"],
  ["BW-2026-008", "Pooja Chaurasia", "Telibagh", "Zone 8 · South-East", 26.772, 80.946, "2026-04-08", 250, 70, "manual"],
  ["BW-2026-007", "Sanjay Gupta", "Charbagh", "Zone 1 · Old City", 26.832, 80.922, "2026-03-27", 300, 108, "excel"],
  ["BW-2026-006", "Ritu Agarwal", "Kalyanpur", "Zone 3 · Trans-Gomti", 26.901, 80.98, "2026-03-13", 250, 76, "manual"],
  ["BW-2026-005", "Manoj Tiwari", "Transport Nagar", "Zone 5 · South", 26.781, 80.898, "2026-02-28", 260, 74, "excel"],
  ["BW-2026-004", "Shabnam Ali", "Madiyaon, Sitapur Road", "Zone 7 · North", 26.933, 80.923, "2026-02-14", 220, 60, "excel"],
  ["BW-2026-003", "Lalit Mohan", "Kursi Road", "Zone 7 · North", null, null, "2026-01-30", 230, 66, "excel"],
  ["BW-2026-002", "Geeta Rawat", "Sarojini Nagar", "Zone 5 · South", 26.753, 80.874, "2026-01-16", 240, 62, "manual"],
  ["BW-2026-001", "Vinod Katiyar", "Patrakarpuram, Gomti Nagar", "Zone 4 · Gomti Nagar", 26.854, 80.987, "2026-01-05", 250, 68, "excel"],
];

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const byId = (id: string) => DEFAULT_MATERIALS.find((m) => m.id === id)!;

/** Alternating clay and sand units that dip gently south-west, so neighbouring logs correlate. */
function strataFor(id: string, depth: number, lat: number | null, lon: number | null, seed: number): StrataLayer[] {
  const r = rng(seed * 97 + 11);
  const tilt = -90 * ((lon ?? 80.95) - 80.95) + 60 * ((lat ?? 26.85) - 26.85);
  const bases = [40, 74, 96, 140, 164, 210, 236, 262].map((v, i) => Math.round(v + tilt * (0.6 + i * 0.15) + (r() - 0.5) * 8));
  const sands = [["fine_sand", "yellow_sand"], ["yellow_sand", "medium_sand"], ["coarse_sand", "medium_sand"], ["medium_sand", "gravel"]];
  const clays = ["clay", "silty_clay", "sandy_clay"];
  const out: StrataLayer[] = [];
  let d = 0;
  const push = (end: number, mid: string) => {
    const m = byId(mid);
    out.push({ id: `${id}-${out.length}`, borewellId: id, startDepth: d, endDepth: end, material: m.name, materialId: m.id, color: m.color, pattern: m.pattern, remarks: "", waterBearing: m.lithologyFamily === "SAND" });
    d = end;
  };
  for (let i = 0; i <= bases.length && d < depth; i++) {
    const end = Math.min(depth, i < bases.length ? Math.max(d + 6, bases[i]) : depth);
    if (i === 0) {
      push(Math.max(4, Math.round(end * 0.4)), "clay");
      push(end, r() < 0.3 ? "clay_kankar" : "kankar");
    } else if (i % 2 === 1) {
      const opts = sands[Math.min(3, (i - 1) >> 1)];
      push(end, opts[Math.floor(r() * opts.length)]);
    } else {
      push(end, clays[Math.floor(r() * clays.length)]);
    }
  }
  return out;
}

/** Plain casing to just below the water, then alternating screen and plain pipe. */
export function samplePipes(item: BorewellListItem): PipeSegment[] {
  const { id, totalDepth, waterLevel } = item.borewell;
  const depth = totalDepth ?? 0;
  const r = rng(id.length * 31 + depth);
  const out: PipeSegment[] = [];
  const push = (start: number, end: number, pipeType: "plain" | "slotted") =>
    out.push({ id: `${id}-p${out.length}`, borewellId: id, startDepth: start, endDepth: end, pipeType, pipeSubtype: pipeType === "plain" ? "PLAIN" : "RIBBED_SCREEN", diameter: item.borewell.pipeDia });
  let d = Math.min(depth - 20, Math.round((waterLevel ?? 60) + 5 + r() * 10));
  push(0, d, "plain");
  while (d < depth - 15) {
    const s = Math.min(depth - 10, d + Math.round(25 + r() * 25));
    push(d, s, "slotted");
    d = s;
    if (d >= depth - 15) break;
    const p = Math.min(depth - 10, d + Math.round(15 + r() * 20));
    push(d, p, "plain");
    d = p;
  }
  return out;
}

export const SAMPLE_BOREWELLS: BorewellListItem[] = RAW.map(([code, owner, area, zone, lat, lon, drilled, depth, level, source], i) => {
  // Spread over ten years, with the water a little shallower the further back, like real records.
  const yearsAgo = (i * 7) % 10;
  const date = `${2026 - yearsAgo}${drilled.slice(4)}`, water = Math.round(level - yearsAgo * 3.5);
  const id = `sample-${code}`;
  const borewell: Borewell = {
    id, projectId: zone, project: zone, borewellId: code, ownerName: owner, houseNo: "", area, city: "Lucknow", address: "",
    latitude: lat, longitude: lon, locationSource: lat == null ? "unknown" : source === "excel" ? "imported" : "gps",
    locationAccuracyM: null, groundElevationM: null, elevationSource: null, boreDia: depth > 300 ? 10 : 8, pipeDia: depth > 300 ? 6 : 5,
    totalDepth: depth, waterLevel: water, dynamicWaterLevel: null, depthUnit: "ft", drillingMethod: depth > 290 ? "DTH" : "ROTARY",
    recordQuality: "good", remarks: "", date, createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`,
    importBatchId: null, importSource: source === "excel" ? "field-logs.xlsx" : null, importMethod: source, deletedAt: null, waterLevelOn: date,
    pumpType: "", pumpMake: "", pumpModel: "", pumpHp: null, pumpLowering: null,
  };
  return { borewell, strata: strataFor(id, depth, lat, lon, i + 3) };
});
