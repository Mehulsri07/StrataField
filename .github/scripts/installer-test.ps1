# Clean-machine test of the StrataField installer (run on a fresh GitHub Windows runner).
#
#   1. Silent install for the current user; the app, its Start menu shortcut and the getting-started
#      guide (with its own shortcut) exist.
#   2. First start: the window stays open and the shared database is created.
#      Records how long that took and how much memory the app uses (with its WebView2 processes).
#   3. Second start: opens the existing database.
#   4. Installing again over the top (an upgrade) keeps the data.
#   5. Uninstalling removes the app and the guide's shortcut but keeps the data in %APPDATA%\Strata.
#
# Figures go to the job summary so each run shows installer size, installed size, start-up time and memory.
param([Parameter(Mandatory)] [string] $Installer)

$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:LOCALAPPDATA 'StrataField'
$exePath = Join-Path $installDir 'stratafield.exe'
$db = Join-Path $env:APPDATA 'Strata\strata.db'

function Step($text) { Write-Host "`n== $text" }
function Fail($text) { throw "FAILED: $text" }

function Install {
  $p = Start-Process $Installer -ArgumentList '/S' -Wait -PassThru
  if ($p.ExitCode -ne 0) { Fail "installer exited with code $($p.ExitCode)" }
  if (-not (Test-Path $exePath)) { Fail "app not found at $exePath after installing" }
}

# Memory of the app and every process it started (WebView2 browser, renderer, GPU...), in MB.
function TreeMemoryMB([int] $rootId) {
  $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
  $ids = [System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add($rootId)
  do {
    $added = 0
    foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $added++ } }
  } while ($added -gt 0)
  $procs = $ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }
  [pscustomobject]@{
    Processes  = @($procs).Count
    WorkingSet = [math]::Round((($procs | Measure-Object WorkingSet64 -Sum).Sum) / 1MB)
    Private    = [math]::Round((($procs | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1MB)
  }
}

# Starts the app, waits for the database, and checks it stays open. Returns the running process.
function Start-App([int] $waitSeconds = 90) {
  $clock = [Diagnostics.Stopwatch]::StartNew()
  $app = Start-Process $exePath -PassThru
  while (-not (Test-Path $db) -and $clock.Elapsed.TotalSeconds -lt $waitSeconds -and -not $app.HasExited) { Start-Sleep -Milliseconds 200 }
  $ready = $clock.Elapsed.TotalSeconds
  if (-not (Test-Path $db)) { Fail "no database at $db after $waitSeconds s (app exited: $($app.HasExited))" }
  Start-Sleep -Seconds 12
  if ($app.HasExited) { Fail "the app closed by itself (exit code $($app.ExitCode))" }
  [pscustomobject]@{ Process = $app; ReadySeconds = [math]::Round($ready, 1) }
}

function Stop-App($app) {
  # Close the window the way a user would, so the app can make its exit-time backup; force if it hangs.
  [void]$app.CloseMainWindow()
  if (-not $app.WaitForExit(20000)) { Stop-Process -Id $app.Id -Force; Start-Sleep -Seconds 2 }
}

$installerMB = [math]::Round((Get-Item $Installer).Length / 1MB, 2)

Step "1. Install"
if (Test-Path $db) { Fail "this machine already has StrataField data; the test needs a clean machine" }
Install
$shortcut = Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs" -Recurse -Filter 'StrataField*.lnk' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $shortcut) { Fail "no Start menu shortcut" }
$installedMB = [math]::Round(((Get-ChildItem $installDir -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB, 2)
Write-Host "Installed to $installDir ($installedMB MB); shortcut $($shortcut.FullName)"
$guide = Join-Path $installDir 'Getting started.html'
if (-not (Test-Path $guide)) { Fail "the getting-started guide was not installed ($guide)" }
$guideShortcut = Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs" -Recurse -Filter 'Getting started with StrataField.lnk' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $guideShortcut) { Fail "no Start menu shortcut to the getting-started guide" }
Write-Host "Guide installed, with Start menu shortcut $($guideShortcut.FullName)"

Step "2. First start"
$first = Start-App
$memory = TreeMemoryMB $first.Process.Id
Write-Host "Database ready after $($first.ReadySeconds) s; memory $($memory.WorkingSet) MB working set, $($memory.Private) MB private, $($memory.Processes) processes"
Stop-App $first.Process

Step "3. Second start"
$second = Start-App 30
Write-Host "Opened again after $($second.ReadySeconds) s"
Stop-App $second.Process

Step "4. Install again over the top (upgrade)"
$hash = (Get-FileHash $db).Hash
Install
if (-not (Test-Path $db)) { Fail "the database disappeared when installing over the top" }
if ((Get-FileHash $db).Hash -ne $hash) { Fail "installing over the top changed the database" }
$third = Start-App 30
Stop-App $third.Process
Write-Host "Data kept, and the app still starts"

Step "5. Uninstall"
$uninstaller = Join-Path $installDir 'uninstall.exe'
if (-not (Test-Path $uninstaller)) { Fail "no uninstaller at $uninstaller" }
# _?= makes the NSIS uninstaller run in place and wait until it has finished.
$p = Start-Process $uninstaller -ArgumentList '/S', "_?=$installDir" -Wait -PassThru
if ($p.ExitCode -ne 0) { Fail "uninstaller exited with code $($p.ExitCode)" }
if (Test-Path $exePath) { Fail "the app is still there after uninstalling" }
if (-not (Test-Path $db)) { Fail "uninstalling deleted the user's data" }
if (Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs" -Recurse -Filter 'Getting started with StrataField.lnk' -ErrorAction SilentlyContinue) { Fail "the guide's Start menu shortcut was left behind" }
Write-Host "App removed; data kept at $db"

$summary = @"
### StrataField installer: clean-machine test passed

| | |
|---|---|
| Installer size | $installerMB MB |
| Installed size | $installedMB MB |
| First start (until the database is ready) | $($first.ReadySeconds) s |
| Second start | $($second.ReadySeconds) s |
| Memory after start (app + WebView2) | $($memory.WorkingSet) MB working set, $($memory.Private) MB private, $($memory.Processes) processes |

Install, second start, install over the top and uninstall all passed; uninstalling kept the data in ``%APPDATA%\Strata``.
"@
Write-Host $summary
if ($env:GITHUB_STEP_SUMMARY) { $summary | Out-File $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8 }
