"use client";

import { useMemo, useState } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { CompetitionRow, PlayerResultTuple } from "@/lib/competition-insights";
import { computeComparison, type CompareGroup, type CompareMode } from "@/lib/competition-insights-stats";
import type { BossTiers } from "@/lib/boss-difficulty";
import Link from "next/link";

const pct = (n: number | null) => (n == null ? "–" : `${Math.round(n * 100)}%`);
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

interface Dot {
  x: number;
  y: number;
  title: string;
  ends: string;
  group: string;
}

/** Spreads dots sideways a little (always the same way for a competition) so equal counts don't hide each other. */
const jitter = (id: number) => (((id * 2654435761) % 1000) / 1000 - 0.5) * 0.5;

function DotTip({ active, payload }: { active?: boolean; payload?: { payload: Dot & { mean?: boolean } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-bark-brown-light bg-parchment px-3 py-2 text-xs text-text-primary shadow-lg max-w-[240px]">
      {d.mean ? (
        <p>
          <b>{d.group}</b>: {d.y.toFixed(1)} competitors on average
        </p>
      ) : (
        <>
          <p className="font-semibold text-bark-brown">{d.title}</p>
          <p className="text-iron-grey">{d.group} · ended {day(d.ends)}</p>
          <p className="mt-1">
            <b>{d.y}</b> competed
          </p>
        </>
      )}
    </div>
  );
}

/** Each competition is a dot; the short bar is the group's average. */
function Strip({ groups }: { groups: CompareGroup[] }) {
  const series = groups.map((g, i) => ({
    g,
    dots: g.stats.map((s) => ({ x: i + jitter(s.comp.wom_id), y: s.active, title: s.comp.title, ends: s.comp.ends_at, group: g.label })),
    mean: g.stats.length ? [{ x: i, y: g.avgCompetitors, title: "", ends: "", group: g.label, mean: true }] : [],
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-bark-brown-light)" strokeOpacity={0.25} />
        <XAxis
          type="number"
          dataKey="x"
          domain={[-0.5, groups.length - 0.5]}
          ticks={groups.map((_, i) => i)}
          tickFormatter={(i: number) => groups[i]?.label ?? ""}
          tick={{ fontSize: 11, fill: "var(--color-bark-brown)" }}
          tickLine={false}
          axisLine={{ stroke: "var(--color-bark-brown-light)", strokeOpacity: 0.5 }}
        />
        <YAxis type="number" dataKey="y" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-iron-grey)" }} tickLine={false} axisLine={false} width={40} />
        <Tooltip content={<DotTip />} cursor={false} />
        {series.map(({ g, dots }) => (
          <Scatter key={g.key} data={dots} fill={g.color} stroke="var(--viz-surface)" strokeWidth={2} shape="circle" isAnimationActive={false} />
        ))}
        {series.map(({ g, mean }) => (
          <Scatter
            key={`${g.key}-mean`}
            data={mean}
            isAnimationActive={false}
            shape={(props: { cx?: number; cy?: number }) => (
              <rect x={(props.cx ?? 0) - 28} y={(props.cy ?? 0) - 2} width={56} height={4} rx={2} fill="var(--color-bark-brown)" />
            )}
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/**
 * Side-by-side comparison of skilling vs bossing weeks, or boss weeks by
 * difficulty, over the dashboard's date range.
 */
export function CompareWeeks({ competitions, results, from, tiers }: { competitions: CompetitionRow[]; results: PlayerResultTuple[]; from: number | null; tiers: BossTiers }) {
  const [mode, setMode] = useState<CompareMode>("type");
  const { groups, overlap } = useMemo(() => computeComparison(competitions, results, from, mode, tiers), [competitions, results, from, mode, tiers]);
  const shown = groups.filter((g) => g.stats.length > 0);

  // Bold the highest value in each row (when there's something to compare).
  const best = (pick: (g: CompareGroup) => number | null) => {
    const vals = shown.map(pick).filter((v): v is number => v != null);
    return shown.length > 1 && vals.length ? Math.max(...vals) : null;
  };
  const rows: { label: string; hint?: string; value: (g: CompareGroup) => number | null; show: (g: CompareGroup) => React.ReactNode }[] = [
    { label: "Competitions", value: () => null, show: (g) => g.stats.length },
    {
      label: "Competitors per week",
      hint: "average, with the lowest and highest",
      value: (g) => g.avgCompetitors,
      show: (g) => (
        <>
          {g.avgCompetitors.toFixed(1)}
          <span className="block text-[11px] text-iron-grey font-normal">
            {g.minCompetitors}–{g.maxCompetitors}
          </span>
        </>
      ),
    },
    { label: "Of entrants took part", hint: "average", value: (g) => g.avgTurnout, show: (g) => pct(g.avgTurnout) },
    { label: "Different competitors", value: (g) => g.uniqueCompetitors, show: (g) => g.uniqueCompetitors },
    { label: "First-timers per week", hint: "average", value: (g) => g.avgFirstTimers, show: (g) => g.avgFirstTimers.toFixed(1) },
    { label: "Had competed before", hint: "share of competitors", value: (g) => g.returningShare, show: (g) => pct(g.returningShare) },
  ];

  return (
    <Card hover={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 className="font-display text-xl text-bark-brown">
          Compare weeks
          <span data-export-only className="inline text-base text-bark-brown-light">
            {" "}
            · {mode === "type" ? "Skilling vs bossing" : "Easy vs hard bosses"}
          </span>
        </h2>
        <div className="flex gap-1" role="group" aria-label="What to compare" data-export-hide>
          <Button size="sm" variant={mode === "type" ? "primary" : "ghost"} onClick={() => setMode("type")} aria-pressed={mode === "type"}>
            Skilling vs bossing
          </Button>
          <Button size="sm" variant={mode === "difficulty" ? "primary" : "ghost"} onClick={() => setMode("difficulty")} aria-pressed={mode === "difficulty"}>
            Easy vs hard bosses
          </Button>
        </div>
      </div>
      <p className="text-xs text-iron-grey mb-4">
        Uses the date range above, whatever the SOTW/BotW filter says.
        {mode === "difficulty" && (
          <>
            {" "}
            Which bosses count as easy or hard is set in{" "}
            <Link href="/admin/boss-difficulty" className="text-gnome-green hover:underline">
              Settings › Boss Difficulty
            </Link>
            ; a single week can be changed under Every competition.
          </>
        )}
      </p>

      {shown.length === 0 ? (
        <p className="text-sm text-bark-brown-light">No competitions to compare in this range.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bark-brown-light text-xs text-iron-grey">
                  <th className="text-left py-2 px-2 font-normal" />
                  {groups.map((g) => (
                    <th key={g.key} className="text-right py-2 px-2 font-semibold text-bark-brown whitespace-nowrap">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: g.color }} aria-hidden />
                      {g.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const top = best(r.value);
                  return (
                    <tr key={r.label} className="border-b border-bark-brown-light/30 last:border-0">
                      <td className="py-2 px-2 text-bark-brown">
                        {r.label}
                        {r.hint && <span className="block text-[11px] text-iron-grey">{r.hint}</span>}
                      </td>
                      {groups.map((g) => {
                        const v = r.value(g);
                        const isTop = top != null && v != null && v === top;
                        return (
                          <td key={g.key} className={`py-2 px-2 text-right font-stats align-top ${isTop ? "font-bold text-gnome-green" : "text-bark-brown"}`}>
                            {g.stats.length ? r.show(g) : "–"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {overlap && (
              <p className="text-sm text-bark-brown mt-3">
                <b>{overlap.both}</b> people competed in both kinds, <b>{overlap.sotwOnly}</b> only in skilling weeks and <b>{overlap.botwOnly}</b> only in bossing weeks.
              </p>
            )}
            <p className="text-[11px] text-iron-grey mt-2">The highest value in each row is in green.</p>
          </div>
          <div className="lg:col-span-2">
            <p className="text-xs text-iron-grey mb-1">Competitors in each competition (dots) and the average (bar)</p>
            <div className="h-64">
              <Strip groups={groups} />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
