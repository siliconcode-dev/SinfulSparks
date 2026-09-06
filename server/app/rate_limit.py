"""
Per-user request rate limiting (see plan: Rate limiting), independent of the
free/premium character-count caps — protects against runaway loops or
scripted abuse driving up GPU cost on a public deployment.

NOTE: in-memory and per-instance. Fine while Cloud Run stays near
min-instances=0/1 for the MVP, but once traffic causes multiple concurrent
instances, this needs a shared store (Supabase table or Redis) instead —
flagged here rather than silently left as a scaling gap.
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException

WINDOW_SECONDS = 60
MAX_REQUESTS_PER_WINDOW = 20

_requests: dict[str, deque] = defaultdict(deque)


def check_rate_limit(identity: str) -> None:
    now = time.monotonic()
    window = _requests[identity]
    while window and now - window[0] > WINDOW_SECONDS:
        window.popleft()
    if len(window) >= MAX_REQUESTS_PER_WINDOW:
        raise HTTPException(status_code=429, detail="rate_limited")
    window.append(now)
