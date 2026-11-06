import type { SupabaseClient } from "@supabase/supabase-js";
import type { BossTiers } from "@/lib/boss-difficulty";

/** Saved Easy / Hard tiers by boss metric (bosses not saved use the suggestion). */
export async function loadBossTiers(supabase: SupabaseClient | null): Promise<BossTiers> {
  if (!supabase) return {};
  const { data } = await supabase.from("boss_difficulties").select("metric, difficulty");
  return Object.fromEntries((data ?? []).map((r) => [r.metric, r.difficulty])) as BossTiers;
}
