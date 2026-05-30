# StrataField V1 — Project Task List

This task list tracks the progress of the StrataField offline borewell logging and strata designer desktop application.

---

## 📊 Summary of Progress

| Phase | Milestone / Feature | Status | Details |
| :--- | :--- | :--- | :--- |
| **Step 1** | **Application Foundation (Phase 1 + 11)** | **✅ Completed** | Electron window boots React + Tailwind UI with router pages, status indicators, and side-by-side design canvases. |
| **Step 2** | **Database Foundation (Phase 2)** | **✅ Completed** | SQLite schemas, CRUD repositories, Context bridge, and IPC handlers. |
| **Step 3** | **New Borewell Screen (Phase 3)** | **✅ Completed** | Form layouts, geocoding coordinates, and photo EXIF readings. |
| **Step 4** | **Search Records (Phase 7)** | **✅ Completed** | Search query matching, city/date filters, and collapsible detail cards. |
| **Step 5** | **Strata + Pipe Editors (Phase 5 + 6)** | **✅ Completed** | Material select lists, reorderable visual layers, and pipe lowering configuration. |
| **Step 6** | **Borewell Detail Page (Phase 9)** | **✅ Completed** | Complete metadata fields layout, map indicators, and side-by-side visualizers. |
| **Step 7** | **Map View (Phase 8)** | **✅ Completed** | Leaflet maps showing markers for geocoded records. |
| **Step 8** | **Excel Import Wizard (Phase 4)** | **✅ Completed** | Import files, parse worksheets, and verify rows before inserting to SQLite. |
| **Step 9** | **Export System (Phase 10)** | **✅ Completed** | Export single/bundled records to PDF report files and Excel sheets. |
| **Step 10** | **V1 Polish (Phase 12)** | **✅ Completed** | Database backup automation, loading states, and keyboard hotkeys. |

---

## 📝 Detailed Checklists

### 🟩 Step 1: Application Foundation (Phase 1 + 11) — **Completed**
- [x] Scaffold Electron + React + TypeScript + Vite project
- [x] Configure Tailwind CSS with dark/light design system tokens
- [x] Create shared type definitions (`types.ts`) and constants (`constants.ts`)
- [x] Integrate global styling system (`index.css`) with custom scrollbars and UI components
- [x] Mount React renderer entry point (`renderer.tsx`) inside the index.html template
- [x] Build application layout shell (`Sidebar.tsx`, `Topbar.tsx`, `StatusBar.tsx`, `ToastContainer.tsx`)
- [x] Implement path resolving alias `@/*` mapping to `./src/*`
- [x] Create beautiful functional routes & pages (`DashboardPage`, `NewBorewellPage`, `SearchPage`, `MapPage`, `ImportPage`, `ExportPage`, `SettingsPage`, `BorewellDetailPage`, `StrataEditorPage`)
- [x] Verify compilation succeeds with zero TypeScript and ESLint resolution errors
- [x] Boot up Electron app successfully and verify page transitions

### 🟩 Step 2: Database Foundation (Phase 2) — **Completed**
- [x] Connect SQLite using `sql.js` WebAssembly package (replaces native better-sqlite3 to run compiler-free)
- [x] Create schemas (`borewells`, `strata_layers`, `pipe_assemblies`, `photos`, `files`)
- [x] Create CRUD repositories for all schemas
- [x] Write Electron IPC handlers linking frontend calls to SQLite repositories
- [x] Connect Zustand store actions (`fetch`, `create`, `update`, `delete`) to the IPC context bridge

### 🟩 Step 3: New Borewell Screen (Phase 3) — **Completed**
- [x] Bind multi-section input form sections to save state
- [x] Integrate OSM Nominatim geocoding inside the Electron main process
- [x] Add photo attachment handler with EXIF timestamp and coordinate metadata extraction
- [x] Add form validation and navigate to dashboard on save

### 🟩 Step 4: Search Records (Phase 7) — **Completed**
- [x] Enable text matching across owner names, record IDs, and cities
- [x] Connect city filters and date range selections
- [x] Implement collapsible result lists with quick links to design canvas and detail panels

### 🟩 Step 5: Strata + Pipe Editors (Phase 5 + 6) — **Completed**
- [x] Implement visual strata designer columns allowing click selections
- [x] Add drag-and-drop material mapping from library lists
- [x] Build property editors to modify layer depths, comments, and hex colors
- [x] Add visual pipe lowering column rendering plain casing and slotted screen sections
- [x] Build pipe segment editors for thickness and depth details

### 🟩 Step 6: Borewell Detail Page (Phase 9) — **Completed**
- [x] Implement full detailed readouts showing technical specs
- [x] Embed maps highlighting the location coordinates
- [x] Render full-scale side-by-side strata and pipe lowering assemblies
- [x] Connect photo lists and references files

### 🟩 Step 7: Map View (Phase 8) — **Completed**
- [x] Build full-screen interactive Leaflet maps
- [x] Setup custom engineering navigation pins for logged coordinate records
- [x] Enable marker selection overlays showing metadata cards and links

### 🟩 Step 8: Excel Import Wizard (Phase 4) — **Completed**
- [x] Integrate `xlsx` sheet parsing in main process service
- [x] Build dynamic column mapping dropdown controls
- [x] Enable table data previews and cell values corrections before importing to database

### 🟩 Step 9: Export System (Phase 10) — **Completed**
- [x] Write PDF compiler service generating design reports with pdf-lib
- [x] Write Excel table export sheets compiling geological strata tables
- [x] Build single record and bundle compile export queues

### 🟩 Step 10: V1 Polish (Phase 12) — **Completed**
- [x] Build SQLite database backup scheduler service on exit
- [x] Add debounced form auto-saves
- [x] Add common engineering keyboard shortcuts
- [x] Connect loading skeletons and notifications alerts
