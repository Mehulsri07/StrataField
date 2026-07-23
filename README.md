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

## 🛠️ Tech Stack

* **Frontend UI:** React, TypeScript
* **Desktop Framework:** Electron
* **Database:** SQLite
* **Styling:** CSS3 / Styled Components 

## 📦 Getting Started

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/Mehulsri07/StrataField.git](https://github.com/Mehulsri07/StrataField.git)
