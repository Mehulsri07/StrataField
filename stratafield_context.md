# StrataField & StrataVision — Development Context

## Project Overview

**StrataField** is an Electron/React/TypeScript desktop app for borewell data
management. Currently functional primarily as an Excel import and display tool.
Built around the borewell drilling business of Mehul's father in Lucknow, UP.

**StrataVision** is the planned companion app for 3D lithological visualization
and cross-section rendering, consuming data stored by StrataField.

**The pipeline:** StrataField (logging + import) → SQLite database →
StrataVision (visualization + analysis)

---

## Current State of StrataField

- Electron + React + TypeScript + SQLite (better-sqlite3)
- Excel import wizard with manual column mapping (4-step: upload → map →
  preview → save)
- PDF export of geological log reports (pdf-lib)
- Soft-delete pattern (`deletedAt`) on all records
- IPC handler architecture for main/renderer separation
- Materials dictionary table exists but not enforced as FK

### What it is NOT yet
- A field logging tool — no manual entry form for operators
- The Excel parser currently requires user to specify column indices manually
- No dropdown-enforced material vocabulary

---

## Architecture Decision: Two Apps, One Pipeline

StrataField and StrataVision are separate applications sharing the same SQLite
database schema and data contract.

**StrataField responsibilities:**
- Excel import (historical records)
- Manual field entry form (Phase 2 — not yet built)
- Data validation and anomaly flagging
- PDF export

**StrataVision responsibilities:**
- Individual borewell stratigraphic column rendering
- 2D cross-sections along user-drawn transects
- Map view with borewells colored by depth-to-water / aquifer thickness
- (Future v2) 3D interpolated subsurface surfaces

---

## Schema Issues Found and Fixes Required

### Critical Fix 1 — material is free-text, not a FK

```sql
-- Current (wrong)
material TEXT NOT NULL  -- in strata_layers

-- Fix
ALTER TABLE strata_layers ADD COLUMN material_id TEXT
  REFERENCES materials(id);

UPDATE strata_layers
SET material_id = (
  SELECT id FROM materials
  WHERE LOWER(name) = LOWER(strata_layers.material)
  LIMIT 1
);
```

Going forward: material_id is mandatory. The UI must show a dropdown from the
materials table, never a free-text field for primary classification.

### Critical Fix 2 — Add lithology_class and lithology_family to materials

```sql
ALTER TABLE materials ADD COLUMN lithology_class TEXT
  CHECK(lithology_class IN (
    'CLAY','SILTY_CLAY','SANDY_CLAY','SILT','KANKAR',
    'FINE_SAND','MEDIUM_SAND','COARSE_SAND','GRAVEL','SANDY_GRAVEL',
    'FILL','ROCK','OTHER'
  ));

ALTER TABLE materials ADD COLUMN lithology_family TEXT
  CHECK(lithology_family IN ('CLAY','SAND','OTHER'));
```

### Fix 3 — Add pipe_subtype to pipe_assemblies

```sql
ALTER TABLE pipe_assemblies ADD COLUMN pipe_subtype TEXT
  CHECK(pipe_subtype IN ('PLAIN','RIBBED_SCREEN','SLOTTED','MS_SLOTTED'));
```

Ribbed Screen and Slotted Pipe are physically different products but both map
to `'slotted'` for functional purposes. Preserve the original distinction here.

### Fix 4 — Add drilling_method to borewells

```sql
ALTER TABLE borewells ADD COLUMN drilling_method TEXT
  CHECK(drilling_method IN ('ROTARY','DTH','MANUAL','UNKNOWN'));
```

Required for the eventual P4 research paper — reviewers will ask about this.
DTH vs rotary affects lithological log reliability.

### Note: water_strike — deliberately omitted
The dataset does not contain water strike data. `Sand (Y)` in the Excel files
means Yellow Sand, not yielding sand. Do not add water_strike to the schema
until field-recorded yield data is available.

---

## Lithology Taxonomy (Final)

Two families: CLAY and SAND. This maps accurately to Lucknow's alluvial
geology (Indo-Gangetic plain — almost exclusively alternating clay/sand with
kankar bands).

```typescript
export type LithologyFamily = 'CLAY' | 'SAND' | 'OTHER';

export type LithologyClass =
  // CLAY family
  | 'CLAY'
  | 'SILTY_CLAY'
  | 'SANDY_CLAY'
  | 'SILT'
  | 'KANKAR'         // "Kanker clay" / "Kankar" — calcium carbonate nodules
  // SAND family
  | 'FINE_SAND'      // "Sand (Fine)"
  | 'MEDIUM_SAND'    // "Sand" (default)
  | 'COARSE_SAND'
  | 'YELLOW_SAND'    // "Sand (Y)" — oxidized, paleochannel indicator
  | 'GRAVEL'
  | 'SANDY_GRAVEL'
  // OTHER
  | 'FILL'
  | 'ROCK'
  | 'OTHER';

export const LITHOLOGY_FAMILY: Record<LithologyClass, LithologyFamily> = {
  CLAY: 'CLAY', SILTY_CLAY: 'CLAY', SANDY_CLAY: 'CLAY',
  SILT: 'CLAY', KANKAR: 'CLAY',
  FINE_SAND: 'SAND', MEDIUM_SAND: 'SAND', COARSE_SAND: 'SAND',
  YELLOW_SAND: 'SAND', GRAVEL: 'SAND', SANDY_GRAVEL: 'SAND',
  FILL: 'OTHER', ROCK: 'OTHER', OTHER: 'OTHER',
};
```

### Default Materials Seed Data

```typescript
const DEFAULT_MATERIALS = [
  // CLAY family — brown/earth spectrum
  { name: 'Clay',        color: '#8B6914', pattern: 'horizontal_lines',
    class: 'CLAY',        family: 'CLAY' },
  { name: 'Silty Clay',  color: '#A0785A', pattern: 'dashed_lines',
    class: 'SILTY_CLAY',  family: 'CLAY' },
  { name: 'Sandy Clay',  color: '#B8956A', pattern: 'dots',
    class: 'SANDY_CLAY',  family: 'CLAY' },
  { name: 'Silt',        color: '#C4A882', pattern: 'wavy',
    class: 'SILT',        family: 'CLAY' },
  { name: 'Kankar',      color: '#D4C5A0', pattern: 'circles',
    class: 'KANKAR',      family: 'CLAY' },
  // SAND family — yellow/amber spectrum
  { name: 'Fine Sand',   color: '#E8D5A3', pattern: 'stipple',
    class: 'FINE_SAND',   family: 'SAND' },
  { name: 'Sand',        color: '#D4B862', pattern: 'stipple_dense',
    class: 'MEDIUM_SAND', family: 'SAND' },
  { name: 'Coarse Sand', color: '#C49A3C', pattern: 'cross_hatch',
    class: 'COARSE_SAND', family: 'SAND' },
  { name: 'Yellow Sand', color: '#E8C84A', pattern: 'stipple',
    class: 'YELLOW_SAND', family: 'SAND' },
  { name: 'Gravel',      color: '#A67C2E', pattern: 'circles_large',
    class: 'GRAVEL',      family: 'SAND' },
];
```

---

## Material Normalisation Map (Complete)

Derived from analysis of 6 real Excel files from the field dataset.
This is the complete vocabulary — no new terms are expected.

```typescript
const MATERIAL_MAP: Record<string, string> = {
  'clay':          'Clay',
  'sand':          'Sand',
  'sand (fine)':   'Fine Sand',
  'sand ( fine)':  'Fine Sand',
  'sand(fine)':    'Fine Sand',
  'fine sand':     'Fine Sand',
  'sand (y)':      'Yellow Sand',   // Y = Yellow, NOT Yielding
  'sand ( y )':    'Yellow Sand',
  'sand(y)':       'Yellow Sand',
  'yellow sand':   'Yellow Sand',
  'kanker clay':   'Kankar',
  'kankar clay':   'Kankar',
  'kanker':        'Kankar',
  'kankar':        'Kankar',
  'kanker soil':   'Kankar',
  'kankar soil':   'Kankar',
};
```

**Important:** `Sand (Y)` = Yellow Sand (oxidized, paleochannel indicator).
NOT a water yield marker. This was verified from the field.

---

## Excel Format Analysis (6 Files)

### Standard Format (5/6 files)
Files: IPL_Dewa_Road_6, Raju_Mohan_Nyotani, Sterling_Apartment,
       Raju_Mohan_Kasba, Raju_Streta_Chart

Column layout (0-indexed):
- Col 0: Site info / metadata labels
- Col 1: Depth (end of each interval)
- Col 2: Empty spacer
- Col 3: Material (clay/sand/etc.)
- Col 4: Pipe type (Plain pipe / Ribbed Screen)
- Col 5: Empty
- Col 6: Assembly depth

Depth intervals: 10 ft (most files) or 3 m (some files)
Header marker: "Streta Chart / Lowering Assambly" row
Data start: row after "G.L." row

### Non-Standard Format (1/6 files)
File: Pintals.xlsx
- Sheet 1: pipe assembly only, no strata chart
- Sheet 2: pipe lengths embedded in cell text ("6 Mtr Plain Pipe")
- 3-metre intervals
- Requires manual mapping — flag and skip in auto-parser

### Multi-borewell Sheets
Files: Raju_Mohan_Nyotani, Raju_Mohan_Kasba
- Two borewells per sheet
- Second borewell starts with a repeated "Streta Chart" header
- Auto-parser handles first borewell only
- Flags MULTI_BOREWELL_SHEET warning for re-import

### Unit Inconsistency Across Dataset
- Feet-based (10 ft intervals): IPL Dewa Road, Sterling, first borewell in
  Nyotani and Kasba
- Metre-based (3 m intervals): Raju_Streta_Chart (NIPER), Pintals, second
  borewells in Nyotani and Kasba
- Unit detected from metadata text and confirmed from interval sizes
- All depths stored internally in feet

### Pipe Type Vocabulary
| Excel string     | Schema value |
|-----------------|--------------|
| Plain pipe       | plain        |
| Ribbed Screen    | slotted      |
| Slotted Pipe     | slotted      |

Ribbed Screen = Slotted Pipe (same product, different names by template).
Both map to `'slotted'`. Original string preserved in `pipe_subtype`.

---

## Smart Parser — strataFieldParser.ts

Written as a self-contained module. Key design decisions:

### Anomaly System

```typescript
export type AnomalyCode =
  | 'MULTI_BOREWELL_SHEET'   // warning — only first parsed
  | 'UNIT_AMBIGUOUS'         // warning — inferred from intervals
  | 'UNIT_MIXED'             // warning — metadata vs intervals disagree
  | 'MATERIAL_UNKNOWN'       // warning — kept as-is, needs mapping
  | 'DEPTH_NON_MONOTONIC'    // warning — row skipped
  | 'DEPTH_GAP'              // warning — gap > expected step
  | 'DEPTH_OVERLAP'          // warning — layer end > next start
  | 'WATER_LEVEL_MISSING'    // warning — enter manually
  | 'DATE_MISSING'           // warning — enter manually
  | 'SITE_NAME_MISSING'      // warning — enter manually
  | 'NO_STRATA_FOUND'        // critical — triggers manual review
  | 'NON_STANDARD_FORMAT'    // critical — triggers manual review
  | 'PIPE_TYPE_UNKNOWN';     // warning — defaulted to plain
```

### Parse Result Shape

```typescript
export interface ExcelParseResult {
  success: boolean;
  metadata: ParsedBoreholeMetadata;   // all depths in feet
  strata: ParsedStrataLayer[];        // all depths in feet
  anomalies: ParseAnomaly[];
  requiresManualReview: boolean;      // true if any CRITICAL anomaly
}
```

### Integration with Existing Wizard

The existing 4-step manual mapping wizard is preserved as a fallback.
Flow:
1. File uploaded → auto-parser runs first
2. If `success === true` and no critical anomalies → skip to preview step
3. If `requiresManualReview === true` → drop into existing mapping wizard
4. Warnings always displayed in the preview step regardless

### What the Parser Handles
- Standard format auto-detection (no user column mapping needed)
- Multi-borewell sheets (parses first, flags rest)
- Unit detection (ft vs m) from metadata + interval inference
- Conversion of all depths to feet before storage
- Material normalisation against the complete vocabulary map
- Pipe type detection including ribbed/slotted synonyms
- Non-standard format detection (Pintals-style) with critical flag

---

## StrataVision — Planned Architecture

### Scope for v1 (achievable, no Python backend needed)
1. **Borewell map view** — all borewells on Leaflet map, colored by:
   - Depth to first SAND-family layer (proxy for drilling cost)
   - Total sand thickness (proxy for aquifer storage)
   - Total depth
2. **Stratigraphic column** — single borewell, vertical depth profile
   with lithology colors/patterns
3. **2D Cross-section** — user draws a transect line on the map,
   app selects nearest borewells along it, renders side-by-side columns
   with correlation lines

### Scope for v2 (requires Python backend)
- 3D interpolated aquifer surfaces (kriging/natural neighbor via scipy/pykrige)
- Pass computed geometry to Three.js for rendering
- Confining layer (kankar band) spatial extent mapping

### Key Analytical Queries for StrataVision

```sql
-- Depth to first aquifer layer per borewell
SELECT
  b.id, b.latitude, b.longitude,
  MIN(sl.start_depth) as depth_to_aquifer
FROM borewells b
JOIN strata_layers sl ON sl.borewell_id = b.id
JOIN materials m ON m.id = sl.material_id
WHERE m.lithology_family = 'SAND'
GROUP BY b.id;

-- Cumulative sand thickness per borewell
SELECT
  b.id,
  SUM(sl.end_depth - sl.start_depth) as total_sand_thickness
FROM borewells b
JOIN strata_layers sl ON sl.borewell_id = b.id
JOIN materials m ON m.id = sl.material_id
WHERE m.lithology_family = 'SAND'
GROUP BY b.id;
```

### Three.js Constraints
- THREE.OrbitControls unavailable in r128
- Do NOT use THREE.CapsuleGeometry (r142+)
- Use CylinderGeometry, SphereGeometry, or custom BufferGeometry

---

## Development Sequencing

### Phase 1 — StrataField (Current)
- [x] Excel import wizard (manual mapping)
- [x] PDF export
- [x] SQLite storage
- [ ] Smart auto-parser (strataFieldParser.ts written, needs integration)
- [ ] Schema migrations (material_id FK, lithology_class, pipe_subtype)
- [ ] Default materials seed with taxonomy

### Phase 2 — StrataField Field Logging
- [ ] Manual entry form with materials dropdown (enforced vocabulary)
- [ ] Unit selector (ft/m) at borewell level
- [ ] Data quality cleanup screen (map historical free-text to canonical classes)

### Phase 3 — StrataVision v1
- [ ] Leaflet map with borewell markers
- [ ] Color-by analytical layer (depth_to_aquifer, sand_thickness)
- [ ] Stratigraphic column renderer
- [ ] 2D cross-section along transect

### Phase 4 — P4 Research Paper
- After StrataField has digitized sufficient records
- After StrataVision can produce publication-quality cross-sections
- Lucknow aquifer characterization from field borewell records
- Target journals: Groundwater for Sustainable Development,
  Journal of Hydrology: Regional Studies

---

## Dataset Summary

- ~650 borewells total (2012–present)
- ~50 borewells/year from a single machine
- Spatial coverage: Lucknow city + outer areas
- Format: 95% paper records, ~5% Excel
- Excel records: majority from 2021 onwards
- Depths: 150–400 ft (varies by zone)
- Lithological entries: every 10 ft (feet files) or every 3 m (metre files)
- No water yield data in current records
- Area-level static water level data available (validation use only)

### Geological Context — Lucknow
- Indo-Gangetic alluvial plain — flat, homogeneous at surface
- Subsurface: alternating clay/sand sequences
- Kankar (calcium carbonate) bands are common confining layers
- Yellow sand = oxidized paleochannel deposits (shallower, coarser)
- Water table: ~15 ft in Indira Nagar area (very shallow)
- Typical drilling depth: 150–400 ft depending on target aquifer
