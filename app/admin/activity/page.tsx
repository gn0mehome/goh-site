"use client";

import { AdminTabs } from "@/components/admin/AdminTabs";
import { OVERVIEW_TABS } from "@/lib/admin-tabs";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ExportHeader, ExportMenu } from "@/components/admin/ExportMenu";
import type { ExportSheet } from "@/lib/export-xlsx";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { presetDates, toDateInput } from "@/lib/raffle";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

/** Short axis numbers: 14000000 -> 14M, 3500 -> 3.5K. */
const compact = (n: number) => Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
import type { ActivityMember, Focus } from "@/app/api/admin/activity/route";
import type { MetricRanking } from "@/app/api/admin/activity/skills-bosses/route";

type Preset = "week" | "month" | "all" | "custom";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

const FOCUS_LABELS: Record<Focus, string> = {
  skiller: "Skiller",
  bosser: "Bosser",
  balanced: "Balanced",
  inactive: "Inactive",
};

const FOCUS_COLORS: Record<Focus, string> = {
  skiller: "var(--color-gnome-green)",
  bosser: "#8B1A1A",
  balanced: "#DAA520",
  inactive: "#6B6B6B",
};

interface Summary {
  totalMembers: number;
  activeCount: number;
  inactiveCount: number;
  newMembers: number;
  linkedCount: number;
  skillerCount: number;
  bosserCount: number;
  balancedCount: number;
  uniqueAttendees: number;
  attendanceRows: number;
}

type SortKey = "displayName" | "registeredAt" | "daysSinceActive" | "ehpGained" | "ehbGained" | "eventsAttended";
type LinkedFilter = "linked" | "unlinked";

const ALL_LINKED_FILTERS: LinkedFilter[] = ["linked", "unlinked"];
const ALL_FOCUS_FILTERS: Focus[] = ["skiller", "bosser", "balanced", "inactive"];

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card hover={false} className="text-center py-3">
      <p className="font-stats text-xl text-gold-display font-bold">{value}</p>
      <p className="text-xs text-bark-brown-light">{label}</p>
    </Card>
  );
}

/**
 * The dates a preset covers: This Week is Sunday to Saturday and This Month
 * the calendar month (as on the Raffles page), cut off at today because
 * there are no gains from the future yet. All Time has no dates.
 */
function rangeFor(p: Preset): { from: string; to: string } {
  if (p !== "week" && p !== "month") return { from: "", to: "" };
  const { from, to } = presetDates(p);
  const today = toDateInput(new Date());
  return { from, to: to > today ? today : to };
}

export default function AdminActivityPage() {
  const [preset, setPreset] = useState<Preset>("month");
  const [customStart, setCustomStart] = useState(() => rangeFor("month").from);
  const [customEnd, setCustomEnd] = useState(() => rangeFor("month").to);
  const [members, setMembers] = useState<ActivityMember[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("ehpGained");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [linkedFilter, setLinkedFilter] = useState<Set<LinkedFilter>>(new Set(ALL_LINKED_FILTERS));
  const [focusFilter, setFocusFilter] = useState<Set<Focus>>(new Set(ALL_FOCUS_FILTERS));
  const [topSkills, setTopSkills] = useState<MetricRanking[]>([]);
  const [topBosses, setTopBosses] = useState<MetricRanking[]>([]);
  const [gainsAsOf, setGainsAsOf] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const loadSkillsBosses = useCallback(async (activePreset: Preset, start: string, end: string) => {
    const params = new URLSearchParams();
    // Presets fill the date boxes, so every range but All Time is sent as dates.
    if (activePreset === "all") {
      params.set("period", "all");
    } else {
      if (start) params.set("start", new Date(start).toISOString());
      if (end) params.set("end", new Date(end + "T23:59:59").toISOString());
    }

    try {
      const res = await fetch(`/api/admin/activity/skills-bosses?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setTopSkills((data.skills ?? []).slice(0, 10));
        setTopBosses((data.bosses ?? []).slice(0, 10));
        setGainsAsOf(data.asOfDate ?? null);
      }
    } catch {
      // Non-critical: the rest of the dashboard is still usable if this fails.
    }
  }, []);

  const load = useCallback(async (activePreset: Preset, start: string, end: string) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    // Presets fill the date boxes, so every range but All Time is sent as dates.
    if (activePreset === "all") {
      params.set("period", "all");
    } else {
      if (start) params.set("start", new Date(start).toISOString());
      if (end) params.set("end", new Date(end + "T23:59:59").toISOString());
    }

    try {
      const res = await fetch(`/api/admin/activity?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setMembers(data.members ?? []);
        setSummary(data.summary ?? null);
      } else {
        setError(data.error ?? "Failed to load activity data.");
      }
    } catch {
      setError("Failed to load activity data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(preset, customStart, customEnd);
    loadSkillsBosses(preset, customStart, customEnd);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectPreset = (p: Preset) => {
    setPreset(p);
    const { from, to } = rangeFor(p);
    setCustomStart(from);
    setCustomEnd(to);
    load(p, from, to);
    loadSkillsBosses(p, from, to);
  };

  const captureNow = async () => {
    setCapturing(true);
    try {
      await fetch("/api/snapshots/capture", { method: "POST" });
      await loadSkillsBosses(preset, customStart, customEnd);
    } finally {
      setCapturing(false);
    }
  };

  const applyCustomRange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart && !customEnd) return;
    setPreset("custom");
    load("custom", customStart, customEnd);
    loadSkillsBosses("custom", customStart, customEnd);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const toggleLinkedFilter = (key: LinkedFilter) => {
    setLinkedFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleFocusFilter = (key: Focus) => {
    setFocusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filtersActive = linkedFilter.size < ALL_LINKED_FILTERS.length || focusFilter.size < ALL_FOCUS_FILTERS.length;

  const resetFilters = () => {
    setLinkedFilter(new Set(ALL_LINKED_FILTERS));
    setFocusFilter(new Set(ALL_FOCUS_FILTERS));
  };

  const filteredMembers = useMemo(() => {
    return members.filter(
      (m) => linkedFilter.has(m.linked ? "linked" : "unlinked") && focusFilter.has(m.focus)
    );
  }, [members, linkedFilter, focusFilter]);

  const sortedMembers = useMemo(() => {
    const copy = [...filteredMembers];
    copy.sort((a, b) => {
      let av: string | number = a[sortKey] as string | number;
      let bv: string | number = b[sortKey] as string | number;
      if (sortKey === "daysSinceActive") {
        av = a.daysSinceActive ?? Infinity;
        bv = b.daysSinceActive ?? Infinity;
      }
      if (typeof av === "string" && typeof bv === "string") {
        av = av.toLowerCase();
        bv = bv.toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filteredMembers, sortKey, sortDir]);

  const topGainers = useMemo(() => {
    return [...members]
      .filter((m) => m.ehpGained > 0 || m.ehbGained > 0)
      .sort((a, b) => b.ehpGained + b.ehbGained - (a.ehpGained + a.ehbGained))
      .slice(0, 12)
      .map((m) => ({
        name: m.displayName,
        ehpGained: Math.round(m.ehpGained * 10) / 10,
        ehbGained: Math.round(m.ehbGained * 10) / 10,
      }));
  }, [members]);

  const focusData = summary
    ? [
        { key: "skiller" as Focus, count: summary.skillerCount },
        { key: "bosser" as Focus, count: summary.bosserCount },
        { key: "balanced" as Focus, count: summary.balancedCount },
        { key: "inactive" as Focus, count: summary.inactiveCount },
      ]
    : [];

  const inputClass = "px-3 py-2 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green";
  const thClass = "text-left py-2 px-2 cursor-pointer select-none hover:text-gnome-green";

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  const rangeLabel =
    preset === "custom" ? `${customStart || "the start"} to ${customEnd || "today"}` : PRESETS.find((p) => p.key === preset)?.label ?? "";

  // The Excel workbook: the summary, the two rankings and the whole (filtered, sorted) roster.
  const buildSheets = (): ExportSheet[] => [
    {
      name: "Summary",
      rows: [
        ["Gn0me Home · Player Activity"],
        ["Range", rangeLabel],
        ["Exported", new Date().toLocaleString()],
        [],
        ["Clan members", summary?.totalMembers ?? null],
        ["Active", summary?.activeCount ?? null],
        ["Gone quiet", summary?.inactiveCount ?? null],
        ["New members", summary?.newMembers ?? null],
        ["RSN-linked", summary?.linkedCount ?? null],
        ["Unique event attendees", summary?.uniqueAttendees ?? null],
        [],
        ["Skillers", summary?.skillerCount ?? null],
        ["Bossers", summary?.bosserCount ?? null],
        ["Balanced", summary?.balancedCount ?? null],
        ["Inactive", summary?.inactiveCount ?? null],
      ],
    },
    { name: "Top skills", rows: [["Skill", "XP gained"], ...topSkills.map((m) => [m.name, m.totalGained])] },
    { name: "Top bosses", rows: [["Boss", "Kills gained"], ...topBosses.map((m) => [m.name, m.totalGained])] },
    {
      name: "Roster",
      rows: [
        ["RSN", "Linked", "Discord", "Role", "Joined the WOM group", "New", "Days since active", "EHP gained", "EHB gained", "Focus", "Events attended"],
        ...sortedMembers.map((m) => [
          m.displayName,
          m.linked ? "Yes" : "No",
          m.discordUsername ?? "",
          m.clanRole,
          m.registeredAt.slice(0, 10),
          m.isNew ? "Yes" : "",
          m.daysSinceActive,
          Math.round(m.ehpGained * 10) / 10,
          Math.round(m.ehbGained * 10) / 10,
          FOCUS_LABELS[m.focus],
          m.eventsAttended,
        ]),
      ],
    },
  ];

  return (
    <div>
      <div data-export-hide>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="font-display text-3xl text-gnome-green">Dashboard</h1>
        {!loading && summary && <ExportMenu title="Player Activity" captureRef={reportRef} sheets={buildSheets} />}
      </div>
      <AdminTabs tabs={OVERVIEW_TABS} />
      <p className="text-bark-brown-light mb-6">
        Retention, engagement, and skilling-vs-bossing activity for the clan roster. For clan growth over
        time see the <Link href="/admin" className="text-gnome-green hover:underline">Dashboard</Link>; for
        full event attendance rankings see the <Link href="/leaderboard" className="text-gnome-green hover:underline">Leaderboard</Link>.
      </p>

      </div>

      {/* Range filters */}
      <Card hover={false} className="mb-6" data-export-hide>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {PRESETS.map((p) => (
            <Button key={p.key} size="sm" variant={preset === p.key ? "primary" : "ghost"} onClick={() => selectPreset(p.key)}>
              {p.label}
            </Button>
          ))}
        </div>
        <form onSubmit={applyCustomRange} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-iron-grey mb-1">From</label>
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-iron-grey mb-1">To</label>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className={inputClass} />
          </div>
          <Button type="submit" size="sm" variant={preset === "custom" ? "primary" : "secondary"}>
            Apply Range
          </Button>
        </form>
      </Card>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-accent/10 border border-red-accent/30 text-sm text-red-accent">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-parchment-dark border-t-gnome-green rounded-full animate-spin" />
        </div>
      ) : (
        <div ref={reportRef}>
          <ExportHeader title="Player Activity" detail={rangeLabel} />
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              <StatCard label="Clan Members" value={summary.totalMembers} />
              <StatCard label="Active" value={summary.activeCount} />
              <StatCard label="Gone Quiet" value={summary.inactiveCount} />
              <StatCard label="New Members" value={summary.newMembers} />
              <StatCard label="RSN-Linked" value={summary.linkedCount} />
              <StatCard label="Unique Attendees" value={summary.uniqueAttendees} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card hover={false}>
              <h3 className="font-display text-lg text-bark-brown mb-1">Skilling vs. Bossing</h3>
              <p className="text-xs text-iron-grey mb-4">Top gainers this range, by EHP/EHB gained</p>
              {topGainers.length === 0 ? (
                <p className="text-sm text-iron-grey">No gains recorded for this range yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topGainers}>
                    <CartesianGrid strokeDasharray="3 3"  />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-35} textAnchor="end" height={80} interval={0} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={compact} width={44} />
                    <Tooltip contentStyle={{ backgroundColor: "var(--color-parchment)", border: "1px solid var(--color-bark-brown-light)", borderRadius: "0.375rem", fontSize: "0.75rem" }} />
                    <Legend wrapperStyle={{ fontSize: "0.8rem" }} />
                    <Bar isAnimationActive={false} dataKey="ehpGained" name="EHP Gained" fill="var(--color-gnome-green)" radius={[4, 4, 0, 0]} />
                    <Bar isAnimationActive={false} dataKey="ehbGained" name="EHB Gained" fill="#8B1A1A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card hover={false}>
              <h3 className="font-display text-lg text-bark-brown mb-1">Activity Breakdown</h3>
              <p className="text-xs text-iron-grey mb-4">Where the roster falls this range</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={focusData}>
                  <CartesianGrid strokeDasharray="3 3"  />
                  <XAxis dataKey="key" tickFormatter={(k) => FOCUS_LABELS[k as Focus] ?? k} tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={44} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--color-parchment)", border: "1px solid var(--color-bark-brown-light)", borderRadius: "0.375rem", fontSize: "0.75rem" }}
                    labelFormatter={(k) => FOCUS_LABELS[k as Focus] ?? k}
                  />
                  <Bar isAnimationActive={false} dataKey="count" radius={[4, 4, 0, 0]}>
                    {focusData.map((d) => (
                      <Cell key={d.key} fill={FOCUS_COLORS[d.key]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Skills & Bosses breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card hover={false}>
              <h3 className="font-display text-lg text-bark-brown mb-1">Top Skills</h3>
              <p className="text-xs text-iron-grey mb-4">Most XP gained clan-wide this range</p>
              {topSkills.length === 0 ? (
                <p className="text-sm text-iron-grey">No skill gains recorded for this range yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topSkills} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3"  />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={compact} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} interval={0} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--color-parchment)", border: "1px solid var(--color-bark-brown-light)", borderRadius: "0.375rem", fontSize: "0.75rem" }}
                      formatter={(v) => [Number(v).toLocaleString(), "XP Gained"]}
                    />
                    <Bar isAnimationActive={false} dataKey="totalGained" name="XP Gained" fill="var(--color-gnome-green)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card hover={false}>
              <h3 className="font-display text-lg text-bark-brown mb-1">Top Bosses</h3>
              <p className="text-xs text-iron-grey mb-4">Most KC gained clan-wide this range</p>
              {topBosses.length === 0 ? (
                <p className="text-sm text-iron-grey">No boss gains recorded for this range yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topBosses} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3"  />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={compact} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} interval={0} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--color-parchment)", border: "1px solid var(--color-bark-brown-light)", borderRadius: "0.375rem", fontSize: "0.75rem" }}
                      formatter={(v) => [Number(v).toLocaleString(), "KC Gained"]}
                    />
                    <Bar isAnimationActive={false} dataKey="totalGained" name="KC Gained" fill="#8B1A1A" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
          {(topSkills.length > 0 || topBosses.length > 0) && (
            <p className="text-xs text-iron-grey -mt-4 mb-6">
              Skill/boss gains are captured once a day, not live{gainsAsOf ? ` — updated as of ${new Date(gainsAsOf).toLocaleDateString()}` : ""}.
            </p>
          )}

          {/* Full roster table: in printouts, but too long for a picture (it's in the Excel export) */}
          <Card hover={false} data-picture-hide>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg text-bark-brown">
                Full Roster ({sortedMembers.length}{sortedMembers.length !== members.length ? ` of ${members.length}` : ""})
              </h3>
              <Button variant="ghost" size="sm" onClick={captureNow} disabled={capturing} data-export-hide>
                {capturing ? "Updating..." : "🔄 Update"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 text-sm" data-export-hide>
              <div className="flex items-center gap-3">
                <span className="text-xs text-iron-grey uppercase tracking-wide">Linked</span>
                {ALL_LINKED_FILTERS.map((key) => (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={linkedFilter.has(key)}
                      onChange={() => toggleLinkedFilter(key)}
                      className="accent-gnome-green"
                    />
                    {key === "linked" ? "Linked" : "Not Linked"}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-iron-grey uppercase tracking-wide">Focus</span>
                {ALL_FOCUS_FILTERS.map((key) => (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={focusFilter.has(key)}
                      onChange={() => toggleFocusFilter(key)}
                      className="accent-gnome-green"
                    />
                    {FOCUS_LABELS[key]}
                  </label>
                ))}
              </div>
              {filtersActive && (
                <button onClick={resetFilters} className="text-xs text-gnome-green hover:underline">
                  Reset filters
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b border-bark-brown-light text-iron-grey text-xs uppercase tracking-wide">
                    <th className={thClass} onClick={() => toggleSort("displayName")}>RSN{sortArrow("displayName")}</th>
                    <th className="text-left py-2 px-2">Linked</th>
                    <th className="text-left py-2 px-2">Role</th>
                    <th className={thClass} onClick={() => toggleSort("registeredAt")}>Registered{sortArrow("registeredAt")}</th>
                    <th
                      className={thClass}
                      onClick={() => toggleSort("daysSinceActive")}
                      title="Last time Wise Old Man detected a stat change — logging in without gaining XP won't update this"
                    >
                      Last XP Update{sortArrow("daysSinceActive")}
                    </th>
                    <th className={`${thClass} text-right`} onClick={() => toggleSort("ehpGained")}>EHP Gained{sortArrow("ehpGained")}</th>
                    <th className={`${thClass} text-right`} onClick={() => toggleSort("ehbGained")}>EHB Gained{sortArrow("ehbGained")}</th>
                    <th className="text-left py-2 px-2">Focus</th>
                    <th className={`${thClass} text-right`} onClick={() => toggleSort("eventsAttended")}>Events{sortArrow("eventsAttended")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((m) => (
                    <tr key={m.username} className="border-b border-parchment-dark last:border-0">
                      <td className="py-2 px-2 font-mono text-bark-brown">{m.displayName}</td>
                      <td className="py-2 px-2">{m.linked ? "✓" : "—"}</td>
                      <td className="py-2 px-2 text-xs text-iron-grey capitalize">{m.clanRole?.replace(/_/g, " ")}</td>
                      <td className="py-2 px-2 text-xs text-iron-grey">
                        {new Date(m.registeredAt).toLocaleDateString()}
                        {m.isNew && <span className="ml-1 text-gnome-green">new</span>}
                      </td>
                      <td className="py-2 px-2 text-xs text-iron-grey">
                        {m.daysSinceActive === null ? "—" : `${m.daysSinceActive}d since XP gain`}
                      </td>
                      <td className="py-2 px-2 text-right font-stats text-gnome-green">{m.ehpGained.toFixed(1)}</td>
                      <td className="py-2 px-2 text-right font-stats text-red-accent">{m.ehbGained.toFixed(1)}</td>
                      <td className="py-2 px-2">
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: `${FOCUS_COLORS[m.focus]}20`, color: FOCUS_COLORS[m.focus] }}
                        >
                          {FOCUS_LABELS[m.focus]}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-stats">{m.eventsAttended}</td>
                    </tr>
                  ))}
                  {sortedMembers.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-4 text-center text-iron-grey">No members found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
