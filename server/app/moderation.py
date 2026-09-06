"""
Moderation layer: runs on every player input before it reaches the LLM, and
on every LLM output before it reaches the player (see plan: Content Safety).

This baseline is a rules/keyword pass for Phase 1. Per the plan's Language
Style & Slang Handling section, a keyword blocklist alone will misfire on
normal flirty banter ("you're hot", playful teasing) — Phase 2 replaces/
augments this with a classifier calibrated on labeled examples distinguishing
acceptable flirty banter from actually crude/explicit content. Until then,
this intentionally errs toward a short, clearly-explicit term list rather
than broad word matching, to limit false positives on ordinary flirting.
"""

import re

# Deliberately narrow for Phase 1 — explicit/graphic sexual terms only, not
# general "hot/sexy/cute" flirty vocabulary. Expand via the Phase 2
# calibration set, not by widening this list ad hoc.
_EXPLICIT_PATTERN = re.compile(
    r"\b(sex|fuck|nude|naked|porn|dick|pussy|blowjob|hardcore)\b",
    re.IGNORECASE,
)

REBUFF_LINES = [
    "Whoa, let's keep it PG — try that again.",
    "That's a hard pass. Say something else.",
    "Not the vibe. Try a different approach.",
]


def check_player_input(text: str) -> dict:
    if _EXPLICIT_PATTERN.search(text):
        return {"flagged": True, "reason": "explicit_input"}
    return {"flagged": False, "reason": None}


def check_model_output(text: str) -> dict:
    if _EXPLICIT_PATTERN.search(text):
        return {"flagged": True, "reason": "explicit_output"}
    return {"flagged": False, "reason": None}


def rebuff_line(index: int = 0) -> str:
    return REBUFF_LINES[index % len(REBUFF_LINES)]
