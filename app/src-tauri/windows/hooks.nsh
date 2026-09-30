; Extra installer steps (Tauri NSIS hooks): a Start menu shortcut to the getting-started guide that
; is installed with the app, next to the StrataField shortcut. Removed again when uninstalling.

!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$SMPROGRAMS\StrataField"
  CreateShortCut "$SMPROGRAMS\StrataField\Getting started with StrataField.lnk" "$INSTDIR\Getting started.html"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$SMPROGRAMS\StrataField\Getting started with StrataField.lnk"
  RMDir "$SMPROGRAMS\StrataField"
!macroend
