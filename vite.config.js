import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any static host path (e.g. GitHub Pages).
  base: './',
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: { main: 'index.html', viewer: 'viewer.html' },
    },
  },
});
