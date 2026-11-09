-- Bingo Night: optional item pictures from the OSRS Wiki on word games.
-- word_icons lines up with words: a wiki image URL, or null for a word
-- with no picture. Found when the game is saved; staff can remove any.
alter table bingo_night_games
  add column if not exists show_pictures boolean not null default false,
  add column if not exists word_icons jsonb;
