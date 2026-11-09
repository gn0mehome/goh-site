"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/Card";

interface GainsChartProps {
  username: string;
}

interface GainDataPoint {
  date: string;
  value: number;
}

const PERIODS = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
] as const;

export function GainsChart({ username }: GainsChartProps) {
  const [period, setPeriod] = useState<string>("month");
  const [data, setData] = useState<GainDataPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGains = async (selectedPeriod: string) => {
    setPeriod(selectedPeriod);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `https://api.wiseoldman.net/v2/players/${encodeURIComponent(username)}/snapshots/timeline?metric=overall&period=${selectedPeriod}`
      );

      if (!res.ok) throw new Error("Failed to fetch gains data");

      const timeline = await res.json();

      if (!Array.isArray(timeline) || timeline.length === 0) {
        setData([]);
        return;
      }

      const points: GainDataPoint[] = timeline
        .map((point: { value: number; date: string }) => ({
          date: new Date(point.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          value: point.value,
        }))
        .reverse();

      setData(points);
    } catch {
      setError("Could not load gains data.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card hover={false}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg text-gnome-green">XP Gains</h3>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => fetchGains(p.key)}
              className={`px-3 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                period === p.key && data !== null
                  ? "bg-gnome-green text-text-light"
                  : "bg-parchment-dark text-bark-brown hover:bg-gnome-green/20"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {data === null && !loading && !error && (
        <div className="text-center py-8 text-iron-grey text-sm">
          <p>Click a time period above to load XP gains chart.</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-3 border-parchment-dark border-t-gnome-green rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <p className="text-center py-8 text-red-accent text-sm">{error}</p>
      )}

      {data && data.length > 0 && !loading && (
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8D5A8" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#6B6B6B" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6B6B6B" }}
              tickLine={false}
              tickFormatter={(v: number) =>
                v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : `${(v / 1_000).toFixed(0)}K`
              }
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-parchment)",
                border: "1px solid var(--color-bark-brown-light)",
                borderRadius: "0.375rem",
                fontSize: "0.8rem",
              }}
              formatter={(value) => [Number(value).toLocaleString(), "Total XP"]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-gnome-green)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#DAA520" }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {data && data.length === 0 && !loading && (
        <p className="text-center py-8 text-iron-grey text-sm">
          No snapshot data available for this period.
        </p>
      )}
    </Card>
  );
}
