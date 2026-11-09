// Site colour themes: the same seven as the stream overlays, each with a
// light and a dark palette (app/site-themes.css). Admins pick the site's
// default (or Auto, which follows the calendar); members can override it
// for themselves in their account.

export const SITE_THEMES = {
  gnome: { name: "Gn0me Home", emoji: "🍄", blurb: "Forest green, bark brown and parchment", swatch: ["#2D5016", "#3E2B1C", "#F5E6C8", "#FFD700"] },
  halloween: { name: "Halloween", emoji: "🎃", blurb: "Midnight purple and pumpkin orange", swatch: ["#4B1F6F", "#24122F", "#F6E7D6", "#FF9A2E"] },
  thanksgiving: { name: "Thanksgiving", emoji: "🦃", blurb: "Warm brown, harvest gold and burnt orange", swatch: ["#7A3B12", "#24140A", "#F7EBD9", "#F2B24A"] },
  winter: { name: "Winter Holidays", emoji: "❄️", blurb: "Icy blue, frost and festive red", swatch: ["#1F4E8C", "#14243A", "#EEF4FA", "#BFE3FF"] },
  valentines: { name: "Valentine's Day", emoji: "💖", blurb: "Deep rose and soft pink", swatch: ["#8E1F4F", "#3D1023", "#FBEFF2", "#FF9EC0"] },
  stpatricks: { name: "St. Patrick's Day", emoji: "☘️", blurb: "Shamrock green and pot-of-gold", swatch: ["#14612F", "#0A2E17", "#F1F7E6", "#F5C518"] },
  july4: { name: "4th of July", emoji: "🎆", blurb: "Navy, star white and flag red", swatch: ["#1A2A63", "#0A1230", "#F4F6FB", "#D22B3A"] },
} as const;

export type SiteThemeKey = keyof typeof SITE_THEMES;
/** What admins (or a member) can choose: a theme, or "auto" to follow the calendar. */
export type SiteThemeChoice = SiteThemeKey | "auto";

export const isThemeKey = (v: unknown): v is SiteThemeKey => typeof v === "string" && v in SITE_THEMES;
export const isThemeChoice = (v: unknown): v is SiteThemeChoice => v === "auto" || isThemeKey(v);

/** When Auto switches, in clan time (America/New_York). Same dates as the stream overlays. */
export const AUTO_SCHEDULE: { theme: SiteThemeKey; from: [number, number]; to: [number, number] }[] = [
  { theme: "halloween", from: [10, 1], to: [11, 1] },
  { theme: "thanksgiving", from: [11, 2], to: [11, 30] },
  { theme: "winter", from: [12, 1], to: [1, 6] },
  { theme: "valentines", from: [2, 1], to: [2, 15] },
  { theme: "stpatricks", from: [3, 10], to: [3, 18] },
  { theme: "july4", from: [6, 28], to: [7, 6] },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const scheduleText = (s: (typeof AUTO_SCHEDULE)[number]) => `${MONTHS[s.from[0] - 1]} ${s.from[1]} – ${MONTHS[s.to[0] - 1]} ${s.to[1]}`;

/** The theme Auto shows on this date (clan time); Gn0me Home outside the holidays. */
export function autoTheme(date = new Date()): SiteThemeKey {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric" }).formatToParts(date);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const v = m * 100 + d;
  for (const s of AUTO_SCHEDULE) {
    const a = s.from[0] * 100 + s.from[1];
    const b = s.to[0] * 100 + s.to[1];
    if (a <= b ? v >= a && v <= b : v >= a || v <= b) return s.theme;
  }
  return "gnome";
}

export const resolveTheme = (choice: SiteThemeChoice | null | undefined, date = new Date()): SiteThemeKey =>
  isThemeKey(choice) ? choice : autoTheme(date);

/** Cookie the light/dark button sets, so the server can render the right mode (no flash). */
export const MODE_COOKIE = "goh-mode";
