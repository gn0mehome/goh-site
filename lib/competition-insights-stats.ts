// The maths behind the competition insights dashboard. Pure functions over
// the stored results, so filters re-run instantly in the browser.

import type { CompetitionKind, CompetitionRow, PlayerResultTuple } from "@/lib/competition-insights";
import { defaultDifficulty, DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from "@/lib/boss-difficulty";

export interface InsightFilters {
  kinds: CompetitionKind[];
  /** Only competitions that started on or after this time (ms), or null for all time. */
  from: number | null;
}

export interface Placing {
  name: string;
  gained: number;
  rank: number;
}

export interface CompetitionStat {
  comp: CompetitionRow;
  active: number;
  firstTimers: number;
  returning: number;
  turnout: number | null;
  top: Placing[];
  running: boolean;
}

export interface PlayerStat {
  playerId: number;
  name: string;
  comps: number;
  sotw: number;
  botw: number;
  wins: number;
  podiums: number;
  best: number;
  lastEnds: string;
  lastTitle: string;
  /** Share of the filtered competitions they took part in (0-1). */
  share: number;
}

export interface Insights {
  competitions: CompetitionStat[];
  players: PlayerStat[];
  quiet: PlayerStat[];
  kpis: {
    competitions: number;
    uniqueCompetitors: number;
    avgCompetitors: number;
    avgTurnout: number | null;
    regulars: number;
    busiest: CompetitionStat | null;
  };
}

/** Players who've competed in at least this many count as regulars. */
export const REGULAR_MIN = 3;
/** A regular who sat out this many of the latest competitions has gone quiet. */
export const QUIET_AFTER = 4;

export function computeInsights(all: CompetitionRow[], results: PlayerResultTuple[], f: InsightFilters): Insights {
  const kindSet = new Set(f.kinds);
  const byEnd = (a: CompetitionRow, b: CompetitionRow) => Date.parse(a.ends_at) - Date.parse(b.ends_at);
  // "First time" looks at every competition of the chosen types, not just the date range.
  const ofKind = all.filter((c) => kindSet.has(c.kind)).sort(byEnd);
  const inRange = ofKind.filter((c) => f.from == null || Date.parse(c.starts_at) >= f.from);
  const rangeIds = new Set(inRange.map((c) => c.wom_id));
  const kindIds = new Set(ofKind.map((c) => c.wom_id));

  const rowsByComp = new Map<number, PlayerResultTuple[]>();
  for (const r of results) {
    if (!kindIds.has(r[0])) continue;
    const list = rowsByComp.get(r[0]) ?? [];
    list.push(r);
    rowsByComp.set(r[0], list);
  }

  const seen = new Set<number>();
  const players = new Map<number, PlayerStat>();
  const competitions: CompetitionStat[] = [];
  for (const comp of ofKind) {
    const rows = (rowsByComp.get(comp.wom_id) ?? []).sort((a, b) => a[4] - b[4]);
    let firstTimers = 0;
    for (const r of rows) {
      if (!seen.has(r[1])) {
        firstTimers++;
        seen.add(r[1]);
      }
    }
    if (!rangeIds.has(comp.wom_id)) continue;
    competitions.push({
      comp,
      active: rows.length,
      firstTimers,
      returning: rows.length - firstTimers,
      turnout: comp.participant_count > 0 ? rows.length / comp.participant_count : null,
      top: rows.slice(0, 3).map((r) => ({ name: r[2], gained: r[3], rank: r[4] })),
      running: Date.parse(comp.ends_at) > Date.now(),
    });
    for (const [, playerId, name, , rank] of rows) {
      const p = players.get(playerId) ?? { playerId, name, comps: 0, sotw: 0, botw: 0, wins: 0, podiums: 0, best: Infinity, lastEnds: comp.ends_at, lastTitle: comp.title, share: 0 };
      p.name = name; // newest display name wins (competitions are in date order)
      p.comps++;
      if (comp.kind === "sotw") p.sotw++;
      if (comp.kind === "botw") p.botw++;
      if (rank === 1) p.wins++;
      if (rank <= 3) p.podiums++;
      p.best = Math.min(p.best, rank);
      p.lastEnds = comp.ends_at;
      p.lastTitle = comp.title;
      players.set(playerId, p);
    }
  }

  const total = competitions.length;
  const playerList = [...players.values()]
    .map((p) => ({ ...p, share: total ? p.comps / total : 0 }))
    .sort((a, b) => b.comps - a.comps || b.wins - a.wins || b.podiums - a.podiums || a.name.localeCompare(b.name));

  // Regulars who haven't shown up in the latest few competitions.
  const latest = competitions.slice(-QUIET_AFTER);
  const cutoff = latest.length === QUIET_AFTER ? Date.parse(latest[0].comp.ends_at) : Infinity;
  const quiet = playerList.filter((p) => p.comps >= REGULAR_MIN && Date.parse(p.lastEnds) < cutoff).sort((a, b) => b.comps - a.comps || Date.parse(b.lastEnds) - Date.parse(a.lastEnds));

  const withTurnout = competitions.filter((c) => c.turnout != null);
  return {
    competitions,
    players: playerList,
    quiet,
    kpis: {
      competitions: total,
      uniqueCompetitors: playerList.length,
      avgCompetitors: total ? competitions.reduce((s, c) => s + c.active, 0) / total : 0,
      avgTurnout: withTurnout.length ? withTurnout.reduce((s, c) => s + (c.turnout ?? 0), 0) / withTurnout.length : null,
      regulars: playerList.filter((p) => p.comps >= REGULAR_MIN).length,
      busiest: competitions.reduce<CompetitionStat | null>((b, c) => (!b || c.active > b.active ? c : b), null),
    },
  };
}

/** A boss week's difficulty: the staff override, or the boss's built-in tier. */
export const difficultyOf = (c: CompetitionRow): Difficulty => c.difficulty ?? defaultDifficulty(c.metric);

export type CompareMode = "type" | "difficulty";

export interface CompareGroup {
  key: string;
  label: string;
  color: string;
  stats: CompetitionStat[];
  avgCompetitors: number;
  minCompetitors: number;
  maxCompetitors: number;
  avgTurnout: number | null;
  avgFirstTimers: number;
  /** Of everyone who competed, the share who'd competed before. */
  returningShare: number | null;
  uniqueCompetitors: number;
}

export interface Comparison {
  groups: CompareGroup[];
  /** Skilling vs bossing only: how many people did one type, the other, or both. */
  overlap: { sotwOnly: number; botwOnly: number; both: number } | null;
}

/**
 * Side-by-side numbers for skilling vs bossing weeks, or for boss weeks by
 * difficulty. Uses both competition types so "first time" means first SOTW
 * or BotW of any kind.
 */
export function computeComparison(all: CompetitionRow[], results: PlayerResultTuple[], from: number | null, mode: CompareMode): Comparison {
  const base = computeInsights(all, results, { kinds: ["sotw", "botw"], from }).competitions;
  const players = new Map<number, Set<number>>();
  for (const r of results) {
    const set = players.get(r[0]) ?? new Set<number>();
    set.add(r[1]);
    players.set(r[0], set);
  }

  const defs: { key: string; label: string; color: string; match: (s: CompetitionStat) => boolean }[] =
    mode === "type"
      ? [
          { key: "sotw", label: "Skilling weeks", color: "var(--viz-sotw)", match: (s) => s.comp.kind === "sotw" },
          { key: "botw", label: "Bossing weeks", color: "var(--viz-botw)", match: (s) => s.comp.kind === "botw" },
        ]
      : DIFFICULTIES.map((d) => ({ key: d, label: `${DIFFICULTY_LABEL[d]} bosses`, color: `var(--viz-${d})`, match: (s: CompetitionStat) => s.comp.kind === "botw" && difficultyOf(s.comp) === d }));

  const groups = defs.map(({ key, label, color, match }) => {
    const stats = base.filter(match);
    const n = stats.length;
    const active = stats.map((s) => s.active);
    const totalActive = active.reduce((a, b) => a + b, 0);
    const withTurnout = stats.filter((s) => s.turnout != null);
    const unique = new Set<number>();
    for (const s of stats) for (const p of players.get(s.comp.wom_id) ?? []) unique.add(p);
    return {
      key,
      label,
      color,
      stats,
      avgCompetitors: n ? totalActive / n : 0,
      minCompetitors: n ? Math.min(...active) : 0,
      maxCompetitors: n ? Math.max(...active) : 0,
      avgTurnout: withTurnout.length ? withTurnout.reduce((a, s) => a + (s.turnout ?? 0), 0) / withTurnout.length : null,
      avgFirstTimers: n ? stats.reduce((a, s) => a + s.firstTimers, 0) / n : 0,
      returningShare: totalActive ? stats.reduce((a, s) => a + s.returning, 0) / totalActive : null,
      uniqueCompetitors: unique.size,
    };
  });

  let overlap: Comparison["overlap"] = null;
  if (mode === "type") {
    const ids = (k: string) => {
      const set = new Set<number>();
      for (const s of groups.find((g) => g.key === k)?.stats ?? []) for (const p of players.get(s.comp.wom_id) ?? []) set.add(p);
      return set;
    };
    const sotw = ids("sotw");
    const botw = ids("botw");
    const both = [...sotw].filter((p) => botw.has(p)).length;
    overlap = { sotwOnly: sotw.size - both, botwOnly: botw.size - both, both };
  }
  return { groups, overlap };
}
