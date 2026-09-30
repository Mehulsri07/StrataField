/**
 * All interface wording, in plain English for people who are not technical.
 *
 * Rules (see Project Context v2, section 3):
 * - Say "water level", not "SWL"; "estimate", not "interpolated"; "typical", not "median".
 * - Drilling words users already say stay: plain pipe, screen pipe, kankar, rotary, DTH.
 * - Buttons say exactly what happens ("Save borewell"), and the message after says it happened ("Borewell saved").
 * - Problems say what is wrong and how to fix it, without apologising.
 *
 * To add another language, copy this file's shape into a new file (e.g. hi.ts) and switch `text` in ./index.ts.
 */
export const en = {
  app: {
    name: "StrataField",
    tagline: "Borewell logging",
    city: "Lucknow",
  },

  nav: {
    groups: { records: "Records", data: "Data", app: "App" },
    home: "Home",
    borewells: "Borewells",
    map: "Map",
    section: "Cross-section",
    newBorewell: "New borewell",
    import: "Import Excel",
    export: "Export",
    recycleBin: "Recycle bin",
    settings: "Settings & backup",
  },

  topbar: {
    jumpTo: "Find a borewell…",
    jumpShortcut: "Ctrl K",
    themeToLight: "Switch to light colours",
    themeToDark: "Switch to dark colours",
  },

  status: {
    saved: "Saved",
    savedOnComputer: "Saved on this computer",
    borewells: (n: number) => `${n} borewell${n === 1 ? "" : "s"}`,
    located: (n: number) => `${n} with a location`,
    lastBackup: (when: string) => `Last backup ${when}`,
    noBackupYet: "No backup yet",
    units: "Depths in feet",
    version: (v: string) => `Version ${v}`,
    preview: "Preview with sample data",
    notConnected: "Your data could not be opened",
  },

  updates: {
    available: (v: string) => `StrataField ${v} is available`,
    howItWorks: "Installing takes a minute: StrataField closes, updates and opens again. Your data is not touched.",
    downloading: "Downloading the update…",
    downloadingPct: (pct: number) => `Downloading the update… ${pct}%`,
    install: "Install and restart",
    later: "Not now",
    upToDate: (v: string) => `You have the newest version (${v}).`,
    check: "Check for updates",
    checking: "Checking…",
    offline: "Could not check for updates. Check the internet connection and try again.",
  },

  startup: {
    broughtOverTitle: "Your data from the older StrataField is here",
    broughtOver: (b: number, layers: number, pipes: number) =>
      `${b} borewell${b === 1 ? "" : "s"}, ${layers} soil layers and ${pipes} pipe pieces were brought over. Your old file was not changed.`,
    leftBehind: (layers: number, pipes: number) =>
      `${layers} soil layers and ${pipes} pipe pieces belonged to borewells that had already been deleted, so they were not brought over.`,
    unmatched: (names: string[]) => `These soil names need a soil type chosen: ${names.join(", ")}.`,
    broughtOverFailed: "Your data from the older StrataField could not be brought over.",
    cannotOpenTitle: "StrataField could not open your data",
  },

  actions: {
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    edit: "Edit",
    delete: "Delete",
    restore: "Restore",
    back: "Back",
    tryAgain: "Try again",
    moreOptions: "More options",
    openBorewell: "Open borewell",
  },

  pages: {
    home: { title: "Home", sub: (city: string) => `Borewells in ${city} at a glance.` },
    borewells: { title: "Borewells", sub: "All your borewells. Click a row to open it." },
    map: { title: "Map", sub: "Where your borewells are, and how deep the water is." },
    section: { title: "Cross-section", sub: "See the soil layers underground along a line you draw." },
    newBorewell: { title: "New borewell", sub: "Enter a borewell's details step by step." },
    import: { title: "Import Excel", sub: "Add borewells from an Excel drilling log." },
    export: { title: "Export", sub: "Make PDF reports and Excel files." },
    recycleBin: { title: "Recycle bin", sub: "Deleted borewells. Restore them or delete them for good." },
    settings: { title: "Settings & backup", sub: "Backups, soil types and how StrataField looks." },
    detail: { title: "Borewell" },
    editLayers: { title: "Edit layers & pipes" },
    notFound: { title: "Page not found", sub: "This page does not exist. Use the menu on the left." },
  },

  placeholder: {
    comingSoon: "This screen is being built.",
    body: "The layout, colours and menu are ready. The screen itself arrives in the next stage.",
  },

  layer: {
    measured: "Measured at the borewell",
    estimate: "Estimate",
    roughEstimate: "Rough estimate",
    notRecorded: "Not recorded",
    position: (n: number, of: number) => `Layer ${n} of ${of}`,
    fromBorewell: (id: string, area: string) => (area ? `Borewell ${id}, ${area}` : `Borewell ${id}`),
    depth: "Depth",
    depthValue: (from: number, to: number) => `${from} to ${to} ft`,
    metres: (from: number, to: number) => `${from} to ${to} m`,
    thickness: "Thickness",
    feet: (n: number) => `${n} ft`,
    metresShort: (n: number) => `${n} m`,
    soilGroup: "Soil group",
    groups: { CLAY: "Clay type", SAND: "Sand type", ROCK: "Rock", OTHER: "Other", NONE: "Not recorded" } as Record<string, string>,
    water: "Water level",
    waterBelow: (wl: number) => `This layer is below the water level (water at ${wl} ft).`,
    waterAbove: (wl: number) => `This layer is above the water level (water at ${wl} ft).`,
    waterInside: (wl: number) => `The water level (${wl} ft) is inside this layer.`,
    waterUnknown: "No water level recorded for this borewell.",
    holdsWater: "Holds water",
    holdsWaterYes: "Yes, marked as water-bearing",
    holdsWaterNo: "Not marked",
    pipeHere: "Pipe at this depth",
    noPipe: "No pipe recorded at this depth.",
    plainPipeRange: (from: number, to: number) => `Plain pipe, ${from} to ${to} ft`,
    screenPipeRange: (from: number, to: number) => `Screen pipe (water enters), ${from} to ${to} ft`,
    notes: "Notes",
    notRecordedBody: "No soil was recorded for this depth. It stays marked as unknown and is never filled in by estimates.",
    whereInBorewell: "Where it is in the borewell",
    openBorewell: "Open borewell",
    editLayers: "Edit layers",
    // Estimated layers between borewells (cross-section)
    estimateTitle: (group: string) => `${group} (estimate)`,
    estimateBody: (a: string, b: string) =>
      `Recorded at ${a} and at ${b}. Between them StrataField draws a straight line, so the real layer may be deeper, shallower or broken.`,
    roughBody: "These borewells are far apart, so this shape is a rough guess.",
    pinchBody: (a: string, b: string) =>
      `Recorded at ${a} but not at ${b}. It is drawn thinning out halfway, because nobody knows where it actually ends.`,
    atBorewell: (area: string) => `At ${area}`,
    notFoundHere: "Not found",
    distanceApart: "Distance between the borewells",
    km: (n: number) => `${n.toFixed(1)} km`,
    basedOn: "Based on",
  },

  geology: {
    plainPipe: "Plain pipe",
    screenPipe: "Screen pipe (water enters)",
    waterLevel: "Water level",
    notRecorded: "Not recorded",
    families: { CLAY: "Clay types", SAND: "Sand types", ROCK: "Rock", OTHER: "Other", NONE: "Not recorded" },
  },
} as const;

export type Text = typeof en;
