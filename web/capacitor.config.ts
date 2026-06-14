import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor config for the Geoff iOS app.
 *
 * The UI is bundled from `dist/` (origin: capacitor://localhost) so the app
 * launches instantly and survives offline. It talks to the orchestrator over
 * Tailscale via the `VITE_ORCHESTRATOR_URL` baked into the build (see
 * src/lib/orchestrator.ts) — NOT via `server.url`.
 *
 * `allowNavigation` whitelists the Tailscale MagicDNS hosts the WebView may
 * reach. `*.ts.net` covers any tailnet host; add an explicit `100.x.x.x` if you
 * connect by raw Tailscale IP instead of MagicDNS name.
 */
const config: CapacitorConfig = {
  appId: 'com.geoff.app',
  appName: 'Geoff',
  webDir: 'dist',
  server: {
    // Keep the WebView on its bundled origin; only allow it to fetch/WS to the tailnet.
    allowNavigation: ['*.ts.net'],
    iosScheme: 'capacitor',
  },
  ios: {
    contentInset: 'always',
    // Allow mixed content is intentionally NOT set — we require valid TLS (tailscale cert).
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#000000',
      showSpinner: false,
    },
  },
}

export default config
