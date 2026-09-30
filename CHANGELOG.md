# Changes

What changed in each version of StrataField, in plain words. The newest is at the top. The section
for a version is copied into its GitHub release notes, so write it for the people who use the app.

## [Unreleased]

### New
- **A second copy of your backups.** Choose a folder on a USB drive or in OneDrive/Google Drive
  (**Settings & backup → A second copy of your backups**) and every backup is copied there too.
  Home reminds you if copies stop (for example when the USB drive is not plugged in).
- **Cross-sections with bends.** After drawing A to A′, drag the small dot in the middle of the line
  to bend it, for example to follow a road or pass through more borewells. Drag a bend to move it;
  double-click it to remove it. Distances are measured along the bent line.
- **Copy details for support.** If something goes wrong, **Settings & backup → About → Copy details
  for support** gives a short summary to send to whoever helps you: versions, backup status and
  recent errors, with no borewell details. You see it before copying; nothing is sent by itself.
- **Cross-sections as PDF.** **Save as PDF** on the Cross-section screen makes a report: the drawing
  with a key, what the line is, and a table of the borewells used along it.
- **Heights in cross-sections.** Under **More options**, **Show heights above sea level** stands each
  borewell at its ground height and draws the ground's shape, so layers line up by real height.
  Heights come with the app (approximate, from satellite elevation data) and work without internet.

### Fixed
- Importing an Excel log no longer warns about "gaps between layers" when a layer is simply thick.
- The message about data brought over from the older StrataField shows on Home only, with a link to
  choose soil types for names it did not recognise.
- Borewells without a zone show "No zone" (not "Default Project").
- The layer editor fits on a laptop screen (the "Holds water" column was cut off).
- With one borewell on the map, the map shows its surroundings; Home no longer lists the same place
  as both deepest and shallowest water.
- A clearer "Page not found" screen, with a way back to Home.

## [1.0.1] - 2026-09-30

### New
- **Updates by themselves.** StrataField now checks for newer versions once a day and offers
  **Install and restart**. You can also check in **Settings & backup → About**. This is the last
  version you need to install by hand.
- **Map without internet.** Download the Lucknow map once (**Settings & backup → Map without
  internet**, about 6 MB) and the map shows streets even at a site with no internet.
- **Getting-started guide.** A short guide you can print, in the Start menu and in the app
  (**Settings & backup → About**, or **Getting started** at the bottom of the menu).

### Fixed
- The original Excel file of an import is now listed under each imported borewell's **Files**.
- Restoring a backup now also brings back the photos and files of a borewell that had been deleted
  for good.

### Safer
- StrataField only reads files you choose yourself, and only of the expected kind; only photos and
  documents can be attached.
- A damaged or tampered backup can no longer make StrataField move or delete files outside its own
  folder.
- More protection in the app itself, and weekly checks of the libraries it uses for known security
  problems. See [SECURITY.md](SECURITY.md).

## [1.0.0] - 2026-09-30

The first version of the new StrataField: borewells, soil layers, pipes and water levels; the map
with water depths; cross-sections; Excel import and export; PDF reports; backups; and bringing over
the older StrataField's data automatically.
