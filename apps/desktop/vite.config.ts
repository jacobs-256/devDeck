import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: false,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    outDir: 'dist',
    target: 'safari15',
    sourcemap: false,
    // Tools are lazy-loaded chunks; a few (terser, pinyin) are intentionally large.
    chunkSizeWarningLimit: 700,
  },
});
