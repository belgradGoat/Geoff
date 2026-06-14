# Turn Geoff into a native iOS app (Capacitor wrap, local + Tailscale)

## Context

Geoff currently runs as a mobile **web** app: a React/Vite UI served from your Mac, reachable from your phone over Tailscale, talking to a local FastAPI orchestrator over **three WebSocket connections** (chat, agent output, chain progress) plus Supabase realtime.

The pain point — "sessions don't stay live; the page refreshes whenever I lock the screen or switch apps" — is **inherent to mobile web browsers**, not a bug in your code. When iOS Safari backgrounds a tab it (a) kills the WebSocket and (b) frequently discards the page entirely, reloading it on return. The reconnect logic in `useChat.ts` hangs off the `visibilitychange` event, which iOS fires unreliably on screen-lock. No amount of web-only tweaking removes this ceiling.

**Goal:** ship a real iOS app from the *existing React codebase* using **Capacitor**, keeping the backend 100% local + Tailscale (no cloud, no 3rd parties). Capacitor gives us a persistent native WebView that iOS does *not* tear down like a Safari tab, plus native app-lifecycle events we can hang reliable reconnect-on-resume off of. iOS will still suspend WebSockets after a few seconds in the background, so the durable fix is **reconcile-on-resume + catch-up replay**, which the backend already largely supports (`getAgentOutput` REST endpoint + `output_buffer` replay in `websocket.py:42`).

Future-proofing: the same Capacitor project can later add Android (`npx cap add android`) and a desktop wrap, with no UI rewrite.

## Recommended approach

Wrap the current `web/` React app in Capacitor for iOS, point it at the orchestrator over a Tailscale HTTPS URL, and make the WebSocket layer resilient to iOS backgrounding. No backend rewrite; small, additive frontend changes.

### Part A — Capacitor scaffolding (`web/`)

1. Add deps in `web/package.json`: `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, plus plugins `@capacitor/app`, `@capacitor/network`, `@capacitor/status-bar`, `@capacitor/splash-screen`, and (optional) `@capacitor/local-notifications`.
2. `npx cap init Geoff com.geoff.app --web-dir=dist`, creating `web/capacitor.config.ts`.
3. Configure `capacitor.config.ts`:
   - `server.allowNavigation: ['<your-machine>.<tailnet>.ts.net', '100.x.x.x']` so requests to the Tailscale host aren't blocked.
   - `ios.contentInset: 'always'`, status-bar/splash settings.
   - Leave the app loading from the bundled `dist/` (capacitor://localhost) — do NOT use `server.url` to point at the dev server; we want the UI bundled so it survives offline and launches instantly.
4. Build pipeline: `npm run build` → `npx cap sync ios` → `npx cap open ios` (Xcode). Add a convenience script `"ios": "vite build && cap sync ios && cap open ios"` to `package.json`.

### Part B — Connectivity & TLS over Tailscale (the ATS gotcha)

The bundled app's origin is `capacitor://localhost`, so the current fallback `window.location.hostname` in `web/src/lib/orchestrator.ts:1` won't resolve the orchestrator. We must set an explicit URL at build time.

- Set `VITE_ORCHESTRATOR_URL=https://<machine>.<tailnet>.ts.net:8080` in the web build env. The WS builder (`orchestratorUrl.replace('http','ws')`, lines 384/539/738) already upgrades this to `wss://` correctly — no code change needed there.
- **iOS App Transport Security** will reject your current **self-signed** certs in `certs/`. Two options, in order of preference:
  1. **Recommended:** use a real Tailscale cert — `tailscale cert <machine>.<tailnet>.ts.net` issues a Let's-Encrypt cert for your MagicDNS name. Point uvicorn's `--ssl-certfile/--ssl-keyfile` (already wired in `start.sh`) at it. ATS accepts it with zero exceptions; everything stays inside your tailnet.
  2. Fallback: add a scoped ATS exception in `ios/App/App/Info.plist` (`NSExceptionDomains` → your ts.net host, `NSExceptionAllowsInsecureHTTPLoads`/allow self-signed). Less clean; keep it host-scoped, never `NSAllowsArbitraryLoads`.
- CORS is already `allow_origins=["*"]` (`main.py:26`), so `capacitor://localhost` is accepted — no change needed.

### Part C — Session resilience (the actual fix for "doesn't stay live")

This is the heart of the work. Replace the fragile `visibilitychange` path with Capacitor's native lifecycle and add catch-up so a dropped stream loses no output.

1. **App lifecycle reconnect** — in `web/src/hooks/useChat.ts`, augment/replace `setupVisibilityListener()` (lines 229–256) with Capacitor's `App.addListener('appStateChange', ({isActive}) => ...)` and `App.addListener('resume', ...)`. On resume with a `sessionId` but `!isConnected`, call the existing `attemptReconnect()` (line 189). Keep `visibilitychange` as a web fallback so the same code still runs in a browser. Do the same for the agent-output and chain WebSockets (wherever those are consumed, e.g. `useAgents.ts` / `useChains.ts`).
2. **Network-aware reconnect** — use `@capacitor/network` `addListener('networkStatusChange')` to trigger reconnect the moment connectivity returns (e.g. leaving a dead zone), rather than waiting on backoff timers.
3. **Catch-up on reconnect (no lost output)** — for agent output, the WS handler already replays `output_buffer` on (re)connect (`websocket.py:42`) and the `getAgentOutput(agentId, offset, limit)` REST endpoint (`orchestrator.ts:378`) exists — wire the reconnect path to fetch any output produced while backgrounded using the last-seen offset, then resume streaming. For **chat**, this is **mandatory** — confirmed that `chat.py` does NOT replay `output_buffer` on reconnect (unlike the agent WS at `websocket.py:42`). Add a replay-on-accept loop in the chat WS handler mirroring `websocket.py:42`, and/or have the client fetch missed output via `getAgentOutput` from the last-rendered offset on reconnect. Without this, "reconnected" is followed by a gap in the conversation (risk F6).
4. **Longer server-side grace** — verify the orchestrator session-cleanup timeouts (the 15-min temp-disconnect / 1-h inactivity windows in `agent_manager.py`) comfortably exceed typical backgrounding so a locked phone doesn't lose its agent. Tune via config if needed.
5. **Reset reconnect ceiling on resume** — `MAX_RECONNECT_ATTEMPTS = 5` (line 39) can permanently kill a session after a long background. On a fresh `resume`/`networkStatusChange`, reset `reconnectAttempts` to 0 so the user always gets a clean reconnect attempt when they pick the phone back up.

### Part D — Native polish

- App icon + splash from existing `apple-touch-icon.png` via `@capacitor/assets`.
- Safe-area/status-bar handling (notch) — add CSS env() insets; Capacitor StatusBar plugin for color.
- **Optional, privacy-preserving notifications:** use `@capacitor/local-notifications` fired by the app on reconnect when it detects a task/chain completed while backgrounded (driven by Supabase state diff). This avoids APNs/remote push entirely, so nothing leaves your tailnet. (True push-while-fully-killed would require Apple's APNs servers — out of scope given the "no 3rd parties" goal.)

### Part E — Signing & installation (no Apple Developer account)

A **paid Apple Developer account is NOT required** to build and run this on a personally-owned iPhone. A **free Apple ID** is sufficient. Constraints of free-account signing and how we handle them:

- Free-account signing certs **expire after 7 days**; max 3 self-signed apps at once; no APNs push entitlement. Our plan already avoids remote push (Part D uses **local notifications only**), so the push limitation is a non-issue.
- The phone is on **recent iOS (17.1+/18+)**, so **TrollStore is not available** — ruled out.
- **Chosen install path: SideStore/AltStore.** A helper app (AltServer/SideStore daemon) on the Mac re-signs the app with the free Apple ID and **auto-refreshes the 7-day signature over WiFi**, so the app keeps working without manual weekly rebuilds.

Workflow for producing an installable build:
1. In Xcode, set the App target's **Signing & Capabilities → Team** to the free "Personal Team" (Apple ID), automatic signing. Pick a unique bundle ID (`com.geoff.app`).
2. Produce an **unsigned/dev `.ipa`** (Xcode Archive → export for development, or build to a generic device and grab the `.app` → zip into `Payload/`). SideStore consumes the `.ipa`.
3. Install **SideStore** on the iPhone (paired once via the desktop helper), then sideload the Geoff `.ipa` through it. SideStore handles the periodic re-sign.
4. On each app update: rebuild (`npm run build && npx cap sync ios`), re-archive/export the `.ipa`, and update via SideStore.

Notes:
- Document this install/refresh procedure in `docs/` so it's repeatable.
- Bundle ID and the Apple ID's "Personal Team" must stay consistent across rebuilds or SideStore treats it as a new app (re-onboarding the WiFi refresh).

### Pre-mortem / risk register (read before implementing)

Most risk here is environment glue, not React code. Ranked by likelihood of being the thing that breaks.

**Tier 1 — nothing connects (most likely on first build):**
- **F1 — build points at `localhost`.** `orchestrator.ts:1` / `voiceApi.ts:1` fall back to `window.location.hostname` → resolves to `capacitor://localhost`. Vite inlines env at BUILD time, so `VITE_ORCHESTRATOR_URL`, `VITE_ORCHESTRATOR_API_KEY`, and Supabase keys must be present in the `.env` used for the native build, and you must `npm run build && npx cap sync` after any change. *Highest-probability failure.*
- **F2 — self-signed cert → iOS ATS silently blocks.** Must switch to `tailscale cert` (Part B). Self-signed `certs/` will fail with opaque errors.
- **F3 — Mac asleep / orchestrator down / Tailscale off on phone.** Whole model needs Mac awake + `start.sh` running + tailnet active on both ends. Consider `caffeinate` to keep the Mac awake.

**Tier 2 — partial failure (good diagnostic signal):**
- **F4 — tasks sync but chat/agents dead.** Supabase realtime is cloud (no Tailscale); orchestrator needs Tailscale. If task list updates but chat hangs → it's Tailscale/TLS/orchestrator-URL, not Supabase.
- **F5 — IP-vs-DNS cert mismatch.** `100.x.x.x` URL fails the cert issued for the `*.ts.net` name; DNS name needs MagicDNS resolving in the WebView. Pick the MagicDNS name + ensure MagicDNS on.

**Tier 3 — feature still feels broken (background/reconnect):**
- **F6 — chat does NOT replay buffer on reconnect (CONFIRMED gap).** `chat.py` has no replay loop, unlike the agent WS (`websocket.py:42`). Output produced while backgrounded sits in `output_buffer` (`agent_manager.py:427`) and is reachable via `getAgentOutput` (`agent_manager.py:302`) but never re-sent. **Part C item 3 is mandatory, not optional** — without it, "reconnected" is followed by a gap in the conversation. This is the most likely way the core promise fails even with perfect networking.
- **F7 — resume-vs-tunnel race.** On unlock, reconnect fires before Tailscale re-establishes → burns retries. Gate reconnect on `@capacitor/network` connectivity, keep the attempt-counter reset.
- **F8 — long background GC's the session.** `_cleanup_abandoned_sessions` (`agent_manager.py:452`) reaps inactive chat sessions; the `--continue` conversation context is then lost. Tune the inactivity window up.
- **F9 — JS timers suspended in background.** iOS freezes WebView `setTimeout`, so `scheduleReconnect`'s backoff never fires while away — only native `resume`/`networkStatusChange` do. This is WHY Part C drives reconnect off Capacitor events, not the existing timer chain.

**Tier 4 — toolchain / longevity:**
- **F10** — `cap sync` runs `pod install`; needs Xcode + CocoaPods + compatible Ruby.
- **F11** — SideStore 7-day re-sign needs its daemon reachable on WiFi, else "worked a week then wouldn't open."
- **F12** — `tailscale cert` needs HTTPS-certs enabled in admin console + MagicDNS; ~90-day certs with NO auto-renew → script renewal or it dies silently in months.

**Tier 5 — feature-specific:**
- **F13** — voice/mic needs `NSMicrophoneUsageDescription` + WKWebView media config or `getUserMedia` fails silently.
- **F14** — if `.env` has `http://` not `https://`, `replace('http','ws')` yields insecure `ws://` → ATS blocks.

**Already de-risked:** CORS is `allow_origins=["*"]` (`main.py:26`), so `capacitor://localhost` is NOT blocked — no CORS change needed.

**Fast triage if dead on launch:** (1) iOS Safari → `https://<host>.<tailnet>.ts.net:8080/health`: no lock = TLS (F2/F5/F12); unreachable = F3. (2) Tasks sync but chat dead = F1/F4. (3) Connects but loses output on resume = F6/F7/F9.

### Future (not now)

- Android: `npx cap add android` from the same project.
- Desktop: wrap the same `dist/` with Tauri/Electron, or Capacitor's community Electron target.

## Critical files

- `web/package.json` — Capacitor deps + `ios` build script.
- `web/capacitor.config.ts` — **new**, allowNavigation + iOS config.
- `web/src/lib/orchestrator.ts` — confirm `VITE_ORCHESTRATOR_URL` is set for bundle origin (line 1); no WS-scheme change needed.
- `web/src/hooks/useChat.ts` — `setupVisibilityListener` → Capacitor `App`/`Network` listeners; reset reconnect attempts on resume; chat catch-up (lines 39, 189–256).
- `web/src/hooks/useAgents.ts` / `web/src/hooks/useChains.ts` — same lifecycle + catch-up treatment for those WebSockets.
- `ios/App/App/Info.plist` — **new** (generated), ATS config if not using a real Tailscale cert.
- `start.sh` — point uvicorn TLS at the `tailscale cert` files (recommended over self-signed `certs/`).
- Orchestrator `main.py` (CORS) and `agent_manager.py` (session timeouts) — small config verification, likely no logic change.

## Verification

1. **Build & install:** `cd web && npm run build && npx cap sync ios && npx cap open ios`; sign with the free "Personal Team" Apple ID, export a development `.ipa`, and install via **SideStore** on a physical iPhone (must be on the tailnet). First-run check can also be done directly from Xcode-to-device.
2. **TLS reachability:** in iOS Safari first, load `https://<machine>.<tailnet>.ts.net:8080/health` — must show a valid lock (proves ATS will accept it). Then launch the app; tasks list loads from Supabase, chat connects (`[WS] Connection opened`).
3. **The core test — backgrounding:** start a chat or launch an agent that streams output. Lock the phone / switch apps for 30s–2min. Reopen. Confirm: (a) the app does **not** reload from scratch, (b) the WebSocket reconnects automatically (`Reconnected successfully.`), and (c) any output produced while backgrounded appears via catch-up (no gap). Repeat with airplane-mode toggle to exercise the Network listener.
4. **Long background:** background for >5 min, reopen; confirm reconnect still succeeds (reconnect-attempt reset works) or, if the server-side session genuinely expired, the app cleanly offers a new session rather than hanging.
5. **Regression:** run the app in a desktop browser (`npm run dev`) and confirm the `visibilitychange` fallback path still works — Capacitor changes must be additive, not break web.
