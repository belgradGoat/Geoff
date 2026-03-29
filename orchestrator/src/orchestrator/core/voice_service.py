"""Voice service for STT and TTS using mlx-audio."""

import asyncio
import io
import os
import tempfile
import threading
import wave
from functools import lru_cache
from typing import Optional

from .config import get_settings

# Global lock to serialize all MLX GPU operations.
# MLX's Metal backend is not thread-safe — concurrent GPU submissions
# from different threads cause SIGSEGV in the Metal driver.
_mlx_lock = threading.Lock()


class VoiceService:
    """Manages STT and TTS models via mlx-audio with lazy loading."""

    def __init__(self):
        self._stt_model = None
        self._tts_model = None
        self._stt_loading = False
        self._tts_loading = False
        self._settings = get_settings()

    @property
    def stt_ready(self) -> bool:
        return self._stt_model is not None

    @property
    def tts_ready(self) -> bool:
        return self._tts_model is not None

    def _ensure_stt_model(self):
        """Load STT model if not already loaded (synchronous, run in executor)."""
        if self._stt_model is not None:
            return

        self._stt_loading = True
        try:
            from mlx_audio.stt.utils import load_model
            print(f"[VOICE] Loading STT model: {self._settings.voice_stt_model}")
            self._stt_model = load_model(self._settings.voice_stt_model)
            print("[VOICE] STT model loaded successfully")
        finally:
            self._stt_loading = False

    def _ensure_tts_model(self):
        """Load TTS model if not already loaded (synchronous, run in executor)."""
        if self._tts_model is not None:
            return

        self._tts_loading = True
        try:
            from mlx_audio.tts.utils import load_model
            print(f"[VOICE] Loading TTS model: {self._settings.voice_tts_model}")
            self._tts_model = load_model(self._settings.voice_tts_model)
            print("[VOICE] TTS model loaded successfully")
        finally:
            self._tts_loading = False

    def _transcribe_sync(self, audio_path: str) -> dict:
        """Run STT transcription synchronously."""
        import json

        with _mlx_lock:
            self._ensure_stt_model()
            result = self._stt_model.generate(audio=audio_path)

        # VibeVoice-ASR returns structured JSON with speaker/timestamp data
        # e.g. [{"Start":0.0,"End":2.0,"Speaker":0,"Content":"Hello"}]
        # Extract plain text from Content fields
        raw_text = result.text
        try:
            segments = json.loads(raw_text)
            if isinstance(segments, list):
                text = " ".join(seg.get("Content", "") for seg in segments if seg.get("Content"))
            else:
                text = raw_text
        except (json.JSONDecodeError, TypeError):
            text = raw_text

        return {
            "text": text.strip(),
            "language": result.language,
            "total_time": result.total_time,
        }

    @staticmethod
    def _sanitize_for_tts(text: str) -> str:
        """Strip markdown, code blocks, and special symbols for clean TTS output."""
        import re

        # Remove fenced code blocks (```...```)
        text = re.sub(r'```[\s\S]*?```', ' [code block omitted] ', text)

        # Remove inline code (`...`)
        text = re.sub(r'`[^`]+`', ' [code] ', text)

        # Strip markdown formatting
        text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)  # **bold**
        text = re.sub(r'\*(.+?)\*', r'\1', text)       # *italic*
        text = re.sub(r'__(.+?)__', r'\1', text)        # __bold__
        text = re.sub(r'_(.+?)_', r'\1', text)          # _italic_
        text = re.sub(r'~~(.+?)~~', r'\1', text)        # ~~strikethrough~~
        text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)  # # headers
        text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)  # bullet lists
        text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)  # numbered lists
        text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)  # [links](url)
        text = re.sub(r'!\[([^\]]*)\]\([^)]+\)', r'\1', text)  # ![images](url)
        text = re.sub(r'^\s*>\s+', '', text, flags=re.MULTILINE)  # > blockquotes

        # Remove remaining special symbols that shouldn't be spoken
        text = re.sub(r'[*_~`|<>{}\\^]', '', text)

        # Remove lines that look like pure code
        lines = []
        for line in text.split('\n'):
            stripped = line.strip()
            if (stripped.startswith(('def ', 'class ', 'import ', 'from ', '>>> ', '$ '))
                or 'lambda ' in stripped and ':' in stripped
                or stripped.startswith(('#!', '//'))
                or (stripped.startswith('{') and stripped.endswith('}'))):
                lines.append('[code omitted]')
            else:
                lines.append(line)

        text = '\n'.join(lines)

        # Collapse multiple whitespace/newlines
        text = re.sub(r'\s+', ' ', text).strip()

        return text if text else "No speakable content."

    def _synthesize_sync(self, text: str, voice: Optional[str] = None, speed: float = 1.0) -> bytes:
        """Run TTS synthesis synchronously, return WAV bytes."""
        import numpy as np

        voice = voice or self._settings.voice_tts_voice
        speed = speed or self._settings.voice_tts_speed

        # Sanitize text outside the lock (CPU-only, no MLX)
        text = self._sanitize_for_tts(text)

        # All MLX GPU operations must be serialized
        audio_segments = []
        sample_rate = 24000  # default fallback
        with _mlx_lock:
            self._ensure_tts_model()

            try:
                for result in self._tts_model.generate(
                    text=text,
                    voice=voice,
                    speed=speed,
                    lang_code="a",
                ):
                    audio_data = result.audio
                    if hasattr(result, 'sample_rate') and result.sample_rate:
                        sample_rate = result.sample_rate
                    if hasattr(audio_data, 'tolist'):
                        audio_np = np.array(audio_data.tolist(), dtype=np.float32)
                    else:
                        audio_np = np.array(audio_data, dtype=np.float32)
                    audio_segments.append(audio_np)
            except TypeError:
                # Phonemizer crashed — retry with alphanumeric only
                import re
                fallback = re.sub(r'[^a-zA-Z0-9\s.,!?]', '', text).strip()
                if not fallback:
                    fallback = "Content could not be spoken."
                print(f"[VOICE] TTS phonemizer failed, retrying with sanitized text")
                for result in self._tts_model.generate(
                    text=fallback,
                    voice=voice,
                    speed=speed,
                    lang_code="a",
                ):
                    audio_data = result.audio
                    if hasattr(result, 'sample_rate') and result.sample_rate:
                        sample_rate = result.sample_rate
                    if hasattr(audio_data, 'tolist'):
                        audio_np = np.array(audio_data.tolist(), dtype=np.float32)
                    else:
                        audio_np = np.array(audio_data, dtype=np.float32)
                    audio_segments.append(audio_np)

        if not audio_segments:
            raise RuntimeError("TTS generated no audio")

        # Concatenate all segments
        full_audio = np.concatenate(audio_segments)

        # Convert float32 [-1, 1] to int16 PCM
        full_audio = np.clip(full_audio, -1.0, 1.0)
        pcm_data = (full_audio * 32767).astype(np.int16)

        # Write WAV to bytes
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)  # mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm_data.tobytes())

        return wav_buffer.getvalue()

    async def transcribe(self, audio_path: str) -> dict:
        """Transcribe audio file to text. Runs inference in thread executor."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._transcribe_sync, audio_path)

    async def synthesize(self, text: str, voice: Optional[str] = None, speed: float = 1.0) -> bytes:
        """Synthesize text to WAV audio bytes. Runs inference in thread executor."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._synthesize_sync, text, voice, speed)

    def get_status(self) -> dict:
        """Get current voice service status."""
        return {
            "stt_enabled": self._settings.voice_stt_enabled,
            "tts_enabled": self._settings.voice_tts_enabled,
            "stt_ready": self.stt_ready,
            "tts_ready": self.tts_ready,
            "stt_loading": self._stt_loading,
            "tts_loading": self._tts_loading,
            "stt_model": self._settings.voice_stt_model,
            "tts_model": self._settings.voice_tts_model,
            "tts_voice": self._settings.voice_tts_voice,
            "tts_speed": self._settings.voice_tts_speed,
        }

    async def warmup_stt(self):
        """Pre-load the STT model."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._ensure_stt_model)

    async def warmup_tts(self):
        """Pre-load the TTS model."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._ensure_tts_model)


@lru_cache()
def get_voice_service() -> VoiceService:
    """Get cached voice service singleton."""
    return VoiceService()
