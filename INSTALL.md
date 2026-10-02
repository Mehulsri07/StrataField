# Installing StrataField

For people who will use StrataField on their computer.

## What you need

- A Windows 10 or Windows 11 computer.
- Internet for the first install only if the computer has never had Microsoft Edge updates
  (almost every Windows 10 and 11 computer already has what StrataField needs).

## Install

1. Download **StrataField_x.y.z_x64-setup.exe** (your administrator or the project's GitHub
   Releases page gives you this file).
2. Double-click it.
3. If Windows shows **"Windows protected your PC"**, choose **More info**, then **Run anyway**.
   Windows shows this for new programs that are not yet signed. It is expected.
4. Follow the installer. It does not ask for an administrator password; StrataField is installed
   just for you.
5. Open **StrataField** from the Start menu. **Getting started with StrataField**, a short guide
   you can print, is in the Start menu too, and in the app under Settings & backup → About.

## The first time it opens

If this computer had the older StrataField, your borewells are brought over automatically and a
message says how many. The older app's file is only read, never changed.

## Where your data is

Your borewells, photos and files are kept in `%APPDATA%\Strata` (Settings & backup shows the exact
folder and has a button to open it). StrataField makes a backup every day by itself and keeps the
last 10. To protect against the computer failing, choose a USB drive or cloud folder under
**Settings & backup → A second copy of your backups**: every backup is then copied there too.

## Updating

StrataField checks for a newer version once a day. When there is one, choose **Install and
restart**; you can also use **Settings & backup → About → Check for updates**. Your data stays as it
is, and a backup is made before anything is upgraded. (Copies from version 1.0.0 need the newer
installer run once by hand; after that, updates are automatic.)

## Using it without internet

Everything works without internet except looking up an address. To see streets on the map without
internet, download the map once: **Settings & backup → Map without internet → Download the Lucknow
map** (about 6 MB).

## Uninstalling

Use **Settings → Apps → StrataField → Uninstall**. The app is removed but **your data is kept** in
`%APPDATA%\Strata`, so reinstalling brings everything back. To remove the data too, delete that
folder yourself after making a copy you are sure you do not need.
