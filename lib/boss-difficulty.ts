// Easy / Hard rotation for Boss of the Week. Staff set each boss and raid on
// Admin › Settings › Boss Difficulty (boss_difficulties); anything not set
// yet uses the suggestion below. A single week can also be overridden on the
// Dashboard's SOTW & BotW tab (competition_results.difficulty).

import { BOSSES, MetricProps } from "@wise-old-man/utils";

export type Difficulty = "easy" | "hard";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", hard: "Hard" };
export const DIFFICULTIES: Difficulty[] = ["easy", "hard"];

/** Saved tiers by WOM boss metric. */
export type BossTiers = Record<string, Difficulty>;

const SUGGESTED_HARD = new Set([
  "alchemical_hydra", "araxxor", "chambers_of_xeric", "chambers_of_xeric_challenge_mode", "doom_of_mokhaiotl",
  "duke_sucellus", "nex", "nightmare", "phantom_muspah", "phosanis_nightmare", "sol_heredit", "the_corrupted_gauntlet",
  "the_leviathan", "the_whisperer", "theatre_of_blood", "theatre_of_blood_hard_mode", "tombs_of_amascut",
  "tombs_of_amascut_expert", "tzkal_zuk", "tztok_jad", "vardorvis", "yama",
]);

/** A starting point until staff set a boss themselves. */
export function suggestedDifficulty(metric: string): Difficulty {
  return SUGGESTED_HARD.has(metric) ? "hard" : "easy";
}

/** A boss's tier: what staff saved, or the suggestion. */
export function bossDifficulty(metric: string, tiers: BossTiers): Difficulty {
  return tiers[metric] ?? suggestedDifficulty(metric);
}

export const bossName = (metric: string) => (MetricProps as Record<string, { name: string }>)[metric]?.name ?? metric.replace(/_/g, " ");

const RAIDS = ["chambers_of_xeric", "chambers_of_xeric_challenge_mode", "theatre_of_blood", "theatre_of_blood_hard_mode", "tombs_of_amascut", "tombs_of_amascut_expert"];
const WILDERNESS = ["artio", "callisto", "calvarion", "chaos_elemental", "chaos_fanatic", "crazy_archaeologist", "deranged_archaeologist", "king_black_dragon", "scorpia", "spindel", "venenatis", "vetion"];
const SKILLING = ["tempoross", "wintertodt", "zalcano", "hespori", "the_hueycoatl"];

/** Every WOM boss, grouped for the settings page. */
export function bossGroups(): { label: string; metrics: string[] }[] {
  const all = [...BOSSES] as string[];
  const used = new Set([...RAIDS, ...WILDERNESS, ...SKILLING]);
  const byName = (a: string, b: string) => bossName(a).localeCompare(bossName(b));
  return [
    { label: "Raids", metrics: RAIDS.filter((m) => all.includes(m)) },
    { label: "Bosses", metrics: all.filter((m) => !used.has(m)).sort(byName) },
    { label: "Wilderness", metrics: WILDERNESS.filter((m) => all.includes(m)).sort(byName) },
    { label: "Skilling bosses", metrics: SKILLING.filter((m) => all.includes(m)).sort(byName) },
  ];
}
