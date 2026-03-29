"""Voice endpoints for STT and TTS."""

import os
import tempfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

from ..core.config import get_settings
from ..core.security import verify_api_key
from ..core.voice_service import get_voice_service, VoiceService

router = APIRouter(prefix="/api/voice", tags=["voice"])


class SynthesizeRequest(BaseModel):
    """Request body for text-to-speech."""
    text: str
    voice: Optional[str] = None
    speed: Optional[float] = None


class TranscriptionResponse(BaseModel):
    """Response for speech-to-text."""
    text: str


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    audio: UploadFile = File(...),
    _: str = Depends(verify_api_key),
    service: VoiceService = Depends(get_voice_service),
):
    """Transcribe uploaded audio to text using VibeVoice-ASR."""
    settings = get_settings()
    if not settings.voice_stt_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Speech-to-text is disabled",
        )

    # Save uploaded audio to temp file
    suffix = os.path.splitext(audio.filename or "audio.wav")[1] or ".wav"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        content = await audio.read()
        tmp.write(content)
        tmp.close()

        # If format is not WAV, try to convert with pydub
        if suffix.lower() not in (".wav", ".flac", ".mp3", ".ogg"):
            try:
                from pydub import AudioSegment
                audio_seg = AudioSegment.from_file(tmp.name)
                wav_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
                wav_tmp.close()
                audio_seg.export(wav_tmp.name, format="wav")
                os.unlink(tmp.name)
                tmp.name = wav_tmp.name
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Could not convert audio format: {e}",
                )

        result = await service.transcribe(tmp.name)
        return TranscriptionResponse(text=result["text"])

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcription failed: {e}",
        )
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


@router.post("/synthesize")
async def synthesize_speech(
    request: SynthesizeRequest,
    _: str = Depends(verify_api_key),
    service: VoiceService = Depends(get_voice_service),
):
    """Synthesize text to speech using Kokoro TTS."""
    settings = get_settings()
    if not settings.voice_tts_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Text-to-speech is disabled",
        )

    if not request.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text cannot be empty",
        )

    try:
        wav_bytes = await service.synthesize(
            text=request.text,
            voice=request.voice,
            speed=request.speed or settings.voice_tts_speed,
        )
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={"Content-Disposition": "inline; filename=speech.wav"},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Synthesis failed: {e}",
        )


@router.get("/status")
async def get_voice_status(
    _: str = Depends(verify_api_key),
    service: VoiceService = Depends(get_voice_service),
):
    """Get voice service status including model loading state."""
    return service.get_status()


@router.post("/warmup")
async def warmup_models(
    _: str = Depends(verify_api_key),
    service: VoiceService = Depends(get_voice_service),
):
    """Pre-load voice models to avoid first-request latency."""
    settings = get_settings()
    results = {}

    if settings.voice_stt_enabled and not service.stt_ready:
        try:
            await service.warmup_stt()
            results["stt"] = "loaded"
        except Exception as e:
            results["stt"] = f"failed: {e}"
    else:
        results["stt"] = "already_loaded" if service.stt_ready else "disabled"

    if settings.voice_tts_enabled and not service.tts_ready:
        try:
            await service.warmup_tts()
            results["tts"] = "loaded"
        except Exception as e:
            results["tts"] = f"failed: {e}"
    else:
        results["tts"] = "already_loaded" if service.tts_ready else "disabled"

    return results
