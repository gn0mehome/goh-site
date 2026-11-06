// Skill / Boss of the Week titles in the clan's usual format:
// "Skill of the Week | 10/25 | Mining", dated by the day the competition
// starts in the clan's time zone (Sunday 8 PM Eastern).

import { CLAN_TIMEZONE } from "@/lib/constants";

export type WeeklyKind = "sotw" | "botw";

export const WEEKLY_LABEL: Record<WeeklyKind, string> = { sotw: "Skill of the Week", botw: "Boss of the Week" };

/** "10/25": the start date in clan time. */
export function clanDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: CLAN_TIMEZONE, month: "numeric", day: "numeric" }).format(date);
}

export function weeklyTitle(kind: WeeklyKind, start: Date | null, name: string): string {
  return [WEEKLY_LABEL[kind], start && !Number.isNaN(start.getTime()) ? clanDayLabel(start) : "M/D", name || "…"].join(" | ");
}

/** The clan's wall-clock time (year, month, day, hour, minute, weekday) for an instant. */
function clanParts(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: CLAN_TIMEZONE, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23", weekday: "short" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { y: +parts.year, m: +parts.month, d: +parts.day, h: +parts.hour, min: +parts.minute, weekday };
}

/** The instant a clan-time wall clock reads y-m-d h:00 (handles daylight saving). */
function fromClanTime(y: number, m: number, d: number, h: number): Date {
  let guess = Date.UTC(y, m - 1, d, h);
  for (let i = 0; i < 2; i++) {
    const p = clanParts(new Date(guess));
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    guess += Date.UTC(y, m - 1, d, h) - shown;
  }
  return new Date(guess);
}

/** The next Sunday at 8 PM clan time (today, if it's Sunday before 8 PM). */
export function nextWeeklyStart(now = new Date()): Date {
  const p = clanParts(now);
  let ahead = (7 - p.weekday) % 7;
  if (ahead === 0 && p.h >= 20) ahead = 7;
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d + ahead));
  return fromClanTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 20);
}
