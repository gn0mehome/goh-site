import type { SupabaseClient } from "@supabase/supabase-js";
import type { BossTiers, BossTitleNames } from "@/lib/boss-difficulty";

/** Saved Easy / Hard tiers by boss metric (bosses not saved use the suggestion). */
export async function loadBossTiers(supabase: SupabaseClient | null): Promise<BossTiers> {
  if (!supabase) return {};
  const { data } = await supabase.from("boss_difficulties").select("metric, difficulty");
  return Object.fromEntries((data ?? []).map((r) => [r.metric, r.difficulty])) as BossTiers;
}

/** Saved tiers plus the names bosses go by in titles. */
export async function loadBossSettings(supabase: SupabaseClient | null): Promise<{ tiers: BossTiers; names: BossTitleNames }> {
  if (!supabase) return { tiers: {}, names: {} };
  const full = await supabase.from("boss_difficulties").select("metric, difficulty, title_name");
  // Before the title_name column exists (migration 085), still return the tiers.
  const { data } = full.error ? await supabase.from("boss_difficulties").select("metric, difficulty") : full;
  const rows = (data ?? []) as { metric: string; difficulty: string; title_name?: string | null }[];
  return {
    tiers: Object.fromEntries(rows.map((r) => [r.metric, r.difficulty])) as BossTiers,
    names: Object.fromEntries(rows.filter((r) => r.title_name).map((r) => [r.metric, r.title_name])) as BossTitleNames,
  };
}
