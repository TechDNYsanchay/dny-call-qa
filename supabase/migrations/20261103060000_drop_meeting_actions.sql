-- The meeting recap's next steps are removed from this app (2026-11-03): the call-to-action feature
-- will be built separately. The table never held real data.

set search_path = qa, extensions;

drop table if exists meeting_actions;
