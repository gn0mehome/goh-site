// Small helpers shared by the player page, the stream view and the host console.

import { COLUMNS, PATTERNS, labelFor, type GameConfig, type PatternId } from "./core";

/** Typical round lengths from the spec's 150-player simulations, for the host's pattern menu. */
export const PATTERN_TIMES: Record<PatternId, { numbers: string; words: string }> = {
  single_line: { numbers: "4–5 min", words: "3 min" },
  postage_stamp: { numbers: "4–6 min", words: "3–4 min" },
  four_corners: { numbers: "6–7 min", words: "4–5 min" },
  two_lines: { numbers: "7–9 min", words: "5–6 min" },
  inner_square: { numbers: "10–14 min", words: "7–9 min" },
  x: { numbers: "11–14 min", words: "7–9 min" },
  frame: { numbers: "14–19 min", words: "10–13 min" },
  coverall: { numbers: "16–21 min", words: "11–14 min" },
};

export const patternName = (id: string) => (PATTERNS as Record<string, { name: string }>)[id]?.name ?? id;
export const patternDescription = (id: string) => (PATTERNS as Record<string, { description: string }>)[id]?.description ?? "";

export function configFor(mode: "numbers" | "words", words: string[] | null): GameConfig {
  return mode === "words" ? { mode: "words", words: words ?? [] } : { mode: "numbers" };
}

/** "G-4" or the word; never throws (a bad value shows as "?"). */
export function safeLabel(config: GameConfig, v: number): string {
  try {
    return labelFor(config, v);
  } catch {
    return "?";
  }
}

/** Font size for a word in a card square, so long words still fit on a phone. */
export function squareFont(text: string): string {
  const n = text.length;
  if (n <= 3) return "1.35rem";
  if (n <= 6) return "0.95rem";
  if (n <= 10) return "0.78rem";
  if (n <= 14) return "0.7rem";
  return "0.62rem";
}

export { COLUMNS };
