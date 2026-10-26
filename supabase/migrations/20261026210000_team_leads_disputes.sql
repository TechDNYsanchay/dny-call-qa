-- App settings edited on the Team members page, e.g. where reports go while testing.
create table app_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references people (id)
);
-- Read and written only by the server after checking the signed-in person's role.
alter table app_settings enable row level security;

-- Lead outcome, set by founders, managers and admins; it feeds the sales funnel.
alter table leads
  add constraint leads_status_check check (status in ('open', 'vc_held', 'proposal', 'won', 'lost')),
  add column status_updated_at timestamptz,
  add column notes text;

-- An executive's dispute of their score; a founder's review resolves it.
alter table call_scores
  add column dispute_comment text,
  add column disputed_at timestamptz,
  add column disputed_by uuid references people (id),
  add column dispute_resolved_at timestamptz;
