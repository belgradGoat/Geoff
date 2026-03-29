import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const certPath = path.resolve(__dirname, '../certs/cert.pem')
const keyPath = path.resolve(__dirname, '../certs/key.pem')
const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath)

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4011,
    host: true,  // Listen on all interfaces (required for Tailscale access)
    ...(hasCerts && {
      https: {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      },
    }),
  },
})
