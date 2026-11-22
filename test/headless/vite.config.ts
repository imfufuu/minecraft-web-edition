import { defineConfig } from 'vite';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: [{ find: /^three$/, replacement: path.resolve(import.meta.dirname, 'three-stub.ts') }] },
  build: { ssr: path.resolve(import.meta.dirname, 'entry.ts'), outDir: path.resolve(import.meta.dirname, '../../.smoke-out'), emptyOutDir: true, rollupOptions: { external: [/^three\/src/] } },
  logLevel: 'error',
  define: { __BUILD_ID__: JSON.stringify('test') },
});
