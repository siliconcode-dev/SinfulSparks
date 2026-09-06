"""
Text-to-speech via Groq's hosted Orpheus TTS API (see plan pivot: replaces
the self-hosted XTTS approach — no GPU needed). Client falls back to the
browser's SpeechSynthesis if this is unreachable (see plan: TTS).

Voice distinctness trade-off: Groq's English Orpheus model ships only 6
preset voices (autumn, diana, hannah = female-coded; austin, daniel, troy =
male-coded) — no custom voice cloning on the free tier. With 5 female
characters in the roster, full 1-to-1 voice distinctness isn't possible on
this API; two characters share a voice (see roster.free.json / characters.py
voice assignments). Revisit with a paid cloning service if that becomes a
real problem later.

The API also caps `input` at 200 characters per request, so longer replies
are chunked on sentence boundaries and the resulting WAV files are
concatenated into one.
"""

import io
import os
import re
import wave

import requests

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_SPEECH_URL = "https://api.groq.com/openai/v1/audio/speech"
MODEL_NAME = "canopylabs/orpheus-v1-english"
MAX_CHUNK_CHARS = 190  # a little under the API's 200-char cap for safety


def _chunk_text(text: str, max_len: int = MAX_CHUNK_CHARS) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        candidate = f"{current} {sentence}".strip()
        if len(candidate) <= max_len:
            current = candidate
        else:
            if current:
                chunks.append(current)
            current = sentence[:max_len]
    if current:
        chunks.append(current)
    return chunks or [text[:max_len]]


def _synthesize_chunk(text: str, voice: str) -> bytes:
    response = requests.post(
        GROQ_SPEECH_URL,
        headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
        json={"model": MODEL_NAME, "input": text, "voice": voice, "response_format": "wav"},
        timeout=30,
    )
    response.raise_for_status()
    return response.content


def _parse_wav(wav_bytes: bytes) -> tuple[bytes, int, int, int]:
    # Groq's WAV output uses the streaming placeholder size (0xFFFFFFFF) in
    # the RIFF/data chunk headers. Python's `wave` module's reader trusts
    # that declared size rather than actual bytes present — readframes()
    # ends up requesting ~4GB or reads (2^32 / frame_size), which blows up
    # downstream when writing. Parsing the header by hand and taking
    # everything after the 'data' marker as the real PCM sidesteps that.
    fmt_idx = wav_bytes.index(b"fmt ")
    channels = int.from_bytes(wav_bytes[fmt_idx + 10 : fmt_idx + 12], "little")
    sample_rate = int.from_bytes(wav_bytes[fmt_idx + 12 : fmt_idx + 16], "little")
    bits_per_sample = int.from_bytes(wav_bytes[fmt_idx + 22 : fmt_idx + 24], "little")
    data_idx = wav_bytes.index(b"data", fmt_idx)
    pcm = wav_bytes[data_idx + 8 :]
    return pcm, channels, sample_rate, bits_per_sample // 8


def _concatenate_wavs(wav_chunks: list[bytes]) -> bytes:
    pcm_parts = []
    channels = sample_rate = sample_width = None
    for chunk in wav_chunks:
        pcm, ch, rate, width = _parse_wav(chunk)
        channels, sample_rate, sample_width = ch, rate, width
        pcm_parts.append(pcm)

    output = io.BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setnchannels(channels)
        writer.setsampwidth(sample_width)
        writer.setframerate(sample_rate)
        writer.writeframes(b"".join(pcm_parts))
    return output.getvalue()


def synthesize(text: str, voice: str) -> bytes:
    chunks = _chunk_text(text)
    wav_chunks = [_synthesize_chunk(chunk, voice) for chunk in chunks]
    return _concatenate_wavs(wav_chunks)
