import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Ensure assets resolve when served behind the BTP approuter
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Match approuter routes during local dev
      '/api': {
        target: 'http://localhost:4004',
        changeOrigin: true
      },
      '/odata': {
        target: 'http://localhost:4004',
        changeOrigin: true
      }
    }
  }
})