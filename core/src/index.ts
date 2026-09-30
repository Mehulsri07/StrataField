/**
 * @strata/core — logic shared by every Strata app.
 * Keep this package free of Tauri, React and Node-only APIs so it runs in the app window and in tests.
 * The Excel parser (and its SheetJS dependency) is a separate entry, `@strata/core/parser`, so
 * screens that do not import Excel files do not load it.
 */
export * from './types';
export * from './constants';
export * from './validation';
export * from './profileUtils';
export * from './layerInfo';
export * from './numbers';
export * from './waterMap';
export * from './section';
export * from './elevation';
