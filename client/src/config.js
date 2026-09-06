// Backend origin (Cloud Run URL). Set VITE_BACKEND_URL in client/.env for
// local dev (e.g. http://localhost:8080) and in Vercel project env vars for
// production (the deployed Cloud Run service URL). The client talks to this
// directly — never proxied through Vercel functions (see plan: Architecture).
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const INTEREST_MAX = 100;
export const INTEREST_MIN = 0;
export const REJECTION_THRESHOLD = 10; // dropping to/below this ends the conversation
export const KISS_THRESHOLD = 90; // reaching this triggers the kiss cutscene

export const ANONYMOUS_NUDGE_MS = 12 * 60 * 60 * 1000; // 12h
export const ANONYMOUS_DELETE_MS = 48 * 60 * 60 * 1000; // 48h

export const FREE_TIER_CHARACTER_LIMIT = 5;
export const PREMIUM_TIER_CHARACTER_LIMIT = 7;
