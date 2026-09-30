# Security

## Reporting a problem

If you find a security problem in StrataField, please report it privately: on GitHub, open the
**Security** tab of this repository and choose **Report a vulnerability**. Please don't open a public
issue for it. You'll get a reply within a week.

## What StrataField does to keep data and computers safe

StrataField is a desktop app for Windows. It has no accounts, no server and no telemetry: borewell
data stays on the computer, in `%APPDATA%\Strata`.

### Connections to the internet

The app connects only to these, and only for the purpose given:

| Where | Why | Sent |
|---|---|---|
| `tile.openstreetmap.org` | Online map pictures (when the Lucknow map has not been downloaded) | Which part of the map is shown |
| `nominatim.openstreetmap.org` | "Find from address" | The address typed, at most one lookup a second, cached |
| `github.com` (this repository's releases) | Downloading the Lucknow map; checking for and downloading updates | Nothing about the user or their data |

Everything else works offline. The screens themselves cannot contact other sites. The content
security policy (`app/src-tauri/tauri.conf.json`) only allows the app's own code, images from the
map server, and the app's internal channels. No scripts, frames, plugins or forms from anywhere
else are allowed.

### Files on the computer

- **Only files the user chose.** Commands that read or copy a file from elsewhere on the computer
  only accept a file the user picked in one of the app's file dialogs during that session, of the
  expected kind. Kinds are photos; documents (PDF, Excel, CSV, Word); the older app's data; and
  backups. See `app/src-tauri/src/guard.rs`. Attaching programs or scripts is not possible.
- **Writing** is limited to StrataField's data folder and to files the user picked in a Save dialog.
- **Stored paths cannot escape.** Photos and files are copied into `attachments/`, and the database
  records their paths relative to the data folder. A path that points anywhere else, for example
  `..\` in a damaged or tampered backup, is treated as missing. Such a path is never opened, moved
  or deleted (`managed_path` in `core/db/src/db.rs`, tested in `core/db/tests/database.rs`).
- **Opening files** with their usual program is limited to files in `attachments/`.

### Data safety

- **Upgrades** are made with a backup first. A database from a newer version is refused and left
  untouched.
- **Backups** are checked when they are made and before they are restored. A copy of the current
  data is saved before every restore. Deleted borewells go to the Recycle bin first.
- **The older app's database** is opened read-only when its data is brought over.
- **SQL:** all database queries use parameters. Values are never pasted into SQL text.

### Updates

- **Updates are signed**, and installed copies only accept an update signed with the project's key.
  The public key is in `tauri.conf.json`; the private key is kept outside the repository (see
  README, "Automatic updates").
- **Nothing installs without the user.** An update is offered only after its release is published
  on GitHub, and it installs only when the user chooses **Install and restart**.

### Builds

- **Release builds have no developer tools.** They also have no way to switch on the debugging
  port, and none of the end-to-end test's stand-ins for file dialogs. Those exist only in builds made
  for the test (`STRATA_E2E_DEBUG_PORT`, `VITE_E2E`).
- **Checked for known vulnerabilities.** CI checks every change against published security
  advisories for the libraries used (`npm audit`, `cargo audit`). Dependabot proposes library
  updates every week.

### Problems and support

Errors are written to a small log on the computer (`%APPDATA%\Strata\logs`, at most about half a
megabyte). **Settings & backup → About → Copy details for support** shows the user a summary to
send to whoever supports them: versions, counts, backup status and recent errors. It contains no
borewell details, the user sees exactly what it says first, and the app itself never sends it.

### Known limits

- **The installer is not code-signed yet**, so Windows SmartScreen warns the first time. Updates
  delivered through the app are signed, as described above.
- **Data on disk is not encrypted.** Anyone with access to the Windows account can read it. Use
  Windows sign-in and BitLocker to protect the computer itself.
