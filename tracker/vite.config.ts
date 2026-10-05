import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: '../dist/assets',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'em.ts'),
      name: 'wispstat',
      fileName: 'ws',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        passes: 2,
      },
      mangle: {
        toplevel: true,
      },
    },
  },
});
