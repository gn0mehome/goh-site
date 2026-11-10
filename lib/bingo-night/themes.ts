// Colour themes for a Bingo Night game: the same seven themes as the site
// (lib/site-theme.ts), plus Auto, which follows the holiday calendar like the
// site's Auto. The colours themselves come from each theme's palette in
// app/site-themes.css (the .bn-theme block), so Bingo Night always matches
// the site. The player page, the stream view and the host's card preview
// all draw with the --bn-* variables that block sets.

import { SITE_THEMES, autoTheme, isThemeKey, type SiteThemeKey } from "@/lib/site-theme";

export type BingoThemeChoice = SiteThemeKey | "auto";

/** Theme names from before Bingo Night used the site's themes. */
const OLD_NAMES: Record<string, SiteThemeKey> = { friendsgiving: "thanksgiving" };

/** The choices for the game editor, in order. */
export const BINGO_THEME_CHOICES: { key: BingoThemeChoice; label: string }[] = [
  { key: "auto", label: `Auto (holidays): ${SITE_THEMES[autoTheme()].name} right now` },
  ...(Object.keys(SITE_THEMES) as SiteThemeKey[]).map((k) => ({ key: k, label: `${SITE_THEMES[k].emoji} ${SITE_THEMES[k].name}` })),
];

export const isBingoThemeChoice = (v: unknown): v is BingoThemeChoice => v === "auto" || isThemeKey(v) || (typeof v === "string" && v in OLD_NAMES);

/** The site theme a game's setting draws with today. */
export function bingoTheme(key: string | null | undefined): SiteThemeKey {
  if (key === "auto") return autoTheme();
  if (isThemeKey(key)) return key;
  return OLD_NAMES[key ?? ""] ?? "gnome";
}

/** "Thanksgiving", or "Auto (Thanksgiving)". */
export function bingoThemeName(key: string | null | undefined): string {
  const name = SITE_THEMES[bingoTheme(key)].name;
  return key === "auto" ? `Auto (${name})` : name;
}

/** Props for the element a game is drawn in: its site theme, and the Bingo Night colours from it. */
export function themeProps(key: string | null | undefined, className = ""): { "data-theme": SiteThemeKey; className: string } {
  return { "data-theme": bingoTheme(key), className: `bn-theme ${className}`.trim() };
}
