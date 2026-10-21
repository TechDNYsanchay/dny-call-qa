-- People can be tracked by their Callyzer phone before anyone knows their email.
-- Without an email they can't sign in or get the 8 am email, but their calls still link to them.
alter table people alter column email drop not null;
alter table people add constraint people_login_needs_email check (auth_user_id is null or email is not null);
alter table people add constraint people_email_or_phone check (email is not null or callyzer_phone is not null);
