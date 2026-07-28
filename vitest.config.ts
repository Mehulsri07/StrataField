import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Reuse path aliases from vite.renderer.config.ts.
// We don't include the React plugin — tests run in Node/jsdom and don't
// need the renderer transform. The alias map is the only shared concern.
export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
});
