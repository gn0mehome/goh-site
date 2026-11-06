"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { OVERVIEW_TABS } from "@/lib/admin-tabs";
import { CompareWeeks } from "@/components/admin/CompareWeeks";
import { defaultDifficulty, DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from "@/lib/boss-difficulty";
import type { CompetitionKind, CompetitionRow, PlayerResultTuple } from "@/lib/competition-insights";
import { computeInsights, QUIET_AFTER, REGULAR_MIN, type CompetitionStat, type PlayerStat } from "@/lib/competition-insights-stats";

const KIND_LABEL: Record<CompetitionKind, string> = { sotw: "Skill of the Week", botw: "Boss of the Week", other: "Other" };
const KIND_SHORT: Record<CompetitionKind, string> = { sotw: "SOTW", botw: "BotW", other: "Other" };
const KIND_COLOR: Record<CompetitionKind, string> = { sotw: "var(--viz-sotw)", botw: "var(--viz-botw)", other: "var(--color-iron-grey)" };

type KindFilter = "both" | "sotw" | "botw";
type RangeKey = "3m" | "6m" | "12m" | "all";
const RANGES: { key: RangeKey; label: string; months: number | null }[] = [
  { key: "3m", label: "Last 3 months", months: 3 },
  { key: "6m", label: "Last 6 months", months: 6 },
  { key: "12m", label: "Last 12 months", months: 12 },
  { key: "all", label: "All time", months: null },
];

const compact = (n: number) => Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const dayYear = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const pct = (n: number) => `${Math.round(n * 100)}%`;
const tipStyle = "rounded-md border border-bark-brown-light bg-parchment px-3 py-2 text-xs text-text-primary shadow-lg max-w-[260px]";
const thClass = "text-left py-2 px-2 cursor-pointer select-none hover:text-gnome-green whitespace-nowrap";

function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card hover={false} className="text-center py-3">
      <p className="font-stats text-2xl text-gold-display font-bold">{value}</p>
      <p className="text-xs text-bark-brown-light">{label}</p>
      {hint && <p className="text-[11px] text-iron-grey mt-0.5">{hint}</p>}
    </Card>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-bark-brown">
      <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}

function KindChip({ kind }: { kind: CompetitionKind }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-bark-brown whitespace-nowrap">
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: KIND_COLOR[kind] }} aria-hidden />
      {KIND_SHORT[kind]}
    </span>
  );
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const medal = (rank: number) => ["🥇", "🥈", "🥉"][rank - 1] ?? ordinal(rank);

/** One row of chart data per competition (oldest first, so time reads left to right). */
interface ChartRow {
  id: number;
  label: string;
  kind: CompetitionKind;
  stat: CompetitionStat;
  active: number;
  firstTimers: number;
  returning: number;
}

function CompetitorsTip({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) {
  if (!active || !payload?.length) return null;
  const { stat } = payload[0].payload;
  const c = stat.comp;
  return (
    <div className={tipStyle}>
      <p className="font-semibold text-bark-brown">{c.title}</p>
      <p className="text-iron-grey">
        {KIND_LABEL[c.kind]} · {day(c.starts_at)} – {day(c.ends_at)}
        {stat.running && " · still running"}
      </p>
      <p className="mt-1">
        <b>{stat.active}</b> competed{c.participant_count ? ` of ${c.participant_count} entered (${pct(stat.turnout ?? 0)})` : ""}
      </p>
      {stat.top[0] && (
        <p>
          Winner: <b>{stat.top[0].name}</b> (+{compact(stat.top[0].gained)})
        </p>
      )}
    </div>
  );
}

function NewReturningTip({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className={tipStyle}>
      <p className="font-semibold text-bark-brown">{r.stat.comp.title}</p>
      <p className="mt-1">
        <Swatch color="var(--viz-returning)" label={`Returning: ${r.returning}`} />
      </p>
      <p>
        <Swatch color="var(--viz-new)" label={`First time: ${r.firstTimers}`} />
      </p>
    </div>
  );
}

type SortKey = "comps" | "wins" | "podiums" | "best" | "lastEnds" | "name";

export default function CompetitionInsightsPage() {
  const [data, setData] = useState<{ competitions: CompetitionRow[]; results: PlayerResultTuple[]; canEdit?: boolean } | null>(null);
  const [tierError, setTierError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sync, setSync] = useState<{ running: boolean; pending: number; error: string | null; done: number }>({ running: false, pending: 0, error: null, done: 0 });
  const [kind, setKind] = useState<KindFilter>("both");
  const [range, setRange] = useState<RangeKey>("6m");
  const [sortKey, setSortKey] = useState<SortKey>("comps");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [showAllComps, setShowAllComps] = useState(false);
  const syncing = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/competition-insights");
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) return setLoadError(json?.error ?? "Couldn't load the results.");
    setLoadError(null);
    setData(json);
  }, []);

  // Pull new results from Wise Old Man a few competitions at a time until caught up.
  const runSync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    setSync({ running: true, pending: 0, error: null, done: 0 });
    let done = 0;
    for (let round = 0; round < 40; round++) {
      const res = await fetch("/api/admin/competition-insights", { method: "POST" });
      const json = await res.json().catch(() => ({ error: "Couldn't reach the site." }));
      done += json.synced ?? 0;
      setSync({ running: true, pending: json.pending ?? 0, error: json.error ?? null, done });
      if (json.synced) await load();
      if (json.error || !json.pending) break;
    }
    setSync((s) => ({ ...s, running: false }));
    syncing.current = false;
  }, [load]);

  useEffect(() => {
    // Show what's stored straight away, then catch up with Wise Old Man in the background.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().then(runSync);
  }, [load, runSync]);

  const from = useMemo(() => {
    const months = RANGES.find((r) => r.key === range)?.months ?? null;
    if (months == null) return null;
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.getTime();
  }, [range]);

  const insights = useMemo(() => {
    if (!data) return null;
    const kinds: CompetitionKind[] = kind === "both" ? ["sotw", "botw"] : [kind];
    return computeInsights(data.competitions, data.results, { kinds, from });
  }, [data, kind, from]);

  // A boss week's tier: save, then update the page without reloading everything.
  const setTier = async (womId: number, difficulty: Difficulty | null) => {
    setTierError(null);
    const res = await fetch("/api/admin/competition-insights", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wom_id: womId, difficulty }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setTierError(json.error ?? "Couldn't save the difficulty.");
    setData((d) => (d ? { ...d, competitions: d.competitions.map((c) => (c.wom_id === womId ? { ...c, difficulty } : c)) } : d));
  };

  const chartRows: ChartRow[] = useMemo(
    () =>
      (insights?.competitions ?? []).map((s) => ({
        id: s.comp.wom_id,
        label: day(s.comp.ends_at),
        kind: s.comp.kind,
        stat: s,
        active: s.active,
        firstTimers: s.firstTimers,
        returning: s.returning,
      })),
    [insights],
  );

  const sortedPlayers = useMemo(() => {
    const list = [...(insights?.players ?? [])];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const v = (p: PlayerStat) => (sortKey === "lastEnds" ? Date.parse(p.lastEnds) : sortKey === "name" ? 0 : p[sortKey]);
      if (sortKey === "name") return dir * a.name.localeCompare(b.name);
      return dir * (v(a) - v(b)) || b.comps - a.comps || a.name.localeCompare(b.name);
    });
    return list;
  }, [insights, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" || k === "best" ? "asc" : "desc");
    }
  };
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  const k = insights?.kpis;
  const latestFirst = [...(insights?.competitions ?? [])].reverse();
  const maxComps = insights?.players[0]?.comps ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-gnome-green mb-4">Dashboard</h1>
        <AdminTabs tabs={OVERVIEW_TABS} />
        <p className="text-bark-brown-light max-w-3xl">
          How the clan takes part in Skill and Boss of the Week: how many compete, who keeps coming back, who wins, and which regulars have gone quiet. Someone counts as
          competing when they gained at least 1 XP or kill. Results come from{" "}
          <a href="https://wiseoldman.net/groups/24582/competitions" target="_blank" rel="noopener noreferrer" className="text-gnome-green hover:underline">
            Wise Old Man
          </a>
          . To set up the next ones, go to{" "}
          <Link href="/admin/weekly-competition" className="text-gnome-green hover:underline">
            Weekly SOTW/BotW
          </Link>
          .
        </p>
      </div>

      {/* Filters and sync status, one row */}
      <Card hover={false} className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Competition type">
          {(["both", "sotw", "botw"] as KindFilter[]).map((key) => (
            <Button key={key} size="sm" variant={kind === key ? "primary" : "ghost"} onClick={() => setKind(key)} aria-pressed={kind === key}>
              {key === "both" ? "Both" : KIND_LABEL[key]}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <Button key={r.key} size="sm" variant={range === r.key ? "primary" : "ghost"} onClick={() => setRange(r.key)} aria-pressed={range === r.key}>
              {r.label}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-iron-grey">
          {sync.running ? (
            <span>Updating from Wise Old Man{sync.pending ? ` · ${sync.pending} to go` : ""}…</span>
          ) : sync.error ? (
            <span className="text-red-accent">{sync.error}</span>
          ) : (
            <span>Up to date{sync.done ? ` · ${sync.done} updated` : ""}</span>
          )}
          <Button size="sm" variant="secondary" onClick={runSync} disabled={sync.running}>
            Refresh
          </Button>
        </div>
      </Card>

      {loadError && <p className="text-red-accent">{loadError}</p>}
      {!data && !loadError && <p className="text-iron-grey">Loading…</p>}

      {insights && k && (
        <>
          {k.competitions === 0 ? (
            <Card hover={false} className="text-center py-10">
              <p className="text-bark-brown">No competitions in this range yet.</p>
              <p className="text-sm text-iron-grey mt-1">{sync.running ? "Results are still coming in from Wise Old Man." : "Try a longer range, or press Refresh."}</p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatTile label="Competitions" value={k.competitions} />
                <StatTile label="Different competitors" value={k.uniqueCompetitors} />
                <StatTile label="Competitors per competition" value={k.avgCompetitors.toFixed(1)} hint="on average" />
                <StatTile label="Of entrants took part" value={k.avgTurnout == null ? "--" : pct(k.avgTurnout)} hint="on average" />
                <StatTile label={`Regulars (${REGULAR_MIN}+ competitions)`} value={k.regulars} />
              </div>

              <Card hover={false}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                  <h2 className="font-display text-xl text-bark-brown">Competitors per competition</h2>
                  {kind === "both" && (
                    <div className="flex gap-4">
                      <Swatch color={KIND_COLOR.sotw} label={KIND_LABEL.sotw} />
                      <Swatch color={KIND_COLOR.botw} label={KIND_LABEL.botw} />
                    </div>
                  )}
                </div>
                <p className="text-xs text-iron-grey mb-3">
                  Each bar is one competition, by the day it ended. Busiest: <b className="text-bark-brown">{k.busiest?.comp.title}</b> with {k.busiest?.active} competitors.
                </p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-bark-brown-light)" strokeOpacity={0.25} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-iron-grey)" }} tickLine={false} axisLine={{ stroke: "var(--color-bark-brown-light)", strokeOpacity: 0.5 }} interval="preserveStartEnd" minTickGap={16} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-iron-grey)" }} tickLine={false} axisLine={false} width={40} />
                      <Tooltip content={<CompetitorsTip />} cursor={{ fill: "var(--color-bark-brown-light)", fillOpacity: 0.12 }} />
                      <Bar dataKey="active" name="Competitors" radius={[4, 4, 0, 0]} maxBarSize={36}>
                        {chartRows.map((r) => (
                          <Cell key={r.id} fill={KIND_COLOR[r.kind]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {data && <CompareWeeks competitions={data.competitions} results={data.results} from={from} />}

              <Card hover={false}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                  <h2 className="font-display text-xl text-bark-brown">Returning and first-time competitors</h2>
                  <div className="flex gap-4">
                    <Swatch color="var(--viz-returning)" label="Returning" />
                    <Swatch color="var(--viz-new)" label="First time" />
                  </div>
                </div>
                <p className="text-xs text-iron-grey mb-3">&quot;First time&quot; means their first {kind === "both" ? "SOTW or BotW" : KIND_SHORT[kind]} on record, so the earliest competitions are all first-timers.</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-bark-brown-light)" strokeOpacity={0.25} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-iron-grey)" }} tickLine={false} axisLine={{ stroke: "var(--color-bark-brown-light)", strokeOpacity: 0.5 }} interval="preserveStartEnd" minTickGap={16} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-iron-grey)" }} tickLine={false} axisLine={false} width={40} />
                      <Tooltip content={<NewReturningTip />} cursor={{ fill: "var(--color-bark-brown-light)", fillOpacity: 0.12 }} />
                      <Bar dataKey="returning" stackId="a" name="Returning" fill="var(--viz-returning)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={36} />
                      <Bar dataKey="firstTimers" stackId="a" name="First time" fill="var(--viz-new)" stroke="var(--viz-surface)" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <div className="grid gap-6 lg:grid-cols-3">
                <Card hover={false} className="lg:col-span-2 overflow-hidden">
                  <h2 className="font-display text-xl text-bark-brown">Most frequent competitors</h2>
                  <p className="text-xs text-iron-grey mb-3">Click a column to sort. The bar shows how many of the {k.competitions} competitions they took part in.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[620px]">
                      <thead>
                        <tr className="border-b border-bark-brown-light text-iron-grey text-xs uppercase tracking-wide">
                          <th className="text-left py-2 px-2">#</th>
                          <th className={thClass} onClick={() => toggleSort("name")}>Player{arrow("name")}</th>
                          <th className={thClass} onClick={() => toggleSort("comps")}>Competed{arrow("comps")}</th>
                          <th className={thClass} onClick={() => toggleSort("wins")}>Wins{arrow("wins")}</th>
                          <th className={thClass} onClick={() => toggleSort("podiums")}>Top 3{arrow("podiums")}</th>
                          <th className={thClass} onClick={() => toggleSort("best")}>Best{arrow("best")}</th>
                          <th className={thClass} onClick={() => toggleSort("lastEnds")}>Last competed{arrow("lastEnds")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(showAllPlayers ? sortedPlayers : sortedPlayers.slice(0, 15)).map((p, i) => (
                          <tr key={p.playerId} className="border-b border-bark-brown-light/30 last:border-0">
                            <td className="py-1.5 px-2 text-iron-grey">{i + 1}</td>
                            <td className="py-1.5 px-2 font-semibold text-bark-brown">{p.name}</td>
                            <td className="py-1.5 px-2">
                              <div className="flex items-center gap-2">
                                <span className="w-16 h-2 rounded-full bg-bark-brown-light/20 overflow-hidden" aria-hidden>
                                  <span className="block h-full rounded-full bg-gnome-green" style={{ width: `${(p.comps / maxComps) * 100}%` }} />
                                </span>
                                <span className="font-stats">
                                  {p.comps}
                                  <span className="text-iron-grey text-xs"> ({pct(p.share)})</span>
                                </span>
                              </div>
                              {kind === "both" && (
                                <span className="text-[11px] text-iron-grey">
                                  {p.sotw} SOTW · {p.botw} BotW
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 font-stats">{p.wins || "–"}</td>
                            <td className="py-1.5 px-2 font-stats">{p.podiums || "–"}</td>
                            <td className="py-1.5 px-2">{medal(p.best)}</td>
                            <td className="py-1.5 px-2 text-xs text-bark-brown-light whitespace-nowrap" title={p.lastTitle}>
                              {dayYear(p.lastEnds)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {sortedPlayers.length > 15 && (
                    <button type="button" onClick={() => setShowAllPlayers((v) => !v)} className="mt-3 text-sm text-gnome-green hover:underline">
                      {showAllPlayers ? "Show top 15" : `Show all ${sortedPlayers.length}`}
                    </button>
                  )}
                </Card>

                <Card hover={false}>
                  <h2 className="font-display text-xl text-bark-brown">Regulars who&apos;ve gone quiet</h2>
                  <p className="text-xs text-iron-grey mb-3">
                    Competed in {REGULAR_MIN}+ of these, but none of the latest {QUIET_AFTER}. Worth a nudge?
                  </p>
                  {insights.quiet.length === 0 ? (
                    <p className="text-sm text-bark-brown-light">Nobody: every regular has been in a recent one.</p>
                  ) : (
                    <ul className="space-y-2">
                      {insights.quiet.slice(0, 12).map((p) => (
                        <li key={p.playerId} className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="font-semibold text-bark-brown truncate">{p.name}</span>
                          <span className="text-xs text-iron-grey whitespace-nowrap">
                            {p.comps} competed · last {day(p.lastEnds)}
                          </span>
                        </li>
                      ))}
                      {insights.quiet.length > 12 && <li className="text-xs text-iron-grey">and {insights.quiet.length - 12} more</li>}
                    </ul>
                  )}
                </Card>
              </div>

              <Card hover={false} className="overflow-hidden">
                <h2 className="font-display text-xl text-bark-brown mb-1">Every competition</h2>
                <p className="text-xs text-iron-grey mb-3">{data?.canEdit ? "Boss weeks show their difficulty tier; change it if the built-in one doesn't fit." : "Boss weeks show their difficulty tier."}</p>
                {tierError && <p className="text-sm text-red-accent mb-2">{tierError}</p>}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[760px]">
                    <thead>
                      <tr className="border-b border-bark-brown-light text-iron-grey text-xs uppercase tracking-wide">
                        <th className="text-left py-2 px-2">Ended</th>
                        <th className="text-left py-2 px-2">Competition</th>
                        <th className="text-right py-2 px-2">Competed</th>
                        <th className="text-right py-2 px-2">Took part</th>
                        <th className="text-left py-2 px-2">Top 3</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAllComps ? latestFirst : latestFirst.slice(0, 12)).map((s) => {
                        const running = s.running;
                        return (
                          <tr key={s.comp.wom_id} className="border-b border-bark-brown-light/30 last:border-0 align-top">
                            <td className="py-2 px-2 whitespace-nowrap text-bark-brown-light">{running ? <span className="text-gnome-green font-semibold">Running</span> : dayYear(s.comp.ends_at)}</td>
                            <td className="py-2 px-2">
                              <a href={`https://wiseoldman.net/competitions/${s.comp.wom_id}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-bark-brown hover:text-gnome-green">
                                {s.comp.title}
                              </a>
                              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                <KindChip kind={s.comp.kind} />
                                {s.comp.kind === "botw" &&
                                  (data?.canEdit ? (
                                    <select
                                      value={s.comp.difficulty ?? ""}
                                      onChange={(e) => setTier(s.comp.wom_id, (e.target.value || null) as Difficulty | null)}
                                      className="text-[11px] rounded border border-bark-brown-light/60 bg-parchment px-1 py-0.5 text-bark-brown cursor-pointer"
                                      aria-label={`Difficulty for ${s.comp.title}`}
                                    >
                                      <option value="">{DIFFICULTY_LABEL[defaultDifficulty(s.comp.metric)]} (built-in)</option>
                                      {DIFFICULTIES.map((d) => (
                                        <option key={d} value={d}>
                                          {DIFFICULTY_LABEL[d]}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-[11px] text-iron-grey">{DIFFICULTY_LABEL[s.comp.difficulty ?? defaultDifficulty(s.comp.metric)]}</span>
                                  ))}
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right font-stats">
                              {s.active}
                              <span className="text-iron-grey text-xs"> / {s.comp.participant_count}</span>
                            </td>
                            <td className="py-2 px-2 text-right font-stats">{s.turnout == null ? "--" : pct(s.turnout)}</td>
                            <td className="py-2 px-2">
                              {s.top.length === 0 ? (
                                <span className="text-iron-grey text-xs">No gains yet</span>
                              ) : (
                                <ol className="space-y-0.5">
                                  {s.top.map((t, i) => (
                                    <li key={i} className="flex justify-between gap-3 text-xs">
                                      <span>
                                        {medal(t.rank)} {t.name}
                                      </span>
                                      <span className="font-stats text-iron-grey">+{compact(t.gained)}</span>
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {latestFirst.length > 12 && (
                  <button type="button" onClick={() => setShowAllComps((v) => !v)} className="mt-3 text-sm text-gnome-green hover:underline">
                    {showAllComps ? "Show the latest 12" : `Show all ${latestFirst.length}`}
                  </button>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
