import { COLUMNS, FREE, type GameConfig } from "@/lib/bingo-night/core";
import { safeLabel, squareFont } from "@/lib/bingo-night/ui";

/**
 * A G-N-O-M-E card. `marked` are the squares to fill in; `called` (optional)
 * tints called squares; `outline` draws a ring around a winning set.
 */
export function BingoCard({
  squares,
  config,
  marked,
  called,
  outline,
  onTap,
  compact = false,
}: {
  squares: (number | null)[];
  config: GameConfig;
  marked: Set<number>;
  called?: Set<number>;
  outline?: Set<number>;
  onTap?: (pos: number) => void;
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl p-1.5 sm:p-2" style={{ background: "var(--bn-head)" }}>
      <div className="grid grid-cols-5 gap-1 sm:gap-1.5 mb-1 sm:mb-1.5">
        {COLUMNS.map((c) => (
          <div key={c} className={`text-center font-display font-bold ${compact ? "text-base" : "text-2xl sm:text-3xl"}`} style={{ color: "var(--bn-accent)" }}>
            {c}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
        {squares.map((v, pos) => {
          const free = pos === FREE || v === null;
          const label = free ? "Gn0me Home" : safeLabel(config, v);
          const isMarked = free || marked.has(pos);
          const isCalled = !free && called?.has(v as number);
          const words = config.mode === "words";
          return (
            <button
              key={pos}
              type="button"
              disabled={!onTap || free}
              onClick={() => onTap?.(pos)}
              aria-pressed={isMarked}
              aria-label={`${label}${isMarked ? ", marked" : ""}`}
              className={`relative aspect-square rounded-md flex items-center justify-center text-center leading-tight font-bold select-none transition-colors ${compact ? "p-0.5" : "p-1"} ${onTap && !free ? "cursor-pointer active:scale-95" : "cursor-default"}`}
              style={{
                background: isMarked ? "var(--bn-hit)" : "var(--bn-panel)",
                color: isMarked ? "var(--bn-hit-ink)" : "var(--bn-ink)",
                boxShadow: outline?.has(pos) ? "0 0 0 3px var(--bn-accent) inset" : isCalled && !isMarked ? "0 0 0 2px var(--bn-hit) inset" : undefined,
                fontSize: compact ? (words ? "0.5rem" : "0.75rem") : free ? "0.72rem" : words ? squareFont(label) : "1.4rem",
                wordBreak: words ? "break-word" : undefined,
                hyphens: words ? "auto" : undefined,
              }}
            >
              <span>{free ? "Gn0me Home" : config.mode === "numbers" ? String(v) : label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
