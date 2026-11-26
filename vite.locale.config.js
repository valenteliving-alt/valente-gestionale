import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
// Build del file unico da scaricare sul PC (poi si inlinea lo script, vedi strumenti/fatturazione-locale.sh)
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist-locale', emptyOutDir: true, assetsInlineLimit: 100000000, cssCodeSplit: false,
    rollupOptions: { input: fileURLToPath(new URL('./fatturazione-locale.html', import.meta.url)), output: { inlineDynamicImports: true } } },
})
