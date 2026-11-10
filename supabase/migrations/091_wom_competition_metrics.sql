-- Competitions that track more than one skill or boss (e.g. a Boss of the
-- Week covering Vorkath and Zulrah). `metric` stays as the first one, so
-- anything that reads a single metric keeps working; `metrics` is the full
-- list (null for older single-metric competitions).
alter table public.wom_competitions add column if not exists metrics text[];
