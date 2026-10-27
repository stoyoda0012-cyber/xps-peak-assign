import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  // Shown in the feedback message so a report says which build it came from
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // GitHub Pages serves the site under /xps-peak-assign/. The dev server runs
  // at /. `vite preview` also reports command 'serve', but it serves dist/,
  // which was built for /xps-peak-assign/, so it must use the same base.
  base: command === 'serve' && !isPreview ? '/' : '/xps-peak-assign/',
  server: { host: true },
}))
