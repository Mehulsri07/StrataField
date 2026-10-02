// Performance test: how the screens cope with 5,000 borewells (about 55,000 layers).
//
// Starts the app on a scratch data folder, loads made-up borewells spread over Lucknow in one
// import, then times the screens people use most. Each has a limit; slower counts as a failure.
// Also records memory. Run after a debug build (see run.mjs), e.g. `npm run perf`.
//
// Limits: what a user would notice as slow, with room for GitHub's machines, whose speed varies by
// about 1.6x from run to run (the same code measured 1.9 s and 3.1 s for the list). The numbers in
// the run summary show the trend; a limit only fails when something is clearly slower.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { check, connect, disconnect, page, results, sleep, startApp, workFolder } from "./harness.mjs";

const COUNT = Number(process.env.PERF_BOREWELLS ?? 5000);
const work = workFolder();
const dataDir = path.join(work, "Strata");
const legacyRoot = path.join(work, "roaming");
fs.mkdirSync(legacyRoot, { recursive: true });
const app = startApp({ dataDir, legacyRoot });
const timings = [];

/** Runs `code` in the window (it returns once the screen is ready) and checks it took at most `limitMs`. */
async function timed(name, limitMs, code) {
  const r = await page(`const t0 = performance.now(); const detail = await (async () => { ${code} })(); return { ms: Math.round(performance.now() - t0), detail };`);
  timings.push({ name, ms: r.ms, limitMs });
  check(`${name}: ${r.ms} ms (limit ${limitMs} ms)`, r.ms <= limitMs, r.detail ?? "");
  return r;
}

function memoryMB(pid) {
  const ps = `
    $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
    $ids = [System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add(${pid})
    do { $n = 0; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $n++ } } } while ($n -gt 0)
    $procs = $ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }
    [math]::Round((($procs | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1MB)`;
  return Number(execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim());
}

try {
  await connect({ app, dataDir });

  // Load the borewells: one import, like a big Excel file.
  const loaded = await page(`
    const mats = (await __t.invoke('materials_list')).filter(m => m.lithologyFamily !== 'NONE').map(m => m.id);
    let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const zones = ['Zone 1 · Old City', 'Zone 2 · Aliganj', 'Zone 3 · Gomti Nagar', 'Zone 4 · Alambagh', 'Zone 5 · Indira Nagar'];
    const borewells = [];
    for (let i = 0; i < ${COUNT}; i++) {
      const n = 8 + Math.floor(rnd() * 8), strata = []; let d = 0;
      for (let k = 0; k < n; k++) { const e = d + 10 + Math.round(rnd() * 30); strata.push({ startDepth: d, endDepth: e, materialId: mats[Math.floor(rnd() * mats.length)] }); d = e; }
      borewells.push({
        borewell: { borewellId: 'PERF-' + String(i).padStart(5, '0'), ownerName: 'Owner ' + i, project: zones[i % zones.length], area: 'Area ' + (i % 90), city: 'Lucknow',
          latitude: 26.75 + rnd() * 0.2, longitude: 80.85 + rnd() * 0.2, totalDepth: d, waterLevel: 30 + Math.round(rnd() * 100), date: '2026-0' + (1 + i % 9) + '-15' },
        strata, pipes: [{ startDepth: 0, endDepth: Math.round(d * 0.6), pipeType: 'plain' }, { startDepth: Math.round(d * 0.6), endDepth: d, pipeType: 'slotted' }],
      });
    }
    const t0 = performance.now();
    const r = await __t.invoke('import_save', { request: { fileName: 'performance test', unrecognisedNames: [], resolutions: {}, borewells } });
    return { count: r.borewellIds.length, layers: borewells.reduce((s, b) => s + b.strata.length, 0), ms: Math.round(performance.now() - t0) };`);
  check(`Loaded ${loaded.count} borewells with ${loaded.layers} layers in one import (${loaded.ms} ms)`, loaded.count === COUNT);

  await timed("Borewells list shows", 5000, `
    location.hash = '#/borewells';
    await __t.until(() => document.querySelectorAll('main tbody tr').length > 0 && /Showing \\d+ of ${COUNT}/.test(__t.text()), 30000);
    return document.querySelectorAll('main tbody tr').length + ' rows drawn';`);
  await timed("Search narrows the list", 1500, `
    __t.type(document.querySelector('input[type="search"]'), 'PERF-04321');
    await __t.until(() => document.querySelectorAll('main tbody tr').length === 1, 30000);
    return document.querySelector('main tbody tr').innerText.split('\\t')[0];`);
  await timed("A borewell opens", 1500, `
    document.querySelector('main tbody tr').click();
    await __t.until(() => /PERF-04321/.test(document.querySelector('main h1')?.innerText ?? '') && document.querySelector('svg [role="button"]'), 30000);
    return 'detail with drawing';`);
  await timed("Home shows (numbers, water map, recent)", 6000, `
    location.hash = '#/';
    await __t.until(() => /Recently added/.test(__t.text()) && document.querySelector('main .leaflet-image-layer'), 30000);
    return 'ready';`);
  await timed("Map shows pins and water colours", 7000, `
    location.hash = '#/map';
    // Wait for the Map screen itself (not Home's map, which is still showing for a moment).
    await __t.until(() => /^Map/.test(document.querySelector('main h1')?.innerText ?? ''), 30000);
    await __t.until(() => document.querySelectorAll('.strata-cluster, .leaflet-overlay-pane path.leaflet-interactive').length > 0 && document.querySelector('main .leaflet-image-layer'), 30000);
    return document.querySelectorAll('.strata-cluster').length + ' groups';`);
  await timed("Cross-section draws an example line", 4000, `
    location.hash = '#/section';
    (await __t.until(() => __t.btn('North to south'), 30000)).click();
    const svg = await __t.until(() => [...document.querySelectorAll('svg[aria-label^="Cross-section with"]')].pop(), 30000);
    return svg.getAttribute('aria-label');`);

  await sleep(2000);
  const mb = memoryMB(app.pid);
  check(`Memory with ${COUNT} borewells: ${mb} MB (limit 900 MB)`, mb <= 900);
  timings.push({ name: "Memory (MB, app + WebView2, private)", ms: mb, limitMs: 900 });
} catch (e) {
  check("Performance test finished", false, String(e));
} finally {
  disconnect();
  app.kill();
  await sleep(1000);
  const failed = results.filter((r) => !r.ok).length;
  const summary = `${results.length - failed} passed, ${failed} failed`;
  console.log(`\n${summary}. Scratch data: ${work}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### Performance with ${COUNT} borewells: ${summary}\n\n| | Screen | Time (ms) | Limit |\n|---|---|---|---|\n` +
      timings.map((t) => `| ${t.ms <= t.limitMs ? "✅" : "❌"} | ${t.name} | ${t.ms} | ${t.limitMs} |`).join("\n") + "\n");
  }
  process.exit(failed ? 1 : 0);
}
