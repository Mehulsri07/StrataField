; Extra installer steps (Tauri NSIS hooks): Start menu shortcuts to the getting-started guide and the
; user manual that are installed with the app, next to the StrataField shortcut. Removed again when
; uninstalling.

!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$SMPROGRAMS\StrataField"
  CreateShortCut "$SMPROGRAMS\StrataField\Getting started with StrataField.lnk" "$INSTDIR\Getting started.html"
  CreateShortCut "$SMPROGRAMS\StrataField\StrataField User Manual.lnk" "$INSTDIR\StrataField User Manual.pdf"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$SMPROGRAMS\StrataField\Getting started with StrataField.lnk"
  Delete "$SMPROGRAMS\StrataField\StrataField User Manual.lnk"
  RMDir "$SMPROGRAMS\StrataField"
!macroend
