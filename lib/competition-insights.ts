// Competition insights: keeps a copy of the clan's Wise Old Man competition
// results (who gained, how much, where they placed) for the staff dashboard
// at /admin/competition-insights. WOM stays the source of truth; this is a
// cache that grows a few competitions at a time so WOM's rate limit is safe.

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyMetric, getAllGroupCompetitions, getCompetitionDetailsOrThrow } from "@/lib/wom";

export type CompetitionKind = "sotw" | "botw" | "other";

export interface CompetitionRow {
  wom_id: number;
  title: string;
  metric: string;
  kind: CompetitionKind;
  type: string;
  starts_at: string;
  ends_at: string;
  participant_count: number;
  active_count: number;
  final: boolean;
  synced_at: string;
}

/** [wom_id, player_id, display_name, gained, rank] -- compact for the browser. */
export type PlayerResultTuple = [number, number, string, number, number];

/** WOM keeps updating players for a while after a competition ends; refresh until then. */
const SETTLE_MS = 12 * 3_600_000;

/** SOTW/BotW from the title when it says so, otherwise from the metric (a skill or a boss). */
export function kindOf(title: string, metric: string): CompetitionKind {
  if (/boss of the week|\bbotw\b/i.test(title)) return "botw";
  if (/skill of the week|\bsotw\b/i.test(title)) return "sotw";
  const m = classifyMetric(metric);
  return m === "skill" ? "sotw" : m === "boss" ? "botw" : "other";
}

/**
 * Brings a few competitions up to date: ones never stored, then running ones
 * and ones that finished recently enough that WOM may still be updating
 * them. Newest first. Returns how many are still waiting, so the dashboard
 * can call again until it's caught up.
 */
export async function syncCompetitionResults(supabase: SupabaseClient, max = 6): Promise<{ synced: number; pending: number; total: number; error?: string }> {
  let list: Awaited<ReturnType<typeof getAllGroupCompetitions>>;
  try {
    list = await getAllGroupCompetitions();
  } catch (e) {
    return { synced: 0, pending: 0, total: 0, error: `Wise Old Man didn't answer (${e instanceof Error ? e.message : "unknown error"}). Try again in a minute.` };
  }
  const now = Date.now();
  const started = list.filter((c) => new Date(c.startsAt).getTime() <= now);

  const { data: stored } = await supabase.from("competition_results").select("wom_id, final");
  const finalIds = new Set((stored ?? []).filter((r) => r.final).map((r) => r.wom_id as number));
  const storedIds = new Set((stored ?? []).map((r) => r.wom_id as number));

  // Competitions deleted on WOM drop out of the dashboard too (only when WOM answered with a real list).
  if (list.length > 0) {
    const gone = [...storedIds].filter((id) => !list.some((c) => c.id === id));
    if (gone.length) await supabase.from("competition_results").delete().in("wom_id", gone);
  }

  const todo = started
    .filter((c) => !finalIds.has(c.id))
    .sort((a, b) => {
      const aNew = storedIds.has(a.id) ? 1 : 0;
      const bNew = storedIds.has(b.id) ? 1 : 0;
      return aNew - bNew || new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime();
    });

  let synced = 0;
  for (const c of todo.slice(0, max)) {
    let details: Awaited<ReturnType<typeof getCompetitionDetailsOrThrow>>;
    try {
      details = await getCompetitionDetailsOrThrow(c.id);
    } catch (e) {
      return { synced, pending: todo.length - synced, total: started.length, error: `Couldn't load "${c.title}" from Wise Old Man (${e instanceof Error ? e.message : "unknown error"}).` };
    }
    const active = details.participations.filter((p) => p.progress.gained > 0).sort((a, b) => b.progress.gained - a.progress.gained);
    const ends = new Date(details.endsAt).getTime();
    const { error } = await supabase.from("competition_results").upsert({
      wom_id: details.id,
      title: details.title,
      metric: details.metric,
      kind: kindOf(details.title, details.metric),
      type: details.type,
      starts_at: new Date(details.startsAt).toISOString(),
      ends_at: new Date(details.endsAt).toISOString(),
      participant_count: details.participations.length,
      active_count: active.length,
      final: now > ends + SETTLE_MS,
      synced_at: new Date().toISOString(),
    });
    if (error) return { synced, pending: todo.length - synced, total: started.length, error: "Couldn't save the results." };
    await supabase.from("competition_result_players").delete().eq("wom_id", details.id);
    // Ties share a place (1, 2, 2, 4).
    let lastGain = -1;
    let lastRank = 0;
    const rows = active.map((p, i) => {
      const rank = p.progress.gained === lastGain ? lastRank : i + 1;
      lastGain = p.progress.gained;
      lastRank = rank;
      return { wom_id: details.id, player_id: p.player.id, username: p.player.username, display_name: p.player.displayName, gained: p.progress.gained, rank };
    });
    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from("competition_result_players").insert(rows.slice(i, i + 500));
    }
    synced++;
  }
  return { synced, pending: Math.max(0, todo.length - synced), total: started.length };
}

/** Everything the dashboard needs, newest competition first. */
export async function loadCompetitionResults(supabase: SupabaseClient): Promise<{ competitions: CompetitionRow[]; results: PlayerResultTuple[] }> {
  const { data: competitions } = await supabase.from("competition_results").select("*").order("starts_at", { ascending: false });
  const results: PlayerResultTuple[] = [];
  // Supabase returns at most 1,000 rows a call, so page through.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("competition_result_players")
      .select("wom_id, player_id, display_name, gained, rank")
      .order("wom_id")
      .order("rank")
      .order("player_id")
      .range(from, from + 999);
    if (error || !data) break;
    for (const r of data) results.push([r.wom_id, r.player_id, r.display_name, r.gained, r.rank]);
    if (data.length < 1000) break;
  }
  return { competitions: (competitions ?? []) as CompetitionRow[], results };
}
