// End-to-end test of the automatic update, run by CI on a clean Windows machine.
//
// CI builds two installers signed with a throwaway test key (never the real one): the current
// version ("old") and a pretend newer one ("new"). This script:
//   1. serves the new one and its latest.json from a small local web server (standing in for
//      GitHub Releases),
//   2. installs the old version and adds a borewell,
//   3. clicks Settings → Check for updates → Install and restart, like a user,
//   4. checks the app updated itself to the new version and the borewell is still there.
//
// Needs: UPDATE_OLD_INSTALLER, UPDATE_NEW_INSTALLER (with .sig next to it), UPDATE_NEW_VERSION.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { check, connect, disconnect, page, results, sleep, startApp, workFolder } from "./harness.mjs";

const oldInstaller = process.env.UPDATE_OLD_INSTALLER;
const newInstaller = process.env.UPDATE_NEW_INSTALLER;
const newVersion = process.env.UPDATE_NEW_VERSION;
const PORT = 8765;
if (!oldInstaller || !newInstaller || !newVersion) throw new Error("Set UPDATE_OLD_INSTALLER, UPDATE_NEW_INSTALLER and UPDATE_NEW_VERSION");

const work = workFolder();
const dataDir = path.join(work, "Strata");
const legacyRoot = path.join(work, "roaming");
fs.mkdirSync(legacyRoot, { recursive: true });
const installDir = path.join(process.env.LOCALAPPDATA, "StrataField");
const exe = path.join(installDir, "stratafield.exe");
const versionOf = (file) => execFileSync("powershell", ["-NoProfile", "-Command", `(Get-Item '${file}').VersionInfo.ProductVersion`], { encoding: "utf8" }).trim();

// 1. The pretend release server.
const served = {
  "/latest.json": JSON.stringify({
    version: newVersion,
    notes: `StrataField ${newVersion} (update test)`,
    pub_date: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    platforms: { "windows-x86_64": { signature: fs.readFileSync(`${newInstaller}.sig`, "utf8").trim(), url: `http://127.0.0.1:${PORT}/new-setup.exe` } },
  }),
  "/new-setup.exe": fs.readFileSync(newInstaller),
};
const requests = [];
const server = http.createServer((req, res) => {
  requests.push(req.url);
  const body = served[req.url];
  if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": req.url.endsWith(".json") ? "application/json" : "application/octet-stream", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

let app;
try {
  // 2. Install the old version and give it some data.
  const install = spawnSync(oldInstaller, ["/S"], { stdio: "ignore" });
  check("The current version installs", install.status === 0 && fs.existsSync(exe), `exit ${install.status}`);
  const before = versionOf(exe);

  process.env.STRATA_EXE = exe;
  app = startApp({ dataDir, legacyRoot });
  await connect({ app, dataDir });
  const created = await page(`
    const b = await __t.invoke('borewell_create', { input: { borewellId: 'UPDATE-1', ownerName: 'Update Test', project: 'Zone U', area: 'Aliganj', city: 'Lucknow', date: '2026-09-30', totalDepth: 120, waterLevel: 40 } });
    return { id: b.id, version: (await __t.invoke('app_info')).version };`);
  check("The installed app starts and saves a borewell", !!created.id, `version ${created.version}`);

  // 3. Check for updates and install, like a user.
  const offered = await page(`
    location.hash = '#/settings';
    (await __t.until(() => __t.btn('Check for updates'), 10000)).click();
    // The offer can come from Settings or from the daily check's notice at the top; either shows the version.
    const install = await __t.until(() => [...document.querySelectorAll('main button')].find(b => b.innerText.startsWith('Install and restart')), 30000);
    const shown = (__t.text().match(/StrataField [0-9.]+ is available|Install and restart [(][0-9.]+[)]/g) ?? []).join('; ');
    install.click();
    return shown;`).catch((e) => `error: ${e.message}`);
  check("Settings finds the newer version", offered.includes(newVersion), `${offered}; server saw ${requests.join(", ")}`);

  // The app downloads the installer, closes and runs it; wait for the new version to be in place.
  const end = Date.now() + 4 * 60 * 1000;
  let after = before;
  while (Date.now() < end) {
    await sleep(3000);
    try { after = versionOf(exe); } catch { /* mid-install */ }
    if (after === newVersion) break;
  }
  check("Install and restart downloads the update and installs it", after === newVersion, `before ${before}, after ${after}; server saw ${requests.join(", ")}`);

  // 4. The updated app opens with the data intact.
  disconnect();
  try { execFileSync("taskkill", ["/IM", "stratafield.exe", "/F"], { stdio: "ignore" }); } catch { /* not running */ }
  await sleep(2000);
  app = startApp({ dataDir, legacyRoot });
  await connect({ app, dataDir });
  const reopened = await page(`
    const r = await __t.invoke('borewell_get', { id: '${created.id}' });
    return { version: (await __t.invoke('app_info')).version, owner: r.borewell.ownerName };`);
  check("The updated app opens with its data", reopened.version === newVersion && reopened.owner === "Update Test", JSON.stringify(reopened));
} catch (e) {
  check("Update test finished", false, String(e));
} finally {
  disconnect();
  try { execFileSync("taskkill", ["/IM", "stratafield.exe", "/F"], { stdio: "ignore" }); } catch { /* not running */ }
  server.close();
  const failed = results.filter((r) => !r.ok).length;
  const summary = `${results.length - failed} passed, ${failed} failed`;
  console.log(`\n${summary}. Scratch data: ${work} (${os.hostname()})`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### Automatic update test: ${summary}\n\n| | Check |\n|---|---|\n${results.map((r) => `| ${r.ok ? "✅" : "❌"} | ${r.name} |`).join("\n")}\n`);
  }
  process.exit(failed ? 1 : 0);
}
