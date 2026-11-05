-- Sales meetings booked from the app (2026-11-05). The app creates the Google Calendar event on the
-- recording account's calendar (it organises; the client, the consultant and the booker are guests),
-- so tl;dv's bot records the meeting. tl;dv sends the Meet code back with the recording, which ties
-- the recording to its booking, its lead and its consultant.

create table meeting_bookings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads (id) on delete set null,
  client_name text not null,
  client_email text not null,
  client_phone text,
  starts_at timestamptz not null,
  duration_min integer not null check (duration_min between 15 and 180),
  notes text,
  -- Who runs the meeting (scored as theirs) and who booked it.
  consultant_id uuid references people (id) on delete set null,
  booked_by uuid references people (id) on delete set null,
  calendar_event_id text,
  meet_url text,
  -- The Meet code ("abc-defg-hij"); tl;dv's extraProperties.conferenceId.
  meet_code text unique,
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  -- The recorded vision call, once tl;dv has sent it.
  call_id uuid references calls (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create index meeting_bookings_starts on meeting_bookings (starts_at);

-- The app writes with the secret key after its own checks; people read their own bookings.
alter table meeting_bookings enable row level security;
create policy bookings_read on meeting_bookings for select to authenticated
  using (can_see_all() or booked_by = current_person_id() or consultant_id = current_person_id());

-- The Google account the app creates meetings with (one row). Its refresh token is a secret:
-- no policies, so only the secret key reads it.
create table google_connection (
  id boolean primary key default true check (id),
  email text not null,
  refresh_token text not null,
  connected_by uuid references people (id) on delete set null,
  connected_at timestamptz not null default now()
);

alter table google_connection enable row level security;
