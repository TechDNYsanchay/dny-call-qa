-- Missed client calls: when the executive was emailed about one, and when someone marked it handled.
alter table calls
  add column missed_alerted_at timestamptz,
  add column missed_resolved_at timestamptz,
  add column missed_resolved_by uuid references people (id);

-- Moments founders pick from real calls as the example for a call-sheet question. Everyone signed
-- in can read them (that's the point), so the clip is shared even though the call itself isn't.
create table call_examples (
  id uuid primary key default gen_random_uuid(),
  question_id text not null check (question_id ~ '^(fc|lc)\d{2}$'),
  call_id uuid not null references calls (id) on delete cascade,
  start_sec numeric not null check (start_sec >= 0),
  end_sec numeric not null,
  quote text not null,
  created_by uuid references people (id),
  created_at timestamptz not null default now(),
  unique (question_id, call_id, start_sec),
  check (end_sec > start_sec)
);
alter table call_examples enable row level security;
create policy examples_read on call_examples for select to authenticated using (current_person_id() is not null);
-- Pinned and removed by the server after checking the person's role.

-- Searching what was said on calls (ILIKE '%term%' on transcript lines).
create extension if not exists pg_trgm with schema extensions;
create index transcript_segments_text_trgm on transcript_segments using gin (text extensions.gin_trgm_ops);
