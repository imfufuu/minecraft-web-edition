import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

function gitShortHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

const buildId = `${gitShortHash()}-${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

export default defineConfig({
  // Relative base so the same build works at / (local) and /minecraft-web-edition/ (GitHub Pages).
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
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
