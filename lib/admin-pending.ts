import { createClient } from "@supabase/supabase-js";
import type { PermissionKey } from "@/lib/permissions";

/** Things waiting on staff, counted for the sidebar badges and the dashboard's "Needs attention" panel. */
export const PENDING_SOURCES = {
  feedback: { label: "New feedback", href: "/admin/feedback", permission: "manage_feedback", table: "feedback_submissions", column: "status", value: "new" },
  staff_applications: { label: "Staff applications", href: "/admin/staff-applications", permission: "manage_staff_applications", table: "staff_applications", column: "status", value: "pending" },
  gnomie_reviews: { label: "Gn0mie shoutouts", href: "/admin/gnomie-reviews", permission: "manage_gnomie_reviews", table: "gnomie_reviews", column: "status", value: "pending" },
  testimonials: { label: "Testimonials", href: "/admin/testimonials", permission: "manage_testimonials", table: "testimonials", column: "status", value: "pending" },
  rsn_requests: { label: "RSN reset requests", href: "/admin/rsn-links", permission: "manage_rsn_links", table: "rsn_reset_requests", column: "status", value: "pending" },
  bingo_submissions: { label: "Clan Bingo tile submissions", href: "/admin/bingo/submissions", permission: "manage_bingo", table: "bingo_submissions", column: "status", value: "pending" },
  art_entries: { label: "Art contest entries", href: "/admin/art", permission: "manage_art", table: "art_entries", column: "status", value: "pending" },
  quest_submissions: { label: "Quest screenshots", href: "/admin/quests/submissions", permission: "manage_quests", table: "quest_event_submissions", column: "status", value: "pending" },
  unpaid_payouts: { label: "Unpaid prizes", href: "/admin/payouts", permission: "manage_payouts", table: "prize_payouts", column: "is_paid", value: false },
} as const satisfies Record<string, { label: string; href: string; permission: PermissionKey; table: string; column: string; value: string | boolean }>;

export type PendingKey = keyof typeof PENDING_SOURCES;

/**
 * Count of each pending item the caller is allowed to see (sources they
 * lack the permission for are left out). One head-only count query per
 * source, run in parallel; a failed count is just omitted rather than
 * breaking the admin layout.
 */
export async function getPendingCounts(canSee: (permission: PermissionKey) => boolean): Promise<Partial<Record<PendingKey, number>>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return {};
  const supabase = createClient(url, key);

  const entries = await Promise.all(
    (Object.keys(PENDING_SOURCES) as PendingKey[])
      .filter((k) => canSee(PENDING_SOURCES[k].permission))
      .map(async (k) => {
        const source = PENDING_SOURCES[k];
        const { count, error } = await supabase.from(source.table).select("*", { count: "exact", head: true }).eq(source.column, source.value);
        return error || count == null ? null : ([k, count] as const);
      })
  );
  return Object.fromEntries(entries.filter((e): e is readonly [PendingKey, number] => e !== null));
}
