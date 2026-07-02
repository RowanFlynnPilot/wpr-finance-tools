import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base MUST match the repo name — GitHub Pages serves from /wpr-finance-tools/.
// Rename the repo, change this, or every asset 404s.
export default defineConfig({
  plugins: [react()],
  base: '/wpr-finance-tools/',
})
