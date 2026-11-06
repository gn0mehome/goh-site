-- The name a boss goes by in Boss of the Week titles, when it isn't the Wise
-- Old Man name (e.g. "Perilous Moons" for Lunar Chests). Set on Admin ›
-- Settings › Boss Difficulty; the competition builder uses it for the title.
alter table boss_difficulties add column if not exists title_name text;
