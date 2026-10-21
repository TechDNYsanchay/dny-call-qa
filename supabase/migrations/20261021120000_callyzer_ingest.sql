-- Callyzer ingest: what the webhook stores before transcription, and private storage for recordings.

-- A call between arrival and scoring (recording download, transcription, scoring queue).
alter type scoring_status add value if not exists 'waiting' before 'ready';

alter table calls
  -- The executive's phone as Callyzer reports it (E.164). Calls from a number that isn't on the
  -- team list yet keep it here, so they can be linked when the person is added.
  add column agent_phone text,
  add column call_direction text check (call_direction in ('incoming', 'outgoing', 'missed', 'rejected', 'other')),
  -- Where Callyzer serves the recording; the file itself is copied into the recordings bucket.
  add column recording_source_url text;

create index calls_agent_phone_idx on calls (agent_phone) where person_id is null;

-- Recordings stay private: no public URL. The app streams them with short-lived signed URLs after
-- checking (with row-level security) that the viewer may see the call.
insert into storage.buckets (id, name, public, file_size_limit)
values ('recordings', 'recordings', false, 104857600)
on conflict (id) do nothing;
