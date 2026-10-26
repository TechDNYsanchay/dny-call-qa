-- Founders' reviews of the AI's scores (the brief's calibration). `score`, `band`, `levels` and
-- `hard_fails` become the reviewed values; the ai_* columns keep what the AI gave, so agreement can
-- be measured. overridden_by is the reviewer and override_reason their note (already in place);
-- record_call_score never overwrites a reviewed score.
alter table call_scores
  add column ai_score numeric(4, 1),
  add column ai_band score_band,
  add column ai_levels jsonb,
  add column ai_hard_fails text[],
  add column review_verdict text check (review_verdict in ('agree', 'corrected')),
  add column reviewed_at timestamptz;

-- Alert emails: one row per kind of alert, so a repeating failure mails at most every few hours.
create table alert_log (
  key text primary key,
  last_sent_at timestamptz not null default now(),
  times integer not null default 1
);

-- Only the pipeline (secret key) reads and writes it.
alter table alert_log enable row level security;
