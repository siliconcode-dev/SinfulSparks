"""
Self-hosted TTS (Coqui XTTS) for distinct per-character voices, running on
the same Cloud Run GPU service. The client falls back to the browser's
SpeechSynthesis if this endpoint is unreachable (see plan: TTS).

Voice distinctness: each character's voiceId maps to a short reference
speaker clip under server/app/voices/<voiceId>.wav that XTTS clones from —
source/record these per character during Phase 1 step 7.
"""

import io
import threading

_model = None
_lock = threading.Lock()

VOICE_REFERENCE_DIR = "app/voices"


def _ensure_loaded():
    global _model
    if _model is not None:
        return
    with _lock:
        if _model is not None:
            return
        from TTS.api import TTS

        _model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("cuda")


def synthesize(text: str, voice_id: str) -> bytes:
    _ensure_loaded()
    reference_wav = f"{VOICE_REFERENCE_DIR}/{voice_id}.wav"

    buffer = io.BytesIO()
    _model.tts_to_file(
        text=text,
        speaker_wav=reference_wav,
        language="en",
        file_path=buffer,
    )
    buffer.seek(0)
    return buffer.read()
