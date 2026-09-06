"""
Self-hosted Whisper (via faster-whisper) for speech-to-text, running on the
same Cloud Run GPU service as the LLM/TTS. The client falls back to the
browser's Web Speech API if this endpoint is unreachable (see plan: STT).
"""

import io
import threading

_model = None
_lock = threading.Lock()

# Biases transcription toward expected casual/flirty phrasing rather than
# assuming formal English (see plan: Language Style & Slang Handling).
INITIAL_PROMPT = "Casual conversational speech, flirting, dating small talk."


def _ensure_loaded():
    global _model
    if _model is not None:
        return
    with _lock:
        if _model is not None:
            return
        from faster_whisper import WhisperModel

        _model = WhisperModel("medium", device="cuda", compute_type="float16")


def transcribe(audio_bytes: bytes) -> str:
    _ensure_loaded()
    segments, _info = _model.transcribe(
        io.BytesIO(audio_bytes), language="en", initial_prompt=INITIAL_PROMPT
    )
    return " ".join(segment.text.strip() for segment in segments).strip()
