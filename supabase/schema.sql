-- Supabase schema (see plan: Auth, Data Retention & Monetization).
-- Auth (Google OAuth + email/magic-link) is handled by Supabase's built-in
-- auth.users table; these are the app-specific tables layered on top.

create table if not exists character_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade, -- null for anonymous sessions
  anonymous_session_id text, -- browser-generated id, used when user_id is null
  character_id text not null,
  interest integer not null default 40,
  rejected boolean not null default false,
  kissed boolean not null default false,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint one_identity_per_row check (
    (user_id is not null and anonymous_session_id is null) or
    (user_id is null and anonymous_session_id is not null)
  )
);

create index if not exists idx_character_progress_user on character_progress(user_id);
create index if not exists idx_character_progress_anon on character_progress(anonymous_session_id);

-- Moderation log: only flagged interactions, not full conversation history
-- (see plan: Content Safety — logging).
create table if not exists conversation_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_session_id text,
  character_id text not null,
  direction text not null check (direction in ('input', 'output')),
  reason text not null,
  flagged_text text not null,
  created_at timestamptz not null default now()
);

-- Retention (see plan: Auth, Data Retention — 12h nudge / 48h delete for
-- anonymous sessions; signed-in users' progress persists indefinitely).
-- Run on a schedule (Supabase's pg_cron extension, or an external scheduled
-- job) — this deletes anonymous rows untouched for 48h; signed-in rows
-- (user_id is not null) are never touched by this.
create or replace function purge_stale_anonymous_progress() returns void as $$
  delete from character_progress
  where user_id is null
    and updated_at < now() - interval '48 hours';
$$ language sql;
