-- Meetings set up outside the app (on someone's own calendar) and added to it by their Meet link
-- (2026-11-19). The app puts a copy on the recording account's calendar so tl;dv records it, without
-- emailing anyone; cancelling it in the app removes only that copy, again without emails.
alter table meeting_bookings add column if not exists existing boolean not null default false;
