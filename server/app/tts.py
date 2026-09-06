"""
Self-hosted TTS (Coqui XTTS) for distinct per-character voices, running on
the same Cloud Run GPU service. The client falls back to the browser's
SpeechSynthesis if this endpoint is unreachable (see plan: TTS).

Voice distinctness: each character's voiceId maps to a short reference
speaker clip under server/app/voices/<voiceId>.wav that XTTS clones from —
source/record these per character during Phase 1 step 7.
"""

import os
import tempfile
import threading

_model = None
_lock = threading.Lock()

VOICE_REFERENCE_DIR = "app/voices"

# XTTS ships built-in preset speakers usable via `speaker=` with no reference
# clip. Falls back to this until real per-character reference wavs are
# sourced (still an open item — see plan) so the pipeline is testable now.
FALLBACK_PRESET_SPEAKER = "Claribel Dervla"


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

    # Coqui's tts_to_file writes to a real path on disk, not a file-like
    # object, hence the temp file round-trip rather than an in-memory buffer.
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = os.path.join(tmp_dir, "out.wav")
        if os.path.exists(reference_wav):
            _model.tts_to_file(text=text, speaker_wav=reference_wav, language="en", file_path=tmp_path)
        else:
            _model.tts_to_file(text=text, speaker=FALLBACK_PRESET_SPEAKER, language="en", file_path=tmp_path)
        with open(tmp_path, "rb") as f:
            return f.read()
