/**
 * @strata/core — logic shared by every Strata app.
 * Keep this package free of Tauri, React and Node-only APIs so it runs in the app window and in tests.
 */
export * from './types';
export * from './constants';
export * from './validation';
export * from './profileUtils';
export * from './payloadValidation';
export { parseStrataWorkbook } from './parser/strataFieldParser';
