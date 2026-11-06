// Default difficulty tiers for Boss of the Week, used to compare harder and
// easier boss weeks on the admin Dashboard. A rough guide for an average
// clan member; staff can override any single competition on the dashboard.

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

const EASY = [
  "amoxliatl", "artio", "barrows_chests", "brutus", "bryophyta", "calvarion", "chaos_fanatic", "crazy_archaeologist",
  "deranged_archaeologist", "giant_mole", "hespori", "king_black_dragon", "kraken", "lunar_chests", "mimic", "obor",
  "sarachnis", "scorpia", "scurrius", "shellbane_gryphon", "skotizo", "spindel", "tempoross", "the_hueycoatl",
  "the_royal_titans", "thermonuclear_smoke_devil", "wintertodt", "zalcano",
];
const HARD = [
  "alchemical_hydra", "araxxor", "chambers_of_xeric_challenge_mode", "doom_of_mokhaiotl", "nex", "phosanis_nightmare",
  "sol_heredit", "the_corrupted_gauntlet", "theatre_of_blood", "theatre_of_blood_hard_mode", "tombs_of_amascut_expert",
  "tzkal_zuk", "yama",
];

/** The built-in tier for a boss metric (anything not listed counts as medium). */
export function defaultDifficulty(metric: string): Difficulty {
  if (EASY.includes(metric)) return "easy";
  if (HARD.includes(metric)) return "hard";
  return "medium";
}
