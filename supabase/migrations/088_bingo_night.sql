-- Bingo Night: a live bingo game anyone can play at /bingo-night (no login),
-- called by a staff host from Admin › Events › Bingo Night and shown on a
-- stream view. The game logic is lib/bingo-night/core.ts; everything here is
-- written by the server only (RLS on, no policies).

create table if not exists bingo_night_games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  theme text not null default 'gnome',
  card_mode text not null check (card_mode in ('numbers', 'words')),
  word_set text,                       -- built-in set key, or null for a custom list
  words jsonb,                         -- the word list (word games only)
  winner_message text not null default '',
  status text not null default 'draft' check (status in ('draft', 'live', 'finished')),
  scheduled_for timestamptz,           -- shown on the empty page as the next game
  current_round_id uuid,
  host_id text,                        -- the one-host lock
  host_name text,
  host_last_seen timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  launched_at timestamptz,
  ended_at timestamptz
);
-- Only one game can be live at a time.
create unique index if not exists bingo_night_one_live on bingo_night_games ((true)) where status = 'live';

create table if not exists bingo_night_rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references bingo_night_games(id) on delete cascade,
  number integer not null,
  pattern text not null,
  status text not null default 'open' check (status in ('open', 'live', 'closed')),
  calls jsonb not null default '[]',   -- [{ v: value, at: iso time }] in order
  call_count integer not null default 0,  -- the double-draw guard: updates match on it
  winner_card_ids uuid[] not null default '{}',
  opened_at timestamptz not null default now(),
  started_at timestamptz,
  closed_at timestamptz,
  unique (game_id, number)
);

create table if not exists bingo_night_cards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references bingo_night_games(id) on delete cascade,
  rsn text not null,
  rsn_key text not null,               -- for flagging the same RSN on two cards
  user_id uuid,                        -- logged-in player (for the member badge)
  member boolean not null default false,
  player_key_hash text not null,
  ip_hash text,
  squares jsonb not null,              -- 25 values in grid order, null at the free center
  signature text not null,
  issued_for_round integer not null default 0,
  replaced_by uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (game_id, signature)
);
create index if not exists bingo_night_cards_player on bingo_night_cards (game_id, player_key_hash) where active;
create index if not exists bingo_night_cards_ip on bingo_night_cards (ip_hash, created_at);

create table if not exists bingo_night_claims (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references bingo_night_games(id) on delete cascade,
  round_id uuid not null references bingo_night_rounds(id) on delete cascade,
  card_id uuid not null references bingo_night_cards(id) on delete cascade,
  call_count integer not null,
  valid boolean not null,
  matched jsonb,                       -- the completed set's positions
  won_at_call integer,                 -- the call the card first won on (who had it first)
  status text not null default 'pending' check (status in ('pending', 'not_bingo', 'confirmed', 'rejected')),
  note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bingo_night_claims_round on bingo_night_claims (round_id, created_at);
create index if not exists bingo_night_claims_card on bingo_night_claims (card_id, round_id);

alter table bingo_night_games enable row level security;
alter table bingo_night_rounds enable row level security;
alter table bingo_night_cards enable row level security;
alter table bingo_night_claims enable row level security;

-- Hosting is open to every staff rank (the ones that can manage events).
insert into role_permissions (role, permission, granted)
select role, 'host_bingo_night', granted from role_permissions where permission = 'manage_events'
on conflict (role, permission) do nothing;
