import { BOSSES, SKILLS } from "@wise-old-man/utils";

/** The metrics a weekly poll option may use: skills for SOTW, bosses for BotW. */
export function allowedMetrics(kind: "sotw" | "botw"): Set<string> {
  return new Set<string>(kind === "sotw" ? SKILLS.filter((s) => s !== "overall") : BOSSES);
}
