import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/state': 'http://127.0.0.1:8000',
      '/events': 'http://127.0.0.1:8000',
      '/actions': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/interventions': 'http://127.0.0.1:8000',
      '/simulation': 'http://127.0.0.1:8000',
      '/workflow': 'http://127.0.0.1:8000',
    },
  },
})
