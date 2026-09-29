// End-to-end test of the StrataField app, following the V1 definition of done.
//
//   npm run e2e                     uses target/debug/stratafield.exe
//   STRATA_EXE=... npm run e2e      another build (e.g. target/release/stratafield.exe)
//   E2E_REAL_DIALOGS=1 npm run e2e  also saves PDF and Excel through the real Windows Save dialog
//                                   (CI does this; locally the window must not be in use)
//
// Opens an app window. Everything runs on a scratch data folder with made-up data.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  answerSaveDialog, cancelSaveDialog, check, connect, disconnect, page, results, sleep, startApp, waitForFile, workFolder,
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
    go.click();
    await __t.until(() => /See all borewells/.test(__t.text()), 15000);
    delete window.__STRATA_TEST_CHOOSE__;
    const all = await __t.invoke('borewells_search', { filters: {} });
    const ex = all.find(i => i.borewell.importMethod === 'excel');
    const r = await __t.invoke('borewell_get', { id: ex.borewell.id });
    return { id: ex.borewell.id, code: ex.borewell.borewellId, layers: r.strata.length, pipes: r.pipes.length, files: r.files.map(x => x.kind + ':' + x.originalName) };`);
  check("Excel import adds the borewell with its layers and pipes", imported.layers === 10 && imported.pipes >= 1, JSON.stringify(imported));
  check("The original Excel file is kept with the imported borewell", imported.files.includes("excel:Aliganj site log.xlsx"), imported.files.join(", "));

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

  // ── New borewell, step by step, with a gap marked "Not recorded" ───────
  const manual = await page(`
    localStorage.removeItem('strata-new-borewell-draft');
    location.hash = '#/new'; await __t.until(() => document.querySelector('#f-id'));
    const id = document.querySelector('#f-id').value;
    __t.type(document.querySelector('#f-owner'), 'E2E Owner');
    __t.type(document.querySelector('#f-zone'), 'Zone E2E');
    __t.btn('Next: Location').click(); await __t.wait(300);
    __t.type(document.querySelector('#f-area'), 'Vipul Khand');
    __t.type(document.querySelector('#f-paste'), '26.8930, 80.9420'); await __t.wait(200);
    __t.btn('Next: Drilling').click(); await __t.wait(300);
    __t.type(document.querySelector('#f-depth'), '100'); __t.type(document.querySelector('#f-water'), '45');
    await __t.choose(document.querySelector('#f-method'), 'Rotary');
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
    return { id, bwid, gapText, ready: ready.split('\\n')[0], draftCleared: !localStorage.getItem('strata-new-borewell-draft'), source: r.borewell.locationSource,
      meta: [r.borewell.ownerName, r.borewell.project, r.borewell.area, r.borewell.totalDepth, r.borewell.waterLevel, r.borewell.drillingMethod].join(' | '),
      strata: r.strata.map(l => (l.materialId ?? l.material) + ' ' + l.startDepth + '-' + l.endDepth).join('; '), pipes: r.pipes.map(p => p.pipeType + ' ' + p.startDepth + '-' + p.endDepth).join(', ') };`);
  check("The check step says the new borewell is ready to save", /Ready to save/.test(manual.ready), manual.ready);
  check("A new borewell is saved with all its details", /^E2E Owner \| Zone E2E \| Vipul Khand.* \| 100 \| 45 \| ROTARY$/.test(manual.meta) && manual.pipes === "plain 0-60", `${manual.meta} · ${manual.pipes}`);
  check("A gap in layers is marked “Not recorded” and saved as such", manual.strata === "clay 0-40; not_recorded 40-50; coarse_sand 50-100", `${manual.gapText} → ${manual.strata}`);
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

  const section = await page(`
    location.hash = '#/section'; await __t.until(() => __t.btn('North to south'), 8000);
    __t.btn('North to south').click(); await __t.wait(1500);
    return [...document.querySelectorAll('svg[aria-label^="Cross-section with"]')].pop()?.getAttribute('aria-label') ?? '';`);
  check("A typed-in and an imported borewell appear together in a cross-section", section === "Cross-section with 2 borewells", section);

  // ── Export: PDF report and Excel workbook ──────────────────────────────
  if (realDialogs) {
    const pdfPath = path.join(f.saved, "report.pdf");
    await page(`location.hash = '#/borewell/${manual.bwid}'; await __t.until(() => __t.btn('Make PDF report'), 8000); __t.btn('Make PDF report').click(); return true;`);
    const pdfAnswer = await answerSaveDialog(pdfPath);
    const pdf = await waitForFile(pdfPath);
    if (!pdf) { cancelSaveDialog(); console.log(await exportDiagnostics()); }
    check("A PDF report is saved through the Save dialog", pdf?.subarray(0, 5).toString() === "%PDF-" && pdf.length > 20000, `${pdfAnswer}; ${pdf?.length ?? 0} bytes`);

    const xlsxPath = path.join(f.saved, "all-borewells.xlsx");
    await page(`location.hash = '#/export'; await __t.until(() => __t.btn('Excel workbook'), 8000); __t.btn('Excel workbook').click(); await __t.wait(200); __t.btn('Save Excel workbook').click(); return true;`);
    const xlsxAnswer = await answerSaveDialog(xlsxPath);
    const book = await waitForFile(xlsxPath);
    if (!book) { cancelSaveDialog(); console.log(await exportDiagnostics()); }
    check("An Excel workbook of all borewells is saved through the Save dialog", book?.subarray(0, 2).toString() === "PK" && book.length > 5000, `${xlsxAnswer}; ${book?.length ?? 0} bytes`);
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

  // ── Home ───────────────────────────────────────────────────────────────
  const home = await page(`
    location.hash = '#/'; await __t.until(() => /Recently added/.test(__t.text()), 8000);
    return __t.text();`);
  check("Home shows the numbers, recently added borewells and the backup panel", /Borewells\s*\n?\s*3\b/.test(home) && /Back up now/.test(home) && /Needs attention/.test(home),
    home.split("\n").slice(0, 10).join(" | "));
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
