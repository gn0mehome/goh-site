import { COLUMNS, FREE, type GameConfig } from "@/lib/bingo-night/core";
import { safeLabel, squareFont } from "@/lib/bingo-night/ui";
import { WikiIcon } from "./WikiIcon";

/**
 * A G-N-O-M-E card. `marked` are the squares to fill in; `called` (optional)
 * tints called squares; `outline` draws a ring around a winning set;
 * `icons` (word games) puts an OSRS Wiki item picture above each word.
 */
export function BingoCard({
  squares,
  config,
  marked,
  called,
  outline,
  onTap,
  icons,
  compact = false,
}: {
  squares: (number | null)[];
  config: GameConfig;
  marked: Set<number>;
  called?: Set<number>;
  outline?: Set<number>;
  onTap?: (pos: number) => void;
  icons?: (string | null)[] | null;
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
      <div className="grid grid-cols-5 gap-1 sm:gap-1.5" style={{ containerType: "inline-size" }}>
        {squares.map((v, pos) => {
          const free = pos === FREE || v === null;
          const label = free ? "Gn0me Home" : safeLabel(config, v);
          const isMarked = free || marked.has(pos);
          const isCalled = !free && called?.has(v as number);
          const words = config.mode === "words";
          const icon = !free && words && !compact ? icons?.[v as number] ?? null : null;
          return (
            <button
              key={pos}
              type="button"
              disabled={!onTap || free}
              onClick={() => onTap?.(pos)}
              aria-pressed={isMarked}
              aria-label={`${label}${isMarked ? ", marked" : ""}`}
              className={`relative aspect-square rounded-md flex ${icon ? "flex-col gap-0.5" : ""} items-center justify-center text-center leading-tight font-bold select-none transition-colors ${compact ? "p-0.5" : "p-1"} ${onTap && !free ? "cursor-pointer active:scale-95" : "cursor-default"}`}
              style={{
                background: isMarked ? "var(--bn-hit)" : "var(--bn-panel)",
                color: isMarked ? "var(--bn-hit-ink)" : "var(--bn-ink)",
                boxShadow: outline?.has(pos) ? "0 0 0 3px var(--bn-accent) inset" : isCalled && !isMarked ? "0 0 0 2px var(--bn-hit) inset" : undefined,
                fontSize: compact ? (words ? "0.5rem" : "0.75rem") : free ? "0.72rem" : words ? (icon ? `calc(${squareFont(label)} * 0.8)` : squareFont(label)) : "1.4rem",
                // Words only break between words; a word too long for its square shrinks instead (squareFont).
                overflowWrap: words ? "normal" : undefined,
                wordBreak: words ? "keep-all" : undefined,
              }}
            >
              {icon && <WikiIcon src={icon} size="34%" style={{ height: "auto", aspectRatio: "1", maxHeight: "40%" }} />}
              <span>{free ? "Gn0me Home" : config.mode === "numbers" ? String(v) : label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
