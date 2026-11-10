-- Bingo Night word lists, edited under Admin › Settings › Bingo Night Word
-- Lists. A game copies its list's words when it's saved, so changing or
-- deleting a list never changes a game that's already set up or live.
-- The two built-in lists are added with their old keys as ids, so games that
-- already point at them (word_set = 'osrs_classic' etc.) keep working.

create table if not exists bingo_night_word_lists (
  id text primary key default gen_random_uuid()::text,
  name text not null check (length(name) between 1 and 60),
  words jsonb not null default '[]',
  sort integer not null default 0,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Only the server (service role) reads and writes it.
alter table bingo_night_word_lists enable row level security;

insert into bingo_night_word_lists (id, name, words, sort) values
  ('osrs_classic', 'OSRS Classic', '["Lumbridge", "Varrock", "Falador", "Draynor Village", "Grand Exchange", "Wilderness", "Gnome Stronghold", "Castle Wars", "Karamja", "Barbarian Village", "Abyssal whip", "Dragon scimitar", "Rune platebody", "Party hat", "Fire cape", "Twisted bow", "Granite maul", "Amulet of glory", "Dharok''s greataxe", "Old school bond", "Shark", "Lobster", "King Black Dragon", "Zulrah", "Vorkath", "TzTok-Jad", "Giant Mole", "Gnome child", "Hans", "Duke Horacio", "Cow", "Clue scroll", "Pest Control", "Barrows", "Wintertodt", "Tempoross", "Fight Caves", "Chambers of Xeric", "Theatre of Blood", "Tombs of Amascut", "Slayer task", "Rooftop agility", "Gnome glider", "Gnome ball", "Random event", "Level up", "Skill cape", "Max cape", "Special attack", "Prayer flick"]'::jsonb, 0),
  ('friendsgiving_feast', 'Friendsgiving Feast', '["Chocolate bomb", "Toad batta", "Fruit batta", "Worm hole", "Tangled toad''s legs", "Fruit blast", "Pineapple punch", "Blurberry special", "Wizard blizzard", "Apple pie", "Meat pie", "Redberry pie", "Garden pie", "Summer pie", "Wild pie", "Admiral pie", "Mushroom pie", "Baked potato", "Potato with cheese", "Chilli potato", "Egg potato", "Tuna potato", "Mushroom potato", "Cooked chicken", "Stew", "Curry", "Plain pizza", "Meat pizza", "Pineapple pizza", "Ugthanki kebab", "Lobster", "Swordfish", "Monkfish", "Shark", "Karambwan", "Anglerfish", "Cake", "Chocolate cake", "Jug of wine", "Cup of tea"]'::jsonb, 1)
on conflict (id) do nothing;
