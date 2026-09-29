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

  geology: {
    plainPipe: "Plain pipe",
    screenPipe: "Screen pipe (water enters)",
    waterLevel: "Water level",
    notRecorded: "Not recorded",
    families: { CLAY: "Clay types", SAND: "Sand types", ROCK: "Rock", OTHER: "Other", NONE: "Not recorded" },
  },
} as const;

export type Text = typeof en;
