# Voice Agent - Implementation Plan

## Context

The chat section (`AgentChat.tsx`) is currently text-only. We're adding bidirectional voice support: speak to the agent (STT) and hear responses (TTS). Running on a 256GB Apple Silicon Mac — all models run **locally**, no cloud APIs. MLX preferred.

---

## Unified Library: `mlx-audio`

Both STT and TTS use the [`mlx-audio`](https://github.com/Blaizzy/mlx-audio) library — a single dependency that provides STT, TTS, and STS on Apple Silicon via MLX. This simplifies the backend to one library, one loading pattern, and keeps everything MLX-native.

> **Why unified?** On Apple Silicon, CPU and GPU share the same unified memory pool. There is no VRAM competition like on discrete GPU systems, so running both STT and TTS via MLX is optimal — no need to split workloads across CPU/GPU.

### STT: `mlx-community/VibeVoice-ASR-bf16`

| Property | Detail |
|----------|--------|
| Origin | Microsoft VibeVoice-ASR, MLX-converted by mlx-community |
| Framework | MLX via `mlx-audio` |
| Model | [`mlx-community/VibeVoice-ASR-bf16`](https://huggingface.co/mlx-community/VibeVoice-ASR-bf16) |
| Capacity | Up to 60 minutes of audio in a single pass (64K token length) |
| Output | Structured: Who (speaker), When (timestamps), What (content) |
| Languages | 50+ languages, automatic detection, code-switching support |
| Hotwords | Custom hotwords for domain-specific accuracy (project names, technical terms) |
| Precision | bf16 — full precision, no quality loss on 256GB machine |
| API | `mlx_audio.stt.load_model("mlx-community/VibeVoice-ASR-bf16")` + `generate()` |

**Why VibeVoice-ASR over Whisper:**
- Speaker diarization and timestamps built-in (Whisper needs external tools for this)
- Custom hotwords improve accuracy on domain-specific content — useful for dev-tools context
- Newer architecture with better long-form handling
- Same MLX ecosystem, same `mlx-audio` library

**Fallback:** `mlx-community/VibeVoice-ASR-4bit` available for lower memory usage if needed.

### TTS: `Kokoro` (via `mlx-audio`)

| Property | Detail |
|----------|--------|
| Framework | MLX via `mlx-audio` |
| Voices | 54 voice presets, multilingual |
| Quality | High-quality natural speech |
| Speed | Fast inference on Metal GPU |
| API | `mlx_audio.tts.load_model("kokoro")` + `generate()` |

**Alternative TTS models available via `mlx-audio`:**
- **Chatterbox / Chatterbox Turbo** — conversational voice synthesis
- **Qwen3-TTS** — voice cloning, emotion control, voice design
- **VibeVoice TTS** — Microsoft's TTS counterpart to VibeVoice-ASR
- **Sesame, Spark, OuteTTS** — additional options

All swappable via config — the `mlx-audio` library provides a unified API across models.

---

## Architecture

### Transport: REST Endpoints (Not WebSocket)

Audio blobs are discrete (not streaming), so REST is simpler and more reliable than mixing binary audio with JSON on the existing chat WebSocket.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/voice/transcribe` | POST | Upload audio, get text back |
| `/api/voice/synthesize` | POST | Send text, get WAV audio back |
| `/api/voice/voices` | GET | List available TTS voices |
| `/api/voice/status` | GET | Check model loading status |

The existing chat WebSocket remains text-only. The voice layer sits beside it.

### Data Flow

```
Voice Input:
  Microphone → MediaRecorder (WebM/opus) → audio Blob
    → POST /api/voice/transcribe (multipart/form-data)
    → mlx_audio STT (VibeVoice-ASR) → { text, speakers, timestamps }
    → populate chat input → send as normal message

Voice Output:
  Assistant message finalized (message_complete event)
    → POST /api/voice/synthesize { text, voice? }
    → mlx_audio TTS (Kokoro) → WAV bytes
    → Audio element plays response
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│  AgentChat.tsx (existing)                           │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │ VoiceControls│  │  TextInput  │  │   Send    │  │
│  │  (mic btn)   │  │  (textarea) │  │   (btn)   │  │
│  └──────┬───────┘  └─────────────┘  └───────────┘  │
│         │                                           │
│  ┌──────▼───────┐  ┌─────────────────────────────┐  │
│  │ AudioLevel   │  │  ChatMessage                │  │
│  │ Indicator    │  │  ┌──────┐ ┌──────────────┐  │  │
│  └──────────────┘  │  │ Copy │ │  TTSButton   │  │  │
│                    │  └──────┘ └──────────────┘  │  │
│                    └─────────────────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          │ WebSocket  │  REST      │
          │ (text)     │  (audio)   │
          ▼            ▼            │
┌─────────────────────────────────────────────────────┐
│  FastAPI Orchestrator                               │
│  ┌────────────────┐  ┌──────────────────────────┐   │
│  │ chat.py        │  │ voice.py                 │   │
│  │ (existing WS)  │  │ /transcribe /synthesize  │   │
│  └────────────────┘  └───────────┬──────────────┘   │
│                                  │                   │
│                      ┌───────────▼──────────────┐   │
│                      │ voice_service.py          │   │
│                      │ ┌──────────────────────┐  │   │
│                      │ │  mlx-audio (unified)  │  │   │
│                      │ │ ┌─────────┐┌────────┐│  │   │
│                      │ │ │VibeVoice││ Kokoro ││  │   │
│                      │ │ │  (STT)  ││ (TTS)  ││  │   │
│                      │ │ └─────────┘└────────┘│  │   │
│                      │ └──────────────────────┘  │   │
│                      └──────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## Files to Create (8 new files)

### Backend

#### 1. `orchestrator/src/orchestrator/core/voice_service.py`
Core voice service — model loading and inference via `mlx-audio`.

- `VoiceService` class with lazy model loading (singleton via `get_voice_service()`)
- `async transcribe(audio_bytes, filename, hotwords?) -> dict`
  - Save temp file, run `mlx_audio.stt` with VibeVoice-ASR in executor, cleanup
  - Returns `{ text, language, duration, speakers?, timestamps? }`
  - Optional `hotwords` parameter for domain-specific accuracy
- `async synthesize(text, voice?) -> bytes`
  - Run `mlx_audio.tts` with Kokoro in executor, return WAV bytes
- `list_voices() -> list`
  - Return available TTS voice presets from the loaded model
- `get_status() -> dict`
  - Report which models are loaded and ready
- Uses `asyncio.run_in_executor()` for both STT and TTS (sync inference won't block the event loop)

#### 2. `orchestrator/src/orchestrator/api/voice.py`
API router mounted at `/api/voice`.

- `POST /transcribe` — accepts `UploadFile`, optional `hotwords` field, converts format if needed, returns `{ text, language, duration, speakers?, timestamps? }`
- `POST /synthesize` — accepts `{ text, voice? }`, returns `StreamingResponse` with `audio/wav`
- `GET /voices` — returns available TTS voice presets
- `GET /status` — returns model loading status (STT ready, TTS ready)
- Auth: `Depends(verify_api_key)` on all endpoints (same pattern as `chat.py`)

### Frontend

#### 3. `web/src/lib/voiceApi.ts`
API client following the `orchestrator.ts` pattern.

```typescript
transcribe(audioBlob: Blob): Promise<{ text: string; language: string; duration: number }>
synthesize(text: string, voice?: string): Promise<Blob>
getVoices(): Promise<Voice[]>
```

Uses `FormData` for upload, returns `Blob` for audio playback.

#### 4. `web/src/hooks/useVoice.ts`
Zustand store following the `useChat.ts` pattern.

**Persisted settings:**
- `sttEnabled`, `ttsEnabled`
- `voiceInputMode`: `'push-to-talk'` | `'toggle'`
- `autoPlayTTS`, `selectedVoice`

**Runtime state (not persisted):**
- `isRecording`, `isTranscribing`, `isSpeaking`, `audioLevel`

**Actions:**
- `startRecording()`, `stopRecording() → text`, `cancelRecording()`
- `speakText()`, `stopSpeaking()`, `toggleRecording()`

Uses `MediaRecorder` API + `AudioContext`/`AnalyserNode` for audio level visualization.

#### 5. `web/src/components/chat/VoiceControls.tsx`
Recording UI component.

- Microphone button next to Send button
- **Push-to-talk**: hold button (or Space key when input not focused)
- **Toggle mode**: click to start, click again to stop
- Visual feedback: pulsing red when recording, audio level bar, duration counter
- "Transcribing..." spinner state
- Props: `onTranscription(text)`, `disabled`

#### 6. `web/src/components/chat/TTSButton.tsx`
Per-message speak button.

- Small speaker icon alongside existing Copy button on assistant messages
- Click to speak, click again to stop
- Animated icon while speaking

#### 7. `web/src/components/chat/AudioLevelIndicator.tsx`
Reusable audio level meter.

- Animated bars showing microphone input level
- Used by `VoiceControls`

#### 8. `web/src/components/settings/VoiceSettings.tsx`
Settings card following the `ProviderSettings.tsx` pattern.

- Toggle: STT on/off
- Toggle: TTS on/off
- Radio: push-to-talk vs toggle mode
- Toggle: auto-play TTS for responses
- Dropdown: voice selection (fetched from `/api/voice/voices`)
- "Test Voice" preview button
- Status: shows whether models are loaded

---

## Files to Modify (5 existing files)

### 1. `orchestrator/src/orchestrator/core/config.py`
Add voice settings to the `Settings` class:

```python
# Voice Configuration
voice_stt_enabled: bool = True
voice_tts_enabled: bool = True
voice_stt_model: str = "mlx-community/VibeVoice-ASR-bf16"
voice_tts_model: str = "kokoro"
voice_tts_voice: str = "af_heart"  # Kokoro voice preset
voice_tts_speed: float = 1.0
```

Env vars: `VOICE_STT_ENABLED`, `VOICE_TTS_ENABLED`, `VOICE_STT_MODEL`, `VOICE_TTS_MODEL`, `VOICE_TTS_VOICE`, `VOICE_TTS_SPEED`

### 2. `orchestrator/src/orchestrator/main.py`
Register voice router:

```python
from .api.voice import router as voice_router
app.include_router(voice_router)
```

Add `"voice": "/api/voice"` to root endpoint listing.

### 3. `orchestrator/pyproject.toml`
Add dependencies:

```toml
"mlx-audio>=0.3.0",
"pydub>=0.25.0",
"python-multipart>=0.0.6",
```

### 4. `web/src/components/chat/AgentChat.tsx`
Integrate voice into the chat UI:

- Import `VoiceControls`, render between textarea and Send button
- Wire `onTranscription` to populate input and optionally auto-send
- Add `TTSButton` to `ChatMessage` for assistant messages (next to Copy button)
- Auto-play TTS on `message_complete` when `autoPlayTTS` is enabled

### 5. `web/src/App.tsx`
Add `VoiceSettings` to settings tab grid:

```tsx
import { VoiceSettings } from './components/settings/VoiceSettings'
// In the settings grid alongside existing cards
<VoiceSettings />
```

---

## Implementation Phases

### Phase 1: Backend Voice Service (STT + TTS)
1. Add voice config fields to `config.py`
2. Create `voice_service.py` with `mlx-audio` — both VibeVoice-ASR and Kokoro TTS
3. Create `api/voice.py` with all endpoints (`/transcribe`, `/synthesize`, `/voices`, `/status`)
4. Register router in `main.py`
5. Add `mlx-audio` + supporting deps to `pyproject.toml`

**Verify:**
- `curl -X POST -F "audio=@test.wav" localhost:8080/api/voice/transcribe -H "X-API-Key: ..."`
- `curl -X POST -d '{"text":"Hello world"}' localhost:8080/api/voice/synthesize -H "X-API-Key: ..." -H "Content-Type: application/json" --output test.wav && afplay test.wav`

### Phase 2: Frontend Voice Input
1. Create `voiceApi.ts` with `transcribe()` method
2. Create `useVoice.ts` Zustand store with recording logic
3. Create `AudioLevelIndicator.tsx` and `VoiceControls.tsx`
4. Integrate into `AgentChat.tsx`

**Verify:** Click mic button, speak, see transcribed text appear in chat input.

### Phase 3: Frontend TTS + Settings
1. Add `synthesize()` and `getVoices()` to `voiceApi.ts`
2. Create `TTSButton.tsx`, integrate into `ChatMessage`
3. Add auto-play TTS logic to `useVoice.ts`
4. Create `VoiceSettings.tsx`, add to settings tab in `App.tsx`

**Verify:** Full end-to-end — speak a question, see it transcribed, hear the agent's response.

### Phase 4: Polish
1. Error handling — mic permission denied, model loading failures, network errors
2. First-use model warm-up indicator (VibeVoice-ASR download on first request)
3. Audio format negotiation — Safari uses `audio/mp4` not `audio/webm` for MediaRecorder
4. Keyboard shortcut refinement — Space for push-to-talk when input not focused
5. Mobile support verification via Tailscale

---

## Prerequisites

| Requirement | Install | Notes |
|-------------|---------|-------|
| `ffmpeg` | `brew install ffmpeg` | Required by `pydub` for audio format conversion |
| Python 3.10+ | Already present | Required by orchestrator |
| Apple Silicon Mac | Hardware | Required for MLX acceleration (unified memory) |

### First-Use Downloads
- **VibeVoice-ASR-bf16**: Auto-downloads from HuggingFace on first transcription request
- **Kokoro TTS**: Auto-downloads on first synthesis request
- Both models cached in `~/.cache/huggingface/` after initial download

---

## End-to-End Verification Checklist

- [ ] Start orchestrator, `/health` returns healthy
- [ ] Upload WAV to `/api/voice/transcribe` → correct transcription returned
- [ ] POST text to `/api/voice/synthesize` → valid WAV audio returned
- [ ] Web UI: Chat tab → mic button → speak → text appears in input
- [ ] Web UI: Send message → assistant response has speaker button → click → hear audio
- [ ] Web UI: Settings tab → Voice card → toggle modes, change voice, test preview
- [ ] Auto-play TTS: enable in settings → send message → response spoken automatically
- [ ] Push-to-talk: hold Space key (input not focused) → speak → release → transcription sent
- [ ] Toggle mode: click mic → speak → click mic → transcription sent
