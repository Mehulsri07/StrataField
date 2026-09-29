# StrataField 🌍

StrataField is the core desktop application of the Strata ecosystem—a specialized platform designed to digitize, analyze, and manage borewell and materials data directly from commercial drilling operations. Built for local desktop environments, it bridges the gap between field data collection and structured digital analysis.

## 🚀 Overview

Handling raw geological data can be messy and inconsistent. StrataField solves this by providing a robust, offline-capable environment to ingest, clean, and classify complex drilling records. It features an intelligent Excel parser and a strict lithology taxonomy, ensuring high data integrity before it ever reaches visualization stages.

## ✨ Key Features

* **Custom Excel Ingestion Parser:** Automates the extraction of field data from raw, multi-borewell spreadsheet logs.
* **Anomaly Detection & Unit Conversion:** Automatically flags inconsistent data entries and standardizes measurements across diverse datasets.
* **Multi-Borewell Sheet Handling:** Seamlessly manages and cross-references data from multiple drilling sites simultaneously.
* **Lithology Taxonomy:** Implements a strict two-family (CLAY/SAND) classification system to accurately categorize extracted materials.
* **Local Data Persistence:** Ensures all sensitive field data is securely stored and managed locally using SQLite.
* **Works Offline:** Everything except address lookup and new map tiles works without internet.

## 🛠️ Tech Stack

* **Desktop:** [Tauri 2](https://tauri.app) (Rust backend, Windows WebView2)
* **Frontend:** React, TypeScript, Vite
* **Styling:** Tailwind CSS with shadcn/ui components
* **Database:** SQLite (native, through Rust)
* **Excel:** SheetJS

> The app is being rebuilt on Tauri on the `tauri-rebuild` branch. The previous Electron version remains on `main` until the new app reaches parity.

## 🗂️ Repository layout

| Folder | Contents |
|---|---|
| `core/` | Shared logic used by every Strata app: data types, validation, material taxonomy, Excel parser, drawing maths. No Tauri, React or Node-only code. |
| `app/` | The StrataField desktop app: React screens in `app/src`, Rust backend in `app/src-tauri`. |

## 📦 Getting Started

**Requirements:** Node.js 22, [Rust](https://rustup.rs) (stable, MSVC), and the Visual Studio C++ Build Tools. WebView2 ships with Windows 10 and 11.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Mehulsri07/StrataField.git
   cd StrataField
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the app in development mode:**
   ```bash
   npm run dev
   ```

4. **Checks:**
   ```bash
   npm run typecheck
   npm run lint
   npm test
   ```
   Rust checks run from `app/src-tauri`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`.

5. **Build the Windows installer** (output in `app/src-tauri/target/release/bundle/nsis`):
   ```bash
   npm run build
   ```
