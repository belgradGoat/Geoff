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

**This is NOT done in Xcode.** It's a plain text file you edit in your code editor
(VS Code / your IDE) or terminal — *before* you ever open Xcode (that's Step 3).

**Why this step exists:** Vite (the web build tool) reads `web/.env` when you run
`npm run build` and *bakes those values into the compiled app*. The phone can't read
your Mac's settings at runtime, so the orchestrator's address must be embedded at build
time. Skip this and the app loads but can't reach your Mac (failure F1). Note the file is
`web/.env` — NOT `web/.env.example` (that's just the template).

### What you already have vs. what to add

If Geoff already runs in your desktop browser, `web/.env` already exists with your
Supabase URL, Supabase anon key, and orchestrator API key set. **The only thing you
need to change** is `VITE_ORCHESTRATOR_URL`, which is currently commented out (in a
browser it auto-detects from the page origin; in the iOS app that auto-detect resolves
to the phone itself and breaks).

Open `web/.env` and make sure the orchestrator section has this **uncommented** line,
using your Tailscale MagicDNS name over **https** on port 8080:

```
VITE_ORCHESTRATOR_URL=https://demeter.tail7eba46.ts.net:8080
```

Leave the existing `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
`VITE_ORCHESTRATOR_API_KEY` lines as they are. A finished file looks like:

```
# Supabase Configuration  (already set — leave as-is)
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-existing-key...

# Orchestrator Configuration
VITE_ORCHESTRATOR_URL=https://demeter.tail7eba46.ts.net:8080
VITE_ORCHESTRATOR_API_KEY=dev-...your-existing-key...
```

To edit from the terminal instead: `open -e web/.env` (TextEdit) or `nano web/.env`.

> ⚠️ **Ordering:** this `https://…:8080` URL only actually *connects* once Step 2's
> `tailscale cert` is in place and the orchestrator is restarted — until then your Mac
> only has a self-signed cert the phone rejects. So do Step 2 next, then verify by
> loading `https://demeter.tail7eba46.ts.net:8080/health` in Safari and confirming a
> valid padlock before building the app.

Re-run `npm run build && npx cap sync` after ANY change to `web/.env`.

## 2. Valid TLS over Tailscale (risk F2/F5/F12)

iOS App Transport Security rejects the self-signed `certs/cert.pem`. Issue a real cert
for your MagicDNS name (requires HTTPS enabled in the Tailscale admin console + MagicDNS):

```bash
# Run from the repo root. Uses your tailnet name (demeter.tail7eba46.ts.net).
# Keep this on ONE line: a pasted "\" line-break becomes an escaped space and
# corrupts the domain into " demeter…" -> 500 "invalid domain".
tailscale cert --cert-file certs/tailscale.crt --key-file certs/tailscale.key demeter.tail7eba46.ts.net
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
    <key>demeter.tail7eba46.ts.net</key>
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
   (Apple ID), Automatic signing. Set a **unique** bundle ID — `com.geoff.app` is likely
   already registered to another Apple account (bundle IDs are globally unique across all
   accounts), which fails with *"…cannot be registered to your development team because it
   is not available."* Use something like `com.<you>.geoff`, and keep
   `web/capacitor.config.ts` `appId` in sync so future `cap sync`/regeneration matches.
2. **No iPhone handy?** Pick a **Simulator** as the run destination (toolbar device
   dropdown) — it builds and runs *without* code signing, so the bundle-ID / provisioning
   errors don't apply (you'll still see red in *Signing & Capabilities*; ignore it). Good
   enough to verify the app loads and chat connects, but the background-resume test
   (Step 7 #3) needs a real device. For a real device, build straight to your plugged-in
   iPhone from Xcode first to verify.
3. **Get an `.ipa` without the paid program.** Xcode's *Archive → Distribute App* export
   is gated behind the $99/yr Apple Developer Program — a free account hits *"… is not
   enrolled in Apple Developer Program."* Skip that flow. Instead, **Product → Archive**,
   then package the `.ipa` by hand (copy `App.app` from the archive into a `Payload/`
   folder, zip it, rename to `.ipa`). The helper does this against your newest archive:
   ```bash
   scripts/make-ipa.sh            # writes ~/Desktop/Geoff.ipa
   ```
   **SideStore re-signs** the `.ipa` on-device with your Apple ID, so its export-time
   signature is irrelevant. Install via **SideStore → My Apps → +** (it auto-refreshes
   the 7-day free-account signature over WiFi).
4. On each update: `npm run build && npx cap sync ios`, re-archive in Xcode, re-run
   `scripts/make-ipa.sh`, and re-import in SideStore. Keep the bundle ID + Apple ID
   constant or SideStore treats it as a new app.

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
- `scripts/make-ipa.sh` — wraps the latest Xcode archive into a SideStore-ready `.ipa`
  for free Apple IDs (no paid *Distribute App* flow).
