-- The weekly SOTW / BotW voting poll, watched until it closes: which skill
-- or boss(es) each Discord poll answer stands for, and what happened when it
-- closed (competition created, a tie or no votes waiting for staff, or an
-- error). See lib/weekly-poll.ts.
create table if not exists weekly_vote_polls (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references polls(id) on delete set null,
  channel_id text not null,
  message_id text not null,
  kind text not null check (kind in ('sotw', 'botw')),
  -- The Sunday the winning competition starts (8 PM Eastern), as on the poll.
  week_start date not null,
  -- [{ answer_id, label, metrics: [wom metric, ...] }]
  options jsonb not null,
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'created', 'tie', 'no_votes', 'waiting', 'failed', 'skipped')),
  vote_counts jsonb,
  winning_answer_id integer,
  competition_wom_ids integer[] not null default '{}',
  note text,
  attempts integer not null default 0,
  processed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists weekly_vote_polls_status_idx on weekly_vote_polls(status, closes_at);
alter table weekly_vote_polls enable row level security;

-- What to do when a weekly poll closes.
alter table weekly_competition_config
  add column if not exists poll_auto_create boolean not null default true,
  add column if not exists poll_winner_count integer not null default 10,
  add column if not exists poll_announce boolean not null default false;
