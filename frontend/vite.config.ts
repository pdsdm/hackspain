import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Vite bloquea hosts que no conoce. Los túneles de demo cambian de subdominio en
    // cada arranque, así que se permite el dominio entero en vez de una URL concreta.
    allowedHosts: ['.trycloudflare.com', '.lhr.life'],
    proxy: {
      '/state': 'http://127.0.0.1:8000',
      '/events': 'http://127.0.0.1:8000',
      '/actions': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/interventions': 'http://127.0.0.1:8000',
      '/simulation': 'http://127.0.0.1:8000',
      '/workflow': 'http://127.0.0.1:8000',
      '/agents': 'http://127.0.0.1:8000',
      '/auth': 'http://127.0.0.1:8000',
    },
  },
})
