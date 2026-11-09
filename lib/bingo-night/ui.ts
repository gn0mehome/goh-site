// Small helpers shared by the player page, the stream view and the host console.

import { createElement, type ReactNode } from "react";
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

/**
 * Font size for a word in a card square, so it fits on any phone without
 * breaking a word in half: the longest single word has to fit across the
 * square (the card's grid is a size container, so this scales with it), and
 * longer phrases get smaller so they stay within about three lines.
 */
export function squareFont(text: string): string {
  const n = text.length;
  // Caps in container units: the same sizes as before on a phone-sized card, larger on a desktop one.
  const cap = n <= 3 ? "6cqi" : n <= 6 ? "4.3cqi" : n <= 10 ? "3.7cqi" : n <= 14 ? "3.35cqi" : "3cqi";
  const longest = Math.max(...text.split(/\s+/).map((w) => w.length), 1);
  // A square's inner width is about 20% of the grid less its gaps and padding; a bold letter is about 0.62em wide.
  return `min(${cap}, calc((20cqi - 11px) / ${(0.62 * longest).toFixed(2)}))`;
}

export { COLUMNS };

/**
 * The display font (MedievalSharp) draws "!" as a tilted bar that reads like
 * an "I" ("BINGOI"). Puts each "!" in the body font instead.
 */
export function plainBangs(text: string): ReactNode {
  if (!text.includes("!")) return text;
  return text.split("!").flatMap((part, i) => (i === 0 ? [part] : [createElement("span", { key: i, style: { fontFamily: "var(--font-body)", lineHeight: 1 } }, "!"), part]));
}
