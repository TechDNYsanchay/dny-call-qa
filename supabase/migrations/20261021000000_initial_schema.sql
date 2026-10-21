-- DNY Sales Agent: initial schema.
-- People, leads, calls, transcripts, measured metrics, scores, reference documents and daily reports.
--
-- Access:
--   * Founders, managers and admins see everything; executives and consultants see only their own calls.
--   * The Vercel pipeline writes with the service role.
--   * The nightly scoring routine uses the scoring_agent role: it reads what scoring needs and writes
--     only through record_call_score, record_lead_capture and mark_scoring_failed. It cannot change a
--     lead's stage, owner or value (brief section 7).

create type person_role as enum ('founder', 'manager', 'executive', 'consultant', 'admin');
create type call_stream as enum ('first_call', 'vision_call');
create type call_source as enum ('callyzer', 'tldv', 'upload');
create type recording_status as enum ('pending', 'available', 'missing', 'declined', 'deleted');
create type transcript_status as enum ('not_needed', 'pending', 'processing', 'done', 'failed');
create type scoring_status as enum ('not_eligible', 'ready', 'scored', 'failed');
create type score_band as enum ('green', 'amber', 'red');
create type reference_kind as enum ('first_call_sheet', 'vision_call_sheet', 'service_master', 'case_studies', 'brief');

create table people (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  full_name text not null,
  email text not null unique,
  role person_role not null,
  callyzer_phone text unique,
  tldv_email text unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- No CRM yet: the app keeps its own lead records.
create table leads (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  email text,
  name text,
  city text,
  -- Edited only by people on the lead page; the scoring routine never writes these.
  stage smallint check (stage in (1, 2)),
  owner_id uuid references people (id),
  value_inr numeric(14, 2),
  status text not null default 'open',
  -- Written by the scoring routine through record_lead_capture.
  first_call_capture jsonb,
  vision_call_capture jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_email_idx on leads (lower(email));

create table calls (
  id uuid primary key default gen_random_uuid(),
  stream call_stream not null,
  source call_source not null,
  source_id text not null,
  person_id uuid references people (id),
  lead_id uuid references leads (id),
  client_phone text,
  client_email text,
  started_at timestamptz not null,
  duration_sec integer not null check (duration_sec >= 0),
  recording_path text,
  recording_status recording_status not null default 'pending',
  transcript_status transcript_status not null default 'pending',
  scoring_status scoring_status not null default 'not_eligible',
  not_scored_reason text,
  -- Retention: recordings and transcripts are deleted after this (10 days, pending confirmation).
  delete_media_after timestamptz,
  created_at timestamptz not null default now(),
  unique (source, source_id)
);
create index calls_person_started_idx on calls (person_id, started_at);
create index calls_ready_idx on calls (started_at) where scoring_status = 'ready';

create table transcript_segments (
  id bigint generated always as identity primary key,
  call_id uuid not null references calls (id) on delete cascade,
  idx integer not null,
  speaker_label text not null,
  role text not null default 'unknown' check (role in ('agent', 'client', 'unknown')),
  start_sec numeric(8, 2) not null,
  end_sec numeric(8, 2) not null,
  text text not null,
  topic text check (topic in ('client_story', 'dny_credentials', 'services', 'fees', 'other')),
  unique (call_id, idx)
);

create table call_metrics (
  call_id uuid primary key references calls (id) on delete cascade,
  agent_talk_sec numeric(8, 2) not null,
  client_talk_sec numeric(8, 2) not null,
  client_share numeric(5, 4) not null,
  agent_share_first_half numeric(5, 4) not null,
  silences_over_8s integer not null,
  longest_silence_sec numeric(8, 2) not null,
  noise_dbfs numeric(6, 2),
  credentials_sec numeric(8, 2) not null default 0,
  service_share_of_agent numeric(5, 4) not null default 0,
  computed_at timestamptz not null default now()
);

-- Versioned call sheets, Service Master, case studies and brief. A new upload = a new version.
create table reference_versions (
  id uuid primary key default gen_random_uuid(),
  kind reference_kind not null,
  version integer not null,
  label text not null,
  storage_path text,
  notes text,
  created_by uuid references people (id),
  created_at timestamptz not null default now(),
  unique (kind, version)
);

create table call_scores (
  call_id uuid primary key references calls (id) on delete cascade,
  rubric_version text not null,
  reference_version_ids uuid[] not null default '{}',
  score numeric(4, 1) not null check (score between 0 and 100),
  band score_band not null,
  levels jsonb not null,
  hard_fails text[] not null default '{}',
  overrides text[] not null default '{}',
  -- The validated model output: areas, coverage, evidence quotes, feedback. Kept after media is deleted.
  result jsonb not null,
  scored_at timestamptz not null default now(),
  overridden_by uuid references people (id),
  override_reason text
);

create table daily_reports (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id),
  report_date date not null,
  summary jsonb not null,
  sent_at timestamptz,
  unique (person_id, report_date)
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

create function current_person_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from people where auth_user_id = auth.uid() and active
$$;

create function can_see_all() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from people
    where auth_user_id = auth.uid() and active and role in ('founder', 'manager', 'admin')
  )
$$;

alter table people enable row level security;
alter table leads enable row level security;
alter table calls enable row level security;
alter table transcript_segments enable row level security;
alter table call_metrics enable row level security;
alter table reference_versions enable row level security;
alter table call_scores enable row level security;
alter table daily_reports enable row level security;

create policy people_read on people for select to authenticated
  using (can_see_all() or id = current_person_id());

create policy calls_read on calls for select to authenticated
  using (can_see_all() or person_id = current_person_id());

create policy segments_read on transcript_segments for select to authenticated
  using (exists (select 1 from calls c where c.id = call_id and (can_see_all() or c.person_id = current_person_id())));

create policy metrics_read on call_metrics for select to authenticated
  using (exists (select 1 from calls c where c.id = call_id and (can_see_all() or c.person_id = current_person_id())));

create policy scores_read on call_scores for select to authenticated
  using (exists (select 1 from calls c where c.id = call_id and (can_see_all() or c.person_id = current_person_id())));

create policy leads_read on leads for select to authenticated
  using (
    can_see_all()
    or owner_id = current_person_id()
    or exists (select 1 from calls c where c.lead_id = leads.id and c.person_id = current_person_id())
  );

-- Stage, owner and value are changed by founders, managers and admins only.
create policy leads_update on leads for update to authenticated
  using (can_see_all()) with check (can_see_all());

create policy references_read on reference_versions for select to authenticated using (true);
create policy references_insert on reference_versions for insert to authenticated with check (can_see_all());

create policy reports_read on daily_reports for select to authenticated
  using (can_see_all() or person_id = current_person_id());

-- ---------------------------------------------------------------------------
-- Scoring routine: restricted role and the only functions it may write through
-- ---------------------------------------------------------------------------

create function record_call_score(
  p_call_id uuid,
  p_rubric_version text,
  p_reference_version_ids uuid[],
  p_score numeric,
  p_band score_band,
  p_levels jsonb,
  p_hard_fails text[],
  p_overrides text[],
  p_result jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into call_scores (call_id, rubric_version, reference_version_ids, score, band, levels, hard_fails, overrides, result)
  values (p_call_id, p_rubric_version, p_reference_version_ids, p_score, p_band, p_levels, p_hard_fails, p_overrides, p_result)
  on conflict (call_id) do update set
    rubric_version = excluded.rubric_version,
    reference_version_ids = excluded.reference_version_ids,
    score = excluded.score,
    band = excluded.band,
    levels = excluded.levels,
    hard_fails = excluded.hard_fails,
    overrides = excluded.overrides,
    result = excluded.result,
    scored_at = now()
  -- Never overwrite a score a manager has overridden.
  where call_scores.overridden_by is null;

  update calls set scoring_status = 'scored' where id = p_call_id;
end
$$;

create function record_lead_capture(p_lead_id uuid, p_stream call_stream, p_capture jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_stream = 'first_call' then
    update leads set first_call_capture = p_capture, updated_at = now() where id = p_lead_id;
  else
    update leads set vision_call_capture = p_capture, updated_at = now() where id = p_lead_id;
  end if;
end
$$;

create function mark_scoring_failed(p_call_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update calls set scoring_status = 'failed', not_scored_reason = p_reason where id = p_call_id;
end
$$;

revoke all on function record_call_score(uuid, text, uuid[], numeric, score_band, jsonb, text[], text[], jsonb) from public, anon, authenticated;
revoke all on function record_lead_capture(uuid, call_stream, jsonb) from public, anon, authenticated;
revoke all on function mark_scoring_failed(uuid, text) from public, anon, authenticated;

-- Login and password for this role are set once in the Supabase dashboard, never in this repo.
create role scoring_agent nologin;
grant usage on schema public to scoring_agent;
grant select on calls, transcript_segments, call_metrics, reference_versions, leads, people to scoring_agent;
grant execute on function record_call_score(uuid, text, uuid[], numeric, score_band, jsonb, text[], text[], jsonb) to scoring_agent, service_role;
grant execute on function record_lead_capture(uuid, call_stream, jsonb) to scoring_agent, service_role;
grant execute on function mark_scoring_failed(uuid, text) to scoring_agent, service_role;

create policy scoring_read_calls on calls for select to scoring_agent using (true);
create policy scoring_read_segments on transcript_segments for select to scoring_agent using (true);
create policy scoring_read_metrics on call_metrics for select to scoring_agent using (true);
create policy scoring_read_references on reference_versions for select to scoring_agent using (true);
create policy scoring_read_leads on leads for select to scoring_agent using (true);
create policy scoring_read_people on people for select to scoring_agent using (true);
