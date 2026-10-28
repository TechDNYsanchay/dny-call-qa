-- A second, independent scoring of calls that are Red or close to a band line, done by a later
-- run of the scoring routine. The first score stands; when the two disagree (more than 10 points,
-- or a hard fail only one of them found) the call is flagged for a founder's look until reviewed.
alter table call_scores add column second_opinion jsonb;

comment on column call_scores.second_opinion is
  '{ score, band, levels, hardFails, at }: a later run''s independent score of the same call';
