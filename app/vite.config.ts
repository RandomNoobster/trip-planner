import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Pre-bundle MapLibre and its React wrapper together so both share one MapLibre instance (and one worker setting).
  optimizeDeps: { include: ['maplibre-gl', 'react-map-gl/maplibre'] },
})
