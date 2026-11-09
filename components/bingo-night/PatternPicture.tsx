import { PATTERNS } from "@/lib/bingo-night/core";

/** A small 5×5 picture of what to fill this round. */
export function PatternPicture({ pattern, size = 44, className = "" }: { pattern: string; size?: number; className?: string }) {
  const p = (PATTERNS as Record<string, { preview: number[]; name: string }>)[pattern];
  const on = new Set(p?.preview ?? []);
  const cell = size / 5;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label={p ? `${p.name} pattern` : "Pattern"}>
      {Array.from({ length: 25 }, (_, i) => (
        <rect
          key={i}
          x={(i % 5) * cell + 1}
          y={Math.floor(i / 5) * cell + 1}
          width={cell - 2}
          height={cell - 2}
          rx={cell * 0.18}
          fill={on.has(i) ? "var(--bn-hit)" : "var(--bn-soft)"}
          opacity={on.has(i) ? 1 : 0.55}
        />
      ))}
    </svg>
  );
}
