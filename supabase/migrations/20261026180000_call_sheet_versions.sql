-- Call sheet versions: each published version of FC-01 / LC-01 keeps its question list, so
-- scoring follows the latest one and older scores show the questions they were scored against
-- (call_scores.reference_version_ids).
alter table reference_versions add column questions jsonb;

-- Private bucket for the uploaded sheet PDFs (read through short-lived links).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('references', 'references', false, 4194304, array['application/pdf'])
on conflict (id) do nothing;
