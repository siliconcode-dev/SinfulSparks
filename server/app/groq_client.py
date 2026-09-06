"""
Shared Groq request helper with automatic fallback-key retry on rate limits.

The free tier's per-minute/per-day caps are real (see plan pivot discussion)
— a second Groq account's key lets a single busy period fail over instead of
erroring out. Not a way to multiply total free quota long-term, just smooths
over rate-limit spikes.
"""

import os

import requests

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_API_KEY_FALLBACK = os.environ.get("GROQ_API_KEY_FALLBACK", "")


def request(method: str, url: str, **kwargs) -> requests.Response:
    headers = kwargs.pop("headers", {})
    response = requests.request(
        method, url, headers={**headers, "Authorization": f"Bearer {GROQ_API_KEY}"}, **kwargs
    )
    if response.status_code == 429 and GROQ_API_KEY_FALLBACK:
        response = requests.request(
            method, url, headers={**headers, "Authorization": f"Bearer {GROQ_API_KEY_FALLBACK}"}, **kwargs
        )
    return response
