-- Competition insights: a copy of every Wise Old Man competition in the clan's
-- group and who gained in it, so staff can see engagement over time (who
-- competes, how often, who's winning) without asking WOM for every page view.
-- Filled in by lib/competition-insights.ts from WOM; WOM stays the source of
-- truth. Only participants who actually gained are stored; participant_count
-- keeps the full entrant total.

create table if not exists competition_results (
  wom_id integer primary key,
  title text not null,
  metric text not null,
  kind text not null check (kind in ('sotw', 'botw', 'other')),
  type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  participant_count integer not null default 0,
  active_count integer not null default 0,
  -- Staff override for one boss week; null = the boss's tier from boss_difficulties.
  difficulty text check (difficulty in ('easy', 'hard')),
  final boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists competition_results_starts_idx on competition_results(starts_at desc);

create table if not exists competition_result_players (
  wom_id integer not null references competition_results(wom_id) on delete cascade,
  player_id integer not null,
  username text not null,
  display_name text not null,
  gained double precision not null,
  rank integer not null,
  primary key (wom_id, player_id)
);
create index if not exists competition_result_players_player_idx on competition_result_players(player_id);

alter table competition_results enable row level security;
alter table competition_result_players enable row level security;

-- Easy / Hard tier for each boss and raid (WOM metric), set on Admin ›
-- Settings › Boss Difficulty. Bosses not listed use the site's suggestion.
create table if not exists boss_difficulties (
  metric text primary key,
  difficulty text not null check (difficulty in ('easy', 'hard')),
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table boss_difficulties enable row level security;
