import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Shown in the feedback message so a report says which build it came from
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  base: command === 'serve' ? '/' : '/xps-peak-assign/',
  server: { host: true },
}))
