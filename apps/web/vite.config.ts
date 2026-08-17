import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  // As variaveis VITE_* moram no .env da raiz do monorepo.
  const raiz = resolve(process.cwd(), '../..');
  const env = loadEnv(mode, raiz, 'VITE_');

  return {
    plugins: [react()],
    envDir: raiz,
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL ?? 'http://localhost:3333'),
    },
    server: {
      port: 5173,
      strictPort: false,
    },
    preview: { port: 4173 },
    build: { outDir: 'dist', sourcemap: true },
  };
});
