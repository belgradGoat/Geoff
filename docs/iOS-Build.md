# Geoff iOS app — build & install runbook

This is the hands-on companion to `AppDevelopmentPlan.md`. The web/TypeScript and
orchestrator changes are already implemented in the repo. The steps below are the
machine-specific parts that must run on your Mac (they need Xcode/CocoaPods and your
tailnet) plus the install procedure for a free Apple ID.

## 0. One-time prerequisites

```bash
xcode-select --install                 # Xcode command line tools (if not already)
brew install cocoapods                 # `pod` is required by `cap sync ios`
```

Capacitor + plugins are already in `web/package.json` (Capacitor 8). If `node_modules`
is missing, run `npm install` in `web/`.

## 1. Point the build at your orchestrator (risk F1 — most common failure)

Vite inlines env vars at **build time**, and the bundled app's origin is
`capacitor://localhost`, so the localhost fallback in `src/lib/orchestrator.ts` will
NOT reach your Mac. Set these in `web/.env` (NOT just `.env.example`) before building:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_ORCHESTRATOR_URL=https://<machine>.<tailnet>.ts.net:8080   # HTTPS + MagicDNS name
VITE_ORCHESTRATOR_API_KEY=<your key>
```

Re-run `npm run build && npx cap sync` after ANY change here.

## 2. Valid TLS over Tailscale (risk F2/F5/F12)

iOS App Transport Security rejects the self-signed `certs/cert.pem`. Issue a real cert
for your MagicDNS name (requires HTTPS enabled in the Tailscale admin console + MagicDNS):

```bash
tailscale cert --cert-file certs/tailscale.crt --key-file certs/tailscale.key \
  <machine>.<tailnet>.ts.net
```

`start.sh` now auto-detects `certs/tailscale.crt|key` and prefers them over the
self-signed pair (or set `TLS_CERT`/`TLS_KEY` env vars). These certs last ~90 days and
do NOT auto-renew — add a cron/launchd job to re-run `tailscale cert` and restart.

Use the **MagicDNS name** (not the `100.x.x.x` IP) in `VITE_ORCHESTRATOR_URL`, or the
cert hostname won't match.

## 3. Generate & open the native project

```bash
cd web
npx cap add ios          # creates web/ios/ (runs `pod install`)
npm run ios              # build + cap sync + open Xcode  (alias in package.json)
```

## 4. App Transport Security fallback (only if NOT using a real cert)

If you must keep a self-signed cert, add a host-scoped exception to
`web/ios/App/App/Info.plist` (never `NSAllowsArbitraryLoads`):

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSExceptionDomains</key>
  <dict>
    <key>your-machine.your-tailnet.ts.net</key>
    <dict>
      <key>NSExceptionAllowsInsecureHTTPLoads</key><true/>
      <key>NSIncludesSubdomains</key><true/>
    </dict>
  </dict>
</dict>
```

## 5. Microphone (only if you use voice features — risk F13)

Add to `Info.plist` or the WebView won't get mic access:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Geoff uses the microphone for voice chat with agents.</string>
```

## 6. Sign & install with a free Apple ID (no paid account)

1. In Xcode: target **App → Signing & Capabilities → Team** = your free "Personal Team"
   (Apple ID), Automatic signing, bundle ID `com.geoff.app`.
2. First run: build straight to your plugged-in iPhone from Xcode to verify.
3. For day-to-day use without the 7-day Xcode rebuild: **Product → Archive →
   Distribute App → development**, export the `.ipa`, and install via **SideStore**
   (its desktop helper auto-refreshes the 7-day free-account signature over WiFi).
4. On each update: `npm run build && npx cap sync ios`, re-archive, update via SideStore.
   Keep the bundle ID + Apple ID constant or SideStore treats it as a new app.

## 7. Smoke test (maps to the plan's verification section)

1. iOS Safari → `https://<machine>.<tailnet>.ts.net:8080/health` shows a valid lock
   (proves TLS/ATS). No lock = TLS issue; unreachable = Mac asleep / Tailscale off.
2. Launch app: task list loads (Supabase), Chat connects (`[WS] Connection opened`).
3. **Background test:** start a chat reply, lock the phone ~60s, reopen. The app should
   NOT reload from scratch, should log `[RESUME] Reconnecting after app resume`, and the
   assistant output produced while away should appear via catch-up (no gap). Toggle
   airplane mode to exercise the `network online` path too.
4. Regression: `npm run dev` in a desktop browser still works (the `visibilitychange`
   fallback path is preserved).

## What was already changed in-repo

- `web/capacitor.config.ts` — Capacitor config (bundled `dist/`, `*.ts.net` nav allow-list).
- `web/package.json` — Capacitor deps + `cap:sync` / `ios` scripts.
- `web/src/hooks/useChat.ts` — Capacitor `App`/`Network` listeners drive reconnect, reset
  the retry ceiling on resume, and a server-authoritative offset (`outputLinesSeen`) powers
  chat catch-up.
- `web/src/lib/orchestrator.ts` — `connectChatWebSocket(..., since)` for catch-up.
- `web/src/lib/native.ts` + `web/src/App.tsx` — native shell init + reconcile-on-resume re-fetch.
- `orchestrator/.../api/chat.py` — replays `output_buffer[since:]` on reconnect and reports
  authoritative `buffer_len` on `message_complete` (fixes risk F6).
- `web/.env.example`, `web/src/index.css` (safe-area), `start.sh` (Tailscale cert preference).
