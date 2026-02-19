import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      // Legacy endpoints for development
      '/ping': { target: 'http://127.0.0.1:5001' },
      '/scanlist': { target: 'http://127.0.0.1:5001' },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
