// End-to-end test of the StrataField app, following the V1 definition of done.
//
// Build first, with the test's stand-ins for file dialogs switched on (PowerShell):
//   $env:VITE_E2E = "1"; npm run tauri -w app -- build --debug --no-bundle
//
//   npm run e2e                     uses target/debug/stratafield.exe
//   STRATA_EXE=... npm run e2e      another build (e.g. target/release/stratafield.exe)
//   E2E_REAL_DIALOGS=1 npm run e2e  also saves PDF and Excel through the real Windows Save dialog
//   E2E_OFFLINE_MAP=0 npm run e2e   skips downloading the Lucknow map (needs internet)
//                                   (CI does this; locally the window must not be in use)
//
// Opens an app window. Everything runs on a scratch data folder with made-up data.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  answerSaveDialog, cancelSaveDialog, check, connect, disconnect, newFileIn, page, results, sleep, startApp, workFolder,
} from "./harness.mjs";
import { buildFixtures, LEGACY } from "./fixtures.mjs";

const work = workFolder();
const f = buildFixtures(work);
fs.mkdirSync(f.saved, { recursive: true });
const realDialogs = process.env.E2E_REAL_DIALOGS === "1";
const app = startApp(f);

/** When a save does not arrive: the app's messages, and any recent PDF/Excel files in the usual folders. */
async function exportDiagnostics() {
  const toasts = await page(`return [...document.querySelectorAll('[data-sonner-toast]')].map(t => t.innerText).join(' | ')`).catch(() => "?");
  const recent = [];
  for (const dir of [path.join(os.homedir(), "Documents"), path.join(os.homedir(), "Downloads"), path.join(os.homedir(), "Desktop"), f.saved]) {
    try {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (/[.](pdf|xlsx)$/i.test(name) && Date.now() - fs.statSync(full).mtimeMs < 10 * 60 * 1000) recent.push(full);
      }
    } catch { /* folder missing */ }
  }
  return `Export diagnostics. Messages: ${toasts || "none"}. Recent files: ${recent.join(", ") || "none"}`;
}

try {
  await connect({ app, dataDir: f.dataDir });

  // ── Start-up and the older app's data ──────────────────────────────────
  const notice = await page(`return (await __t.until(() => document.querySelector('[role="status"]'), 15000))?.innerText`);
  // Both old borewells come over; the one that was in the old Recycle bin stays in the Recycle bin.
  check("A one-time notice says the older app's data was brought over", /brought over/.test(notice) && notice.includes(`${1 + LEGACY.inRecycleBin} borewells,`), notice.replace(/\n/g, " | "));
  check("The notice reports rows left behind by long-deleted borewells",
    notice.includes(`${LEGACY.orphanLayers} soil layers and ${LEGACY.orphanPipes} pipe pieces belonged`));
  const status = await page(`return await __t.invoke('startup_status')`);
  check("The database is in the scratch folder, not the real AppData", path.resolve(status.dataFolder) === path.resolve(f.dataDir), status.dataFolder);

  const legacy = await page(`
    const list = await __t.invoke('borewells_search', { filters: {} });
    const bin = await __t.invoke('borewells_search', { filters: { showDeleted: true } });
    const r = await __t.invoke('borewell_get', { id: list[0].borewell.id });
    return { borewells: list.length, bin: bin.length, id: r.borewell.id, code: r.borewell.borewellId, layers: r.strata.length, pipes: r.pipes.length, water: r.borewell.waterLevel };`);
  check("Old database opened without data loss (borewell, layers, pipes, water level, Recycle bin)",
    legacy.code === LEGACY.borewellId && legacy.layers === LEGACY.layers && legacy.pipes === LEGACY.pipes && legacy.water === 116 && legacy.bin === LEGACY.inRecycleBin,
    JSON.stringify(legacy));

  // ── Borewells list, detail, layer popup ────────────────────────────────
  await page(`location.hash = '#/borewells'; await __t.until(() => document.querySelectorAll('main tbody tr').length === 1); return true`);
  const detail = await page(`
    document.querySelector('main tbody tr').click();
    await __t.until(() => [...document.querySelectorAll('[role="tab"]')].length > 0);
    return [...document.querySelectorAll('[role="tab"]')].map(t => t.innerText).join(' / ');`);
  check("The borewell opens from the list with its layers", detail.includes(`Layers & pipes (${LEGACY.layers})`), detail);
  const popup = await page(`
    const layer = await __t.until(() => document.querySelector('svg [role="button"][aria-label$="Show details"]'));
    layer.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const d = await __t.until(() => document.querySelector('[role="dialog"]'));
    const t = d.innerText; __t.btn('Close', d)?.click(); await __t.wait(400); return t;`);
  check("Clicking a layer in the drawing opens its details", popup.includes(`Layer 1 of ${LEGACY.layers}`) && /Depth/.test(popup), popup.split("\n").slice(0, 3).join(" | "));

  // ── Excel import, original kept ────────────────────────────────────────
  const imported = await page(`
    window.__STRATA_TEST_CHOOSE__ = () => ['${f.log}'];
    location.hash = '#/import'; await __t.wait(800);
    __t.btn('Choose Excel files').click();
    const go = await __t.until(() => [...document.querySelectorAll('main button')].find(b => /^Import 1 borewell/.test(b.innerText) && !b.disabled), 15000);
    // The location can be given while importing: the map opens, and pasted coordinates are saved.
    __t.btn('Pick on the map').click();
    await __t.until(() => document.querySelector('[role="dialog"] .leaflet-container'));
    const mapOpened = true; __t.btn('Cancel').click(); await __t.wait(300);
    __t.type(document.querySelector('#i-location'), '26.8712, 80.9455'); __t.type(document.querySelector('#i-zone'), 'Zone Import'); await __t.wait(200);
    go.click();
    await __t.until(() => /See all borewells/.test(__t.text()), 15000);
    delete window.__STRATA_TEST_CHOOSE__;
    const all = await __t.invoke('borewells_search', { filters: {} });
    const ex = all.find(i => i.borewell.importMethod === 'excel');
    const r = await __t.invoke('borewell_get', { id: ex.borewell.id });
    const b = r.borewell;
    return { id: ex.borewell.id, code: b.borewellId, layers: r.strata.length, pipes: r.pipes.map(p => p.startDepth + '-' + p.endDepth + ' ' + p.pipeType).join(', '),
      details: [b.ownerName, b.area, b.city, b.date, b.waterLevel, b.totalDepth, b.boreDia, b.pipeDia].join(' | '),
      pump: [b.pumpMake, b.pumpModel, b.pumpHp, b.pumpLowering].join(' | '), at: [mapOpened, b.latitude, b.longitude, b.locationSource, b.project].join(' | '), files: r.files.map(x => x.kind + ':' + x.originalName) };`);
  check("Excel import joins repeated soil rows into layers and reads both pipe columns", imported.layers === 7 && imported.pipes === "0-100 plain, 100-200 slotted", JSON.stringify(imported));
  check("…and fills in the details written beside the layers", imported.details === "Aliganj Test Site | Sector H, Aliganj | Lucknow | 2026-09-05 | 45 | 200 | 10 | 6" && imported.code === "Aliganj site log", imported.details + " / " + imported.code);
  check("…and the pump written on the log: company, model, power and lowering", imported.pump === "KSB | 3C/20 | 2 | 120", imported.pump);
  check("A location and a zone given while importing are saved with the borewell", imported.at === "true | 26.8712 | 80.9455 | typed | Zone Import", imported.at);
  check("The original Excel file is kept with the imported borewell", imported.files.includes("excel:Aliganj site log.xlsx"), imported.files.join(", "));

  // ── Excel import of a file laid out differently ────────────────────────
  const other = await page(`
    window.__STRATA_TEST_CHOOSE__ = () => ['${f.otherLog}'];
    location.hash = '#/'; await __t.wait(300); location.hash = '#/import'; await __t.wait(800);
    __t.btn('Choose Excel files').click();
    await __t.until(() => /Where the layers are in this file/.test(__t.text()), 15000);
    const status = /Check the columns/.test(__t.text());
    // Wrong column on purpose, then back: the layers disappear and come back.
    const importButton = () => [...document.querySelectorAll('main button')].find(b => /^Import \\d+ borewell/.test(b.innerText));
    const waits = importButton().innerText + (importButton().disabled ? ' (off)' : ' (on)');
    await __t.choose(document.querySelector('#c-to'), 'Column C · Soil type');
    await __t.until(() => /No soil layers were found with these choices/.test(__t.text()), 5000);
    await __t.choose(document.querySelector('#c-to'), 'Column B · To (ft)');
    (await __t.until(() => __t.btn('These columns are right'))).click(); await __t.wait(300);
    const go = await __t.until(() => [...document.querySelectorAll('main button')].find(b => /^Import 1 borewell/.test(b.innerText) && !b.disabled), 15000);
    go.click();
    await __t.until(() => /See all borewells/.test(__t.text()), 15000);
    delete window.__STRATA_TEST_CHOOSE__;
    const all = await __t.invoke('borewells_search', { filters: {} });
    const ex = all.find(i => i.borewell.importSource === 'Chinhat other layout.xlsx');
    const kept = (await __t.invoke('history_recent', { limit: 50 })).find(h => h.summary.startsWith('Notes from reading Chinhat other layout.xlsx'))?.summary ?? '';
    const nextJob = !!__t.btn('Add their locations');
    // What a borewell with details missing looks like in the list, and the filter for them.
    location.hash = '#/borewells?missing=1';
    await __t.until(() => [...document.querySelectorAll('main tbody tr')].some(r => /Chinhat other layout/.test(r.innerText)), 8000);
    const missing = [...document.querySelectorAll('main tbody tr')].map(r => r.innerText.split('\\t').pop().trim());
    // Removed again so the counts later in this run stay as they were.
    if (ex) { await __t.invoke('borewell_delete', { id: ex.borewell.id }); await __t.invoke('borewell_delete_permanently', { id: ex.borewell.id }); }
    return { status, kept, missing, waits, nextJob, layers: ex?.strata.map(l => l.startDepth + '-' + l.endDepth + ' ' + l.material).join(', ') };`);
  check("The notes from the Import screen are kept in the borewell's history", /columns were chosen/.test(other.kept) && /No water level was found/.test(other.kept), other.kept);
  check("Borewells: the Missing details filter lists only borewells with an owner, water level or date missing", other.missing.length >= 1 && other.missing.every(t => /^No /.test(t)), other.missing.join(" | "));
  check("A file with guessed columns waits until the columns are confirmed", other.waits === "Import 0 borewells (off)", other.waits);
  check("After importing, the screen offers to add the missing locations", other.nextJob);
  check("An Excel file in another layout is imported after its columns are chosen", other.status && other.layers === "0-30 Clay, 30-90 Fine Sand, 90-150 Coarse Sand", JSON.stringify(other));

  // ── Zones: rename, then merge ──────────────────────────────────────────
  const zones = await page(`
    const mk = (code, project) => __t.invoke('borewell_create', { input: { borewellId: code, ownerName: 'Zone test', project, city: 'Lucknow', date: '2026-09-01' } });
    const a = await mk('ZONE-A', 'Zone Nine'), b = await mk('ZONE-B', 'Zone 9 typo');
    location.hash = '#/'; await __t.wait(300); location.hash = '#/settings';
    const row = (name) => [...document.querySelectorAll('main li')].find(li => li.innerText.startsWith(name));
    const rename = async (from, to) => {
      (await __t.until(() => row(from))).querySelector('button').click();
      const box = await __t.until(() => document.querySelector('input[aria-label="New name for ' + from + '"]'));
      __t.type(box, to); await __t.wait(150); __t.btn('Save', box.closest('form')).click();
    };
    await rename('Zone 9 typo', 'Zone 9');
    await __t.until(() => row('Zone 9') && !row('Zone 9 typo'), 8000);
    const renamed = (await __t.invoke('borewell_get', { id: b.id })).borewell.project;
    await rename('Zone 9', 'zone nine');
    const dialog = await __t.until(() => document.querySelector('[role="dialog"]'));
    const asked = dialog.innerText.split('\\n')[0];
    __t.btn('Merge zones', dialog).click();
    await __t.until(() => /2 borewells/.test(row('Zone Nine')?.innerText ?? ''), 8000);
    const merged = (await __t.invoke('borewell_get', { id: b.id })).borewell.project;
    for (const x of [a, b]) { await __t.invoke('borewell_delete', { id: x.id }); await __t.invoke('borewell_delete_permanently', { id: x.id }); }
    return { renamed, asked, merged, left: (await __t.invoke('projects_list')).map(z => z.name).filter(n => /^Zone (9|Nine)/.test(n)) };`);
  check("Settings: a zone can be renamed", zones.renamed === "Zone 9", zones.renamed);
  check("…and renaming it to another zone's name merges the two, after asking", /Merge/.test(zones.asked) && zones.merged === "Zone Nine" && zones.left.join() === "Zone Nine", JSON.stringify(zones));

  // ── Activity: every change, newest first ───────────────────────────────
  const activity = await page(`
    location.hash = '#/activity';
    await __t.until(() => document.querySelectorAll('main ol li').length > 3, 8000);
    const all = document.querySelectorAll('main ol li').length;
    const first = document.querySelector('main ol li').innerText;
    __t.type(document.querySelector('main input[type="search"]'), 'Aliganj site log');
    await __t.until(() => document.querySelectorAll('main ol li').length < all, 5000);
    const found = [...document.querySelectorAll('main ol li')].map(li => li.innerText.replace(/\\s+/g, ' '));
    return { all, first, found, link: !!document.querySelector('main ol li a[href*="/borewell/"]') };`);
  check("Activity lists every change, newest first, and can be searched", activity.all > 3 && activity.found.length >= 1 && activity.found.every(t => /Aliganj site log/.test(t)) && activity.link, JSON.stringify(activity).slice(0, 300));

  // ── Correcting a location from a photo's GPS ───────────────────────────
  const fixed = await page(`
    window.__STRATA_TEST_CHOOSE__ = () => ['${f.photo}'];
    location.hash = '#/borewell/${imported.id}/edit'; await __t.until(() => document.querySelector('#f-owner'));
    [...document.querySelectorAll('main button')].find(b => /Location/.test(b.innerText) && !/Next/.test(b.innerText)).click(); await __t.wait(400);
    __t.btn("Use a photo's GPS").click();
    await __t.until(() => Math.abs(parseFloat(document.querySelector('#f-lat').value) - 26.8947) < 0.001, 10000);
    delete window.__STRATA_TEST_CHOOSE__;
    [...document.querySelectorAll('main button')].find(b => /Drilling/.test(b.innerText) && !/Next/.test(b.innerText)).click(); await __t.wait(300);
    __t.type(document.querySelector('#f-water'), '58'); await __t.wait(200);
    __t.btn('Save changes').click();
    await __t.until(() => location.hash === '#/borewell/${imported.id}', 10000); await __t.wait(600);
    const b = (await __t.invoke('borewell_get', { id: '${imported.id}' })).borewell;
    return { lat: b.latitude, lon: b.longitude, source: b.locationSource, water: b.waterLevel };`);
  check("A location is corrected from a photo's GPS, and its source recorded",
    Math.abs(fixed.lat - 26.8947) < 0.0005 && Math.abs(fixed.lon - 80.945) < 0.0005 && fixed.source === "photo" && fixed.water === 58, JSON.stringify(fixed));

  // An unfinished borewell kept by an older version, from before the pump boxes existed, still opens.
  const oldDraft = await page(`
    localStorage.setItem('strata-new-borewell-draft', JSON.stringify({ form: { borewellId: 'BW-OLD-DRAFT', ownerName: 'Kept From Before', project: '', date: '2026-01-05', houseNo: '', address: '', area: '', city: 'Lucknow', latitude: '', longitude: '', locationSource: 'unknown', totalDepth: '150', waterLevel: '', dynamicWaterLevel: '', boreDia: '', pipeDia: '', drillingMethod: '', remarks: '' }, layers: [], pipes: [], photos: [], files: [] }));
    location.hash = '#/'; await __t.wait(300); location.hash = '#/new';
    const shown = await __t.until(() => document.querySelector('#f-owner') || /could not be shown/.test(__t.text()), 8000);
    const owner = document.querySelector('#f-owner')?.value ?? 'screen failed';
    [...document.querySelectorAll('main ol button')].find(b => b.innerText.includes('Drilling'))?.click(); await __t.wait(400);
    return { owner, depth: document.querySelector('#f-depth')?.value, pump: !!document.querySelector('#f-pump-make') };`);
  check("An unfinished borewell kept by an older version opens, with the newer boxes empty", oldDraft.owner === "Kept From Before" && oldDraft.depth === "150" && oldDraft.pump, JSON.stringify(oldDraft));

  // ── New borewell, step by step, with a gap marked "Not recorded" ───────
  const manual = await page(`
    location.hash = '#/'; await __t.wait(300);
    localStorage.removeItem('strata-new-borewell-draft');
    location.hash = '#/new'; await __t.until(() => document.querySelector('#f-id'));
    const id = document.querySelector('#f-id').value;
    const nagging = !!document.querySelector('#f-owner-msg');
    const step = (name) => [...document.querySelectorAll('main ol button')].find(b => b.innerText.includes(name));
    step('Drilling').click();
    __t.type(await __t.until(() => document.querySelector('#f-hole')), 'ten');
    step('Check').click(); await __t.wait(300);
    const problem = [...document.querySelectorAll('main li button')].find(b => /Hole size/.test(b.innerText));
    const named = problem?.innerText ?? ''; problem?.click(); await __t.wait(300);
    const led = !!document.querySelector('#f-hole'); if (led) __t.type(document.querySelector('#f-hole'), '');
    step('Basics').click();
    __t.type(await __t.until(() => document.querySelector('#f-owner')), 'E2E Owner');
    __t.type(document.querySelector('#f-zone'), 'Zone E2E');
    __t.btn('Next: Location').click(); await __t.wait(300);
    __t.type(document.querySelector('#f-area'), 'Vipul Khand');
    // Place search: the map opens with the address searched. The search needs internet, so being
    // told it could not be reached also counts; a wrong or missing answer does not.
    __t.btn('Search for the address').click();
    const box = await __t.until(() => document.querySelector('[role="combobox"][aria-label="Search for a place"]'));
    const searched = box.value;
    await __t.until(() => document.querySelector('#place-matches [role="option"]') || document.querySelector('[role="dialog"] [role="status"]:not(:empty)')?.textContent !== 'Searching…' && document.querySelector('[role="dialog"] [role="status"]'), 15000);
    const first = document.querySelector('#place-matches [role="option"]');
    let place = 'offline: ' + (document.querySelector('[role="dialog"] [role="status"]')?.textContent ?? '');
    if (first) {
      const name = first.textContent; first.click(); await __t.wait(300);
      __t.btn('Use this location').click(); await __t.wait(300);
      const r = (await __t.invoke('place_search', { query: searched }))[0];
      place = [name, document.querySelector('#f-lat').value === r.latitude.toFixed(6) && document.querySelector('#f-lon').value === r.longitude.toFixed(6), Math.abs(r.latitude - 26.85) < 0.3 && Math.abs(r.longitude - 80.95) < 0.3].join(' | ');
    } else { __t.btn('Cancel').click(); await __t.wait(300); }
    __t.type(document.querySelector('#f-paste'), '26.8930, 80.9420'); await __t.wait(200);
    __t.btn('Next: Drilling').click(); await __t.wait(300);
    __t.type(document.querySelector('#f-depth'), '100'); __t.type(document.querySelector('#f-water'), '45');
    await __t.choose(document.querySelector('#f-method'), 'Rotary');
    await __t.choose(document.querySelector('#f-pump-type'), 'Borewell submersible, 4 inch (100 mm)');
    // A company that is not on the list can be added, and is then on the list.
    await __t.choose(document.querySelector('#f-pump-make'), 'Add a new company…');
    __t.type(document.querySelector('#f-pump-make'), 'Texmo'); await __t.wait(150);
    document.querySelector('[aria-label="Back to the list"]').click(); await __t.wait(200);
    const added = document.querySelector('#f-pump-make [data-slot="select-value"]').textContent;
    // The model list holds the models already used from the chosen company (here, by the imported log).
    await __t.choose(document.querySelector('#f-pump-make'), 'KSB');
    await __t.choose(document.querySelector('#f-pump-model'), '3C/20');
    __t.type(document.querySelector('#f-pump-hp'), '2');
    // A pump above the water would run dry: the form says so, and lets it be corrected.
    __t.type(document.querySelector('#f-pump-lowering'), '30'); await __t.wait(200);
    const dryWarning = document.querySelector('#f-pump-lowering-msg')?.textContent ?? '';
    __t.type(document.querySelector('#f-pump-lowering'), '80'); await __t.wait(200);
    __t.btn('Next: Layers').click(); await __t.wait(300);
    __t.btn('Add layer').click(); await __t.wait(150);
    __t.type(document.querySelector('input[aria-label="Layer 1 to"]'), '40');
    await __t.choose(document.querySelector('[aria-label="Layer 1 soil type"]'), 'Clay');
    __t.btn('Add layer').click(); await __t.wait(150);
    __t.type(document.querySelector('input[aria-label="Layer 2 from"]'), '50');
    __t.type(document.querySelector('input[aria-label="Layer 2 to"]'), '100');
    await __t.choose(document.querySelector('[aria-label="Layer 2 soil type"]'), 'Coarse Sand');
    const gap = await __t.until(() => __t.btn('Mark 40'));
    const gapText = gap.innerText; gap.click(); await __t.wait(300);
    __t.btn('Add pipe piece').click(); await __t.wait(150);
    __t.type(document.querySelector('input[aria-label="Pipe 1 to (ft)"]'), '60');
    __t.btn('Next: Photos').click(); await __t.wait(200);
    __t.btn('Next: Check').click(); await __t.wait(400);
    const ready = [...document.querySelectorAll('main div')].find(d => /^(Ready to save|Fix these before saving)/.test(d.innerText ?? ''))?.innerText ?? '';
    __t.btn('Save borewell').click();
    await __t.until(() => /#\\/borewell\\/[^/]+$/.test(location.hash), 10000); await __t.wait(800);
    const bwid = location.hash.split('/').pop();
    const r = await __t.invoke('borewell_get', { id: bwid });
    await __t.until(() => /Pump lowered to/.test(__t.text()));
    const shown = [...document.querySelectorAll('main dl > div')].filter(d => /^Pump/.test(d.textContent)).map(d => d.textContent).join(' ; ');
    return { id, bwid, gapText, searched, place, dryWarning, shown, nagging, named, led, added, pump: [r.borewell.pumpType, r.borewell.pumpMake, r.borewell.pumpModel, r.borewell.pumpHp, r.borewell.pumpLowering].join(' | '), ready: ready.split('\\n')[0], draftCleared: !localStorage.getItem('strata-new-borewell-draft'), source: r.borewell.locationSource,
      meta: [r.borewell.ownerName, r.borewell.project, r.borewell.area, r.borewell.totalDepth, r.borewell.waterLevel, r.borewell.drillingMethod].join(' | '),
      strata: r.strata.map(l => (l.materialId ?? l.material) + ' ' + l.startDepth + '-' + l.endDepth).join('; '), pipes: r.pipes.map(p => p.pipeType + ' ' + p.startDepth + '-' + p.endDepth).join(', ') };`);
  check("The check step says the new borewell is ready to save", /Ready to save/.test(manual.ready), manual.ready);
  check("A new borewell is saved with all its details", /^E2E Owner \| Zone E2E \| Vipul Khand.* \| 100 \| 45 \| ROTARY$/.test(manual.meta) && manual.pipes === "plain 0-60", `${manual.meta} · ${manual.pipes}`);
  check("A gap in layers is marked “Not recorded” and saved as such", manual.strata === "clay 0-40; not_recorded 40-50; coarse_sand 50-100", `${manual.gapText} → ${manual.strata}`);
  check("Searching for the address opens the map with the address searched", manual.searched === "Vipul Khand, Lucknow", manual.searched);
  check("Choosing a found place near Lucknow fills in its coordinates", /^offline: .*(internet|did not answer)/.test(manual.place) || / \| true \| true$/.test(manual.place), manual.place);
  check("The pump is saved with a new borewell and shown on its page", manual.pump === "Borewell submersible, 4 inch (100 mm) | KSB | 3C/20 | 2 | 80" && manual.added === "Texmo" && /KSB 3C.20 · 2 HP/.test(manual.shown) && /80/.test(manual.shown), manual.pump + " / " + manual.shown + " / added: " + manual.added);
  check("A pump lowered above the water level gets a warning", /run dry/.test(manual.dryWarning), manual.dryWarning);
  check("A problem on the check step names its field and leads to it; steps open in any order", manual.named === "Hole size: type a number here." && manual.led && !manual.nagging, JSON.stringify([manual.named, manual.led, manual.nagging]));
  check("The location source is recorded for a new borewell", manual.source === "typed", manual.source);
  check("The unfinished-borewell draft is cleared after saving", manual.draftCleared);

  // ── Editing ────────────────────────────────────────────────────────────
  const edited = await page(`
    location.hash = '#/borewell/${manual.bwid}/edit'; await __t.until(() => document.querySelector('#f-owner')?.value === 'E2E Owner');
    __t.type(document.querySelector('#f-owner'), 'E2E Owner (edited)'); await __t.wait(100);
    __t.btn('Save changes').click();
    await __t.until(() => location.hash === '#/borewell/${manual.bwid}', 10000); await __t.wait(600);
    return (await __t.invoke('borewell_get', { id: '${manual.bwid}' })).borewell.ownerName;`);
  check("Edit details saves", edited === "E2E Owner (edited)", edited);

  const layersEdited = await page(`
    location.hash = '#/borewell/${manual.bwid}/layers'; await __t.until(() => document.querySelector('[aria-label="Layer 1 soil type"]'), 10000); await __t.wait(500);
    await __t.choose(document.querySelector('[aria-label="Layer 1 soil type"]'), 'Silty Clay');
    let first = ''; const end = Date.now() + 8000;
    while (Date.now() < end) { await __t.wait(400); first = (await __t.invoke('borewell_get', { id: '${manual.bwid}' })).strata[0].material; if (first === 'Silty Clay') break; }
    return first;`);
  check("The layer editor saves changes by itself", layersEdited === "Silty Clay", layersEdited);

  // ── Photos, files, water readings ──────────────────────────────────────
  const attached = await page(`
    window.__STRATA_TEST_CHOOSE__ = (title) => /photo/i.test(title) ? ['${f.photo}'] : ['${f.pdf}'];
    location.hash = '#/borewell/${manual.bwid}'; await __t.until(() => __t.btn('Photos ('), 8000);
    __t.press(__t.btn('Photos (')); await __t.wait(400);
    __t.btn('Add photos').click();
    const img = await __t.until(() => { const i = document.querySelector('main img'); return i && i.complete && i.naturalWidth > 0 ? i : null; }, 10000);
    __t.press(__t.btn('Files (')); await __t.wait(400);
    __t.btn('Add file').click(); await __t.wait(1500);
    delete window.__STRATA_TEST_CHOOSE__;
    const r = await __t.invoke('borewell_get', { id: '${manual.bwid}' });
    return { photos: r.photos.length, shown: img.naturalWidth, gps: [r.photos[0]?.latitude, r.photos[0]?.longitude], files: r.files.map(x => x.originalName) };`);
  check("Photos attach and show, with their GPS position read", attached.photos === 1 && attached.shown === 640 && Math.abs(attached.gps[0] - 26.8947) < 0.001, JSON.stringify(attached));
  check("Files attach", attached.files.includes("site-notes.pdf"), attached.files.join(", "));

  const water = await page(`
    await __t.invoke('water_reading_add', { borewellId: '${manual.bwid}', reading: { measuredOn: '2026-09-29', staticLevel: 47 } });
    return (await __t.invoke('borewell_get', { id: '${manual.bwid}' })).borewell.waterLevel;`);
  check("Water readings over time: the latest sets the water level", water === 47, String(water));

  // ── Finding borewells ──────────────────────────────────────────────────
  const search = await page(`
    location.hash = '#/borewells'; await __t.until(() => document.querySelector('input[type="search"]'));
    __t.type(document.querySelector('input[type="search"]'), 'E2E Owner');
    await __t.until(() => document.querySelectorAll('main tbody tr').length === 1, 5000);
    const one = document.querySelector('main tbody tr').innerText;
    __t.type(document.querySelector('input[type="search"]'), ''); await __t.wait(600);
    __t.btn('No location').click(); await __t.wait(1000);
    return { one, noLocation: [...document.querySelectorAll('main tbody tr')].map(r => r.innerText.split('\\t')[0]) };`);
  check("Search finds a borewell by owner", /E2E Owner/.test(search.one), search.one.split("\t").slice(0, 2).join(" "));
  check("The No location filter lists only borewells without a location", search.noLocation.length === 1 && search.noLocation[0].includes(LEGACY.borewellId), search.noLocation.join(", "));

  // ── Map and cross-section ──────────────────────────────────────────────
  const map = await page(`
    location.hash = '#/map'; await __t.wait(2500);
    return { pins: document.querySelectorAll('.leaflet-overlay-pane path.leaflet-interactive, .strata-cluster').length,
      heat: !!document.querySelector('.leaflet-image-layer, .leaflet-overlay-pane canvas, .leaflet-overlay-pane img') };`);
  check("The map shows the borewells with water-depth colours", map.pins >= 1 && map.heat, JSON.stringify(map));

  // ── Borewells at the same spot: listed, since no zoom separates them ────
  const stack = await page(`
    const mk = (code, date, waterLevel) => __t.invoke('borewell_create', { input: { borewellId: code, ownerName: 'Same spot', city: 'Lucknow', date, waterLevel, latitude: 26.95, longitude: 81.05 } });
    const a = await mk('SPOT-2016', '2016-05-01', 60), b = await mk('SPOT-2026', '2026-09-01', 90);
    location.hash = '#/'; await __t.wait(300); location.hash = '#/map?select=' + b.id; await __t.wait(2500); // let the map settle on them
    const bubble = await __t.until(() => [...document.querySelectorAll('.strata-cluster')].find(c => c.innerText.trim() === '2'), 10000);
    bubble.click();
    // Wait for the list itself, and read it without depending on the popup having finished appearing.
    const popup = await __t.until(() => { const p = document.querySelector('.leaflet-popup-content'); return p && /SPOT-2016/.test(p.textContent) ? p : null; }, 8000);
    const listed = [...popup.querySelectorAll('b, button')].map(e => e.textContent.trim()).join(' | ');
    __t.btn('SPOT-2016', popup).click();
    const card = await __t.until(() => document.querySelector('[role="dialog"][aria-label="SPOT-2016 details"]'), 5000).catch(() => null);
    // Which readings count: the last 3 years by default (the 2016 one is left out), or all of them.
    const since = () => /going by readings since 2023/.test(__t.text());
    const byDefault = since();
    await __t.choose(document.querySelector('[aria-label="Which water readings to use"]'), 'All readings');
    const all = !since();
    await __t.choose(document.querySelector('[aria-label="Which water readings to use"]'), 'Readings from the last 3 years');
    const back = since();
    for (const x of [a, b]) { await __t.invoke('borewell_delete', { id: x.id }); await __t.invoke('borewell_delete_permanently', { id: x.id }); }
    return { listed, opened: !!card, byDefault, all, back };`);
  check("Map: borewells at the same spot are listed, newest first, and each can be opened",
    /2 borewells here/.test(stack.listed) && stack.listed.indexOf("SPOT-2026") < stack.listed.indexOf("SPOT-2016") && stack.opened, JSON.stringify(stack));
  check("Map: old water readings are left out by default, and \"All readings\" brings them back", stack.byDefault && stack.all && stack.back, JSON.stringify(stack));

  // ── Map without internet (needs internet once, to download it) ─────────
  if (process.env.E2E_OFFLINE_MAP !== "0") {
    const offline = await page(`
      location.hash = '#/settings#offline-map';
      const button = await __t.until(() => __t.btn('Download the Lucknow map'), 8000);
      button.click();
      await __t.until(() => /Downloaded/.test(document.getElementById('offline-map')?.closest('section')?.innerText ?? ''), 90000);
      const status = await __t.invoke('offline_map_status');
      location.hash = '#/map';
      // The downloaded map is drawn into canvas tiles; count the ones with something drawn on them.
      const drawn = await __t.until(() => {
        const tiles = [...document.querySelectorAll('.leaflet-tile-pane canvas')];
        const painted = tiles.filter(c => {
          try {
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            const seen = new Set();
            for (let i = 0; i < d.length; i += 4 * 97) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
            return seen.size > 3;   // more than a flat background: streets, water, labels…
          } catch { return false; }
        });
        return painted.length >= 2 ? { tiles: tiles.length, painted: painted.length } : null;
      }, 20000).catch(() => ({ tiles: document.querySelectorAll('.leaflet-tile-pane canvas').length, painted: 0 }));
      const online = document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile').length;
      return { installed: status.installed, mb: Math.round(status.sizeBytes / 1048576 * 10) / 10, ...drawn, online };`);
    check("Map without internet: the Lucknow map downloads from Settings", offline.installed && offline.mb > 1, `${offline.mb} MB`);
    check("…and the Map screen draws streets from it instead of online tiles", offline.painted >= 2 && offline.online === 0, JSON.stringify(offline));
  }

  const section = await page(`
    location.hash = '#/section'; await __t.until(() => __t.btn('North to south'), 8000);
    __t.btn('North to south').click(); await __t.wait(1500);
    return [...document.querySelectorAll('svg[aria-label^="Cross-section with"]')].pop()?.getAttribute('aria-label') ?? '';`);
  check("A typed-in and an imported borewell appear together in a cross-section", section === "Cross-section with 2 borewells", section);

  // ── Export: PDF report and Excel workbook ──────────────────────────────
  if (realDialogs) {
    // The Save dialog keeps the app's suggested name and folder (Documents on a fresh machine).
    const documents = path.join(os.homedir(), "Documents");
    let since = Date.now();
    await page(`location.hash = '#/borewell/${manual.bwid}'; await __t.until(() => __t.btn('Make PDF report'), 8000); __t.btn('Make PDF report').click(); return true;`);
    const pdfAnswer = await answerSaveDialog();
    const pdf = await newFileIn(documents, new RegExp(`^${manual.id}.*[.]pdf$`), since);
    if (!pdf) { cancelSaveDialog(); console.log(await exportDiagnostics()); }
    check("A PDF report is saved through the Save dialog", pdf?.bytes.subarray(0, 5).toString() === "%PDF-" && pdf.bytes.length > 20000, `${pdfAnswer}; ${pdf ? `${path.basename(pdf.file)}, ${pdf.bytes.length} bytes` : "no file"}`);

    since = Date.now();
    await page(`location.hash = '#/export'; await __t.until(() => __t.btn('Excel workbook'), 8000); __t.btn('Excel workbook').click(); await __t.wait(200); __t.btn('Save Excel workbook').click(); return true;`);
    const xlsxAnswer = await answerSaveDialog();
    const book = await newFileIn(documents, /^StrataField.*[.]xlsx$/, since);
    if (!book) { cancelSaveDialog(); console.log(await exportDiagnostics()); }
    check("An Excel workbook of all borewells is saved through the Save dialog", book?.bytes.subarray(0, 2).toString() === "PK" && book.bytes.length > 5000, `${xlsxAnswer}; ${book ? `${path.basename(book.file)}, ${book.bytes.length} bytes` : "no file"}`);
    for (const saved of [pdf?.file, book?.file]) if (saved) fs.rmSync(saved, { force: true });
  } else {
    // Without the real dialog: the workbook is built, and writing to a path nobody picked is refused.
    const out = path.join(f.saved, "stand-in.xlsx").split(path.sep).join("/");
    const refused = await page(`
      window.__STRATA_TEST_SAVE__ = () => '${out}';
      location.hash = '#/export'; await __t.until(() => __t.btn('Excel workbook'), 8000);
      __t.btn('Excel workbook').click(); await __t.wait(200); __t.btn('Save Excel workbook').click();
      const t = await __t.until(() => document.querySelector('[data-sonner-toast][data-type="error"]') || (/Saved to/.test(__t.text()) && 'saved'), 15000);
      delete window.__STRATA_TEST_SAVE__;
      return t === 'saved' ? 'saved' : t.innerText;`);
    check("Export builds the workbook; writing is refused for a path not picked in the Save dialog", /forbidden path/.test(refused) && !fs.existsSync(out), refused.slice(0, 80));
  }

  // The PDF report itself, taken before it is written: a real PDF, with the drawing (and, with internet, the map).
  const report = await page(`
    window.__pdf = null; window.__STRATA_TEST_KEEP__ = (bytes) => { window.__pdf = bytes; };
    location.hash = '#/'; await __t.wait(300); location.hash = '#/borewell/${manual.bwid}';
    await __t.until(() => document.querySelector('main h1')?.textContent.includes('${manual.id}') && __t.btn('Make PDF report'), 8000); await __t.wait(400);
    __t.btn('Make PDF report').click();
    await __t.until(() => window.__pdf, 30000).catch(() => {});
    delete window.__STRATA_TEST_KEEP__;
    return window.__pdf ? { head: String.fromCharCode(...window.__pdf.subarray(0, 5)), size: window.__pdf.length } : { head: 'not built: ' + [...document.querySelectorAll('[data-sonner-toast]')].map(t => t.innerText).join(' | '), size: 0 };`);
  check("The PDF report of a borewell is built, with its drawing", report.head === "%PDF-" && report.size > 15000, `${report.head} ${report.size} bytes`);

  // ── Two logs on one sheet, edited in the table, then given a location one after another ──
  const batch = await page(`
    window.__STRATA_TEST_CHOOSE__ = () => ['${f.twoLogs}'];
    location.hash = '#/'; await __t.wait(300); location.hash = '#/import'; await __t.wait(800);
    __t.btn('Choose Excel files').click();
    await __t.until(() => document.querySelectorAll('main tbody tr').length === 2, 15000);
    const rows = [...document.querySelectorAll('main tbody tr')].map(r => r.querySelector('td:nth-child(2)').innerText.replace(/\\n/g, ' / '));
    __t.type(document.querySelector('[aria-label="A zone for every file"]'), 'Zone Batch'); await __t.wait(150); __t.btn('Use for all').click(); await __t.wait(200);
    __t.type(document.querySelector('[aria-label="Owner for Two wells.xlsx (log 2)"]'), 'Second Owner'); await __t.wait(200);
    (await __t.until(() => [...document.querySelectorAll('main button')].find(b => /^Import 2 borewells/.test(b.innerText) && !b.disabled), 8000)).click();
    await __t.until(() => /See all borewells/.test(__t.text()), 15000);
    delete window.__STRATA_TEST_CHOOSE__;
    const mine = async () => (await __t.invoke('borewells_search', { filters: {} })).filter(i => (i.borewell.importSource ?? '').startsWith('Two wells.xlsx')).sort((a, b) => a.borewell.borewellId.localeCompare(b.borewell.borewellId));
    const made = await mine();
    const saved = made.map(i => [i.borewell.borewellId, i.borewell.ownerName, i.borewell.project, i.strata.map(l => l.endDepth + (l.remarks ? ' ' + l.remarks : '')).join(',')].join(' | '));
    // Add locations: the map opens for the first borewell without one; skipping brings up the next.
    __t.btn('Add their locations').click();
    const title = () => document.querySelector('[role="dialog"] h2')?.textContent ?? '';
    await __t.until(() => /^Where is /.test(title()), 8000);
    const firstUp = title();
    __t.btn('Skip this one').click(); await __t.until(() => /^Where is /.test(title()) && title() !== firstUp, 8000);
    __t.btn('Stop for now').click(); await __t.wait(400);
    // Choosing one from the list puts it next; a click on the map and "Use this location" saves it.
    [...document.querySelectorAll('main li')].find(li => /Two wells 2/.test(li.innerText)).querySelector('button').click();
    await __t.until(() => title() === 'Where is Two wells 2?', 8000);
    const prefilled = document.querySelector('[role="combobox"][aria-label="Search for a place"]').value;
    const m = await __t.until(() => document.querySelector('[role="dialog"] .leaflet-container')); await __t.wait(800);
    const box = m.getBoundingClientRect();
    m.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.left + box.width / 2 + 40, clientY: box.top + box.height / 2 + 30 })); await __t.wait(300);
    __t.btn('Use this location').click();
    await __t.until(async () => (await mine())[1].borewell.latitude != null, 8000);
    const after = await mine();
    const placed = [after[1].borewell.locationSource, after[0].borewell.latitude == null, !/Two wells 2/.test(document.querySelector('main').innerText)].join(' | ');
    document.querySelector('[role="dialog"]') && __t.btn('Stop for now')?.click(); await __t.wait(300);
    for (const i of after) { await __t.invoke('borewell_delete', { id: i.borewell.id }); await __t.invoke('borewell_delete_permanently', { id: i.borewell.id }); }
    return { rows, saved, firstUp, prefilled, placed };`);
  check("A sheet with two logs gives two rows on the Import screen", batch.rows.length === 2 && /^Two wells.xlsx/.test(batch.rows[0]) && /\(log 2\)/.test(batch.rows[1]), batch.rows.join(" ; "));
  check("Details edited in the Import table, a zone for every file and a soil's note are saved", batch.saved.join(" ; ") === "Two wells | North Gate | Zone Batch | 40,120 Good,150 ; Two wells 2 | Second Owner | Zone Batch | 60,180,220", batch.saved.join(" ; "));
  check("Add locations goes through the borewells without one: skip, choose one, click the map", /^Where is /.test(batch.firstUp) && /Station Road/.test(batch.prefilled) && batch.placed === "map | true | true", `${batch.firstUp} / ${batch.prefilled} / ${batch.placed}`);

  // ── History ────────────────────────────────────────────────────────────
  const history = await page(`
    location.hash = '#/borewell/${manual.bwid}'; await __t.until(() => __t.btn('History'), 8000);
    __t.press(__t.btn('History')); await __t.wait(600);
    return document.querySelector('[role="tabpanel"]:not([hidden])')?.innerText ?? '';`);
  check("History lists the changes to a borewell", /Added/.test(history) && /water reading/.test(history), history.split("\n").slice(0, 4).join(" | "));

  // ── Recycle bin: move there, restore ───────────────────────────────────
  const binned = await page(`
    document.querySelector('button[aria-label="Move to Recycle bin"]').click();
    const dlg = await __t.until(() => document.querySelector('[role="dialog"]'));
    __t.btn('Move to Recycle bin', dlg).click();
    await __t.until(() => [...document.querySelectorAll('main div')].some(d => d.innerText?.startsWith('This borewell is in the Recycle bin')), 8000);
    location.hash = '#/recycle-bin';
    const row = await __t.until(() => [...document.querySelectorAll('main tbody tr')].find(r => r.innerText.includes('${manual.id}')));
    __t.btn('Restore', row).click();
    await __t.until(async () => (await __t.invoke('borewells_search', { filters: {} })).some(i => i.borewell.id === '${manual.bwid}'), 8000);
    return true;`);
  check("Recycle bin: a borewell moved there (with confirmation) can be restored", binned === true);

  // ── Backups: make one, delete for good, restore it ─────────────────────
  const backedUp = await page(`
    location.hash = '#/settings'; await __t.until(() => /Soil types/.test(__t.text()), 8000);
    const before = (await __t.invoke('backups_list')).length;
    __t.btn('Back up now').click();
    await __t.until(async () => (await __t.invoke('backups_list')).length === before + 1, 10000);
    return (await __t.invoke('backups_list')).map(b => b.kind);`);
  check("Settings: Back up now makes a backup (and one was made automatically at start-up)", backedUp.includes("manual") && backedUp.includes("auto"), backedUp.join(", "));

  // A second copy of every backup, in a folder the user chooses (standing in for a USB drive).
  const usb = path.join(work, "usb-drive");
  fs.mkdirSync(usb, { recursive: true });
  const usbFwd = usb.split(path.sep).join("/");
  const second = await page(`
    window.__STRATA_TEST_CHOOSE__ = () => ['${usbFwd}'];
    location.hash = '#/settings#second-copy';
    (await __t.until(() => __t.btn('Choose a folder'), 8000)).click();
    await __t.until(async () => (await __t.invoke('backup_second_copy_get')).lastCopiedAt, 10000);
    delete window.__STRATA_TEST_CHOOSE__;
    return await __t.invoke('backup_second_copy_get');`);
  const copied = fs.existsSync(path.join(usb, "StrataField backups")) ? fs.readdirSync(path.join(usb, "StrataField backups")).filter((n) => n.endsWith(".db")) : [];
  check("Settings: a second copy of the backups goes to a chosen folder (e.g. a USB drive)", second.folder && !second.lastError && copied.length === 1, `${copied.join(", ")} ${second.lastError ?? ""}`);

  const soil = await page(`
    __t.btn('Add soil type').click();
    const dlg = await __t.until(() => document.querySelector('[role="dialog"]'));
    __t.type(dlg.querySelector('#m-name'), 'E2E Soil'); await __t.wait(100);
    __t.btn('Save soil type', dlg).click();
    await __t.until(() => !document.querySelector('[role="dialog"]'));
    return (await __t.invoke('materials_list')).some(m => m.name === 'E2E Soil' && m.isCustom);`);
  check("Settings: a new soil type can be added", soil === true);

  const purged = await page(`
    await __t.invoke('borewell_delete', { id: '${manual.bwid}' });
    location.hash = '#/borewells'; await __t.wait(200); location.hash = '#/recycle-bin';
    const row = await __t.until(() => [...document.querySelectorAll('main tbody tr')].find(r => r.innerText.includes('${manual.id}')));
    __t.btn('Delete for good', row).click();
    const dlg = await __t.until(() => document.querySelector('[role="dialog"]'));
    __t.btn('Delete for good', dlg).click();
    await __t.until(async () => !(await __t.invoke('borewells_search', { filters: { showDeleted: true } })).some(i => i.borewell.id === '${manual.bwid}'), 8000);
    return !(await __t.invoke('borewells_search', { filters: {} })).some(i => i.borewell.id === '${manual.bwid}');`);
  check("Recycle bin: delete for good (with confirmation)", purged === true);

  const restored = await page(`
    location.hash = '#/settings'; await __t.until(() => /Soil types/.test(__t.text()), 8000);
    const manualBackup = (await __t.invoke('backups_list')).find(b => b.kind === 'manual');
    const row = await __t.until(() => [...document.querySelectorAll('main tbody tr')].find(r => r.innerText.includes(manualBackup.label)));
    __t.btn('Restore', row).click();
    const dlg = await __t.until(() => document.querySelector('[role="dialog"]'));
    __t.btn('Restore backup', dlg).click();
    await __t.until(async () => (await __t.invoke('backups_list')).some(b => b.kind === 'before-restore'), 15000);
    await __t.wait(800);
    const r = await __t.invoke('borewell_get', { id: '${manual.bwid}' });
    const soilAfter = (await __t.invoke('materials_list')).some(m => m.name === 'E2E Soil');
    return { layers: r.strata.length, photos: r.photos.map(p => p.filePath), soilAfter };`);
  check("Restoring the backup brings back the deleted borewell and undoes later changes",
    restored.layers === 3 && restored.photos.length === 1 && !restored.soilAfter, JSON.stringify({ ...restored, photos: restored.photos.length }));
  check("…and its photo file is back on disk", restored.photos.length === 1 && fs.existsSync(restored.photos[0]), restored.photos[0]);

  // ── Soil names the older app used that match no soil type ──────────────
  const linked = await page(`
    location.hash = '#/settings#soil-names';
    const box = await __t.until(() => document.querySelector('[aria-label="Soil type for ${LEGACY.unmatchedName}"]'), 8000);
    await __t.choose(box, 'Gravel');
    [...document.querySelectorAll('#soil-names ~ *, main button')].find(b => b.innerText === 'Use this' && !b.disabled).click();
    await __t.until(async () => (await __t.invoke('soil_names_unlinked')).length === 0, 8000);
    const r = await __t.invoke('borewell_get', { id: '${legacy.id}' });
    return r.strata.filter(l => l.materialId === 'gravel').length;`);
  check("Settings: a soil name that was not recognised is linked to a soil type", linked === 2, `${linked} gravel layers`);

  // ── Copy details for support ────────────────────────────────────────────
  const support = await page(`
    // Opening a borewell that does not exist: the screen's request fails and is logged.
    location.hash = '#/borewell/no-such-borewell'; await __t.wait(1500);
    location.hash = '#/settings';
    (await __t.until(() => __t.btn('Copy details for support'), 8000)).click();
    const dlg = await __t.until(() => document.querySelector('[role="dialog"] pre'), 8000);
    const t = dlg.innerText;
    __t.btn('Close', document.querySelector('[role="dialog"]'))?.click(); await __t.wait(300);
    return t;`);
  check("Settings: details for support show versions, counts and the recent error",
    /^StrataField\s+\d/.test(support) && /Borewells\s+\d/.test(support) && /borewell_get/.test(support), support.split("\n").slice(0, 4).join(" | "));
  check("…and contain no borewell details", !/E2E Owner|Vipul Khand|Asha Verma/.test(support));

  // ── Home ───────────────────────────────────────────────────────────────
  const home = await page(`
    location.hash = '#/'; await __t.until(() => /Newest borewells/.test(__t.text()), 8000);
    return __t.text();`);
  check("Home shows the numbers, recently added borewells and the backup panel", /3 borewells across/.test(home) && /Back up now/.test(home) && /Needs attention/.test(home),
    home.split("\n").slice(0, 10).join(" | "));

  // ── The drawing: a pump lowered to the middle of a layer does not cover the layer's name ──
  const labels = await page(`
    const b = await __t.invoke('borewell_create', { input: { borewellId: 'LABELS-1', ownerName: 'Label test', city: 'Lucknow', date: '2026-09-01', totalDepth: 200, waterLevel: 108, pumpLowering: 158 } });
    await __t.invoke('strata_save', { borewellId: b.id, layers: [{ startDepth: 0, endDepth: 135, material: 'Clay' }, { startDepth: 135, endDepth: 175, material: 'Sand' }, { startDepth: 175, endDepth: 200, material: 'Clay' }] });
    location.hash = '#/borewell/' + b.id;
    const pump = await __t.until(() => [...document.querySelectorAll('main svg text')].find(t => t.textContent === 'Pump 158 ft'), 10000);
    const beside = [...pump.closest('svg').querySelectorAll('text')].filter(t => /^(Pump|Water|Sand|Clay) /.test(t.textContent))
      .map(t => ({ name: t.textContent, y: Number(t.getAttribute('y')) }));   // 11 px text: baselines closer than that touch
    return { names: beside.map(t => t.name), covered: beside.flatMap((a, i) => beside.slice(i + 1).filter(o => Math.abs(a.y - o.y) < 11).map(o => a.name + ' / ' + o.name)) };`);
  check("The drawing keeps a layer's name clear of the pump and water labels", labels.names.includes("Sand 135–175") && labels.covered.length === 0, JSON.stringify(labels));
} catch (e) {
  check("Test run finished", false, String(e));
} finally {
  disconnect();
  app.kill();
  await sleep(1000);
  const failed = results.filter((r) => !r.ok).length;
  const summary = `${results.length - failed} passed, ${failed} failed`;
  console.log(`\n${summary}. Scratch data: ${work}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### End-to-end test: ${summary}\n\n| | Check |\n|---|---|\n${results.map((r) => `| ${r.ok ? "✅" : "❌"} | ${r.name} |`).join("\n")}\n`);
  }
  process.exit(failed ? 1 : 0);
}
