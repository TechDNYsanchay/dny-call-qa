-- One row per report email sent, so re-running the 8 am job never sends the same report twice.
create table report_sends (
  report_date date not null,
  kind text not null check (kind in ('person', 'team')),
  -- The person's id for a person's report; 'team' for the founders' summary.
  subject_key text not null,
  recipient text not null,
  sent_at timestamptz not null default now(),
  primary key (report_date, kind, subject_key, recipient)
);

-- Only the pipeline (secret key) reads and writes it; no policies for signed-in users.
alter table report_sends enable row level security;
