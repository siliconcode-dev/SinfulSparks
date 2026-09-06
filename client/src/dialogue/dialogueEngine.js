import { BACKEND_URL } from '../config.js';

// Talks directly to the Cloud Run backend's /api/dialogue endpoint. The
// backend runs the moderation layer on both the outgoing message and the
// incoming reply before either reaches this client (see plan: Content
// Safety) — this function trusts the backend's response as already-checked.
export async function sendMessage({ characterId, message, history, authToken }) {
  const res = await fetch(`${BACKEND_URL}/api/dialogue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ characterId, message, history }),
  });

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('rate_limited');
    }
    throw new Error(`dialogue_request_failed:${res.status}`);
  }

  // Expected shape: { reply, interestDelta, endConversation, rebuffed }
  return res.json();
}
