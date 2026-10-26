-- Transcription: which service transcribed a call, retries, and the two functions the
-- pipeline uses. Speaker roles (executive or client) stay 'unknown' here; the scoring
-- run decides them from what each speaker says.

alter table calls
  add column transcript_provider text,
  add column transcript_attempts smallint not null default 0,
  add column transcript_error text,
  add column transcript_started_at timestamptz,
  add column transcribed_at timestamptz;

create index calls_to_transcribe_idx on calls (started_at) where transcript_status in ('pending', 'processing');

-- Hands out the oldest call waiting for a transcript, so two runs never take the same one.
-- Only calls by active executives and consultants with a stored recording are taken; calls
-- from phones not on the team list wait until that person is added. A call whose last try
-- failed waits p_retry_after before the next; a run that died mid-call (still 'processing'
-- after p_stale_after) is retried too, up to p_max_attempts in all.
create function claim_call_for_transcription(
  p_stale_after interval default '20 minutes',
  p_retry_after interval default '10 minutes',
  p_max_attempts integer default 3
)
returns table (call_id uuid, path text, duration integer, started timestamptz, attempt smallint)
language plpgsql set search_path = public as $$
begin
  update calls
  set transcript_status = 'failed', transcript_error = coalesce(transcript_error, 'stopped responding')
  where transcript_status = 'processing'
    and transcript_started_at < now() - p_stale_after
    and transcript_attempts >= p_max_attempts;

  return query
  update calls c
  set transcript_status = 'processing',
      transcript_started_at = now(),
      transcript_attempts = c.transcript_attempts + 1
  where c.id = (
    select c2.id
    from calls c2
    join people p on p.id = c2.person_id
    where p.active
      and p.role in ('executive', 'consultant')
      and c2.recording_status = 'available'
      and c2.recording_path is not null
      and c2.transcript_attempts < p_max_attempts
      and ((c2.transcript_status = 'pending' and (c2.transcript_error is null or c2.transcript_started_at < now() - p_retry_after))
        or (c2.transcript_status = 'processing' and c2.transcript_started_at < now() - p_stale_after))
    order by c2.started_at
    limit 1
    for update of c2 skip locked
  )
  returning c.id, c.recording_path, c.duration_sec, c.started_at, c.transcript_attempts;
end
$$;

-- Replaces a call's transcript in one step and moves the call on to scoring.
-- p_segments: [{ "speaker": "1", "startSec": 0.5, "endSec": 4.2, "text": "..." }, ...]
create function save_transcript(p_call_id uuid, p_provider text, p_segments jsonb) returns void
language plpgsql set search_path = public as $$
begin
  delete from transcript_segments where call_id = p_call_id;
  insert into transcript_segments (call_id, idx, speaker_label, start_sec, end_sec, text)
  select p_call_id, (s.ord - 1)::integer, s.value ->> 'speaker', (s.value ->> 'startSec')::numeric, (s.value ->> 'endSec')::numeric, s.value ->> 'text'
  from jsonb_array_elements(p_segments) with ordinality as s(value, ord);

  update calls
  set transcript_status = 'done',
      transcript_provider = p_provider,
      transcribed_at = now(),
      transcript_error = null,
      scoring_status = case when scoring_status = 'waiting' then 'ready'::scoring_status else scoring_status end
  where id = p_call_id;
end
$$;

revoke all on function claim_call_for_transcription(interval, interval, integer) from public, anon, authenticated;
revoke all on function save_transcript(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function claim_call_for_transcription(interval, interval, integer) to service_role;
grant execute on function save_transcript(uuid, text, jsonb) to service_role;
