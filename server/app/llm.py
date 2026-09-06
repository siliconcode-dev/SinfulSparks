"""
LLM inference via Groq's hosted API (see plan pivot: self-hosting a GPU was
blocked by GCP's free-trial GPU restriction; Groq's free tier is generous,
permanent, and needs no GPU quota at all — see conversation for the research
behind this). No local model loading, no GPU, no cold start.

Trade-off: Groq serves fixed pretrained models — no custom LoRA fine-tuning
per character. Character personality comes entirely from the system prompt
(see characters.py), which is genuinely sufficient for an MVP.
"""

import json
import os
import re

from . import groq_client
from .characters import build_system_prompt

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

# Groq's model catalog changes fairly often — llama-3.1-8b-instant (the
# original pick) is no longer served. qwen/qwen3.8-27b gives clean direct
# replies; openai/gpt-oss-20b was tried and rejected — it's a reasoning
# model that burns tokens on hidden chain-of-thought and is slower, a bad
# fit for real-time conversational replies.
MODEL_NAME = os.environ.get("GROQ_LLM_MODEL", "qwen/qwen3.8-27b")

_JSON_TAIL_PATTERN = re.compile(r"\{[^{}]*\"interest_delta\"[^{}]*\}\s*$")


def _split_reply_and_delta(raw_text: str) -> tuple[str, dict]:
    match = _JSON_TAIL_PATTERN.search(raw_text)
    if not match:
        return raw_text.strip(), {"interest_delta": 0, "end_conversation": False}
    reply = raw_text[: match.start()].strip()
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        parsed = {"interest_delta": 0, "end_conversation": False}
    return reply, parsed


def generate_reply(character_id: str, history: list[dict], message: str) -> dict:
    system_prompt = build_system_prompt(character_id)
    messages = [{"role": "system", "content": system_prompt}]
    for turn in history:
        role = "assistant" if turn["role"] == character_id else "user"
        messages.append({"role": role, "content": turn["text"]})
    messages.append({"role": "user", "content": message})

    response = groq_client.request(
        "POST",
        GROQ_CHAT_URL,
        headers={"Content-Type": "application/json"},
        # Capped short on purpose (see characters.py's system prompt): real
        # spoken conversation doesn't run to paragraphs, and a hard token
        # limit backs up the "keep it short" instruction structurally rather
        # than trusting the model to self-limit.
        json={"model": MODEL_NAME, "messages": messages, "temperature": 0.9, "max_tokens": 110},
        timeout=30,
    )
    response.raise_for_status()
    raw_text = response.json()["choices"][0]["message"]["content"]

    reply, parsed = _split_reply_and_delta(raw_text)
    return {
        "reply": reply,
        "interestDelta": int(parsed.get("interest_delta", 0)),
        "endConversation": bool(parsed.get("end_conversation", False)),
    }
