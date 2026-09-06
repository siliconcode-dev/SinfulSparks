"""
Verifies the Supabase session token the client attaches as a Bearer token
(see plan: Backend auth — chosen over a static shared secret specifically
because it identifies individual users, needed for per-user rate limits and
free/premium gating).

Verification goes through Supabase's own Auth API (via the service_role key)
rather than checking the JWT signature locally — this also catches revoked/
signed-out sessions, not just tampered ones. SUPABASE_SERVICE_ROLE_KEY must
only ever be set here (server-side env), never shipped to the client.
"""

import os
from functools import lru_cache

from fastapi import HTTPException, Request
from supabase import Client, create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


@lru_cache
def _admin_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def get_user_id(request: Request) -> str | None:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        # Anonymous sessions are allowed (see plan: Auth, Data Retention) —
        # callers that need a user distinguish None from a real id themselves.
        return None
    token = auth_header.removeprefix("Bearer ").strip()
    try:
        result = _admin_client().auth.get_user(token)
    except Exception as exc:  # supabase-py raises its own AuthApiError variants
        raise HTTPException(status_code=401, detail="invalid_token") from exc
    if not result or not result.user:
        raise HTTPException(status_code=401, detail="invalid_token")
    return result.user.id
