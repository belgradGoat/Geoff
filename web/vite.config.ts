import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4011,
    host: true,  // Listen on all interfaces (required for Tailscale access)
  },
})
