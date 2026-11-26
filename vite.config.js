import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
// Due pagine: il CRM (index.html) e l'app Fatturazione installabile sul telefono (fatturazione.html)
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: {
    main: fileURLToPath(new URL('./index.html', import.meta.url)),
    fatturazione: fileURLToPath(new URL('./fatturazione.html', import.meta.url)),
  } } },
})
