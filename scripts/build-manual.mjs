// Builds the user manual that is installed with the app: app/src-tauri/resources/StrataField User Manual.pdf
//
//   node scripts/build-manual.mjs           print docs/manual/manual.html to the PDF
//   node scripts/build-manual.mjs --shots   first retake every screenshot in docs/manual/shots
//
// The text is docs/manual/manual.html. The screenshots are taken from the real app, started on a
// scratch data folder filled with made-up borewells (nothing touches real data), and controlled the
// same way as the end-to-end test. Retaking them needs the test build of the app:
//   set VITE_E2E=1 && npm run tauri -w app -- build --debug --no-bundle
// Printing needs Microsoft Edge or Chrome (already on any Windows computer).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as xlsx from "xlsx";
import { connect, page, repo, sleep, startApp } from "../e2e/harness.mjs";

const manualDir = path.join(repo, "docs", "manual");
const shotsDir = path.join(manualDir, "shots");
const pdf = path.join(repo, "app", "src-tauri", "resources", "StrataField User Manual.pdf");

if (process.argv.includes("--shots")) await takeShots();
printPdf();

// ── The PDF ─────────────────────────────────────────────────────────────

function printPdf() {
  const browser = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ].find((p) => fs.existsSync(p));
  if (!browser) throw new Error("Microsoft Edge or Chrome is needed to print the manual.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "strata-manual-"));
  execFileSync(browser, [
    "--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--user-data-dir=${profile}`,
    `--print-to-pdf=${pdf}`, pathToFileURL(path.join(manualDir, "manual.html")).href,
  ], { stdio: "ignore" });
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(`${path.relative(repo, pdf)}  ${(fs.statSync(pdf).size / 1024).toFixed(0)} KB`);
}

// ── The screenshots ─────────────────────────────────────────────────────

/** Made-up borewells across Lucknow, drilled over ten years, a few at the same spot. */
function sampleBorewells() {
  const places = [
    ["Aliganj", "Zone 3 · Trans-Gomti", 26.893, 80.942], ["Gomti Nagar", "Zone 4 · Gomti Nagar", 26.86, 81.008],
    ["Chowk", "Zone 1 · Old City", 26.868, 80.911], ["Indira Nagar", "Zone 3 · Trans-Gomti", 26.883, 80.999],
    ["Chinhat", "Zone 4 · Gomti Nagar", 26.884, 81.046], ["Aminabad", "Zone 1 · Old City", 26.846, 80.927],
    ["Hazratganj", "Zone 1 · Old City", 26.851, 80.946], ["Jankipuram", "Zone 7 · North", 26.927, 80.937],
    ["Rajajipuram", "Zone 6 · West", 26.843, 80.887], ["Alambagh", "Zone 5 · South", 26.813, 80.903],
    ["Ashiyana", "Zone 5 · South", 26.79, 80.923], ["Dubagga", "Zone 6 · West", 26.869, 80.853],
    ["Mahanagar", "Zone 3 · Trans-Gomti", 26.878, 80.959], ["Telibagh", "Zone 5 · South", 26.772, 80.946],
    ["Aliganj", "Zone 3 · Trans-Gomti", 26.893, 80.942], ["Hazratganj", "Zone 1 · Old City", 26.851, 80.946],
  ];
  const owners = ["Example School", "Sharma Residence", "City Clinic", "Verma Apartments", "Green Park Society", "Model Hospital", "Sunrise Hotel", "Lake View Homes"];
  const soils = ["clay", "fine_sand", "clay", "medium_sand", "clay_kankar", "coarse_sand", "clay", "medium_sand", "clay"];
  return places.map(([area, project, latitude, longitude], i) => {
    const year = 2026 - ((i * 7) % 10), depth = 260 + ((i * 37) % 9) * 20, water = Math.round(118 - (2026 - year) * 4.5 - (i % 4) * 6);
    const ends = soils.map((_, k) => Math.round((depth * (k + 1)) / soils.length / 10) * 10);
    return {
      input: {
        borewellId: `BW-${year}-${String(i + 1).padStart(3, "0")}`, ownerName: owners[i % owners.length], project, area, city: "Lucknow",
        date: `${year}-${String((i % 11) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`, latitude, longitude, locationSource: "gps",
        totalDepth: depth, waterLevel: water, boreDia: 12, pipeDia: 6, drillingMethod: "ROTARY",
      },
      layers: soils.map((materialId, k) => ({ startDepth: k ? ends[k - 1] : 0, endDepth: ends[k], materialId })),
      pipes: [{ startDepth: 0, endDepth: ends[4], pipeType: "plain" }, { startDepth: ends[4], endDepth: ends[5], pipeType: "slotted" }, { startDepth: ends[5], endDepth: ends[6], pipeType: "plain" }, { startDepth: ends[6], endDepth: ends[7], pipeType: "slotted" }],
    };
  });
}

/** Two made-up drilling logs: one as the field logs are written, one laid out differently. */
function sampleLogs(dir) {
  const write = (name, rows) => {
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows), "Sheet1");
    const file = path.join(dir, name);
    fs.writeFileSync(file, xlsx.write(wb, { type: "buffer", bookType: "xlsx" }));
    return file.replace(/\\/g, "/");
  };
  const side = ["Riverside Apartments", "Sector 12, Vikas Nagar", "Lucknow", null, "Water Level = 95 ft", 'Bore Dia = 12" / 240 ft', 'Tube Well = 6"/230 ft'];
  const soil = ["Clay", "Clay", "Clay", "Sand", "Sand", "Sand", "Clay", "Clay", "Kanker clay", "Kanker clay", "Sand", "Sand", "Sand", "Sand", "Clay", "Clay", "Clay", "Sand ( Fine)", "Sand ( Fine)", "Sand", "Sand", "Sand", "Clay", "Clay"];
  const standard = [["Example Drilling Co, Lucknow"], [], [null, null, "Streta Chart", null, null, "Lowering Assambly"], ["Site:", "G. L. ", '12"', "G. L.", null, "A G L", '6"'],
    ...soil.map((m, i) => { const d = (i + 1) * 10, screen = d > 190 && d <= 220, pipe = d <= 230; return [side[i] ?? null, d, null, m, pipe && screen ? "Ribbed Screen" : null, pipe && !screen ? "Plain pipe" : null, null, pipe ? d : null]; }),
    [], ["Date : 12/8/2026", null, "Client"]];
  const other = [["Borewell at Kalyanpur"], ["From (ft)", "To (ft)", "Soil type", "Pipe"], [0, 40, "Clay", "Plain pipe"], [40, 90, "Fine Sand", "Plain pipe"], [90, 130, "Clay", "Plain pipe"], [130, 180, "Coarse Sand", "Screen"], [180, 200, "Clay", "Plain pipe"]];
  return { standard: write("Riverside Apartments.xlsx", standard), other: write("Kalyanpur site.xlsx", other) };
}

async function takeShots() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "strata-manual-data-"));
  const dataDir = path.join(work, "data"), legacyRoot = path.join(work, "none");
  fs.mkdirSync(legacyRoot, { recursive: true });
  const logs = sampleLogs(work);
  fs.rmSync(shotsDir, { recursive: true, force: true });
  fs.mkdirSync(shotsDir, { recursive: true });
  const app = startApp({ dataDir, legacyRoot });

  // A second DevTools connection, for the pictures.
  let ws, id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const shot = async (name, wait = 700) => {
    await sleep(wait);
    const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 88 });
    fs.writeFileSync(path.join(shotsDir, `${name}.jpg`), Buffer.from(r.result.data, "base64"));
    console.log(`shot ${name}`);
  };

  try {
    await connect({ app, dataDir });
    // Light colours for print, whatever this computer is set to.
    await page(`localStorage.setItem('strata-theme', 'light'); location.reload(); return true;`).catch(() => {});
    await sleep(2500);
    await connect({ app, dataDir });
    const pages = await (await fetch(`http://127.0.0.1:${process.env.E2E_PORT ?? 9333}/json`)).json();
    ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); pending.delete(d.id); };
    await send("Emulation.setDeviceMetricsOverride", { width: 1240, height: 780, deviceScaleFactor: 1, mobile: false });
    // No "saved" messages in the pictures. Hidden with a style: taking them out of the page breaks it.
    await page(`document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '[data-sonner-toaster] { display: none !important; }' })); return true;`);

    // Made-up data.
    const ids = await page(`
      const out = [];
      for (const b of ${JSON.stringify(sampleBorewells())}) {
        const made = await __t.invoke('borewell_create', { input: b.input });
        await __t.invoke('strata_save', { borewellId: made.id, layers: b.layers });
        await __t.invoke('pipes_save', { borewellId: made.id, pipes: b.pipes });
        out.push(made.id);
      }
      await __t.invoke('backup_create');
      return out;`);
    const go = (hash, ms = 1300) => page(`location.hash = '#/'; await __t.wait(200); location.hash = ${JSON.stringify(hash)}; await __t.wait(${ms}); return true;`);
    const scrollTo = (selector) => page(`(${selector}).scrollIntoView({ block: 'start' }); await __t.wait(300); return true;`);

    // New borewell, step by step.
    await page(`localStorage.removeItem('strata-new-borewell-draft'); location.hash = '#/new'; await __t.until(() => document.querySelector('#f-id')); return true;`);
    await page(`__t.type(document.querySelector('#f-owner'), 'Lake View Homes'); __t.type(document.querySelector('#f-zone'), 'Zone 3 · Trans-Gomti'); await __t.wait(300); return true;`);
    await shot("new-1-basics");
    await page(`__t.btn('Next: Location').click(); await __t.wait(400); __t.type(document.querySelector('#f-area'), 'Kapoorthala, Aliganj'); __t.type(document.querySelector('#f-paste'), '26.8742, 80.9480'); await __t.wait(1500); return true;`);
    await shot("new-2-location", 1500);
    await page(`__t.btn('Next: Drilling').click(); await __t.wait(400); __t.type(document.querySelector('#f-depth'), '120'); __t.type(document.querySelector('#f-water'), '45');
      __t.type(document.querySelector('#f-pump-type'), 'Borewell submersible, 4 inch (100 mm)'); __t.type(document.querySelector('#f-pump-model'), 'KSB 3C/20');
      __t.type(document.querySelector('#f-pump-hp'), '2'); __t.type(document.querySelector('#f-pump-lowering'), '100'); return true;`);
    await shot("new-3-drilling");
    await page(`__t.btn('Next: Layers').click(); await __t.wait(400);
      __t.btn('Add layer').click(); await __t.wait(150); __t.type(document.querySelector('input[aria-label="Layer 1 to"]'), '40'); await __t.choose(document.querySelector('[aria-label="Layer 1 soil type"]'), 'Clay');
      __t.btn('Add layer').click(); await __t.wait(150); __t.type(document.querySelector('input[aria-label="Layer 2 from"]'), '50'); __t.type(document.querySelector('input[aria-label="Layer 2 to"]'), '120'); await __t.choose(document.querySelector('[aria-label="Layer 2 soil type"]'), 'Coarse Sand'); await __t.wait(300); return true;`);
    await shot("new-4-layers");
    await page(`__t.btn('Mark 40').click(); await __t.wait(300); __t.btn('Next: Photos').click(); await __t.wait(300); __t.btn('Next: Check').click(); await __t.wait(500); return true;`);
    await shot("new-6-check");
    const made = await page(`__t.btn('Save borewell').click(); await __t.until(() => /#\\/borewell\\/[^/]+$/.test(location.hash), 10000); await __t.wait(900); return location.hash.split('/').pop();`);

    // Import Excel: a log in the usual layout, then one that needs its columns checked.
    await page(`window.__STRATA_TEST_CHOOSE__ = () => [${JSON.stringify(logs.standard)}]; location.hash = '#/import'; await __t.wait(900);
      __t.btn('Choose Excel files').click(); await __t.until(() => /What will be imported/.test(__t.text()), 15000); return true;`);
    await shot("import-review");
    await page(`window.__STRATA_TEST_CHOOSE__ = () => [${JSON.stringify(logs.other)}]; __t.btn('Add more files').click();
      await __t.until(() => document.querySelectorAll('main li').length === 2, 15000);
      document.querySelectorAll('main li')[1].querySelector('button.min-w-0').click(); await __t.until(() => /Where the layers are in this file/.test(__t.text()), 8000); return true;`);
    await shot("import-columns");
    await page(`__t.btn('These columns are right').click(); await __t.wait(300); [...document.querySelectorAll('main button')].find(b => /^Import 2 borewells/.test(b.innerText)).click(); await __t.until(() => /See all borewells/.test(__t.text()), 20000).catch(() => { throw new Error('Import did not finish: ' + [...document.querySelectorAll('[data-sonner-toast]')].map(t => t.innerText).join(' | ') + ' || ' + __t.text().slice(0, 400)); }); delete window.__STRATA_TEST_CHOOSE__; return true;`);

    await go("#/", 1800);
    await shot("home");
    await go("#/borewells");
    await shot("borewells");
    await go("#/borewells?missing=1");
    await shot("borewells-missing");

    // One borewell: its page, a layer's details, and editing layers.
    await go(`#/borewell/${ids[1]}`, 1500);
    await shot("borewell");
    await page(`document.querySelector('svg [role="button"][aria-label$="Show details"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); await __t.until(() => document.querySelector('[role="dialog"]')); return true;`);
    await shot("layer-details");
    await page(`__t.btn('Close', document.querySelector('[role="dialog"]'))?.click(); await __t.wait(300); return true;`);
    await go(`#/borewell/${ids[1]}/layers`, 1500);
    await shot("edit-layers");

    // Map: water colours, then the list for borewells at one spot.
    await go("#/map", 4000);
    await shot("map", 1500);
    await go(`#/map?select=${ids[0]}`, 4000);
    await page(`[...document.querySelectorAll('.strata-cluster')].find(c => c.innerText.trim() === '2')?.click(); await __t.until(() => /borewells here/.test(document.querySelector('.leaflet-popup-content')?.textContent ?? ''), 8000).catch(() => {}); return true;`);
    await shot("map-same-spot", 1500);

    // Cross-section.
    await go("#/section", 2500);
    await page(`__t.btn('North to south').click(); await __t.wait(2500); return true;`);
    await shot("section-line", 1500);
    await scrollTo(`[...document.querySelectorAll('main h2')].find(h => /Layers along the line/.test(h.innerText))`);
    await shot("section-drawing");

    await go("#/export");
    await shot("export");
    await go("#/settings", 1500);
    await shot("settings-backups");
    await scrollTo(`document.getElementById('zones')`);
    await shot("settings-zones");
    await scrollTo(`[...document.querySelectorAll('main h2')].find(h => h.innerText === 'About')`);
    // The scratch folder's name means nothing to a reader; show where the data really is kept.
    await page(`[...document.querySelectorAll('main dd')].find(d => /strata-manual-data/.test(d.innerText)).innerText = 'C:\\\\Users\\\\(your name)\\\\AppData\\\\Roaming\\\\Strata'; return true;`);
    await shot("settings-about");
    await go("#/activity");
    await shot("activity");
    await page(`await __t.invoke('borewell_delete', { id: '${made}' }); return true;`);
    await go("#/recycle-bin");
    await shot("recycle-bin");
  } finally {
    try { ws?.close(); } catch { /* already closed */ }
    app.kill();
    await sleep(800);
    // If a screen failed, the app's own log says why.
    const log = path.join(dataDir, "logs", "strata.log");
    if (fs.existsSync(log)) console.log(`The app logged:
${fs.readFileSync(log, "utf8")}`);
    fs.rmSync(work, { recursive: true, force: true });
  }
}
