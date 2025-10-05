import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,          // 0.0.0.0 dinler
    port: 5173,          // istersen değiştir
    strictPort: true,    // doluysa port değiştirmesin
    // HMR LAN'da sorun çıkarırsa aktif et:
    // hmr: { host: '192.168.1.34', clientPort: 5173 }
  }
})
