// Colour themes for a Bingo Night game: the player page and the stream view
// both draw with these CSS variables.

import type { CSSProperties } from "react";

export interface BingoTheme {
  name: string;
  vars: Record<string, string>;
}

export const BINGO_THEMES: Record<string, BingoTheme> = {
  gnome: {
    name: "Gn0me Home (greens and browns)",
    vars: { "--bn-bg": "#1f3a26", "--bn-bg2": "#2c5234", "--bn-panel": "#f4ead2", "--bn-ink": "#2b1d0e", "--bn-accent": "#d9a63b", "--bn-accent-ink": "#2b1d0e", "--bn-hit": "#3f8f4f", "--bn-hit-ink": "#ffffff", "--bn-head": "#6b4423", "--bn-soft": "#e3d3ad", "--bn-text": "#f7f0dc" },
  },
  friendsgiving: {
    name: "Friendsgiving (rust, amber and cream)",
    vars: { "--bn-bg": "#5a2a12", "--bn-bg2": "#7a3a18", "--bn-panel": "#fbf1dc", "--bn-ink": "#3a1e0c", "--bn-accent": "#e8a33a", "--bn-accent-ink": "#3a1e0c", "--bn-hit": "#b5531f", "--bn-hit-ink": "#ffffff", "--bn-head": "#8c3d14", "--bn-soft": "#f0dcb6", "--bn-text": "#fff4e0" },
  },
  halloween: {
    name: "Halloween (purple and pumpkin)",
    vars: { "--bn-bg": "#1d1029", "--bn-bg2": "#2e1846", "--bn-panel": "#f6eadc", "--bn-ink": "#24122f", "--bn-accent": "#ff8a1f", "--bn-accent-ink": "#24122f", "--bn-hit": "#7a3fb0", "--bn-hit-ink": "#ffffff", "--bn-head": "#e0701a", "--bn-soft": "#e9d6c4", "--bn-text": "#fbefe0" },
  },
  winter: {
    name: "Winter (icy blue)",
    vars: { "--bn-bg": "#12294a", "--bn-bg2": "#1a3a66", "--bn-panel": "#f2f8ff", "--bn-ink": "#0f2340", "--bn-accent": "#bfe3ff", "--bn-accent-ink": "#0f2340", "--bn-hit": "#c62f3a", "--bn-hit-ink": "#ffffff", "--bn-head": "#2f6aa8", "--bn-soft": "#d6e6f5", "--bn-text": "#f2f8ff" },
  },
};

export const themeVars = (key: string | null | undefined) => (BINGO_THEMES[key ?? ""] ?? BINGO_THEMES.gnome).vars as CSSProperties;
