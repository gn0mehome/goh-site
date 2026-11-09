"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { presetDates } from "@/lib/raffle";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface LeaderboardEntry {
  discord_id: string;
  name: string;
  rsn: string | null;
  count: number;
}

interface TimeseriesEntry {
  event_id: string;
  title: string;
  start_time: string;
  attendee_count: number;
}

type Preset = "week" | "month" | "all" | "custom";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

const MEDALS = ["🥇", "🥈", "🥉"];

export function AttendanceLeaderboard() {
  const [preset, setPreset] = useState<Preset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [timeseries, setTimeseries] = useState<TimeseriesEntry[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (activePreset: Preset, start: string, end: string) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    // Presets fill the date boxes, so every range but All Time is sent as dates.
    if (activePreset !== "all") {
      if (start) params.set("start", new Date(start).toISOString());
      if (end) params.set("end", new Date(end + "T23:59:59").toISOString());
    }

    try {
      const res = await fetch(`/api/attendance/leaderboard?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard ?? []);
        setTimeseries(data.timeseries ?? []);
        setTotalEvents(data.total_events ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(preset, customStart, customEnd); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // This Week is Sunday to Saturday and This Month the whole calendar month
  // (same as the Raffles page); the dates go into the boxes so it's clear
  // what's counted. All Time clears them.
  const selectPreset = (p: Preset) => {
    setPreset(p);
    const { from, to } = p === "week" || p === "month" ? presetDates(p) : { from: "", to: "" };
    setCustomStart(from);
    setCustomEnd(to);
    load(p, from, to);
  };

  const applyCustomRange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart && !customEnd) return;
    setPreset("custom");
    load("custom", customStart, customEnd);
  };

  const chartTickInterval = timeseries.length > 15 ? Math.ceil(timeseries.length / 10) : 0;

  return (
    <div>
      {/* Range filters */}
      <Card hover={false} className="mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? "primary" : "ghost"}
              onClick={() => selectPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <form onSubmit={applyCustomRange} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-iron-grey mb-1">From</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-2 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green"
            />
          </div>
          <div>
            <label className="block text-xs text-iron-grey mb-1">To</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-2 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green"
            />
          </div>
          <Button type="submit" size="sm" variant={preset === "custom" ? "primary" : "secondary"}>
            Apply Range
          </Button>
        </form>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-parchment-dark border-t-gnome-green rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Leaderboard table */}
          <Card hover={false} className="lg:col-span-2">
            <h2 className="font-display text-xl text-gnome-green mb-1">Top Attendees</h2>
            <p className="text-xs text-iron-grey mb-4">
              {totalEvents} event{totalEvents === 1 ? "" : "s"} in range
            </p>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-iron-grey">No attendance recorded for this range.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bark-brown-light text-iron-grey text-xs uppercase tracking-wide">
                    <th className="text-left py-2 w-8">#</th>
                    <th className="text-left py-2">Member</th>
                    <th className="text-right py-2">Events</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, i) => (
                    <tr key={entry.discord_id} className="border-b border-parchment-dark last:border-0">
                      <td className="py-2 text-iron-grey font-stats">{MEDALS[i] ?? i + 1}</td>
                      <td className="py-2 font-mono text-bark-brown">{entry.rsn ?? entry.name}</td>
                      <td className="py-2 text-right font-stats font-bold text-gnome-green">{entry.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Attendance over time chart */}
          <Card hover={false} className="lg:col-span-3">
            <h2 className="font-display text-xl text-gnome-green mb-1">Attendance Over Time</h2>
            <p className="text-xs text-iron-grey mb-4">Attendees per event</p>
            {timeseries.length === 0 ? (
              <p className="text-sm text-iron-grey">No events in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={timeseries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8D5A8" />
                  <XAxis
                    dataKey="start_time"
                    tick={{ fontSize: 10, fill: "#555" }}
                    interval={chartTickInterval}
                    tickFormatter={(d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#555" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--color-parchment)", border: "1px solid var(--color-bark-brown-light)", borderRadius: "0.375rem", fontSize: "0.75rem" }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.title ?? ""}
                    formatter={(v) => [v, "Attendees"]}
                  />
                  <Bar dataKey="attendee_count" fill="var(--color-gnome-green)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      )}

      <p className="text-xs text-iron-grey text-center mt-6">
        Attended an event but don&apos;t see yourself listed? Check in from the{" "}
        <Link href="/events" className="text-gnome-green hover:underline">events page</Link>{" "}
        or link your RSN on your <Link href="/account" className="text-gnome-green hover:underline">account page</Link>.
      </p>
    </div>
  );
}
