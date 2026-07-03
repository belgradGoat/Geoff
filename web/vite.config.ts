import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Prefer the publicly-trusted Tailscale cert (matches the MagicDNS hostname that the
// iOS app and remote browsers connect to) so hostname access has no cert warning.
// Fall back to the self-signed IP cert (cert.pem) for plain localhost/IP use.
const tsCert = path.resolve(__dirname, '../certs/tailscale.crt')
const tsKey = path.resolve(__dirname, '../certs/tailscale.key')
const useTailscale = fs.existsSync(tsCert) && fs.existsSync(tsKey)
const certPath = useTailscale ? tsCert : path.resolve(__dirname, '../certs/cert.pem')
const keyPath = useTailscale ? tsKey : path.resolve(__dirname, '../certs/key.pem')
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
