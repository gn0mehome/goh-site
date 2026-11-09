-- Every message the site's bot posts to Discord (not DMs), so staff can find
-- and edit it later from Admin › Discord Posts › Bot Posts (or the Weekly
-- SOTW/BotW page for the weekly posts). Discord only lets the bot that sent
-- a message change it, so this is the only way to fix a typo after posting.
create table if not exists bot_posts (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null,
  message_id text not null unique,
  -- Which part of the site posted it, e.g. 'weekly_forum', 'announcement'.
  source text,
  -- A short name for the list: the forum post title, or what it was for.
  label text,
  content text not null default '',
  has_poll boolean not null default false,
  has_images boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  edited_by text
);
create index if not exists bot_posts_created_idx on bot_posts(created_at desc);
create index if not exists bot_posts_source_idx on bot_posts(source, created_at desc);
alter table bot_posts enable row level security;

-- New permission: edit the bot's Discord posts. Given to every rank that can
-- already manage events (they post most of what the bot sends).
insert into role_permissions (role, permission, granted)
select role, 'edit_bot_posts', granted from role_permissions where permission = 'manage_events'
on conflict (role, permission) do nothing;
