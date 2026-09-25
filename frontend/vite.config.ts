import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Keep API requests on the page's origin, including browsers on other LAN devices.
const proxy = {
  '/api': {
    target: process.env.QKD_API_TARGET || 'http://127.0.0.1:8000',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api(?=\/|$)/, ''),
  },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
