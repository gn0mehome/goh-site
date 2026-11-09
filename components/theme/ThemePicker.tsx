"use client";

import { useEffect, useRef } from "react";
import { AUTO_SCHEDULE, SITE_THEMES, autoTheme, resolveTheme, scheduleText, type SiteThemeChoice, type SiteThemeKey } from "@/lib/site-theme";

/** A tiny mock of the site (navbar, card, button) drawn in one theme and mode. */
export function ThemePreview({ theme, dark }: { theme: SiteThemeKey; dark: boolean }) {
  return (
    <div data-theme={theme} className={`rounded-md overflow-hidden border border-black/10 ${dark ? "dark" : ""}`} aria-hidden>
      <div className="bg-bark-brown px-2 py-1 flex items-center justify-between">
        <span className="font-display text-[11px] text-gold-light site-theme-badge">Gn0me Home</span>
        <span className="text-[9px] text-parchment opacity-80">Events · Members</span>
      </div>
      <div className={`p-2 ${dark ? "" : "bg-parchment"}`} style={dark ? { background: "var(--d-page)" } : undefined}>
        <div className="card-wood p-2 space-y-1">
          <p className="font-display text-xs text-gnome-green leading-none">Clan Events</p>
          <p className="text-[9px] text-bark-brown leading-tight">Boss of the Week starts Sunday.</p>
          <span className="inline-block rounded bg-gnome-green px-1.5 py-0.5 text-[9px] text-parchment">Sign up</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Pick a site theme. Shows light and dark previews of each, and previews the
 * choice on the whole page straight away (put back when the picker closes,
 * unless it's saved). `defaultLabel` adds a "follow the site" option (null).
 */
export function ThemePicker({
  value,
  onChange,
  defaultLabel,
  siteChoice,
  showAuto = true,
}: {
  value: SiteThemeChoice | null;
  onChange: (v: SiteThemeChoice | null) => void;
  defaultLabel?: string;
  /** The admins' choice, for what "Default" shows. */
  siteChoice?: SiteThemeChoice;
  showAuto?: boolean;
}) {
  const original = useRef<string | null>(null);
  const shown: SiteThemeKey = resolveTheme(value ?? siteChoice ?? "gnome");

  // Preview on the page; the saved theme comes back on the next page load.
  useEffect(() => {
    if (original.current === null) original.current = document.documentElement.dataset.theme ?? "gnome";
    document.documentElement.dataset.theme = shown;
  }, [shown]);
  useEffect(
    () => () => {
      if (original.current) document.documentElement.dataset.theme = original.current;
    },
    [],
  );

  const today = autoTheme();
  const options: { key: SiteThemeChoice | null; title: string; sub: string; theme: SiteThemeKey }[] = [
    ...(defaultLabel !== undefined ? [{ key: null, title: "Default", sub: defaultLabel, theme: resolveTheme(siteChoice ?? "gnome") }] : []),
    ...(showAuto ? [{ key: "auto" as const, title: "Auto (holidays)", sub: `Changes with the calendar. Right now: ${SITE_THEMES[today].name}`, theme: today }] : []),
    ...(Object.keys(SITE_THEMES) as SiteThemeKey[]).map((k) => ({ key: k, title: `${SITE_THEMES[k].emoji} ${SITE_THEMES[k].name}`, sub: SITE_THEMES[k].blurb, theme: k })),
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Site theme">
        {options.map((o) => {
          const on = value === o.key;
          return (
            <button
              key={o.key ?? "default"}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.key)}
              className={`text-left rounded-lg border-2 p-2.5 space-y-2 transition-colors ${on ? "border-gnome-green bg-gnome-green/10" : "border-bark-brown-light/30 hover:border-bark-brown-light/70"}`}
            >
              <div>
                <p className="font-semibold text-sm text-bark-brown">{o.title}</p>
                <p className="text-xs text-iron-grey">{o.sub}</p>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <ThemePreview theme={o.theme} dark={false} />
                <ThemePreview theme={o.theme} dark />
              </div>
            </button>
          );
        })}
      </div>
      {showAuto && (
        <p className="text-xs text-iron-grey">
          Auto shows {AUTO_SCHEDULE.map((s) => `${SITE_THEMES[s.theme].name} (${scheduleText(s)})`).join(", ")}, and Gn0me Home the rest of the year.
        </p>
      )}
    </div>
  );
}
