import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the same build works at / (local) and /minecraft-web-edition/ (GitHub Pages).
  base: './',
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
});
