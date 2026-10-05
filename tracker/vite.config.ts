import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: '../dist/assets',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'ws.ts'),
      name: 'wispstat',
      fileName: () => 'ws.js',
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
