// Drives the real StrataField app (Rust + screens) for end-to-end tests.
//
// The app is started on a scratch data folder (STRATA_DATA_DIR) with a made-up "older app" database
// (STRATA_LEGACY_ROOT), and its WebView2 window is controlled through the Chrome DevTools protocol.
// Nothing touches the real %APPDATA%\Strata or %APPDATA%\StrataField.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Where test files and the scratch data folder go. */
export function workFolder() {
  const dir = process.env.E2E_WORK ?? path.join(os.tmpdir(), `strata-e2e-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Results ─────────────────────────────────────────────────────────────

export const results = [];
export function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${String(detail).slice(0, 300)})` : ""}`);
}

// ── Starting the app and talking to its window ──────────────────────────

const PORT = Number(process.env.E2E_PORT ?? 9333);

export function startApp({ dataDir, legacyRoot }) {
  const exe = process.env.STRATA_EXE ?? path.join(repo, "target", "debug", "stratafield.exe");
  if (!fs.existsSync(exe)) throw new Error(`Build the app first: ${exe} not found (npm run tauri -w app -- build --debug --no-bundle)`);
  return spawn(exe, [], {
    env: {
      ...process.env,
      STRATA_DATA_DIR: dataDir,
      STRATA_LEGACY_ROOT: legacyRoot,
      // Development builds open the window's debugging port when asked (see open_main_window in
      // app/src-tauri/src/lib.rs); the WebView2 variable covers other builds where Windows allows it.
      STRATA_E2E_DEBUG_PORT: String(PORT),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
    },
    stdio: "ignore",
  });
}

let ws, nextId = 0;
const pending = new Map();

/** Connects to the app window. `app` (the started process) and `dataDir` only improve the error message. */
export async function connect({ app, dataDir } = {}) {
  let lastError = "no answer yet";
  for (let i = 0; i < 240; i++) {
    if (app && app.exitCode !== null) throw new Error(`The app closed during start-up (exit code ${app.exitCode})`);
    try {
      const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = pages.find((p) => p.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
        ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); pending.delete(d.id); };
        // Wait until the app has drawn its screens, then add the helpers.
        for (let j = 0; j < 120; j++) {
          const ready = await raw("document.readyState === 'complete' && !!document.querySelector('main') && !!window.__TAURI_INTERNALS__").catch(() => false);
          if (ready) break;
          await sleep(500);
        }
        await sleep(1000);
        await page_(HELPERS);
        return;
      }
      lastError = `debugging port answered with ${pages.length} targets: ${pages.map((p) => p.type).join(", ")}`;
    } catch (e) {
      lastError = String(e?.cause?.code ?? e);
    }
    await sleep(500);
  }
  const db = dataDir && fs.existsSync(path.join(dataDir, "strata.db")) ? "exists" : "missing";
  try {
    // What the window's browser processes were started with, and which ports they listen on.
    console.log(execFileSync("powershell", ["-NoProfile", "-Command", `
      $p = Get-CimInstance Win32_Process -Filter "name='msedgewebview2.exe'"
      "WebView2 processes: " + @($p).Count
      $main = $p | Where-Object { $_.CommandLine -notmatch '--type=' } | Select-Object -First 1
      "Main process has the debugging option: " + ($main.CommandLine -match 'remote-debugging-port')
      "Main process started with: " + $main.CommandLine
      "Parent of main process: " + (Get-CimInstance Win32_Process -Filter "ProcessId=$($main.ParentProcessId)").Name
      "Environment variable seen by this test: " + [bool]$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
      foreach ($k in 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge', 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge\\WebView2', 'HKCU:\\SOFTWARE\\Policies\\Microsoft\\Edge') {
        if (Test-Path $k) { "Policy " + $k + ": " + ((Get-ItemProperty $k | Select-Object * -ExcludeProperty PS* | ConvertTo-Json -Compress)) }
      }
      $ids = @($p | ForEach-Object { $_.ProcessId })
      "Listening: " + ((Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ids -contains $_.OwningProcess } | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" }) -join ', ')`], { encoding: "utf8" }));
  } catch { /* diagnostics only */ }
  throw new Error(`Could not connect to the app window after 2 minutes (last: ${lastError}; app running: ${app ? app.exitCode === null : "?"}; database ${db})`);
}

export function disconnect() {
  try { ws?.close(); } catch { /* ignore */ }
}

function send(method, params = {}) {
  const i = ++nextId;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((r) => pending.set(i, r));
}

/** Evaluates one expression in the window. Rejects if the page went away while evaluating. */
async function raw(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.error) throw new Error(`The window did not answer: ${r.error.message}`);
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}

/** Runs JavaScript (may use await and `__t` helpers) in the app window and returns its result. */
async function page_(code) {
  try {
    return await raw(`(async () => { ${code} })()`);
  } catch (e) {
    // If the page reloaded while answering, wait for it, put the helpers back and ask once more.
    if (!/did not answer|__t is not defined/.test(String(e))) throw e;
    await sleep(2000);
    await raw(`(async () => { ${HELPERS} })()`);
    return await raw(`(async () => { ${code} })()`);
  }
}
export const page = page_;

// Helpers injected into the page for driving the screens like a user.
const HELPERS = `
  window.__t = {
    wait: (ms) => new Promise(r => setTimeout(r, ms)),
    async until(fn, ms = 8000) { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await this.wait(100); } throw new Error('timed out waiting for: ' + fn.toString().slice(0, 120)); },
    btn: (t, scope = document) => [...scope.querySelectorAll('button, a, [role="tab"]')].find(b => b.textContent.trim().startsWith(t)),
    type(el, v) { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); },
    press(el) { for (const t of ['pointerdown','mousedown','pointerup','mouseup','click']) el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' })); },
    // Lists stay in the page (hidden) after closing, so only look at the one that is showing.
    shownOptions: () => [...document.querySelectorAll('[role="option"]')].filter(o => o.getClientRects().length && !o.closest('[hidden], [data-closed]')),
    async choose(trigger, label) {
      await this.until(() => this.shownOptions().length === 0, 3000).catch(() => {});
      this.press(trigger);
      const opt = await this.until(() => this.shownOptions().find(o => o.textContent.trim() === label));
      await this.wait(150); this.press(opt);
      await this.until(() => this.shownOptions().length === 0, 3000).catch(() => {});
      await this.wait(150);
    },
    // A save made this way goes round the screens, so they are told the data changed, as a screen
    // tells them after saving. Commands that only read (…_list, …_get and so on) change nothing.
    async invoke(cmd, args) {
      const out = await window.__TAURI_INTERNALS__.invoke(cmd, args);
      if (!/_(list|get|search|status|recent|unlinked|info)$/.test(cmd)) window.__STRATA_TEST_CHANGED__?.();
      return out;
    },
    text: () => document.querySelector('main')?.innerText ?? '',
  };
  return true;`;

// ── The Windows "Save As" dialog ────────────────────────────────────────

/**
 * Presses Save in the app's "Save As" dialog, keeping the name and folder the app suggested, by
 * sending one window message to that dialog. No keystrokes and no focus changes, so it cannot affect
 * other windows. Resolves to "answered" or what went wrong. (The dialog ignores text set into its
 * file name box from outside, so the suggestion is used; see `newFileIn`.)
 */
export function answerSaveDialog() {
  const ps = `
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class Dlg {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  public static IntPtr Find() { return FindWindow("#32770", "Save As"); }
  public static string Save(IntPtr dlg) {
    if (GetDlgItem(dlg, 1) == IntPtr.Zero) return "no save button";
    PostMessage(dlg, 0x0111, (IntPtr)1, GetDlgItem(dlg, 1));   // WM_COMMAND IDOK = press Save
    return "answered";
  }
}
'@
$end = (Get-Date).AddSeconds(30); $h = [IntPtr]::Zero
while ($h -eq [IntPtr]::Zero -and (Get-Date) -lt $end) { Start-Sleep -Milliseconds 300; $h = [Dlg]::Find() }
if ($h -eq [IntPtr]::Zero) { Write-Output 'no dialog'; exit 1 }
Start-Sleep -Milliseconds 1000
Write-Output ([Dlg]::Save($h))`;
  return new Promise((resolve) => {
    const p = spawn("powershell", ["-NoProfile", "-Command", ps], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", () => resolve(out.trim()));
  });
}

/** Closes a leftover "Save As" dialog (Cancel), so a failed step does not block the next ones. */
export function cancelSaveDialog() {
  try {
    execFileSync("powershell", ["-NoProfile", "-Command", `
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class C { [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int m, IntPtr w, IntPtr l); }
'@
$h = [C]::FindWindow('#32770', 'Save As'); if ($h -ne [IntPtr]::Zero) { [void][C]::PostMessage($h, 0x0111, [IntPtr]2, [IntPtr]::Zero) }`], { stdio: "ignore" });
  } catch { /* nothing to close */ }
}

/** Waits for a new file in `dir` whose name matches `pattern` (made after `since`); returns its path and bytes. */
export async function newFileIn(dir, pattern, since, ms = 45000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = fs.existsSync(dir) && fs.readdirSync(dir)
      .map((n) => path.join(dir, n))
      .find((p) => pattern.test(path.basename(p)) && fs.statSync(p).mtimeMs >= since - 1000 && fs.statSync(p).size > 0);
    if (hit) { await sleep(700); return { file: hit, bytes: fs.readFileSync(hit) }; }
    await sleep(300);
  }
  return null;
}

export async function waitForFile(file, ms = 45000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fs.existsSync(file) && fs.statSync(file).size > 0) { await sleep(700); return fs.readFileSync(file); }
    await sleep(300);
  }
  return null;
}
