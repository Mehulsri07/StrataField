# Changes

What changed in each version of StrataField, in plain words. The newest is at the top. The section
for a version is copied into its GitHub release notes, so write it for the people who use the app.

## [Unreleased]

### New
- **Edit details keeps what you typed.** Leaving the screen before saving no longer loses your
  changes. They are there when you open Edit details for that borewell again, with a button to
  discard them.

### Fixed
- **A new borewell is saved in one go.** Its details, layers and pipes are saved together, so a
  problem part-way can no longer leave a borewell without its layers, or add it a second time when
  you press Save again. A photo or file that cannot be copied is named, and the borewell is saved
  without it.

## [1.0.13] - 2026-10-06

### Fixed
- **New borewell opened as a blank white screen** when an unfinished borewell had been left in the
  form by an older version, from before the pump boxes were added. The unfinished borewell now
  opens as it was, with the newer boxes empty.
- **A screen that fails no longer blanks the window.** It says so, offers to try again and to open
  the error log, and the menu keeps working.

## [1.0.12] - 2026-10-05

### New
- **Check many files at once on Import.** Every chosen file is a row in one table, where you can
  type its borewell ID, owner, zone and location without opening it. **A zone for every file**
  fills the zone in for all of them. Click a file's name to see its depths, pump and drawing below.
- **Two logs on one sheet.** A sheet with a second log under the first now gives two rows, one per
  borewell. A second log that is the first one drawn again (the same layers, or no site of its own)
  is listed but left unticked.
- **Notes beside a soil.** "Good", "Moderate" and the like, written next to a soil on a log, are kept
  as that layer's note.
- **Add locations one after another.** A new screen goes through every borewell without a location:
  the map opens with its address (or site name) already searched, you click the spot, and the next
  one comes up. Reach it from "without a location" on Home or **Add their locations** after
  importing.

## [1.0.11] - 2026-10-05

### Changed
- **The PDF report of a borewell reads better on paper.**
  - The drawing's column is headed **STRATA**, each layer's name is written on the layer, and the
    depth marks are where the layers change (0, 10, 60, 110...) instead of every 50 ft. A layer too
    thin to write on has its name and depths beside it.
  - A small street map shows where the borewell is, when it has a location and there is internet.
    Reports of more than 20 borewells at once leave the maps out.
  - **Pipe pieces** is now the number of 10 ft lengths: the tubewell's depth divided by 10, rounded up.
  - The top of each page and the footer give the date the borewell was drilled, not the date the
    report was made.
  - The details take less room, two to a row, and long names run onto a second line instead of
    being cut off.
  - **The DWO letterhead.** Each report carries the Drinking Water Organisation logo, address,
    phone numbers and GSTIN across the top and "Sustaining Life Through Water." at the foot, as on
    the printed letterhead. Change the wording, or switch the logo off, under
    **Settings & backup → Report letterhead**.
  - **Nearby borewells.** A report of up to 20 borewells lists the closest ones within 1 km, with
    how far away they are, their depth and their water level.
  - **Lines to sign**, for the client and the driller, at the end.
  - When no layer has notes, the layers and the pipes sit side by side, which keeps most reports
    on one sheet.
- **The pump is drawn on the borewell.** A marker in the pipe at the depth the pump was lowered to,
  on the borewell's page and in the report.
- **Save as picture** draws the borewell the same way.
- **"Date drilled" is now "Tubewell lowering date"** everywhere: the form, the borewell's page,
  the lists, Import, the PDF report and the Excel export. It is the same date as before under a
  new name; nothing you entered changes.

## [1.0.10] - 2026-10-04

### Changed
- **Pump company and model are chosen from lists.** The pump now has a **Pump company** box and a
  **Pump model** box, both dropdowns. The model list shows the models you have already used from
  the chosen company. Each list, and the pump type's, ends with **Add a new…** for anything not on
  it yet; once saved it is on the list. Pumps already recorded as "KSB 12C/17" in one box are split
  into company and model when the borewell is opened for editing, and Import splits them as it
  reads a log. The Excel export has a **Pump company** column.

## [1.0.9] - 2026-10-04

### New
- **Pump details.** A borewell now records its pump: the type, the make and model, the power in HP
  and how deep it was lowered. Fill them in on the **Drilling & water** step; the fields suggest the
  usual types, makes and powers, and models you have typed before. They show on the borewell's page
  and in its PDF report and Excel export. A pump lowered above the water level, or deeper than the
  borewell, is pointed out.
- **Import reads the pump.** The "Pump Lowering = 250 ft" and "Pump = KSB 12C/17 , 5 HP" lines on a
  drilling log are read into the lowering, the power and the model, shown for checking before you
  import.

- **Add the location while importing.** The Import screen has a **Location** box for each file:
  paste the coordinates or use **Pick on the map**, which opens with the file's address searched.
  It is optional; a borewell imported without one can still be given a location later.

- **Zone while importing.** The Import screen also has a **Zone** box for each file.

### Changed
- **Import waits for you to check guessed columns.** A file laid out differently is no longer
  imported until you have looked at the columns StrataField guessed and clicked **These columns
  are right, import this file**. The column choices now show each column's heading and say what
  they mean in plainer words.
- **After importing**, a link leads straight to the borewells that still need a location, and the
  Import button is gone when no file on the list can be imported.
- **New borewell is easier to get right.** Every step can be opened at any time. Each problem on
  the Check step says which box it is about ("Hole size: type a number here.") and takes you there
  when clicked. Notes such as "The owner's name is empty" no longer appear before you have typed
  anything. The Zone box explains what a zone is and says when it was carried over from the last
  borewell. The Location step has three ways to choose from instead of four.
- **Tidier screens.** Section headings and the lines under them now sit level across a screen,
  every screen starts at the same left edge and no longer shifts when a scrollbar appears, the
  Borewells list keeps each row to one height, and the borewell card on the Map no longer covers the
  map's buttons.
- **Water colours stay within 500 m of a borewell.** The Map used to colour up to about 3 km around
  each borewell. An estimate that far away says little, so colours now reach 500 m and are drawn
  finer. Zoom in to see them.

## [1.0.8] - 2026-10-03

### New
- **Search for a place when picking a location.** The map you pick a borewell's position on now has
  a search box, like the one in Google Maps: type a place, colony or road, choose from the matches
  as they appear, and the map goes there. Then click the exact spot. Places in and around Lucknow
  are listed first. Needs internet.

### Changed
- **"Look up the address" is now "Search for the address".** It opens the same map with the address
  from the form already searched, so you can see the matches and where they are before using one,
  instead of taking the first match unseen.

## [1.0.7] - 2026-10-03

### New
- **Find what still needs filling in after importing.** A borewell with no owner, water level or
  drilling date now says so in the Borewells list, a **Missing details** button lists just those,
  and Home's "Needs attention" counts them.
- **Import notes are kept.** What the Import screen said about a file (no water level, converted
  from metres, a second log on the sheet...) is saved in that borewell's History.
- **Activity.** A new screen lists every change across all borewells, newest first, with a search box.
- **Open the error log.** Settings & backup → About has a button that opens the log of problems kept
  on this computer.
- **A user manual with pictures.** A PDF that walks through every screen is installed with
  StrataField. Open it from **User manual** at the bottom of the menu, from Settings & backup →
  About, or from the Start menu.

### Changed
- **A new logo.** A block of ground cut open to show its layers, with a borewell core and a location
  pin, on the app's icon, in the menu and on the manual's cover.
- The status in the Borewells list names everything a record lacks ("No location, owner") instead of
  only the first thing.
- Settings & backup → About shows the logo and a short description of StrataField.

## [1.0.6] - 2026-10-03

### Fixed
- **Import Excel reads the whole drilling log.** The owner, address, city, date, hole size, pipe
  size and water level written beside the layers are now filled in (they were being missed).
- **Thick layers come in as one layer.** A log written in 10 ft steps no longer turns "Clay, Clay,
  Clay" into three layers; rows of the same soil that touch are joined. Pipes are joined the same way.
- **Plain pipe is no longer missed.** Screens and plain pipe sit in neighbouring columns in the
  logs, and only the screens were being read.
- **Logs drawn to scale are read.** Some logs write each soil once inside its layer, with the depth
  where it ends beside it ("16 mt"), instead of a row every 10 ft. These used to fail; now they
  import, pipes included.
- **Logs in metres.** A unit written beside a depth ("16 mt", "370 ft") now decides feet or metres,
  and the total depth and water level are converted to feet along with the layers.
- **Site, address and city.** A site written over four lines (name, address, area, city) no longer
  puts the area in City; the last line is the city and the lines between are the address.
- **Pipes in logs with a row per 3 m pipe.** The pipe is now read against its own depths (the
  assembly column), so screens between soil changes are no longer lost.
- **More layouts read.** A log with the pipe list on the left and the soil chart on the right, a
  sheet that starts with a pipe-only page, a site name written on the same line as "Site:", and
  hole and pipe sizes written only under the headings.
- Depths converted from metres are rounded to a tenth of a foot.
- An imported borewell's ID starts as the file's name; the site name goes into Owner.

## [1.0.5] - 2026-10-02

### Changed
- **Home no longer repeats the Map.** In its place: **Water level over the years**, a chart of the
  typical water level each year (a falling line means the water is getting deeper), with the years
  your chosen period uses shaded; and **By zone**, a table of each zone's borewells, typical depth
  and typical water level. Click a zone to see its borewells. The map is one click away in the sidebar.

## [1.0.4] - 2026-10-02

### New
- **Import Excel files in other layouts.** When a file is not laid out like the usual drilling log,
  StrataField guesses which columns hold the depths and soil names, shows the start of the file,
  and lets you correct the choice (including a "from" depth, pipe type, and feet or metres).
- **Rename and merge zones.** **Settings & backup → Zones** lists your zones. Rename one to fix its
  spelling, or rename it to another zone's name to merge the two.

### Changed
- **Home says more at a glance.** The heading now tells you how many borewells you have and how deep
  the water typically is. The map is taller, and the newest borewells are drawn side by side as
  columns on one depth scale, with their water levels, instead of a table.
- **Water levels from years ago no longer blur today's picture.** The water colours on the map and
  the "typical water level" on Home use only readings from the last three years before your newest
  one, and say so. Borewells with older readings stay on the map as grey pins. A box on Home and on
  the Map lets you choose the last year, 3 years, 5 years, or all readings; the choice is remembered.
- **Newest borewells on Home** are the most recently drilled, not the most recently typed in or
  imported.
- **Borewells at the same spot.** Clicking a numbered group on the map that zooming cannot separate
  now lists the borewells there, newest first, so each one can be opened.

### Fixed
- Import Excel: the borewell details are no longer squeezed on a laptop-sized window.

## [1.0.3] - 2026-10-02

### Changed
- **A calmer, simpler look.** One white working area with thin lines instead of grey with white boxes,
  one typeface, and colour kept for what matters: soil layers, water, and the main button.
- **Search moved to the sidebar.** "Find a borewell" (Ctrl+K) and the light/dark switch are now in the
  sidebar, so the bar across the top is gone and every screen has more room.
- **Home is shorter.** The four shortcut boxes are gone (the sidebar already has them); **New borewell**
  and **Import Excel** are buttons at the top right, and the counts are one quiet row.
- **The steps of New borewell** are plain numbered words with a line under the current one.

### Fixed
- In the layer popup, the label at the top right (for example "Estimate") no longer sits under the
  close button.

## [1.0.2] - 2026-09-30

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

### Faster
- Much quicker with thousands of borewells: the Borewells list shows 200 at a time with **Show more**,
  Home and the Map draw water colours several times faster, and a cross-section with very many
  borewells nearby draws the closest ones (it says how many).

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
