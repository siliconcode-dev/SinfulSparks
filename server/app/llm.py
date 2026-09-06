"""
LLM inference wrapper. Lazily loads the model on first request so container
startup (Cloud Run cold start) doesn't pay the load cost until actually
needed — the client's loading screen covers this wait (see plan: Cold start
UX). Swap MODEL_NAME / quantization once Phase 2 LoRA adapters exist (loaded
per-character on top of this base model from server/models/).
"""

import json
import re
import threading

from .characters import build_system_prompt

MODEL_NAME = "Qwen/Qwen2.5-14B-Instruct"  # see plan: LLM Model Shortlist

_model = None
_tokenizer = None
_lock = threading.Lock()


def _ensure_loaded():
    global _model, _tokenizer
    if _model is not None:
        return
    with _lock:
        if _model is not None:
            return
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

        quant_config = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16)
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        _model = AutoModelForCausalLM.from_pretrained(
            MODEL_NAME, quantization_config=quant_config, device_map="auto"
        )
        # Phase 2: load per-character LoRA adapter here, e.g.
        # _model = PeftModel.from_pretrained(_model, f"models/{character_id}")


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
    _ensure_loaded()

    system_prompt = build_system_prompt(character_id)
    messages = [{"role": "system", "content": system_prompt}]
    for turn in history:
        role = "assistant" if turn["role"] == character_id else "user"
        messages.append({"role": role, "content": turn["text"]})
    messages.append({"role": "user", "content": message})

    prompt = _tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = _tokenizer(prompt, return_tensors="pt").to(_model.device)
    output = _model.generate(**inputs, max_new_tokens=220, do_sample=True, temperature=0.8)
    raw_text = _tokenizer.decode(output[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)

    reply, parsed = _split_reply_and_delta(raw_text)
    return {
        "reply": reply,
        "interestDelta": int(parsed.get("interest_delta", 0)),
        "endConversation": bool(parsed.get("end_conversation", False)),
    }
