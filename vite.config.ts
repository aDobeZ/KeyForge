import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/pwa',
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});
