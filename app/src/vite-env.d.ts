/// <reference types="vite/client" />

/** App version from package.json, set at build time in vite.config.ts. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** "1" only in builds made for the end-to-end test (e2e/): enables its stand-ins for file dialogs. */
  readonly VITE_E2E?: string;
}
