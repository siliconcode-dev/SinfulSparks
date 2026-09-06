"""
Speech-to-text via Groq's hosted Whisper API (see plan pivot: replaces the
self-hosted GPU approach — no GPU needed at all now). Client still falls
back to the browser's Web Speech API if this is unreachable (see plan: STT).
"""

import os

import requests

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions"

# whisper-large-v3-turbo is fast and accurate; distil-whisper-large-v3-en is
# faster still if English-only latency becomes a concern (see plan: STT is
# English-only for the MVP).
MODEL_NAME = os.environ.get("GROQ_STT_MODEL", "whisper-large-v3-turbo")

# Biases transcription toward expected casual/flirty phrasing rather than
# assuming formal English (see plan: Language Style & Slang Handling).
INITIAL_PROMPT = "Casual conversational speech, flirting, dating small talk."


def transcribe(audio_bytes: bytes) -> str:
    response = requests.post(
        GROQ_TRANSCRIPTION_URL,
        headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
        files={"file": ("speech.webm", audio_bytes, "audio/webm")},
        data={"model": MODEL_NAME, "language": "en", "prompt": INITIAL_PROMPT},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["text"].strip()
