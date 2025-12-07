import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,          // optional: Vite default port
    open: true,          // optional: auto-open browser
    proxy: {
      '/odata': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      // Forward all API calls to CAP backend
     /* '/odata': {
        target: 'http://localhost:4004',
        changeOrigin: true,
      }*/
    }
  }
})