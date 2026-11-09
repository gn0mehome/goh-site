-- Site colour themes (app/site-themes.css). Admins pick the site's default
-- in Admin › Settings › Site Theme ("auto" follows the holiday calendar);
-- members can override it for themselves on My Account.

create table if not exists site_settings (
  id smallint primary key default 1 check (id = 1),
  theme text not null default 'gnome'
    check (theme in ('auto', 'gnome', 'halloween', 'thanksgiving', 'winter', 'valentines', 'stpatricks', 'july4')),
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into site_settings (id) values (1) on conflict (id) do nothing;
alter table site_settings enable row level security;

-- A member's own theme; null follows the site default.
alter table user_profiles
  add column if not exists site_theme text
    check (site_theme is null or site_theme in ('auto', 'gnome', 'halloween', 'thanksgiving', 'winter', 'valentines', 'stpatricks', 'july4'));
