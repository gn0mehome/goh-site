// A WOM competition can track several skills or bosses at once (WOM ranks
// players by the combined total). These helpers read and check that list.

import { SKILLS, BOSSES, ACTIVITIES, COMPUTED_METRICS } from "@wise-old-man/utils";

export const VALID_METRICS = new Set<string>([...SKILLS, ...BOSSES, ...ACTIVITIES, ...COMPUTED_METRICS]);
export const MAX_METRICS = 10;

/** A competition row's metrics: the stored list, or just its one metric for older rows. */
export function metricsOf(row: { metric: string; metrics?: string[] | null }): string[] {
  return row.metrics?.length ? row.metrics : [row.metric];
}

/**
 * The metrics from a request body (`metrics` array, or a single `metric`),
 * de-duplicated in order. Returns an error message instead when any are invalid.
 */
export function parseMetrics(body: { metric?: unknown; metrics?: unknown }): { metrics: string[] } | { error: string } | null {
  const raw = Array.isArray(body.metrics) ? body.metrics : typeof body.metric === "string" ? [body.metric] : null;
  if (!raw) return null;
  const metrics = [...new Set(raw.filter((m): m is string => typeof m === "string" && m.length > 0))];
  if (metrics.length === 0) return { error: "Pick at least one skill or boss." };
  if (metrics.length > MAX_METRICS) return { error: `A competition can track at most ${MAX_METRICS} skills or bosses.` };
  if (metrics.some((m) => !VALID_METRICS.has(m))) return { error: "Invalid metric." };
  return { metrics };
}

/** What to send WOM: one metric the old way, several as `metrics` (WOM's newer field). */
export function womMetricFields(metrics: string[]): { metric: string; metrics?: string[] } {
  return metrics.length > 1 ? { metric: metrics[0], metrics } : { metric: metrics[0] };
}
